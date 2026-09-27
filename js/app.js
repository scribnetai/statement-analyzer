/* Statement Analyzer — 100% client-side. Transactions live only in memory. */
'use strict';

/* ================= utils ================= */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt$ = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const monthKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); };

/* ================= CSV parsing ================= */
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

function detectColumns(header) {
  const H = header.map((h) => h.trim().toLowerCase());
  const find = (...names) => {
    for (const n of names) { const i = H.findIndex((h) => h === n || h.includes(n)); if (i >= 0) return i; }
    return -1;
  };
  let date = find('posted date', 'post date', 'transaction date', 'trans date');
  if (date < 0) date = H.findIndex((h) => h === 'date');
  const desc = find('payee', 'description', 'merchant', 'memo', 'transaction description', 'name');
  let amt = find('amount');
  let debit = -1, credit = -1;
  if (amt < 0) { debit = find('withdrawal', 'debit', 'paid out'); credit = find('deposit', 'credit', 'paid in'); }
  return { date, desc, amt, debit, credit };
}

function parseDate(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[1] - 1, +m[2]); return isNaN(d) ? null : d; }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d) ? null : d; }
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[1] - 1, +m[2]); return isNaN(d) ? null : d; }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseAmount(s) {
  s = String(s).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, '');
  if (/[^0-9.\-+]/.test(s)) return null;
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function buildTransactions(rows) {
  if (!rows.length) return { error: 'The file looks empty.' };
  const cols = detectColumns(rows[0]);
  if (cols.date < 0 || cols.desc < 0 || (cols.amt < 0 && (cols.debit < 0 || cols.credit < 0))) {
    return { error: 'Could not find date, description, and amount columns. Detected headers: ' + rows[0].map(esc).join(', ') };
  }
  const txns = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const d = parseDate(r[cols.date] || '');
    let amt = null;
    if (cols.amt >= 0) amt = parseAmount(r[cols.amt] || '');
    else {
      const dr = parseAmount(r[cols.debit] || ''), cr = parseAmount(r[cols.credit] || '');
      if (dr !== null || cr !== null) amt = (cr || 0) - (dr || 0);
    }
    const desc = (r[cols.desc] || '').trim();
    if (!d || amt === null || !desc) continue;
    txns.push({ date: d, desc, amount: amt });
  }
  if (!txns.length) return { error: 'No usable transactions found — check that the CSV has date, description, and amount columns with data rows.' };
  txns.sort((a, b) => a.date - b.date);
  return { txns, format: cols.amt >= 0 && /running/.test(rows[0].join(' ').toLowerCase()) ? 'checking' : (cols.debit >= 0 ? 'debit/credit' : 'card') };
}

/* ================= categorization ================= */
const CATS = ['Groceries', 'Dining & Coffee', 'Gas & Transit', 'Shopping', 'Subscriptions', 'Utilities & Bills', 'Housing', 'Health & Pharmacy', 'Travel', 'Entertainment', 'Pets', 'Income', 'Transfers', 'Fees & Interest', 'Cash & ATM', 'Other'];
const CAT_COLORS = {
  'Groceries': '#3ddc84', 'Dining & Coffee': '#f5a623', 'Gas & Transit': '#4f8cff', 'Shopping': '#b388ff',
  'Subscriptions': '#ff6b9d', 'Utilities & Bills': '#7aa8ff', 'Housing': '#e2b857', 'Health & Pharmacy': '#5eead4',
  'Travel': '#60a5fa', 'Entertainment': '#f472b6', 'Pets': '#a3e635', 'Income': '#34d399',
  'Transfers': '#94a3b8', 'Fees & Interest': '#ff6b6b', 'Cash & ATM': '#d4a373', 'Other': '#6b7484'
};
// Order matters: specific merchants before general keywords.
const RULES = [
  [/netflix|spotify|hulu|disney\+|hbo|apple\.com\/bill|icloud|prime video|audible|patreon|planet fitness|la fitness|equinox|nytimes|wsj\.com|xbox|playstation|nintendo|prime membership|google one|google storage|dropbox|sirius/i, 'Subscriptions'],
  [/late fee|overdraft|annual fee|finance charge|interest charge|service fee|returned item fee/i, 'Fees & Interest'],
  [/payroll|direct dep|salary|tax refund|stimulus/i, 'Income'],
  [/zelle|venmo|cash app|wire transfer|transfer to|transfer from/i, 'Transfers'],
  [/whole foods|trader joe|stop ?& ?shop|shaw'?s|market basket|wegmans|aldi|costco|bj'?s|kroger|safeway|publix|grocery|food lion|hannaford/i, 'Groceries'],
  [/starbucks|dunkin|chipotle|mcdonald|chick-?fil-?a|panera|subway|wendy'?s|taco bell|doordash|uber eats|grubhub|restaurant|cafe|coffee|pizza|bakery|deli|diner|bistro|sushi|bar & grill|tavern|pub\b|ice cream|bagel|donut/i, 'Dining & Coffee'],
  [/shell|exxon|mobil|chevron|\bbp\b|sunoco|citgo|speedway|gas\b|uber\b(?! eats)|lyft|amtrak|mbta|parking|ez-?pass|toll/i, 'Gas & Transit'],
  [/amazon|target|walmart|best buy|home depot|lowes|lowe'?s|ikea|nike|ebay|etsy|clothing|apparel|mall|department store/i, 'Shopping'],
  [/national grid|eversource|electric|power company|\bwater\b|sewer|comcast|xfinity|verizon|at&t|t-mobile|sprint|spectrum|internet|phone bill|utility|utilities/i, 'Utilities & Bills'],
  [/\brent\b|mortgage|property tax|\bhoa\b|apartment|landlord/i, 'Housing'],
  [/\bcvs\b|walgreens|rite aid|pharmacy|doctor|dentist|hospital|clinic|urgent care|optical|dental/i, 'Health & Pharmacy'],
  [/delta|united|american airlines|jetblue|southwest|airline|hotel|marriott|hilton|airbnb|vrbo|expedia|rental car|hertz|enterprise|cruise/i, 'Travel'],
  [/cinema|theater|theatre|ticketmaster|steam|concert|golf|bowling|arcade|movies/i, 'Entertainment'],
  [/petco|petsmart|chewy|\bvet\b|veterinarian|pet supplies/i, 'Pets'],
  [/\batm\b|cash withdrawal/i, 'Cash & ATM'],
];

function normalizePayee(s) {
  return String(s).toUpperCase().replace(/#\d+/g, '').replace(/\b\d{4,}\b/g, '').replace(/\s{2,}/g, ' ').trim();
}

function categorize(txn, overrides) {
  const key = normalizePayee(txn.desc);
  if (overrides[key]) return overrides[key];
  if (txn.amount > 0 && /payment|thank you/i.test(txn.desc)) return 'Transfers';
  for (const [re, cat] of RULES) if (re.test(txn.desc)) return cat;
  return txn.amount > 0 ? 'Income' : 'Other';
}

/* ================= state ================= */
const APP = { txns: [], overrides: {}, fileName: '', demo: false, format: '', flipped: false };

function withCats() {
  return APP.txns.map((t) => ({ ...t, cat: categorize(t, APP.overrides) }));
}

/* ================= demo data ================= */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function genDemoData() {
  const rnd = mulberry32(20260926);
  const txns = [];
  const start = new Date(2026, 5, 1), end = new Date(2026, 8, 26);
  const day = 86400000;
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => +(a + rnd() * (b - a)).toFixed(2);
  const at = (base, jitterDays) => new Date(base.getTime() + Math.floor((rnd() * 2 - 1) * jitterDays) * day);

  // Monthly recurring
  const subs = [
    ['NETFLIX', 15.49], ['SPOTIFY USA', 11.99], ['PLANET FITNESS', 39.99],
    ['COMCAST', 89.99], ['AMAZON PRIME', 14.99], ['EVERSOURCE', 145.00],
  ];
  for (let m = 5; m <= 8; m++) {
    for (const [payee, amt] of subs) {
      const jitter = payee === 'EVERSOURCE' ? between(-30, 45) : 0;
      txns.push({ date: at(new Date(2026, m, 15), 2), desc: payee, amount: -(amt + jitter) });
    }
    // Paycheck + card payment
    txns.push({ date: new Date(2026, m, 1), desc: 'PAYROLL DIRECT DEP', amount: 3200 });
    txns.push({ date: new Date(2026, m, 15), desc: 'PAYROLL DIRECT DEP', amount: 3200 });
    txns.push({ date: at(new Date(2026, m, 20), 2), desc: 'PAYMENT - THANK YOU', amount: between(1400, 2100) });
  }
  // Weekly groceries
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 7 * day)) {
    txns.push({ date: at(d, 1), desc: pick(['WHOLE FOODS #1042', 'TRADER JOES #553', "SHAW'S #2210"]), amount: -between(45, 145) });
  }
  // Coffee ~2x/week
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 3.5 * day)) {
    txns.push({ date: at(d, 1), desc: pick(['STARBUCKS', 'DUNKIN #341122']), amount: -between(3.5, 8.5) });
  }
  // Gas biweekly
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 14 * day)) {
    txns.push({ date: at(d, 2), desc: pick(['SHELL', 'EXXONMOBIL']), amount: -between(35, 62) });
  }
  // Dining ~weekly
  const diners = ['CHIPOTLE', 'MCDONALDS', 'DOORDASH', 'PANERA BREAD', 'LOCAL PIZZA', 'SUSHI HOUSE'];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 7 * day)) {
    if (rnd() < 0.75) txns.push({ date: at(d, 2), desc: pick(diners), amount: -between(12, 58) });
  }
  // Shopping scatter
  const shops = ['AMAZON', 'TARGET', 'BEST BUY', 'HOME DEPOT'];
  for (let i = 0; i < 26; i++) {
    txns.push({ date: new Date(start.getTime() + rnd() * (end - start)), desc: pick(shops), amount: -between(18, 130) });
  }
  // Planted findings: duplicate charge, a fee, one big spike
  txns.push({ date: new Date(2026, 7, 14), desc: 'DELTA AIR LINES', amount: -342.10 });
  txns.push({ date: new Date(2026, 7, 16), desc: 'DELTA AIR LINES', amount: -342.10 });
  txns.push({ date: new Date(2026, 6, 28), desc: 'LATE FEE', amount: -29.00 });
  txns.push({ date: new Date(2026, 8, 5), desc: 'BEST BUY', amount: -1899.00 });
  txns.push({ date: new Date(2026, 7, 22), desc: 'ATM WITHDRAWAL', amount: -200.00 });

  txns.sort((a, b) => a.date - b.date);
  return txns;
}

/* ================= dashboard ================= */
function summarize(list) {
  let inflow = 0, outflow = 0;
  const byCat = {}, byMonth = {}, byPayee = {};
  for (const t of list) {
    if (t.amount > 0) inflow += t.amount; else outflow += -t.amount;
    byCat[t.cat] = (byCat[t.cat] || 0) + t.amount;
    const mk = monthKey(t.date);
    byMonth[mk] = byMonth[mk] || { in: 0, out: 0 };
    if (t.amount > 0) byMonth[mk].in += t.amount; else byMonth[mk].out += -t.amount;
    const pk = normalizePayee(t.desc);
    byPayee[pk] = byPayee[pk] || { desc: t.desc.trim(), total: 0, count: 0 };
    byPayee[pk].total += t.amount; byPayee[pk].count++;
  }
  return { inflow, outflow, net: inflow - outflow, byCat, byMonth, byPayee, count: list.length };
}

function donutSVG(byCat) {
  const entries = Object.entries(byCat).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const total = entries.reduce((s, [, v]) => s + -v, 0) || 1;
  const R = 70, C = 2 * Math.PI * R;
  let offset = 25, segs = '';
  const top = entries.slice(0, 8), rest = entries.slice(8);
  const shown = top.concat(rest.length ? [['Other', rest.reduce((s, [, v]) => s + v, 0)]] : []);
  shown.forEach(([cat, v]) => {
    const frac = -v / total;
    segs += `<circle cx="90" cy="90" r="${R}" fill="none" stroke="${CAT_COLORS[cat] || '#6b7484'}" stroke-width="26" stroke-dasharray="${(frac * C).toFixed(1)} ${C.toFixed(1)}" stroke-dashoffset="${(-offset * C / 100).toFixed(1)}" transform="rotate(-90 90 90)"><title>${esc(cat)}: ${fmt$(-v)}</title></circle>`;
    offset += frac * 100;
  });
  return `<svg viewBox="0 0 180 180" class="donut">${segs}<text x="90" y="86" text-anchor="middle" class="donut-total">${fmt$(total)}</text><text x="90" y="104" text-anchor="middle" class="donut-label">total spend</text></svg>`;
}

function catBars(byCat) {
  const entries = Object.entries(byCat).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  const max = entries.length ? -entries[0][1] : 1;
  return entries.map(([cat, v]) => `
    <div class="bar-row">
      <span class="bar-label">${esc(cat)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(-v / max * 100).toFixed(1)}%;background:${CAT_COLORS[cat] || '#6b7484'}"></div></div>
      <span class="bar-val">${fmt$(-v)}</span>
    </div>`).join('');
}

function trendSVG(byMonth) {
  const keys = Object.keys(byMonth).sort();
  if (!keys.length) return '<p class="muted">Not enough data.</p>';
  const max = Math.max(...keys.map((k) => Math.max(byMonth[k].in, byMonth[k].out)), 1);
  const W = 64, H = 150;
  const bars = keys.map((k) => {
    const m = byMonth[k];
    const hi = (m.in / max * (H - 24)).toFixed(1), ho = (m.out / max * (H - 24)).toFixed(1);
    return `<g>
      <rect x="0" y="${(H - 24 - hi).toFixed(1)}" width="26" height="${hi}" rx="4" fill="#3ddc84"><title>${monthLabel(k)} in: ${fmt$(m.in)}</title></rect>
      <rect x="30" y="${(H - 24 - ho).toFixed(1)}" width="26" height="${ho}" rx="4" fill="#ff6b6b"><title>${monthLabel(k)} out: ${fmt$(m.out)}</title></rect>
      <text x="28" y="${H - 8}" text-anchor="middle" class="trend-label">${monthLabel(k).split(' ')[0]}</text>
    </g>`;
  }).join('');
  const groups = keys.map((k, i) => `<g transform="translate(${i * W + 4},0)">${bars.split('</g>')[i]}</g>`).join('');
  return `<svg viewBox="0 0 ${keys.length * W} ${H}" class="trend" style="min-width:${keys.length * W}px">${groups}</svg>
    <div class="legend"><span><i class="sw" style="background:#3ddc84"></i>Money in</span><span><i class="sw" style="background:#ff6b6b"></i>Money out</span></div>`;
}

function renderSummary() {
  const list = withCats();
  const s = summarize(list);
  const dates = list.map((t) => t.date);
  const range = dates.length ? fmtDate(new Date(Math.min(...dates))) + ' → ' + fmtDate(new Date(Math.max(...dates))) : '';
  $('dashMeta').textContent = `${APP.fileName} · ${s.count} transactions · ${range}${APP.demo ? ' · demo data' : ''}`;

  const topPayees = Object.values(s.byPayee).filter((p) => p.total < 0)
    .sort((a, b) => a.total - b.total).slice(0, 10);

  $('panel-summary').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Money out</div><div class="kpi-val neg">${fmt$(s.outflow)}</div></div>
      <div class="kpi"><div class="kpi-label">Money in</div><div class="kpi-val pos">${fmt$(s.inflow)}</div></div>
      <div class="kpi"><div class="kpi-label">Net</div><div class="kpi-val ${s.net >= 0 ? 'pos' : 'neg'}">${fmt$(s.net)}</div></div>
      <div class="kpi"><div class="kpi-label">Transactions</div><div class="kpi-val">${s.count}</div></div>
    </div>
    <div class="grid2">
      <div class="panel-card"><h3>Spending by category</h3><div class="donut-wrap">${donutSVG(s.byCat)}</div><div class="mt">${catBars(s.byCat)}</div></div>
      <div class="panel-card"><h3>Monthly trend</h3><div class="trend-scroll">${trendSVG(s.byMonth)}</div></div>
    </div>
    <div class="panel-card mt"><h3>Top payees (by spend)</h3>
      <table class="data"><thead><tr><th>Payee</th><th>Transactions</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${topPayees.map((p) => `<tr><td>${esc(p.desc)}</td><td>${p.count}</td><td style="text-align:right">${fmt$(p.total)}</td></tr>`).join('')}</tbody></table>
    </div>`;
}

/* ================= transactions ================= */
function renderTransactions(filter = '', catFilter = '') {
  const list = withCats().slice().reverse();
  const q = filter.trim().toLowerCase();
  const rows = list.filter((t) =>
    (!q || t.desc.toLowerCase().includes(q)) && (!catFilter || t.cat === catFilter));
  $('panel-transactions').innerHTML = `
    <div class="tx-controls">
      <input id="txSearch" class="input" placeholder="Search payee…" value="${esc(filter)}">
      <select id="txCatFilter" class="input">
        <option value="">All categories</option>
        ${CATS.map((c) => `<option ${c === catFilter ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <span class="muted small">${rows.length} of ${list.length} shown</span>
    </div>
    <div class="tx-scroll"><table class="data">
      <thead><tr><th>Date</th><th>Payee</th><th>Category</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows.slice(0, 500).map((t, i) => `
        <tr>
          <td class="nowrap">${fmtDate(t.date)}</td>
          <td>${esc(t.desc)}</td>
          <td><select class="input small catpick" data-payee="${esc(normalizePayee(t.desc))}">
            ${CATS.map((c) => `<option ${c === t.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}
          </select></td>
          <td style="text-align:right" class="${t.amount < 0 ? 'neg' : 'pos'}">${fmt$(t.amount)}</td>
        </tr>`).join('')}</tbody>
    </table>${rows.length > 500 ? '<p class="muted small">Showing first 500 — narrow the search to see more.</p>' : ''}</div>
    <p class="muted small">Changing a category remembers that payee for the rest of this session.</p>`;
  $('txSearch').addEventListener('input', (e) => renderTransactions(e.target.value, $('txCatFilter').value));
  $('txCatFilter').addEventListener('change', (e) => renderTransactions($('txSearch').value, e.target.value));
  document.querySelectorAll('.catpick').forEach((sel) => sel.addEventListener('change', (e) => {
    APP.overrides[e.target.dataset.payee] = e.target.value;
    renderSummary(); renderFindings();
    const q2 = $('txSearch') ? $('txSearch').value : '', cf = $('txCatFilter') ? $('txCatFilter').value : '';
    renderTransactions(q2, cf);
  }));
}

/* ================= findings ================= */
function computeFindings() {
  const list = withCats();
  const out = list.filter((t) => t.amount < 0);
  const F = [];
  const push = (icon, title, body) => F.push({ icon, title, body });

  // Recurring charges
  const groups = {};
  for (const t of out) {
    const k = normalizePayee(t.desc) + '|' + Math.abs(t.amount).toFixed(2);
    groups[k] = groups[k] || { desc: t.desc.trim(), amount: -t.amount, dates: [] };
    groups[k].dates.push(t.date);
  }
  const recurring = Object.values(groups).filter((g) => {
    const months = new Set(g.dates.map(monthKey));
    return months.size >= 2 && g.dates.length >= 2;
  }).sort((a, b) => b.amount - a.amount);
  if (recurring.length) {
    const monthly = recurring.reduce((s, g) => s + g.amount, 0);
    push('🔁', 'Recurring charges detected', `${recurring.length} repeating charges totaling <strong>${fmt$(monthly)}/mo</strong> (${fmt$(monthly * 12)}/yr): ` +
      recurring.slice(0, 8).map((g) => `${esc(g.desc)} ${fmt$(g.amount)}`).join(' · ') + (recurring.length > 8 ? ` · +${recurring.length - 8} more` : ''));
  }

  // Duplicates
  const seen = {};
  const dups = [];
  for (const t of out) {
    const k = normalizePayee(t.desc) + '|' + Math.abs(t.amount).toFixed(2);
    seen[k] = seen[k] || [];
    for (const prev of seen[k]) {
      if (Math.abs(t.date - prev) <= 4 * 86400000 && Math.abs(t.date - prev) > 0) { dups.push(t); break; }
    }
    seen[k].push(t.date);
  }
  if (dups.length) push('⚠️', 'Possible duplicate charges', `${dups.length} charge(s) match an earlier identical charge within 4 days — worth verifying: ` +
    dups.slice(0, 5).map((t) => `${esc(t.desc.trim())} ${fmt$(t.amount)} on ${fmtDate(t.date)}`).join(' · '));

  // Largest purchase
  if (out.length) {
    const big = out.reduce((a, b) => (a.amount < b.amount ? a : b));
    push('💰', 'Largest single purchase', `<strong>${fmt$(-big.amount)}</strong> at ${esc(big.desc.trim())} on ${fmtDate(big.date)}.`);
  }

  // Category shares
  const s = summarize(list);
  const catOut = Object.entries(s.byCat).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]);
  if (catOut.length && s.outflow > 0) {
    const [topCat, topVal] = catOut[0];
    push('📊', 'Where the money goes', `<strong>${esc(topCat)}</strong> is your top category at ${fmt$(-topVal)} — ${(-topVal / s.outflow * 100).toFixed(0)}% of all spending.`);
    const dining = -(s.byCat['Dining & Coffee'] || 0), groc = -(s.byCat['Groceries'] || 0);
    if (dining > 0 && groc > 0) push('🍽️', 'Dining vs groceries', `You spend <strong>${fmt$(dining)}</strong> on dining & coffee vs <strong>${fmt$(groc)}</strong> on groceries — a ${(dining / groc).toFixed(1)}:1 ratio.`);
  }

  // Month-over-month
  const mks = Object.keys(s.byMonth).sort();
  if (mks.length >= 2) {
    const last = s.byMonth[mks[mks.length - 1]], prev = s.byMonth[mks[mks.length - 2]];
    if (prev.out > 0) {
      const pct = (last.out - prev.out) / prev.out * 100;
      push(pct >= 0 ? '📈' : '📉', 'Month-over-month trend', `Spending ${pct >= 0 ? 'rose' : 'fell'} <strong>${Math.abs(pct).toFixed(0)}%</strong> from ${monthLabel(mks[mks.length - 2])} (${fmt$(prev.out)}) to ${monthLabel(mks[mks.length - 1])} (${fmt$(last.out)}).`);
    }
  }

  // Weekend vs weekday
  let we = 0, wd = 0;
  for (const t of out) { const d = t.date.getDay(); if (d === 0 || d === 6) we += -t.amount; else wd += -t.amount; }
  if (we + wd > 0) push('🗓️', 'Weekend spending', `<strong>${(we / (we + wd) * 100).toFixed(0)}%</strong> of spending (${fmt$(we)}) lands on weekends.`);

  // Fees
  const fees = -(s.byCat['Fees & Interest'] || 0);
  if (fees > 0) push('🧾', 'Fees & interest', `You're paying <strong>${fmt$(fees)}</strong> in fees and interest charges in this period.`);
  else push('✅', 'No fees found', `No fee or interest charges detected in this period.`);

  // Cash
  const cash = -(s.byCat['Cash & ATM'] || 0);
  if (cash > 0) push('🏧', 'Cash withdrawals', `${fmt$(cash)} withdrawn as cash — invisible to category analysis once it leaves the ATM.`);

  // Spikes
  const medByPayee = {};
  for (const t of out) {
    const k = normalizePayee(t.desc);
    medByPayee[k] = medByPayee[k] || [];
    medByPayee[k].push(-t.amount);
  }
  const spikes = [];
  for (const t of out) {
    const arr = medByPayee[normalizePayee(t.desc)].slice().sort((a, b) => a - b);
    if (arr.length >= 3) {
      const med = arr[Math.floor(arr.length / 2)];
      if (med >= 20 && -t.amount > med * 3) spikes.push({ t, med });
    }
  }
  if (spikes.length) {
    spikes.sort((a, b) => b.t.amount - a.t.amount);
    push('🚨', 'Unusual spikes', `${spikes.length} charge(s) far above the payee's normal: ` +
      spikes.slice(0, 5).map(({ t, med }) => `${esc(t.desc.trim())} ${fmt$(t.amount)} (usually ~${fmt$(med)})`).join(' · '));
  }

  // Most frequent payee
  const freq = Object.values(s.byPayee).filter((p) => p.total < 0).sort((a, b) => b.count - a.count)[0];
  if (freq && freq.count >= 3) push('🔁', 'Most frequent payee', `${esc(freq.desc)} appears <strong>${freq.count} times</strong> totaling ${fmt$(freq.total)}.`);

  // Income coverage
  if (s.inflow > 0 && s.outflow > 0) {
    const ratio = s.outflow / s.inflow;
    push(ratio <= 1 ? '💪' : '⚖️', 'Income vs spending', `Spending is <strong>${(ratio * 100).toFixed(0)}%</strong> of income (${fmt$(s.outflow)} out vs ${fmt$(s.inflow)} in).` +
      (ratio > 1 ? ' You spent more than came in during this period.' : ''));
  }

  // Avg daily spend
  const dates = list.map((t) => t.date);
  if (dates.length > 1 && s.outflow > 0) {
    const days = Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) + 1;
    push('📅', 'Daily run rate', `Averaging <strong>${fmt$(s.outflow / days)}/day</strong> in spending over ${days} days.`);
  }

  return F;
}

function renderFindings() {
  const F = computeFindings();
  $('panel-findings').innerHTML = F.length
    ? `<div class="findings">${F.map((f) => `<div class="finding"><div class="finding-icon">${f.icon}</div><div><h4>${f.title}</h4><p>${f.body}</p></div></div>`).join('')}</div>`
    : '<p class="muted">No findings — not enough data.</p>';
}

/* ================= report ================= */
function buildReport() {
  const list = withCats();
  const s = summarize(list);
  const F = computeFindings();
  const catRows = Object.entries(s.byCat).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1])
    .map(([c, v]) => `<tr><td>${esc(c)}</td><td style="text-align:right">${fmt$(-v)}</td><td style="text-align:right">${(-v / s.outflow * 100).toFixed(1)}%</td></tr>`).join('');
  const mRows = Object.keys(s.byMonth).sort().map((k) =>
    `<tr><td>${monthLabel(k)}</td><td style="text-align:right">${fmt$(s.byMonth[k].in)}</td><td style="text-align:right">${fmt$(s.byMonth[k].out)}</td></tr>`).join('');
  const topPayees = Object.values(s.byPayee).filter((p) => p.total < 0).sort((a, b) => a.total - b.total).slice(0, 15)
    .map((p) => `<tr><td>${esc(p.desc)}</td><td>${p.count}</td><td style="text-align:right">${fmt$(p.total)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement Analysis Report</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:900px;margin:0 auto;padding:32px;color:#1a1a1a;line-height:1.5}
h1{font-size:1.6rem}h2{font-size:1.2rem;margin-top:2rem;border-bottom:2px solid #eee;padding-bottom:4px}
table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:8px 10px;text-align:left;font-size:.92rem}th{background:#f5f5f5}
.kpis{display:flex;gap:16px;flex-wrap:wrap}.kpi{border:1px solid #ddd;border-radius:8px;padding:12px 18px;min-width:150px}.kpi .l{font-size:.8rem;color:#666}.kpi .v{font-size:1.3rem;font-weight:700}
.finding{border-left:4px solid #4f8cff;padding:8px 14px;margin:10px 0;background:#f8faff}.finding h4{margin:0 0 4px}.finding p{margin:0}
.muted{color:#666;font-size:.85rem}@media print{.no-print{display:none}}</style></head><body>
<h1>Statement Analysis Report</h1>
<p class="muted">Generated ${new Date().toLocaleString()} in-browser · ${esc(APP.fileName)} · ${s.count} transactions${APP.demo ? ' · DEMO DATA' : ''}</p>
<div class="kpis">
<div class="kpi"><div class="l">Money out</div><div class="v">${fmt$(s.outflow)}</div></div>
<div class="kpi"><div class="l">Money in</div><div class="v">${fmt$(s.inflow)}</div></div>
<div class="kpi"><div class="l">Net</div><div class="v">${fmt$(s.net)}</div></div>
</div>
<h2>Findings</h2>${F.map((f) => `<div class="finding"><h4>${f.icon} ${f.title}</h4><p>${f.body}</p></div>`).join('')}
<h2>Spending by category</h2><table><thead><tr><th>Category</th><th style="text-align:right">Total</th><th style="text-align:right">Share</th></tr></thead><tbody>${catRows}</tbody></table>
<h2>Monthly totals</h2><table><thead><tr><th>Month</th><th style="text-align:right">In</th><th style="text-align:right">Out</th></tr></thead><tbody>${mRows}</tbody></table>
<h2>Top payees</h2><table><thead><tr><th>Payee</th><th>Count</th><th style="text-align:right">Total</th></tr></thead><tbody>${topPayees}</tbody></table>
<p class="muted">Produced locally by Statement Analyzer — no data was uploaded anywhere.</p>
</body></html>`;
}

function renderReport() {
  $('panel-report').innerHTML = `
    <div class="panel-card"><h3>Downloadable report</h3>
      <p class="muted">A standalone HTML file with the KPIs, findings, category breakdown, monthly totals, and top payees. Self-contained, print-friendly — save or share it wherever you like.</p>
      <button id="dlReport" class="btn">⬇ Download HTML report</button>
    </div>`;
  $('dlReport').addEventListener('click', () => {
    const blob = new Blob([buildReport()], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'statement-analysis-report.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  });
}

/* ================= tabs ================= */
function switchTab(name) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== 'panel-' + name; });
  if (name === 'summary') renderSummary();
  if (name === 'transactions') renderTransactions();
  if (name === 'findings') renderFindings();
  if (name === 'report') renderReport();
}

/* ================= boot ================= */
function setStatus(msg, isError) {
  const el = $('parseStatus');
  el.hidden = false;
  el.className = 'parse-status ' + (isError ? 'error' : 'ok');
  el.textContent = msg;
}

function boot(txns, fileName, demo) {
  APP.txns = txns; APP.overrides = {}; APP.fileName = fileName; APP.demo = !!demo; APP.flipped = false;
  $('demoBanner').hidden = !demo;
  $('landing').hidden = true;
  $('dashboard').hidden = false;
  window.scrollTo({ top: 0 });
  switchTab('summary');
  setStatus(`✅ Loaded ${txns.length} transactions from ${fileName} — all in this tab's memory, nothing uploaded.`, false);
  setTimeout(() => { $('parseStatus').hidden = true; }, 5000);
}

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(String(reader.result));
      const res = buildTransactions(rows);
      if (res.error) {
        const fe = $('fileError');
        fe.hidden = false;
        fe.textContent = '⚠️ ' + res.error;
        return;
      }
      $('fileError').hidden = true;
      boot(res.txns, file.name, false);
    } catch (err) {
      const fe = $('fileError');
      fe.hidden = false;
      fe.textContent = '⚠️ Could not parse that file: ' + err.message;
    }
  };
  reader.readAsText(file);
}

function clearSession() {
  APP.txns = []; APP.overrides = {}; APP.fileName = ''; APP.demo = false; APP.flipped = false;
  $('fileInput').value = '';
  $('dashboard').hidden = true;
  $('landing').hidden = false;
  document.querySelectorAll('.tab-panel').forEach((p) => { p.innerHTML = ''; });
  window.scrollTo({ top: 0 });
  setStatus('✅ Session cleared — your transactions only ever existed in this tab\'s memory.', false);
  setTimeout(() => { $('parseStatus').hidden = true; }, 4000);
}

/* ================= changelog ================= */
function renderChangelog() {
  const body = $('changelog-body');
  if (!body) return;
  fetch('CHANGELOG.md', { cache: 'no-store' })
    .then((res) => { if (!res.ok) throw new Error('bad status'); return res.text(); })
    .then((md) => {
      let html = '', inList = false;
      const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
      for (const line of md.split('\n')) {
        if (line.startsWith('## ')) { closeList(); html += '<h4>' + esc(line.slice(3).trim()) + '</h4>'; }
        else if (line.startsWith('- ')) { if (!inList) { html += '<ul>'; inList = true; } html += '<li>' + esc(line.slice(2).trim()) + '</li>'; }
        else if (line.trim() === '' || line.startsWith('# ')) { closeList(); }
        else { closeList(); html += '<p>' + esc(line.trim()) + '</p>'; }
      }
      closeList();
      body.innerHTML = html || "<p class='muted'>Changelog unavailable.</p>";
    })
    .catch(() => { body.innerHTML = "<p class='muted'>Changelog unavailable.</p>"; });
}

document.addEventListener('DOMContentLoaded', () => {
  renderChangelog();

  const dz = $('dropzone'), fi = $('fileInput');
  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') fi.click(); });
  fi.addEventListener('change', () => handleFile(fi.files[0]));
  ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0]));

  $('demoBtn').addEventListener('click', () => boot(genDemoData(), 'demo-data.csv', true));

  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  $('clearBtn').addEventListener('click', clearSession);
  $('brandHome').addEventListener('click', (e) => { e.preventDefault(); clearSession(); });
  $('flipBtn').addEventListener('click', () => {
    if (!APP.txns.length) return;
    APP.txns.forEach((t) => { t.amount = -t.amount; });
    APP.flipped = !APP.flipped;
    switchTab(document.querySelector('#tabs button.active').dataset.tab);
    setStatus('⇄ Amount signs flipped — totals re-computed.', false);
    setTimeout(() => { $('parseStatus').hidden = true; }, 3000);
  });
});
