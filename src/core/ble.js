// ===== Web Bluetooth транспорт для MX11 =====
// Перенос из v14: приоритеты сервисов/характеристик (ae01 → самый высокий вес),
// повтор подключения, чанкованная запись, статус-уведомления.
// Только Web Bluetooth (по решению пользователя Python-мост не нужен).
import { cmdFeedPaper } from './protocol.js';

const SERVICE_CANDIDATES = [
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae3a-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ae80-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ab00-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];
const WRITE_SHORT  = ['ae01', 'ae3b', 'ae81', 'ff02', 'ab01'];
const NOTIFY_SHORT = ['ae02', 'ae04', 'ae3c', 'ab03'];
const SERVICE_SHORT = ['ae30', 'ae3a', 'ae00', 'ae80', 'af30', 'ff00', 'ab00'];
const BASE_SUFFIX = '-0000-1000-8000-00805f9b34fb';
const shortUuid = u => (u.startsWith('0000') && u.endsWith(BASE_SUFFIX)) ? u.substr(4, 4) : u;
const rank = (v, list, base, step) => { const i = list.indexOf(v); return i < 0 ? 0 : base - step * i; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Бит состояния: бит 7 у MX11 взведён всегда — проверяем только известные.
export const STATUS_BITS = [
  [0b0001, 'no_paper', 'нет бумаги'],
  [0b0100, 'overheat', 'перегрев'],
  [0b1000, 'low_battery', 'низкий заряд'],
];

export class MxPrinter {
  constructor(log = () => {}) {
    this.log = log;
    this.device = null;        // BluetoothDevice
    this.server = null;        // GATT server
    this.tx = null;            // характеристика записи
    this.rx = null;            // характеристика уведомлений
    this.canWriteNoResp = false;
    this.connected = false;
    this._rxListeners = [];
  }

  get isConnected() { return this.connected; }

  // ---- выбор устройства (Chrome-диалог) ----
  async requestDevice(showAll = false) {
    const opts = showAll
      ? { acceptAllDevices: true, optionalServices: SERVICE_CANDIDATES }
      : { filters: [{ namePrefix: 'MX' }, { namePrefix: 'GT' }, { namePrefix: 'GB' },
                    { namePrefix: 'YT' }, { namePrefix: 'MB' }, { services: [0xae30] }],
          optionalServices: SERVICE_CANDIDATES };
    this.device = await navigator.bluetooth.requestDevice(opts);
    this.log(`Выбрано устройство: "${this.device.name || '?'}" id=${this.device.id}`);
  }

  async connect() {
    if (!this.device) throw new Error('сначала выберите устройство');
    this.device.addEventListener('gattserverdisconnected', () => {
      this.connected = false;
      this.log('принтер отключился');
    });
    // Повтор только пока Chrome не пометил устройство «вне зоны»
    let lastErr = null;
    for (let a = 1; a <= 2; a++) {
      try {
        this.log(`gatt.connect, попытка ${a}…`);
        this.server = await this.device.gatt.connect();
        break;
      } catch (e) {
        lastErr = e;
        this.log(`  попытка ${a} не удалась: ${e.name} ${e.message}`);
        try { if (this.device.gatt.connected) this.device.gatt.disconnect(); } catch (_) {}
        if (/no longer in range/i.test(e.message)) {
          this.log('  Chrome сбросил устройство — нужен новый выбор.');
          break;
        }
        if (a < 2) { await sleep(1500); }
      }
    }
    if (!this.server) throw lastErr || new Error('не удалось установить соединение');
    this.log('GATT подключён');
    await this._discoverEndpoint();
    this.connected = true;
  }

  // Выбор характеристики записи по приоритету (см. protocol в v14):
  // ae01 (сервис ae30) получает максимальный вес; ae3b — ловушка, туда писать нельзя.
  async _discoverEndpoint() {
    let services = [];
    for (let attempt = 1; attempt <= 4; attempt++) {
      try { services = await this.server.getPrimaryServices(); }
      catch (e) { this.log(`getPrimaryServices, попытка ${attempt}: ${e.message}`); }
      this.log(`Обнаружено сервисов (попытка ${attempt}): ${services.length}`);
      if (services.length) break;
      await sleep(800);
    }

    const candidates = [];
    let notifyChars = [];
    for (const svc of services) {
      let chars = [];
      try { chars = await svc.getCharacteristics(); }
      catch (e) { this.log(`  сервис ${svc.uuid}: ошибка чтения: ${e.message}`); continue; }
      this.log(`  сервис ${svc.uuid}:`);
      for (const c of chars) {
        const props = propsOf(c);
        this.log(`    хар-ка ${c.uuid} [${props.join(',')}]`);
        const w = c.properties.write, wnr = c.properties.writeWithoutResponse;
        if (w || wnr) {
          const score = rank(shortUuid(c.uuid), WRITE_SHORT, 300, 20)
                      + rank(shortUuid(svc.uuid), SERVICE_SHORT, 100, 10)
                      + (wnr ? 10 : 5);
          candidates.push({ char: c, svcUuid: svc.uuid, score, wnr });
        }
        if (c.properties.notify) notifyChars.push({ char: c, svcUuid: svc.uuid });
      }
    }
    if (!candidates.length) throw new Error('не нашлась характеристика записи — скопируйте отчёт');
    candidates.sort((a, b) => b.score - a.score);
    candidates.forEach(c => this.log(`  кандидат на запись: ${c.char.uuid} — вес ${c.score}`));
    const sel = candidates[0];
    this.tx = sel.char;
    this.canWriteNoResp = !!sel.wnr;
    this.log(`Выбрана для записи: ${sel.char.uuid} (вес ${sel.score})`);
    this.log(`Режим записи: ${this.canWriteNoResp ? 'без ответа (быстрый)' : 'с ответом'}`);

    // уведомления: известные, из того же сервиса
    const rxRank = n => rank(shortUuid(n.char.uuid), NOTIFY_SHORT, 100, 10) + (n.svcUuid === sel.svcUuid ? 50 : 0);
    notifyChars.sort((a, b) => rxRank(b) - rxRank(a));
    if (notifyChars.length) {
      this.rx = notifyChars[0].char;
      try {
        await this.rx.startNotifications();
        this.rx.addEventListener('characteristicvaluechanged', ev => this._onNotify(ev));
        this.log(`Уведомления через ${this.rx.uuid}`);
      } catch (e) { this.log(`Уведомления не включились: ${e.message}`); }
    }
  }

  _onNotify(ev) {
    const d = new Uint8Array(ev.target.value.buffer);
    this.log('RX: ' + Array.from(d).map(b => b.toString(16).padStart(2, '0')).join(' '));
    if (d.length >= 7 && d[2] === 0xa3) {
      const st = d[6];
      for (const [mask, key, title] of STATUS_BITS) {
        if (st & mask) this._rxListeners.forEach(fn => fn(key, title));
      }
    }
  }

  onStatus(fn) { this._rxListeners.push(fn); }

  async _write(data, onProgress) {
    if (!this.tx) throw new Error('принтер не подключён');
    const CHUNK = 128;
    const total = Math.ceil(data.length / CHUNK);
    this.log(`Отправка ${data.length} байт (${total} пакетов по ${CHUNK}, ${this.canWriteNoResp ? 'без ответа' : 'с ответом'})`);
    for (let i = 0; i < total; i++) {
      const part = data.subarray(i * CHUNK, (i + 1) * CHUNK);
      if (this.canWriteNoResp) {
        await this.tx.writeValueWithoutResponse(part);
        await sleep(12);
        if (i % 16 === 15) await sleep(90); // даём буферу принтера освободиться
      } else {
        await this.tx.writeValue(part);
      }
      if (onProgress) onProgress((i + 1) / total);
    }
  }

  async print(bytes, onProgress) { await this._write(bytes, onProgress); }

  async feed(lines) { await this._write(new Uint8Array(cmdFeedPaper(lines))); }

  disconnect() {
    try { if (this.device && this.device.gatt.connected) this.device.gatt.disconnect(); } catch (_) {}
    this.connected = false;
  }
}

function propsOf(c) {
  const p = c.properties, out = [];
  for (const k of ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate']) if (p[k]) out.push(k);
  return out;
}
