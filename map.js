// Карты (как Canvas в Obsidian): бесконечный холст с карточками — текст, заметка, картинка, видео YouTube, своё видео (mp4).
// От любой карточки можно тянуть пути во все стороны: за точку на краю к другой карточке
// или в пустое место (там появится новая карточка). Навёл на путь — ✕ разрывает связь.
// У видео: название, тайм-коды (клик — перемотка), фрагменты (✂ начало → ✂ конец = отдельная карточка),
// «чистый вид» без интерфейса YouTube со своей маленькой панелью.

// шрифты, которые есть в любой Windows 10/11 (на телефоне — похожие системные); общие для карт и заметок
const FONTS = {
  sans: ['Обычный', '"Segoe UI Variable Text","Segoe UI",sans-serif'],
  serif: ['С засечками', 'Georgia,"Times New Roman",serif'],
  wide: ['Строгий', 'Bahnschrift,"Segoe UI",sans-serif'],
  mono: ['Моноширинный', 'Consolas,"Cascadia Mono",monospace'],
  hand: ['Рукописный', '"Segoe Print","Ink Free",cursive'],
  script: ['Каллиграфия', '"Segoe Script",Gabriola,cursive'],
};

function initMap(root, { api, esc, nameOf, getNotes, openNote }) {
  root.innerHTML = `<div class="mview">
    <div class="m-stage">
      <div class="m-world">
        <svg class="m-edges"><defs>
          <marker id="m-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill="rgba(150,165,255,.95)"/></marker></defs>
          <g class="eg"></g><path class="tmp" style="display:none"/>
        </svg>
        <div class="e-bar"><span class="e-cols"></span><button class="e-cut" title="Разорвать связь">✕</button></div>
      </div>
      <div class="m-empty"></div>
    </div>
    <div class="m-tools glass-in">
      <select class="m-sel" title="Карта" aria-label="Карта"></select>
      <button data-act="new" title="Новая карта">＋ Карта</button>
      <button data-act="rename" title="Переименовать карту">✎</button>
      <button data-act="del" title="Удалить карту">🗑</button>
      <span class="sep"></span>
      <button data-add="text">Текст</button>
      <button data-add="note">Заметка</button>
      <button data-add="image">Картинка</button>
      <button data-add="video">YouTube</button>
      <button data-add="mp4">Видео-файл</button>
      <span class="hint">Двойной клик — карточка · тяни за точку — путь · наведи на путь — ✕ · Ctrl+V — картинка или ссылка</span>
    </div>
    <div class="m-pop glass-pop"></div>
    <div class="m-fmt glass-pop" role="toolbar" aria-label="Оформление текста">
      <button data-f="dec" title="Мельче">A−</button><span class="fsz">14</span><button data-f="inc" title="Крупнее">A+</button>
      <i class="sep"></i>
      <button data-f="left" title="По левому краю"><svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      <button data-f="center" title="По центру"><svg viewBox="0 0 16 16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      <button data-f="right" title="По правому краю"><svg viewBox="0 0 16 16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
      <i class="sep"></i>
      <button data-f="bold" title="Жирный"><b>Ж</b></button>
      <button data-f="italic" title="Курсив"><i style="font-family:Georgia,serif">К</i></button>
      <i class="sep"></i>
      <select class="ffont" title="Шрифт" aria-label="Шрифт"></select>
    </div>
    <div class="m-act glass-pop" role="toolbar" aria-label="Действия с карточкой">
      <button data-m="link">🔗 Связать</button><button data-m="edit">✎ Изменить</button><button data-m="del">🗑 Удалить</button>
      <span class="m-act-hint">Нажми на карточку, с которой связать</span><button data-m="cancel">Отмена</button>
    </div>
  </div>`;
  const q = s => root.querySelector(s);
  const stage = q('.m-stage'), world = q('.m-world'), eg = q('.eg'), tmp = q('.tmp'), cutBtn = q('.e-bar');
  // цвета веток: у каждого свой наконечник стрелки (маркер)
  const ECOL = ['#96a5ff', '#7cc8ff', '#5fe0b0', '#ffd36b', '#ff8a6b', '#ff6b9a', '#c79bff', '#e6e8f0'];
  q('.m-edges defs').innerHTML = ECOL.map((c, i) => `<marker id="m-arrow-${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');
  q('.e-cols').innerHTML = ECOL.map((c, i) => `<i data-c="${i}" style="--c:${c}" title="Цвет ветки"></i>`).join('');
  const colorIdx = e => Math.max(0, ECOL.indexOf(e.color));
  const popEl = q('.m-pop'), selEl = q('.m-sel'), emptyEl = q('.m-empty'), fmtEl = q('.m-fmt');
  fmtEl.querySelector('.ffont').innerHTML = Object.entries(FONTS).map(([k, [name, css]]) => `<option value="${k}" style="font-family:${css.replace(/"/g, '&quot;')}">${name}</option>`).join('');
  const ICON = {
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h7"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    mp4: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9v6l5-3z" fill="currentColor"/></svg>',
  };
  const SIZE = { text: [240, 120], note: [280, 180], image: [320, 220], video: [420, 300], mp4: [420, 300] };
  const NORM = { t: [0, -1], b: [0, 1], l: [-1, 0], r: [1, 0] };
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const isMedia = n => n.type === 'video' || n.type === 'mp4';
  const ytId = s => (/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(s || '') || [])[1];
  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = String(s % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  // «1:23 Битва», «1:02:03», «90» → { t, label }; без времени — null
  const parseTc = s => {
    const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\b\s*(.*)$/.exec(s) || /^\s*(\d+)\s*(?:сек|с|s)?(?=\s|$)\s*(.*)$/.exec(s);
    if (!m) return null;
    return m.length === 5 ? { t: (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3], label: m[4].trim() } : { t: +m[1], label: m[2].trim() };
  };
  console.assert(ytId('https://youtu.be/dQw4w9WgXcQ?t=4') === 'dQw4w9WgXcQ' && !ytId('hello'), 'ytId');
  console.assert(fmt(83) === '1:23' && fmt(3723) === '1:02:03', 'fmt');
  console.assert(parseTc('1:23 Битва').t === 83 && parseTc('1:02:03').t === 3723 && parseTc('90 сек тут').label === 'тут' && parseTc('просто текст') === null, 'parseTc');

  let maps = [], m = null, sel = null, editing = null, visible = false, loaded = false, drag = null, linkFrom = null, lastZoom = 0;
  const els = new Map(), players = new Map(); // id карточки → { t, dur, playing, muted, cut }
  const ps = id => players.get(id) || (players.set(id, { t: 0, dur: 0, playing: false, muted: false }), players.get(id));
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => api.send('maps-save', maps), 400); };
  const node = id => m.nodes.find(n => n.id === id);

  // ---------- вид: сдвиг и масштаб ----------
  // quick — во время щипка: только сдвиг и масштаб картинкой; подгонка текста и подписей — один раз, когда отпустишь пальцы
  function applyView(quick) {
    const v = m.view;
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    // при отдалении подписи, кнопки и стрелки растут обратно масштабу — чтобы оставались читаемыми;
    // текст карточек — мягче (иначе не влезает), а совсем издалека мелочи прячутся — остаётся обзор.
    // Только когда масштаб изменился: эти переменные пересчитывают стиль всех карточек — при простом сдвиге это зря
    if (!quick && v.zoom !== lastZoom) {
      lastZoom = v.zoom;
      world.style.setProperty('--k', clamp(Math.pow(1 / v.zoom, .75), 1, 2.4).toFixed(3));
      world.style.setProperty('--kt', clamp(Math.pow(1 / v.zoom, .55), 1, 2.2).toFixed(3));
      stage.classList.toggle('far', v.zoom < .45);
    }
    stage.style.backgroundSize = `${22 * v.zoom}px ${22 * v.zoom}px`;
    stage.style.backgroundPosition = `${v.x}px ${v.y}px`;
    if (els.size && !quick) showFmt(); // панель оформления едет вместе с карточкой
  }
  const toWorld = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - m.view.x) / m.view.zoom, y: (cy - r.top - m.view.y) / m.view.zoom }; };
  const center = () => { const r = stage.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2 + 20); };

  // ---------- карточки ----------
  const mediaHTML = n => `<div class="clip">
    <div class="head">${ICON[n.type]}<span class="ttl" title="Двойной клик — переименовать"></span>
      <button class="hb cut" title="Фрагмент: впиши начало и конец">✂</button>
      <button class="hb eye" title="Чистый вид — без интерфейса YouTube">◐</button></div>
    <div class="player">${n.type === 'video'
      ? '<iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>'
      : '<video preload="metadata"></video>'}
      <div class="pov" title="Клик — пауза / продолжить"></div>
      <div class="pbar"><button class="pp" title="Пауза / продолжить">▶</button><span class="tm">0:00</span>
        <div class="track" title="Перемотать"><i></i></div><button class="mu" title="Звук">🔊</button><button class="fs" title="На весь экран">⤢</button></div>
    </div>
    <div class="cutbox">
      <span class="cl">✂</span>
      <input class="cs" placeholder="начало 0:20" aria-label="Начало фрагмента"><button class="now" data-f="cs" title="Подставить текущий момент">⏱</button>
      <span class="dash">—</span>
      <input class="ce" placeholder="конец 0:45" aria-label="Конец фрагмента"><button class="now" data-f="ce" title="Подставить текущий момент">⏱</button>
      <button class="go mk-clip" title="Новая карточка с этим куском">Вырезать</button>
      <button class="go set-clip" title="Поменять границы этого фрагмента">Изменить</button>
      <button class="cx" title="Закрыть">✕</button>
      <span class="cerr"></span>
    </div>
    <div class="marks"><span class="chips"></span><button class="addm" title="Тайм-код: «1:23 Название» или пусто — текущий момент">＋ метка</button></div>
  </div>`;
  function nodeEl(n) {
    const el = document.createElement('div');
    el.className = 'mn ' + n.type;
    el.dataset.id = n.id;
    el.innerHTML = ({
      text: '<div class="clip"><div class="body"></div></div>',
      note: `<div class="clip"><div class="head">${ICON.note}<span class="ttl"></span></div><div class="body"></div></div>`,
      image: '<div class="clip"><img alt="" draggable="false"></div>',
      video: mediaHTML(n), mp4: mediaHTML(n),
    })[n.type] + ['t', 'r', 'b', 'l'].map(s => `<i class="mh" data-side="${s}" title="Тяни — путь"></i>`).join('') + '<i class="mr" title="Размер"></i>';
    if (n.type === 'video') {
      const f = el.querySelector('iframe');
      // просим плеер присылать время и состояние (повторяем: плеер готов не сразу)
      f.addEventListener('load', () => [0, 600, 1800].forEach(d => setTimeout(() =>
        f.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: n.id, channel: 'widget' }), '*'), d)));
      if (n.title === undefined) api.invoke('yt-title', n.vid).then(t => { if (t && !n.title) { n.title = t; fill(el, n); save(); } });
    }
    if (n.type === 'mp4') {
      const v = el.querySelector('video'), p = ps(n.id);
      v.addEventListener('loadedmetadata', () => { p.dur = v.duration; if (n.start) v.currentTime = n.start; updateBar(n); });
      v.addEventListener('timeupdate', () => { p.t = v.currentTime; keepInSpan(n); updateBar(n); }); // фрагмент — только свой кусок
      v.addEventListener('play', () => { p.playing = true; updateBar(n); });
      v.addEventListener('pause', () => { p.playing = false; updateBar(n); });
    }
    fill(el, n);
    return el;
  }
  // конец фрагмента держим сами (параметр end у YouTube после конца запускает видео с самого начала)
  const ytBase = n => `https://www.youtube-nocookie.com/embed/${n.vid}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&iv_load_policy=3`
    + (n.clean ? '&controls=0&disablekb=1&fs=0' : '');
  const ytSrc = (n, at = n.start, autoplay = false) => ytBase(n) + (at ? '&start=' + Math.floor(at) : '') + (autoplay ? '&autoplay=1' : '');
  const span = n => [n.start || 0, n.end || 0]; // границы фрагмента (end = 0 — всё видео)
  const media = src => api.mediaSrc ? api.mediaSrc(src) : src; // на телефоне картинки и видео — из памяти браузера
  function fill(el, n) {
    el.classList.toggle('clean', !!n.clean);
    if (n.type === 'text') {
      const body = el.querySelector('.body');
      if (editing !== n.id) body.textContent = n.text || '';
      Object.assign(body.style, { // оформление карточки: размер, выравнивание, жирный, курсив, шрифт
        fontSize: `calc(${n.fs || 14}px * var(--kt, 1))`, textAlign: n.align || 'left', fontWeight: n.bold ? 700 : 400,
        fontStyle: n.italic ? 'italic' : 'normal', fontFamily: (FONTS[n.font] || FONTS.sans)[1],
      });
    }
    if (n.type === 'note') {
      const note = getNotes().find(x => x.id === n.noteId);
      el.querySelector('.ttl').textContent = note ? nameOf(note) : 'Заметка удалена';
      el.querySelector('.body').textContent = note ? note.text.replace(/!\[[^\]\n]*\]\([^)\s]+\)/g, '🖼').slice(0, 500) : '';
      el.title = note ? 'Двойной клик — открыть заметку' : '';
    }
    if (n.type === 'image') el.querySelector('img').src = media(n.src);
    if (isMedia(n)) {
      const ttl = el.querySelector('.ttl');
      if (!ttl.isContentEditable) ttl.textContent = n.title || (n.type === 'video' ? 'YouTube' : 'Видео');
      if (n.type === 'video') {
        const f = el.querySelector('iframe'), p = ps(n.id);
        if (f.dataset.base !== ytBase(n)) { // перезагружаем плеер только если сменился вид — и продолжаем с того же места
          const resume = f.dataset.base && p.t > 1;
          f.dataset.base = ytBase(n);
          f.setAttribute('src', resume ? ytSrc(n, p.t, p.playing) : ytSrc(n));
        }
      }
      else { const v = el.querySelector('video'), src = media(n.src); if (v.getAttribute('src') !== src) v.setAttribute('src', src); v.controls = !n.clean; }
      el.querySelector('.chips').innerHTML = (n.marks || []).map((mk, i) =>
        `<span class="mk" data-i="${i}" title="Клик — перейти"><b>${fmt(mk.t)}</b>${esc(mk.label || '')}<i class="x" title="Убрать">×</i></span>`).join('');
      updateBar(n);
    }
  }
  const place = (el, n) => Object.assign(el.style, { left: n.x + 'px', top: n.y + 'px', width: n.w + 'px', height: n.h + 'px' });
  // перерисовать только изменившееся — иначе видео перезапускались бы при каждом движении
  function sync() {
    for (const [id, el] of els) if (!node(id)) { el.remove(); els.delete(id); players.delete(id); }
    for (const n of m.nodes) {
      let el = els.get(n.id);
      if (!el) { el = nodeEl(n); world.appendChild(el); els.set(n.id, el); }
      place(el, n);
      el.classList.toggle('sel', sel === n.id);
    }
    drawEdges();
    showFmt();
    showAct();
    emptyEl.textContent = m.nodes.length ? '' : 'Пустая карта. Двойной клик по полю — первая карточка, или кнопки сверху.';
  }

  // ---------- панель оформления над выделенной текстовой карточкой ----------
  function showFmt() {
    const n = sel && node(sel), el = n && els.get(n.id);
    if (!n || n.type !== 'text' || !el || !visible) return fmtEl.classList.remove('show');
    fmtEl.classList.add('show');
    fmtEl.querySelector('.fsz').textContent = n.fs || 14;
    for (const a of ['left', 'center', 'right']) fmtEl.querySelector(`[data-f="${a}"]`).classList.toggle('on', (n.align || 'left') === a);
    fmtEl.querySelector('[data-f="bold"]').classList.toggle('on', !!n.bold);
    fmtEl.querySelector('[data-f="italic"]').classList.toggle('on', !!n.italic);
    fmtEl.querySelector('.ffont').value = n.font || 'sans';
    const r = el.getBoundingClientRect(), box = root.getBoundingClientRect(), w = fmtEl.offsetWidth, h = fmtEl.offsetHeight;
    let top = r.top - box.top - h - 10;
    if (top < 54) top = r.bottom - box.top + 10; // сверху тесно (панель инструментов) — показываем под карточкой
    fmtEl.style.left = clamp(r.left - box.left + r.width / 2 - w / 2, 8, box.width - w - 8) + 'px';
    fmtEl.style.top = top + 'px';
  }
  fmtEl.addEventListener('pointerdown', e => { if (e.target.tagName !== 'SELECT') e.preventDefault(); }); // не сбивать редактирование текста
  fmtEl.addEventListener('click', e => {
    const b = e.target.closest('button'), n = sel && node(sel);
    if (!b || !n) return;
    const f = b.dataset.f, fs = n.fs || 14;
    if (f === 'inc') n.fs = Math.min(72, fs + (fs < 20 ? 2 : 4));
    if (f === 'dec') n.fs = Math.max(10, fs - (fs <= 20 ? 2 : 4));
    if (['left', 'center', 'right'].includes(f)) n.align = f;
    if (f === 'bold') n.bold = !n.bold;
    if (f === 'italic') n.italic = !n.italic;
    fill(els.get(n.id), n); showFmt(); save();
  });
  fmtEl.querySelector('.ffont').addEventListener('change', e => {
    const n = sel && node(sel);
    if (!n) return;
    n.font = e.target.value;
    fill(els.get(n.id), n); save();
  });

  // ---------- телефон: панель выбранной карточки (связать / изменить / удалить) — вместо мыши и клавиатуры ----------
  const actEl = q('.m-act');
  let delArmed = null, delArmT; // id карточки, удаление которой ждёт второго нажатия
  function showAct() {
    const n = sel && node(sel), edge = !n && sel && m.edges.some(e => e.id === sel);
    actEl.classList.toggle('show', visible && !!(n || edge || linkFrom));
    actEl.classList.toggle('linking', !!linkFrom);
    actEl.classList.toggle('edge', !!edge);
    stage.classList.toggle('linking', !!linkFrom);
    for (const [id, el] of els) el.classList.toggle('link-from', id === linkFrom);
    const del = actEl.querySelector('[data-m="del"]');
    const armed = !!sel && delArmed === sel;
    del.textContent = armed ? 'Точно удалить?' : edge ? '🗑 Удалить связь' : '🗑 Удалить';
    del.classList.toggle('armed', armed);
  }
  const disarm = () => { delArmed = null; clearTimeout(delArmT); };
  actEl.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); }); // не снимать выделение и не прятать клавиатуру
  actEl.addEventListener('click', e => {
    const a = e.target.closest('[data-m]')?.dataset.m, n = sel && node(sel);
    if (!a) return;
    if (a !== 'del') disarm();
    if (a === 'link' && n) linkFrom = n.id;
    if (a === 'cancel') linkFrom = null;
    if (a === 'edit' && n) {
      if (n.type === 'text') startEdit(n);
      else if (n.type === 'note') { if (getNotes().some(x => x.id === n.noteId)) openNote(n.noteId); }
      else editTitle(n);
    }
    if (a === 'del') {
      if (delArmed !== sel) { disarm(); delArmed = sel; delArmT = setTimeout(() => { delArmed = null; showAct(); }, 3000); } // удаление в два нажатия
      else { disarm(); deleteSel(); return; }
    }
    showAct();
  });
  // режим «Связать»: следующее нажатие на карточку — путь к ней; нажатие на пустое место — отмена
  function finishLink(targetId) {
    const from = linkFrom;
    linkFrom = null;
    if (targetId && targetId !== from && node(from) && !m.edges.some(x => x.from === from && x.to === targetId)) {
      m.edges.push({ id: crypto.randomUUID(), from, to: targetId });
      save();
    }
    sync();
  }

  // ---------- плеер: YouTube через postMessage, mp4 — напрямую ----------
  addEventListener('message', e => {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin)) return;
    let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch { return; }
    if (!d || !d.info) return;
    for (const [id, el] of els) {
      const f = el.querySelector('iframe');
      if (!f || f.contentWindow !== e.source) continue;
      const p = ps(id), i = d.info;
      if (typeof i.currentTime === 'number') p.t = i.currentTime;
      if (i.duration) p.dur = i.duration;
      if (typeof i.playerState === 'number') p.playing = i.playerState === 1;
      if (typeof i.muted === 'boolean') p.muted = i.muted;
      const n = node(id);
      if (n) { keepInSpan(n); updateBar(n); }
      break;
    }
  });
  // фрагмент — настоящая нарезка: дошёл до конца → пауза и снова начало; ушёл за границы → вернуть в начало
  function keepInSpan(n) {
    const [s, e] = span(n), p = ps(n.id);
    if (!e || !p.playing) return;
    if (p.t >= e) { ctl(n, 'pause'); ctl(n, 'seek', s); }
    else if (p.t < s - 1.5) ctl(n, 'seek', s);
  }
  function ctl(n, act, arg) {
    const el = els.get(n.id), p = ps(n.id);
    if (!el) return;
    const [s, e] = span(n);
    if (act === 'play' && e && (p.t >= e - 0.3 || p.t < s - 0.5)) ctl(n, 'seek', s); // ▶ в конце фрагмента — с его начала
    if (n.type === 'mp4') {
      const v = el.querySelector('video');
      if (act === 'play') v.play(); if (act === 'pause') v.pause(); if (act === 'seek') v.currentTime = arg;
      if (act === 'mute') { v.muted = !v.muted; p.muted = v.muted; updateBar(n); }
      return;
    }
    const cmd = (func, args = []) => el.querySelector('iframe').contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
    if (act === 'play') cmd('playVideo');
    if (act === 'pause') cmd('pauseVideo');
    if (act === 'seek') { cmd('seekTo', [arg, true]); p.t = arg; }
    if (act === 'mute') { cmd(p.muted ? 'unMute' : 'mute'); p.muted = !p.muted; updateBar(n); }
  }
  const now = n => ps(n.id).t || 0;
  function updateBar(n) {
    const el = els.get(n.id), p = ps(n.id);
    if (!el || !isMedia(n)) return;
    const bar = el.querySelector('.pbar');
    bar.querySelector('.pp').textContent = p.playing ? '❚❚' : '▶';
    bar.classList.toggle('paused', !p.playing);
    const [s, e] = span(n), len = e ? e - s : p.dur, pos = p.t - (e ? s : 0); // у фрагмента — своё время и полоска
    bar.querySelector('.tm').textContent = fmt(pos) + (len ? ' / ' + fmt(len) : '');
    bar.querySelector('.track i').style.width = (len ? clamp(pos / len * 100, 0, 100) : 0) + '%';
    el.querySelector('.pov').classList.toggle('paused', !p.playing);
    bar.querySelector('.mu').textContent = p.muted ? '🔇' : '🔊';
    el.querySelector('.cut').classList.toggle('armed', el.classList.contains('cutting'));
  }

  // ---------- пути ----------
  const anchor = (n, s) => s === 't' ? [n.x + n.w / 2, n.y] : s === 'b' ? [n.x + n.w / 2, n.y + n.h] : s === 'l' ? [n.x, n.y + n.h / 2] : [n.x + n.w, n.y + n.h / 2];
  function sides(a, b) {
    const dx = b.x + b.w / 2 - (a.x + a.w / 2), dy = b.y + b.h / 2 - (a.y + a.h / 2);
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? ['r', 'l'] : ['l', 'r']) : (dy > 0 ? ['b', 't'] : ['t', 'b']);
  }
  function curve([x1, y1], s1, [x2, y2], s2) {
    const d = Math.min(160, Math.hypot(x2 - x1, y2 - y1) / 2 + 20), [a1, b1] = NORM[s1], [a2, b2] = s2 ? NORM[s2] : [0, 0];
    return `M${x1} ${y1} C${x1 + a1 * d} ${y1 + b1 * d} ${x2 + a2 * d} ${y2 + b2 * d} ${x2} ${y2}`;
  }
  function drawEdges() {
    eg.innerHTML = m.edges.map(e => {
      const a = node(e.from), b = node(e.to);
      if (!a || !b) return '';
      const [s1, s2] = sides(a, b), d = curve(anchor(a, s1), s1, anchor(b, s2), s2);
      const ci = colorIdx(e);
      return `<path class="e${sel === e.id ? ' sel' : ''}" d="${d}" style="stroke:${ECOL[ci]}" marker-end="url(#m-arrow-${ci})"/><path class="hit" data-edge="${e.id}" d="${d}"/>`;
    }).join('');
    if (cutBtn.dataset.edge) showCut(cutBtn.dataset.edge); // путь мог сдвинуться
  }
  // посередине пути — палитра цвета ветки и ✕ (разорвать связь)
  let cutHide;
  function showCut(id) {
    const p = eg.querySelector(`.hit[data-edge="${id}"]`), edge = m.edges.find(x => x.id === id);
    if (!p || !edge) return hideCut(true);
    const pt = p.getPointAtLength(p.getTotalLength() / 2);
    Object.assign(cutBtn.style, { left: pt.x + 'px', top: pt.y + 'px' });
    cutBtn.dataset.edge = id;
    cutBtn.querySelectorAll('[data-c]').forEach(d => d.classList.toggle('on', +d.dataset.c === colorIdx(edge)));
    cutBtn.classList.add('show');
  }
  function hideCut(nowHide) {
    clearTimeout(cutHide);
    const go = () => { if (sel !== cutBtn.dataset.edge) { cutBtn.classList.remove('show'); delete cutBtn.dataset.edge; } };
    nowHide ? go() : (cutHide = setTimeout(go, 500));
  }
  eg.addEventListener('pointerover', e => { if (e.target.dataset.edge && !drag) { clearTimeout(cutHide); showCut(e.target.dataset.edge); } });
  eg.addEventListener('pointerout', e => { if (e.target.dataset.edge) hideCut(); });
  cutBtn.addEventListener('pointerenter', () => clearTimeout(cutHide));
  cutBtn.addEventListener('pointerleave', () => hideCut());
  cutBtn.addEventListener('pointerdown', e => e.stopPropagation());
  cutBtn.addEventListener('click', e => {
    const dot = e.target.closest('[data-c]'), edge = m.edges.find(x => x.id === cutBtn.dataset.edge);
    if (dot && edge) { edge.color = ECOL[+dot.dataset.c]; drawEdges(); save(); return; } // перекрасить ветку
    if (!e.target.closest('.e-cut')) return;
    m.edges = m.edges.filter(x => x.id !== cutBtn.dataset.edge);
    if (sel === cutBtn.dataset.edge) sel = null;
    delete cutBtn.dataset.edge;
    cutBtn.classList.remove('show');
    sync(); save();
  });

  // ---------- добавление ----------
  function addNode(type, props, at = center()) {
    const [w, h] = SIZE[type];
    const n = { id: crypto.randomUUID(), type, x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h, ...props };
    m.nodes.push(n);
    sel = n.id;
    sync(); save();
    return n;
  }
  function addImage(src, at) {
    const n = addNode('image', { src }, at), img = new Image(); // src — как записано; показываем через media()
    img.onload = () => { // пропорции как у картинки
      const w = clamp(img.naturalWidth, 160, 420);
      n.h = Math.round(w * img.naturalHeight / img.naturalWidth); n.w = w;
      sync(); save();
    };
    img.src = media(src);
  }
  const addMedia = (list, at = center()) => (list || []).forEach((it, i) => {
    const p = { x: at.x + i * 40, y: at.y + i * 40 };
    it.kind === 'video' ? addNode('mp4', { src: it.url, title: '' }, p) : addImage(it.url, p);
  });
  function startEdit(n) {
    const el = els.get(n.id), body = el && el.querySelector('.body');
    if (!body || n.type !== 'text') return;
    editing = n.id;
    body.contentEditable = 'plaintext-only';
    body.focus();
    const s = getSelection(); s.selectAllChildren(body); s.collapseToEnd();
    body.oninput = () => { n.text = body.innerText.replace(/\n$/, ''); save(); }; // сохраняем по ходу — не зависим от blur
    body.onblur = () => {
      n.text = body.innerText.replace(/\n$/, '');
      body.removeAttribute('contenteditable');
      body.onblur = body.oninput = null;
      editing = null;
      save();
    };
    body.onkeydown = e => { if (e.key === 'Escape') body.blur(); e.stopPropagation(); };
  }
  function editTitle(n) { // название видео — двойной клик по заголовку карточки
    const ttl = els.get(n.id).querySelector('.ttl');
    ttl.contentEditable = 'plaintext-only';
    ttl.focus();
    getSelection().selectAllChildren(ttl);
    ttl.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); ttl.blur(); } };
    ttl.onblur = () => { n.title = ttl.textContent.trim(); ttl.removeAttribute('contenteditable'); ttl.onblur = null; fill(els.get(n.id), n); save(); };
  }
  function addMark(n) { // «＋ метка»: поле для «1:23 Название»; пусто — текущий момент
    const box = els.get(n.id).querySelector('.marks'), btn = box.querySelector('.addm');
    const inp = document.createElement('input');
    inp.placeholder = `${fmt(now(n))} Название (или впиши своё время)`;
    btn.replaceWith(inp);
    inp.focus();
    let finished = false;
    const done = ok => {
      if (finished) return; // Enter сохраняет, а исчезающее поле шлёт ещё и blur — второй раз не добавляем
      finished = true;
      if (ok) {
        const tc = parseTc(inp.value);
        const mk = tc || { t: now(n), label: inp.value.trim() };
        n.marks = [...(n.marks || []), mk].sort((a, b) => a.t - b.t);
        save();
      }
      inp.replaceWith(btn);
      fill(els.get(n.id), n);
    };
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
    inp.onblur = () => done(!!inp.value.trim());
  }
  // ✂ — строка «начало — конец»: впиши время вручную (1:20, 1:02:03, 90) или подставь текущий момент кнопкой ⏱
  function openCut(n) {
    const el = els.get(n.id), box = el.querySelector('.cutbox'), [s, e] = span(n);
    el.classList.toggle('cutting');
    if (!el.classList.contains('cutting')) return;
    box.querySelector('.cs').value = e ? fmt(s) : fmt(now(n));
    box.querySelector('.ce').value = e ? fmt(e) : '';
    box.querySelector('.set-clip').style.display = e ? '' : 'none'; // «Изменить» — только у готового фрагмента
    box.querySelector('.cerr').textContent = '';
    box.querySelector(e ? '.cs' : '.ce').focus();
  }
  function applyCut(n, asNew) {
    const el = els.get(n.id), box = el.querySelector('.cutbox'), p = ps(n.id);
    const a = parseTc(box.querySelector('.cs').value), b = parseTc(box.querySelector('.ce').value);
    const err = msg => { box.querySelector('.cerr').textContent = msg; };
    if (!a || !b) return err('Впиши время, например 1:20');
    const s = a.t, e = b.t;
    if (e - s < 1) return err('Конец должен быть позже начала');
    if (p.dur && s >= p.dur) return err('Начало дальше конца видео (' + fmt(p.dur) + ')');
    el.classList.remove('cutting');
    updateBar(n); // снять подсветку ✂
    if (!asNew) { // поправить границы этого фрагмента
      n.start = s; n.end = e;
      if (/·\s*\d/.test(n.title || '')) n.title = n.title.replace(/·\s*[\d:]+–[\d:]+$/, `· ${fmt(s)}–${fmt(e)}`);
      fill(el, n); ctl(n, 'seek', s); save();
      return;
    }
    const base = (n.title || 'Фрагмент').replace(/\s*·\s*[\d:]+–[\d:]+$/, '');
    const clip = addNode(n.type, { vid: n.vid, src: n.src, start: s, end: e, clean: n.clean, marks: [],
      title: `${base} · ${fmt(s)}–${fmt(e)}` }, { x: n.x + n.w * 1.5 + 60, y: n.y + n.h / 2 });
    m.edges.push({ id: crypto.randomUUID(), from: n.id, to: clip.id });
    sync(); save();
  }
  function deleteSel() {
    if (!sel) return;
    if (node(sel)) { m.nodes = m.nodes.filter(n => n.id !== sel); m.edges = m.edges.filter(e => e.from !== sel && e.to !== sel); }
    else m.edges = m.edges.filter(e => e.id !== sel);
    sel = null;
    hideCut(true);
    sync(); save();
  }

  // ---------- мышь: двигать поле, карточки, размер, тянуть пути ----------
  // ---------- два пальца: щипок — масштаб, движение — сдвиг (телефон и сенсорный экран) ----------
  const touches = new Map();
  let pinchFrame = 0;
  const pinchOf = () => {
    const [a, b] = [...touches.values()], r = stage.getBoundingClientRect();
    return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, x: (a[0] + b[0]) / 2 - r.left, y: (a[1] + b[1]) / 2 - r.top };
  };
  stage.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (e.isPrimary) touches.clear(); // первый палец: всё прежнее — потерянные касания, иначе одно касание сочлось бы щипком
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size !== 2) return;
    const p = pinchOf();
    drag = { kind: 'pinch', d0: p.d, z0: m.view.zoom, wx: (p.x - m.view.x) / m.view.zoom, wy: (p.y - m.view.y) / m.view.zoom };
    stage.classList.add('busy'); // карта — отдельный слой видеокарты, пока пальцы на ней
    e.stopImmediatePropagation(); // вторым пальцем не тащим карточку
    try { stage.setPointerCapture(e.pointerId); } catch {}
  }, true);
  stage.addEventListener('pointermove', e => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (drag?.kind !== 'pinch' || touches.size < 2) return;
    const p = pinchOf(), z = clamp(drag.z0 * p.d / drag.d0, 0.2, 3);
    m.view.zoom = z; m.view.x = p.x - drag.wx * z; m.view.y = p.y - drag.wy * z; // точка между пальцами остаётся под пальцами
    if (!pinchFrame) pinchFrame = requestAnimationFrame(() => { pinchFrame = 0; applyView(true); }); // не чаще кадра экрана
    fmtEl.classList.remove('show');
    e.stopImmediatePropagation();
  }, true);
  const touchEnd = e => {
    if (!touches.delete(e.pointerId) || drag?.kind !== 'pinch') return;
    if (touches.size < 2) { drag = null; cancelAnimationFrame(pinchFrame); pinchFrame = 0; applyView(); stage.classList.remove('busy', 'panning'); save(); }
    e.stopImmediatePropagation();
  };
  stage.addEventListener('pointerup', touchEnd, true);
  stage.addEventListener('pointercancel', touchEnd, true);
  // браузер всё же отобрал касание (системный жест) — закончить перетаскивание как есть, а не оставить «залипшим»
  stage.addEventListener('pointercancel', () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('busy', 'panning');
    tmp.style.display = 'none';
    if (d.moved) save();
  });
  stage.addEventListener('contextmenu', e => { if (!e.target.closest('[contenteditable], input')) e.preventDefault(); });
  stage.addEventListener('dragstart', e => e.preventDefault());

  let lastPointer = 'mouse';
  stage.addEventListener('pointerdown', e => {
    closePop();
    lastPointer = e.pointerType;
    const t = e.target, at = toWorld(e.clientX, e.clientY);
    if (t.dataset && t.dataset.edge) { sel = t.dataset.edge; sync(); showCut(sel); return; }
    const nEl = t.closest('.mn');
    if (!nEl || e.button === 1) {
      if (editing) { // закончить правку текста, даже если фокус уже ушёл (на телефоне — спрятали клавиатуру)
        const b = els.get(editing)?.querySelector('.body');
        if (b && b.onblur) b.onblur();
        document.activeElement.blur();
      }
      drag = { kind: 'pan', x: e.clientX, y: e.clientY, moved: false };
      stage.classList.add('panning');
    } else {
      const n = node(nEl.dataset.id);
      if (sel !== n.id) { sel = n.id; sync(); }
      // кнопки, панель плеера, метки, поля ввода и само видео — не тащат карточку
      if (t.closest('button, input, select, .pbar, .marks, .cutbox, .m-fmt, .pov, .player iframe, .player video, [contenteditable]')) return;
      if (t.classList.contains('mh')) drag = { kind: 'link', from: n, side: t.dataset.side, start: at };
      else if (t.classList.contains('mr')) drag = { kind: 'size', n, x: e.clientX, y: e.clientY, w: n.w, h: n.h };
      else drag = { kind: 'move', n, x: e.clientX, y: e.clientY, nx: n.x, ny: n.y };
    }
    drag.moved = false;
    e.preventDefault(); // не начинать выделение текста (синяя заливка при растягивании)
    getSelection().removeAllRanges();
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('busy');
  });
  stage.addEventListener('pointermove', e => {
    if (!drag) return;
    const z = m.view.zoom;
    if (drag.kind === 'pan') {
      if (e.clientX !== drag.x || e.clientY !== drag.y) drag.moved = true;
      m.view.x += e.clientX - drag.x; m.view.y += e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      applyView();
    } else if (drag.kind === 'move') {
      drag.n.x = Math.round(drag.nx + (e.clientX - drag.x) / z); drag.n.y = Math.round(drag.ny + (e.clientY - drag.y) / z);
      drag.moved = true;
      place(els.get(drag.n.id), drag.n); drawEdges(); showFmt();
    } else if (drag.kind === 'size') {
      drag.n.w = Math.round(Math.max(160, drag.w + (e.clientX - drag.x) / z)); drag.n.h = Math.round(Math.max(60, drag.h + (e.clientY - drag.y) / z));
      drag.moved = true;
      place(els.get(drag.n.id), drag.n); drawEdges(); showFmt();
    } else if (drag.kind === 'link') {
      const p = toWorld(e.clientX, e.clientY);
      drag.moved = Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 12;
      tmp.style.display = '';
      tmp.setAttribute('d', curve(anchor(drag.from, drag.side), drag.side, [p.x, p.y]));
    }
  });
  stage.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag;
    drag = null;
    stage.classList.remove('busy', 'panning');
    tmp.style.display = 'none';
    if (linkFrom && !d.moved && d.kind !== 'link') return finishLink(d.n && d.n.id); // режим «Связать»: нажал на карточку или мимо
    if (d.kind === 'pan' && !d.moved) { sel = null; disarm(); hideCut(true); sync(); }
    if (d.kind === 'link' && d.moved) {
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.mn');
      if (target && target.dataset.id !== d.from.id) {
        if (!m.edges.some(x => x.from === d.from.id && x.to === target.dataset.id)) m.edges.push({ id: crypto.randomUUID(), from: d.from.id, to: target.dataset.id });
      } else if (!target) { // путь в пустоту — там рождается новая карточка
        const n = addNode('text', { text: '' }, toWorld(e.clientX, e.clientY));
        m.edges.push({ id: crypto.randomUUID(), from: d.from.id, to: n.id });
        sync();
        startEdit(n);
      }
      sync();
    }
    if (d.kind !== 'pan' || d.moved) save();
  });
  // После перетаскивания холст держит «захват» мыши, и клики приходят ему, а не карточке —
  // поэтому настоящую цель ищем по точке под курсором
  const realTarget = e => (e.target === stage || e.target === world) && (e.clientX || e.clientY)
    ? document.elementFromPoint(e.clientX, e.clientY) || e.target : e.target;
  // клики внутри карточек: плеер, метки, фрагменты
  stage.addEventListener('click', e => {
    const t = realTarget(e), nEl = t.closest('.mn');
    if (!nEl) return;
    const n = node(nEl.dataset.id);
    if (!n || !isMedia(n)) return;
    const p = ps(n.id);
    if (t.closest('.pov') || t.closest('.pp')) ctl(n, p.playing ? 'pause' : 'play');
    else if (t.closest('.mu')) ctl(n, 'mute');
    else if (t.closest('.fs')) nEl.querySelector('.player').requestFullscreen?.();
    else if (t.closest('.track')) {
      const r = t.closest('.track').getBoundingClientRect(), [s, en] = span(n), len = en ? en - s : p.dur;
      if (len) ctl(n, 'seek', (en ? s : 0) + clamp((e.clientX - r.left) / r.width, 0, 1) * len);
    }
    else if (t.closest('.eye')) { n.clean = !n.clean; fill(nEl, n); save(); }
    else if (t.closest('.cut')) { openCut(n); updateBar(n); }
    else if (t.closest('.cutbox .now')) { const b = t.closest('.now'); nEl.querySelector('.' + b.dataset.f).value = fmt(now(n)); }
    else if (t.closest('.mk-clip')) applyCut(n, true);
    else if (t.closest('.set-clip')) applyCut(n, false);
    else if (t.closest('.cutbox .cx')) { nEl.classList.remove('cutting'); updateBar(n); }
    else if (t.closest('.addm')) addMark(n);
    else if (t.closest('.mk .x')) { n.marks.splice(+t.closest('.mk').dataset.i, 1); fill(nEl, n); save(); }
    else if (t.closest('.mk')) { ctl(n, 'seek', n.marks[+t.closest('.mk').dataset.i].t); ctl(n, 'play'); }
  });
  stage.addEventListener('dblclick', e => {
    const t = realTarget(e), nEl = t.closest('.mn');
    if (!nEl) { startEdit(addNode('text', { text: '' }, toWorld(e.clientX, e.clientY))); return; }
    // пальцем «нажал, отпустил и сразу потянул» — это двойное касание; на телефоне правка — кнопкой «✎ Изменить», а не так
    if (lastPointer === 'touch') return;
    const n = node(nEl.dataset.id);
    if (t.closest('.marks, .pbar, .cutbox, button')) return;
    if (n.type === 'text') startEdit(n);
    if (isMedia(n) && t.closest('.head')) editTitle(n);
    if (n.type === 'note' && getNotes().some(x => x.id === n.noteId)) openNote(n.noteId);
  });
  stage.addEventListener('keydown', e => { // Enter в строке фрагмента — вырезать (у готового фрагмента — поправить его)
    const box = e.target.closest('.cutbox'), nEl = e.target.closest('.mn');
    if (!box || !nEl) return;
    const n = node(nEl.dataset.id);
    if (e.key === 'Enter') applyCut(n, !span(n)[1]);
    if (e.key === 'Escape') { nEl.classList.remove('cutting'); updateBar(n); }
  });
  stage.addEventListener('wheel', e => {
    if (editing && e.target.closest('[contenteditable]')) return;
    if (e.target.closest('.marks')) return; // метки листаются вбок
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY), z = clamp(m.view.zoom * Math.exp(-e.deltaY * 0.0015), 0.2, 3), r = stage.getBoundingClientRect();
    m.view.x = e.clientX - r.left - p.x * z; m.view.y = e.clientY - r.top - p.y * z; m.view.zoom = z; // масштаб вокруг курсора
    applyView(); save();
  }, { passive: false });

  // ---------- клавиатура, вставка, перетаскивание файлов ----------
  const typing = t => editing || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.isContentEditable;
  document.addEventListener('keydown', e => {
    if (!visible || typing(e.target)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); }
    if (e.key === 'Escape') { closePop(); sel = null; hideCut(true); sync(); }
  });
  document.addEventListener('paste', async e => {
    if (!visible || typing(e.target)) return;
    const files = [...e.clipboardData.files].filter(f => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      for (const f of files) {
        const ext = '.' + (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/\+.*/, '');
        const url = await api.invoke('media-paste', { bytes: new Uint8Array(await f.arrayBuffer()), ext });
        if (url) addImage(url);
      }
      return;
    }
    const text = e.clipboardData.getData('text').trim();
    if (!text) return;
    e.preventDefault();
    const vid = ytId(text);
    vid ? addNode('video', { vid }) : addNode('text', { text });
  });
  stage.addEventListener('dragover', e => e.preventDefault());
  stage.addEventListener('drop', async e => {
    e.preventDefault();
    const at = toWorld(e.clientX, e.clientY);
    const paths = [...e.dataTransfer.files].map(f => api.pathForFile ? api.pathForFile(f) : '').filter(Boolean);
    if (paths.length) return addMedia(await api.invoke('media-import', paths), at);
    const vid = ytId(e.dataTransfer.getData('text'));
    if (vid) addNode('video', { vid }, at);
  });

  // ---------- панель: карты и добавление ----------
  function closePop() { popEl.classList.remove('show'); }
  function openPop(btn, html, init) {
    popEl.innerHTML = html;
    popEl.style.left = Math.min(btn.offsetLeft + 12, root.clientWidth - 340) + 'px';
    popEl.style.top = '50px';
    popEl.classList.add('show');
    init(popEl);
  }
  function fillSelect() {
    selEl.innerHTML = maps.map(x => `<option value="${esc(x.id)}" ${x === m ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  }
  function newMap(name) {
    const r = stage.getBoundingClientRect();
    const map = { id: crypto.randomUUID(), name, nodes: [], edges: [], view: { x: r.width / 2 || 400, y: r.height / 2 || 300, zoom: 1 } };
    maps.push(map);
    return map;
  }
  function openMap(map) {
    m = map;
    sel = null; linkFrom = null;
    hideCut(true);
    for (const el of els.values()) el.remove();
    els.clear(); players.clear();
    try { localStorage.setItem('map', m.id); } catch {}
    fillSelect(); applyView(); sync();
  }
  selEl.onchange = () => openMap(maps.find(x => x.id === selEl.value));
  let delArm;
  q('.m-tools').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const act = b.dataset.act, add = b.dataset.add;
    if (act === 'new') { openMap(newMap('Карта ' + (maps.length + 1))); save(); }
    if (act === 'rename') openPop(b, `<input class="field" value="${esc(m.name)}" maxlength="60" aria-label="Название карты">`, p => {
      const inp = p.querySelector('input');
      inp.focus(); inp.select();
      inp.onkeydown = ev => { if (ev.key === 'Enter' && inp.value.trim()) { m.name = inp.value.trim(); fillSelect(); save(); closePop(); } if (ev.key === 'Escape') closePop(); };
    });
    if (act === 'del') {
      if (!b.classList.contains('armed')) { b.classList.add('armed'); b.textContent = 'Удалить карту?'; clearTimeout(delArm); delArm = setTimeout(() => { b.classList.remove('armed'); b.textContent = '🗑'; }, 3000); return; }
      b.classList.remove('armed'); b.textContent = '🗑';
      maps = maps.filter(x => x !== m);
      if (!maps.length) newMap('Моя карта');
      openMap(maps[0]); save();
    }
    if (add === 'text') startEdit(addNode('text', { text: '' }));
    if (add === 'image') addMedia(await api.invoke('media-pick', 'image'));
    if (add === 'mp4') addMedia(await api.invoke('media-pick', 'video'));
    if (add === 'video') openPop(b, `<input class="field" placeholder="Ссылка на видео YouTube" aria-label="Ссылка на видео YouTube"><div class="err"></div>`, p => {
      const inp = p.querySelector('input');
      inp.focus();
      inp.onkeydown = ev => {
        if (ev.key === 'Escape') return closePop();
        if (ev.key !== 'Enter') return;
        const vid = ytId(inp.value);
        if (!vid) { p.querySelector('.err').textContent = 'Не похоже на ссылку YouTube'; return; }
        addNode('video', { vid }); closePop();
      };
    });
    if (add === 'note') openPop(b, `<input class="field" placeholder="Найти заметку" aria-label="Найти заметку"><div class="pick"></div>`, p => {
      const inp = p.querySelector('input'), list = p.querySelector('.pick');
      const draw = () => {
        const s = inp.value.trim().toLowerCase();
        list.innerHTML = getNotes().filter(n => nameOf(n).toLowerCase().includes(s)).slice(0, 40)
          .map(n => `<div data-id="${esc(n.id)}">${esc(nameOf(n))}</div>`).join('') || '<div style="opacity:.5">Нет заметок</div>';
      };
      inp.oninput = draw; draw(); inp.focus();
      inp.onkeydown = ev => { if (ev.key === 'Escape') closePop(); };
      list.onclick = ev => { const d = ev.target.closest('[data-id]'); if (d) { addNode('note', { noteId: d.dataset.id }); closePop(); } };
    });
  });

  let ready = null; // первая загрузка карт — одна на все вызовы show()
  return {
    async show() {
      visible = true;
      if (!ready) {
        ready = (async () => {
          maps = await api.invoke('maps-list') || [];
          if (!maps.length) { newMap('Моя карта'); save(); }
          let last; try { last = localStorage.getItem('map'); } catch {}
          openMap(maps.find(x => x.id === last) || maps[0]);
        })();
        return ready;
      }
      await ready;
      for (const n of m.nodes) if (n.type === 'note' && els.get(n.id)) fill(els.get(n.id), n); // заметки могли измениться
      sync();
    },
    // положить заметки на текущую карту (кнопка «На карту» в заметке или 🗺 у группы); уже лежащие — не дублируются
    addNotes(ids) {
      const c = center(), fresh = ids.filter(id => !m.nodes.some(n => n.type === 'note' && n.noteId === id));
      const cols = Math.ceil(Math.sqrt(fresh.length)), [w, h] = SIZE.note;
      const spots = dy => fresh.map((_, i) => ({ x: c.x + (i % cols - (cols - 1) / 2) * 310, y: c.y + dy + (Math.floor(i / cols) - (Math.ceil(fresh.length / cols) - 1) / 2) * 220 }));
      const busy = p => m.nodes.some(n => p.x - w / 2 < n.x + n.w + 20 && p.x + w / 2 > n.x - 20 && p.y - h / 2 < n.y + n.h + 20 && p.y + h / 2 > n.y - 20);
      let dy = 0; // ищем свободное место ниже, чтобы не класть карточки поверх уже лежащих
      for (let k = 0; k < 40 && spots(dy).some(busy); k++) dy += 120;
      const added = spots(dy).map((p, i) => addNode('note', { noteId: fresh[i] }, p));
      const show = added.length ? added : m.nodes.filter(n => n.type === 'note' && ids.includes(n.noteId));
      if (!show.length) return;
      sel = show[show.length - 1].id;
      // подвинуть вид, чтобы новые карточки были в центре
      const x1 = Math.min(...show.map(n => n.x)), x2 = Math.max(...show.map(n => n.x + n.w));
      const y1 = Math.min(...show.map(n => n.y)), y2 = Math.max(...show.map(n => n.y + n.h)), r = stage.getBoundingClientRect();
      m.view.x = r.width / 2 - (x1 + x2) / 2 * m.view.zoom;
      m.view.y = r.height / 2 + 20 - (y1 + y2) / 2 * m.view.zoom;
      applyView(); sync(); save();
    },
    hide() {
      visible = false;
      closePop();
      fmtEl.classList.remove('show');
      linkFrom = null; actEl.classList.remove('show');
      for (const n of m ? m.nodes : []) if (isMedia(n) && ps(n.id).playing) ctl(n, 'pause'); // ушёл с карты — видео на паузу
    },
  };
}
