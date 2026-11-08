// Мобильная «прослойка»: то же API (window.win), что даёт приложение на ПК, но на телефоне:
//  • заметки, группы, карты, картинки — в памяти браузера (IndexedDB), работают без сети;
//  • вход в Google — через официальный модуль Google в браузере (пароль приложение не видит);
//  • синхронизация — тем же общим ядром synccore.js, что и на ПК.
(() => {
  const WEB_CLIENT_ID = '112067547236-n2fga01a0lrm5726b9ftrlrhq63104r6.apps.googleusercontent.com'; // подставляет build-mobile.js
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files', UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const C = window.SyncCore;
  document.documentElement.classList.add('mobile');

  // ---------- хранилище: IndexedDB «ключ → значение» ----------
  const dbp = new Promise((res, rej) => {
    const r = indexedDB.open('moe-notes', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    const db = await dbp;
    return new Promise((res, rej) => {
      const t = db.transaction('kv', mode), req = fn(t.objectStore('kv'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
    });
  };
  const get = k => tx('readonly', s => s.get(k));
  const put = (k, v) => tx('readwrite', s => s.put(v, k));
  const keys = () => tx('readonly', s => s.getAllKeys());
  navigator.storage?.persist?.(); // попросить браузер никогда не чистить эти данные

  let notes = [], groups = [], maps = [], words = { freq: {}, dict: [] }, sync = null, password = '';
  const media = new Map(); // имя файла → адрес для показа (blob:)
  const ready = (async () => {
    [notes, groups, maps, words, sync, password] = await Promise.all(['notes', 'groups', 'maps', 'words', 'sync', 'pass'].map(get));
    notes ||= []; groups ||= []; maps ||= []; words ||= { freq: {}, dict: [] }; password ||= '';
    sync ||= { dev: crypto.randomUUID(), base: {} };
    for (const k of await keys()) if (String(k).startsWith('media/')) media.set(k.slice(6), URL.createObjectURL(await get(k)));
  })();
  const later = (fn, ms) => { let t; const f = () => { clearTimeout(t); t = setTimeout(fn, ms); }; f.now = () => { clearTimeout(t); return fn(); }; return f; };
  const saveNotes = later(() => put('notes', notes), 300), saveGroups = later(() => put('groups', groups), 300);
  const saveMaps = later(() => put('maps', maps), 400), saveWords = later(() => put('words', words), 1500);
  const flushAll = () => Promise.all([saveNotes.now(), saveGroups.now(), saveMaps.now(), saveWords.now()]);
  // телефон может закрыть приложение в любой момент — дописываем при уходе
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); });

  // ---------- картинки ----------
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', avif: 'image/avif',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4', ogv: 'video/ogg' };
  const extOf = name => (name.split('.').pop() || '').toLowerCase();
  async function storeMedia(blob, ext) {
    const name = crypto.randomUUID() + ext;
    await put('media/' + name, blob);
    media.set(name, URL.createObjectURL(blob));
    return 'media://' + name;
  }
  const mediaSrc = src => typeof src === 'string' && src.startsWith('media://') ? media.get(src.slice(8)) || '' : src;
  function pickFiles(kind) { // выбор из галереи / файлов телефона
    return new Promise(resolve => {
      const inp = Object.assign(document.createElement('input'), { type: 'file', multiple: true, accept: kind === 'video' ? 'video/*' : 'image/*' });
      inp.onchange = async () => {
        const out = [];
        for (const f of inp.files) {
          const ext = '.' + (extOf(f.name) || (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg'));
          out.push({ url: await storeMedia(f, ext), kind: f.type.startsWith('video/') ? 'video' : 'image' });
        }
        resolve(out);
      };
      inp.oncancel = () => resolve([]);
      inp.click();
    });
  }

  // ---------- Google: вход и файлы в скрытой папке приложения ----------
  // пропуск от Google живёт час; храним его, чтобы при повторном открытии в течение часа не входить заново
let access = localStorage.getItem('gtok') || '', accessExp = +localStorage.getItem('gexp') || 0, interactive = false;
const dropToken = () => { access = ''; accessExp = 0; localStorage.removeItem('gtok'); localStorage.removeItem('gexp'); };
  const connected = () => localStorage.getItem('gconnected') === '1';
  const loadGis = () => new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true });
    s.onload = res; s.onerror = () => rej(new Error('offline'));
    document.head.append(s);
  });
  if (connected() && navigator.onLine) loadGis().catch(() => {}); // заранее — чтобы вход по кнопке открылся сразу
  async function requestToken() {
    await loadGis();
    return new Promise((res, rej) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: WEB_CLIENT_ID, scope: SCOPE,
        callback: r => {
          if (r.error) return rej(new Error(r.error));
          access = r.access_token; accessExp = Date.now() + (r.expires_in - 60) * 1000;
          localStorage.setItem('gtok', access); localStorage.setItem('gexp', accessExp);
          localStorage.setItem('gconnected', '1');
          // запомнить почту — в следующий раз Google не спрашивает, какой аккаунт, окно мелькнёт и закроется само
          if (!localStorage.getItem('ghint')) fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + access } })
            .then(x => x.ok ? x.json() : null).then(j => j?.user?.emailAddress && localStorage.setItem('ghint', j.user.emailAddress)).catch(() => {});
          res(access);
        },
        error_callback: e => rej(new Error(e.type === 'popup_closed' ? 'cancelled' : e.type || 'popup')),
      });
      client.requestAccessToken({ prompt: connected() ? '' : 'consent', login_hint: localStorage.getItem('ghint') || undefined });
    });
  }
  async function token() {
    if (access && Date.now() < accessExp) return access;
    if (!interactive) throw new Error('auth-expired'); // без нажатия кнопки окно входа не открываем
    return requestToken();
  }
  async function drive(url, opts = {}) {
    let r;
    try { r = await fetch(url, { ...opts, headers: { ...opts.headers, Authorization: 'Bearer ' + await token() } }); }
    catch (e) { if (/auth-expired|cancelled|popup/.test(e.message)) throw e; throw new Error('offline'); }
    if (r.status === 401) { dropToken(); throw new Error('auth-expired'); }
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).error.message || ''; } catch {}
      if (/has not been used|is disabled/i.test(msg)) throw new Error('drive-api-off');
      throw new Error('drive-' + r.status + (msg ? ': ' + msg.slice(0, 160) : ''));
    }
    return r;
  }
  const cache = new Map();
  async function find(name) {
    const q = `name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed=false`;
    return (await (await drive(`${DRIVE}?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(q)}`)).json()).files[0] || null;
  }
  const store = {
    async get(name) {
      const f = await find(name);
      if (!f) return null;
      const c = cache.get(name);
      if (c && c.mt === f.modifiedTime) return c.bytes;
      const bytes = new Uint8Array(await (await drive(`${DRIVE}/${f.id}?alt=media`)).arrayBuffer());
      cache.set(name, { mt: f.modifiedTime, bytes });
      return bytes;
    },
    async put(name, bytes) {
      const f = await find(name);
      if (f) await drive(`${UPLOAD}/${f.id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes });
      else {
        const b = 'moe' + Math.random().toString(16).slice(2);
        const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: ['appDataFolder'] })}\r\n--${b}\r\nContent-Type: application/octet-stream\r\n\r\n`, bytes, `\r\n--${b}--`]);
        await drive(`${UPLOAD}?uploadType=multipart`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
      }
      cache.delete(name);
    },
    async list(prefix) {
      const names = [];
      let pageToken = '';
      do {
        const j = await (await drive(`${DRIVE}?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(name)` + (pageToken ? '&pageToken=' + pageToken : ''))).json();
        for (const f of j.files) if (f.name.startsWith(prefix)) names.push(f.name);
        pageToken = j.nextPageToken;
      } while (pageToken);
      return names;
    },
  };
  // тест без Google: ?testcloud — «облако» в памяти этого браузера (общее для вкладок)
  const testCloud = new URLSearchParams(location.search).has('testcloud');
  const testStore = {
    async get(n) { return (await get('testcloud/' + n)) || null; },
    async put(n, bytes) { await put('testcloud/' + n, bytes); },
    async list(prefix) { return (await keys()).map(String).filter(k => k.startsWith('testcloud/' + prefix)).map(k => k.slice(10)); },
  };
  const prov = () => C.provider(testCloud ? testStore : store, () => password);
  const local = () => C.snapshot({ notes, groups, maps });
  const isConnected = () => testCloud || connected();

  let cloudCache = null, cloudAt = 0, busy = false;
  async function status(refresh) {
    await ready;
    if (!isConnected()) return { connected: false };
    const out = (await C.status(local(), sync.base, null)).out;
    // пропуск истёк: не пугаем «войди заново» — «Загрузить» сам быстро возьмёт новый пропуск (окно Google мелькнёт и закроется)
    const relogin = { connected: true, out, inc: '↻' };
    if (!testCloud && !(access && Date.now() < accessExp)) return relogin;
    try {
      if (refresh || Date.now() - cloudAt > 60000) { cloudCache = await prov().read(); cloudAt = Date.now(); }
      return { connected: true, ...await C.status(local(), sync.base, cloudCache) };
    } catch (e) {
      if (/auth-expired/.test(e.message)) return relogin;
      if (/password/.test(e.message)) return { connected: true, password: e.message, out };
      if (/^drive-/.test(e.message)) return { connected: true, failed: e.message, out };
      return { connected: true, offline: true, error: e.message, out };
    }
  }
  const run = fn => async () => {
    await ready;
    if (busy) return { error: 'busy' };
    busy = true; interactive = true;
    try { const r = await fn(); await put('sync', sync); cloudAt = 0; return r; }
    catch (e) { return { error: e.message }; }
    finally { busy = false; interactive = false; }
  };
  const isVideo = n => /\.(mp4|webm|m4v|ogv|mov)$/i.test(n);
  const send = run(() => C.send({ provider: prov(), local: local(), base: sync.base, dev: sync.dev,
    readMedia: async n => { const b = await get('media/' + n); return b && !isVideo(n) ? new Uint8Array(await b.arrayBuffer()) : null; } }));
  const load = run(async () => {
    const r = await C.load({ provider: prov(), local: local(), base: sync.base, newId: () => crypto.randomUUID(),
      haveMedia: async n => media.has(n),
      writeMedia: async (n, bytes) => {
        if (!/^[\w-]+\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(n)) return; // только картинки
        const blob = new Blob([bytes], { type: MIME[extOf(n)] || 'application/octet-stream' });
        await put('media/' + n, blob);
        media.set(n, URL.createObjectURL(blob));
      } });
    C.apply({ note: notes, group: groups, map: maps }, r.changes);
    await Promise.all([put('notes', notes), put('groups', groups), put('maps', maps)]);
    return { loaded: r.loaded, conflicts: r.conflicts };
  });

  // ---------- то же API, что на ПК ----------
  const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
  const invoke = {
    'notes-list': async () => (await ready, notes),
    'groups-list': async () => (await ready, groups),
    'maps-list': async () => (await ready, maps),
    'words-get': async () => (await ready, words),
    'spell-check': async () => [], 'spell-suggest': async () => [], // на телефоне проверяет клавиатура
    'yt-title': async () => '',
    'media-pick': kind => pickFiles(kind),
    'media-import': async () => [],
    'media-paste': async ({ bytes, ext } = {}) => bytes ? storeMedia(new Blob([bytes], { type: MIME[(ext || '').slice(1)] || 'image/png' }), ext) : null,
    'sync-status': refresh => status(refresh),
    'sync-info': async () => (await ready, { connected: isConnected(), test: testCloud, encrypted: !!password }),
    'sync-connect': async () => { try { interactive = true; await requestToken(); cloudAt = 0; return { ok: true }; } catch (e) { return { error: e.message }; } finally { interactive = false; } },
    'sync-disconnect': async () => {
      if (access && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(access, () => {});
      dropToken(); localStorage.removeItem('gconnected'); localStorage.removeItem('ghint'); cloudCache = null;
      return { ok: true };
    },
    'sync-password': async ({ password: p, rewrite } = {}) => {
      await ready;
      if (typeof p !== 'string' || p.length > 200) return { error: 'bad' };
      const old = password;
      password = p; await put('pass', p); cloudAt = 0; cloudCache = null;
      if (!rewrite || !isConnected()) return { ok: true };
      interactive = true;
      try { const st = await C.provider(testCloud ? testStore : store, () => old).read(); if (st) await prov().write(st); return { ok: true }; }
      catch (e) { return { ok: true, warn: e.message }; }
      finally { interactive = false; }
    },
    'sync-send': () => send(),
    'sync-load': () => load(),
  };
  const sendHandlers = {
    'note-save': n => {
      if (!n || typeof n.id !== 'string' || typeof n.title !== 'string' || typeof n.text !== 'string') return;
      let note = notes.find(x => x.id === n.id);
      if (!note) notes.push(note = { id: n.id });
      Object.assign(note, { title: n.title.slice(0, 500), text: n.text.slice(0, 2e6), updated: Date.now() });
      if ('group' in n) note.group = typeof n.group === 'string' ? n.group.slice(0, 64) : null;
      if ('fs' in n) note.fs = Number.isInteger(n.fs) && n.fs >= 10 && n.fs <= 40 ? n.fs : undefined; // вид заметки
      if ('font' in n) note.font = typeof n.font === 'string' && /^[a-z]{1,12}$/.test(n.font) ? n.font : undefined;
      saveNotes();
    },
    'note-group': ({ id, group } = {}) => { const n = notes.find(x => x.id === id); if (n) { n.group = typeof group === 'string' ? group : null; saveNotes(); } },
    'note-delete': id => { notes = notes.filter(n => n.id !== id); saveNotes(); },
    'groups-save': g => {
      if (!Array.isArray(g)) return;
      groups = g.filter(x => x && typeof x.id === 'string').map(x => ({ id: x.id.slice(0, 64), name: str(x.name, 80), color: str(x.color, 16), open: x.open !== false }));
      saveGroups();
    },
    'maps-save': m => { if (Array.isArray(m)) { maps = m; saveMaps(); } },
    'words-learn': counts => {
      for (const [w, n] of Object.entries(counts || {})) {
        if (w.length > 40 || !Number.isInteger(n) || !n) continue;
        words.freq[w] = Math.max(0, (words.freq[w] || 0) + n);
        if (!words.freq[w]) delete words.freq[w];
      }
      saveWords();
    },
    'words-add': w => { if (typeof w === 'string' && !words.dict.includes(w)) { words.dict.push(w); saveWords(); } },
    'clipboard-write': t => navigator.clipboard?.writeText(String(t)).catch(() => {}),
  };
  window.win = {
    invoke: (ch, data) => (invoke[ch] ? invoke[ch](data) : Promise.resolve(null)),
    send: (ch, data) => { sendHandlers[ch]?.(data); },
    on: () => {},
    state: async () => ({ alarms: [], timers: [] }),
    mediaSrc,
  };

  addEventListener('DOMContentLoaded', () => {
    // проверку слов на телефоне делает клавиатура и браузер
    document.getElementById('text')?.setAttribute('spellcheck', 'true');
    // кнопка/жест «назад» в Android: из заметки — к списку, а не выход из приложения
    const html = document.documentElement;
    new MutationObserver(() => {
      if (html.classList.contains('editing') && !history.state?.editing) history.pushState({ editing: true }, '');
    }).observe(html, { attributes: true, attributeFilter: ['class'] });
    addEventListener('popstate', () => { if (html.classList.contains('editing')) document.getElementById('back')?.click(); });
    // кнопка ← в самом приложении тоже убирает лишний шаг истории
    document.getElementById('back')?.addEventListener('click', () => { if (history.state?.editing) history.back(); });
  });
})();
