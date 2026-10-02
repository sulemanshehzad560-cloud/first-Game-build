#!/usr/bin/env bash
# iOS simulator test: install the debug build, launch it with -JadeSelfTest, follow the in-app
# self-test through the app's stdout, screenshot each checkpoint, and fail on any FAIL or crash.
set -uo pipefail
BUNDLE=com.sulemanshehzad.jaderush
OUT="$PWD/ios-out"   # absolute: simctl hands --stdout/--stderr paths to launchd inside the simulator
mkdir -p "$OUT"
APP=$(find build/ios/Build/Products -maxdepth 2 -name "App.app" -path "*iphonesimulator*" | head -1)
[ -n "$APP" ] || { echo "FAIL simulator app not built" | tee -a "$OUT/report.txt"; exit 1; }

DEVICE=$(xcrun simctl list devices available -j | python3 -c "
import json, sys, re
d = json.load(sys.stdin)['devices']
phones = [(rt, x) for rt, lst in d.items() if 'iOS' in rt for x in lst if x['name'].startswith('iPhone')]
ver = lambda rt: [int(n) for n in re.findall(r'\d+', rt)]
phones.sort(key=lambda p: (ver(p[0]), p[1]['name']))
print(phones[-1][1]['udid'] + ' ' + phones[-1][1]['name'] + ' ' + phones[-1][0].split('.')[-1])
")
UDID=${DEVICE%% *}
echo "Simulator: $DEVICE" | tee -a "$OUT/report.txt"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b > /dev/null
# Give the device a real UI session; headless SpringBoard can refuse app launches.
open -a Simulator --args -CurrentDeviceUDID "$UDID" 2>/dev/null || true
# The simulator only launches signed apps; make sure every bundle carries an ad-hoc signature.
codesign --verify "$APP" 2>/dev/null || {
  find "$APP/Frameworks" -maxdepth 1 \( -name "*.framework" -o -name "*.dylib" \) -exec codesign --force --sign - {} \; 2>/dev/null
  codesign --force --sign - "$APP"
}
codesign -dv "$APP" 2>&1 | grep -E "Signature|Identifier" | head -2
xcrun simctl install "$UDID" "$APP"
sleep 10   # let SpringBoard finish starting after boot
launched=0
for attempt in 1 2 3; do
  if xcrun simctl launch --terminate-running-process --stdout="$OUT/stdout.txt" --stderr="$OUT/stderr.txt" "$UDID" "$BUNDLE" -JadeSelfTest; then launched=1; break; fi
  echo "launch attempt $attempt failed, retrying"; sleep 10
done
if [ "$launched" != 1 ]; then
  echo "FAIL the simulator refused to launch the app" | tee -a "$OUT/report.txt"
  xcrun simctl io "$UDID" screenshot "$OUT/ios-launch-failed.png" >/dev/null 2>&1
  # Collect the reason SpringBoard gave and any crash reports for the next diagnosis.
  xcrun simctl spawn "$UDID" log show --last 6m --style compact \
    --predicate 'process == "SpringBoard" OR process == "runningboardd" OR process == "App" OR eventMessage CONTAINS[c] "jaderush"' \
    > "$OUT/launch-log.txt" 2>&1 || true
  grep -iE "jaderush|denied|termin|crash|launch|sign|exit" "$OUT/launch-log.txt" | tail -60
  find ~/Library/Logs/DiagnosticReports -newer "$APP" -type f 2>/dev/null | while read -r f; do cp "$f" "$OUT/"; echo "crash report: $f"; head -60 "$f"; done
  exit 1
fi

shots=0
# Time-based budget: screenshots on the hosted simulator can take many seconds each.
START=$SECONDS
for i in $(seq 1 900); do
  [ $((SECONDS - START)) -ge 600 ] && break
  sleep 1
  for name in $(grep -o 'SELFTEST SHOT [a-z]*' "$OUT/stdout.txt" 2>/dev/null | awk '{print $3}'); do
    [ -f "$OUT/ios-$name.png" ] || { xcrun simctl io "$UDID" screenshot "$OUT/ios-$name.png" > /dev/null 2>&1; shots=$((shots+1)); }
  done
  [ "$i" = 6 ] && xcrun simctl io "$UDID" screenshot "$OUT/ios-home.png" > /dev/null 2>&1
  grep -q 'SELFTEST DONE' "$OUT/stdout.txt" 2>/dev/null && break
done

grep -o 'SELFTEST \(PASS\|FAIL\|DONE\).*' "$OUT/stdout.txt" | sed 's/^SELFTEST //' | tee -a "$OUT/report.txt"
# UMP reports these until a GDPR message is published in AdMob (Privacy & messaging); not an app error.
UMP='Publisher misconfiguration|Request consent info failed'
grep -qiE "$UMP" "$OUT/stdout.txt" && echo "NOTE AdMob consent message not set up in the AdMob account yet (Privacy & messaging)" | tee -a "$OUT/report.txt"
grep -i '\[error\]' "$OUT/stdout.txt" | grep -viE "$UMP" | head -20 > "$OUT/js-errors.txt" || true
xcrun simctl spawn "$UDID" log show --last 5m --style compact --predicate 'process == "App"' > "$OUT/system-log.txt" 2>/dev/null || true
CRASHES=$(ls ~/Library/Logs/DiagnosticReports 2>/dev/null | grep -i '^App[-_.]' || true)

status=0
grep -q 'SELFTEST DONE' "$OUT/stdout.txt" || { echo "FAIL self-test did not finish (see stdout.txt)" | tee -a "$OUT/report.txt"; status=1; }
grep -q 'SELFTEST FAIL' "$OUT/stdout.txt" && status=1
[ -s "$OUT/js-errors.txt" ] && { echo "FAIL JavaScript errors: $(head -3 "$OUT/js-errors.txt" | tr '\n' ' ')" | tee -a "$OUT/report.txt"; status=1; }
[ -n "$CRASHES" ] && { echo "FAIL crash reports: $CRASHES" | tee -a "$OUT/report.txt"; status=1; }
[ "$status" = 0 ] && echo "PASS iOS simulator self-test, no crashes, no JS errors ($shots checkpoint screenshots)" | tee -a "$OUT/report.txt"
exit $status
