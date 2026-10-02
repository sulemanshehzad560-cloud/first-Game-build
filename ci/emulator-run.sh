#!/usr/bin/env bash
# Runs both emulator suites and reports both, even if the first one fails.
set -u
status=0
export DEBUG_APK=$(ls dist/*-debug.apk)
export RELEASE_AAB=$(ls dist/*.aab)
# Hard cap so a stall can never eat the job's whole time budget.
timeout 1200 node ci/android-e2e.mjs || { echo "e2e exited with $?"; status=1; }
timeout 600 bash ci/release-smoke.sh || status=1
exit $status
