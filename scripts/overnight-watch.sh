#!/usr/bin/env bash
# Overnight watchdog: re-runs the 300-assertion live matrix on an
# interval through the night and appends a timestamped one-line verdict
# (plus any failures) to scripts/.overnight-runs.log. Lets us catch an
# intermittent 5xx, a bad redeploy, or a flaky origin overnight rather
# than only at a single point in time.
#
# Usage: ITERS=18 INTERVAL=1800 bash scripts/overnight-watch.sh
#        (defaults: 18 runs, 30 min apart ≈ 9 hours)

set -uo pipefail

ITERS="${ITERS:-18}"
INTERVAL="${INTERVAL:-1800}"
LOG="scripts/.overnight-runs.log"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "[$(date)] overnight-watch starting — $ITERS runs every ${INTERVAL}s" >> "$LOG"

for i in $(seq 1 "$ITERS"); do
  out=$(bash "$HERE/scripts/overnight-300.sh" both 2>&1)
  rc=$?
  line=$(echo "$out" | grep -E "^RESULTS:" | tr -s ' ')
  if [ "$rc" -eq 0 ]; then
    echo "[$(date)] run $i/$ITERS  OK   — $line" >> "$LOG"
  else
    echo "[$(date)] run $i/$ITERS  FAIL — $line" >> "$LOG"
    echo "$out" | grep -E "^  ✗" >> "$LOG"
  fi
  [ "$i" -lt "$ITERS" ] && sleep "$INTERVAL"
done

echo "[$(date)] overnight-watch finished $ITERS runs" >> "$LOG"
