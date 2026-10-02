#!/usr/bin/env bash
# Runs both emulator suites and reports both, even if the first one fails.
set -u
status=0
export DEBUG_APK=$(ls dist/*-debug.apk)
export RELEASE_AAB=$(ls dist/*.aab)
mkdir -p e2e-out
# Stream the device log to disk for the whole run, so it survives even if the emulator dies.
adb logcat -v threadtime > e2e-out/logcat-stream.txt 2>&1 &
LOGCAT_PID=$!
free -m > e2e-out/host-memory-before.txt
# Hard cap so a stall can never eat the job's whole time budget.
timeout 1200 node ci/android-e2e.mjs || { echo "e2e exited with $?"; status=1; }
timeout 600 bash ci/release-smoke.sh || status=1
kill $LOGCAT_PID 2>/dev/null || true
if [ "$status" != 0 ]; then
  # Evidence for an emulator that died: host memory, kernel messages (OOM killer), emulator crash data.
  free -m > e2e-out/host-memory-after.txt
  sudo dmesg 2>/dev/null | tail -80 > e2e-out/host-dmesg.txt || true
  cp -r /tmp/android-runner e2e-out/emulator-crash 2>/dev/null || true
  pgrep -a qemu > e2e-out/qemu-processes.txt 2>&1 || echo "qemu not running" > e2e-out/qemu-processes.txt
fi
exit $status
