#!/usr/bin/env bash
# Flake-hunt — run the web + sdk unit suites N times with shuffled file/test
# order, logging any failure with its seed for reproduction.
#
# Run on an OTHERWISE-IDLE machine: CPU contention from other heavy processes
# causes false timing flakes (the thing we're hunting for). Vitest's own
# config excludes tests/rls (no Docker needed); this only runs the unit suite.
#
#   RUNS=80 bash scripts/flake-hunt.sh
set -u
ROOT="C:/Users/zack mckerley/Claude/rokki"
RUNS="${RUNS:-60}"
LOG="$ROOT/flake-hunt.log"
: > "$LOG"
fails=0
for i in $(seq 1 "$RUNS"); do
  seed=$RANDOM
  webok=1
  sdkok=1
  (cd "$ROOT/apps/web" && pnpm exec vitest run --sequence.shuffle --sequence.seed="$seed" >"/tmp/fh_web_$i.log" 2>&1) || webok=0
  (cd "$ROOT/packages/sdk" && pnpm exec vitest run --sequence.shuffle --sequence.seed="$seed" >"/tmp/fh_sdk_$i.log" 2>&1) || sdkok=0
  if [ "$webok" -eq 0 ] || [ "$sdkok" -eq 0 ]; then
    fails=$((fails + 1))
    {
      echo "=== RUN $i FAILED (seed=$seed web_ok=$webok sdk_ok=$sdkok) ==="
      if [ "$webok" -eq 0 ]; then
        echo "--- web failures ---"
        grep -E "FAIL|AssertionError|Error:|✗|×" "/tmp/fh_web_$i.log" | head -40
      fi
      if [ "$sdkok" -eq 0 ]; then
        echo "--- sdk failures ---"
        grep -E "FAIL|AssertionError|Error:|✗|×" "/tmp/fh_sdk_$i.log" | head -40
      fi
      echo ""
    } >>"$LOG"
  fi
  echo "run $i/$RUNS done (cumulative fails=$fails)"
done
echo "=== FLAKE-HUNT COMPLETE: $fails/$RUNS runs had a failure (details in flake-hunt.log) ===" | tee -a "$LOG"
