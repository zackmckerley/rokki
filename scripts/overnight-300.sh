#!/usr/bin/env bash
# 300-assertion overnight live matrix across BOTH environments
# (sandbox + production). Extends scripts/smoke-100.sh with the
# dimensions behind Zack's reported pain on his work computer:
#
#   * "doesn't load"   → hung/timed-out requests, 404'd JS/CSS chunks
#                        that break hydration, render-blocking 3rd-party
#                        scripts that stall on a corporate firewall.
#   * "stale / not the most recent info" → HTML must not be cached;
#                        /api must be no-store; SW version lockstep;
#                        hashed static must be immutable (so a deploy is
#                        picked up instantly, not served from a stale
#                        shell).
#   * "really slow"    → TTFB + total-load timing budget per route,
#                        with the actual milliseconds logged.
#
# Usage:  bash scripts/overnight-300.sh [sandbox|prod|both]
# Exit 0 if all pass, 1 if any fail. Failures are also written to
# scripts/.overnight-failures.log for the morning triage.

set -uo pipefail

ONLY="${1:-both}"

PASS=0
FAIL=0
declare -a FAILURES=()

# Timing budgets (ms). Generous on total to avoid false-failing on
# network jitter — the goal is catching true hangs ("doesn't load"),
# not micro-optimising. TTFB budget catches a slow origin/cold start.
TTFB_BUDGET_MS=3500
TOTAL_BUDGET_MS=8000

# --- helpers -------------------------------------------------------------

pass() { PASS=$((PASS + 1)); }
fail() { FAIL=$((FAIL + 1)); FAILURES+=("$1"); }

check_status() {
  local label="$1"; local url="$2"; shift 2
  local code
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 25 "$url" 2>/dev/null || echo "000")
  for exp in "$@"; do [ "$code" = "$exp" ] && { pass; return; }; done
  fail "$label — got $code, expected [$*] — $url"
}

check_redirects_login() {
  local label="$1"; local url="$2"
  local code loc
  read -r code loc < <(curl -sS -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 25 "$url" 2>/dev/null || echo "000 -")
  if { [ "$code" = "307" ] || [ "$code" = "302" ] || [ "$code" = "308" ]; } && echo "$loc" | grep -q "/login"; then
    pass
  else
    fail "$label — got $code → '$loc', expected 3xx → /login — $url"
  fi
}

check_header_present() {
  local label="$1"; local url="$2"; local hdr="$3"
  if curl -sS -I --max-time 25 "$url" 2>/dev/null | grep -qi "^$hdr:"; then pass
  else fail "$label — missing header '$hdr' — $url"; fi
}

check_header_contains() {
  local label="$1"; local url="$2"; local hdr="$3"; local substr="$4"
  local val
  val=$(curl -sS -I --max-time 25 "$url" 2>/dev/null | grep -i "^$hdr:" | tr -d '\r')
  if echo "$val" | grep -qi "$substr"; then pass
  else fail "$label — header '$hdr' lacks '$substr' (got: ${val:-none}) — $url"; fi
}

check_body_contains() {
  local label="$1"; local url="$2"; local substr="$3"
  local body attempt
  for attempt in 1 2 3; do
    body=$(curl -sS --max-time 25 "$url" 2>/dev/null)
    [[ "$body" == *"$substr"* ]] && { pass; return; }
    sleep 1
  done
  fail "$label — body missing '$substr' (3 tries) — $url"
}

# check_body_lacks URL SUBSTR — passes if the body does NOT contain SUBSTR.
check_body_lacks() {
  local label="$1"; local url="$2"; local substr="$3"
  local body
  body=$(curl -sS --max-time 25 "$url" 2>/dev/null)
  if [[ "$body" == *"$substr"* ]]; then
    fail "$label — body unexpectedly contains '$substr' — $url"
  else pass; fi
}

# check_ttfb / check_total — timing budgets, with the measured ms logged.
check_timing() {
  local label="$1"; local url="$2"
  local out ttfb total ttfb_ms total_ms
  out=$(curl -sS -o /dev/null -w "%{time_starttransfer} %{time_total}" --max-time 25 "$url" 2>/dev/null || echo "99 99")
  ttfb=$(echo "$out" | awk '{print $1}')
  total=$(echo "$out" | awk '{print $2}')
  ttfb_ms=$(awk "BEGIN{printf \"%d\", $ttfb*1000}")
  total_ms=$(awk "BEGIN{printf \"%d\", $total*1000}")
  echo "    ⏱  $label — ttfb ${ttfb_ms}ms · total ${total_ms}ms"
  if [ "$ttfb_ms" -le "$TTFB_BUDGET_MS" ]; then pass
  else fail "$label TTFB — ${ttfb_ms}ms > ${TTFB_BUDGET_MS}ms — $url"; fi
  if [ "$total_ms" -le "$TOTAL_BUDGET_MS" ]; then pass
  else fail "$label TOTAL — ${total_ms}ms > ${TOTAL_BUDGET_MS}ms — $url"; fi
}

# check_chunk_chain — fetch a page, extract its referenced /_next/static
# assets, and assert each one returns 200. A 404'd chunk is exactly the
# "page doesn't load / blank" symptom: the HTML arrives but the JS it
# points at is missing, so hydration never completes.
check_chunk_chain() {
  local env="$1"; local base="$2"; local path="$3"
  local html chunks n url code
  html=$(curl -sS --max-time 25 "$base$path" 2>/dev/null)
  # Pull up to 12 distinct /_next/static/... URLs referenced in the HTML.
  chunks=$(echo "$html" | grep -oE '/_next/static/[a-zA-Z0-9._/-]+\.(js|css)' | sort -u | head -12)
  if [ -z "$chunks" ]; then
    fail "[$env] chunk-chain $path — no /_next/static assets found in HTML"
    return
  fi
  n=0
  while IFS= read -r chunk; do
    [ -z "$chunk" ] && continue
    url="$base$chunk"
    code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 25 "$url" 2>/dev/null || echo "000")
    if [ "$code" = "200" ]; then pass
    else fail "[$env] chunk 404 — $code — $url"; fi
    n=$((n + 1))
  done <<< "$chunks"
  echo "    🔗 [$env] $path — verified $n static chunks"
}

# check_no_blocking_third_party — fetch the <head> and flag any
# <script src="https://<other-origin>"> that is NOT async/defer/module.
# Such a script blocks the parser; if the origin is blackholed by a
# corporate proxy, the page hangs ("doesn't load on my work computer").
check_no_blocking_third_party() {
  local env="$1"; local base="$2"; local path="$3"
  local html offenders
  html=$(curl -sS --max-time 25 "$base$path" 2>/dev/null)
  # Blocking = a <script with an absolute http(s) src and no async/defer/type=module.
  offenders=$(echo "$html" \
    | grep -oE '<script[^>]*src="https?://[^"]+"[^>]*>' \
    | grep -viE 'async|defer|type="module"' \
    | grep -viE "src=\"https?://${base#https://}" || true)
  if [ -z "$offenders" ]; then pass
  else
    fail "[$env] blocking 3rd-party <script> on $path: $(echo "$offenders" | head -1)"
  fi
}

# --- the matrix ----------------------------------------------------------

run_suite() {
  local env="$1"; local base="$2"
  echo ""
  echo "──────── $env ($base) ────────"

  # ===== A. Login + public surface loads (the "doesn't load" guard) =====
  check_status            "[$env] login 200"               "$base/login" 200
  check_header_contains   "[$env] login html"             "$base/login" "content-type" "text/html"
  check_body_contains     "[$env] login has <video>"      "$base/login" "<video"
  check_body_contains     "[$env] login nebula video"     "$base/login" "space-nebula.mp4"
  check_body_contains     "[$env] login has form/button"  "$base/login" "<button"
  check_status            "[$env] login w/ redirect param" "$base/login?redirect_to=%2Fcalendar" 200
  check_status            "[$env] offline page 200"        "$base/offline" 200
  check_status            "[$env] help public"            "$base/help" 200 307
  check_status            "[$env] privacy public"         "$base/privacy" 200 307
  check_status            "[$env] terms public"           "$base/terms" 200 307

  # ===== B. Protected routes auth-gate to /login (no silent blank) =====
  for r in / /calendar /tasks/mine /tasks/delegated /settings /settings/account \
           /settings/notifications /settings/integrations /notifications /messages \
           /tools /approvals /admin /search /goals; do
    check_redirects_login "[$env] $r gated" "$base$r"
  done

  # ===== C. API error semantics — unauth must be 401/404 JSON, never 5xx =====
  for a in me notifications briefing search tools spaces calendar/connections \
           tasks/mine activity messages; do
    check_status "[$env] api/$a not-5xx" "$base/api/v1/$a" 401 404 405
  done
  check_status            "[$env] api/health 200"         "$base/api/v1/health" 200
  check_header_contains   "[$env] api/health json"        "$base/api/v1/health" "content-type" "json"
  check_status            "[$env] api projects/zzz 401/404" "$base/api/v1/projects/zzznotreal" 401 404
  check_status            "[$env] api tasks by-seq 401/404"  "$base/api/v1/tasks/by-seq/zzz/1" 401 404
  check_status            "[$env] api projects tasks 401/404" "$base/api/v1/projects/zzz/tasks" 401 404
  check_status            "[$env] api projects members 401/404" "$base/api/v1/projects/zzz/members" 401 404

  # ===== D. Staleness guards (the "not the most recent info" pain) =====
  # HTML pages must NOT be cached by shared caches (else a corporate
  # proxy serves yesterday's shell).
  check_header_contains   "[$env] login no shared cache"  "$base/login" "cache-control" "no-store\|no-cache\|private\|max-age=0"
  # /api responses are no-store (the cross-device staleness fix).
  check_header_contains   "[$env] api/me no-store"        "$base/api/v1/me" "cache-control" "no-store"
  check_header_contains   "[$env] api/health no-store"    "$base/api/v1/health" "cache-control" "no-store"
  check_header_contains   "[$env] api/notifications no-store" "$base/api/v1/notifications" "cache-control" "no-store"
  # Service worker must be revalidated every load (so a new version is
  # picked up) AND must be the version the page expects.
  check_status            "[$env] sw.js 200"              "$base/sw.js" 200
  check_body_contains     "[$env] sw.js is v6"            "$base/sw.js" 'CACHE_VERSION = "v6"'
  check_header_contains   "[$env] sw.js not long-cached"  "$base/sw.js" "cache-control" "no-cache\|no-store\|max-age=0\|must-revalidate"
  check_body_contains     "[$env] sw network-first api"   "$base/sw.js" "networkFirstApi"
  check_body_contains     "[$env] sw network-only page"   "$base/sw.js" "networkOnlyPage"
  check_body_contains     "[$env] sw bypasses RSC"        "$base/sw.js" "text/x-component"
  check_status            "[$env] manifest 200"           "$base/manifest.webmanifest" 200

  # ===== E. Hashed static is immutable (deploy picked up instantly) =====
  # Pull one real chunk from the login HTML and assert it is immutable.
  local one_chunk
  one_chunk=$(curl -sS --max-time 25 "$base/login" 2>/dev/null \
    | grep -oE '/_next/static/[a-zA-Z0-9._/-]+\.js' | head -1)
  if [ -n "$one_chunk" ]; then
    check_header_contains "[$env] static immutable"       "$base$one_chunk" "cache-control" "immutable\|max-age=31536000"
    check_status          "[$env] static chunk 200"       "$base$one_chunk" 200
  else
    fail "[$env] could not find a /_next/static chunk on /login"
    fail "[$env] (skipped immutable check — no chunk)"
  fi

  # ===== F. Full chunk chains load (broken bundle = blank page) =====
  check_chunk_chain "$env" "$base" "/login"
  check_chunk_chain "$env" "$base" "/offline"

  # ===== G. No render-blocking third-party scripts (corp-firewall hang) =====
  check_no_blocking_third_party "$env" "$base" "/login"
  check_no_blocking_third_party "$env" "$base" "/offline"

  # ===== H. Security headers (defence-in-depth, all on the public page) =====
  check_header_present    "[$env] X-Content-Type-Options" "$base/login" "x-content-type-options"
  check_header_present    "[$env] CSP present"            "$base/login" "content-security-policy"
  check_header_present    "[$env] Referrer-Policy"        "$base/login" "referrer-policy"
  check_header_present    "[$env] Strict-Transport-Sec"   "$base/login" "strict-transport-security"

  # ===== I. Auth-initiation routes exist (you must be able to sign in) =====
  check_status            "[$env] password-login route"   "$base/api/v1/auth/password-login" 405 400 401 200
  check_status            "[$env] auth callback route"    "$base/auth/callback" 307 400 302 200
  check_status            "[$env] magic-link route"       "$base/api/v1/auth/magic-link" 405 400 401 200 404

  # ===== J. Error handling — nonsense paths are 404, never 5xx =====
  check_status            "[$env] 404 handling"           "$base/this-route-does-not-exist-xyz" 404 307
  check_status            "[$env] api 404 handling"       "$base/api/v1/this-is-not-real" 401 404

  # ===== K. More protected-route gates (every primary surface) =====
  for r in /p/zzznotreal /tasks /goals /people /activity /inbox /reports \
           /files /settings/security /settings/profile /settings/appearance \
           /space/zzznotreal /calendar/week /tools/installed; do
    check_redirects_login "[$env] $r gated" "$base$r"
  done

  # ===== L. More API surface — unauth must be 401/404, never 5xx =====
  for a in "search?q=test" briefing activity goals people files reminders \
           "calendar/events" tools/installed approvals notifications/unread; do
    check_status "[$env] api/$a not-5xx" "$base/api/v1/$a" 401 404 405 400
  done
  # …and these must carry no-store too (freshness).
  for a in search briefing activity goals; do
    check_header_contains "[$env] api/$a no-store" "$base/api/v1/$a" "cache-control" "no-store"
  done

  # ===== M. PWA / crawler / social assets resolve =====
  check_header_contains   "[$env] manifest json"          "$base/manifest.webmanifest" "content-type" "json\|manifest"
  check_body_contains     "[$env] manifest has name"      "$base/manifest.webmanifest" "Rokki"
  check_status            "[$env] opengraph-image"        "$base/opengraph-image" 200
  check_status            "[$env] twitter-image"          "$base/twitter-image" 200
  check_status            "[$env] icon-192"               "$base/icon-192.png" 200 404
  check_status            "[$env] robots"                 "$base/robots.txt" 200 404
  check_status            "[$env] favicon"                "$base/favicon.ico" 200 404

  # ===== N. HTTP method robustness — HEAD must not 5xx =====
  for path in /login /offline /sw.js /manifest.webmanifest; do
    code=$(curl -sS -o /dev/null -w "%{http_code}" -I --max-time 25 "$base$path" 2>/dev/null || echo 000)
    if [ "$code" != "500" ] && [ "$code" != "000" ]; then pass
    else fail "[$env] HEAD $path → $code"; fi
  done

  # ===== O. No secret leakage in the public HTML/JS =====
  check_body_lacks        "[$env] login no service_role" "$base/login" "service_role"
  check_body_lacks        "[$env] login no SR key env"   "$base/login" "SUPABASE_SERVICE_ROLE"
  check_body_lacks        "[$env] login no private key"  "$base/login" "BEGIN RSA PRIVATE"
  check_body_lacks        "[$env] login no AWS secret"   "$base/login" "AKIA"

  # ===== P. Security-header values (not just presence) =====
  check_header_contains   "[$env] nosniff value"          "$base/login" "x-content-type-options" "nosniff"
  check_header_contains   "[$env] CSP has default/script" "$base/login" "content-security-policy" "default-src\|script-src"
  check_header_contains   "[$env] HSTS max-age"           "$base/login" "strict-transport-security" "max-age"

  # ===== Q. Performance budgets (the "really slow" pain) =====
  check_timing            "[$env] /login"                 "$base/login"
  check_timing            "[$env] /offline"               "$base/offline"
  check_timing            "[$env] /api/v1/health"         "$base/api/v1/health"
  check_timing            "[$env] / (redirect)"           "$base/"
  check_timing            "[$env] sw.js"                  "$base/sw.js"
  check_timing            "[$env] manifest"               "$base/manifest.webmanifest"
  check_timing            "[$env] login?redirect"         "$base/login?redirect_to=%2Ftasks%2Fmine"
}

echo "================================================================"
echo " Rokki overnight-300 — live matrix ($(date))"
echo " TTFB budget ${TTFB_BUDGET_MS}ms · total budget ${TOTAL_BUDGET_MS}ms"
echo "================================================================"

if [ "$ONLY" = "sandbox" ] || [ "$ONLY" = "both" ]; then
  run_suite "SANDBOX" "https://sandbox.rokki.ai"
fi
if [ "$ONLY" = "prod" ] || [ "$ONLY" = "both" ]; then
  run_suite "PROD" "https://rokki.ai"
fi

echo ""
echo "================================================================"
echo "RESULTS:  $PASS passed   $FAIL failed   (total $((PASS + FAIL)))"
echo "================================================================"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "FAILURES:"
  : > scripts/.overnight-failures.log
  for f in "${FAILURES[@]}"; do
    echo "  ✗ $f"
    echo "$f" >> scripts/.overnight-failures.log
  done
  exit 1
fi
echo "✓ ALL GREEN"
exit 0
