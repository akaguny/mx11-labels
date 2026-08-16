# mx11-labels

Генератор наклеек для образцов филамента — печать на термопринтере MX11 (BLE).
Статический PWA на GitHub Pages. Чистые Web Components, без фреймворков.

## Структура

```
index.html          — точка входа (собирает компоненты)
src/vendor/qrcode.js — QR-генератор (d-project, MIT)
src/core/protocol.js — протокол MX11: кадры, CRC-8, RLE, сборка заданий
src/core/label.js    — отрисовка наклейки на canvas, схема ленты, калибровка
src/core/ble.js      — Web Bluetooth транспорт (приоритеты характеристик)
src/core/i18n.js     — RU/EN + автоопределение языка
src/core/store.js    — localStorage: каталог, история, настройки
src/components/*.js  — web-компоненты (UI)
```

## Сборка

Никакой сборки нет — статические ES-модули. Для разработки:

```bash
python3 -m http.server 8765   # и открыть http://localhost:8765
```

Web Bluetooth требует HTTPS или localhost.

## План

Бриф: `~/workspace/mx11-labels/PLAN.md` (проект изначально задумывался там).
