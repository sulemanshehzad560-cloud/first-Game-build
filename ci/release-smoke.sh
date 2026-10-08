#!/usr/bin/env bash
# Smoke-test the release build: turn the AAB into a universal APK (signed with a throwaway key),
# install it, launch it, and make sure it stays up without crashing.
set -euo pipefail
PKG=com.jaderush.app
OUT=e2e-out
mkdir -p "$OUT"
keytool -genkeypair -keystore ci-test.jks -storepass android -keypass android -alias test -keyalg RSA -keysize 2048 -validity 1 -dname "CN=CI Test" >/dev/null 2>&1
java -jar bundletool.jar build-apks --bundle="$RELEASE_AAB" --output=release.apks --mode=universal \
  --ks=ci-test.jks --ks-pass=pass:android --ks-key-alias=test --key-pass=pass:android
java -jar bundletool.jar validate --bundle="$RELEASE_AAB" > "$OUT/bundletool-validate.txt" 2>&1 || true
unzip -o -q release.apks universal.apk
adb uninstall "$PKG" >/dev/null 2>&1 || true
adb install -r universal.apk
adb logcat -c
adb shell am start -W -n "$PKG/com.sulemanshehzad.jaderush.MainActivity"
sleep 20
adb exec-out screencap -p > "$OUT/10-release-home.png"
PID=$(adb shell pidof "$PKG" || true)
adb logcat -d > "$OUT/logcat-release.txt"
# Play services on the emulator sometimes restarts right after an install; Android then kills every app
# holding its font provider. That is the emulator, not the app: note it and launch once more.
if [ -z "$PID" ] && grep -qE "Killing [0-9]+:$PKG/.*dying proc com\.google\.android\.gms" "$OUT/logcat-release.txt"; then
  echo "NOTE Play services restarted and took the app down with it; relaunching once" | tee -a "$OUT/report.txt"
  adb logcat -c
  adb shell am start -W -n "$PKG/com.sulemanshehzad.jaderush.MainActivity"
  sleep 20
  adb exec-out screencap -p > "$OUT/10-release-home.png"
  PID=$(adb shell pidof "$PKG" || true)
  adb logcat -d >> "$OUT/logcat-release.txt"
fi
if [ -z "$PID" ]; then echo "FAIL release app is not running" | tee -a "$OUT/report.txt"; exit 1; fi
if grep -E "FATAL EXCEPTION|ANR in $PKG" "$OUT/logcat-release.txt"; then echo "FAIL release build crashed" | tee -a "$OUT/report.txt"; exit 1; fi
echo "PASS release build (from AAB) installs, launches and stays up (pid $PID)" | tee -a "$OUT/report.txt"
