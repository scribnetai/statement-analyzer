/* Statement Analyzer v2 — budgeting tools modeled on Rocket Money / EveryDollar / YNAB / Monarch / Simplifi / PocketGuard / Caleb Hammer.
   All manual inputs live in APP.profile (memory only). Export/Import via JSON file the user keeps. */
'use strict';

/* ================= profile ================= */
function blankProfile() {
  return { budgets: {}, debts: [], goals: [], subMarks: {}, incomeMonthly: null, balance: null, housingMonthly: null, emergencyFund: null, retirementMonthly: null, debtPayMonthly: null };
}
APP.profile = blankProfile();

function monthsSpanned(list) {
  if (!list.length) return 1;
  return Math.max(1, new Set(list.map((t) => monthKey(t.date))).size);
}
function avgMonthlyInflow(list) {
  const m = monthsSpanned(list);
  return list.reduce((s, t) => s + (t.amount > 0 ? t.amount : 0), 0) / m;
}
function avgMonthlyOutflow(list) {
  const m = monthsSpanned(list);
  return list.reduce((s, t) => s + (t.amount < 0 ? -t.amount : 0), 0) / m;
}
function monthlyIncome() {
  if (APP.profile.incomeMonthly != null && APP.profile.incomeMonthly !== '') return +APP.profile.incomeMonthly || 0;
  return avgMonthlyInflow(withCats());
}
function median(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ================= recurring detector (Rocket Money style) ================= */
function detectRecurring(list) {
  const out = list.filter((t) => t.amount < 0);
  const groups = {};
  for (const t of out) {
    const k = normalizePayee(t.desc);
    (groups[k] = groups[k] || []).push(t);
  }
  const subs = [];
  for (const [key, txns] of Object.entries(groups)) {
    if (txns.length < 2) continue;
    txns.sort((a, b) => a.date - b.date);
    const amts = txns.map((t) => -t.amount);
    const intervals = [];
    for (let i = 1; i < txns.length; i++) intervals.push((txns[i].date - txns[i - 1].date) / 86400000);
    const med = median(intervals);
    let cadence = null, periodDays = null;
    if (med >= 26 && med <= 33) { cadence = 'Monthly'; periodDays = 30.44; }
    else if (med >= 6 && med <= 8) { cadence = 'Weekly'; periodDays = 7; }
    else if (med >= 13 && med <= 16) { cadence = 'Every 2 weeks'; periodDays = 14; }
    else if (med >= 85 && med <= 95) { cadence = 'Quarterly'; periodDays = 91.31; }
    else if (med >= 170 && med <= 195) { cadence = 'Semi-annual'; periodDays = 182.62; }
    else if (med >= 340 && med <= 380) { cadence = 'Annual'; periodDays = 365; }
    if (!cadence) continue;
    const avg = amts.reduce((s, v) => s + v, 0) / amts.length;
    const maxDev = Math.max(...amts.map((a) => Math.abs(a - avg)));
    const stable = maxDev <= Math.max(avg * 0.05, 1);
    const first = amts[0], last = amts[amts.length - 1];
    const increased = last > first * 1.05 && (last - first) >= 1;
    const monthlyCost = avg * (30.44 / periodDays);
    const confidence = (txns.length >= 3 && stable) ? 'High' : 'Medium';
    const lastDate = txns[txns.length - 1].date;
    subs.push({
      key, desc: txns[0].desc.trim(), cadence, periodDays, count: txns.length, avg, last, first,
      stable, increased, increasePct: first > 0 ? (last - first) / first * 100 : 0,
      monthlyCost, annualCost: monthlyCost * 12, confidence,
      lastDate, nextDate: new Date(lastDate.getTime() + med * 86400000),
    });
  }
  return subs.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

function renderSubs() {
  const subs = detectRecurring(withCats());
  const P = APP.profile;
  const totalMo = subs.reduce((s, x) => s + x.monthlyCost, 0);
  const increases = subs.filter((x) => x.increased);
  const markedCancel = subs.filter((x) => P.subMarks[x.key] === 'cancel');
  const saveMo = markedCancel.reduce((s, x) => s + x.monthlyCost, 0);

  const confBadge = (c) => `<span class="badge ${c === 'High' ? 'ok' : 'warn'}">${c}</span>`;
  $('panel-subs').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Recurring charges</div><div class="kpi-val">${subs.length}</div></div>
      <div class="kpi"><div class="kpi-label">Cost per month</div><div class="kpi-val neg">${fmt$(totalMo)}</div></div>
      <div class="kpi"><div class="kpi-label">Cost per year</div><div class="kpi-val neg">${fmt$(totalMo * 12)}</div></div>
      <div class="kpi"><div class="kpi-label">Price increases spotted</div><div class="kpi-val ${increases.length ? 'neg' : ''}">${increases.length}</div></div>
    </div>
    ${increases.length ? `<div class="panel-card"><h3>📈 Price increases</h3>${increases.map((x) =>
      `<div class="finding warn"><div class="finding-icon">📈</div><div><h4>${esc(x.desc)}</h4><p>Went ${fmt$(x.first)} → ${fmt$(x.last)} (${x.increasePct.toFixed(0)}% more) — that's an extra <strong>${fmt$((x.last - x.first) * (12 / (x.periodDays / 30.44)))}/yr</strong> at a ${x.cadence.toLowerCase()} cadence.</p></div></div>`).join('')}</div>` : ''}
    <div class="panel-card mt"><h3>💰 Cancellation savings planner</h3>
      <p class="muted">Mark subscriptions below as <strong>cancel</strong> to see what you'd free up — the Rocket Money move, without the 35–60% success fee.</p>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Marked to cancel</div><div class="kpi-val">${markedCancel.length}</div></div>
        <div class="kpi"><div class="kpi-label">Freed per month</div><div class="kpi-val pos">${fmt$(saveMo)}</div></div>
        <div class="kpi"><div class="kpi-label">Freed per year</div><div class="kpi-val pos">${fmt$(saveMo * 12)}</div></div>
      </div>
    </div>
    <div class="panel-card mt"><h3>All recurring charges</h3>
      ${subs.length ? `<div class="tx-scroll"><table class="data"><thead><tr><th>Merchant</th><th>Cadence</th><th>Confidence</th><th>Last charge</th><th style="text-align:right">Amount</th><th>Next est.</th><th>Your call</th></tr></thead><tbody>
      ${subs.map((x) => { const mark = P.subMarks[x.key] || 'review'; return `
        <tr>
          <td>${esc(x.desc)}${x.increased ? ' <span class="badge bad">↑ price</span>' : ''}</td>
          <td>${x.cadence} <span class="muted small">×${x.count}</span></td>
          <td>${confBadge(x.confidence)}</td>
          <td class="nowrap">${fmtDate(x.lastDate)}</td>
          <td style="text-align:right" class="neg">${fmt$(x.avg)}<div class="muted small">${fmt$(x.monthlyCost)}/mo</div></td>
          <td class="nowrap">${fmtDate(x.nextDate)}</td>
          <td><select class="input small submark" data-key="${esc(x.key)}">
            <option value="review" ${mark === 'review' ? 'selected' : ''}>Review</option>
            <option value="keep" ${mark === 'keep' ? 'selected' : ''}>Keep</option>
            <option value="cancel" ${mark === 'cancel' ? 'selected' : ''}>Cancel</option>
          </select></td>
        </tr>`; }).join('')}</tbody></table></div>
      <p class="muted small">Detection: same merchant + consistent cadence (monthly/weekly/annual) across 2+ charges. "High" confidence = 3+ charges with a stable amount.</p>`
      : '<p class="muted">No recurring patterns found — needs at least 2 charges from the same merchant on a regular cadence.</p>'}
    </div>`;
  document.querySelectorAll('.submark').forEach((sel) => sel.addEventListener('change', (e) => {
    APP.profile.subMarks[e.target.dataset.key] = e.target.value;
    renderSubs();
  }));
}
TAB_RENDERERS.subs = renderSubs;

/* ================= budget: zero-based worksheet (EveryDollar / YNAB style) ================= */
function budgetActuals() {
  // avg monthly outflow per category over the data range
  const list = withCats();
  const m = monthsSpanned(list);
  const byCat = {};
  for (const t of list) if (t.amount < 0) byCat[t.cat] = (byCat[t.cat] || 0) + -t.amount;
  const out = {};
  for (const [c, v] of Object.entries(byCat)) out[c] = v / m;
  return out;
}
function recurringMonthly() {
  return detectRecurring(withCats()).reduce((s, x) => s + x.monthlyCost, 0);
}
function goalsMonthly() {
  let need = 0;
  for (const g of APP.profile.goals) {
    const remaining = Math.max(0, g.target - g.saved);
    if (remaining <= 0 || !g.deadline) continue;
    const now = new Date();
    const dl = new Date(g.deadline + '-01');
    const months = Math.max(1, (dl.getFullYear() - now.getFullYear()) * 12 + (dl.getMonth() - now.getMonth()) + 1);
    need += remaining / months;
  }
  return need;
}

function renderBudget() {
  const P = APP.profile;
  const actuals = budgetActuals();
  const income = monthlyIncome();
  const cats = CATS.filter((c) => c !== 'Income' && c !== 'Transfers');
  const planned = {};
  let plannedTotal = 0;
  for (const c of cats) { planned[c] = +P.budgets[c] || 0; plannedTotal += planned[c]; }
  const left = income - plannedTotal;
  const recMo = recurringMonthly();
  const goalMo = goalsMonthly();
  const safeToSpend = income - recMo - goalMo - plannedTotal;

  $('panel-budget').innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Monthly income ${P.incomeMonthly != null && P.incomeMonthly !== '' ? '(your figure)' : '(avg from data)'}</div>
        <div class="kpi-val pos">${fmt$(income)}</div>
        <div class="mt"><input id="incomeInput" class="input small" type="number" min="0" step="50" placeholder="Override…" value="${P.incomeMonthly ?? ''}" style="max-width:150px"></div>
      </div>
      <div class="kpi"><div class="kpi-label">Left to budget</div><div class="kpi-val ${left >= 0 ? 'pos' : 'neg'}">${fmt$(left)}</div>
        <div class="muted small">${left === 0 ? '🎯 Every dollar has a job — a true zero-based budget.' : left > 0 ? 'Give every dollar a job — assign the rest above.' : 'Over budget — trim planned spending.'}</div></div>
      <div class="kpi"><div class="kpi-label">Recurring bills/mo (detected)</div><div class="kpi-val">${fmt$(recMo)}</div></div>
      <div class="kpi"><div class="kpi-label">Goals need/mo</div><div class="kpi-val">${fmt$(goalMo)}</div></div>
    </div>
    <div class="panel-card"><h3>🛡️ Safe to spend <span class="muted small">(PocketGuard / Simplifi style)</span></h3>
      <p class="lede-num ${safeToSpend >= 0 ? 'pos' : 'neg'}">${fmt$(safeToSpend)}</p>
      <p class="muted small">Income ${fmt$(income)} − recurring ${fmt$(recMo)} − goals ${fmt$(goalMo)} − planned ${fmt$(plannedTotal)}. What you can spend freely this month without breaking the plan.</p>
    </div>
    <div class="panel-card mt"><h3>Monthly plan by category</h3>
      <p class="muted small">"Spent" is your average per month from the uploaded data. Type a plan per category — <strong>Left to budget</strong> above counts down to $0.</p>
      <div class="tx-scroll"><table class="data"><thead><tr><th>Category</th><th style="text-align:right">Spent (avg/mo)</th><th style="text-align:right">Planned</th><th style="text-align:right">Remaining</th><th style="min-width:140px">Progress</th></tr></thead><tbody>
      ${cats.map((c) => {
        const spent = actuals[c] || 0, plan = planned[c], rem = plan - spent;
        const pct = plan > 0 ? Math.min(100, spent / plan * 100) : (spent > 0 ? 100 : 0);
        const barColor = plan > 0 && spent > plan ? '#ff6b6b' : (CAT_COLORS[c] || '#4f8cff');
        return `<tr>
          <td>${esc(c)}</td>
          <td style="text-align:right">${fmt$(spent)}</td>
          <td style="text-align:right"><input class="input small budin" data-cat="${esc(c)}" type="number" min="0" step="10" value="${plan || ''}" placeholder="0" style="max-width:110px;text-align:right"></td>
          <td style="text-align:right" class="${rem < 0 ? 'neg' : ''}">${plan ? fmt$(rem) : '<span class="muted">—</span>'}</td>
          <td><div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(0)}%;background:${barColor}"></div></div></td>
        </tr>`; }).join('')}
      </tbody></table></div>
    </div>`;
  document.querySelectorAll('.budin').forEach((inp) => inp.addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    if (!v || v <= 0) delete APP.profile.budgets[e.target.dataset.cat];
    else APP.profile.budgets[e.target.dataset.cat] = v;
    renderBudget();
  }));
  $('incomeInput').addEventListener('change', (e) => {
    const v = parseFloat(e.target.value);
    APP.profile.incomeMonthly = (v > 0) ? v : null;
    renderBudget();
  });
}
TAB_RENDERERS.budget = renderBudget;

/* ================= debts: snowball vs avalanche (Ramsey style) ================= */
function simulateDebts(debts, extra, cmp) {
  const order = debts.map((d) => ({ ...d })).sort(cmp);
  let month = 0, totalInterest = 0;
  const events = [], history = [{ month: 0, total: order.reduce((s, d) => s + d.balance, 0) }];
  while (order.some((d) => d.balance > 0.01) && month < 600) {
    month++;
    for (const d of order) if (d.balance > 0) { const i = d.balance * d.apr / 1200; d.balance += i; totalInterest += i; }
    const target = order.find((d) => d.balance > 0);
    let budget = order.reduce((s, d) => s + (d.balance > 0 ? Math.min(d.minimum, d.balance) : 0), 0) + extra;
    for (const d of order) {
      if (d.balance <= 0 || budget <= 0.005) continue;
      const pay = (d === target) ? Math.min(d.balance, budget) : Math.min(d.balance, d.minimum, budget);
      d.balance -= pay; budget -= pay;
      if (d.balance <= 0.01) { d.balance = 0; events.push({ name: d.name, month }); }
    }
    history.push({ month, total: order.reduce((s, d) => s + d.balance, 0) });
  }
  const done = !order.some((d) => d.balance > 0.01);
  return { months: month, totalInterest, events, history, done };
}
const snowballCmp = (a, b) => a.balance - b.balance;
const avalancheCmp = (a, b) => b.apr - a.apr || a.balance - b.balance;

function debtFreeDate(months) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + months, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function balanceChart(history, maxTotal) {
  const W = 560, H = 160, P = 8;
  const step = Math.max(1, Math.floor(history.length / 120));
  const pts = history.filter((_, i) => i % step === 0);
  const path = pts.map((h, i) => `${(P + i / (pts.length - 1) * (W - 2 * P)).toFixed(1)},${(H - P - (h.total / maxTotal) * (H - 2 * P)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="debtchart"><polyline points="${path}" fill="none" stroke="#ff6b6b" stroke-width="2.5"/>
    <text x="${P}" y="${H - 1}" class="trend-label">now</text><text x="${W - P}" y="${H - 1}" text-anchor="end" class="trend-label">debt-free</text></svg>`;
}

function renderDebts() {
  const P = APP.profile;
  const mode = P.debtMode || 'snowball';
  const extra = +P.debtExtra || 0;
  const debts = P.debts;
  const totalBal = debts.reduce((s, d) => s + d.balance, 0);
  const minSum = debts.reduce((s, d) => s + d.minimum, 0);

  let results = '';
  if (debts.length && totalBal > 0) {
    const cmp = mode === 'snowball' ? snowballCmp : avalancheCmp;
    const r = simulateDebts(debts, extra, cmp);
    const base = simulateDebts(debts, 0, cmp);
    const other = simulateDebts(debts, extra, mode === 'snowball' ? avalancheCmp : snowballCmp);
    const maxTotal = Math.max(r.history[0].total, 1);
    const evList = r.events.map((e) => `<tr><td>${esc(e.name)}</td><td>${debtFreeDate(e.month)}</td></tr>`).join('');
    results = `
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Debt-free by</div><div class="kpi-val">${r.done ? debtFreeDate(r.months) : 'never at this pace ⚠️'}</div><div class="muted small">${r.months} months</div></div>
      <div class="kpi"><div class="kpi-label">Total interest (${mode})</div><div class="kpi-val neg">${fmt$(r.totalInterest)}</div></div>
      <div class="kpi"><div class="kpi-label">Interest, minimums only</div><div class="kpi-val neg">${fmt$(base.totalInterest)}</div></div>
      <div class="kpi"><div class="kpi-label">${mode === 'snowball' ? 'Avalanche' : 'Snowball'} would cost</div><div class="kpi-val ${other.totalInterest <= r.totalInterest ? 'pos' : 'neg'}">${fmt$(other.totalInterest)}</div>
        <div class="muted small">${other.totalInterest <= r.totalInterest ? 'cheaper — consider switching' : 'pricier — your pick wins'}</div></div>
    </div>
    ${extra > 0 ? `<div class="finding"><div class="finding-icon">💡</div><div><h4>Extra $${extra}/mo saves you ${fmt$(base.totalInterest - r.totalInterest)} in interest</h4><p>versus paying minimums only — and gets you debt-free ${base.months - r.months} months sooner.</p></div></div>` : ''}
    <div class="panel-card mt"><h3>Total balance over time</h3>${balanceChart(r.history, maxTotal)}</div>
    <div class="panel-card mt"><h3>Payoff order (${mode === 'snowball' ? 'smallest balance first' : 'highest APR first'})</h3>
      <table class="data"><thead><tr><th>Debt</th><th>Paid off</th></tr></thead><tbody>${evList}</tbody></table></div>`;
  }

  $('panel-debts').innerHTML = `
    <div class="panel-card"><h3>Your debts</h3>
      <div class="debt-form">
        <input id="debtName" class="input" placeholder="Name (e.g. Chase card)">
        <input id="debtBal" class="input" type="number" min="0" step="10" placeholder="Balance $">
        <input id="debtApr" class="input" type="number" min="0" step="0.1" placeholder="APR %">
        <input id="debtMin" class="input" type="number" min="0" step="5" placeholder="Min $/mo">
        <button id="debtAdd" class="btn small">+ Add debt</button>
      </div>
      ${debts.length ? `<table class="data mt"><thead><tr><th>Debt</th><th style="text-align:right">Balance</th><th style="text-align:right">APR</th><th style="text-align:right">Minimum</th><th></th></tr></thead><tbody>
        ${debts.map((d, i) => `<tr><td>${esc(d.name)}</td><td style="text-align:right">${fmt$(d.balance)}</td><td style="text-align:right">${d.apr}%</td><td style="text-align:right">${fmt$(d.minimum)}</td><td><button class="btn ghost small debtdel" data-i="${i}">✕</button></td></tr>`).join('')}
        </tbody></table>
        <p class="muted small">Total: <strong>${fmt$(totalBal)}</strong> · minimums: ${fmt$(minSum)}/mo</p>` : '<p class="muted">No debts entered — nice. Add one above to build a payoff plan.</p>'}
    </div>
    ${debts.length ? `<div class="panel-card mt"><h3>Payoff plan</h3>
      <div class="debt-form">
        <label class="muted small">Extra per month: <input id="debtExtra" class="input small" type="number" min="0" step="25" value="${extra || ''}" placeholder="0" style="max-width:110px"></label>
        <div class="seg">
          <button class="btn small ${mode === 'snowball' ? '' : 'ghost'}" data-mode="snowball">⛄ Snowball <span class="muted small">smallest first</span></button>
          <button class="btn small ${mode === 'avalanche' ? '' : 'ghost'}" data-mode="avalanche">🏔️ Avalanche <span class="muted small">highest APR first</span></button>
        </div>
      </div>
      <p class="muted small">Snowball (Ramsey's Baby Step 2): minimums on everything, attack the smallest balance, roll each freed payment into the next. Avalanche: same, but highest APR first — mathematically cheapest.</p>
    </div>${results}` : ''}`;

  $('debtAdd').addEventListener('click', () => {
    const name = $('debtName').value.trim() || 'Debt ' + (debts.length + 1);
    const balance = parseFloat($('debtBal').value), apr = parseFloat($('debtApr').value) || 0, minimum = parseFloat($('debtMin').value) || 0;
    if (!(balance > 0)) { $('debtBal').focus(); return; }
    debts.push({ name, balance, apr, minimum });
    renderDebts();
  });
  document.querySelectorAll('.debtdel').forEach((b) => b.addEventListener('click', () => { debts.splice(+b.dataset.i, 1); renderDebts(); }));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { P.debtMode = b.dataset.mode; renderDebts(); }));
  const ex = $('debtExtra');
  if (ex) ex.addEventListener('change', () => { P.debtExtra = parseFloat(ex.value) || 0; renderDebts(); });
}
TAB_RENDERERS.debts = renderDebts;

/* ================= goals: savings targets + sinking funds (YNAB true expenses) ================= */
function renderGoals() {
  const P = APP.profile;
  const goals = P.goals;
  const totalNeed = goalsMonthly();

  $('panel-goals').innerHTML = `
    <div class="panel-card"><h3>Savings goals & sinking funds</h3>
      <p class="muted small">YNAB calls irregular bills "true expenses" — a $600 insurance bill due in 6 months is just a $100/mo goal. Add anything with a target date and the app computes the monthly set-aside.</p>
      <div class="debt-form">
        <input id="goalName" class="input" placeholder="Name (e.g. Emergency fund)">
        <input id="goalTarget" class="input" type="number" min="0" step="50" placeholder="Target $">
        <input id="goalSaved" class="input" type="number" min="0" step="50" placeholder="Saved so far $">
        <input id="goalDate" class="input" type="month" title="Target date">
        <button id="goalAdd" class="btn small">+ Add goal</button>
      </div>
      ${goals.length ? `
      <div class="kpis mt">
        <div class="kpi"><div class="kpi-label">Active goals</div><div class="kpi-val">${goals.length}</div></div>
        <div class="kpi"><div class="kpi-label">Need per month (total)</div><div class="kpi-val">${fmt$(totalNeed)}</div></div>
        <div class="kpi"><div class="kpi-label">Total saved</div><div class="kpi-val pos">${fmt$(goals.reduce((s, g) => s + (+g.saved || 0), 0))}</div></div>
      </div>
      <div class="goal-grid mt">
      ${goals.map((g, i) => {
        const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
        let perMo = null;
        if (g.deadline && g.target > g.saved) {
          const now = new Date(), dl = new Date(g.deadline + '-01');
          const months = Math.max(1, (dl.getFullYear() - now.getFullYear()) * 12 + (dl.getMonth() - now.getMonth()) + 1);
          perMo = (g.target - g.saved) / months;
        }
        return `<div class="goal-card">
          <div class="goal-head"><strong>${esc(g.name)}</strong><button class="btn ghost small goaldel" data-i="${i}">✕</button></div>
          <div class="muted small">${fmt$(g.saved)} of ${fmt$(g.target)}${g.deadline ? ' · by ' + new Date(g.deadline + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''}</div>
          <div class="bar-track mt"><div class="bar-fill" style="width:${pct.toFixed(0)}%;background:${pct >= 100 ? '#51cf66' : '#4f8cff'}"></div></div>
          <div class="muted small mt">${pct.toFixed(0)}%${perMo != null ? ` · needs <strong>${fmt$(perMo)}/mo</strong>` : ''}</div>
        </div>`; }).join('')}
      </div>` : '<p class="muted mt">No goals yet. Emergency fund, vacation, car insurance — anything with a number and a date.</p>'}
    </div>`;

  $('goalAdd').addEventListener('click', () => {
    const name = $('goalName').value.trim() || 'Goal ' + (goals.length + 1);
    const target = parseFloat($('goalTarget').value);
    if (!(target > 0)) { $('goalTarget').focus(); return; }
    goals.push({ name, target, saved: parseFloat($('goalSaved').value) || 0, deadline: $('goalDate').value || null });
    renderGoals();
  });
  document.querySelectorAll('.goaldel').forEach((b) => b.addEventListener('click', () => { goals.splice(+b.dataset.i, 1); renderGoals(); }));
}
TAB_RENDERERS.goals = renderGoals;

/* ================= health: score + guardrails + waste audit + margin finder ================= */
const DELIVERY_RE = /(doordash|uber.?eats|grubhub|postmates|seamless|instacart|gopuff|delivery)/i;
function healthInputs() {
  const P = APP.profile, list = withCats();
  const out = avgMonthlyOutflow(list);
  const actuals = budgetActuals();
  const income = monthlyIncome() || 1;
  return {
    income,
    housing: (P.housingMonthly != null && P.housingMonthly !== '') ? +P.housingMonthly : (actuals['Housing'] || 0),
    emergency: (P.emergencyFund != null && P.emergencyFund !== '') ? +P.emergencyFund : null,
    retirement: (P.retirementMonthly != null && P.retirementMonthly !== '') ? +P.retirementMonthly : null,
    debtPay: (P.debtPayMonthly != null && P.debtPayMonthly !== '') ? +P.debtPayMonthly : P.debts.reduce((s, d) => s + d.minimum, 0),
    balance: (P.balance != null && P.balance !== '') ? +P.balance : null,
    outflow: out, actuals,
  };
}
function scoreBuckets(h) {
  const spendRatio = h.outflow / h.income;
  const spending = spendRatio <= 0.7 ? 20 : spendRatio <= 0.8 ? 15 : spendRatio <= 0.9 ? 10 : spendRatio <= 1 ? 5 : 0;
  const debtRatio = h.debtPay / h.income;
  const debt = h.debtPay <= 0 ? 20 : debtRatio <= 0.1 ? 14 : debtRatio <= 0.2 ? 8 : 0;
  const retRatio = (h.retirement || 0) / h.income;
  const retirement = h.retirement == null ? null : (retRatio >= 0.15 ? 20 : retRatio >= 0.1 ? 14 : retRatio > 0 ? 8 : 0);
  const essentials = Math.max(1, h.outflow * 0.6);
  const emMonths = h.emergency == null ? null : h.emergency / essentials;
  const emergency = emMonths == null ? null : (emMonths >= 6 ? 20 : emMonths >= 3 ? 14 : emMonths >= 1 ? 8 : 0);
  const houseRatio = h.housing / h.income;
  const housing = h.housing <= 0 ? null : (houseRatio <= 0.25 ? 20 : houseRatio <= 0.3 ? 14 : houseRatio <= 0.35 ? 8 : 0);
  const scored = [spending, debt, retirement, emergency, housing].filter((v) => v != null);
  const total = scored.length ? Math.round(scored.reduce((s, v) => s + v, 0) / scored.length * 5) : 0;
  return { spending, debt, retirement, emergency, housing, total,
    weakest: [['Spending', spending], ['Debt', debt], ['Retirement', retirement], ['Emergency fund', emergency], ['Housing', housing]].filter(([, v]) => v != null).sort((a, b) => a[1] - b[1])[0] };
}

function renderHealth() {
  const P = APP.profile;
  const h = healthInputs();
  const sc = scoreBuckets(h);
  const wasteCats = [
    { name: 'Dining & coffee', amt: h.actuals['Dining & Coffee'] || 0 },
    { name: 'Food delivery', amt: withCats().filter((t) => t.amount < 0 && DELIVERY_RE.test(t.desc)).reduce((s, t) => s + -t.amount, 0) / monthsSpanned(withCats()) },
    { name: 'Subscriptions', amt: recurringMonthly() },
    { name: 'Shopping', amt: h.actuals['Shopping'] || 0 },
    { name: 'Fees & interest', amt: h.actuals['Fees & Interest'] || 0 },
  ].filter((w) => w.amt > 0.5);
  const wasteTotal = wasteCats.reduce((s, w) => s + w.amt, 0);

  const guards = [
    { name: 'Housing ≤ 30% of income', val: h.housing / h.income, pass: h.housing / h.income <= 0.3, fmt: (v) => (v * 100).toFixed(0) + '%' },
    { name: 'Transport ≤ 15%', val: (h.actuals['Transport'] || 0) / h.income, pass: (h.actuals['Transport'] || 0) / h.income <= 0.15, fmt: (v) => (v * 100).toFixed(0) + '%' },
    { name: 'Food (groceries + dining) ≤ 15%', val: ((h.actuals['Groceries'] || 0) + (h.actuals['Dining & Coffee'] || 0)) / h.income, pass: ((h.actuals['Groceries'] || 0) + (h.actuals['Dining & Coffee'] || 0)) / h.income <= 0.15, fmt: (v) => (v * 100).toFixed(0) + '%' },
    { name: 'Saving ≥ 20% of income', val: (h.income - h.outflow) / h.income, pass: (h.income - h.outflow) / h.income >= 0.2, fmt: (v) => (v * 100).toFixed(0) + '%' },
  ];
  const margins = [];
  const dining = h.actuals['Dining & Coffee'] || 0;
  if (dining > h.income * 0.1) margins.push({ label: `Trim dining to 10% of income`, amt: dining - h.income * 0.1 });
  const shop = h.actuals['Shopping'] || 0;
  if (shop > h.income * 0.1) margins.push({ label: `Cap shopping at 10% of income`, amt: shop - h.income * 0.1 });
  for (const s of detectRecurring(withCats())) if ((P.subMarks[s.key] || 'review') === 'review' && s.monthlyCost >= 5) margins.push({ label: `Review subscription: ${s.desc}`, amt: s.monthlyCost });
  margins.sort((a, b) => b.amt - a.amt);
  const marginTotal = margins.reduce((s, m) => s + m.amt, 0);
  const bufferDays = h.balance != null ? Math.floor(h.balance / Math.max(1, h.outflow / 30.44)) : null;

  const bucketRow = (label, v) => v == null
    ? `<div class="score-row"><span>${label}</span><span class="muted small">needs your input ↓</span></div>`
    : `<div class="score-row"><span>${label}</span><div class="bar-track" style="flex:1;max-width:220px"><div class="bar-fill" style="width:${v / 20 * 100}%;background:${v >= 14 ? '#51cf66' : v >= 8 ? '#ffd43b' : '#ff6b6b'}"></div></div><strong>${v}/20</strong></div>`;

  $('panel-health').innerHTML = `
    <div class="panel-card"><h3>Your numbers <span class="muted small">(auto-detected where possible — override anything)</span></h3>
      <div class="health-form">
        <label>Take-home $/mo <input id="hIncome" class="input small" type="number" min="0" step="50" value="${P.incomeMonthly ?? ''}" placeholder="${fmt0(monthlyIncome())}"></label>
        <label>Housing $/mo <input id="hHousing" class="input small" type="number" min="0" step="25" value="${P.housingMonthly ?? ''}" placeholder="${fmt0(h.actuals['Housing'] || 0)}"></label>
        <label>Emergency fund $ <input id="hEmergency" class="input small" type="number" min="0" step="100" value="${P.emergencyFund ?? ''}" placeholder="0"></label>
        <label>Retirement $/mo <input id="hRetire" class="input small" type="number" min="0" step="25" value="${P.retirementMonthly ?? ''}" placeholder="0"></label>
        <label>Debt payments $/mo <input id="hDebtPay" class="input small" type="number" min="0" step="25" value="${P.debtPayMonthly ?? ''}" placeholder="${fmt0(P.debts.reduce((s, d) => s + d.minimum, 0))}"></label>
        <label>Current balance $ <input id="hBalance" class="input small" type="number" min="0" step="50" value="${P.balance ?? ''}" placeholder="optional"></label>
      </div>
    </div>
    <div class="panel-card mt"><h3>🏆 Financial health score <span class="muted small">Hammer-style, 5 buckets</span></h3>
      <p class="lede-num ${sc.total >= 70 ? 'pos' : sc.total >= 45 ? '' : 'neg'}">${sc.total}<span class="muted">/100</span></p>
      ${bucketRow('Spending (outflow vs income)', sc.spending)}
      ${bucketRow('Debt load', sc.debt)}
      ${bucketRow('Retirement investing', sc.retirement)}
      ${bucketRow('Emergency fund', sc.emergency)}
      ${bucketRow('Housing cost', sc.housing)}
      ${sc.weakest ? `<p class="muted mt">Weakest link: <strong>${esc(sc.weakest[0])}</strong> — that's where the next dollar does the most work.</p>` : ''}
    </div>
    <div class="panel-card mt"><h3>🛡️ Guardrails <span class="muted small">the rules of thumb every audit uses</span></h3>
      ${guards.map((g) => `<div class="guard ${g.pass ? 'ok' : 'bad'}"><span class="guard-dot"></span><span>${g.name}</span><strong>${g.fmt(g.val)}</strong><span>${g.pass ? '✅' : '⚠️'}</span></div>`).join('')}
    </div>
    <div class="panel-card mt"><h3>🔥 Waste audit <span class="muted small">the Financial Audit treatment</span></h3>
      ${wasteCats.length ? wasteCats.map((w) => {
        const pct = w.amt / h.income * 100;
        return `<div class="score-row"><span>${w.name}</span><strong>${fmt$(w.amt)}/mo</strong><span class="muted small">${pct.toFixed(1)}% of income</span></div>`;
      }).join('') + `<p class="muted">Total lifestyle waste: <strong>${fmt$(wasteTotal)}/mo</strong> (${(wasteTotal / h.income * 100).toFixed(1)}% of income). Cutting it in half frees <strong class="pos">${fmt$(wasteTotal * 6)}/yr</strong>.</p>`
      : '<p class="muted">Nothing flagged — either impressively disciplined or the data is thin.</p>'}
    </div>
    ${bufferDays != null ? `<div class="panel-card mt"><h3>⏳ Buffer <span class="muted small">YNAB's "age of money" idea, simplified</span></h3>
      <p class="lede-num">${bufferDays} <span class="muted small">days</span></p>
      <p class="muted small">At your current burn rate (${fmt$(h.outflow / 30.44)}/day), your ${fmt$(h.balance)} balance covers <strong>${bufferDays} days</strong> of spending. 30+ is breathing room; 90+ is a real buffer.</p></div>` : ''}
    <div class="panel-card mt"><h3>🎯 Margin finder <span class="muted small">where the money actually is</span></h3>
      ${margins.length ? `<p class="muted">Ranked opportunities to free up cash:</p>
        ${margins.slice(0, 8).map((m, i) => `<div class="score-row"><span><strong>${i + 1}.</strong> ${esc(m.label)}</span><strong class="pos">+${fmt$(m.amt)}/mo</strong></div>`).join('')}
        <p class="mt"><strong>Total: ${fmt$(marginTotal)}/mo → ${fmt$(marginTotal * 12)}/yr</strong> if you capture all of it.</p>`
      : '<p class="muted">No big gaps vs the benchmarks — spending looks tight already.</p>'}
    </div>`;

  const bind = (id, key) => { $(id).addEventListener('change', (e) => { const v = parseFloat(e.target.value); P[key] = (v > 0 || v === 0) && e.target.value !== '' ? v : null; renderHealth(); }); };
  bind('#hIncome', 'incomeMonthly'); bind('#hHousing', 'housingMonthly'); bind('#hEmergency', 'emergencyFund');
  bind('#hRetire', 'retirementMonthly'); bind('#hDebtPay', 'debtPayMonthly'); bind('#hBalance', 'balance');
}
TAB_RENDERERS.health = renderHealth;

/* ================= profile export / import ================= */
function exportProfile() {
  const blob = new Blob([JSON.stringify({ app: 'statement-analyzer', version: 1, exported: new Date().toISOString(), profile: APP.profile }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'statement-analyzer-profile.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importProfile(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const data = JSON.parse(r.result);
      const p = data.profile || data;
      if (!p || typeof p !== 'object' || !('budgets' in p)) throw new Error('bad file');
      const fresh = blankProfile();
      APP.profile = Object.assign(fresh, p);
      msg($('profileMsg'), 'Profile loaded — budgets, debts, goals restored.', 'ok');
      switchTab('budget');
    } catch (e) { msg($('profileMsg'), 'That file is not a statement-analyzer profile.', 'err'); }
  };
  r.readAsText(file);
}

/* ================= boot/clear wrappers + toolbar wiring ================= */
function seedDemoProfile() {
  APP.profile = blankProfile();
  APP.profile.debts = [
    { name: 'Chase Sapphire', balance: 4200, apr: 24.99, minimum: 120 },
    { name: 'Auto loan', balance: 11800, apr: 7.2, minimum: 310 },
  ];
  APP.profile.debtMode = 'snowball'; APP.profile.debtExtra = 150;
  APP.profile.goals = [
    { name: 'Emergency fund', target: 5000, saved: 1200, deadline: null },
    { name: 'Car insurance (Dec)', target: 900, saved: 300, deadline: '2026-12' },
  ];
  APP.profile.budgets = { 'Groceries': 650, 'Dining & Coffee': 250, 'Transport': 220, 'Shopping': 300, 'Subscriptions': 80, 'Utilities': 260 };
}
const _boot2 = boot;
boot = function (txns, fileName, demo) {
  _boot2(txns, fileName, demo);
  if (demo) seedDemoProfile();
};
const _clear2 = clearSession;
clearSession = function () {
  _clear2();
  APP.profile = blankProfile();
};

document.addEventListener('DOMContentLoaded', () => {
  $('exportProfileBtn').addEventListener('click', exportProfile);
  $('importProfileBtn').addEventListener('click', () => $('profileInput').click());
  $('profileInput').addEventListener('change', (e) => { if (e.target.files[0]) importProfile(e.target.files[0]); e.target.value = ''; });
  const tb = document.querySelector('.toolbar-actions');
  const span = document.createElement('span');
  span.id = 'profileMsg'; span.className = 'msg';
  tb.appendChild(span);
});
