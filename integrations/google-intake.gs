/** PRIVATE standalone Apps Script. Set FORM_WEBHOOK_SECRET in Script Properties,
 * then run installSync. Keep original Sheet timestamps unchanged: these identify responses.
 */
const SHEET_ID = '1h_7nQM_b-XB7OKtRWf-PE_uDeUhILhZc3crsbjMSJCY';
const TAB_ID = 58944659;
const APP_URL = 'https://ignited-taskboard.vercel.app';
function digest(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value,
    Utilities.Charset.UTF_8).map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function intakeRows() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetById(TAB_ID);
  if (!sheet) throw new Error('Intake tab not found');
  const range = sheet.getDataRange(), raw = range.getValues(), display = range.getDisplayValues();
  const headers = display[0].map(h => h.trim()), seen = {};
  ['Timestamp', 'Business name', 'Business phone number'].forEach(h => {
    if (headers.indexOf(h) < 0) throw new Error('Missing column: ' + h);
  });
  return display.slice(1).map((row, index) => {
    if (!row.some(v => v.trim())) return null;
    const a = {};
    headers.forEach((h, i) => { a[h] = row[i].trim(); });
    const timestamp = raw[index + 1][headers.indexOf('Timestamp')];
    if (!(timestamp instanceof Date) || !Number.isFinite(timestamp.getTime()))
      throw new Error('Invalid timestamp at row ' + (index + 2));
    const sourceId = 'sheet:' + digest(SHEET_ID + ':' + TAB_ID + ':' + timestamp.toISOString());
    if (seen[sourceId]) throw new Error('Duplicate timestamp: review source rows');
    seen[sourceId] = true;
    if (!a['Business name']) throw new Error('Missing business name at row ' + (index + 2));
    return { sourceId, name: a['Business name'], person: a['Person name'] || '',
      email: a['Email'] || '', location: a['Location Shout Out'] || '',
      phone: a['Business phone number'] || '',
      offer: a["Agreed on promo we're running (Price)"] || '' };
  }).filter(Boolean);
}
function installSync() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FORM_WEBHOOK_SECRET')) throw new Error('Set FORM_WEBHOOK_SECRET first');
  const rows = intakeRows();
  if (!props.getProperty('BASELINE_READY')) {
    rows.forEach(row => props.setProperty('historical:' + row.sourceId, '1'));
    props.setProperty('BASELINE_READY', '1');
  }
  const handlers = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (!handlers.includes('syncIntake'))
    ScriptApp.newTrigger('syncIntake').timeBased().everyMinutes(5).create();
  if (!handlers.includes('onIntakeSubmit'))
    ScriptApp.newTrigger('onIntakeSubmit').forSpreadsheet(SHEET_ID).onFormSubmit().create();
  syncIntake();
}
function onIntakeSubmit() { syncIntake(); }
function syncIntake() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  const props = PropertiesService.getScriptProperties();
  try {
    const secret = props.getProperty('FORM_WEBHOOK_SECRET');
    if (!secret || !props.getProperty('BASELINE_READY')) throw new Error('Run installSync first');
    let sent = 0;
    const failures = [];
    for (const row of intakeRows()) {
      const fingerprint = digest(JSON.stringify(row)), key = 'synced:' + row.sourceId;
      if (props.getProperty(key) === fingerprint) continue;
      if (sent >= 50) break;
      sent++;
      try {
        const response = UrlFetchApp.fetch(APP_URL + '/api/form', {
          method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          headers: { Authorization: 'Bearer ' + secret },
          payload: JSON.stringify(Object.assign({}, row, {
            historical: props.getProperty('historical:' + row.sourceId) === '1'
          }))
        });
        if (response.getResponseCode() !== 200) {
          let reason = '';
          try {
            if (JSON.parse(response.getContentText()).error === 'Configure the approver first')
              reason = ': owner account needs configuration';
          } catch (_) { /* Keep unexpected response contents out of logs. */ }
          throw new Error('HTTP ' + response.getResponseCode() + reason);
        }
        props.setProperty(key, fingerprint); // Only acknowledge confirmed success.
      } catch (error) {
        failures.push(row.sourceId.slice(-8) + ': ' + String(error.message).slice(0,100));
      }
    }
    if (failures.length) throw new Error('Pending intake retries: ' + failures.join('; '));
    props.setProperty('LAST_SUCCESS_AT', new Date().toISOString());
    props.deleteProperty('LAST_ERROR');
  } catch (error) {
    props.setProperty('LAST_ERROR', String(error.message).slice(0,1000));
    throw error;
  } finally { lock.releaseLock(); }
}
