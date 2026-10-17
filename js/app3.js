/* Statement Analyzer v3 — rules + merchant cleanup engine, real-world imports (PDF / OFX / XLSX / more banks), cash-flow forecast.
   Everything still 100% client-side. Import libraries (pdf.js / SheetJS) are loaded lazily from a CDN as CODE only —
   statement data itself is parsed in this tab and never leaves the machine. */
'use strict';

/* ================= merchant cleanup ================= */
const CLEAN_PREFIXES = /^(SQ \*|SQ\*|TST\*|TST \*|POS |DEBIT PURCHASE |PURCHASE |CHECKCARD |ACH DEBIT |ACH |VISA DDA PURCHASE |DD \*|PAYPAL \*|PP\*|AMZN MKTP \*|AMZN \*)/i;
function cleanMerchant(raw) {
  let s = String(raw || '').trim();
  if (!s) return s;
  s = s.replace(CLEAN_PREFIXES, '');
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/[*#]\s*\d{3,}.*$/, '');            // *1234 store/ref tails
  s = s.replace(/\s+#\d+\b.*$/, '');                  // #2210 store numbers + tail
  s = s.replace(/\s+\d{4,}\b.*$/, '');                // long numeric tails
  s = s.replace(/\s+(INC|LLC|CORP|LTD|CO)\.?$/i, '');
  s = s.replace(/\s+[A-Z]{2}\s+\d{5}(-\d{4})?$/, ''); // trailing ST ZIP
  s = s.replace(/\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)$/, '');
  s = s.trim().replace(/[\s\-–—]+$/, '');
  if (!s) return String(raw).trim();
  // Title-case ALLCAPS names for readability, leave mixed-case alone
  if (s === s.toUpperCase() && s.length > 3) {
    s = s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/'S(?=\s|$)/g, "'s").replace(/\bUsa\b/, 'USA').replace(/\bAtm\b/, 'ATM');
  }
  return s;
}

/* ================= custom categories ================= */
const CUSTOM_CAT_COLORS = ['#facc15', '#38bdf8', '#fb7185', '#a78bfa', '#34d399', '#f97316', '#e879f9', '#94a3b8'];
function registerCustomCats(list) {
  (list || []).forEach((c, i) => {
    if (c && !CATS.includes(c)) { CATS.push(c); CAT_COLORS[c] = CUSTOM_CAT_COLORS[i % CUSTOM_CAT_COLORS.length]; }
  });
}
function allCats() { return CATS.slice(); }

/* ================= user rules ================= */
function ruleMatches(rule, t) {
  if (!rule || rule.enabled === false) return false;
  const needle = String(rule.match || '').trim().toLowerCase();
  if (!needle) return false;
  const hay = String(t.desc || '').toLowerCase();
  const hit = rule.matchType === 'exact' ? hay.trim() === needle : hay.includes(needle);
  if (!hit) return false;
  if (rule.amtOp === 'lt' && !(Math.abs(t.amount) < +rule.amtVal)) return false;
  if (rule.amtOp === 'gt' && !(Math.abs(t.amount) > +rule.amtVal)) return false;
  return true;
}
function applyUserRules(t) {
  const rules = (APP.profile && APP.profile.rules) || [];
  for (const r of rules) if (ruleMatches(r, t)) return r.cat;
  return null;
}

/* ================= withCats wrapper: rules + splits + clean display ================= */
APP.splits = {}; // txnId -> [{amount, cat, note}]
const _withCatsV3 = withCats;
withCats = function () {
  const base = _withCatsV3();
  const out = [];
  for (const t of base) {
    t.display = cleanMerchant(t.desc);
    const parts = t.id && APP.splits[t.id];
    if (parts && parts.length) {
      for (const p of parts) out.push({ ...t, amount: p.amount, cat: p.cat, isSplit: true, splitNote: p.note || '' });
      continue;
    }
    const hasOverride = !!APP.overrides[normalizePayee(t.desc)];
    if (!hasOverride && !t.xfer) {
      const rc = applyUserRules(t);
      if (rc) t.cat = rc;
    }
    out.push(t);
  }
  return out;
};

/* ================= boot wrapper: stable txn ids ================= */
const _bootV3 = boot;
boot = function (txns, fileName, demo) {
  txns.forEach((t, i) => { if (!t.id) t.id = 'tx' + i + '_' + t.date.getTime() + '_' + Math.round(Math.abs(t.amount) * 100); });
  APP.splits = {};
  if (APP.profile) registerCustomCats(APP.profile.customCats);
  _bootV3(txns, fileName, demo);
};
const _clearV3 = clearSession;
clearSession = function () { APP.splits = {}; _clearV3(); };

/* ================= split dialog ================= */
function ensureSplitDialog() {
  if (document.getElementById('splitDialog')) return;
  const d = document.createElement('dialog');
  d.id = 'splitDialog';
  d.innerHTML = `<form method="dialog" class="split-form">
    <h3>✂ Split transaction</h3>
    <p class="muted small" id="splitMeta"></p>
    <div id="splitRows"></div>
    <p class="muted small" id="splitMsg"></p>
    <div class="split-actions">
      <button type="button" id="splitAdd" class="btn ghost small">+ Add part</button>
      <span style="flex:1"></span>
      <button type="button" id="splitCancel" class="btn ghost small">Cancel</button>
      <button type="button" id="splitSave" class="btn small">Save split</button>
    </div></form>`;
  document.body.appendChild(d);
}
let splitTargetId = null;
function splitRowHTML(amount, cat) {
  return `<div class="split-row"><input type="number" step="0.01" min="0" class="input small split-amt" value="${amount != null ? amount : ''}" placeholder="Amount">
    <select class="input small split-cat">${allCats().map((c) => `<option ${c === cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <button type="button" class="btn ghost small split-del" title="Remove part">✕</button></div>`;
}
function openSplitDialog(txid) {
  ensureSplitDialog();
  const t = APP.txns.find((x) => x.id === txid);
  if (!t) return;
  splitTargetId = txid;
  const d = $('splitDialog');
  $('splitMeta').textContent = `${fmtDate(t.date)} · ${t.desc} · ${fmt$(t.amount)} — enter positive amounts; they must add up to ${fmt$(Math.abs(t.amount))}.`;
  const existing = APP.splits[txid];
  $('splitRows').innerHTML = existing
    ? existing.map((p) => splitRowHTML(Math.abs(p.amount), p.cat)).join('')
    : splitRowHTML((Math.abs(t.amount) / 2).toFixed(2), 'Other') + splitRowHTML((Math.abs(t.amount) / 2).toFixed(2), 'Other');
  $('splitMsg').textContent = '';
  const wire = () => {
    d.querySelectorAll('.split-del').forEach((b) => b.addEventListener('click', () => { b.closest('.split-row').remove(); }));
  };
  wire();
  $('splitAdd').onclick = () => { $('splitRows').insertAdjacentHTML('beforeend', splitRowHTML('', 'Other')); wire(); };
  $('splitCancel').onclick = () => d.close();
  $('splitSave').onclick = () => {
    const rows = Array.from(d.querySelectorAll('.split-row'));
    const sign = t.amount < 0 ? -1 : 1;
    const parts = rows.map((r) => ({ amount: sign * Math.abs(parseFloat(r.querySelector('.split-amt').value) || 0), cat: r.querySelector('.split-cat').value })).filter((p) => p.amount !== 0);
    const sum = parts.reduce((s, p) => s + Math.abs(p.amount), 0);
    if (parts.length < 2) { $('splitMsg').textContent = '⚠️ A split needs at least 2 parts.'; return; }
    if (Math.abs(sum - Math.abs(t.amount)) > 0.01) { $('splitMsg').textContent = `⚠️ Parts add up to ${fmt$(sum)}, not ${fmt$(Math.abs(t.amount))}.`; return; }
    APP.splits[txid] = parts;
    d.close();
    rerenderTab();
  };
  d.showModal();
}

/* ================= Cleanup tab ================= */
function renderCleanup() {
  const list = withCats();
  const P = APP.profile;
  const rules = P.rules || [];
  // payee groups
  const groups = {};
  for (const t of list) {
    const k = normalizePayee(t.desc);
    const g = groups[k] = groups[k] || { key: k, raw: t.desc, clean: t.display || cleanMerchant(t.desc), count: 0, total: 0, cats: new Set() };
    g.count++; g.total += t.amount; g.cats.add(t.cat);
  }
  const payees = Object.values(groups).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const review = payees.filter((g) => g.cats.has('Other'));
  const reviewTxns = list.filter((t) => t.cat === 'Other').length;
  const splits = Object.entries(APP.splits || {});

  $('panel-cleanup').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Unique payees</div><div class="kpi-val">${payees.length}</div></div>
      <div class="kpi"><div class="kpi-label">Uncategorized txns</div><div class="kpi-val ${reviewTxns ? 'neg' : ''}">${reviewTxns}</div></div>
      <div class="kpi"><div class="kpi-label">Active rules</div><div class="kpi-val">${rules.filter((r) => r.enabled !== false).length}</div></div>
      <div class="kpi"><div class="kpi-label">Splits</div><div class="kpi-val">${splits.length}</div></div>
    </div>

    <div class="panel-card"><h3>🧹 Review queue — uncategorized</h3>
      <p class="muted small">Everything still landing in <strong>Other</strong>, grouped by payee. Pick a category and hit Apply — it fixes every transaction from that payee at once (saved as an override, and now included in Profile v2 exports).</p>
      ${review.length ? `<div class="tx-scroll"><table class="data"><thead><tr><th>Payee (cleaned)</th><th>Raw example</th><th>Txns</th><th style="text-align:right">Total</th><th>Set category</th><th></th></tr></thead><tbody>
        ${review.slice(0, 50).map((g) => `<tr><td>${esc(g.clean)}</td><td class="muted small">${esc(g.raw)}</td><td>${g.count}</td><td style="text-align:right">${fmt$(g.total)}</td>
        <td><select class="input small review-cat" data-payee="${esc(g.key)}">${allCats().map((c) => `<option ${c === 'Other' ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></td>
        <td><button class="btn ghost small review-apply" data-payee="${esc(g.key)}">Apply</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">🎉 Nothing uncategorized — clean book.</p>'}
    </div>

    <div class="panel-card mt"><h3>⚙️ Rules engine</h3>
      <p class="muted small">Rules run in order, after your manual per-payee overrides and before the built-in keyword rules. Example: payee contains <code>SHELL</code> + amount &lt; $20 → <em>Dining &amp; Coffee</em> (gas-station snacks, not Gas). Rules are saved in your Profile — export it to keep them.</p>
      ${rules.length ? `<div class="tx-scroll"><table class="data"><thead><tr><th>On</th><th>Payee contains</th><th>Amount</th><th>→ Category</th><th>Matches now</th><th></th></tr></thead><tbody>
        ${rules.map((r, i) => { const n = list.filter((t) => ruleMatches(r, t)).length; return `<tr>
          <td><input type="checkbox" class="rule-on" data-i="${i}" ${r.enabled !== false ? 'checked' : ''}></td>
          <td><code>${esc(r.match)}</code>${r.matchType === 'exact' ? ' <span class="muted small">(exact)</span>' : ''}</td>
          <td>${r.amtOp === 'lt' ? '&lt; ' + fmt$(+r.amtVal) : r.amtOp === 'gt' ? '&gt; ' + fmt$(+r.amtVal) : '<span class="muted">any</span>'}</td>
          <td>${esc(r.cat)}</td><td>${n}</td>
          <td><button class="btn ghost small rule-del" data-i="${i}">Delete</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">No rules yet.</p>'}
      <div class="rule-form">
        <input id="ruleMatch" class="input small" placeholder="Payee contains… e.g. SHELL">
        <select id="ruleAmtOp" class="input small"><option value="any">Any amount</option><option value="lt">Amount &lt;</option><option value="gt">Amount &gt;</option></select>
        <input id="ruleAmtVal" type="number" step="0.01" min="0" class="input small" placeholder="$">
        <select id="ruleCat" class="input small">${allCats().map((c) => `<option>${esc(c)}</option>`).join('')}</select>
        <button id="ruleAdd" class="btn small">Add rule</button>
      </div>
      <p class="msg" id="ruleMsg"></p>
    </div>

    <div class="grid2 mt">
      <div class="panel-card"><h3>🏷️ Custom categories</h3>
        <p class="muted small">Add your own (Kids, Home Projects, Side Business…). They appear in every category picker, the Budget tab, and Profile exports.</p>
        <div>${(P.customCats || []).length ? P.customCats.map((c) => `<span class="badge ok">${esc(c)} <button class="cat-del btn ghost small" data-cat="${esc(c)}" title="Remove">✕</button></span>`).join(' ') : '<span class="muted">None yet.</span>'}</div>
        <div class="rule-form"><input id="catNew" class="input small" placeholder="New category name"><button id="catAdd" class="btn small">Add category</button></div>
        <p class="msg" id="catMsg"></p>
      </div>
      <div class="panel-card"><h3>✂ Active splits</h3>
        ${splits.length ? `<table class="data"><thead><tr><th>Transaction</th><th>Parts</th><th></th></tr></thead><tbody>
          ${splits.map(([id, parts]) => { const t = APP.txns.find((x) => x.id === id); return `<tr><td>${t ? esc(cleanMerchant(t.desc)) + ' · ' + fmt$(t.amount) : id}</td><td>${parts.map((p) => esc(p.cat) + ' ' + fmt$(p.amount)).join(' · ')}</td><td><button class="btn ghost small split-remove" data-txid="${esc(id)}">Remove split</button></td></tr>`; }).join('')}
        </tbody></table><p class="muted small">Create splits from the ✂ Split button in the Transactions tab.</p>` : '<p class="muted">No splits. Use ✂ Split in the Transactions tab to divide e.g. a Costco run across Groceries / Shopping / Pets.</p>'}
      </div>
    </div>

    <div class="panel-card mt"><h3>🧽 Merchant cleanup — what your payees become</h3>
      <p class="muted small">Raw bank strings are normalized for display and grouping: processor prefixes (SQ *, TST*, PAYPAL *), store numbers, and trailing city/state/ZIP tails are stripped. The original string is never altered in your data — cleanup is display + grouping only.</p>
      <div class="tx-scroll"><table class="data"><thead><tr><th>Clean name</th><th>Raw example</th><th>Txns</th><th style="text-align:right">Total</th></tr></thead><tbody>
      ${payees.slice(0, 40).map((g) => `<tr><td>${esc(g.clean)}</td><td class="muted small">${esc(g.raw)}</td><td>${g.count}</td><td style="text-align:right">${fmt$(g.total)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;

  document.querySelectorAll('.review-apply').forEach((b) => b.addEventListener('click', () => {
    const sel = document.querySelector(`.review-cat[data-payee="${CSS.escape(b.dataset.payee)}"]`);
    if (sel) { APP.overrides[b.dataset.payee] = sel.value; renderCleanup(); renderSummary(); }
  }));
  document.querySelectorAll('.rule-on').forEach((cb) => cb.addEventListener('change', () => { APP.profile.rules[+cb.dataset.i].enabled = cb.checked; renderCleanup(); }));
  document.querySelectorAll('.rule-del').forEach((b) => b.addEventListener('click', () => { APP.profile.rules.splice(+b.dataset.i, 1); renderCleanup(); }));
  $('ruleAdd').addEventListener('click', () => {
    const m = $('ruleMatch').value.trim();
    if (!m) { $('ruleMsg').textContent = '⚠️ Enter the payee text to match.'; return; }
    APP.profile.rules = APP.profile.rules || [];
    APP.profile.rules.push({ id: 'r' + Date.now(), match: m, matchType: 'contains', amtOp: $('ruleAmtOp').value, amtVal: parseFloat($('ruleAmtVal').value) || null, cat: $('ruleCat').value, enabled: true });
    renderCleanup(); renderSummary();
  });
  $('catAdd').addEventListener('click', () => {
    const name = $('catNew').value.trim();
    if (!name) return;
    if (CATS.includes(name)) { $('catMsg').textContent = '⚠️ That category already exists.'; return; }
    APP.profile.customCats = APP.profile.customCats || [];
    APP.profile.customCats.push(name); registerCustomCats([name]); renderCleanup();
  });
  document.querySelectorAll('.cat-del').forEach((b) => b.addEventListener('click', () => {
    const c = b.dataset.cat;
    APP.profile.customCats = (APP.profile.customCats || []).filter((x) => x !== c);
    const i = CATS.indexOf(c); if (i >= 0) CATS.splice(i, 1);
    renderCleanup();
  }));
  document.querySelectorAll('.split-remove').forEach((b) => b.addEventListener('click', () => { delete APP.splits[b.dataset.txid]; renderCleanup(); }));
}
TAB_RENDERERS.cleanup = renderCleanup;

/* ================= real-world imports: PDF + Excel ================= */
function loadScriptOnce(src, globalName) {
  if (window[globalName]) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return; }
    const sc = document.createElement('script');
    sc.src = src; sc.onload = resolve; sc.onerror = () => reject(new Error('Could not load the import library (network needed once to fetch the library code — your statement data still never leaves this tab).'));
    document.head.appendChild(sc);
  });
}

const AMT_TOKEN = /-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\s*(?:CR|DR|-)?/g;
function parseStatementLines(lines) {
  const txns = [];
  const dateRe = /^(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2}-\d{2,4})\s+(.*)$/;
  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    const dm = line.match(dateRe);
    if (!dm) continue;
    const d = parseDate(dm[1]);
    if (!d) continue;
    let rest = dm[2];
    const amounts = rest.match(AMT_TOKEN);
    if (!amounts || !amounts.length) continue;
    let amtToken, balToken = null;
    if (amounts.length >= 2) { amtToken = amounts[amounts.length - 2]; balToken = amounts[amounts.length - 1]; }
    else amtToken = amounts[0];
    const idx = rest.lastIndexOf(amtToken);
    let desc = rest.slice(0, idx).replace(AMT_TOKEN, '').trim();
    // A second date right after the first (post date) — drop it from the description
    desc = desc.replace(/^(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2})\s+/, '');
    if (!desc) continue;
    let amt = parseAmount(amtToken.replace(/CR$/i, '').trim());
    if (amt === null) continue;
    if (/CR$/i.test(amtToken.trim())) amt = Math.abs(amt);
    if (/DR$/i.test(amtToken.trim())) amt = -Math.abs(amt);
    // Statement PDFs usually print withdrawals as positive numbers in a mixed list; a
    // description-based heuristic would be guessing, so keep printed signs and let the
    // Flip-signs toolbar fix inverted exports. Deposits/payments read as income.
    const txn = { date: d, desc, amount: amt };
    if (balToken) { const b = parseAmount(balToken); if (b !== null) txn.balance = b; }
    txns.push(txn);
  }
  txns.sort((a, b) => a.date - b.date);
  return txns;
}
window.SA_importPDF = async function (file) {
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let pno = 1; pno <= pdf.numPages; pno++) {
    const page = await pdf.getPage(pno);
    const tc = await page.getTextContent();
    const byY = {};
    for (const item of tc.items) {
      const y = Math.round(item.transform[5]);
      (byY[y] = byY[y] || []).push({ x: item.transform[4], str: item.str });
    }
    Object.keys(byY).map(Number).sort((a, b) => b - a).forEach((y) => {
      lines.push(byY[y].sort((a, b) => a.x - b.x).map((i) => i.str).join(' ').replace(/\s{2,}/g, ' '));
    });
  }
  const txns = parseStatementLines(lines);
  if (!txns.length) return { error: 'No transactions could be read from that PDF. Some banks print statements as scanned images (no text layer) — try the CSV or OFX export instead, which is exact.' };
  return { txns, bank: 'PDF Statement', format: 'pdf' };
};
window.SA_importXLSX = async function (file) {
  await loadScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX');
  const buf = await file.arrayBuffer();
  const wb = window.XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const strRows = rows.map((r) => r.map((c) => String(c == null ? '' : c)));
  // Skip leading title rows: find the first row that looks like a header
  let start = strRows.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => /amount|debit|credit|description/i.test(c)));
  const sliced = start > 0 ? strRows.slice(start) : strRows;
  return buildTransactions(sliced);
};

/* ================= cash-flow forecast ================= */
function detectRecurringIncome(list) {
  const inc = list.filter((t) => t.amount > 0 && !t.xfer && !/payment|thank you/i.test(t.desc));
  const groups = {};
  for (const t of inc) { const k = normalizePayee(t.desc); (groups[k] = groups[k] || []).push(t); }
  const out = [];
  for (const [key, txns] of Object.entries(groups)) {
    if (txns.length < 2) continue;
    txns.sort((a, b) => a.date - b.date);
    const intervals = [];
    for (let i = 1; i < txns.length; i++) intervals.push((txns[i].date - txns[i - 1].date) / 86400000);
    const med = median(intervals);
    let cadence = null, periodDays = null;
    if (med >= 26 && med <= 33) { cadence = 'Monthly'; periodDays = 30.44; }
    else if (med >= 6 && med <= 8) { cadence = 'Weekly'; periodDays = 7; }
    else if (med >= 13 && med <= 16) { cadence = 'Every 2 weeks'; periodDays = 14; }
    else if (med >= 85 && med <= 95) { cadence = 'Quarterly'; periodDays = 91.31; }
    if (!cadence) continue;
    const avg = txns.reduce((s, t) => s + t.amount, 0) / txns.length;
    const lastDate = txns[txns.length - 1].date;
    out.push({ key, desc: txns[0].desc.trim(), cadence, periodDays, avg, count: txns.length, lastDate, nextDate: new Date(lastDate.getTime() + med * 86400000) });
  }
  return out.sort((a, b) => b.avg - a.avg);
}

function buildForecast() {
  const list = withCats();
  const P = APP.profile;
  const horizon = +(P.forecastHorizon || 90);
  const anchor = list.length ? new Date(Math.max(...list.map((t) => t.date.getTime()))) : new Date();
  // Starting balance: explicit input > last running balance in the data > saved current balance > net of the data
  let start = null, startSource = '';
  if (P.forecastStart != null && P.forecastStart !== '') { start = +P.forecastStart; startSource = 'your starting-balance input'; }
  else {
    const withBal = list.filter((t) => typeof t.balance === 'number').sort((a, b) => a.date - b.date);
    if (withBal.length) { start = withBal[withBal.length - 1].balance; startSource = 'last running balance in your statement'; }
    else if (P.balance != null && P.balance !== '') { start = +P.balance; startSource = 'the current balance saved in Health'; }
    else { start = list.reduce((s, t) => s + (t.xfer ? 0 : t.amount), 0); startSource = 'net of the loaded data (set a starting balance for a truer forecast)'; }
  }
  const recOut = detectRecurring(list);
  const recIn = detectRecurringIncome(list);
  const events = [];
  const pushEvents = (items, sign) => {
    for (const r of items) {
      let d = new Date(r.nextDate);
      let guard = 0;
      while (d <= new Date(anchor.getTime() + horizon * 86400000) && guard++ < 60) {
        if (d > anchor) events.push({ date: new Date(d), desc: r.desc, amount: sign * r.avg, cadence: r.cadence });
        d = new Date(d.getTime() + r.periodDays * 86400000);
      }
    }
  };
  pushEvents(recOut, -1); pushEvents(recIn, +1);
  events.sort((a, b) => a.date - b.date);
  // Historical discretionary pace: outflow that is NOT recurring, per day over the data range
  const recKeys = new Set(recOut.map((r) => r.key));
  const days = list.length ? Math.max(1, (Math.max(...list.map((t) => t.date.getTime())) - Math.min(...list.map((t) => t.date.getTime()))) / 86400000 + 1) : 30;
  const discTotal = list.filter((t) => t.amount < 0 && !t.xfer && !recKeys.has(normalizePayee(t.desc))).reduce((s, t) => s + -t.amount, 0);
  const discPerDay = discTotal / days;
  const includeDisc = P.forecastIncludeDiscretionary !== false;
  // Day-by-day series
  const byDay = {};
  for (const e of events) { const k = monthKey(e.date) + '-' + String(e.date.getDate()).padStart(2, '0'); byDay[k] = (byDay[k] || 0) + e.amount; }
  const series = [];
  let bal = start, low = { bal: start, date: new Date(anchor) };
  for (let i = 1; i <= horizon; i++) {
    const d = new Date(anchor.getTime() + i * 86400000);
    const k = monthKey(d) + '-' + String(d.getDate()).padStart(2, '0');
    bal += (byDay[k] || 0) - (includeDisc ? discPerDay : 0);
    series.push({ date: d, bal });
    if (bal < low.bal) low = { bal, date: d };
  }
  const fixedIn = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const fixedOut = events.filter((e) => e.amount < 0).reduce((s, e) => s + -e.amount, 0);
  const discProjected = includeDisc ? discPerDay * horizon : 0;
  const endBal = series.length ? series[series.length - 1].bal : start;
  const headroom = start + fixedIn - fixedOut;
  const maxPace = Math.max(0, headroom / horizon);
  return { start, startSource, horizon, anchor, events, series, low, endBal, fixedIn, fixedOut, discPerDay, discProjected, includeDisc, maxPace, recOut, recIn };
}

function forecastChart(series, start) {
  if (!series.length) return '<p class="muted">Not enough data.</p>';
  const W = 720, H = 190, PAD = 34;
  const vals = series.map((p) => p.bal).concat([start, 0]);
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const x = (i) => PAD + (i / (series.length - 1)) * (W - PAD - 8);
  const y = (v) => 8 + (1 - (v - min) / span) * (H - 40);
  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.bal).toFixed(1)}`).join(' ');
  const zeroY = y(0);
  return `<svg viewBox="0 0 ${W} ${H}" class="fc-chart" style="width:100%">
    ${min < 0 ? `<line x1="${PAD}" y1="${zeroY}" x2="${W - 8}" y2="${zeroY}" stroke="#ff6b6b" stroke-dasharray="4 4"/><text x="${PAD - 4}" y="${zeroY - 4}" text-anchor="end" class="trend-label">$0</text>` : ''}
    <polyline points="${pts}" fill="none" stroke="#3ddc84" stroke-width="2"/>
    <text x="${PAD - 4}" y="${y(max) + 4}" text-anchor="end" class="trend-label">${fmt0(max)}</text>
    <text x="${PAD - 4}" y="${y(min) + 4}" text-anchor="end" class="trend-label">${fmt0(min)}</text>
    <text x="${PAD}" y="${H - 6}" class="trend-label">${fmtDate(series[0].date)}</text>
    <text x="${W - 8}" y="${H - 6}" text-anchor="end" class="trend-label">${fmtDate(series[series.length - 1].date)}</text>
  </svg>`;
}

function renderForecast() {
  const P = APP.profile;
  const f = buildForecast();
  const warnings = [];
  if (f.low.bal < 0) warnings.push({ icon: '🚨', cls: 'bad', title: 'Projected to go negative', body: `On the current pace the balance dips to <strong>${fmt$(f.low.bal)}</strong> around <strong>${fmtDate(f.low.date)}</strong>. That's recurring bills + ${f.includeDisc ? 'your historical everyday spending' : 'fixed charges only'} against expected income — pull a bill date, pause a subscription, or trim the daily pace below.` });
  else if (f.low.bal < 500) warnings.push({ icon: '⚠️', cls: 'warn', title: 'Thin buffer at the low point', body: `Lowest projected balance is <strong>${fmt$(f.low.bal)}</strong> around <strong>${fmtDate(f.low.date)}</strong> — under a $500 cushion. One surprise charge in that window stings.` });
  if (f.discPerDay > f.maxPace && f.includeDisc) warnings.push({ icon: '📉', cls: 'warn', title: 'Everyday pace exceeds the sustainable pace', body: `Historical non-recurring spending runs <strong>${fmt$(f.discPerDay)}/day</strong>; this forecast's fixed income/charges leave room for about <strong>${fmt$(f.maxPace)}/day</strong> before the balance would end at $0.` });
  if (!warnings.length) warnings.push({ icon: '✅', cls: 'ok', title: 'No danger zone in this window', body: `Projected balance stays positive across the next ${f.horizon} days, bottoming at <strong>${fmt$(f.low.bal)}</strong> around ${fmtDate(f.low.date)}.` });

  $('panel-forecast').innerHTML = `
    <div class="panel-card"><h3>🔮 Cash-flow forecast</h3>
      <p class="muted small">Projects your recurring income and charges (detected from this data) forward from <strong>${fmtDate(f.anchor)}</strong> — the day after your last transaction. ${f.includeDisc ? 'Everyday (non-recurring) spending is layered in at your historical daily pace.' : 'Everyday spending is currently excluded — fixed charges only.'} Starting balance source: ${esc(f.startSource)}.</p>
      <div class="rule-form">
        <label class="muted small">Starting balance $<input id="fcStart" type="number" step="0.01" class="input small" value="${P.forecastStart != null && P.forecastStart !== '' ? esc(P.forecastStart) : ''}" placeholder="${f.start.toFixed(2)}"></label>
        <label class="muted small">Horizon <select id="fcHorizon" class="input small"><option value="30" ${f.horizon === 30 ? 'selected' : ''}>30 days</option><option value="60" ${f.horizon === 60 ? 'selected' : ''}>60 days</option><option value="90" ${f.horizon === 90 ? 'selected' : ''}>90 days</option></select></label>
        <label class="muted small"><input id="fcDisc" type="checkbox" ${f.includeDisc ? 'checked' : ''}> Include everyday spending pace</label>
        <button id="fcApply" class="btn small">Update forecast</button>
      </div>
    </div>
    <div class="kpis mt">
      <div class="kpi"><div class="kpi-label">Starting balance</div><div class="kpi-val">${fmt$(f.start)}</div></div>
      <div class="kpi"><div class="kpi-label">Projected in (${f.horizon}d)</div><div class="kpi-val pos">${fmt$(f.fixedIn)}</div></div>
      <div class="kpi"><div class="kpi-label">Projected fixed out</div><div class="kpi-val neg">${fmt$(f.fixedOut)}</div></div>
      <div class="kpi"><div class="kpi-label">Projected end balance</div><div class="kpi-val ${f.endBal >= 0 ? 'pos' : 'neg'}">${fmt$(f.endBal)}</div></div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Low point</div><div class="kpi-val ${f.low.bal < 0 ? 'neg' : ''}">${fmt$(f.low.bal)}</div><div class="muted small">around ${fmtDate(f.low.date)}</div></div>
      <div class="kpi"><div class="kpi-label">Everyday pace (history)</div><div class="kpi-val">${fmt$(f.discPerDay)}/day</div></div>
      <div class="kpi"><div class="kpi-label">Max sustainable pace</div><div class="kpi-val">${fmt$(f.maxPace)}/day</div><div class="muted small">and still end ≥ $0</div></div>
      <div class="kpi"><div class="kpi-label">Recurring detected</div><div class="kpi-val">${f.recIn.length} in · ${f.recOut.length} out</div></div>
    </div>
    <div class="panel-card mt"><h3>Projected balance</h3>${forecastChart(f.series, f.start)}</div>
    <div class="mt">${warnings.map((w) => `<div class="finding ${w.cls === 'bad' ? 'warn' : ''}"><div class="finding-icon">${w.icon}</div><div><h4>${w.title}</h4><p>${w.body}</p></div></div>`).join('')}</div>
    <div class="panel-card mt"><h3>📅 Upcoming recurring events</h3>
      ${f.events.length ? `<div class="tx-scroll"><table class="data"><thead><tr><th>Date</th><th>Merchant / source</th><th>Cadence</th><th style="text-align:right">Amount</th></tr></thead><tbody>
      ${f.events.slice(0, 25).map((e) => `<tr><td class="nowrap">${fmtDate(e.date)}</td><td>${esc(cleanMerchant(e.desc))}</td><td>${esc(e.cadence)}</td><td style="text-align:right" class="${e.amount < 0 ? 'neg' : 'pos'}">${fmt$(e.amount)}</td></tr>`).join('')}
      </tbody></table></div>${f.events.length > 25 ? `<p class="muted small">+ ${f.events.length - 25} more events in the window.</p>` : ''}` : '<p class="muted">No recurring income or charges detected — the forecast needs at least 2 occurrences of a charge or deposit on a regular cadence. Load a few months of statements to give it something to work with.</p>'}
      <p class="muted small">Balance trajectory note: ${APP.txns.some((t) => typeof t.balance === 'number') ? 'your import included running balances, and the latest one seeds this forecast when you don\'t enter a starting balance.' : 'this import had no running-balance column — enter a starting balance above for an accurate level (the shape still comes from your real recurring charges).'}</p>
    </div>`;
  $('fcApply').addEventListener('click', () => {
    const v = $('fcStart').value;
    APP.profile.forecastStart = v === '' ? null : +v;
    APP.profile.forecastHorizon = +$('fcHorizon').value;
    APP.profile.forecastIncludeDiscretionary = $('fcDisc').checked;
    renderForecast();
  });
}
TAB_RENDERERS.forecast = renderForecast;
