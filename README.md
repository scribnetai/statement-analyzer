# Statement Analyzer

100% client-side bank statement analyzer. Drop a Bank of America CSV export and get spending breakdowns, trends, and plain-English money findings — computed entirely in your browser.

**Privacy:** your statement is read with the browser's FileReader API and parsed in memory. There is no server, no analytics on file contents, and no network request carrying your data. Nothing is kept in localStorage — close or refresh the tab and it's gone. Download the HTML report if you want to keep results.

Live at https://scribnetai.github.io/statement-analyzer/

## Supported formats

- Bank of America credit card CSV (`Posted Date, Reference Number, Payee, Address, Amount`)
- Bank of America checking/savings CSV (`Date, Description, Amount, Running Bal.`)
- Generic fallback: any CSV with recognizable date, description/payee, and amount columns

If totals look inverted, use **Flip amount signs** in the toolbar.

## Developing

Static site — open `index.html` or serve the folder. No build step, no dependencies. Bump the `?v=` cache-buster on CSS/JS includes when redeploying fixes.
