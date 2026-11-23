import { CONFIG } from '../js/config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const store = {
  get(k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v, keep) { try { (keep ? localStorage : sessionStorage).setItem(k, v); } catch (e) { /* private mode */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }
};

const STATUSES = ['New', 'Added to CRM', 'Customer', 'Unsubscribed', 'Spam'];
const T = {
  en: {
    title: 'Contacts panel', logout: 'Log out', loginTitle: 'Website contacts',
    loginText: 'Enter the panel password to see the people who left their info on the website.',
    password: 'Password', open: 'Open panel', demoHint: 'Demo: the password is demo',
    demoBanner: 'Demo with sample data. Real contacts from the website form will show here once the form is connected.',
    contacts: 'Contacts', refresh: 'Refresh', export: 'Download CSV', searchLabel: 'Search contacts',
    search: 'Search by name, email or phone', filterAria: 'Filter by status', all: 'All',
    colDate: 'Received', colName: 'Name', colEmail: 'Email', colPhone: 'Phone', colSource: 'Heard about us', colLang: 'Language', colStatus: 'Status',
    status: { 'New': 'New', 'Added to CRM': 'Added to CRM', 'Customer': 'Customer', 'Unsubscribed': 'Unsubscribed', 'Spam': 'Spam' },
    langs: { English: 'English', Spanish: 'Spanish' },
    count: n => `${n} ${n === 1 ? 'contact' : 'contacts'}`,
    showing: (a, b) => `Showing ${a} of ${b}`,
    empty: 'No contacts yet. When someone sends the form on the website, they show up here.',
    noMatch: 'No contacts match this search.',
    loading: 'Loading contacts…', checking: 'Checking…',
    errPassword: 'That password is not right. Try again.',
    errLocked: 'Too many wrong tries. Wait 10 minutes and try again.',
    errNoPassword: 'The panel password has not been set yet (Google Sheet > Super Muffler > Set panel password).',
    errNet: 'Could not reach the contacts. Check the internet connection and press Refresh.',
    errSave: 'The status did not save. Try again.',
    saved: 'Saved.',
    changeTitle: 'Choose your password', changeText: 'You logged in with the temporary password. Choose a new one to open the panel.',
    newPw: 'New password (at least 8 characters)', newPw2: 'Type it again', saveOpen: 'Save and open panel',
    errShort: 'Use at least 8 characters.', errMatch: 'The two passwords are different.', errSame: 'Choose a password different from the temporary one.',
    pwSaved: 'Password saved. Use it from now on.',
    updated: t => `Updated ${t}`,
    via: 'via'
  },
  es: {
    title: 'Panel de contactos', logout: 'Salir', loginTitle: 'Contactos de la página',
    loginText: 'Escribe la contraseña del panel para ver las personas que dejaron sus datos en la página.',
    password: 'Contraseña', open: 'Abrir panel', demoHint: 'Demo: la contraseña es demo',
    demoBanner: 'Demo con datos de ejemplo. Aquí aparecerán los contactos reales del formulario cuando esté conectado.',
    contacts: 'Contactos', refresh: 'Actualizar', export: 'Descargar CSV', searchLabel: 'Buscar contactos',
    search: 'Buscar por nombre, correo o teléfono', filterAria: 'Filtrar por estado', all: 'Todos',
    colDate: 'Recibido', colName: 'Nombre', colEmail: 'Correo', colPhone: 'Teléfono', colSource: 'Cómo nos conoció', colLang: 'Idioma', colStatus: 'Estado',
    status: { 'New': 'Nuevo', 'Added to CRM': 'Pasado al CRM', 'Customer': 'Cliente', 'Unsubscribed': 'Dado de baja', 'Spam': 'Spam' },
    langs: { English: 'Inglés', Spanish: 'Español' },
    count: n => `${n} ${n === 1 ? 'contacto' : 'contactos'}`,
    showing: (a, b) => `Mostrando ${a} de ${b}`,
    empty: 'Todavía no hay contactos. Cuando alguien envíe el formulario de la página, aparece aquí.',
    noMatch: 'Ningún contacto coincide con la búsqueda.',
    loading: 'Cargando contactos…', checking: 'Revisando…',
    errPassword: 'La contraseña no es correcta. Intenta de nuevo.',
    errLocked: 'Demasiados intentos fallidos. Espera 10 minutos e intenta de nuevo.',
    errNoPassword: 'Todavía no se ha puesto la contraseña del panel (Hoja de Google > Super Muffler > Set panel password).',
    errNet: 'No se pudieron cargar los contactos. Revisa la conexión a internet y presiona Actualizar.',
    errSave: 'El estado no se guardó. Intenta de nuevo.',
    saved: 'Guardado.',
    changeTitle: 'Elige tu contraseña', changeText: 'Entraste con la contraseña temporal. Elige una nueva para abrir el panel.',
    newPw: 'Contraseña nueva (mínimo 8 caracteres)', newPw2: 'Escríbela otra vez', saveOpen: 'Guardar y abrir el panel',
    errShort: 'Usa mínimo 8 caracteres.', errMatch: 'Las dos contraseñas no son iguales.', errSame: 'Elige una contraseña diferente a la temporal.',
    pwSaved: 'Contraseña guardada. Úsala de ahora en adelante.',
    updated: t => `Actualizado ${t}`,
    via: 'por'
  }
};

const DEMO = !CONFIG.formEndpoint;
let lang = 'en';
let token = null;
let rows = [];
let filter = 'all';
const tt = k => T[lang][k];

/* ---------- language ---------- */
function applyLang(l) {
  lang = l === 'es' ? 'es' : 'en';
  document.documentElement.lang = lang;
  $$('[data-t]').forEach(el => { const v = tt(el.dataset.t); if (typeof v === 'string') el.textContent = v; });
  $$('[data-t-ph]').forEach(el => { el.placeholder = tt(el.dataset.tPh); });
  $$('[data-t-aria]').forEach(el => el.setAttribute('aria-label', tt(el.dataset.tAria)));
  $$('.lang-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  document.title = `${tt('title')} | Super Muffler Inc.`;
  store.set('sm-lang', lang, true);
  if (!$('#app').hidden) render();
}

/* ---------- data ---------- */
async function api(action, params = {}) {
  const res = await fetch(CONFIG.formEndpoint, { method: 'POST', body: new URLSearchParams({ action, ...params }) });
  return res.json();
}

function demoRows() {
  const now = Date.now(), d = days => new Date(now - days * 864e5 - Math.random() * 36e5 * 8).toISOString();
  return [
    { id: 'demo01', received: d(0.1), status: 'New', name: 'Marco Delgado', email: 'marco.delgado@example.com', phone: '(805) 555-0142', source: 'Instagram', lang: 'Spanish' },
    { id: 'demo02', received: d(0.6), status: 'New', name: 'Jessica Turner', email: 'jturner@example.com', phone: '(805) 555-0187', source: 'Google', lang: 'English' },
    { id: 'demo03', received: d(1.2), status: 'Added to CRM', name: 'Ramón Castillo', email: 'ramon.c@example.com', phone: '(805) 555-0119', source: 'Drove by', lang: 'Spanish' },
    { id: 'demo04', received: d(2.4), status: 'Customer', name: 'Kevin Brooks', email: 'kbrooks@example.com', phone: '(805) 555-0163', source: 'Referral', lang: 'English' },
    { id: 'demo05', received: d(3.1), status: 'Added to CRM', name: 'Alicia Moreno', email: 'alicia.moreno@example.com', phone: '(805) 555-0175', source: 'TikTok', lang: 'Spanish' },
    { id: 'demo06', received: d(5.5), status: 'New', name: 'Tyler Hughes', email: 'tyler.h@example.com', phone: '(805) 555-0124', source: 'Facebook', lang: 'English' },
    { id: 'demo07', received: d(8.2), status: 'Customer', name: 'Guadalupe Ortega', email: 'lupe.ortega@example.com', phone: '(805) 555-0198', source: 'Google', lang: 'Spanish' },
    { id: 'demo08', received: d(12), status: 'Unsubscribed', name: 'Brian Foster', email: 'bfoster@example.com', phone: '(805) 555-0131', source: '', lang: 'English' }
  ];
}

function setStatusMsg(state, msg) {
  const el = $('#appStatus');
  el.dataset.state = state || '';
  el.textContent = msg || '';
}

async function loadRows() {
  if (DEMO) { if (!rows.length) rows = demoRows(); render(); stamp(); return; }
  setStatusMsg('', tt('loading'));
  try {
    const data = await api('list', { token });
    if (data.error === 'auth') { logout(); return; }
    if (data.error === 'mustchange') { showChange(); return; }
    if (!data.ok) throw new Error(data.error);
    rows = data.rows || [];
    render();
    stamp();
  } catch (err) {
    setStatusMsg('error', tt('errNet'));
  }
}
function stamp() {
  const time = new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date());
  setStatusMsg('', tt('updated')(time));
}

/* ---------- view ---------- */
const fmtDate = iso => {
  const dt = new Date(iso);
  if (isNaN(dt)) return iso || '';
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: CONFIG.timeZone
  }).format(dt);
};
const sourceLabel = s => {
  const es = { 'Drove by': 'Pasó por el taller', 'Referral': 'Amigo o familiar', 'Other': 'Otro' };
  return lang === 'es' ? (es[s] || s) : (s === 'Referral' ? 'Friend or family' : s);
};

function visibleRows() {
  const q = $('#q').value.trim().toLowerCase();
  const qd = q.replace(/\D/g, '');
  return rows.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (!q) return true;
    return [r.name, r.email].some(v => String(v).toLowerCase().includes(q)) ||
      (qd.length >= 3 && String(r.phone).replace(/\D/g, '').includes(qd));
  });
}

function el(tag, props = {}, kids = []) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  });
  kids.forEach(k => k && e.appendChild(k));
  return e;
}

function renderFilters() {
  const box = $('#filters');
  const counts = { all: rows.length };
  STATUSES.forEach(s => { counts[s] = rows.filter(r => r.status === s).length; });
  box.replaceChildren(...['all', ...STATUSES].filter(s => s === 'all' || counts[s] || s === 'New').map(s => {
    const b = el('button', { type: 'button', class: 'filter', 'aria-pressed': String(filter === s) },
      [document.createTextNode(s === 'all' ? tt('all') : tt('status')[s]), el('b', { text: String(counts[s]) })]);
    b.addEventListener('click', () => { filter = s; render(); });
    return b;
  }));
}

function render() {
  renderFilters();
  const list = visibleRows();
  $('#count').textContent = list.length === rows.length ? tt('count')(rows.length) : tt('showing')(list.length, rows.length);
  const body = $('#rows');
  body.replaceChildren(...list.map(r => {
    const sel = el('select', { 'aria-label': `${tt('colStatus')}: ${r.name}` },
      STATUSES.map(s => { const o = el('option', { value: s, text: tt('status')[s] }); if (s === r.status) o.selected = true; return o; }));
    sel.addEventListener('change', () => changeStatus(r, sel));
    const phoneDigits = String(r.phone).replace(/\D/g, '');
    return el('tr', { 'data-status': r.status }, [
      el('td', { class: 'c-date', text: fmtDate(r.received) }),
      el('td', { class: 'c-name', text: r.name }),
      el('td', { class: 'c-email' }, [r.email ? el('a', { href: `mailto:${r.email}`, text: r.email }) : null]),
      el('td', { class: 'c-phone' }, [r.phone ? el('a', { href: `tel:+1${phoneDigits.slice(-10)}`, text: r.phone }) : null]),
      el('td', { class: 'c-meta', text: r.source ? sourceLabel(r.source) : '—' }),
      el('td', { class: 'c-meta', text: tt('langs')[r.lang] || r.lang || '' }),
      el('td', { class: 'c-status' }, [sel])
    ]);
  }));
  const empty = $('#empty');
  empty.hidden = list.length > 0;
  empty.textContent = rows.length ? tt('noMatch') : tt('empty');
  $('#table').hidden = list.length === 0;
}

async function changeStatus(r, sel) {
  const prev = r.status, next = sel.value;
  r.status = next;
  sel.closest('tr').dataset.status = next;
  renderFilters();
  if (DEMO) { setStatusMsg('', tt('saved')); return; }
  try {
    const data = await api('status', { token, id: r.id, status: next });
    if (data.error === 'auth') { logout(); return; }
    if (!data.ok) throw new Error(data.error);
    setStatusMsg('', tt('saved'));
  } catch (err) {
    r.status = prev; sel.value = prev; sel.closest('tr').dataset.status = prev; renderFilters();
    setStatusMsg('error', tt('errSave'));
  }
}

function exportCsv() {
  const list = visibleRows();
  const head = ['Received', 'Name', 'Email', 'Phone', 'Heard about us', 'Language', 'Status'];
  const safe = v => {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;                 // keep spreadsheet formulas out
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...list.map(r => [fmtDate(r.received), r.name, r.email, r.phone, r.source, r.lang, r.status])]
    .map(row => row.map(safe).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `super-muffler-contacts-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- session ---------- */
function showChange() {
  $('#login').hidden = true;
  $('#app').hidden = true;
  $('#changePw').hidden = false;
  $('#logout').hidden = false;
  $('#pw1').focus();
}
function showApp() {
  $('#login').hidden = true;
  $('#changePw').hidden = true;
  $('#app').hidden = false;
  $('#logout').hidden = false;
  $('#demoBanner').hidden = !DEMO;
  loadRows();
}
function logout() {
  token = null; rows = [];
  store.del('sm-panel-token');
  $('#app').hidden = true;
  $('#changePw').hidden = true;
  $('#logout').hidden = true;
  $('#login').hidden = false;
  $('#pw').value = '';
  $('#pw').focus();
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#pw').value;
  const status = $('#loginStatus');
  const btn = $('#loginBtn');
  const fail = msg => { status.dataset.state = 'error'; status.textContent = msg; $('#pw').setAttribute('aria-invalid', 'true'); $('#pw').focus(); };
  if (DEMO) {
    if (pw.trim().toLowerCase() !== 'demo') { fail(tt('errPassword')); return; }
    status.textContent = ''; status.dataset.state = '';
    showApp();
    return;
  }
  btn.disabled = true; status.dataset.state = 'sending'; status.textContent = tt('checking');
  try {
    const data = await api('login', { password: pw });
    if (!data.ok) {
      fail(data.error === 'locked' ? tt('errLocked') : data.error === 'nopassword' ? tt('errNoPassword') : tt('errPassword'));
      return;
    }
    token = data.token;
    store.set('sm-panel-token', token);
    status.textContent = ''; status.dataset.state = '';
    $('#pw').removeAttribute('aria-invalid');
    if (data.mustChange) showChange(); else showApp();
  } catch (err) {
    fail(tt('errNet'));
  } finally {
    btn.disabled = false;
  }
});

$('#changeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const a = $('#pw1').value, b = $('#pw2').value;
  const st = $('#changeStatus');
  const fail = (msg, el) => { st.dataset.state = 'error'; st.textContent = msg; el.setAttribute('aria-invalid', 'true'); el.focus(); };
  ['#pw1', '#pw2'].forEach(s => $(s).removeAttribute('aria-invalid'));
  if (a.length < 8) return fail(tt('errShort'), $('#pw1'));
  if (a === '12345678') return fail(tt('errSame'), $('#pw1'));
  if (a !== b) return fail(tt('errMatch'), $('#pw2'));
  const btn = $('#changeBtn');
  btn.disabled = true; st.dataset.state = 'sending'; st.textContent = tt('checking');
  try {
    const data = await api('changePassword', { token, newPassword: a });
    if (data.error === 'auth') { logout(); return; }
    if (!data.ok) return fail(data.error === 'same' ? tt('errSame') : tt('errShort'), $('#pw1'));
    st.textContent = ''; st.dataset.state = '';
    $('#pw1').value = ''; $('#pw2').value = '';
    showApp();
    setStatusMsg('', tt('pwSaved'));
  } catch (err) {
    fail(tt('errNet'), $('#pw1'));
  } finally {
    btn.disabled = false;
  }
});

$('#logout').addEventListener('click', logout);
$('#refresh').addEventListener('click', loadRows);
$('#export').addEventListener('click', exportCsv);
$('#q').addEventListener('input', render);
$$('.lang-btn').forEach(b => b.addEventListener('click', () => applyLang(b.dataset.lang)));

/* ---------- boot ---------- */
const saved = store.get('sm-lang');
applyLang(saved || ((navigator.languages || []).some(l => /^es\b/i.test(l)) ? 'es' : 'en'));
$('#demoHint').hidden = !DEMO;
token = DEMO ? null : store.get('sm-panel-token');
if (token) showApp(); else $('#pw').focus();
