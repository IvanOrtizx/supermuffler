/**
 * Super Muffler Inc. - website contacts back office
 * -------------------------------------------------
 * Every form sent from the website lands as a new row (newest on top) in the
 * "Contacts" tab of this Google Sheet, ready for CRM follow-up.
 * The private contacts panel (supermufflerinc.com/panel) reads and updates it.
 * No email notifications.
 *
 * Setup (once):
 *   1. Open the Google Sheet > Extensions > Apps Script, paste this file, save.
 *      (Or create a standalone Apps Script project and put the sheet ID in SHEET_ID.)
 *   2. Choose the function  setup  and press Run (authorize when asked).
 *   3. Deploy > New deployment > type: Web app
 *        Execute as: Me    |    Who has access: Anyone
 *      Copy the Web app URL (ends in /exec) into js/config.js -> formEndpoint.
 *   4. The panel starts with the temporary password 12345678 and asks for a new one
 *      the first time someone logs in. If it is lost, run resetPanelPassword from the editor.
 */

const SETTINGS = {
  // Leave empty when the script is opened from the sheet (Extensions > Apps Script).
  // For a standalone Apps Script project, paste the sheet ID (the long code in the sheet's URL).
  SHEET_ID: '',
  SHEET_NAME: 'Contacts',
  TIMEZONE: 'America/Los_Angeles',
  SHOP_NAME: 'Super Muffler Inc.',
  TEMP_PANEL_PASSWORD: '12345678'   // first login only: the panel forces a change
};

const HEADERS = [
  'Received', 'Status', 'Name', 'Email', 'Phone', 'Heard about us', 'Language',
  'Consent', 'Consent text', 'Page', 'Referrer', 'UTM source', 'UTM medium', 'UTM campaign', 'Notes', 'ID'
];
const STATUSES = ['New', 'Added to CRM', 'Customer', 'Unsubscribed', 'Spam'];
const COL = name => HEADERS.indexOf(name) + 1;

/* ------------------------------------------------------------------ */
/*  Web endpoints                                                      */
/* ------------------------------------------------------------------ */
function doGet() {
  return json_({ ok: true, service: SETTINGS.SHOP_NAME + ' contacts' });
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  return p.action ? panel_(p) : saveContact_(p);
}

function saveContact_(p) {
  const lock = LockService.getScriptLock();
  try {
    if (p.company) return json_({ ok: true });                       // bot trap

    const name = clean_(p.name, 80);
    const email = clean_(p.email, 120).toLowerCase();
    const digits = String(p.phone || '').replace(/\D/g, '');
    if (name.length < 2) return json_({ ok: false, error: 'name' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json_({ ok: false, error: 'email' });
    if (digits.length < 10 || digits.length > 11) return json_({ ok: false, error: 'phone' });
    if (p.consent !== 'yes') return json_({ ok: false, error: 'consent' });

    // ignore double taps: same person within 2 minutes
    const cache = CacheService.getScriptCache();
    const key = 'c' + Utilities.base64EncodeWebSafe(email + digits).slice(0, 200);
    if (cache.get(key)) return json_({ ok: true, duplicate: true });
    cache.put(key, '1', 120);

    const lead = {
      received: new Date(),
      status: 'New',
      name: name,
      email: email,
      phone: formatPhone_(digits),
      source: clean_(p.source, 40),
      lang: p.lang === 'es' ? 'Spanish' : 'English',
      consent: 'Yes',
      consentText: clean_(p.consentText, 400),
      page: clean_(p.page, 200),
      referrer: clean_(p.referrer, 200),
      utmSource: clean_(p.utm_source, 80),
      utmMedium: clean_(p.utm_medium, 80),
      utmCampaign: clean_(p.utm_campaign, 80),
      id: Utilities.getUuid().slice(0, 8)
    };

    lock.waitLock(15000);
    const sheet = getSheet_();
    sheet.insertRowBefore(2);
    const row = sheet.getRange(2, 1, 1, HEADERS.length);
    row.setValues([[
      lead.received, lead.status, lead.name, lead.email, lead.phone, lead.source, lead.lang,
      lead.consent, lead.consentText, lead.page, lead.referrer,
      lead.utmSource, lead.utmMedium, lead.utmCampaign, '', lead.id
    ]]);
    row.setFontWeight('normal').setFontColor('#1b1e25').setBackground(null).setWrap(false);
    sheet.getRange(2, COL('Received')).setNumberFormat('yyyy-mm-dd h:mm am/pm');
    sheet.getRange(2, COL('Status')).setDataValidation(statusRule_());
    SpreadsheetApp.flush();
    lock.releaseLock();
    return json_({ ok: true, id: lead.id });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (e) { /* already released */ }
  }
}

/* ------------------------------------------------------------------ */
/*  Sheet setup and menu                                              */
/* ------------------------------------------------------------------ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Super Muffler')
    .addItem('Mark selected rows as Added to CRM', 'markAddedToCrm')
    .addItem('Send a test contact', 'sendTestContact')
    .addItem('Set panel password', 'setPanelPassword')
    .addSeparator()
    .addItem('Set up / repair the sheet', 'setup')
    .addToUi();
}

function ss_() {
  if (SETTINGS.SHEET_ID) return SpreadsheetApp.openById(SETTINGS.SHEET_ID);
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function setup() {
  const ss = SETTINGS.SHEET_ID ? SpreadsheetApp.openById(SETTINGS.SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(SETTINGS.TIMEZONE);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SHEET_ID', ss.getId());
  if (!props.getProperty('PANEL_PASSWORD')) {
    props.setProperty('PANEL_PASSWORD', SETTINGS.TEMP_PANEL_PASSWORD);
    props.setProperty('PANEL_MUST_CHANGE', 'yes');
  }

  let sheet = ss.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SETTINGS.SHEET_NAME, 0);
  ss.getSheets()
    .filter(s => s.getName() !== SETTINGS.SHEET_NAME && s.getLastRow() === 0)
    .forEach(s => { if (ss.getSheets().length > 1) ss.deleteSheet(s); });

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0c1a3d').setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(3);
  sheet.setRowHeight(1, 32);

  const widths = { Received: 150, Status: 130, Name: 170, Email: 220, Phone: 130, 'Heard about us': 130, 'Consent text': 280, Page: 200, Referrer: 180, Notes: 260 };
  HEADERS.forEach((h, i) => sheet.setColumnWidth(i + 1, widths[h] || 110));

  const last = Math.max(sheet.getMaxRows(), 500);
  if (sheet.getMaxRows() < last) sheet.insertRowsAfter(sheet.getMaxRows(), last - sheet.getMaxRows());
  sheet.getRange(2, COL('Received'), last - 1, 1).setNumberFormat('yyyy-mm-dd h:mm am/pm');
  sheet.getRange(2, COL('Status'), last - 1, 1).setDataValidation(statusRule_());

  // colours by status (range starts at row 1 so rows inserted at the top stay covered)
  const all = sheet.getRange(1, 1, last, HEADERS.length);
  sheet.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B1="New"').setBackground('#fde8e7').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B1="Added to CRM"').setBackground('#fff6d6').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=$B1="Customer"').setBackground('#e3f4e9').setRanges([all]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=OR($B1="Unsubscribed",$B1="Spam")').setFontColor('#8a8f9c').setRanges([all]).build()
  ]);

  sheet.getRange(1, COL('Status')).setNote('New = not in the CRM yet. Change it after adding the contact. "Unsubscribed" = do not contact.');
  sheet.getRange(1, COL('Notes')).setNote('Free space for the shop.');
  return 'Ready';
}

function markAddedToCrm() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SETTINGS.SHEET_NAME) return;
  const sel = sheet.getActiveRangeList();
  if (!sel) return;
  sel.getRanges().forEach(r => {
    for (let i = r.getRow(); i < r.getRow() + r.getNumRows(); i++) {
      if (i > 1) sheet.getRange(i, COL('Status')).setValue('Added to CRM');
    }
  });
}

function sendTestContact() {
  const res = doPost({ parameter: {
    name: 'Test Contact', email: 'test@example.com', phone: '(805) 555-0123', source: 'Other',
    consent: 'yes', consentText: 'Test from the Apps Script menu', lang: 'en', page: 'apps-script-test'
  } });
  console.log(res.getContent());
  try { SpreadsheetApp.getActive().toast(res.getContent(), 'Test contact'); } catch (e) { /* standalone project */ }
}

// Run from the Apps Script editor if the panel password is lost:
// sets it back to the temporary 12345678 and asks for a new one at the next login.
function resetPanelPassword() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PANEL_PASSWORD', SETTINGS.TEMP_PANEL_PASSWORD);
  props.setProperty('PANEL_MUST_CHANGE', 'yes');
  console.log('Panel password reset to the temporary one.');
}

/* ------------------------------------------------------------------ */
/*  Contacts panel (supermufflerinc.com/panel)                         */
/* ------------------------------------------------------------------ */
function panel_(p) {
  try {
    if (p.action === 'login') return json_(login_(p.password));
    if (!p.token || !CacheService.getScriptCache().get('t' + p.token)) return json_({ ok: false, error: 'auth' });
    if (p.action === 'changePassword') return json_(changePassword_(p.newPassword));
    if (mustChange_()) return json_({ ok: false, error: 'mustchange' });
    if (p.action === 'list') return json_({ ok: true, rows: listRows_() });
    if (p.action === 'status') return json_(setStatus_(p.id, p.status));
    return json_({ ok: false, error: 'action' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server' });
  }
}

function login_(pw) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('loginFails') || 0);
  if (fails >= 10) return { ok: false, error: 'locked' };            // 10 wrong tries -> wait 10 minutes
  const real = PropertiesService.getScriptProperties().getProperty('PANEL_PASSWORD') || '';
  if (!real) return { ok: false, error: 'nopassword' };
  if (String(pw || '') !== real) {
    cache.put('loginFails', String(fails + 1), 600);
    Utilities.sleep(700);
    return { ok: false, error: 'password' };
  }
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('t' + token, '1', 21600);                                 // session lasts 6 hours
  return { ok: true, token: token, mustChange: mustChange_() };
}

function mustChange_() {
  return PropertiesService.getScriptProperties().getProperty('PANEL_MUST_CHANGE') === 'yes';
}

function changePassword_(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return { ok: false, error: 'short' };
  if (pw === SETTINGS.TEMP_PANEL_PASSWORD) return { ok: false, error: 'same' };
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PANEL_PASSWORD', pw);
  props.deleteProperty('PANEL_MUST_CHANGE');
  return { ok: true };
}

function listRows_() {
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const vals = sheet.getRange(2, 1, Math.min(last - 1, 5000), HEADERS.length).getValues();
  const c = name => COL(name) - 1;
  return vals.filter(r => r[c('ID')]).map(r => ({
    id: String(r[c('ID')]),
    received: r[c('Received')] instanceof Date ? r[c('Received')].toISOString() : String(r[c('Received')]),
    status: String(r[c('Status')] || 'New'),
    name: String(r[c('Name')]),
    email: String(r[c('Email')]),
    phone: String(r[c('Phone')]),
    source: String(r[c('Heard about us')]),
    lang: String(r[c('Language')]),
    notes: String(r[c('Notes')])
  }));
}

function setStatus_(id, status) {
  if (STATUSES.indexOf(status) < 0) return { ok: false, error: 'status' };
  const sheet = getSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return { ok: false, error: 'notfound' };
  const ids = sheet.getRange(2, COL('ID'), last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) {
      sheet.getRange(i + 2, COL('Status')).setValue(status);
      return { ok: true };
    }
  }
  return { ok: false, error: 'notfound' };
}

function setPanelPassword() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Panel password', 'Password for the contacts panel (at least 8 characters):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const pw = r.getResponseText().trim();
  if (pw.length < 8) { ui.alert('Use at least 8 characters.'); return; }
  const props = PropertiesService.getScriptProperties();
  props.setProperty('PANEL_PASSWORD', pw);
  props.deleteProperty('PANEL_MUST_CHANGE');
  ui.alert('Saved. Use this password to open the contacts panel.');
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function getSheet_() {
  const ss = ss_();
  let sheet = ss.getSheetByName(SETTINGS.SHEET_NAME);
  if (!sheet) { setup(); sheet = ss.getSheetByName(SETTINGS.SHEET_NAME); }
  return sheet;
}

function statusRule_() {
  return SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
}

// trims, limits length and blocks spreadsheet formulas
function clean_(v, max) {
  let s = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function formatPhone_(d) {
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  return d.length === 10 ? '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6) : d;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
