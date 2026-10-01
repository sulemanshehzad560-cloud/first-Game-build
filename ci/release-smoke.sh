#!/usr/bin/env bash
# Smoke-test the release build: turn the AAB into a universal APK (signed with a throwaway key),
# install it, launch it, and make sure it stays up without crashing.
set -euo pipefail
PKG=com.sulemanshehzad.jaderush
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
adb shell am start -W -n "$PKG/.MainActivity"
sleep 20
adb exec-out screencap -p > "$OUT/10-release-home.png"
PID=$(adb shell pidof "$PKG" || true)
adb logcat -d > "$OUT/logcat-release.txt"
if [ -z "$PID" ]; then echo "FAIL release app is not running" | tee -a "$OUT/report.txt"; exit 1; fi
if grep -E "FATAL EXCEPTION|ANR in $PKG" "$OUT/logcat-release.txt"; then echo "FAIL release build crashed" | tee -a "$OUT/report.txt"; exit 1; fi
echo "PASS release build (from AAB) installs, launches and stays up (pid $PID)" | tee -a "$OUT/report.txt"
