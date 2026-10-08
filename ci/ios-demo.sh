#!/usr/bin/env bash
# Screen-records the app touring itself on the newest iPhone simulator (launch argument -JadeDemo,
# debug builds only): a full level, a duel, the level map, daily board, tile sets, online lobby and
# settings, ending on Apple's tracking prompt. Output: demo-out/jade-rush-demo.mp4
set -uo pipefail
BUNDLE=com.jaderush.app
OUT="$PWD/demo-out"
mkdir -p "$OUT"
APP=$(find build/ios/Build/Products -maxdepth 2 -name "App.app" -path "*iphonesimulator*" | head -1)
[ -n "$APP" ] || { echo "simulator app not built"; exit 1; }
DEVICE=$(xcrun simctl list devices available -j | python3 -c "
import json, sys, re
d = json.load(sys.stdin)['devices']
phones = [(rt, x) for rt, lst in d.items() if 'iOS' in rt for x in lst if x['name'].startswith('iPhone') and 'Pro Max' in x['name']]
phones = phones or [(rt, x) for rt, lst in d.items() if 'iOS' in rt for x in lst if x['name'].startswith('iPhone')]
ver = lambda rt: [int(n) for n in re.findall(r'\d+', rt)]
phones.sort(key=lambda p: (ver(p[0]), p[1]['name']))
print(phones[-1][1]['udid'] + ' ' + phones[-1][1]['name'] + ' ' + phones[-1][0].split('.')[-1])
")
UDID=${DEVICE%% *}
echo "Simulator: $DEVICE"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b > /dev/null
open -a Simulator --args -CurrentDeviceUDID "$UDID" 2>/dev/null || true
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3 2>/dev/null || true
codesign --verify "$APP" 2>/dev/null || {
  find "$APP/Frameworks" -maxdepth 1 \( -name "*.framework" -o -name "*.dylib" \) -exec codesign --force --sign - {} \; 2>/dev/null
  codesign --force --sign - "$APP"
}
xcrun simctl install "$UDID" "$APP"
sleep 10
xcrun simctl io "$UDID" recordVideo --codec=h264 --force "$OUT/raw.mp4" > "$OUT/record.log" 2>&1 &
REC=$!
sleep 3
for attempt in 1 2 3; do
  SIMCTL_CHILD_NSUnbufferedIO=YES xcrun simctl launch --terminate-running-process --stdout="$OUT/stdout.txt" --stderr="$OUT/stderr.txt" "$UDID" "$BUNDLE" -JadeDemo && break
  sleep 10
done
START=$SECONDS
until grep -q 'SELFTEST DONE' "$OUT/stdout.txt" 2>/dev/null || [ $((SECONDS - START)) -ge 900 ]; do sleep 2; done
grep 'SELFTEST' "$OUT/stdout.txt" || true
kill -INT "$REC"; wait "$REC" 2>/dev/null || true
ls -la "$OUT"
# Smaller, widely playable copy (H.264, 1080 px wide) for App Review.
if command -v ffmpeg >/dev/null; then
  ffmpeg -y -loglevel error -i "$OUT/raw.mp4" -vf "scale=1080:-2" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart "$OUT/jade-rush-demo.mp4"
else
  cp "$OUT/raw.mp4" "$OUT/jade-rush-demo.mp4"
fi
rm -f "$OUT/raw.mp4"
ls -la "$OUT"
grep -q 'SELFTEST DONE demo$' "$OUT/stdout.txt"
