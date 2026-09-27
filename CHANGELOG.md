# Changelog

## 2026-09-26
- Initial release: 100% client-side bank statement analyzer. Drop a Bank of America CSV (credit card or checking/savings) and get KPIs, spending-by-category dashboard, monthly trends, top payees, ~14 plain-English money findings, and a downloadable standalone HTML report.
- Privacy-first by design: transactions live only in the tab's memory — no localStorage, no autosave, no uploads. Clear-session wipes everything; refresh does too.
- Auto-detecting CSV parser: handles BoA card (`Posted Date, Reference Number, Payee, Address, Amount`) and checking (`Date, Description, Amount, Running Bal.`) formats, plus a generic date/description/amount fallback. "Flip amount signs" toggle for banks with inverted sign conventions.
- Keyword categorizer with per-payee overrides (remembered for the session), recurring-charge detection with annualized cost, duplicate-charge and unusual-spike finders, fees surfaced separately.
- Demo-data mode: realistic synthetic transactions generated in-browser, clearly labeled.
