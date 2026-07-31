/* ═══════════════════════════════════════════════════════════════
   SOLDOUT LOFT — поведение страницы
   Без сторонних библиотек: всё, что нужно, закрывается
   IntersectionObserver, requestAnimationFrame и CSS-переходами.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* Контакты в одном месте: меняются здесь, а не по всей разметке. */
const CONTACTS = {
  phone:    '+7 985 362-45-58',
  phoneRaw: '+79853624558',
  telegram: 'shipovegor',
  email:    'soldout-loft@yandex.ru',
  address:  'ул. Малая Семёновская, д. 5, стр. 10',
  metro:    'Электрозаводская',
};

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ── шапка ──────────────────────────────────────────────────── */
(() => {
  const top = $('#top');
  if (!top) return;
  const sync = () => top.classList.toggle('pinned', scrollY > 40);
  sync();
  addEventListener('scroll', sync, { passive: true });
})();

/* ── мобильное меню ─────────────────────────────────────────── */
(() => {
  const burger = $('#burger'), sheet = $('#sheet');
  if (!burger || !sheet) return;

  const setOpen = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    sheet.classList.toggle('open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) sheet.querySelector('a')?.focus();
  };
  burger.addEventListener('click', () => setOpen(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a, button', sheet).forEach(el => el.addEventListener('click', () => setOpen(false)));
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && sheet.classList.contains('open')) { setOpen(false); burger.focus(); }
  });
})();

/* ── появление блоков ───────────────────────────────────────── */
(() => {
  const items = $$('[data-rv], [data-rv-img]');
  if (!items.length || REDUCED) { items.forEach(i => i.classList.add('seen')); return; }

  const io = new IntersectionObserver((entries) => {
    entries.filter(e => e.isIntersecting).forEach((e, i) => {
      setTimeout(() => e.target.classList.add('seen'), Math.min(i, 4) * 80);
      io.unobserve(e.target);
    });
  }, { threshold: 0, rootMargin: '0px 0px -8% 0px' });

  items.forEach(el => io.observe(el));

  /* Страховка: если наблюдатель промахнулся (переход по якорю, восстановление
     позиции), показываем всё, что уже попало в экран. */
  const sweep = () => $$('[data-rv]:not(.seen), [data-rv-img]:not(.seen)').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 1.15 && r.bottom > -120) el.classList.add('seen');
  });
  addEventListener('scroll', sweep, { passive: true });
  addEventListener('load', sweep);
  setTimeout(sweep, 1400);
})();

/* ── дрейф слова SOLDOUT при прокрутке ──────────────────────── */
(() => {
  const rows = $$('[data-drift]');
  if (!rows.length || REDUCED) return;
  let tick = false;
  const move = () => {
    rows.forEach(row => {
      const r = row.getBoundingClientRect();
      if (r.bottom < -200 || r.top > innerHeight + 200) return;
      const p = (innerHeight - r.top) * parseFloat(row.dataset.drift);
      row.style.transform = `translate3d(${p.toFixed(1)}px,0,0)`;
    });
    tick = false;
  };
  addEventListener('scroll', () => {
    if (!tick) { tick = true; requestAnimationFrame(move); }
  }, { passive: true });
  move();
})();

/* ── горизонтальная сцена трансформации ─────────────────────
   На широком экране секция «прилипает» и лента едет вбок ровно на свою
   длину — без пустого хвоста. На узком остаётся обычный свайп. */
(() => {
  const wrap = $('#sceneWrap'), track = $('#sceneTrack'), hint = $('#sceneHint');
  if (!wrap || !track) return;

  const mq = matchMedia('(min-width: 1024px)');
  let pinned = false, onScroll = null;

  const teardown = () => {
    pinned = false;
    if (onScroll) removeEventListener('scroll', onScroll);
    onScroll = null;
    wrap.style.cssText = '';
    track.style.cssText = '';
    track.style.overflowX = 'auto';
    track.style.scrollSnapType = 'x mandatory';
    $$('.scene__item', track).forEach(i => i.style.scrollSnapAlign = 'center');
    if (hint) hint.textContent = 'Прокрутите вбок →';
  };

  const setup = () => {
    if (REDUCED) return teardown();
    track.style.overflowX = 'visible';
    track.style.scrollSnapType = '';
    $$('.scene__item', track).forEach(i => i.style.scrollSnapAlign = '');

    const dist = Math.max(0, track.scrollWidth - innerWidth + 80);
    if (dist < 80) return teardown();

    pinned = true;
    wrap.style.height = `${innerHeight + dist}px`;
    wrap.style.position = 'relative';
    const inner = track.parentElement;
    inner.style.position = 'sticky';
    inner.style.top = '0';
    inner.style.height = '100svh';
    inner.style.display = 'flex';
    inner.style.flexDirection = 'column';
    inner.style.justifyContent = 'center';
    inner.style.overflow = 'hidden';

    let tick = false;
    const run = () => {
      const r = wrap.getBoundingClientRect();
      const p = Math.min(Math.max(-r.top / dist, 0), 1);
      track.style.transform = `translate3d(${(-p * dist).toFixed(1)}px,0,0)`;
      tick = false;
    };
    onScroll = () => { if (!tick) { tick = true; requestAnimationFrame(run); } };
    addEventListener('scroll', onScroll, { passive: true });
    run();
    if (hint) hint.textContent = 'Листайте вниз — кадры идут вбок';
  };

  const apply = () => { teardown(); if (mq.matches) setup(); };
  apply();
  mq.addEventListener('change', apply);
  addEventListener('resize', () => { clearTimeout(window.__st); window.__st = setTimeout(apply, 220); });
})();

/* ── общая механика модальных окон (Esc, клик вне, ловушка фокуса) ── */
function makeModal(el, { onOpen } = {}) {
  if (!el) return { open(){}, close(){} };
  let lastFocus = null;

  const focusable = () => $$('a[href], button:not([disabled]), input, textarea, iframe, [tabindex]:not([tabindex="-1"])', el)
    .filter(n => n.offsetParent !== null || n.tagName === 'IFRAME');

  const trap = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const f = focusable();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  function open() {
    lastFocus = document.activeElement;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('open'));
    document.body.style.overflow = 'hidden';
    addEventListener('keydown', trap);
    onOpen?.();
    setTimeout(() => focusable()[0]?.focus(), 60);
  }
  function close() {
    el.classList.remove('open');
    document.body.style.overflow = '';
    removeEventListener('keydown', trap);
    setTimeout(() => { el.hidden = true; }, 420);
    lastFocus?.focus();
  }

  el.addEventListener('click', e => { if (e.target === el) close(); });
  $$('[data-close]', el).forEach(b => b.addEventListener('click', close));
  return { open, close };
}

/* ── календарь занятости ────────────────────────────────────── */
(() => {
  const frame = $('#calFrame');
  const modal = makeModal($('#calModal'), {
    onOpen: () => { if (frame && !frame.src && frame.dataset.src) frame.src = frame.dataset.src; }
  });
  $$('[data-cal]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); modal.open(); }));
})();

/* ── банковские реквизиты ───────────────────────────────────── */
(() => {
  const modal = makeModal($('#reqModal'));
  $('#reqBtn')?.addEventListener('click', modal.open);
})();

/* ── просмотр фотографий ────────────────────────────────────── */
(() => {
  const lb = $('#lb'), img = $('#lbImg');
  const figs = $$('#grid figure');
  if (!lb || !figs.length) return;

  const shots = figs.map(f => {
    const i = $('img', f);
    return { src: i.currentSrc || i.src, alt: i.alt, cap: $('figcaption', f)?.textContent.trim() || '' };
  });
  let idx = 0;
  const modal = makeModal(lb);

  const show = (i) => {
    idx = (i + shots.length) % shots.length;
    const s = shots[idx];
    img.src = s.src; img.alt = s.alt;
    $('#lbCap').textContent = s.cap;
    $('#lbNum').textContent = `${idx + 1} / ${shots.length}`;
  };

  figs.forEach((f, i) => {
    f.tabIndex = 0;
    f.setAttribute('role', 'button');
    f.setAttribute('aria-label', `Открыть фото: ${shots[i].cap || shots[i].alt}`);
    const go = () => { show(i); modal.open(); };
    f.addEventListener('click', go);
    f.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });

  $$('[data-lb-go]', lb).forEach(b =>
    b.addEventListener('click', () => show(idx + Number(b.dataset.lbGo))));
  $$('[data-lb-close]', lb).forEach(b => b.addEventListener('click', modal.close));
  $('.lb__stage', lb)?.addEventListener('click', e => { if (e.target.classList.contains('lb__stage')) modal.close(); });

  addEventListener('keydown', e => {
    if (lb.hidden) return;
    if (e.key === 'ArrowLeft')  show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });

  let x0 = 0;
  lb.addEventListener('touchstart', e => x0 = e.changedTouches[0].clientX, { passive: true });
  lb.addEventListener('touchend', e => {
    const d = e.changedTouches[0].clientX - x0;
    if (Math.abs(d) > 55) show(idx + (d < 0 ? 1 : -1));
  }, { passive: true });
})();

/* ── форма заявки ───────────────────────────────────────────── */
(() => {
  const form = $('#form'); if (!form) return;
  const tel = $('#f-tel'), btn = $('#submit'), msg = $('#formMsg');

  /* маска телефона: +7 (999) 123-45-67 */
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
  tel?.addEventListener('input', () => {
    const end = tel.selectionStart === tel.value.length;
    tel.value = mask(tel.value);
    if (end) tel.setSelectionRange(tel.value.length, tel.value.length);
  });
  tel?.addEventListener('focus', () => { if (!tel.value) tel.value = '+7 ('; });

  const setErr = (field, text) => {
    const box = $(`[data-err-for="${field.id}"]`);
    if (box) box.textContent = text;
    field.setAttribute('aria-invalid', text ? 'true' : 'false');
  };

  const validate = () => {
    let ok = true;
    const name = $('#f-name');
    if (!name.value.trim()) { setErr(name, 'Напишите, как к вам обращаться'); ok = false; }
    else setErr(name, '');

    const digits = tel.value.replace(/\D/g, '');
    if (digits.length !== 11) { setErr(tel, 'Введите номер полностью'); ok = false; }
    else setErr(tel, '');

    if (!$('#f-ok').checked) ok = false;
    return ok;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) { form.querySelector('[aria-invalid="true"]')?.focus(); return; }

    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Отправляем…';

    // TODO: подключить приём заявок (Formspree, CRM или свой обработчик).
    // Ниже — заглушка, чтобы интерфейс вёл себя как на боевом сайте.
    await new Promise(r => setTimeout(r, 700));

    form.querySelectorAll('.field, .agree, #submit').forEach(n => n.hidden = true);
    msg.hidden = false;
    msg.className = 'sent';
    msg.setAttribute('role', 'status');
    msg.textContent = 'Запрос получен. Менеджер проверит дату и свяжется с вами.';
    btn.textContent = label;
  });
})();

/* ── cookie ─────────────────────────────────────────────────── */
(() => {
  const box = $('#ck'); if (!box) return;
  const KEY = 'soldout-cookie';

  const apply = (v) => {
    if (v === 'all') {
      /* сюда подключается аналитика — она не грузится до согласия */
    }
  };

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved) { apply(saved); return; }

  setTimeout(() => box.classList.add('show'), 1500);
  $$('[data-ck]', box).forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.ck;
    try { localStorage.setItem(KEY, v); } catch (e) {}
    box.classList.remove('show');
    apply(v);
  }));
})();
