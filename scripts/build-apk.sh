#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/share/sunset-kart/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-$(mise where java@temurin-21)}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

# Do not embed the previous APK in the next web bundle.
rm -rf public/downloads
npm run build
npx cap sync android
(cd android && ./gradlew --no-daemon --max-workers=2 assembleDebug)
mkdir -p public/downloads
cp android/app/build/outputs/apk/debug/app-debug.apk public/downloads/sunset-kart.apk
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify public/downloads/sunset-kart.apk
(cd public/downloads && sha256sum sunset-kart.apk > SHA256SUMS.txt)
printf 'APK: public/downloads/sunset-kart.apk\n'
