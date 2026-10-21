(() => {
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const yen = n => '¥' + n.toLocaleString('ja-JP');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

/* ---------------- DATA ---------------- */
const C = { pink: '#D93B6E', yellow: '#C99A00', green: '#3E9E70', tan: '#9C8160', purple: '#7A5BB8', blue: '#4C8AD6', brown: '#8A6A55' };
const D = [
  [1, 'プレーン', 380, 'ふんわり生地に、やさしい甘さのシュガーをまとわせた定番のひと品。', 'pink'],
  [2, 'チョコレート', 420, 'ビターチョコとザクザク食感のクランチが楽しめるドーナツ。', 'yellow'],
  [3, 'いちごミルク', 450, '甘酸っぱいいちごとまろやかなミルクの組み合わせ。', 'pink'],
  [4, '抹茶', 420, '宇治抹茶の香りが広がる、ほろ苦く上品な味わい。', 'green'],
  [5, 'キャラメルナッツ', 450, '濃厚キャラメルと香ばしいナッツの食感がアクセント。', 'tan'],
  [6, 'レモン', 420, '爽やかなレモンの酸味とホワイトチョコのやさしい甘さ。', 'yellow'],
  [7, 'クッキー＆クリーム', 450, 'バニラのまろやかさと、ほろ苦いクッキーの組み合わせ。', 'purple'],
  [8, 'クレームブリュレ', 480, '香ばしいキャラメリゼを楽しむ、ちょっと贅沢なひと品。', 'tan'],
  [9, 'バナナチョコ', 430, 'バナナの甘さとチョコレートの相性を楽しめるドーナツ。', 'yellow'],
  [10, 'ブルーベリー', 420, '甘酸っぱいブルーベリーとふわふわ生地の組み合わせ。', 'blue'],
  [11, 'カフェオレ', 420, '香り高いコーヒーとミルクのまろやかさを楽しむ味わい。', 'brown'],
  [12, 'ラズベリーピスタチオ', 480, '甘酸っぱいラズベリーと香ばしいピスタチオの組み合わせ。', 'pink'],
  [13, 'ココナッツ', 430, 'ココナッツの香りが広がる、トロピカルな味わい。', 'blue'],
  [14, 'ダブルチョコ', 460, 'チョコ生地にチョコクリームを合わせ、さらにチョコをトッピング。', 'tan'],
  [15, 'ピーチヨーグルト', 450, 'ジューシーな桃と、さっぱりしたヨーグルト風味の組み合わせ。', 'pink'],
  [16, '桜あん', 460, 'やさしい桜の香りと、上品なあんこの甘さ。', 'green', [3, 4], '春限定'],
  [17, 'マンゴー', 480, 'とろけるマンゴーとココナッツのアクセント。', 'yellow', [6, 7, 8], '夏限定'],
  [18, 'いちごショート', 520, 'ふわふわクリームと甘いいちごを楽しむ、ショートケーキ風ドーナツ。', 'pink', [12, 1, 2, 3], '冬〜春限定'],
  [19, 'モンブラン', 520, '栗の風味たっぷりのクリームを楽しむ、贅沢なひと品。', 'brown', [9, 10, 11], '秋限定'],
  [20, '巨峰', 480, 'ジューシーな巨峰とヨーグルト風味のクリームを合わせたドーナツ。', 'purple', [9, 10], '秋限定']
].map(([id, name, price, desc, col, months, label]) => ({
  id, name, price, desc, color: C[col], ltd: !!months, months: months || [], label: label || '',
  img: `images/d${String(id).padStart(2, '0')}.png`
}));
const monthNow = new Date().getMonth() + 1;
D.forEach(d => { d.live = !d.ltd || d.months.includes(monthNow); });
const rangeText = m => m[0] + '〜' + m[m.length - 1] + '月';

/* ---------------- header / menu ---------------- */
const header = $('.site-header'), burger = $('.burger'), spMenu = $('#spMenu');
function setMenu(open) {
  burger.setAttribute('aria-expanded', open); spMenu.classList.toggle('open', open);
  spMenu.setAttribute('aria-hidden', !open); document.body.style.overflow = open ? 'hidden' : '';
}
burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
$$('a', spMenu).forEach(a => a.addEventListener('click', () => setMenu(false)));
addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

/* ---------------- menu render ---------------- */
const grid = $('#menuGrid');
grid.innerHTML = D.map(d => `
  <article class="card reveal" data-id="${d.id}" style="--c:${d.color};--d:${(d.id % 5) * .06}s">
    ${d.ltd ? '<span class="badge-ltd">期間<br>限定</span>' : ''}
    ${d.ltd ? `<span class="season-tag ${d.live ? 'live' : ''}">${d.live ? '販売中' : rangeText(d.months)}</span>` : ''}
    <span class="sticker"><img src="${d.img}" alt="${d.name}" loading="lazy" width="368" height="328"></span>
    <div class="c-head"><span class="c-num">${d.id}</span><h3 class="c-name">${d.name}</h3></div>
    <p class="c-desc">${d.desc}${d.ltd ? `<br><b>${d.label}（${rangeText(d.months)}）</b>` : ''}</p>
    <div class="c-foot"><span class="c-price">${yen(d.price)}<small>税込</small></span></div>
  </article>`).join('');
const liveLtd = D.filter(d => d.ltd && d.live).map(d => d.name);
$('#seasonNow').innerHTML = `いまは<b>${monthNow}月</b>。販売中の期間限定は <b>${liveLtd.join('・') || 'ありません'}</b> です。`;

$('#catChips').addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  const cat = b.dataset.cat;
  $$('#catChips .chip').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
  $$('.card', grid).forEach(c => {
    const d = D[c.dataset.id - 1];
    const ok = cat === 'all' || (cat === 'std' && !d.ltd) || (cat === 'ltd' && d.ltd) || (cat === 'now' && d.live);
    c.classList.toggle('hide', !ok); if (ok) c.classList.add('in');
  });
});

/* ---------------- drinks ---------------- */
const cup = c => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 18h28v10a12 12 0 0 1-12 12h-4A12 12 0 0 1 8 28z" fill="${c}"/><path d="M36 21h3a5 5 0 0 1 0 10h-4" fill="none" stroke="${c}" stroke-width="3"/><path d="M16 8c0 4 3 4 0 8M24 8c0 4 3 4 0 8M32 8c0 4 3 4 0 8" stroke="#2B2220" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
const soda = c => `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 12h24l-3 28H15z" fill="${c}" opacity=".85"/><path d="M12 12h24" stroke="#2B2220" stroke-width="3" stroke-linecap="round"/><circle cx="20" cy="26" r="3" fill="#fff"/><circle cx="28" cy="32" r="2.5" fill="#fff"/><circle cx="26" cy="21" r="2" fill="#fff"/><path d="M28 12l6-8" stroke="#2B2220" stroke-width="3" stroke-linecap="round"/></svg>`;
const DR = [
  ['コーヒー', 350, ['HOT', 'ICE'], cup('#6b4a38')],
  ['カフェラテ', 450, ['HOT', 'ICE'], cup('#c9a27c')],
  ['フルーツソーダ', 480, ['ストロベリー', 'ブルーベリー', 'レモン'], soda('#D93B6E')]
];
$('#drinkList').innerHTML = DR.map(([n, p, o, i]) => `
  <li class="dr reveal"><span class="dr-ico">${i}</span>
    <div class="dr-body"><div class="dr-name">${n}</div>
      <div class="opts">${o.map(x => `<span class="opt">${x}</span>`).join('')}</div></div>
    <div class="dr-price">${yen(p)}<small> 税込</small></div></li>`).join('');

/* ---------------- reveal ---------------- */
$$('.sec-title,.lead,.gcard,.info div,.map,.eyebrow').forEach(el => el.classList.add('reveal'));
const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
$$('.reveal').forEach(el => io.observe(el));

/* ---------------- scroll ---------------- */
const heroTitle = $('.hero-title'), floats = $$('.float'), blobs = $$('.blob');
const menuMarq = $('#menuMarq'), menuSec = $('#menu'), route = $('#route'), bar = $('.progress i');
let mx = 0, my = 0, tx = 0, ty = 0, ticking = false;
if (fine && !reduce) addEventListener('pointermove', e => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
function frame() {
  const y = scrollY, vh = innerHeight;
  header.classList.toggle('solid', y > 40);
  bar.style.transform = `scaleX(${clamp(y / (document.documentElement.scrollHeight - vh))})`;
  mx += (tx - mx) * .08; my += (ty - my) * .08;
  if (y < vh * 1.3) {
    heroTitle.style.transform = `translateY(${y * .18}px) scale(${1 + y / vh * .2})`;
    heroTitle.style.opacity = clamp(1 - y / (vh * .9));
    floats.forEach(f => { const d = +f.dataset.depth; f.style.transform = `translate3d(${mx * d * 50}px,${my * d * 36 - y * .22 * d}px,0)`; });
    blobs.forEach(b => { const d = +b.dataset.depth; b.style.transform = `translate3d(${-mx * d * 60}px,${-my * d * 40 + y * .2 * d}px,0)`; });
  }
  const r = menuSec.getBoundingClientRect();
  if (r.top < vh && r.bottom > 0) menuMarq.style.transform = `translateX(${-(vh - r.top) * .45}px)`;
  route.style.setProperty('--dash', -y * .25);
  ticking = false;
}
const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
addEventListener('scroll', req, { passive: true }); addEventListener('resize', req);
if (fine && !reduce) { (function loop() { if (scrollY < innerHeight * 1.3) frame(); requestAnimationFrame(loop); })(); }
frame();
})();
