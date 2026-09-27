# Statement Analyzer

100% client-side bank statement analyzer. Drop a Bank of America CSV export and get spending breakdowns, trends, and plain-English money findings — computed entirely in your browser.

**Privacy:** your statement is read with the browser's FileReader API and parsed in memory. There is no server, no analytics on file contents, and no network request carrying your data. Nothing is kept in localStorage — close or refresh the tab and it's gone. Download the HTML report if you want to keep results.

Live at https://scribnetai.github.io/statement-analyzer/

## Supported formats

- Bank of America credit card CSV (`Posted Date, Reference Number, Payee, Address, Amount`)
- Bank of America checking/savings CSV (`Date, Description, Amount, Running Bal.`)
- Generic fallback: any CSV with recognizable date, description/payee, and amount columns

If totals look inverted, use **Flip amount signs** in the toolbar.

## Budgeting toolkit

Modeled on the mechanics of paid apps (Rocket Money, EveryDollar, YNAB, Monarch, Simplifi, PocketGuard, Caleb Hammer's audit framework) — all computed client-side from your CSV plus numbers you type in:

- **Subscriptions** — recurring-charge detector (monthly/weekly/annual cadences, confidence tiers), price-increase alerts, predicted renewals, cancel/keep planner with annualized savings.
- **Budget** — zero-based worksheet (planned vs actual, left-to-budget) plus a safe-to-spend number.
- **Debts** — snowball vs avalanche payoff simulator with payoff dates, total interest, debt-free date.
- **Goals** — savings targets and sinking funds with required monthly set-aside.
- **Health** — 5-bucket financial score, guardrail checks, waste audit, buffer-days metric, ranked margin finder.
- **Profile export/import** — budgets, debts, and goals download as a JSON file *you* keep; nothing is stored in the browser.

## Developing

Static site — open `index.html` or serve the folder. No build step, no dependencies. Bump the `?v=` cache-buster on CSS/JS includes when redeploying fixes.
