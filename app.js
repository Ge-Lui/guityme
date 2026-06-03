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
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      state = JSON.parse(saved);
      state.targetHours = state.targetHours ?? TARGET_HOURS;
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
