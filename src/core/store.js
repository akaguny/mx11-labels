// ===== localStorage: каталог филаментов, история печати, настройки =====
// Каталог: список материалов (бренд/тип/цвет/доп.строка) — печать повторно в один клик.
// История: что и когда печатали.

const KEYS = {
  catalog: 'mx11.catalog.v1',
  history: 'mx11.history.v1',
  settings: 'mx11.settings.v1',
};

export const DEFAULT_SETTINGS = {
  preset: '67x25',        // или 'custom'
  orient: 'auto',
  wmm: 67, hmm: 25,
  offmm: 0,
  copies: 1,
  tear: 7,                // протяжка после печати, мм
  energy: 100,            // %
  border: true,
  bigPreview: false,
  cal: 100,               // калибровка, %
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('mx11 store: bad JSON in', key, e);
    return fallback;
  }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn('mx11 store: write failed', key, e); }
}

// ---------- настройки ----------
export function loadSettings() {
  const s = { ...DEFAULT_SETTINGS, ...(read(KEYS.settings, {}) || {}) };
  // калибровка из адреса страницы имеет приоритет (как в v14)
  const m = (location.hash || '').match(/cal=([\d.]+)/);
  if (m && Number.isFinite(parseFloat(m[1]))) s.cal = parseFloat(m[1]);
  return s;
}

export function saveSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  write(KEYS.settings, s);
  return s;
}

// ---------- каталог филаментов ----------
export function loadCatalog() {
  return read(KEYS.catalog, []);
}

export function saveCatalog(items) {
  write(KEYS.catalog, items);
  return items;
}

// Добавить (или обновить по совпадению бренд/тип/цвет) материал в каталог.
export function upsertCatalogItem(item) {
  const items = loadCatalog();
  const i = items.findIndex(x =>
    x.brand === item.brand && x.type === item.type && x.color === item.color);
  const entry = { ...item, ts: Date.now() };
  if (i >= 0) items[i] = entry; else items.unshift(entry);
  return saveCatalog(items.slice(0, 200));
}

export function removeCatalogItem(index) {
  const items = loadCatalog();
  items.splice(index, 1);
  return saveCatalog(items);
}

// ---------- история печати ----------
export function loadHistory() {
  return read(KEYS.history, []);
}

export function addHistoryEntry(entry) {
  const h = loadHistory();
  h.unshift({ ...entry, ts: Date.now() });
  return write(KEYS.history, h.slice(0, 100));
}

export function clearHistory() {
  write(KEYS.history, []);
}
