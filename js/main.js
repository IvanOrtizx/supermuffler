import { CONFIG } from './config.js';
import { ES, DYN } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
};

/* =====================================================================
   Language (EN lives in the HTML, ES comes from i18n.js)
   ===================================================================== */
const originals = new Map();
const metaDesc = $('meta[name="description"]');
const EN_META = { title: document.title, desc: metaDesc ? metaDesc.content : '' };

function snapshot() {
  $$('[data-i18n]').forEach(el => originals.set(el, { text: el.textContent }));
  $$('[data-i18n-html]').forEach(el => originals.set(el, { html: el.innerHTML }));
  $$('[data-i18n-attr]').forEach(el => {
    const o = originals.get(el) || {};
    o.attrs = {};
    el.dataset.i18nAttr.split(',').forEach(pair => {
      const [attr] = pair.split(':');
      o.attrs[attr] = el.getAttribute(attr);
    });
    originals.set(el, o);
  });
}

let lang = 'en';
function t(key) { return DYN[lang][key]; }

function applyLang(next) {
  lang = next === 'es' ? 'es' : 'en';
  const es = lang === 'es';
  document.documentElement.lang = lang;

  $$('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    el.textContent = es && ES[k] != null ? ES[k] : originals.get(el).text;
  });
  $$('[data-i18n-html]').forEach(el => {
    const k = el.dataset.i18nHtml;
    el.innerHTML = es && ES[k] != null ? ES[k] : originals.get(el).html;
  });
  $$('[data-i18n-attr]').forEach(el => {
    const o = originals.get(el);
    el.dataset.i18nAttr.split(',').forEach(pair => {
      const [attr, key] = pair.split(':');
      const v = es && ES[key] != null ? ES[key] : o.attrs[attr];
      if (v != null) el.setAttribute(attr, v);
    });
  });

  document.title = es ? ES['meta.title'] : EN_META.title;
  if (metaDesc) metaDesc.content = es ? ES['meta.desc'] : EN_META.desc;
  $$('.lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  store.set('sm-lang', lang);

  updateStatus();
  updateVideoTitles();
}

function initialLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'es' || q === 'en') return q;
  const saved = store.get('sm-lang');
  if (saved === 'es' || saved === 'en') return saved;
  const langs = navigator.languages || [navigator.language || 'en'];
  return langs.some(l => /^es\b/i.test(l)) ? 'es' : 'en';
}

/* =====================================================================
   Open / closed status (shop time, America/Los_Angeles)
   ===================================================================== */
function shopNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CONFIG.timeZone, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = type => (parts.find(p => p.type === type) || {}).value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, mins: (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10) };
}
const fmtHour = h => `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`;

function updateStatus() {
  const { day, mins } = shopNow();
  const today = CONFIG.hours[day];
  let state = 'closed', text;
  if (today && mins >= today[0] * 60 && mins < today[1] * 60) {
    state = today[1] * 60 - mins <= 60 ? 'soon' : 'open';
    text = t(state).replace('{t}', fmtHour(today[1]));
  } else if (today && mins < today[0] * 60) {
    text = t('closedToday').replace('{t}', fmtHour(today[0]));
  } else {
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7, h = CONFIG.hours[d];
      if (!h) continue;
      text = i === 1
        ? t('closedTomorrow').replace('{t}', fmtHour(h[0]))
        : t('closedDay').replace('{d}', t('days')[d]).replace('{t}', fmtHour(h[0]));
      break;
    }
  }
  $$('[data-status]').forEach(el => {
    el.dataset.state = state;
    const tx = $('[data-status-text]', el);
    if (tx) tx.textContent = text || '';
  });
  $$('.hours tr').forEach(tr => tr.classList.toggle('is-today', Number(tr.dataset.day) === day));
}

/* =====================================================================
   Mobile menu
   ===================================================================== */
function initMenu() {
  const btn = $('#menuBtn'), nav = $('#siteNav');
  if (!btn || !nav) return;
  const close = () => { nav.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

/* =====================================================================
   3D exhaust explorer
   ===================================================================== */
const hero = $('.hero');
const hero3d = $('#hero3d');
const stageCar = $('#stageCar');
const panel = $('#partPanel');
const wide = matchMedia('(min-width: 960px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let x3d = null;
let currentPart = null;

function frame(w, h) {
  const H = hero3d.getBoundingClientRect();
  const r = stageCar.getBoundingClientRect();
  let cx = (r.left + r.width / 2 - H.left) / w;
  const cy = (r.top + r.height / 2 - H.top) / h;
  // on wide screens the info panel sits on the right, so slide the focused part left of it
  if (currentPart && wide.matches && !panel.hidden) cx -= (panel.getBoundingClientRect().width * 0.5) / w;
  return { cx, cy, sx: r.width / w, sy: r.height / h };
}

function setPart(id) {
  currentPart = id || null;
  $$('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.part === currentPart)));
  $$('[data-part-info]', panel).forEach(a => a.classList.toggle('is-active', a.dataset.partInfo === currentPart));
  panel.hidden = !currentPart;
  hero3d.classList.toggle('is-focus', !!currentPart);
  if (x3d) { x3d.focus(currentPart); x3d.resize(); }
}

function initParts() {
  $$('.chip, .x3d-label').forEach(b => b.addEventListener('click', () => {
    setPart(currentPart === b.dataset.part && b.classList.contains('chip') ? null : b.dataset.part);
  }));
  $('[data-part-close]', panel).addEventListener('click', () => setPart(null));
  $$('[data-goto-part]').forEach(b => b.addEventListener('click', () => {
    hero.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    setTimeout(() => setPart(b.dataset.gotoPart), reduced ? 0 : 450);
  }));
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch (e) { return false; }
}

function showPoster() {
  const p = $('#x3dPoster');
  if (p) p.hidden = false;
}

// On phones the copy sits above the car, so the canvas only needs to cover the lower part of the hero
function placeCanvas() {
  if (wide.matches) { hero3d.style.top = ''; return; }
  const top = stageCar.getBoundingClientRect().top - hero.getBoundingClientRect().top - 70;
  hero3d.style.top = `${Math.max(0, Math.round(top))}px`;
}

async function load3D() {
  if (!hasWebGL()) { showPoster(); return; }
  placeCanvas();
  new ResizeObserver(placeCanvas).observe(hero);
  try {
    const { mountExhaust } = await import('./exhaust3d.js');
    const labels = {};
    $$('.x3d-label', hero3d).forEach(b => { labels[b.dataset.part] = b; });
    x3d = mountExhaust(hero3d, {
      labels,
      frame,
      reducedMotion: reduced,
      onFocus: id => setPart(id)
    });
    hero.classList.add('is-3d');
    new ResizeObserver(() => x3d && x3d.resize()).observe(stageCar);
    if (currentPart) x3d.focus(currentPart);
  } catch (err) {
    console.warn('3D view unavailable:', err);
    showPoster();
  }
}

/* =====================================================================
   Gallery viewer
   ===================================================================== */
function initGallery() {
  const items = $$('.g-item');
  const dlg = $('#lightbox');
  const img = $('#lbImg');
  const cap = $('#lbCaption');
  if (!items.length || !dlg) return;
  let idx = 0;
  const show = i => {
    idx = (i + items.length) % items.length;
    const thumb = $('img', items[idx]);
    img.src = items[idx].dataset.full;
    img.alt = thumb.alt;
    cap.textContent = thumb.alt;
  };
  items.forEach((b, i) => b.addEventListener('click', () => {
    if (typeof dlg.showModal !== 'function') { window.open(b.dataset.full, '_blank', 'noopener'); return; }
    show(i);
    dlg.showModal();
  }));
  dlg.addEventListener('click', e => {
    const a = e.target.closest('[data-lb]');
    if (a) {
      if (a.dataset.lb === 'close') dlg.close();
      if (a.dataset.lb === 'prev') show(idx - 1);
      if (a.dataset.lb === 'next') show(idx + 1);
    } else if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
}

/* =====================================================================
   Videos and posts (from config.js)
   Instagram uses its official embed, loaded only when the section gets close.
   TikTok / YouTube show a cover first and load the player on tap.
   ===================================================================== */
function embedUrl(v) {
  if (v.platform === 'tiktok') return `https://www.tiktok.com/embed/v2/${encodeURIComponent(v.id)}`;
  if (v.platform === 'youtube') return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0`;
  return '';
}
const videoTitle = v => (v.title && (v.title[lang] || v.title.en)) || '';

function loadInstagram() {
  const run = () => window.instgrm && window.instgrm.Embeds.process();
  if (window.instgrm) { run(); return; }
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.instagram.com/embed.js';
  s.onload = run;
  document.body.appendChild(s);
}

function renderVideos() {
  const grid = $('#videoGrid');
  if (!grid) return;
  const list = (CONFIG.videos || []).filter(v => v && v.id && (v.platform === 'instagram' || embedUrl(v)));
  grid.hidden = !list.length;
  if (!list.length) return;

  list.forEach(v => {
    const card = document.createElement('div');
    if (v.platform === 'instagram') {
      card.className = 'video-card is-ig';
      const url = `https://www.instagram.com/p/${encodeURIComponent(v.id)}/`;
      const q = document.createElement('blockquote');
      q.className = 'instagram-media';
      q.setAttribute('data-instgrm-permalink', url);
      q.setAttribute('data-instgrm-version', '14');
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener';
      a.textContent = 'Instagram @supermufflerinc';
      q.appendChild(a);
      card.appendChild(q);
    } else {
      card.className = 'video-card';
      const btn = document.createElement('button');
      btn.type = 'button';
      if (v.poster) {
        const im = document.createElement('img');
        im.src = v.poster; im.alt = ''; im.loading = 'lazy';
        btn.appendChild(im);
      }
      const play = document.createElement('span'); play.className = 'play'; play.setAttribute('aria-hidden', 'true');
      const tt = document.createElement('span'); tt.className = 'v-title';
      btn.append(play, tt);
      btn.addEventListener('click', () => {
        const f = document.createElement('iframe');
        f.src = embedUrl(v);
        f.title = videoTitle(v) || 'Video';
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        f.allowFullscreen = true;
        card.replaceChildren(f);
      });
      card.appendChild(btn);
      card._video = v;
    }
    grid.appendChild(card);
  });
  updateVideoTitles();

  if (list.some(v => v.platform === 'instagram')) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => {
        if (es.some(e => e.isIntersecting)) { io.disconnect(); loadInstagram(); }
      }, { rootMargin: '800px 0px' });
      io.observe(grid);
    } else loadInstagram();
  }
}

function updateVideoTitles() {
  $$('#videoGrid .video-card').forEach(card => {
    const v = card._video; if (!v) return;
    const btn = $('button', card), tt = $('.v-title', card);
    if (tt) tt.textContent = videoTitle(v);
    if (btn) btn.setAttribute('aria-label', `${t('play')}: ${videoTitle(v)}`);
  });
}

/* =====================================================================
   Contact form -> Google Apps Script -> back office (Google Sheet)
   Collects name, email, phone and how they heard about the shop for CRM follow-up.
   ===================================================================== */
function captureUtm() {
  const q = new URLSearchParams(location.search);
  ['utm_source', 'utm_medium', 'utm_campaign'].forEach(k => {
    if (q.get(k)) { try { sessionStorage.setItem(k, q.get(k)); } catch (e) { /* ignore */ } }
  });
}
const utm = k => { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } };

function initForm() {
  const form = $('#leadForm');
  if (!form) return;
  const status = $('#formStatus');
  const submit = $('#formSubmit');
  const started = Date.now();

  const setStatus = (state, msg, html) => {
    status.dataset.state = state || '';
    if (html) status.innerHTML = msg; else status.textContent = msg || '';
  };
  const mark = (el, bad) => el.setAttribute('aria-invalid', bad ? 'true' : 'false');

  form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true') mark(e.target, false); });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = form.elements;
    const name = f.name.value.trim();
    const phone = f.phone.value.trim();
    const digits = phone.replace(/\D/g, '');
    const email = f.email.value.trim();
    const problems = [];
    const bad = [];

    if (name.length < 2) { problems.push(t('errName')); bad.push(f.name); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { problems.push(t('errEmail')); bad.push(f.email); }
    if (!(digits.length === 10 || (digits.length === 11 && digits[0] === '1'))) { problems.push(t('errPhone')); bad.push(f.phone); }
    if (!f.consent.checked) { problems.push(t('errConsent')); bad.push(f.consent); }
    [f.name, f.phone, f.email, f.consent].forEach(el => mark(el, bad.includes(el)));
    if (bad.length) {
      setStatus('error', problems.join(' '));
      bad[0].focus();
      return;
    }

    // simple bot traps: hidden field filled, or sent impossibly fast
    if (f.company.value || Date.now() - started < 2500) {
      setStatus('ok', t('ok').replace('{n}', name.split(' ')[0]));
      form.reset();
      return;
    }

    if (!CONFIG.formEndpoint) {
      setStatus('error', t('offline'));
      return;
    }

    const payload = new URLSearchParams({
      name, email, phone,
      source: f.source.value,
      consent: 'yes',
      consentText: $('[data-i18n="form.consent"]').textContent.trim(),
      lang,
      page: location.origin + location.pathname,
      referrer: document.referrer || '',
      utm_source: utm('utm_source'),
      utm_medium: utm('utm_medium'),
      utm_campaign: utm('utm_campaign')
    });

    submit.disabled = true;
    setStatus('sending', t('sending'));
    try {
      const res = await fetch(CONFIG.formEndpoint, { method: 'POST', body: payload });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Rejected');
      form.reset();
      setStatus('ok', t('ok').replace('{n}', name.split(' ')[0]));
    } catch (err) {
      setStatus('error', t('fail'));
    } finally {
      submit.disabled = false;
    }
  });
}

/* =====================================================================
   Boot
   ===================================================================== */
snapshot();
renderVideos();
applyLang(initialLang());
$$('.lang-btn').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));
setInterval(updateStatus, 60 * 1000);
initMenu();
initParts();
initGallery();
captureUtm();
initForm();
const yr = $('#year');
if (yr) yr.textContent = String(new Date().getFullYear());

const start3D = () => load3D();
if ('requestIdleCallback' in window) requestIdleCallback(start3D, { timeout: 1200 });
else setTimeout(start3D, 300);
