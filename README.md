# Statement Analyzer

100% client-side bank statement analyzer. Drop a statement export from almost any bank (CSV, OFX/QFX, PDF, or Excel) and get spending breakdowns, trends, a cash-flow forecast, and plain-English money findings — computed entirely in your browser.

**Privacy:** your statement is read with the browser's FileReader API and parsed in memory. There is no server, no analytics on file contents, and no network request carrying your data. Nothing is kept in localStorage — close or refresh the tab and it's gone. Download the HTML report if you want to keep results.

Live at https://statement-analyzer.scribnet.io/

## Supported formats

- **CSV** — Bank of America (card + checking/savings), Chase, American Express, Citi, Capital One, Wells Fargo, Discover, Fidelity, USAA, U.S. Bank, TD, PNC, Truist; generic fallback for any CSV with recognizable date, description/payee, and amount (or separate debit/credit) columns
- **OFX / QFX / QBO** — parsed natively (the exact export most banks offer for Quicken/Money)
- **PDF statements** — text-layer extraction via pdf.js (scanned-image PDFs return an honest error)
- **Excel (.xlsx)** — via SheetJS

PDF/Excel parser libraries load lazily as code from a CDN on first use; statement data is always parsed locally in the tab.

If totals look inverted, use **Flip amount signs** in the toolbar.

## Budgeting toolkit

Modeled on the mechanics of paid apps (Rocket Money, EveryDollar, YNAB, Monarch, Simplifi, PocketGuard, Caleb Hammer's audit framework) — all computed client-side from your CSV plus numbers you type in:

- **Subscriptions** — recurring-charge detector (monthly/weekly/annual cadences, confidence tiers), price-increase alerts, predicted renewals, cancel/keep planner with annualized savings.
- **Budget** — zero-based worksheet (planned vs actual, left-to-budget) plus a safe-to-spend number.
- **Debts** — snowball vs avalanche payoff simulator with payoff dates, total interest, debt-free date.
- **Goals** — savings targets and sinking funds with required monthly set-aside.
- **Health** — 5-bucket financial score, guardrail checks, waste audit, buffer-days metric, ranked margin finder.
- **Cleanup** — rules engine (payee-contains + amount conditions), custom categories, transaction splits, a bulk review queue for uncategorized payees, and merchant-name cleanup.
- **Forecast** — cash-flow projection of detected recurring income/charges 30/60/90 days out, with low-point warnings, sustainable daily pace, and upcoming-events list.
- **Profile export/import (v2)** — budgets, debts, goals, rules, custom categories, and per-payee overrides download as a JSON file *you* keep; nothing is stored in the browser. v1 files still import.

## Developing

Static site — open `index.html` or serve the folder. No build step, no dependencies. Bump the `?v=` cache-buster on CSS/JS includes when redeploying fixes.
