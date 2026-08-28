'use strict';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* плотная шапка после прокрутки + стрелка наверх */
const hdr = document.getElementById('hdr');
const toTop = document.getElementById('to-top');
const onScroll = () => {
  hdr.classList.toggle('stuck', scrollY > 30);
  toTop?.classList.toggle('show', scrollY > 280);
};
onScroll(); addEventListener('scroll', onScroll, {passive:true});

/* доступная мобильная навигация */
const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.getElementById('site-nav');
const closeNav = () => {
  siteNav?.classList.remove('open');
  navToggle?.setAttribute('aria-expanded', 'false');
  navToggle?.setAttribute('aria-label', 'Открыть меню');
  document.body.classList.remove('nav-open');
};
navToggle?.addEventListener('click', () => {
  const open = !siteNav.classList.contains('open');
  siteNav.classList.toggle('open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  document.body.classList.toggle('nav-open', open);
});
siteNav?.addEventListener('click', e => { if (e.target.closest('a')) closeNav(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });

/* появление блоков + счётчики */
const revealed = new Set();
function reveal(el, delay = 0){
  if (revealed.has(el)) return;
  revealed.add(el);
  setTimeout(() => el.classList.add('in'), delay);
  const num = el.querySelector('b[data-n]');
  if (num && !num.dataset.done) { num.dataset.done = 1; setTimeout(() => countTo(num), delay); }
}
const io = new IntersectionObserver((es) => {
  es.filter(e => e.isIntersecting).forEach((e, i) => {
    reveal(e.target, Math.min(i, 5) * 70);
    io.unobserve(e.target);
  });
}, {threshold:0, rootMargin:'0px 0px -6% 0px'});
document.querySelectorAll('.rv').forEach(el => io.observe(el));

/* Страховка: если наблюдатель промахнулся (переход по якорю, восстановление
   позиции, ошибка) — всё, что попало в экран, показываем принудительно. */
function sweep(){
  document.querySelectorAll('.rv:not(.in)').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 1.1 && r.bottom > -100) reveal(el);
  });
}
addEventListener('scroll', sweep, {passive:true});
addEventListener('load', sweep);
setTimeout(sweep, 1200);

function countTo(el){
  const to = +el.dataset.n, pre = el.dataset.pre || '';
  if (reduce) { el.textContent = pre + to; return; }
  const t0 = performance.now(), dur = 1100;
  const tick = t => {
    const p = Math.min((t - t0) / dur, 1);
    el.textContent = pre + Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* лёгкий параллакс кадра в герое */
const hmi = document.getElementById('hmi'), hm = document.getElementById('hm');
if (!reduce && hmi) {
  const par = () => {
    const r = hm.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
    hmi.style.transform = `translateY(${(-p * 34).toFixed(1)}px)`;
  };
  par(); addEventListener('scroll', par, {passive:true});
}

/* просмотр фото: клик по карточке галереи открывает снимок целиком */
const lbEl = document.getElementById('lb');
const lbImg = document.getElementById('lb-img');
const shots = [...document.querySelectorAll('.gal figure')].map(f => ({
  src: f.querySelector('img').getAttribute('src'),
  alt: f.querySelector('img').alt,
  cap: (f.querySelector('figcaption') || {}).textContent || ''
}));
let lbI = 0;
function lbShow(i){
  lbI = (i + shots.length) % shots.length;
  const s = shots[lbI];
  lbImg.src = s.src; lbImg.alt = s.alt;
  document.getElementById('lb-cap').textContent = s.cap;
  document.getElementById('lb-num').textContent = `${lbI + 1} / ${shots.length}`;
}
function lbOpen(i){ lbShow(i); lbEl.classList.add('open'); document.body.style.overflow='hidden'; }
function lbClose(){ lbEl.classList.remove('open'); document.body.style.overflow=''; }
function lbGo(d){ lbShow(lbI + d); }
document.querySelectorAll('.gal figure').forEach((f, i) => {
  f.addEventListener('click', () => lbOpen(i));
  f.setAttribute('tabindex', '0');
  f.setAttribute('role', 'button');
  f.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lbOpen(i); }
  });
});
const galTrack = document.querySelector('.gal');
window.galGo = function(dir){
  if (!galTrack) return;
  const card = galTrack.querySelector('figure');
  const gap = parseFloat(getComputedStyle(galTrack).gap) || 14;
  const step = (card ? card.getBoundingClientRect().width : 400) + gap;
  galTrack.scrollLeft += step * dir;
};
lbEl.addEventListener('click', e => { if (e.target === lbEl || e.target.classList.contains('lb-s')) lbClose(); });
addEventListener('keydown', e => {
  if (!lbEl.classList.contains('open')) return;
  if (e.key === 'Escape') lbClose();
  if (e.key === 'ArrowLeft') lbGo(-1);
  if (e.key === 'ArrowRight') lbGo(1);
});
// свайп на телефоне
let tx = 0;
lbEl.addEventListener('touchstart', e => tx = e.changedTouches[0].clientX, {passive:true});
lbEl.addEventListener('touchend', e => {
  const d = e.changedTouches[0].clientX - tx;
  if (Math.abs(d) > 55) lbGo(d < 0 ? 1 : -1);
}, {passive:true});

/* календарь занятости: iframe грузится только при первом открытии,
   чтобы не тянуть Google на каждой загрузке страницы */
const calEl = document.getElementById('cal');
function calOpen(e){
  if (e) e.preventDefault();
  const f = document.getElementById('cal-if');
  if (!f.src && f.dataset.src) f.src = f.dataset.src;
  calEl.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function calClose(){
  calEl.classList.remove('open');
  document.body.style.overflow = '';
}
calEl.addEventListener('click', e => { if (e.target === calEl) calClose(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && calEl.classList.contains('open')) calClose(); });
// все кнопки проверки даты открывают календарь
document.querySelectorAll('[data-cal]').forEach(b => b.addEventListener('click', calOpen));

/* cookie: выбор запоминается, баннер больше не показывается.
   Аналитику и прочие необязательные скрипты подключайте внутри ckApply('all'). */
const CK='soldout-cookie';
function ckSet(v){
  try{ localStorage.setItem(CK,v); }catch(e){}
  document.getElementById('ck').classList.remove('show');
  ckApply(v);
}
function ckApply(v){
  if (v === 'all') {
    // здесь можно запускать Яндекс.Метрику / Google Analytics
  }
}
(function(){
  let v=null; try{ v=localStorage.getItem(CK); }catch(e){}
  if (v) { ckApply(v); return; }
  setTimeout(()=>document.getElementById('ck').classList.add('show'), 1400);
})();

/* ── окно реквизитов + удержание фокуса в модальных окнах ──────
   Пока окно открыто, Tab не уводит на страницу за ним. */
function trapFocus(box){
  const sel = 'a[href],button:not([disabled]),input,textarea,select,iframe,[tabindex]:not([tabindex="-1"])';
  return (e) => {
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll(sel)].filter(n => n.offsetParent !== null || n.tagName === 'IFRAME');
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
}

(function(){
  const box = document.getElementById('reqModal');
  if (!box) return;
  const keep = trapFocus(box);
  let last = null;
  const open = () => {
    last = document.activeElement;
    box.classList.add('open');
    document.body.style.overflow = 'hidden';
    addEventListener('keydown', keep);
    setTimeout(() => box.querySelector('[data-md-close]')?.focus(), 60);
  };
  const close = () => {
    box.classList.remove('open');
    document.body.style.overflow = '';
    removeEventListener('keydown', keep);
    last?.focus();
  };
  document.getElementById('reqBtn')?.addEventListener('click', open);
  box.querySelectorAll('[data-md-close]').forEach(b => b.addEventListener('click', close));
  box.addEventListener('click', e => { if (e.target === box) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && box.classList.contains('open')) close(); });
})();

/* ── форма заявки: маска, проверка, состояния ─────────────────── */
/* Адрес обработчика заявок задаётся в assets/js/config.js —
   это единственный файл, который правится при смене хостинга. */
const LEAD_URL = (window.SOLDOUT_LEAD_URL || '').trim() || 'api/lead.php';

(function(){
  const form = document.querySelector('.form');
  if (!form) return;
  const tel  = form.querySelector('input[name="phone"]');
  const name = form.querySelector('input[name="name"]');
  const btn  = form.querySelector('button[type="submit"]');
  const ok   = form.querySelector('input[type="checkbox"]');

  /* сообщения об ошибке рядом с полем */
  const errBox = (input) => {
    let e = input.parentElement.querySelector('.err');
    if (!e) {
      e = document.createElement('span');
      e.className = 'err';
      input.parentElement.appendChild(e);
    }
    return e;
  };
  const setErr = (input, text) => {
    errBox(input).textContent = text;
    input.setAttribute('aria-invalid', text ? 'true' : 'false');
  };

  /* +7 (999) 123-45-67 */
  const mask = (v) => {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    let out = '+7';
    if (d.length > 1) out += ` (${d.slice(1, 4)}`;
    if (d.length >= 5) out += `) ${d.slice(4, 7)}`;
    if (d.length >= 8) out += `-${d.slice(7, 9)}`;
    if (d.length >= 10) out += `-${d.slice(9, 11)}`;
    return out;
  };
  tel?.addEventListener('focus', () => { if (!tel.value) tel.value = '+7 ('; });
  tel?.addEventListener('input', () => {
    const atEnd = tel.selectionStart === tel.value.length;
    tel.value = mask(tel.value);
    if (atEnd) tel.setSelectionRange(tel.value.length, tel.value.length);
  });

  const check = () => {
    let good = true;
    if (!name.value.trim()) { setErr(name, 'Напишите, как к вам обращаться'); good = false; }
    else setErr(name, '');
    if (tel.value.replace(/\D/g, '').length !== 11) { setErr(tel, 'Введите номер полностью'); good = false; }
    else setErr(tel, '');
    if (ok && !ok.checked) good = false;
    return good;
  };

  form.removeAttribute('onsubmit');
  form.setAttribute('novalidate', '');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!check()) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }

    btn.disabled = true;
    btn.textContent = 'Отправляем…';

    try {
      const r = await fetch(LEAD_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:  name.value.trim(),
          phone: tel.value,
          date:  form.querySelector('input[name="date"]')?.value.trim() || '',
          company: form.querySelector('input[name="company"]')?.value || ''
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.error || 'Не удалось отправить');

      const done = document.createElement('p');
      done.className = 'sent';
      done.setAttribute('role', 'status');
      done.textContent = 'Запрос получен. Менеджер проверит дату и свяжется с вами.';
      form.replaceChildren(done);
    } catch (err) {
      // заявка не должна теряться: показываем запасной путь связи
      let box = form.querySelector('.fail');
      if (!box) {
        box = document.createElement('p');
        box.className = 'fail';
        box.setAttribute('role', 'alert');
        btn.insertAdjacentElement('afterend', box);
      }
      box.innerHTML = 'Не получилось отправить. Напишите на ' +
        '<a href="mailto:soldout-loft@yandex.ru">soldout-loft@yandex.ru</a>, ' +
        'позвоните <a href="tel:+79853624558">+7 985 362-45-58</a> ' +
        'или в <a href="https://t.me/shipovegor" target="_blank" rel="noopener">Telegram</a>.';
      btn.disabled = false;
      btn.textContent = 'Отправить запрос';
    }
  });
})();
