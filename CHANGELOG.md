# Changelog

## 2026-10-17
- **Rules + merchant cleanup engine (new Cleanup tab):** reusable categorization rules (payee-contains match with optional amount above/below conditions, run in order after manual overrides and before built-in keywords), custom categories (usable in every picker, the Budget tab, and exports), transaction splits (✂ Split in Transactions — divide one charge across categories with sum validation), a bulk review queue that clears everything still in "Other" payee-by-payee, and merchant-name cleanup (processor prefixes like SQ */TST*/PAYPAL *, store numbers, and city/state/ZIP tails stripped for display and grouping; raw strings untouched).
- **Real-world imports:** OFX/QFX/QBO files now parse natively; PDF statements import via pdf.js (text-layer extraction with running-balance capture, honest error for scanned-image PDFs); Excel .xlsx imports via SheetJS. Bank detection extended beyond BoA/Chase to American Express, Citi, Capital One, Wells Fargo, Discover, Fidelity, USAA, U.S. Bank, TD, PNC, Truist, and credit-union debit/credit-column CSVs. Running-balance columns are now captured and used. Import libraries load lazily as code only — statement data is still parsed entirely in the tab.
- **Cash-flow forecast (new Forecast tab):** projects detected recurring income and charges 30/60/90 days past the last transaction, with an optional historical everyday-spending pace layered in; shows projected end balance, low point + date with thin-buffer/negative warnings, maximum sustainable daily pace, a balance chart, and the upcoming recurring-events list. Starting balance comes from your input, else the statement's last running balance.
- **Profile v2:** exports now also include per-payee category overrides, rules, and custom categories (v1 files still import).
- Also fixed a pre-existing live bug found in testing: Profile import called an undefined `msg()` helper — the import applied but threw an error and never showed its confirmation. The helper now exists.
- Cache-busters: app.js v8, app2.js v6, new app3.js v1.

## 2026-09-28 — Canonical subdomain links
- Replaced legacy `scribnetai.github.io/<repo>/` links with canonical
  `https://<repo>.scribnet.io/` URLs (the old URLs 301-redirect, but docs and
  on-page links should point at the real address).

## 2026-09-28
- Added Umami website analytics (cookieless, no consent banner): pageview tracking plus custom events for ad-slot impression/click reporting.

## 2026-09-28
- Added a floating Feedback button (bottom-right) that opens a dialog to send feedback via email — topic chips, optional name, and message, addressed to the site owner with the app name in the subject.

## 2026-09-28
- TLS certificate provisioned for the `statement-analyzer.scribnet.io` custom domain (GitHub's stuck DNS check was reset 2026-09-28); HTTPS is now enforced on the site. App-switcher menu links switched from legacy `scribnetai.github.io` URLs to direct `https://<app>.scribnet.io` URLs for all 10 apps (footer/launcher links updated likewise). This entry also covers the net-zero CNAME delete/re-add commits from the DNS-check reset, which carried no changelog entries. Touched: index.html, js/app-switcher.js.


## 2026-09-27
- Added top-left app-switcher dropdown on the brand mark: one-click jumps to every app in the suite (full index, this page marked).
- Multi-file upload + Chase support: drop several CSVs at once (BoA card/checking, Chase credit card — `Transaction Date, Post Date, Description, Category, Type, Amount`). Each transaction is tagged with its bank, exact duplicates from overlapping downloads are removed, and card payments appearing in both a checking file and a card file are auto-paired as Transfers so totals aren't double-counted. Paired transfers are excluded from all spending metrics (dashboard totals, donut, monthly trend, top payees, findings, subscriptions, budget actuals, health score) — they're money movement, not spending. The Findings tab reports everything paired or removed.
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
