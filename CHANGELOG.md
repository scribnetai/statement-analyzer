# Changelog

## 2026-09-27
- Added a global date-range picker in the toolbar (All time / Last month / Last 3 months / Last 6 months / Year to date / Custom). Every tab filters to the selected range; the header shows the active range and how many transactions are in view. Resets on new file load and on Clear session.
- QA fixes: bumped JS cache-busters (app.js?v=3, app2.js?v=2) after a stale-cache incident left the 5 new tabs blank; added the missing `fmt0` helper (Health tab); fixed `bind()` passing `#`-prefixed ids to `getElementById`; aligned category names with the app's category list.
- Added budgeting toolkit modeled on paid apps (Rocket Money, EveryDollar, YNAB, Monarch, Simplifi, PocketGuard, Caleb Hammer): new **Subscriptions** tab (cadence-based recurring detector with confidence tiers, price-increase alerts, predicted renewals, cancel/keep planner with annualized savings), **Budget** tab (zero-based worksheet, left-to-budget, safe-to-spend number), **Debts** tab (snowball vs avalanche payoff simulator with payoff dates, total interest, balance chart), **Goals** tab (savings targets + sinking funds with required monthly set-aside), **Health** tab (5-bucket financial score, guardrail checks, Hammer-style waste audit, buffer days, ranked margin finder).
- Added portable **Profile export/import** (⬇/⬆ in toolbar): budgets, debts, goals, and subscription decisions download as a JSON file you keep — nothing is stored in the browser.
- Demo mode now seeds a sample profile (2 debts, 2 goals, budgets) so the new tabs are explorable.
- FAQ: added profile-storage and no-bank-login entries.

## 2026-09-26
- Initial release: 100% client-side bank statement analyzer. Drop a Bank of America CSV (credit card or checking/savings) and get KPIs, spending-by-category dashboard, monthly trends, top payees, ~14 plain-English money findings, and a downloadable standalone HTML report.
- Privacy-first by design: transactions live only in the tab's memory — no localStorage, no autosave, no uploads. Clear-session wipes everything; refresh does too.
- Auto-detecting CSV parser: handles BoA card (`Posted Date, Reference Number, Payee, Address, Amount`) and checking (`Date, Description, Amount, Running Bal.`) formats, plus a generic date/description/amount fallback. "Flip amount signs" toggle for banks with inverted sign conventions.
- Keyword categorizer with per-payee overrides (remembered for the session), recurring-charge detection with annualized cost, duplicate-charge and unusual-spike finders, fees surfaced separately.
- Demo-data mode: realistic synthetic transactions generated in-browser, clearly labeled.
