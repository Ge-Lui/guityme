const STORAGE_KEY = "angelu-total-hrs-v4";
const PAGE_SIZE_KEY = "angelu-total-hrs-page-size";
const TARGET_HOURS = 702;
const HOURS_PER_DAY = 8;
const DEFAULT_PAGE_SIZE = 15;

let currentPage = 1;

/** @typedef {{ id: number, date: string, amIn: string|null, amOut: string|null, pmIn: string|null, pmOut: string|null, hours: number|null }} Entry */

/** @type {{ owner: string, targetHours: number, entries: Entry[] }} */
let state = { owner: "Angelu Banogbanog", targetHours: TARGET_HOURS, entries: [] };

let editingId = null;

const $ = (sel) => document.querySelector(sel);

const tableBody = $("#tableBody");
const entryModal = $("#entryModal");
const entryForm = $("#entryForm");

function parseTimeToHours(t) {
  if (!t || t === "0" || t === "00:00") return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h + (m || 0) / 60;
}

/**
 * Mirrors Excel: ((C-B)+(E-D))*24 with time-as-fraction logic → hours in JS.
 * Handles PM-only and AM-in-to-PM-out edge cases from the sheet.
 */
export function calculateHours(amIn, amOut, pmIn, pmOut) {
  const ai = parseTimeToHours(amIn);
  const ao = parseTimeToHours(amOut);
  const pi = parseTimeToHours(pmIn);
  const po = parseTimeToHours(pmOut);

  if (ai == null && ao == null && pi != null && po != null) {
    return Math.max(0, po - pi);
  }
  if (pi == null && po == null && ai != null && ao != null) {
    return Math.max(0, ao - ai);
  }
  if (ai != null && po != null && ao == null && pi == null) {
    return Math.max(0, po - ai);
  }

  let total = 0;
  if (ai != null && ao != null) total += ao - ai;
  if (pi != null && po != null) total += po - pi;
  return Math.max(0, Math.round(total * 10000) / 10000);
}

function formatDisplayDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatHours(n) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(2);
}

function nextId() {
  const ids = state.entries.map((e) => e.id);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

function monthKey(date) {
  return date.slice(0, 7);
}

function isValidEntryDate(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const ym = monthKey(dateStr);
  return isValidMonth(ym);
}

function sanitizeEntries(entries) {
  return entries.filter((e) => isValidEntryDate(e.date));
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

const VALID_MONTH_RANGE = { min: "2026-01", max: "2026-06" };

function isValidMonth(ym) {
  return ym >= VALID_MONTH_RANGE.min && ym <= VALID_MONTH_RANGE.max;
}

function buildMonthFilter() {
  const select = $("#monthFilter");
  const kept = select.value;
  const months = [
    ...new Set(
      state.entries.map((e) => monthKey(e.date)).filter(isValidMonth)
    ),
  ].sort((a, b) => b.localeCompare(a));

  select.replaceChildren();
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All months";
  select.append(allOpt);

  for (const ym of months) {
    const opt = document.createElement("option");
    opt.value = ym;
    const count = state.entries.filter((e) => monthKey(e.date) === ym).length;
    opt.textContent = `${formatMonthLabel(ym)} (${count})`;
    select.append(opt);
  }

  if (kept && months.includes(kept)) select.value = kept;
}

function getFilteredEntries() {
  const q = ($("#search").value || "").trim().toLowerCase();
  const month = $("#monthFilter").value;
  let list = [...state.entries];

  if (month) {
    list = list.filter((e) => monthKey(e.date) === month);
  }
  if (q) {
    list = list.filter(
      (e) =>
        e.date.includes(q) ||
        formatDisplayDate(e.date).toLowerCase().includes(q)
    );
  }
  const sort = $("#sort").value;
  list.sort((a, b) => {
    switch (sort) {
      case "date-asc":
        return a.date.localeCompare(b.date);
      case "hours-desc":
        return (b.hours ?? 0) - (a.hours ?? 0);
      case "hours-asc":
        return (a.hours ?? 0) - (b.hours ?? 0);
      default:
        return b.date.localeCompare(a.date);
    }
  });
  return list;
}

function getPageSize() {
  const n = parseInt($("#pageSize").value, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PAGE_SIZE;
}

function resetPage() {
  currentPage = 1;
}

function paginateList(list) {
  const size = getPageSize();
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / size) || 1);
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  const startIdx = (currentPage - 1) * size;
  return {
    rows: list.slice(startIdx, startIdx + size),
    total,
    totalPages,
    start: total ? startIdx + 1 : 0,
    end: Math.min(startIdx + size, total),
  };
}

function renderPagination(meta) {
  const nav = $("#pagination");
  if (meta.total === 0) {
    nav.hidden = true;
    return;
  }
  nav.hidden = false;

  $("#pageRange").textContent = `Showing ${meta.start}–${meta.end} of ${meta.total}`;
  $("#pageStatus").textContent = `Page ${currentPage} of ${meta.totalPages}`;

  $("#pageFirst").disabled = currentPage <= 1;
  $("#pagePrev").disabled = currentPage <= 1;
  $("#pageNext").disabled = currentPage >= meta.totalPages;
  $("#pageLast").disabled = currentPage >= meta.totalPages;
}

function computeSummary() {
  const total = state.entries.reduce((s, e) => s + (e.hours ?? 0), 0);
  const rounded = Math.round(total * 100) / 100;
  const remaining = Math.round((state.targetHours - rounded) * 100) / 100;
  return {
    totalHours: rounded,
    remaining: Math.max(0, remaining),
    remainingDays: Math.round((remaining / HOURS_PER_DAY) * 100) / 100,
    count: state.entries.length,
    pct: Math.min(100, (rounded / state.targetHours) * 100),
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderSummary() {
  const s = computeSummary();
  $("#totalHours").textContent = formatHours(s.totalHours);
  $("#remainingHrs").textContent = formatHours(s.remaining);
  $("#remainingDays").textContent = s.remainingDays.toFixed(2);
  $("#entryCount").textContent = String(s.count);
  $("#footerTotal").textContent = formatHours(s.totalHours);
  $("#pctDone").textContent = s.pct.toFixed(1);
  $("#targetLabel").textContent = String(state.targetHours);
  $("#progressBar").style.width = `${s.pct}%`;
}

function renderTable() {
  const q = ($("#search").value || "").trim();
  const list = getFilteredEntries();
  const pageMeta = paginateList(list);
  tableBody.replaceChildren();

  for (const e of pageMeta.rows) {
    const tr = document.createElement("tr");
    if ((e.hours ?? 0) === 0) tr.dataset.zero = "true";

    const cell = (text, cls = "") => {
      const td = document.createElement("td");
      if (cls) td.className = cls;
      td.textContent = text ?? "—";
      return td;
    };

    tr.append(
      cell(formatDisplayDate(e.date)),
      cell(e.amIn, "mono"),
      cell(e.amOut, "mono"),
      cell(e.pmIn, "mono"),
      cell(e.pmOut, "mono"),
      (() => {
        const td = document.createElement("td");
        td.className = "mono col-hrs";
        td.textContent = formatHours(e.hours ?? 0);
        return td;
      })(),
      (() => {
        const td = document.createElement("td");
        td.className = "col-actions";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "row-edit";
        btn.title = "Edit";
        btn.textContent = "✎";
        btn.addEventListener("click", () => openModal(e.id));
        td.append(btn);
        return td;
      })()
    );
    tableBody.append(tr);
  }

  const month = $("#monthFilter").value;
  const filteredTotal = list.reduce((s, e) => s + (e.hours ?? 0), 0);
  const rounded = Math.round(filteredTotal * 100) / 100;

  if (month) {
    $("#footerLabel").textContent = `${formatMonthLabel(month)} total`;
    $("#footerMeta").textContent = `${list.length} ${list.length === 1 ? "day" : "days"}`;
    $("#footerTotal").textContent = formatHours(rounded);
  } else {
    $("#footerLabel").textContent = "Total";
    $("#footerMeta").textContent =
      q || list.length !== state.entries.length
        ? `${list.length} of ${state.entries.length} days shown`
        : "";
    const s = computeSummary();
    $("#footerTotal").textContent = formatHours(s.totalHours);
  }

  $("#emptyState").hidden = list.length > 0;
  renderPagination(pageMeta);
  renderSummary();
}

function goToPage(page) {
  const list = getFilteredEntries();
  const totalPages = Math.max(1, Math.ceil(list.length / getPageSize()) || 1);
  currentPage = Math.min(Math.max(1, page), totalPages);
  renderTable();
}

function openModal(id = null) {
  editingId = id;
  const form = entryForm;
  $("#modalTitle").textContent = id ? "Edit entry" : "Log work day";
  $("#btnDelete").hidden = !id;

  if (id) {
    const e = state.entries.find((x) => x.id === id);
    if (!e) return;
    form.date.value = e.date;
    form.amIn.value = e.amIn || "";
    form.amOut.value = e.amOut || "";
    form.pmIn.value = e.pmIn || "";
    form.pmOut.value = e.pmOut || "";
  } else {
    form.reset();
    form.date.value = new Date().toISOString().slice(0, 10);
  }
  updatePreview();
  entryModal.showModal();
}

function closeModal() {
  entryModal.close();
  editingId = null;
}

function updatePreview() {
  const fd = new FormData(entryForm);
  const hrs = calculateHours(
    fd.get("amIn") || null,
    fd.get("amOut") || null,
    fd.get("pmIn") || null,
    fd.get("pmOut") || null
  );
  $("#previewHrs").textContent = formatHours(hrs);
}

function saveEntry(ev) {
  ev.preventDefault();
  const fd = new FormData(entryForm);
  const date = fd.get("date");
  if (!isValidEntryDate(String(date))) {
    alert("Date must be between January and June 2026.");
    return;
  }
  const amIn = fd.get("amIn") || null;
  const amOut = fd.get("amOut") || null;
  const pmIn = fd.get("pmIn") || null;
  const pmOut = fd.get("pmOut") || null;
  const hours = calculateHours(amIn, amOut, pmIn, pmOut);

  const payload = {
    date: String(date),
    amIn: amIn || null,
    amOut: amOut || null,
    pmIn: pmIn || null,
    pmOut: pmOut || null,
    hours,
  };

  if (editingId) {
    const idx = state.entries.findIndex((e) => e.id === editingId);
    if (idx >= 0) {
      state.entries[idx] = { ...state.entries[idx], ...payload };
    }
  } else {
    const dup = state.entries.findIndex((e) => e.date === payload.date);
    if (dup >= 0) {
      state.entries[dup] = { ...state.entries[dup], ...payload };
    } else {
      state.entries.push({ id: nextId(), ...payload });
    }
  }

  persist();
  buildMonthFilter();
  closeModal();
  renderTable();
}

function deleteEntry() {
  if (!editingId) return;
  if (!confirm("Delete this entry?")) return;
  state.entries = state.entries.filter((e) => e.id !== editingId);
  persist();
  buildMonthFilter();
  closeModal();
  renderTable();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `total-hrs-angelu-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportExcel() {
  const list = getFilteredEntries();
  if (list.length === 0) {
    alert("No entries to export.");
    return;
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Timesheet Report");

    // Enable gridlines
    worksheet.views = [{ showGridLines: true }];

     worksheet.pageSetup = {
      orientation: "portrait",
      paperSize: 5, // US Legal size (8.5 in x 14 in)
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 999, // Let it break naturally vertically
      margins: {
        left: 0.5,
        right: 0.5,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3,
      },
      printTitlesRow: "8:9", // Repeat shift headers on every page
    };

    // Column widths adjusted to fit the wider US Legal size paper
    worksheet.getColumn(1).width = 26; // Date
    worksheet.getColumn(2).width = 15; // AM In
    worksheet.getColumn(3).width = 15; // AM Out
    worksheet.getColumn(4).width = 15; // PM In
    worksheet.getColumn(5).width = 15; // PM Out
    worksheet.getColumn(6).width = 15; // Hours

    // Brand Palette
    const brandNavy = "2B5597";      // Main headers
    const steelBlue = "4169A9";      // PM Shift header
    const lightBlue = "3D6BAD";      // Subheaders
    const darkNavy = "1A3A6B";       // Title & Employee Name
    const fontMuted = "8FA3C1";      // Metadata labels
    const textDark = "2D3748";       // Standard time text
    const placeholderColor = "C4BEBC";
    
    // Status metrics colors
    const amberColor = "E8A020";
    const limeGreen = "7AB82A";
    const brandGreen = "3A6B1A";     // Month separator text
    const monthBg = "F0FBE6";        // Month separator bg
    const monthBorder = "C8E6A0";    // Month separator border
    
    const bgGray = "F8FAFC";
    const borderGray = "E2E8F0";     // Standard border
    const dataBorderColor = "EEF2F7"; // Data row borders

    const borderStyleThin = {
      top: { style: "thin", color: { argb: borderGray } },
      left: { style: "thin", color: { argb: borderGray } },
      bottom: { style: "thin", color: { argb: borderGray } },
      right: { style: "thin", color: { argb: borderGray } },
    };

    // 1. Header Banner Row (Row 1)
    worksheet.mergeCells("A1:F1");
    const bannerCell = worksheet.getCell("A1");
    bannerCell.value = "TIMESHEET & HOURS SUMMARY";
    bannerCell.font = { name: "Segoe UI", size: 14, bold: true, color: { argb: "FFFFFF" } };
    bannerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: brandNavy } };
    bannerCell.alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getRow(1).height = 36;

    // 2. Employee Info Row (Row 3)
    worksheet.getRow(3).height = 24;
    
    worksheet.mergeCells("A3:C3");
    const nameCell = worksheet.getCell("A3");
    nameCell.value = {
      richText: [
        { font: { name: "Segoe UI", size: 10, color: { argb: fontMuted } }, text: "Employee Name:  " },
        { font: { name: "Segoe UI", size: 10, bold: true, color: { argb: darkNavy } }, text: state.owner || "Angelu Banogbanog" }
      ]
    };
    nameCell.alignment = { vertical: "middle", horizontal: "left" };

    worksheet.mergeCells("D3:F3");
    const exportCell = worksheet.getCell("D3");
    const formattedDate = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    exportCell.value = {
      richText: [
        { font: { name: "Segoe UI", size: 10, color: { argb: fontMuted } }, text: "Exported On:  " },
        { font: { name: "Segoe UI", size: 10, color: { argb: textDark } }, text: formattedDate }
      ]
    };
    exportCell.alignment = { vertical: "middle", horizontal: "right" };

    // Set background fill and bottom border for the Employee Info row (Row 3)
    for (let c = 1; c <= 6; c++) {
      const cell = worksheet.getCell(3, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgGray } };
      cell.border = {
        bottom: { style: "thin", color: { argb: borderGray } }
      };
    }

    // 3. Summary Metrics Headers (Row 5)
    const overviewHeaders = ["Target Hours", "Total Logged", "Remaining Hours", "Est. Days Left", "Completion Rate"];
    overviewHeaders.forEach((val, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = worksheet.getCell(`${colLetter}5`);
      cell.value = val.toUpperCase();
      cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: fontMuted } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgGray } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = borderStyleThin;
    });
    worksheet.getRow(5).height = 38;

    // Table Headers (Row 8 & 9)
    worksheet.mergeCells("A8:A9");
    worksheet.getCell("A8").value = "Date";
    worksheet.getCell("A8").alignment = { vertical: "middle", horizontal: "center" };
    
    worksheet.mergeCells("B8:C8");
    worksheet.getCell("B8").value = "AM Shift";
    worksheet.getCell("B8").alignment = { vertical: "middle", horizontal: "center" };

    worksheet.mergeCells("D8:E8");
    worksheet.getCell("D8").value = "PM Shift";
    worksheet.getCell("D8").alignment = { vertical: "middle", horizontal: "center" };

    worksheet.mergeCells("F8:F9");
    worksheet.getCell("F8").value = "Hours";
    worksheet.getCell("F8").alignment = { vertical: "middle", horizontal: "center" };

    worksheet.getCell("B9").value = "Time In";
    worksheet.getCell("B9").alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getCell("C9").value = "Time Out";
    worksheet.getCell("C9").alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getCell("D9").value = "Time In";
    worksheet.getCell("D9").alignment = { vertical: "middle", horizontal: "center" };
    worksheet.getCell("E9").value = "Time Out";
    worksheet.getCell("E9").alignment = { vertical: "middle", horizontal: "center" };

    // Format Headers (Row 8 & 9)
    const headerCols = {
      "A8": brandNavy, "A9": brandNavy,
      "B8": brandNavy,
      "C8": brandNavy,
      "D8": steelBlue,
      "E8": steelBlue,
      "F8": brandNavy, "F9": brandNavy,
      "B9": lightBlue, "C9": lightBlue, "D9": lightBlue, "E9": lightBlue
    };

    Object.keys(headerCols).forEach(cellRef => {
      const cell = worksheet.getCell(cellRef);
      const isSub = cellRef.endsWith("9") && cellRef !== "A9" && cellRef !== "F9";
      cell.font = {
        name: "Segoe UI",
        size: isSub ? 10 : 11,
        bold: !isSub,
        color: { argb: "FFFFFF" }
      };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: headerCols[cellRef] } };
      cell.border = borderStyleThin;
    });

    worksheet.getRow(8).height = 24;
    worksheet.getRow(9).height = 20;

    let currentRow = 10;
    const monthsInfo = [
      { key: "2026-01", name: "January 2026" },
      { key: "2026-02", name: "February 2026" },
      { key: "2026-03", name: "March 2026" },
      { key: "2026-04", name: "April 2026" },
      { key: "2026-05", name: "May 2026" },
      { key: "2026-06", name: "June 2026" },
    ];

    const borderStyleDataThin = {
      top: { style: "thin", color: { argb: dataBorderColor } },
      left: { style: "thin", color: { argb: dataBorderColor } },
      bottom: { style: "thin", color: { argb: dataBorderColor } },
      right: { style: "thin", color: { argb: dataBorderColor } },
    };

    monthsInfo.forEach((mInfo) => {
      const monthEntries = list
        .filter((e) => monthKey(e.date) === mInfo.key && e.hours > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (monthEntries.length === 0) return;

      // Spacing Row (No borders, empty)
      if (currentRow > 10) {
        const blankRow = worksheet.getRow(currentRow);
        for (let c = 1; c <= 6; c++) {
          blankRow.getCell(c).value = "";
          blankRow.getCell(c).border = {};
          blankRow.getCell(c).fill = {};
        }
        blankRow.height = 18;
        currentRow++;
      }

      // Month Section Separator Row
      worksheet.mergeCells(`A${currentRow}:F${currentRow}`);
      const mHeaderCell = worksheet.getCell(`A${currentRow}`);
      mHeaderCell.value = mInfo.name.toUpperCase();
      mHeaderCell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: brandGreen } };
      mHeaderCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: monthBg } };
      mHeaderCell.alignment = { vertical: "middle", horizontal: "center" };
      
      const monthRowBorder = {
        top: { style: "thin", color: { argb: monthBorder } },
        bottom: { style: "thin", color: { argb: monthBorder } },
        left: { style: "thin", color: { argb: monthBorder } },
        right: { style: "thin", color: { argb: monthBorder } }
      };

      for (let c = 1; c <= 6; c++) {
        worksheet.getCell(currentRow, c).border = monthRowBorder;
      }
      worksheet.getRow(currentRow).height = 26;
      currentRow++;

      // Populate Worked Entries
      monthEntries.forEach((entry, i) => {
        const d = new Date(entry.date + "T12:00:00");
        const dateLabel = d.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });

        const r = worksheet.getRow(currentRow);
        
        // Date Col
        r.getCell(1).value = dateLabel;
        r.getCell(1).font = { name: "Segoe UI", size: 11, color: { argb: "4A5568" } };
        r.getCell(1).alignment = { vertical: "middle", horizontal: "left" };

        // Shift times
        const formatTimeVal = (val, cellObj) => {
          if (!val || val === "—") {
            cellObj.value = "—";
            cellObj.font = { name: "Segoe UI", size: 11, color: { argb: placeholderColor } };
          } else {
            cellObj.value = val;
            cellObj.font = { name: "Segoe UI", size: 11, color: { argb: textDark } };
          }
          cellObj.alignment = { vertical: "middle", horizontal: "center" };
        };

        formatTimeVal(entry.amIn, r.getCell(2));
        formatTimeVal(entry.amOut, r.getCell(3));
        formatTimeVal(entry.pmIn, r.getCell(4));
        formatTimeVal(entry.pmOut, r.getCell(5));

        // Hours Col
        r.getCell(6).value = entry.hours != null ? Number(entry.hours) : 0;
        r.getCell(6).font = { name: "Segoe UI", size: 11, bold: true, color: { argb: brandNavy } };
        r.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
        r.getCell(6).numFmt = "0.00";

        // Zebra striping
        const rowBg = i % 2 === 0 ? "FFFFFF" : bgGray;
        for (let c = 1; c <= 6; c++) {
          const cell = r.getCell(c);
          cell.border = borderStyleDataThin;
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowBg } };
        }
        r.height = 22;
        currentRow++;
      });
    });

    // Total Row
    const totalRowIdx = currentRow;
    const totalRow = worksheet.getRow(totalRowIdx);
    worksheet.mergeCells(`A${totalRowIdx}:E${totalRowIdx}`);
    totalRow.getCell(1).value = "TOTAL WORKED HOURS (JAN - JUN)";
    totalRow.getCell(1).font = { name: "Segoe UI", size: 10, bold: true, color: { argb: darkNavy } };
    totalRow.getCell(1).alignment = { vertical: "middle", horizontal: "right" };

    totalRow.getCell(6).value = { formula: `SUM(F11:F${totalRowIdx - 1})` };
    totalRow.getCell(6).font = { name: "Segoe UI", size: 11, bold: true, color: { argb: brandNavy } };
    totalRow.getCell(6).alignment = { vertical: "middle", horizontal: "right" };
    totalRow.getCell(6).numFmt = "0.00";

    for (let c = 1; c <= 6; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgGray } };
      cell.border = borderStyleThin;
    }
    totalRow.height = 28;

    // Fill Overall Summary Cards (Row 6)
    worksheet.getCell("A6").value = state.targetHours || 702;
    worksheet.getCell("B6").value = { formula: `F${totalRowIdx}` };
    worksheet.getCell("C6").value = { formula: `MAX(0, A6-B6)` };
    worksheet.getCell("D6").value = { formula: `C6/8` };
    worksheet.getCell("E6").value = { formula: `B6/A6` };

    // Status-based color coding for metric values in Row 6
    const valueFmts = [
      { color: darkNavy, numFmt: "0.00" },      // Target Hours
      { color: brandNavy, numFmt: "0.00" },     // Total Logged
      { color: amberColor, numFmt: "0.00" },     // Remaining Hours
      { color: amberColor, numFmt: "0.00" },     // Est. Days Left
      { color: limeGreen, numFmt: "0.0%" }      // Completion Rate
    ];

    valueFmts.forEach((fmt, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = worksheet.getCell(`${colLetter}6`);
      cell.font = { name: "Segoe UI", size: 11, bold: true, color: { argb: fmt.color } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = borderStyleThin;
      cell.numFmt = fmt.numFmt;
    });
    worksheet.getRow(6).height = 28;

    // --- APPLY 2PX SOLID NAVY OUTER BORDER AROUND THE TABLE (Rows 8 to totalRowIdx) ---
    for (let r = 8; r <= totalRowIdx; r++) {
      for (let c = 1; c <= 6; c++) {
        const cell = worksheet.getCell(r, c);
        const cellBorder = { ...cell.border };
        
        // Top border
        if (r === 8) {
          cellBorder.top = { style: "medium", color: { argb: brandNavy } };
        }
        // Left border
        if (c === 1) {
          cellBorder.left = { style: "medium", color: { argb: brandNavy } };
        }
        // Bottom border
        if (r === totalRowIdx) {
          cellBorder.bottom = { style: "medium", color: { argb: brandNavy } };
        }
        // Right border
        if (c === 6) {
          cellBorder.right = { style: "medium", color: { argb: brandNavy } };
        }
        cell.border = cellBorder;
      }
    }

    // --- Generate & Download ---
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    
    const filterText = $("#monthFilter").value ? `-${$("#monthFilter").value}` : "";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `timesheet-summary${filterText}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);

  } catch (err) {
    console.error("Excel Export Error:", err);
    alert("Export failed: " + err.message);
  }
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.entries)) throw new Error("Invalid format");
      state = {
        owner: data.owner || state.owner,
        targetHours: data.targetHours ?? TARGET_HOURS,
        entries: sanitizeEntries(
          data.entries.map((e, i) => ({
            id: e.id ?? i + 1,
            date: e.date,
            amIn: e.amIn ?? null,
            amOut: e.amOut ?? null,
            pmIn: e.pmIn ?? null,
            pmOut: e.pmOut ?? null,
            hours: e.hours ?? calculateHours(e.amIn, e.amOut, e.pmIn, e.pmOut),
          }))
        ),
      };
      persist();
      buildMonthFilter();
      renderTable();
    } catch {
      alert("Could not import file. Use a valid export JSON.");
    }
  };
  reader.readAsText(file);
}

async function loadInitial() {
  const SYNC_KEY = "angelu-total-hrs-sync-v7";
  const hasSynced = localStorage.getItem(SYNC_KEY);
  
  if (!hasSynced) {
    try {
      const res = await fetch("./data.json");
      if (res.ok) {
        const data = await res.json();
        state = {
          owner: data.owner || "Angelu Banogbanog",
          targetHours: data.summary?.targetHours ?? TARGET_HOURS,
          entries: sanitizeEntries(
            data.entries.map((e) => ({
              ...e,
              hours: e.hours ?? calculateHours(e.amIn, e.amOut, e.pmIn, e.pmOut),
            }))
          ),
        };
        persist();
        localStorage.setItem(SYNC_KEY, "true");
        localStorage.setItem("angelu-total-hrs-migrated-v6", "true");
        return;
      }
    } catch (e) {
      console.warn("Failed to force sync clean database:", e);
    }
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = JSON.parse(saved);
      state.targetHours = state.targetHours ?? TARGET_HOURS;
      
      const MIGRATION_KEY = "angelu-total-hrs-migrated-v6";
      const hasMigrated = localStorage.getItem(MIGRATION_KEY);
      
      if (!hasMigrated) {
        let migrated = false;
        state.entries = state.entries.map((entry) => {
          // ID 45: April 2, 4.0 hours -> Feb 4
          if (entry.id === 45 && entry.date === "2026-04-02" && entry.hours === 4.0) {
            entry.date = "2026-02-04";
            migrated = true;
          }
          // ID 47: April 3, 6.8 hours -> March 4
          if (entry.id === 47 && entry.date === "2026-04-03" && entry.hours === 6.8) {
            entry.date = "2026-03-04";
            migrated = true;
          }
          // ID 67: May 2, 7.0 hours -> Feb 5
          if (entry.id === 67 && entry.date === "2026-05-02" && entry.hours === 7.0) {
            entry.date = "2026-02-05";
            migrated = true;
          }
          // ID 69: May 3, 8.0 hours -> March 5
          if (entry.id === 69 && entry.date === "2026-05-03" && entry.hours === 8.0) {
            entry.date = "2026-03-05";
            migrated = true;
          }
          // ID 83: June 2, 7.8333 hours -> Feb 6
          if (entry.id === 83 && entry.date === "2026-06-02" && entry.hours === 7.8333) {
            entry.date = "2026-02-06";
            migrated = true;
          }
          // ID 85 (or duplicate June 3): June 3, 9.0/8.5 hours -> March 6
          if (entry.date === "2026-06-03" && (entry.hours === 9.0 || entry.hours === 8.5)) {
            entry.date = "2026-03-06";
            migrated = true;
          }
          return entry;
        });

        if (migrated) {
          state.entries.sort((a, b) => {
            const dateComp = a.date.localeCompare(b.date);
            if (dateComp !== 0) return dateComp;
            return (a.amIn || "").localeCompare(b.amIn || "");
          });
          state.entries.forEach((e, idx) => {
            e.id = idx + 1;
          });
          persist();
        }
        localStorage.setItem(MIGRATION_KEY, "true");
      }

      state.entries = sanitizeEntries(state.entries);
      return;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  try {
    const res = await fetch("./data.json");
    if (res.ok) {
      const data = await res.json();
      state = {
        owner: data.owner || "Angelu Banogbanog",
        targetHours: data.summary?.targetHours ?? TARGET_HOURS,
        entries: sanitizeEntries(
          data.entries.map((e) => ({
            ...e,
            hours: e.hours ?? calculateHours(e.amIn, e.amOut, e.pmIn, e.pmOut),
          }))
        ),
      };
      persist();
    }
  } catch {
    console.warn("Load data.json via a local server, or import a backup.");
  }
}

function bindEvents() {
  $("#btnAdd").addEventListener("click", () => openModal());
  $("#btnExport").addEventListener("click", exportData);
  $("#btnExportExcel").addEventListener("click", exportExcel);
  $("#btnImport").addEventListener("change", (ev) => {
    const file = ev.target.files?.[0];
    if (file) importData(file);
    ev.target.value = "";
  });
  $("#search").addEventListener("input", () => {
    resetPage();
    renderTable();
  });
  $("#monthFilter").addEventListener("change", () => {
    resetPage();
    renderTable();
  });
  $("#sort").addEventListener("change", () => {
    resetPage();
    renderTable();
  });
  $("#pageSize").addEventListener("change", () => {
    localStorage.setItem(PAGE_SIZE_KEY, $("#pageSize").value);
    resetPage();
    renderTable();
  });
  $("#pageFirst").addEventListener("click", () => goToPage(1));
  $("#pagePrev").addEventListener("click", () => goToPage(currentPage - 1));
  $("#pageNext").addEventListener("click", () => goToPage(currentPage + 1));
  $("#pageLast").addEventListener("click", () => {
    const list = getFilteredEntries();
    const totalPages = Math.max(1, Math.ceil(list.length / getPageSize()) || 1);
    goToPage(totalPages);
  });
  $("#modalClose").addEventListener("click", closeModal);
  $("#btnCancel").addEventListener("click", closeModal);
  $("#btnDelete").addEventListener("click", deleteEntry);
  entryForm.addEventListener("input", updatePreview);
  entryForm.addEventListener("submit", saveEntry);
}

await loadInitial();
const savedPageSize = localStorage.getItem(PAGE_SIZE_KEY);
if (savedPageSize) $("#pageSize").value = savedPageSize;
buildMonthFilter();
bindEvents();
renderTable();
