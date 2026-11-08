// Граф связей заметок, четыре вида:
//  «2D»        — как в Obsidian: узлы отталкиваются, связи притягивают;
//  «3D»        — то же в объёме, медленно вращается, тянется мышью;
//  «Кольцо»    — заметки по кругу, связи — цветные дуги через середину (видно, кто с кем связан);
//  «Галактика» — группы связанных заметок = галактики с туманностями, звёзды кружат вокруг главной заметки.
// Свой мини-движок на <canvas>, без библиотек.

function initGraph(root, { getData, onOpen }) {
  root.innerHTML = `<div class="gview">
    <canvas></canvas>
    <div class="g-tools"><div class="seg">
      <button data-m="2d" class="on">2D</button><button data-m="3d">3D</button><button data-m="ring">Кольцо</button><button data-m="galaxy">Галактика</button>
    </div></div>
    <div class="g-tip glass-pop"></div>
    <div class="g-hint"></div>
  </div>`;
  const box = root.firstElementChild, cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
  const tip = box.querySelector('.g-tip'), hint = box.querySelector('.g-hint');
  const HINTS = {
    '2d': 'Колесо — масштаб · тяни фон — двигать · тяни узел — переставить · клик — открыть заметку',
    '3d': 'Тяни — вращать · колесо — масштаб · клик — открыть заметку',
    ring: 'Наведи на заметку — её связи · тяни — повернуть кольцо · колесо — масштаб · клик — открыть',
    galaxy: 'Наведи на звезду — её связи · тяни — двигать · колесо — масштаб · клик — открыть заметку',
  };
  let mode = '2d', nodes = [], edges = [], byId = new Map(), nbr = new Map(), clusters = [];
  let W = 0, H = 0, dpr = 1, running = false, alpha = 1, t = 0, ringRot = 0;
  const cam = { x: 0, y: 0, zoom: 1, rx: -0.35, ry: 0 };
  let hover = null, drag = null, lastP = new Map();
  const GOLD = 2.39996; // золотой угол — равномерная «спираль» без пустот

  // ---------- данные ----------
  function load() {
    const d = getData(), old = byId;
    byId = new Map();
    nodes = d.nodes.map(n => {
      const o = old.get(n.id);
      const p = o || { x: (Math.random() - .5) * 200, y: (Math.random() - .5) * 200, z: (Math.random() - .5) * 200, vx: 0, vy: 0, vz: 0 };
      const node = Object.assign(p, n, { deg: 0 });
      byId.set(n.id, node);
      return node;
    });
    const seen = new Set();
    edges = [];
    for (const e of d.edges) {
      const k = [e.a, e.b].sort().join('|');
      if (seen.has(k) || !byId.has(e.a) || !byId.has(e.b)) continue;
      seen.add(k);
      edges.push({ a: byId.get(e.a), b: byId.get(e.b) });
    }
    nbr = new Map(nodes.map(n => [n, new Set()]));
    for (const e of edges) { e.a.deg++; e.b.deg++; nbr.get(e.a).add(e.b); nbr.get(e.b).add(e.a); }
    groups();
    alpha = 1;
  }
  // группы связанных заметок (обход по связям; главная — с наибольшим числом связей); одиночки — в одно «облако»
  function groups() {
    const left = new Set(nodes), list = [], solo = [];
    while (left.size) {
      const start = [...left].sort((a, b) => b.deg - a.deg)[0], queue = [start], g = [];
      left.delete(start);
      while (queue.length) {
        const n = queue.shift(); g.push(n);
        for (const m of [...nbr.get(n)].sort((a, b) => b.deg - a.deg)) if (left.has(m)) { left.delete(m); queue.push(m); }
      }
      g.length > 1 ? list.push(g) : solo.push(g[0]);
    }
    list.sort((a, b) => b.length - a.length);
    if (solo.length) list.push(solo);
    let ord = 0, reach = 0;
    const big = list[0] ? 55 + 48 * Math.sqrt(list[0].length) : 100; // размер самой большой галактики
    clusters = list.map((g, ci) => {
      const c = { nodes: g, hue: 200 + (ci * 53) % 140, solo: g === solo, tilt: (ci * 0.9) % Math.PI };
      const ang = ci * GOLD, dist = (big + 220) * Math.sqrt(ci); // галактики по золотой спирали, не налезая друг на друга
      c.cx = Math.cos(ang) * dist; c.cy = Math.sin(ang) * dist * .8;
      g.forEach((n, j) => {
        n.ord = ord++; n.cl = c; n.hue = c.hue + (j * 7) % 30;
        n.orb = c.solo ? 60 + 34 * Math.sqrt(j + 1) : j ? 55 + 48 * Math.sqrt(j) : 0; // радиус орбиты (главная — в центре)
        n.a0 = j * GOLD;
        n.sp = 0.0032 * 90 / (n.orb + 60); // ближние кружат быстрее
      });
      c.size = Math.max(...g.map(n => n.orb)) + 40;
      reach = Math.max(reach, Math.abs(c.cx) + c.size, Math.abs(c.cy) + c.size);
      return c;
    });
    galaxyReach = reach;
  }
  let galaxyReach = 400, fit = false; // насколько далеко простирается вся картина — для начального масштаба

  // ---------- физика для 2D/3D: узлы отталкиваются, связи притягивают ----------
  function step() {
    if (alpha < 0.005) return;
    const flat = mode === '2d';
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y, dz = flat ? 0 : a.z - b.z;
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        if (d2 > 250000) continue;
        const f = 500 * alpha / d2;
        a.vx += dx * f; a.vy += dy * f; a.vz += dz * f;
        b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
      }
    }
    for (const { a, b } of edges) {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, f = (d - 70) * 0.012 * alpha / d;
      a.vx += dx * f; a.vy += dy * f; a.vz += dz * f;
      b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
    }
    for (const n of nodes) {
      if (drag && drag.node === n) { n.vx = n.vy = n.vz = 0; continue; }
      n.vx -= n.x * 0.006 * alpha; n.vy -= n.y * 0.006 * alpha; n.vz -= n.z * 0.006 * alpha;
      n.vx *= 0.82; n.vy *= 0.82; n.vz *= 0.82;
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
      if (flat) n.z *= 0.85; // в 2D плавно «сплющиваем» глубину
    }
    alpha *= 0.992;
  }
  function project(n) {
    if (mode === '2d') return { x: W / 2 + cam.x + n.x * cam.zoom, y: H / 2 + cam.y + n.y * cam.zoom, s: 1, z: 0 };
    const cy = Math.cos(cam.ry), sy = Math.sin(cam.ry), cx = Math.cos(cam.rx), sx = Math.sin(cam.rx);
    const x1 = n.x * cy + n.z * sy, z1 = -n.x * sy + n.z * cy;
    const y1 = n.y * cx - z1 * sx, z2 = n.y * sx + z1 * cx;
    const f = 700 / (700 + z2);
    return { x: W / 2 + cam.x + x1 * f * cam.zoom, y: H / 2 + cam.y + y1 * f * cam.zoom, s: f, z: z2 };
  }
  const radius = n => 4 + Math.sqrt(n.deg) * 2.4;
  const lit = n => !hover || n === hover || nbr.get(hover)?.has(n);
  const short = (s, k) => s.length > k ? s.slice(0, k - 1) + '…' : s;

  // ---------- 2D / 3D ----------
  const stars = Array.from({ length: 140 }, () => [Math.random(), Math.random(), Math.random() * 1.2 + .2]);
  function drawGraph() {
    if (mode === '3d') {
      for (const [sx, sy, r] of stars) {
        ctx.fillStyle = `rgba(200,210,255,${0.08 + r * 0.12})`;
        ctx.beginPath(); ctx.arc(((sx * W + cam.ry * 40) % W + W) % W, sy * H, r, 0, 7); ctx.fill();
      }
    }
    const P = new Map(nodes.map(n => [n, project(n)]));
    const order = edges.map(e => ({ e, z: (P.get(e.a).z + P.get(e.b).z) / 2 })).sort((p, q) => q.z - p.z);
    for (const { e } of order) {
      const a = P.get(e.a), b = P.get(e.b), on = hover && (e.a === hover || e.b === hover);
      const depth = mode === '3d' ? Math.min(1, Math.max(.25, (a.s + b.s) / 2 - .3)) : 1;
      ctx.strokeStyle = on ? 'rgba(124,200,255,.95)' : `rgba(150,160,255,${(hover ? .08 : .28) * depth})`;
      ctx.lineWidth = on ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    const sorted = [...nodes].sort((p, q) => P.get(q).z - P.get(p).z);
    for (const n of sorted) {
      const p = P.get(n), r = radius(n) * p.s * Math.sqrt(cam.zoom), on = lit(n);
      const g = ctx.createRadialGradient(p.x - r / 3, p.y - r / 3, 0, p.x, p.y, r);
      if (n.ghost) { g.addColorStop(0, 'rgba(200,200,220,.6)'); g.addColorStop(1, 'rgba(120,120,140,.5)'); }
      else { g.addColorStop(0, '#d8f0ff'); g.addColorStop(.5, '#7cc8ff'); g.addColorStop(1, '#8a6dff'); }
      ctx.globalAlpha = on ? (mode === '3d' ? Math.min(1, Math.max(.3, p.s - .2)) : 1) : .15;
      if (n === hover) { ctx.shadowColor = '#7cc8ff'; ctx.shadowBlur = 22; }
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(r, 1.5), 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      if (on && (hover || nodes.length < 60 || cam.zoom * p.s > 1.1 || n.deg >= 3)) {
        ctx.fillStyle = n.ghost ? 'rgba(220,220,235,.6)' : 'rgba(235,240,255,.92)';
        ctx.font = `${Math.round(12 * Math.max(.8, Math.min(1.3, p.s * cam.zoom)))}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(short(n.name, 28), p.x, p.y + r + 14);
      }
      ctx.globalAlpha = 1;
    }
    return P;
  }

  // ---------- «Кольцо» ----------
  function drawRing() {
    if (!drag) ringRot += 0.0007; // медленно вращается
    const N = nodes.length, R = Math.min(W, H) * .34 * cam.zoom, cx = W / 2 + cam.x, cy = H / 2 + cam.y;
    const P = new Map();
    for (const n of nodes) {
      const a = n.ord / N * Math.PI * 2 + ringRot - Math.PI / 2;
      P.set(n, { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a, s: 1 });
    }
    // мягкое свечение в центре
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
    glow.addColorStop(0, 'rgba(110,90,255,.10)'); glow.addColorStop(1, 'rgba(110,90,255,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.1, 0, 7); ctx.fill();
    // дуги групп по внешнему краю
    for (const c of clusters) {
      if (c.solo || c.nodes.length < 2) continue;
      const as = c.nodes.map(n => P.get(n).a), a1 = Math.min(...as) - .03, a2 = Math.max(...as) + .03;
      ctx.strokeStyle = `hsla(${c.hue},90%,65%,.45)`; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, R + 16, a1, a2); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.globalCompositeOperation = 'lighter';
    edges.forEach((e, k) => { // связи — изогнутые дуги через середину, цвет перетекает от одной заметки к другой
      const a = P.get(e.a), b = P.get(e.b), on = hover && (e.a === hover || e.b === hover);
      const mx = cx + ((a.x + b.x) / 2 - cx) * .18, my = cy + ((a.y + b.y) / 2 - cy) * .18;
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      const al = on ? .95 : hover ? .05 : .42;
      g.addColorStop(0, `hsla(${e.a.hue},95%,66%,${al})`); g.addColorStop(1, `hsla(${e.b.hue},95%,66%,${al})`);
      ctx.strokeStyle = g; ctx.lineWidth = on ? 2.4 : 1.3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(mx, my, b.x, b.y); ctx.stroke();
      if (on) { // огонёк бежит по связи
        const u = (t * 0.012 + k * .3) % 1, v = 1 - u;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(v * v * a.x + 2 * v * u * mx + u * u * b.x, v * v * a.y + 2 * v * u * my + u * u * b.y, 2.4, 0, 7); ctx.fill();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    const showAll = N <= 120;
    for (const n of nodes) {
      const p = P.get(n), on = lit(n), r = (3 + Math.sqrt(n.deg) * 1.6) * Math.sqrt(cam.zoom);
      ctx.globalAlpha = on ? 1 : .2;
      ctx.fillStyle = n.ghost ? 'rgba(200,200,220,.7)' : `hsl(${n.hue},95%,70%)`;
      if (n === hover) { ctx.shadowColor = `hsl(${n.hue},95%,70%)`; ctx.shadowBlur = 18; }
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      if (showAll || (hover && on)) { // подпись наружу, вдоль радиуса
        const flip = Math.cos(p.a) < 0;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(flip ? p.a + Math.PI : p.a);
        ctx.textAlign = flip ? 'right' : 'left';
        ctx.font = `${n === hover ? 600 : 400} 12px "Segoe UI", sans-serif`;
        ctx.fillStyle = n === hover ? '#fff' : n.ghost ? 'rgba(220,220,235,.55)' : 'rgba(235,240,255,.85)';
        ctx.fillText(short(n.name, 22), flip ? -r - 8 : r + 8, 4);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    return P;
  }

  // ---------- «Галактика» ----------
  function galPos(n) {
    const c = n.cl, a = n.a0 + t * n.sp;
    const ox = Math.cos(a) * n.orb, oy = Math.sin(a) * n.orb * .55; // диск, видимый под углом
    const x = c.cx + ox * Math.cos(c.tilt) - oy * Math.sin(c.tilt), y = c.cy + ox * Math.sin(c.tilt) + oy * Math.cos(c.tilt);
    return { x: W / 2 + cam.x + x * cam.zoom, y: H / 2 + cam.y + y * cam.zoom, s: 1 };
  }
  function drawGalaxy() {
    stars.forEach(([sx, sy, r], i) => { // мерцающие звёзды фона
      ctx.fillStyle = `rgba(210,220,255,${(.06 + r * .12) * (.6 + .4 * Math.sin(t * .03 + i))})`;
      ctx.beginPath(); ctx.arc(((sx * W + cam.x * .15) % W + W) % W, ((sy * H + cam.y * .15) % H + H) % H, r * .9, 0, 7); ctx.fill();
    });
    const z = cam.zoom;
    ctx.globalCompositeOperation = 'lighter';
    for (const c of clusters) { // туманности и орбиты
      const x = W / 2 + cam.x + c.cx * z, y = H / 2 + cam.y + c.cy * z, R = c.size * z * 1.5;
      for (const [dx, dy, k, h, a] of [[0, 0, 1, 0, c.solo ? .07 : .2], [R * .25, -R * .15, .6, 40, .12]]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, R * k);
        g.addColorStop(0, `hsla(${c.hue + h},85%,60%,${a})`); g.addColorStop(1, `hsla(${c.hue + h},85%,50%,0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + dx, y + dy, R * k, 0, 7); ctx.fill();
      }
      if (c.solo) continue;
      ctx.strokeStyle = `hsla(${c.hue},80%,75%,.06)`; ctx.lineWidth = 1;
      for (const n of c.nodes) if (n.orb) { ctx.beginPath(); ctx.ellipse(x, y, n.orb * z, n.orb * .55 * z, c.tilt, 0, 7); ctx.stroke(); }
    }
    const P = new Map(nodes.map(n => [n, galPos(n)]));
    for (const e of edges) {
      const a = P.get(e.a), b = P.get(e.b), on = hover && (e.a === hover || e.b === hover);
      ctx.strokeStyle = on ? 'rgba(150,215,255,.9)' : `hsla(${e.a.hue},80%,75%,${hover ? .04 : .2})`;
      ctx.lineWidth = on ? 1.8 : 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      if (e.a.cl === e.b.cl) ctx.lineTo(b.x, b.y);
      else ctx.quadraticCurveTo((a.x + b.x) / 2 + (b.y - a.y) * .2, (a.y + b.y) / 2 - (b.x - a.x) * .2, b.x, b.y); // между галактиками — дугой
      ctx.stroke();
    }
    for (const n of nodes) { // звёзды
      const p = P.get(n), on = lit(n), core = !n.orb && !n.cl.solo;
      const r = (core ? 7 : 2.4 + Math.sqrt(n.deg) * 1.6) * Math.sqrt(z), tw = .85 + .15 * Math.sin(t * .08 + n.ord);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
      g.addColorStop(0, n.ghost ? 'rgba(230,230,240,.8)' : `hsla(${n.hue},100%,92%,${(on ? 1 : .2) * tw})`);
      g.addColorStop(.25, n.ghost ? 'rgba(180,180,200,.35)' : `hsla(${n.hue},95%,65%,${(on ? .6 : .1) * tw})`);
      g.addColorStop(1, `hsla(${n.hue},95%,60%,0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 3.2, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const n of nodes) {
      const p = P.get(n), on = lit(n), core = !n.orb && !n.cl.solo;
      if (!(on && (hover || nodes.length < 70 || z > 1.2 || core))) continue;
      ctx.font = `${core || n === hover ? 600 : 400} ${core ? 13 : 12}px "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = n === hover ? '#fff' : `rgba(235,240,255,${core ? .95 : .75})`;
      ctx.fillText(short(n.name, 24), p.x, p.y + (core ? 22 : 15) * Math.sqrt(z));
    }
    return P;
  }

  // ---------- кадр ----------
  function frame() {
    if (!running) return;
    t++;
    const r = cv.getBoundingClientRect();
    if (r.width !== W || r.height !== H) { W = r.width; H = r.height; dpr = devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!nodes.length) {
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '14px "Segoe UI", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Свяжи заметки через [[Название]] — и здесь появится граф', W / 2, H / 2);
    } else if (mode === 'ring') lastP = drawRing();
    else if (mode === 'galaxy') {
      if (fit && W) { cam.zoom = Math.min(1.3, Math.max(.25, Math.min(W, H) / (2 * galaxyReach + 60))); fit = false; } // вся картина в окне
      lastP = drawGalaxy();
    }
    else {
      step();
      if (mode === '3d' && !drag) cam.ry += 0.0025; // медленное вращение
      lastP = drawGraph();
    }
    requestAnimationFrame(frame);
  }

  // ---------- мышь ----------
  function pick(x, y) {
    let best = null, bd = 14 * 14;
    for (const n of nodes) {
      const p = lastP.get(n); if (!p) continue;
      const r = Math.max(radius(n) * p.s * Math.sqrt(cam.zoom), 8), d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < Math.max(bd, r * r)) { bd = d; best = n; }
    }
    return best;
  }
  const local = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  // два пальца — щипок для масштаба (телефон и сенсорный экран)
  const touches = new Map();
  let pinch = null;
  const spread = () => { const [a, b] = [...touches.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (touches.size === 2) { pinch = { d0: spread(), z0: cam.zoom }; drag = null; e.stopImmediatePropagation(); }
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size === 2) { cam.zoom = Math.max(.2, Math.min(4, pinch.z0 * spread() / pinch.d0)); e.stopImmediatePropagation(); }
  }, true);
  const touchEnd = e => {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; drag = null; e.stopImmediatePropagation(); }
  };
  cv.addEventListener('pointerup', touchEnd, true);
  cv.addEventListener('pointercancel', touchEnd, true);
  cv.addEventListener('pointerdown', e => {
    const [x, y] = local(e);
    const n = pick(x, y);
    drag = { x, y, sx: x, sy: y, node: mode === '2d' ? n : null, moved: false, hit: n };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (!drag) {
      hover = pick(x, y);
      cv.style.cursor = hover ? 'pointer' : '';
      if (hover) {
        tip.textContent = hover.name + (hover.ghost ? ' — ещё не создана' : '') + (hover.deg ? ` · связей: ${hover.deg}` : '');
        tip.style.left = x + 14 + 'px'; tip.style.top = y + 14 + 'px';
        tip.classList.add('show');
      } else tip.classList.remove('show');
      return;
    }
    const dx = x - drag.x, dy = y - drag.y;
    if (Math.abs(x - drag.sx) + Math.abs(y - drag.sy) > 4) drag.moved = true;
    drag.x = x; drag.y = y;
    if (mode === 'ring') { // повернуть кольцо — по углу вокруг центра
      const cx = W / 2 + cam.x, cy = H / 2 + cam.y;
      ringRot += Math.atan2(y - cy, x - cx) - Math.atan2(y - dy - cy, x - dx - cx);
    } else if (mode === '3d') { cam.ry += dx * 0.008; cam.rx = Math.max(-1.5, Math.min(1.5, cam.rx + dy * 0.008)); }
    else if (drag.node) { drag.node.x += dx / cam.zoom; drag.node.y += dy / cam.zoom; alpha = Math.max(alpha, .3); }
    else { cam.x += dx; cam.y += dy; }
  });
  cv.addEventListener('pointerup', () => {
    if (drag && !drag.moved && drag.hit) { tip.classList.remove('show'); onOpen(drag.hit); }
    drag = null;
  });
  cv.addEventListener('pointerleave', () => { if (!drag) { hover = null; tip.classList.remove('show'); } });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const [x, y] = local(e), z = Math.max(.2, Math.min(4, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
    if (mode === 'ring') { cam.zoom = z; return; } // кольцо масштабируется от центра
    const f = z / cam.zoom; // масштаб вокруг курсора
    cam.x = x - W / 2 - (x - W / 2 - cam.x) * f; cam.y = y - H / 2 - (y - H / 2 - cam.y) * f;
    cam.zoom = z;
  }, { passive: false });

  box.querySelector('.seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const was = mode;
    mode = b.dataset.m;
    box.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
    hint.textContent = HINTS[mode];
    if (mode !== was) { cam.x = cam.y = 0; cam.zoom = 1; fit = mode === 'galaxy'; }
    if (mode === '3d') nodes.forEach(n => { n.vz += (Math.random() - .5) * 30; }); // из плоскости — в объём
    if (mode === '2d' || mode === '3d') alpha = Math.max(alpha, .6); // пусть узлы перестроятся под новый режим
  });
  hint.textContent = HINTS[mode];

  return {
    show() { load(); if (!running) { running = true; requestAnimationFrame(frame); } },
    hide() { running = false; hover = null; tip.classList.remove('show'); },
  };
}
