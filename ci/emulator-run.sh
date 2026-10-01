#!/usr/bin/env bash
# Runs both emulator suites and reports both, even if the first one fails.
set -u
status=0
export DEBUG_APK=$(ls dist/*-debug.apk)
export RELEASE_AAB=$(ls dist/*.aab)
node ci/android-e2e.mjs || status=1
bash ci/release-smoke.sh || status=1
exit $status
