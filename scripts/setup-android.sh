#!/usr/bin/env bash
set -euo pipefail
export ANDROID_HOME="${ANDROID_HOME:-$HOME/.local/share/sunset-kart/android-sdk}"
export JAVA_HOME="${JAVA_HOME:-$(mise where java@temurin-21)}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  temp="$(mktemp -d)"
  trap 'rm -rf "$temp"' EXIT
  curl --fail --location --retry 3 \
    https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip \
    --output "$temp/tools.zip"
  unzip -q "$temp/tools.zip" -d "$temp"
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv "$temp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi

# sdkmanager closes stdin early once all licenses have been accepted.
set +o pipefail
yes | sdkmanager --sdk_root="$ANDROID_HOME" --licenses >/dev/null
result=${PIPESTATUS[1]}
set -o pipefail
[[ "$result" == 0 ]]
sdkmanager --sdk_root="$ANDROID_HOME" 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0'
