# Total Hours — Angelu Banogbanog

Personal web app for tracking AM/PM time-in and time-out, with the same hour calculation as your `EcuasionTotalHrs.xlsx` spreadsheet.

## Features

- Dashboard: total hours, progress toward **702** hr target, remaining hours and days (÷ 8)
- Timesheet table matching your Excel layout (Date, AM, PM, No. of Hrs)
- Add, edit, and delete entries with live hour calculation
- Data saved in your browser (`localStorage`)
- Export / import JSON backups

## Run locally

From this folder:

```bash
python -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080)

On first visit, the app loads your Excel data from `data.json`. After that, changes are stored in the browser.

## Rebuild data from Excel

If you update the spreadsheet, run:

```bash
python scripts/rebuild-data.py
```

Dates are normalized to **January–June 2026** only (fixes Excel’s mis-typed years and Sep–Dec day/month swaps).

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell |
| `styles.css` | Layout and theme |
| `app.js` | Logic and UI |
| `data.json` | Initial data exported from your spreadsheet |
| `scripts/rebuild-data.py` | Re-export `data.json` from Excel |
