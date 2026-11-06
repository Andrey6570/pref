#!/usr/bin/env bash
# Локальная сборка release APK без EAS. Нужны JDK 17+ и Android SDK (ANDROID_HOME).
# APK подписан debug-ключом: годится для установки на свой телефон, не для Google Play.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_HOME:?Укажи ANDROID_HOME (путь к Android SDK)}"
ABIS="${ABIS:-arm64-v8a,armeabi-v7a}"

cd "$ROOT/apps/mobile"
# android/ генерируется из app.json и не хранится в git
CI=1 npx expo prebuild --platform android --no-install
git -C "$ROOT" checkout -- apps/mobile/package.json 2>/dev/null || true  # prebuild переписывает scripts
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

cd android
NODE_ENV=production ./gradlew assembleRelease -PreactNativeArchitectures="$ABIS"

VERSION="$(node -p "require('$ROOT/apps/mobile/app.json').expo.version")"
mkdir -p "$ROOT/dist"
cp app/build/outputs/apk/release/app-release.apk "$ROOT/dist/preferans-$VERSION.apk"
echo "Готово: dist/preferans-$VERSION.apk"
