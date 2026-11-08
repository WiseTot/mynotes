// Общее ядро синхронизации — одно и то же на ПК (Electron/Node) и на телефоне (браузер).
// Одинаковый код = одинаковые отпечатки изменений и одинаковое шифрование на всех устройствах.
// Использует только WebCrypto (crypto.subtle), TextEncoder и Uint8Array — они есть и в Node, и в браузере.
//
//  • В облаке лежит файл состояния: { items: { "note:<id>": { h, data, t, dev } }, deleted: { "note:<id>": t } }
//    и картинки media/<имя>. h — отпечаток содержимого (sha1).
//  • «База» устройства — отпечатки при прошлой синхронизации. Отличие от базы = изменение:
//    локальное (ждёт «Отправить») или облачное (ждёт «Загрузить»). И там и там — конфликт, вторая версия
//    сохраняется копией, ничего не теряется.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SyncCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const subtle = globalThis.crypto.subtle;
  const te = new TextEncoder(), td = new TextDecoder();
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const hash = async data => hex(await subtle.digest('SHA-1', te.encode(JSON.stringify(data)))).slice(0, 16);
  const emptyCloud = () => ({ v: 1, items: {}, deleted: {} });
  const MEDIA = /media:\/\/([\w-]+\.\w+)/g;
  const mediaNames = data => [...JSON.stringify(data).matchAll(MEDIA)].map(m => m[1]);

  // ---------- приведение к одному виду (всё, что уходит в облако и приходит из него) ----------
  // Только нужные поля нужного типа и размера — чужой или испорченный файл не подсунет ничего лишнего.
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const num = v => Number.isFinite(+v) ? +v : 0;
  const MEDIA_REF = /^media:\/\/[\w-]+\.\w+$/;
  function cleanNode(n) {
    if (!n || !['text', 'note', 'image', 'video', 'mp4'].includes(n.type)) return null;
    const o = { id: str(n.id, 64), type: n.type, x: num(n.x), y: num(n.y), w: Math.min(4000, num(n.w) || 240), h: Math.min(4000, num(n.h) || 120) };
    if (n.type === 'text') Object.assign(o, { text: str(n.text, 1e5), fs: num(n.fs) || undefined,
      align: ['center', 'right'].includes(n.align) ? n.align : undefined, bold: !!n.bold || undefined, italic: !!n.italic || undefined, font: str(n.font, 20) || undefined });
    if (n.type === 'note') o.noteId = str(n.noteId, 64);
    if (n.type === 'image' || n.type === 'mp4') { if (!MEDIA_REF.test(n.src)) return null; o.src = n.src; }
    if (n.type === 'video') { if (!/^[\w-]{11}$/.test(n.vid)) return null; o.vid = n.vid; }
    if (n.type === 'video' || n.type === 'mp4') Object.assign(o, { title: n.title === undefined ? undefined : str(n.title, 200),
      start: num(n.start) || undefined, end: num(n.end) || undefined, clean: !!n.clean || undefined,
      marks: Array.isArray(n.marks) ? n.marks.slice(0, 500).map(k => ({ t: num(k.t), label: str(k.label, 100) })) : [] });
    return o;
  }
  const clean = {
    note: d => ({ title: str(d.title, 500), text: str(d.text, 2e6).replace(/!\[[^\]\n]*\]\(([^)\s]*)\)/g, (m, u) => MEDIA_REF.test(u) ? m : ''),
      updated: num(d.updated) || Date.now(), group: str(d.group, 64) || null }),
    group: d => ({ name: str(d.name, 80), color: /^#[0-9a-f]{3,8}$/i.test(d.color) ? d.color : '#7cc8ff' }),
    map: d => ({ name: str(d.name, 80), nodes: Array.isArray(d.nodes) ? d.nodes.slice(0, 5000).map(cleanNode).filter(Boolean) : [],
      edges: Array.isArray(d.edges) ? d.edges.slice(0, 20000).filter(e => e && typeof e.from === 'string' && typeof e.to === 'string')
        .map(e => ({ id: str(e.id, 64), from: str(e.from, 64), to: str(e.to, 64), color: /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : undefined })) : [] }),
  };
  const normal = o => JSON.parse(JSON.stringify(o)); // убрать undefined — чтобы отпечатки совпадали везде
  // что синхронизируем: заметки (непустые), группы (без «свёрнута»), карты (без положения камеры — оно у каждого своё)
  // данные уже в переносимом виде (картинки — media://имя)
  function snapshot({ notes = [], groups = [], maps = [] }) {
    const m = new Map();
    for (const n of notes) if ((n.title || '').trim() || (n.text || '').trim()) m.set('note:' + n.id, normal(clean.note(n)));
    for (const g of groups) m.set('group:' + g.id, normal(clean.group(g)));
    for (const x of maps) m.set('map:' + x.id, normal(clean.map(x)));
    return m;
  }
  // применить загруженное к спискам (мутирует их); data — переносимый вид
  function apply(lists, changes, { mapView = { x: 480, y: 320, zoom: 1 } } = {}) {
    for (const c of changes) {
      const i0 = c.key.indexOf(':'), kind = c.key.slice(0, i0), id = c.key.slice(i0 + 1);
      const list = lists[kind];
      if (!list || !clean[kind] || !/^[\w-]{1,64}$/.test(id)) continue;
      const i = list.findIndex(x => x.id === id);
      if (c.op === 'del') { if (i >= 0) list.splice(i, 1); continue; }
      const data = { id, ...normal(clean[kind](c.data || {})) };
      if (kind === 'group') data.open = i >= 0 ? list[i].open : true;
      if (kind === 'map') data.view = i >= 0 ? list[i].view : mapView;
      i >= 0 ? (list[i] = data) : list.push(data);
    }
  }
  // конфликт: облачная версия сохраняется рядом копией (у группы спорить не о чем — остаётся своя)
  function copyOf(k, data, newId) {
    const kind = k.split(':')[0];
    if (kind === 'group') return null;
    const mark = ' (с другого устройства)', tag = s => s.endsWith(mark) ? s : s + mark; // пометка одна, сколько бы раз ни спорили
    return { key: kind + ':' + newId, data: kind === 'note' ? { ...data, title: tag(data.title || 'Без названия') } : { ...data, name: tag(data.name || 'Карта') } };
  }

  // ---------- что изменилось ----------
  async function diff(local, base, cloud) {
    const lh = new Map();
    for (const [k, d] of local) lh.set(k, await hash(d));
    const out = new Map(), inc = new Map();
    for (const [k, h] of lh) if (base[k] !== h) out.set(k, 'put');                 // новое или изменённое здесь
    for (const k of Object.keys(base)) if (!lh.has(k)) out.set(k, 'del');          // удалено здесь
    for (const [k, it] of Object.entries(cloud.items)) {
      if (it.h !== base[k] && it.h !== lh.get(k)) inc.set(k, 'put');               // изменено на другом устройстве
    }
    for (const k of Object.keys(cloud.deleted)) {
      if (k in base && !(k in cloud.items) && lh.has(k)) inc.set(k, 'del');        // удалено на другом устройстве
    }
    return { out, inc, conflicts: [...out.keys()].filter(k => inc.has(k)), lh };
  }

  // Отправить: всё, что изменено здесь и не спорит с облаком. Спорное ждёт «Загрузить».
  async function send({ provider, local, base, dev, readMedia }) {
    const cloud = await provider.read() || emptyCloud();
    const { out, conflicts, lh } = await diff(local, base, cloud);
    let sent = 0;
    const need = new Set();
    for (const [k, op] of out) {
      if (conflicts.includes(k)) continue;
      if (op === 'put') {
        const data = local.get(k);
        cloud.items[k] = { h: lh.get(k), data, t: Date.now(), dev };
        delete cloud.deleted[k];
        base[k] = lh.get(k);
        mediaNames(data).forEach(n => need.add(n));
      } else {
        delete cloud.items[k];
        cloud.deleted[k] = Date.now();
        delete base[k];
      }
      sent++;
    }
    if (sent) {
      const have = new Set(await provider.listMedia());
      for (const name of need) {
        if (have.has(name)) continue;
        const buf = await readMedia(name);
        if (buf) await provider.putMedia(name, buf);
      }
      await provider.write(cloud);
    }
    return { sent, blocked: conflicts.length };
  }

  // Загрузить: изменения с других устройств. При конфликте своя версия остаётся, облачная — рядом копией.
  async function load({ provider, local, base, haveMedia, writeMedia, newId }) {
    const cloud = await provider.read();
    if (!cloud) return { loaded: 0, conflicts: 0, changes: [] };
    const { out, inc } = await diff(local, base, cloud);
    const changes = [];
    let conflicts = 0;
    for (const [k, op] of inc) {
      const mine = out.get(k);
      if (op === 'put') {
        const it = cloud.items[k];
        if (mine === 'put') { // изменено и тут, и там
          const copy = copyOf(k, it.data, newId());
          if (copy) { changes.push({ op: 'put', key: copy.key, data: copy.data }); conflicts++; }
          base[k] = it.h; // своя версия теперь «изменённая» → уйдёт при следующей отправке
        } else {
          changes.push({ op: 'put', key: k, data: it.data }); // в т.ч. удалено здесь, но изменено там — возвращаем
          base[k] = it.h;
        }
      } else if (mine === 'put') {
        delete base[k]; // удалено там, а здесь правили — своя остаётся и уйдёт как новая
      } else {
        changes.push({ op: 'del', key: k });
        delete base[k];
      }
    }
    const need = new Set(changes.filter(c => c.op === 'put').flatMap(c => mediaNames(c.data)));
    for (const name of need) {
      if (await haveMedia(name)) continue;
      const buf = await provider.getMedia(name);
      if (buf) await writeMedia(name, buf);
    }
    return { loaded: changes.length - conflicts, conflicts, changes };
  }

  async function status(local, base, cloud) {
    const { out, inc, conflicts } = await diff(local, base, cloud || emptyCloud());
    return { out: out.size, inc: inc.size, conflicts: conflicts.length };
  }

  // ---------- шифрование (по желанию): AES-256-GCM, ключ из пароля через PBKDF2-SHA256 ----------
  const ITER = 310000;
  const toB64 = u8 => {
    if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const fromB64 = s => typeof Buffer !== 'undefined' ? new Uint8Array(Buffer.from(s, 'base64')) : Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function keyFrom(password, salt) {
    const base = await subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(bytes, password) {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(16)), iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(password, salt), bytes));
    // формат как у Node: данные и тег (последние 16 байт) — отдельно
    return te.encode(JSON.stringify({ enc: 1, salt: toB64(salt), iv: toB64(iv), tag: toB64(ct.subarray(ct.length - 16)), data: toB64(ct.subarray(0, ct.length - 16)) }));
  }
  function isEncrypted(bytes) {
    if (bytes[0] !== 0x7b) return false; // не «{» — точно не зашифрованный конверт
    try { return JSON.parse(td.decode(bytes)).enc === 1; } catch { return false; }
  }
  async function decrypt(bytes, password) {
    if (!isEncrypted(bytes)) return bytes; // обычный файл (шифрование выключено или старая картинка)
    if (!password) throw new Error('need-password');
    const o = JSON.parse(td.decode(bytes)), data = fromB64(o.data), tag = fromB64(o.tag);
    const ct = new Uint8Array(data.length + tag.length);
    ct.set(data); ct.set(tag, data.length);
    try { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(o.iv) }, await keyFrom(password, fromB64(o.salt)), ct)); }
    catch { throw new Error('wrong-password'); }
  }

  // Обёртка над хранилищем байтов: { get(name) → bytes|null, put(name, bytes), list(prefix) → [names] }
  function provider(raw, getPassword) {
    const pack = async bytes => { const p = getPassword(); return p ? encrypt(bytes, p) : bytes; };
    const unpack = bytes => decrypt(bytes, getPassword());
    return {
      async read() { const b = await raw.get('state.json'); return b ? JSON.parse(td.decode(await unpack(b))) : null; },
      async write(state) { await raw.put('state.json', await pack(te.encode(JSON.stringify(state)))); },
      async listMedia() { return (await raw.list('media/')).map(n => n.slice(6)); },
      async putMedia(name, bytes) { await raw.put('media/' + name, await pack(bytes)); },
      async getMedia(name) { const b = await raw.get('media/' + name); return b ? unpack(b) : null; },
    };
  }

  return { hash, diff, send, load, status, encrypt, decrypt, isEncrypted, provider, snapshot, apply, clean, normal, mediaNames, emptyCloud };
});
