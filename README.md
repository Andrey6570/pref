# Преферанс (Сочинка): мобильная игра для iOS и Android

Монорепозиторий: один движок правил на TypeScript + одно мобильное приложение на React Native (Expo). Одна кодовая база даёт обе платформы.

```
packages/engine   движок правил, боты, симуляция (чистый TS, без UI; тесты на vitest)
apps/mobile       приложение Expo / React Native (экран стола, торговля, снос, вист, розыгрыш)
docs/SPEC.md      что реализовано, какие правила подтверждены, какие приняты допущением
```

## Команды

```bash
npm install
npm test                          # тесты движка
npm run sim                       # симуляция бот-против-бота; BULLETS=300 npm run sim
npm run typecheck                 # типы движка и приложения
npm run start -w @pref/mobile     # запуск на телефоне через Expo Go (QR-код)
```

## Сборка под iOS и Android

Сборки идут в облаке EAS, Mac не нужен.

```bash
npm i -g eas-cli
cd apps/mobile
eas login
eas build:configure
eas build -p android --profile preview      # APK для установки на телефон
eas build -p android --profile production   # AAB для Google Play
eas build -p ios --profile production       # IPA для App Store
```

### Локальная сборка APK без EAS

Нужны JDK 17+ и Android SDK (platform 37, build-tools 37.0.0, NDK 27.1.12297006, cmake 3.22.1).

```bash
ANDROID_HOME=/путь/к/sdk ./scripts/build-apk.sh   # → dist/preferans-<версия>.apk
```

APK подписан debug-ключом: подходит для установки на свой телефон, но не для Google Play.

Перед публикацией:
1. В `apps/mobile/app.json` заменить `com.example.preferans` (`ios.bundleIdentifier` и `android.package`) на свой идентификатор.
2. Заменить иконки в `apps/mobile/assets`.
3. Для iOS нужна платная учётная запись Apple Developer, для Google Play — аккаунт разработчика.
4. Закрыть допущения из `docs/SPEC.md`: правила подсчёта нужно сверить до релиза.

## Состояние проекта

- Движок и бот v1: 25 тестов проходят; сотни партий бот против бота доигрываются без нарушений правил, итог всегда сходится в ноль.
- Приложение: проверка типов проходит, пакеты для Android и iOS собираются (`expo export`). На эмуляторе и реальном телефоне интерфейс ещё не запускался.
- Бот v1 (замеры `npm run sim`): параметры подобраны перегоном партий, новые параметры обыгрывают первую версию бота (+233 ± 19 за партию на 300 партиях), но это сравнение со заведомо слабым соперником. Недостатки: слишком осторожен (около 63% раздач заканчиваются распасами, мизер почти не заявляет), не использует информацию из торговли и не рассуждает о скрытых картах. План усиления: `docs/SPEC.md`, раздел 5.

## Движок как отдельная библиотека

Движок не знает про интерфейс. Основной интерфейс:

```ts
import { newGame, apply, actingSeat, viewFor, heuristicBot, SOCHI } from '@pref/engine';

let game = newGame(SOCHI, seed);
const seat = actingSeat(game);                 // кто должен ходить
const action = heuristicBot()(viewFor(game, seat)); // бот видит только то, что видит игрок
game = apply(game, action);                    // новое состояние, исходное не меняется
```

Состояние игры — чистый JSON: его можно сохранять, воспроизводить и пересылать по сети (задел под онлайн).
