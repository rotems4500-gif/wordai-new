// popup.js — ה-UI של הפופאפ. נטען כ-IIFE (bundled ע"י esbuild), ללא type=module ב-HTML.
import { signInWithGoogle, signOutUser, getCachedUser } from '../lib/auth.js';
import { getSettings, setDefaultDestination } from '../lib/settings.js';

const signedOutView = document.getElementById('signed-out-view');
const signedInView = document.getElementById('signed-in-view');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const signedOutError = document.getElementById('signed-out-error');
const userEmailEl = document.getElementById('user-email');
const sendStatusEl = document.getElementById('send-status');
const setDefaultCheckbox = document.getElementById('set-default-checkbox');
const destinationRadios = document.querySelectorAll('input[name="destination"]');

const stateScanning = document.getElementById('state-scanning');
const statePdf = document.getElementById('state-pdf');
const statePage = document.getElementById('state-page');
const pdfFileNameEl = document.getElementById('pdf-file-name');
const sendPdfBtn = document.getElementById('send-pdf-btn');
const sendPageBtn = document.getElementById('send-page-btn');
const fileListBlock = document.getElementById('file-list-block');
const fileListEl = document.getElementById('file-list');
const filesCountEl = document.getElementById('files-count');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const downloadSelectedBtn = document.getElementById('download-selected-btn');
const filesSummaryEl = document.getElementById('files-summary');

// סיומות שמסומנות אוטומטית — מסמכים שהאפליקציה יודעת לחלץ.
const DOC_EXT = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']);
const EXT_LABEL = { pdf: 'PDF', doc: 'DOC', docx: 'DOCX', ppt: 'PPT', pptx: 'PPTX', xls: 'XLS', xlsx: 'XLSX' };
const STATUS_ICON = { pending: '⏳', saved: '✓', login: '🔒', skipped: '⏭', error: '✕' };

let scannedLinks = []; // [{url,title,ext,kind}]
let rowEls = []; // [{checkbox, statusEl}]
let currentTabId = null;

function showError(message) {
  signedOutError.textContent = message;
  signedOutError.classList.remove('hidden');
}

function showStatus(message, kind) {
  sendStatusEl.textContent = message;
  sendStatusEl.classList.remove('hidden', 'success', 'error');
  sendStatusEl.classList.add(kind);
  setTimeout(() => sendStatusEl.classList.add('hidden'), 4000);
}

function showState(which) {
  stateScanning.classList.toggle('hidden', which !== 'scanning');
  statePdf.classList.toggle('hidden', which !== 'pdf');
  statePage.classList.toggle('hidden', which !== 'page');
}

// ---------- רשימת הקבצים ----------
function extLabel(link) {
  return EXT_LABEL[link.ext] || 'קובץ';
}

function defaultChecked(link) {
  return DOC_EXT.has(link.ext) || link.kind === 'resource';
}

function updateSelectedCount() {
  const n = rowEls.filter((r) => r.checkbox.checked && !r.checkbox.disabled).length;
  downloadSelectedBtn.textContent = `הורד ${n} נבחרים`;
  downloadSelectedBtn.disabled = n === 0;
}

function renderFileList(links, jobItems) {
  scannedLinks = links;
  rowEls = [];
  fileListEl.textContent = '';

  if (!links.length) {
    fileListBlock.classList.add('hidden');
    return;
  }
  fileListBlock.classList.remove('hidden');
  filesCountEl.textContent = `נמצאו ${links.length} קבצים`;

  links.forEach((link, index) => {
    const li = document.createElement('li');
    li.className = 'wf-file-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = defaultChecked(link);
    checkbox.addEventListener('change', updateSelectedCount);

    const badge = document.createElement('span');
    badge.className = 'wf-ext-badge';
    badge.textContent = extLabel(link);

    const titleEl = document.createElement('span');
    titleEl.className = 'wf-file-title';
    titleEl.textContent = link.title || link.url;
    titleEl.title = link.url;

    const statusEl = document.createElement('span');
    statusEl.className = 'wf-file-status';

    li.append(checkbox, badge, titleEl);
    if (link.kind === 'resource') {
      const kindBadge = document.createElement('span');
      kindBadge.className = 'wf-kind-badge';
      kindBadge.textContent = 'Moodle';
      li.append(kindBadge);
    }
    li.append(statusEl);
    fileListEl.append(li);
    rowEls.push({ checkbox, statusEl });

    const jobItem = jobItems && jobItems[index];
    if (jobItem) applyRowStatus(index, jobItem.status, jobItem.reason);
  });

  selectAllCheckbox.checked = rowEls.every((r) => r.checkbox.checked);
  updateSelectedCount();
}

function applyRowStatus(index, status, reason) {
  const row = rowEls[index];
  if (!row) return;
  row.statusEl.textContent = STATUS_ICON[status] || '';
  row.statusEl.title = reason || '';
  row.statusEl.className = `wf-file-status wf-status-${status}`;
}

// ---------- סריקה ----------
function runScan() {
  showState('scanning');
  chrome.runtime.sendMessage({ type: 'wordflow-popup-scan' }, (response) => {
    if (chrome.runtime.lastError) {
      showState('page');
      showStatus(chrome.runtime.lastError.message, 'error');
      return;
    }
    if (!response || !response.ok) {
      showState('page');
      showStatus((response && response.error) || 'סריקת העמוד נכשלה', 'error');
      return;
    }

    currentTabId = response.tabId;
    if (response.isPdf) {
      pdfFileNameEl.textContent = response.fileName || response.pageTitle || 'מסמך PDF';
      showState('pdf');
      return;
    }

    const job = response.job;
    if (job && Array.isArray(job.items) && job.items.length) {
      // עבודה שרצה/הסתיימה בלשונית הזו — מציירים את מצבה במקום רשימה חדשה.
      renderFileList(job.items.map((it) => ({
        url: it.url, title: it.title, ext: extFromUrl(it.url), kind: 'direct',
      })), job.items);
      lockList();
      if (job.done) {
        showSummary(job.saved || 0, job.items.length - (job.saved || 0));
      } else {
        downloadSelectedBtn.textContent = 'ההורדה רצה ברקע...';
      }
      showState('page');
      return;
    }

    renderFileList(response.links || [], null);
    showState('page');
  });
}

function extFromUrl(url) {
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url || '');
  return m ? m[1].toLowerCase() : '';
}

function lockList() {
  downloadSelectedBtn.disabled = true;
  selectAllCheckbox.disabled = true;
  rowEls.forEach((r) => { r.checkbox.disabled = true; });
}

function showSummary(saved, skipped) {
  filesSummaryEl.textContent = `נשלחו ${saved} · דולגו ${skipped}`;
  filesSummaryEl.classList.remove('hidden', 'success', 'error');
  filesSummaryEl.classList.add(saved ? 'success' : 'error');
}

// ---------- הורדה דרך port ----------
function startDownload(selected) {
  lockList();
  downloadSelectedBtn.textContent = 'מוריד...';
  selected.forEach(({ index }) => applyRowStatus(index, 'pending'));

  const port = chrome.runtime.connect({ name: 'wordflow-files-job' });

  port.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'item') {
      // msg.index הוא המיקום ברשימה שנשלחה (התת-קבוצה הנבחרת) — ממפים בחזרה לשורה.
      const rowIndex = selected[msg.index]?.index;
      if (rowIndex !== undefined) applyRowStatus(rowIndex, msg.status, msg.reason);
    } else if (msg.type === 'done') {
      downloadSelectedBtn.textContent = 'ההורדה הסתיימה';
      showSummary(msg.saved || 0, (msg.total || 0) - (msg.saved || 0));
      if (msg.error) showStatus(msg.error, 'error');
    }
  });

  port.postMessage({
    type: 'start',
    tabId: currentTabId,
    links: selected.map(({ link }) => link),
  });
}

downloadSelectedBtn.addEventListener('click', () => {
  const selected = [];
  rowEls.forEach((row, index) => {
    if (row.checkbox.checked) selected.push({ index, link: scannedLinks[index] });
  });
  if (!selected.length) return;
  startDownload(selected);
});

selectAllCheckbox.addEventListener('change', () => {
  rowEls.forEach((r) => {
    if (!r.checkbox.disabled) r.checkbox.checked = selectAllCheckbox.checked;
  });
  updateSelectedCount();
});

async function renderSignedIn(user) {
  signedOutView.classList.add('hidden');
  signedInView.classList.remove('hidden');
  userEmailEl.textContent = user.email || user.displayName || '';

  const settings = await getSettings();
  destinationRadios.forEach((radio) => {
    radio.checked = radio.value === settings.defaultDestination;
  });

  runScan();
}

function renderSignedOut() {
  signedInView.classList.add('hidden');
  signedOutView.classList.remove('hidden');
}

async function init() {
  const cached = await getCachedUser();
  if (cached) {
    await renderSignedIn(cached);
  } else {
    renderSignedOut();
  }
}

signInBtn.addEventListener('click', async () => {
  signedOutError.classList.add('hidden');
  signInBtn.disabled = true;
  signInBtn.textContent = 'מתחבר...';
  try {
    const user = await signInWithGoogle();
    await renderSignedIn(user);
  } catch (err) {
    console.error('[wordflow][popup] שגיאת התחברות:', err);
    showError(err.message || 'ההתחברות נכשלה');
  } finally {
    signInBtn.disabled = false;
    signInBtn.textContent = 'התחברות עם Google';
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOutUser();
  renderSignedOut();
});

function sendCurrentPage(btn, busyLabel, idleLabel) {
  btn.disabled = true;
  btn.textContent = busyLabel;
  chrome.runtime.sendMessage({ type: 'wordflow-popup-send-page' }, (response) => {
    btn.disabled = false;
    btn.textContent = idleLabel;
    if (chrome.runtime.lastError) {
      showStatus(chrome.runtime.lastError.message, 'error');
      return;
    }
    if (response && response.ok) {
      showStatus('נשלח בהצלחה ✓', 'success');
    } else {
      showStatus((response && response.error) || 'שליחה נכשלה', 'error');
    }
  });
}

sendPageBtn.addEventListener('click', () => {
  sendCurrentPage(sendPageBtn, 'שולח...', 'שלח את העמוד הנוכחי');
});

// PDF בלשונית — background כבר מזהה זאת ב-handleClipPage ומעלה את הקובץ עצמו.
sendPdfBtn.addEventListener('click', () => {
  sendCurrentPage(sendPdfBtn, 'שולח...', 'שלח PDF זה');
});

destinationRadios.forEach((radio) => {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    if (setDefaultCheckbox.checked) {
      await setDefaultDestination(radio.value);
    }
  });
});

setDefaultCheckbox.addEventListener('change', async () => {
  if (!setDefaultCheckbox.checked) return;
  const checkedRadio = Array.from(destinationRadios).find((r) => r.checked);
  if (checkedRadio) {
    await setDefaultDestination(checkedRadio.value);
  }
});

init();
