(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const yen = n => '¥' + n.toLocaleString('ja-JP');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ---------------- DATA ---------------- */
const TAGS = { sweet: 'あま〜い', sour: '甘酸っぱい', bitter: 'ほろ苦', fresh: 'さっぱり', rich: 'ごほうび' };
const C = { pink: '#F0608C', yellow: '#F0B800', green: '#4FB583', tan: '#B79C79', purple: '#8E6FC8', blue: '#5B9FE6', brown: '#8A6A55' };
const D = [
  [1, 'プレーン', 380, 'ふんわり生地に、やさしい甘さのシュガーをまとわせた定番のひと品。', 'pink', ['sweet']],
  [2, 'チョコレート', 420, 'ビターチョコとザクザク食感のクランチが楽しめるドーナツ。', 'yellow', ['bitter', 'sweet']],
  [3, 'いちごミルク', 450, '甘酸っぱいいちごとまろやかなミルクの組み合わせ。', 'pink', ['sour', 'sweet']],
  [4, '抹茶', 420, '宇治抹茶の香りが広がる、ほろ苦く上品な味わい。', 'green', ['bitter']],
  [5, 'キャラメルナッツ', 450, '濃厚キャラメルと香ばしいナッツの食感がアクセント。', 'tan', ['sweet', 'rich']],
  [6, 'レモン', 420, '爽やかなレモンの酸味とホワイトチョコのやさしい甘さ。', 'yellow', ['fresh', 'sour']],
  [7, 'クッキー＆クリーム', 450, 'バニラのまろやかさと、ほろ苦いクッキーの組み合わせ。', 'purple', ['sweet', 'bitter']],
  [8, 'クレームブリュレ', 480, '香ばしいキャラメリゼを楽しむ、ちょっと贅沢なひと品。', 'tan', ['rich']],
  [9, 'バナナチョコ', 430, 'バナナの甘さとチョコレートの相性を楽しめるドーナツ。', 'yellow', ['sweet']],
  [10, 'ブルーベリー', 420, '甘酸っぱいブルーベリーとふわふわ生地の組み合わせ。', 'blue', ['sour']],
  [11, 'カフェオレ', 420, '香り高いコーヒーとミルクのまろやかさを楽しむ味わい。', 'brown', ['bitter']],
  [12, 'ラズベリーピスタチオ', 480, '甘酸っぱいラズベリーと香ばしいピスタチオの組み合わせ。', 'pink', ['sour']],
  [13, 'ココナッツ', 430, 'ココナッツの香りが広がる、トロピカルな味わい。', 'blue', ['fresh']],
  [14, 'ダブルチョコ', 460, 'チョコ生地にチョコクリームを合わせ、さらにチョコをトッピング。', 'tan', ['rich', 'bitter']],
  [15, 'ピーチヨーグルト', 450, 'ジューシーな桃と、さっぱりしたヨーグルト風味の組み合わせ。', 'pink', ['fresh', 'sour']],
  [16, '桜あん', 460, 'やさしい桜の香りと、上品なあんこの甘さ。', 'green', ['sweet'], [3, 4], '春限定'],
  [17, 'マンゴー', 480, 'とろけるマンゴーとココナッツのアクセント。', 'yellow', ['fresh'], [6, 7, 8], '夏限定'],
  [18, 'いちごショート', 520, 'ふわふわクリームと甘いいちごを楽しむ、ショートケーキ風ドーナツ。', 'pink', ['rich', 'sour'], [12, 1, 2, 3], '冬〜春限定'],
  [19, 'モンブラン', 520, '栗の風味たっぷりのクリームを楽しむ、贅沢なひと品。', 'brown', ['rich'], [9, 10, 11], '秋限定'],
  [20, '巨峰', 480, 'ジューシーな巨峰とヨーグルト風味のクリームを合わせたドーナツ。', 'purple', ['fresh', 'sour'], [9, 10], '秋限定']
].map(([id, name, price, desc, col, tags, months, label]) => ({
  id, name, price, desc, color: C[col], tags,
  ltd: !!months, months: months || [], label: label || '',
  img: `images/d${String(id).padStart(2, '0')}.png`
}));
const monthNow = new Date().getMonth() + 1;
D.forEach(d => { d.live = !d.ltd || d.months.includes(monthNow); });
const rangeText = m => { const s = [...m].sort((a, b) => a - b); return (m[0] === 12 ? '12' : m[0]) + '〜' + m[m.length - 1] + '月'; };

const ico = c => `<svg viewBox="0 0 48 48"><path d="M8 18h28v10a12 12 0 0 1-12 12h-4A12 12 0 0 1 8 28z" fill="${c}"/><path d="M36 21h3a5 5 0 0 1 0 10h-4" fill="none" stroke="${c}" stroke-width="3"/><path d="M16 8c0 4 3 4 0 8M24 8c0 4 3 4 0 8M32 8c0 4 3 4 0 8" stroke="#2B2220" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
const sodaIco = c => `<svg viewBox="0 0 48 48"><path d="M12 12h24l-3 28H15z" fill="${c}" opacity=".85"/><path d="M12 12h24" stroke="#2B2220" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="26" r="3" fill="#fff"/><circle cx="28" cy="32" r="2.5" fill="#fff"/><circle cx="26" cy="21" r="2" fill="#fff"/><path d="M28 12l6-8" stroke="#2B2220" stroke-width="3" stroke-linecap="round"/></svg>`;
const DR = [
  { id: 'coffee', name: 'コーヒー', price: 350, opts: ['HOT', 'ICE'], icon: ico('#6b4a38') },
  { id: 'latte', name: 'カフェラテ', price: 450, opts: ['HOT', 'ICE'], icon: ico('#c9a27c') },
  { id: 'soda', name: 'フルーツソーダ', price: 480, opts: ['ストロベリー', 'ブルーベリー', 'レモン'], icon: sodaIco('#F0608C') }
];

/* ---------------- toast ---------------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------------- header / menu / progress ---------------- */
const header = $('.site-header'), burger = $('.burger'), spMenu = $('#spMenu');
function setMenu(open) {
  burger.setAttribute('aria-expanded', open); spMenu.classList.toggle('open', open);
  spMenu.setAttribute('aria-hidden', !open); document.body.style.overflow = open ? 'hidden' : '';
}
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
$$('a', spMenu).forEach(a => a.addEventListener('click', () => setMenu(false)));

/* ---------------- menu render ---------------- */
const grid = $('#menuGrid');
grid.innerHTML = D.map(d => `
  <article class="card reveal" data-id="${d.id}" style="--c:${d.color};--d:${(d.id % 5) * .06}s">
    ${d.ltd ? '<span class="badge-ltd">期間<br>限定</span>' : ''}
    ${d.ltd ? `<span class="season-tag ${d.live ? 'live' : ''}">${d.live ? 'いま販売中' : rangeText(d.months)}</span>` : ''}
    <span class="sticker"><img src="${d.img}" alt="${d.name}" loading="lazy" width="368" height="328"></span>
    <div class="c-head"><span class="c-num">${d.id}</span><h3 class="c-name">${d.name}</h3></div>
    <p class="c-desc">${d.desc}${d.ltd ? `<br><b>${d.label}（${rangeText(d.months)}）</b>` : ''}</p>
    <div class="c-foot"><span class="c-price">${yen(d.price)}<small>税込</small></span>
      <button class="add" data-add="${d.id}" aria-label="${d.name}をMy Boxに入れる" ${d.live ? '' : 'disabled title="販売期間外です"'}>＋</button></div>
  </article>`).join('');
const liveLtd = D.filter(d => d.ltd && d.live).map(d => d.name);
$('#seasonNow').innerHTML = `いまは<b>${monthNow}月</b>。販売中の期間限定は <b>${liveLtd.join('・') || 'ありません'}</b>。`;
$$('.add[disabled]', grid).forEach(b => b.textContent = '–');

let cat = 'all', tag = null;
function applyFilter() {
  let shown = 0;
  $$('.card', grid).forEach(c => {
    const d = D[c.dataset.id - 1];
    const okCat = cat === 'all' || (cat === 'std' && !d.ltd) || (cat === 'ltd' && d.ltd) || (cat === 'now' && d.live);
    const okTag = !tag || d.tags.includes(tag);
    c.classList.toggle('hide', !(okCat && okTag));
    if (okCat && okTag) { shown++; c.classList.add('in'); }
  });
  $('#menuEmpty').hidden = shown > 0;
}
$('#catChips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  cat = b.dataset.cat; $$('#catChips .chip').forEach(x => x.classList.toggle('on', x === b)); applyFilter();
});
$('#moodChips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  tag = tag === b.dataset.tag ? null : b.dataset.tag;
  $$('#moodChips .chip').forEach(x => x.classList.toggle('on', x.dataset.tag === tag)); applyFilter();
});

/* 3D tilt */
if (fine && !reduce) {
  grid.addEventListener('pointermove', e => {
    const c = e.target.closest('.card'); if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.style.transform = `perspective(700px) rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateY(-6px)`;
  });
  grid.addEventListener('pointerout', e => { const c = e.target.closest('.card'); if (c && !c.contains(e.relatedTarget)) c.style.transform = ''; });
}

/* ---------------- drinks render ---------------- */
$('#drinkList').innerHTML = DR.map(d => `
  <li class="dr reveal" data-dr="${d.id}">
    <span class="dr-ico">${d.icon}</span>
    <div class="dr-body"><div class="dr-name">${d.name}</div><div class="dr-price">${yen(d.price)}<small style="font-size:11px;color:#6f5d54"> 税込</small></div>
      <div class="opts" role="radiogroup" aria-label="${d.name}の種類">${d.opts.map((o, i) => `<button class="opt ${i ? '' : 'on'}" role="radio" aria-checked="${i === 0}" data-opt="${o}">${o}</button>`).join('')}</div></div>
    <button class="add" data-add-dr="${d.id}" aria-label="${d.name}をMy Boxに入れる">＋</button>
  </li>`).join('');
$('#drinkList').addEventListener('click', e => {
  const o = e.target.closest('.opt');
  if (o) { $$('.opt', o.parentNode).forEach(x => { x.classList.toggle('on', x === o); x.setAttribute('aria-checked', x === o); }); }
});

/* ---------------- cart ---------------- */
let cart = store.get('mogu-cart', {});
// cart: key -> qty. key: "d:3" or "k:coffee:HOT"
const meta = key => {
  const p = key.split(':');
  if (p[0] === 'd') { const d = D[p[1] - 1]; return { name: d.name, sub: '', price: d.price, img: d.img, donut: true }; }
  const dr = DR.find(x => x.id === p[1]); return { name: dr.name, sub: p[2], price: dr.price, icon: dr.icon, donut: false };
};
const panel = $('#boxPanel'), scrim = $('#scrim'), fab = $('#boxFab');
function setPanel(open) {
  panel.classList.toggle('open', open); scrim.classList.toggle('on', open);
  panel.setAttribute('aria-hidden', !open); fab.setAttribute('aria-expanded', open);
  if (open) $('#boxClose').focus(); else if (document.activeElement && panel.contains(document.activeElement)) fab.focus();
}
fab.addEventListener('click', () => setPanel(!panel.classList.contains('open')));
$('#boxClose').addEventListener('click', () => setPanel(false));
scrim.addEventListener('click', () => setPanel(false));

function renderCart() {
  const keys = Object.keys(cart).filter(k => cart[k] > 0);
  let donuts = 0, drinks = 0, sub = 0; const imgs = [];
  keys.forEach(k => { const m = meta(k), q = cart[k]; sub += m.price * q; if (m.donut) { donuts += q; for (let i = 0; i < q; i++) imgs.push(m.img); } else drinks += q; });
  const sets = Math.min(donuts, drinks), disc = sets * 100, count = donuts + drinks;
  $('#cartList').innerHTML = keys.map(k => { const m = meta(k); return `<li>
    <span class="ci ${m.donut ? '' : 'dr-i'}">${m.donut ? `<img src="${m.img}" alt="">` : m.icon}</span>
    <span class="cn">${m.name}<small>${m.sub ? m.sub + '・' : ''}${yen(m.price)}</small></span>
    <span class="qty"><button data-q="-1" data-k="${k}" aria-label="${m.name}を減らす">−</button><b>${cart[k]}</b><button data-q="1" data-k="${k}" aria-label="${m.name}を増やす">＋</button></span></li>`; }).join('');
  $('#cartEmpty').hidden = keys.length > 0;
  $('#slots').innerHTML = Array.from({ length: 6 }, (_, i) => {
    if (i < imgs.length) { const more = i === 5 && imgs.length > 6; return `<span class="slot">${more ? `<b style="font-family:var(--f-pop);font-size:20px">+${imgs.length - 5}</b>` : `<img src="${imgs[i]}" alt="">`}</span>`; }
    return '<span class="slot"></span>';
  }).join('');
  $('#sumSub').textContent = yen(sub);
  $('#sumSets').textContent = sets ? `（${sets}セット）` : '';
  $('#sumDisc').textContent = '−' + yen(disc);
  $('#sumTotal').textContent = yen(sub - disc);
  $('#fabCount').textContent = count; $('#fabTotal').textContent = yen(sub - disc);
  fab.setAttribute('aria-label', `My Box ${count}点 ${yen(sub - disc)}`);
  store.set('mogu-cart', cart);
}
function fly(fromEl, imgSrc, svgHtml) {
  if (reduce || !fromEl) return;
  const a = fromEl.getBoundingClientRect(), b = fab.getBoundingClientRect(), s = 56;
  let el;
  if (imgSrc) { el = document.createElement('img'); el.src = imgSrc; } else { el = document.createElement('div'); el.innerHTML = svgHtml; el.style.background = '#fff'; }
  el.className = 'fly'; Object.assign(el.style, { width: s + 'px', height: s + 'px', left: a.left + a.width / 2 - s / 2 + 'px', top: a.top + a.height / 2 - s / 2 + 'px' });
  document.body.appendChild(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  el.animate([{ transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 }, { transform: `translate(${dx * .5}px,${dy * .5 - 80}px) scale(1.2) rotate(180deg)`, offset: .45, opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.3) rotate(360deg)`, opacity: .5 }], { duration: 750, easing: 'cubic-bezier(.4,0,.2,1)' }).onfinish = () => { el.remove(); fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump'); };
}
function add(key, from) {
  cart[key] = (cart[key] || 0) + 1; renderCart();
  const m = meta(key); fly(from, m.img, m.donut ? '' : m.icon); toast(`${m.name}${m.sub ? '（' + m.sub + '）' : ''}を入れました`);
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-add]');
  if (a) { add('d:' + a.dataset.add, a.closest('.card')?.querySelector('.sticker') || a); return; }
  const r = e.target.closest('[data-add-dr]');
  if (r) { const li = r.closest('.dr'); add(`k:${r.dataset.addDr}:${$('.opt.on', li).dataset.opt}`, $('.dr-ico', li)); return; }
  const q = e.target.closest('[data-q]');
  if (q) { const k = q.dataset.k; cart[k] = Math.max(0, (cart[k] || 0) + +q.dataset.q); if (!cart[k]) delete cart[k]; renderCart(); }
});
$('#clearBtn').addEventListener('click', () => { cart = {}; renderCart(); });
$('#copyBtn').addEventListener('click', async () => {
  const keys = Object.keys(cart); if (!keys.length) return toast('My Box は空っぽです');
  let donuts = 0, drinks = 0, sub = 0;
  const lines = keys.map(k => { const m = meta(k), q = cart[k]; sub += m.price * q; m.donut ? donuts += q : drinks += q; return `・${m.name}${m.sub ? '（' + m.sub + '）' : ''} ×${q}　${yen(m.price * q)}`; });
  const disc = Math.min(donuts, drinks) * 100;
  const text = `【mogu FRESH DONUTS（架空店舗）My Box】\n${lines.join('\n')}\nセット割引 −${yen(disc)}\n合計（税込）${yen(sub - disc)}`;
  try { await navigator.clipboard.writeText(text); toast('リストをコピーしました'); } catch { toast('コピーできませんでした'); }
});
renderCart();

/* ---------------- bite game ---------------- */
let bites = store.get('mogu-bites', 0);
$('#biteCount').textContent = bites;
const crumbColors = ['#F0608C', '#FFD84D', '#8A6A55', '#6CC091', '#B79C79', '#fff'];
function crumbs(x, y, n = 8) {
  if (reduce) return;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i'); c.className = 'crumb'; c.style.background = crumbColors[i % crumbColors.length];
    c.style.left = x + 'px'; c.style.top = y + 'px'; document.body.appendChild(c);
    const ang = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 70;
    c.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist + 60}px) scale(.3)`, opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'ease-out' }).onfinish = () => c.remove();
  }
}
function popText(x, y, t) {
  const p = document.createElement('span'); p.className = 'pop-text'; p.textContent = t; p.style.left = x + 'px'; p.style.top = y + 'px';
  document.body.appendChild(p); setTimeout(() => p.remove(), 850);
}
const words = ['mogu!', 'もぐっ', 'ふわっ', 'とろ〜', 'うまっ'];
function applyBites(el) {
  const list = JSON.parse(el.dataset.b || '[]'); if (!list.length) { el.style.webkitMaskImage = el.style.maskImage = ''; return; }
  const r = el.offsetWidth * .24;
  const m = list.map(([x, y]) => `radial-gradient(circle ${r}px at ${x}px ${y}px,transparent ${r - 1}px,#000 ${r}px)`).join(',');
  el.style.webkitMaskImage = el.style.maskImage = m;
  el.style.webkitMaskComposite = 'source-in'; el.style.maskComposite = 'intersect';
}
$$('.bitable').forEach(el => el.addEventListener('click', e => {
  if (el.classList.contains('gone')) return;
  const rect = el.getBoundingClientRect();
  const px = (e.clientX || rect.left + rect.width / 2) - rect.left, py = (e.clientY || rect.top + rect.height / 2) - rect.top;
  let vx = px - rect.width / 2, vy = py - rect.height / 2; const len = Math.hypot(vx, vy) || 1;
  vx = vx / len * rect.width * .5; vy = vy / len * rect.height * .5;
  const list = JSON.parse(el.dataset.b || '[]'); list.push([rect.width / 2 + vx, rect.height / 2 + vy]); el.dataset.b = JSON.stringify(list);
  applyBites(el); bites++; store.set('mogu-bites', bites); $('#biteCount').textContent = bites;
  const cx = rect.left + rect.width / 2 + vx, cy = rect.top + rect.height / 2 + vy;
  crumbs(cx, cy); popText(cx, cy, words[bites % words.length]);
  if (list.length >= 4) {
    el.classList.add('gone'); crumbs(rect.left + rect.width / 2, rect.top + rect.height / 2, 16); popText(rect.left + rect.width / 2, rect.top + rect.height / 2, 'ごちそうさま！');
    setTimeout(() => { el.dataset.b = '[]'; applyBites(el); el.classList.remove('gone'); }, 2400);
  }
}));

/* ---------------- gacha ---------------- */
const gm = $('#gachaModal'); let gTimer, gPick = null;
function gachaClose() { gm.hidden = true; clearTimeout(gTimer); document.body.style.overflow = ''; $('#gachaBtn').focus(); }
function show(d) { $('#gachaImg').src = d.img; $('#gachaName').textContent = d.name; $('#gachaDesc').textContent = d.desc; $('#gachaPrice').textContent = yen(d.price) + '（税込）'; }
function gachaSpin() {
  const pool = D.filter(d => d.live); let i = 0, delay = 60; const total = 22;
  const pic = $('.gacha-pic'); pic.classList.remove('done'); pic.classList.add('spinning');
  $('#gachaTop').textContent = 'くるくる…'; $('#gachaAdd').disabled = $('#gachaAgain').disabled = true; gPick = null;
  const step = () => {
    const d = pool[Math.floor(Math.random() * pool.length)]; show(d); i++;
    if (i < total) { delay += i > 12 ? 28 : 4; gTimer = setTimeout(step, reduce ? 10 : delay); }
    else { gPick = d; pic.classList.remove('spinning'); pic.classList.add('done'); $('#gachaTop').textContent = 'きょうの一個はこれ！'; $('#gachaAdd').disabled = $('#gachaAgain').disabled = false; const r = pic.getBoundingClientRect(); crumbs(r.left + r.width / 2, r.top + r.height / 2, 24); }
  };
  step();
}
$('#gachaBtn').addEventListener('click', () => { gm.hidden = false; document.body.style.overflow = 'hidden'; $('#gachaClose').focus(); gachaSpin(); });
$('#gachaAgain').addEventListener('click', gachaSpin);
$('#gachaAdd').addEventListener('click', () => { if (gPick) { add('d:' + gPick.id, $('.gacha-pic')); gachaClose(); } });
$('#gachaClose').addEventListener('click', gachaClose);
gm.addEventListener('click', e => { if (e.target === gm) gachaClose(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!gm.hidden) gachaClose(); else if (panel.classList.contains('open')) setPanel(false); else setMenu(false); } });

/* ---------------- sprinkle trail (desktop) ---------------- */
if (fine && !reduce) {
  let last = 0; const cols = ['#F0608C', '#FFD84D', '#6CC091', '#8E6FC8', '#7DB4EE'];
  addEventListener('pointermove', e => {
    const now = performance.now(); if (now - last < 70) return; last = now;
    if (e.target.closest && e.target.closest('input,button,a')) return;
    const s = document.createElement('i'); s.className = 'spr'; s.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;background:${cols[Math.random() * 5 | 0]};transform:rotate(${Math.random() * 180}deg);--r:${Math.random() * 360}deg`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 900);
  }, { passive: true });
}

/* ---------------- concept: split text ---------------- */
const ct = $('#conceptText');
(function split(node) {
  [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) { const f = document.createDocumentFragment(); [...n.textContent].forEach(ch => { const s = document.createElement('span'); s.className = 'w'; s.textContent = ch; f.appendChild(s); }); n.replaceWith(f); }
    else if (n.nodeType === 1) split(n);
  });
})(ct);
const chars = $$('.w', ct);

/* ---------------- features ---------------- */
const feats = $$('.feat'), bigImg = $('#bigImg'), bigRing = $('#bigRing'), stageLabel = $('#stageLabel');
let activeFeat = -1;
function setFeat(i) {
  if (i === activeFeat) return; activeFeat = i;
  feats.forEach((f, j) => f.classList.toggle('active', j === i));
  const f = feats[i]; bigImg.style.opacity = 0;
  setTimeout(() => { bigImg.src = f.dataset.img; bigImg.style.opacity = 1; }, 220);
  bigRing.style.setProperty('--ringc', f.dataset.color); stageLabel.textContent = f.dataset.label;
}

/* ---------------- reveal ---------------- */
$$('.sec-title,.lead,.gcard,.dr,.info div,.map,.eyebrow').forEach(el => el.classList.add('reveal'));
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
$$('.reveal').forEach(el => io.observe(el));

/* ---------------- scroll loop ---------------- */
const hero = $('#hero'), heroTitle = $('.hero-title'), floats = $$('.float'), blobs = $$('.blob'), spinImg = $('.spin img');
const concept = $('.concept'), features = $('.features'), menuMarq = $('#menuMarq'), menuSec = $('#menu'), route = $('#route'), bar = $('.progress i');
const parx = $$('[data-speed]');
let mx = 0, my = 0, tx = 0, ty = 0, ticking = false;
if (fine) addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
if (matchMedia('(pointer:coarse)').matches && 'DeviceOrientationEvent' in window) {
  addEventListener('deviceorientation', e => { if (e.gamma == null) return; tx = clamp(e.gamma / 40, -.5, .5); ty = clamp((e.beta - 40) / 80, -.5, .5); }, { passive: true });
}
function frame() {
  const y = scrollY, vh = innerHeight;
  header.classList.toggle('solid', y > 40);
  bar.style.transform = `scaleX(${clamp(y / (document.documentElement.scrollHeight - vh))})`;
  mx += (tx - mx) * .08; my += (ty - my) * .08;
  if (y < vh * 1.3) {
    heroTitle.style.transform = `translateY(${y * .18}px) scale(${1 + y / vh * .25})`;
    heroTitle.style.opacity = clamp(1 - y / (vh * .9));
    floats.forEach(f => { const d = +f.dataset.depth; f.style.transform = `translate3d(${mx * d * 50}px,${my * d * 36 - y * .22 * d}px,0)`; });
    blobs.forEach(b => { const d = +b.dataset.depth; b.style.transform = `translate3d(${-mx * d * 60}px,${-my * d * 40 + y * .2 * d}px,0)`; });
    spinImg.style.transform = `scale(1.04) rotate(${y * .35}deg)`;
  }
  // concept
  let r = concept.getBoundingClientRect(), p = clamp(-r.top / (r.height - vh));
  const n = Math.round(p * 1.1 * chars.length); chars.forEach((c, i) => c.classList.toggle('on', i < n));
  parx.forEach(el => { const rr = el.getBoundingClientRect(); el.style.transform = `translateY(${(rr.top - vh / 2) * +el.dataset.speed}px) rotate(${(rr.top - vh / 2) * +el.dataset.speed * .1}deg)`; });
  // features
  r = features.getBoundingClientRect();
  if (r.top < vh && r.bottom > 0) {
    const fp = clamp(-r.top / (r.height - vh));
    bigImg.style.setProperty('--rot', fp * 540 + 'deg'); bigImg.style.setProperty('--sc', 1 + Math.sin(fp * Math.PI * 3) * .05);
    let best = 0, bd = 1e9; feats.forEach((f, i) => { const fr = f.getBoundingClientRect(), d = Math.abs(fr.top + fr.height / 2 - vh * (innerWidth < 800 ? .72 : .5)); if (d < bd) { bd = d; best = i; } });
    setFeat(best);
  }
  // menu marquee text
  r = menuSec.getBoundingClientRect();
  if (r.top < vh && r.bottom > 0) menuMarq.style.transform = `translateX(${-(vh - r.top) * .45}px)`;
  // map route
  route.style.setProperty('--dash', -y * .25);
  ticking = false;
}
const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
addEventListener('scroll', req, { passive: true }); addEventListener('resize', req);
if (!reduce) { (function loop() { if (scrollY < innerHeight * 1.3) frame(); requestAnimationFrame(loop); })(); }
frame(); setFeat(0);
})();
