# Android app (Capacitor wrapper)

Self-serving Android build of the train_ticket app. Wraps the existing
static FE in `www/` as a Capacitor WebView; calls `rail-api.rail.co.il`
directly from the device (no proxy needed).

For the architecture and per-fork notes, see [`LOCAL_DEV.md`](LOCAL_DEV.md).

## What this build avoids

The browser build needs a Cloudflare Worker proxy because (1) browsers
enforce CORS and (2) the proxy injects the `Ocp-Apim-Subscription-Key`
header. On Android, native HTTP doesn't have CORS, and the
subscription key (already public — extracted from rail.co.il's SPA
bundle) is hardcoded in `www/app.js` next to the URL. So the worker
is unused in native mode.

## One-time machine setup

This repo expects a JDK 17 and the Android SDK. On WSL2 with no
Android Studio, the easiest path is fully user-local under `~/.local/opt/`.

```bash
# 1. JDK 17 (Temurin)
mkdir -p ~/.local/opt && cd ~/.local/opt
curl -fSL -o /tmp/jdk-17.tar.gz https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_linux_hotspot_17.0.13_11.tar.gz
tar -xzf /tmp/jdk-17.tar.gz -C ~/.local/opt && rm /tmp/jdk-17.tar.gz
mv ~/.local/opt/jdk-17.0.13+11 ~/.local/opt/jdk-17

# 2. Android cmdline-tools
mkdir -p ~/.local/opt/android-sdk/cmdline-tools
curl -fSL -o /tmp/android-cli.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
python3 -m zipfile -e /tmp/android-cli.zip /tmp/android-cli-extracted/
mv /tmp/android-cli-extracted/cmdline-tools ~/.local/opt/android-sdk/cmdline-tools/latest
chmod +x ~/.local/opt/android-sdk/cmdline-tools/latest/bin/*
rm -rf /tmp/android-cli.zip /tmp/android-cli-extracted

# 3. Persistent env (sourced by every Capacitor / gradle invocation)
cat > ~/.local/opt/android-env.sh <<'EOF'
export JAVA_HOME="$HOME/.local/opt/jdk-17"
export ANDROID_HOME="$HOME/.local/opt/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
EOF

# 4. Accept licenses + install SDK packages
source ~/.local/opt/android-env.sh
yes | sdkmanager --licenses >/dev/null
sdkmanager --install "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

(Optional: `echo 'source ~/.local/opt/android-env.sh' >> ~/.bashrc` to
make it implicit in every new shell.)

## Build & install

```bash
source ~/.local/opt/android-env.sh

# Re-copy www/ into android/app/src/main/assets/public/ after every
# web edit (and also on first build).
npx cap sync android

# Build a debug APK (signed with the auto-generated debug key):
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Install over USB (`adb install -r app-debug.apk`) or transfer the
APK to the phone and tap to install (with "Install unknown apps"
enabled for the file manager).

## What goes native vs browser

`www/app.js` checks `Capacitor.isNativePlatform()` at startup:

| Build  | API base                                           | Headers added      | Cookie domain rewrite |
|--------|----------------------------------------------------|--------------------|------------------------|
| Browser | `https://rail-proxy.idshk-train-ticket-...workers.dev` | proxy adds them    | proxy strips `Domain=rail.co.il` |
| Native  | `https://rail-api.rail.co.il/common/api/v1`        | injected from JS   | not needed (same origin) |

The header set in native mode mirrors `cloudflare-worker/worker.js`'s
`buildUpstreamHeaders`. If APIM rejects a header set in the future,
update both in the same change.

## SMS auto-fill

When the OTP step is reached, the FE calls
`Capacitor.Plugins.SmsUserConsent.startListening({})`. Android's
SMS User Consent API shows a one-tap system dialog when an OTP SMS
arrives; on consent, the OTP digits are extracted by regex
(`\b\d{4,10}\b`) and filled into the input.

- No `RECEIVE_SMS` permission required (User Consent API mediates).
- 5-minute window. If the SMS doesn't arrive in time, manual entry
  still works.
- Plugin source: `android/app/src/main/java/com/yomach/trainticket/SmsUserConsentPlugin.java`.
- Registered in `MainActivity.java` via `registerPlugin(SmsUserConsentPlugin.class)`.

## When the API rotates again

In native mode the only proxy-equivalent state lives in `www/app.js`:

- `SUBSCRIPTION_KEY` constant — update if APIM rotates the key.
- `apiHeaders()` body — update if APIM starts requiring or rejecting
  a header (mirror with `cloudflare-worker/worker.js`).
- Endpoint paths and request bodies — `sendOtp` / `verifyOtp` / `orderSeat`.

Then `npx cap sync android && cd android && ./gradlew assembleDebug`
and reinstall.

## Out of scope (deliberate)

- iOS app (would need `npx cap add ios` + Xcode on Mac; not on WSL2).
- Play Store distribution. Sideload only.
- Auto-update / in-app update. Rebuild + reinstall.
- Migrating the browser FE off the proxy (browsers still need CORS bypass).
