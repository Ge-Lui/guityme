"""Rebuild data.json from EcuasionTotalHrs.xlsx with corrected dates (Jan–Jun 2026 only)."""
import json
import sys
from datetime import date, datetime, time
from pathlib import Path

import pandas as pd

TARGET = 702
EXCEL = Path.home() / "Downloads" / "EcuasionTotalHrs.xlsx"
OUT = Path(__file__).resolve().parents[1] / "data.json"


def fmt_time(v):
    if pd.isna(v) or v is None or v == 0:
        return None
    if isinstance(v, time):
        return v.strftime("%H:%M")
    if hasattr(v, "hour") and not isinstance(v, date):
        return v.strftime("%H:%M")
    return None


def parse_excel_date(v):
    if pd.isna(v):
        return None
    if isinstance(v, str):
        for fmt in ("%m/%d/%Y", "%d/%m/%Y"):
            try:
                d = datetime.strptime(v.strip(), fmt).date()
                if d.year == 2026 and 1 <= d.month <= 6:
                    return d
            except ValueError:
                pass
        return None
    if isinstance(v, datetime):
        y, m, d = v.year, v.month, v.day
        if y == 2016 and m == 4:
            y = 2026
        if m > 6:
            m, d = d, m
        if y != 2026 or not (1 <= m <= 6):
            return None
        return date(y, m, d)
    return None


def calc_hours(am_in, am_out, pm_in, pm_out):
    def p(t):
        if not t:
            return None
        h, m = map(int, t.split(":"))
        return h + m / 60

    ai, ao, pi, po = p(am_in), p(am_out), p(pm_in), p(pm_out)
    if ai is None and ao is None and pi is not None and po is not None:
        return max(0, round(po - pi, 4))
    if pi is None and po is None and ai is not None and ao is not None:
        return max(0, round(ao - ai, 4))
    total = 0
    if ai is not None and ao is not None:
        total += ao - ai
    if pi is not None and po is not None:
        total += po - pi
    return max(0, round(total, 4))


def main():
    excel = Path(sys.argv[1]) if len(sys.argv) > 1 else EXCEL
    wb = pd.read_excel(excel, header=None)
    entries = []
    for i in range(2, 106):
        r = wb.iloc[i]
        dt = parse_excel_date(r[0])
        if not dt:
            continue
        am_in, am_out = fmt_time(r[1]), fmt_time(r[2])
        pm_in, pm_out = fmt_time(r[3]), fmt_time(r[4])
        if not any([am_in, am_out, pm_in, pm_out]):
            if pd.isna(r[5]) or float(r[5]) == 0:
                continue
        hrs = r[5]
        hours = float(hrs) if pd.notna(hrs) else calc_hours(am_in, am_out, pm_in, pm_out)
        entries.append(
            {
                "date": dt.isoformat(),
                "amIn": am_in,
                "amOut": am_out,
                "pmIn": pm_in,
                "pmOut": pm_out,
                "hours": round(hours, 4),
            }
        )

    entries.sort(key=lambda e: (e["date"], e.get("amIn") or ""))
    for i, e in enumerate(entries, 1):
        e["id"] = i
    total = round(sum(e["hours"] for e in entries), 2)
    out = {
        "owner": "Angelu Banogbanog",
        "entries": entries,
        "summary": {
            "targetHours": TARGET,
            "totalHours": total,
            "remaining": round(TARGET - total, 2),
            "remainingDays": round((TARGET - total) / 8, 2),
        },
    }
    OUT.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Wrote {len(entries)} entries, {total} hrs → {OUT}")


if __name__ == "__main__":
    main()
