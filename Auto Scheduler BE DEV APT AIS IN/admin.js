/* ═══════════════════════════════════════════════════════════
   PJM Admin Dashboard — admin.js
═══════════════════════════════════════════════════════════ */
"use strict";

/* ── TABLE NAME CONFIG ───────────────────────────────────── */
const PROJECTS_TABLE = "booking";      // ← change to your actual table name
const LIMITS_TABLE   = "weekly_limits";

/* ── State ───────────────────────────────────────────────── */
let allLimits       = [];
let filteredLimits  = [];
let editingLimitId  = null;
let deletingLimitId = null;
let sortLimitsKey   = "week";
let sortLimitsDir   = "desc";
let usageByWeek     = {};

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
(function waitAndInit() {
    if (!window.db || typeof window.db.from !== "function") {
        setTimeout(waitAndInit, 150);
        return;
    }
    initAdmin();
})();

async function initAdmin() {
    setCurrentDate();
    setDefaultWeek();
    await loadUsageData();
    await loadLimits();
    loadAnalytics();
    loadEquipment();
    console.log("✅ Admin dashboard initialised");
}

/* ─────────────────────────────────────────────────────────
   DATE UTILITIES
───────────────────────────────────────────────────────── */
function toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseDateLocal(str) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d);
}

function getMondayOf(date) {
    const d   = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getSundayOf(monday) {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    return d;
}

function formatDateShort(date) {
    return date.toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric"
    });
}

function getWeekStatus(weekStartStr) {
    const today  = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = parseDateLocal(weekStartStr);
    const sunday = getSundayOf(monday);
    if (today >= monday && today <= sunday) return "current";
    if (today > sunday) return "past";
    return "future";
}

function setCurrentDate() {
    const el = document.getElementById("current-date");
    if (el) el.textContent = new Date().toLocaleDateString("en-US", {
        weekday: "short", year: "numeric",
        month: "long",    day: "numeric"
    });
}

function setDefaultWeek() {
    const monday = getMondayOf(new Date());
    const input  = document.getElementById("f-week-start");
    if (input) {
        input.value = toYMD(monday);
        onWeekStartChange();
    }
}

/* ─────────────────────────────────────────────────────────
   LOAD USAGE DATA from projects table
───────────────────────────────────────────────────────── */
async function loadUsageData() {
    try {
        /* probe first */
        const probe = await window.db
            .from(PROJECTS_TABLE)
            .select("id")
            .limit(1);

        if (probe.error) {
            console.warn(
                `⚠️ Table "${PROJECTS_TABLE}" not found:`,
                probe.error.message,
                "\n👉 Edit PROJECTS_TABLE at top of admin.js"
            );
            usageByWeek = {};
            showTableNameHint(probe.error.message);
            return;
        }

        const cols = await detectColumns();

        const { data, error } = await window.db
            .from(PROJECTS_TABLE)
            .select(cols.select);

        if (error) {
            console.warn("loadUsageData fetch error:", error.message);
            usageByWeek = {};
            return;
        }

        usageByWeek = {};
        (data || []).forEach(function (row) {
            const rawDate =
                row[cols.startCol] ||
                row.start_datetime ||
                row.start_date     ||
                row.start          ||
                row.created_at     ||
                null;

            if (!rawDate) return;

            const d = new Date(rawDate);
            if (isNaN(d.getTime())) return;

            const monday = getMondayOf(d);
            const key    = toYMD(monday);

            if (!usageByWeek[key]) {
                usageByWeek[key] = { projects: 0, quantity: 0, lots: 0 };
            }

            usageByWeek[key].projects += 1;
            usageByWeek[key].quantity +=
                Number(row[cols.qtyCol] || row.quantity || 0);
            usageByWeek[key].lots     +=
                Number(row[cols.lotCol] || row.no_lot   || 1);
        });

        console.log("✅ Usage loaded — weeks tracked:",
                    Object.keys(usageByWeek).length);

    } catch (err) {
        console.error("loadUsageData unexpected error:", err.message);
        usageByWeek = {};
    }
}

/* ─────────────────────────────────────────────────────────
   DETECT COLUMNS
───────────────────────────────────────────────────────── */
async function detectColumns() {
    const defaults = {
        select  : "*",
        startCol: "start_datetime",
        qtyCol  : "quantity",
        lotCol  : "no_lot"
    };

    try {
        const test = await window.db
            .from(PROJECTS_TABLE)
            .select("*")
            .limit(1);

        if (!test.error) return defaults;

        return {
            select  : "*",
            startCol: "start_datetime",
            qtyCol  : "quantity",
            lotCol  : "no_lot"
        };
    } catch (e) {
        return defaults;
    }
}

/* ─────────────────────────────────────────────────────────
   TABLE NAME HINT BANNER
───────────────────────────────────────────────────────── */
function showTableNameHint(errMsg) {
    if (document.getElementById("table-name-hint")) return;

    const hint = document.createElement("div");
    hint.id    = "table-name-hint";
    hint.style.cssText = `
        position:fixed; top:10px; left:50%;
        transform:translateX(-50%);
        background:#7c2d12; border:1px solid #ef4444;
        border-radius:10px; padding:14px 20px;
        z-index:99999; max-width:560px; width:90%;
        font-size:12px; color:#fca5a5;
        box-shadow:0 8px 32px rgba(0,0,0,.5);
        line-height:1.6;
    `;
    hint.innerHTML = `
        <div style="font-weight:700;font-size:14px;
                    color:#f87171;margin-bottom:8px">
            ⚠️ Projects Table Not Found
        </div>
        <div style="margin-bottom:8px">
            <code style="background:rgba(0,0,0,.3);
                         padding:2px 6px;border-radius:4px">
                ${errMsg}
            </code>
        </div>
        <div>Open <strong>admin.js</strong> and change line 6:</div>
        <pre style="background:rgba(0,0,0,.3);padding:8px;
                    border-radius:6px;margin:8px 0;overflow-x:auto">
const PROJECTS_TABLE = "booking";</pre>
        <div style="color:#94a3b8;font-size:11px">
            Common names: projects, build_plans, pjm_projects
        </div>
        <button onclick="this.parentElement.remove()"
                style="margin-top:10px;padding:4px 12px;
                       background:#ef4444;border:none;
                       border-radius:4px;color:#fff;
                       cursor:pointer;font-size:11px">
            Dismiss
        </button>
    `;
    document.body.appendChild(hint);
}

/* ─────────────────────────────────────────────────────────
   LOAD LIMITS from weekly_limits table
───────────────────────────────────────────────────────── */
async function loadLimits() {
    try {
        const { data, error } = await window.db
            .from(LIMITS_TABLE)
            .select("*")
            .order("week_start", { ascending: false });

        if (error) throw error;

        allLimits      = data || [];
        filteredLimits = [...allLimits];

        renderLimitsTable();
        renderRecentChanges();
        renderOverviewCards();
        updateHeaderStats();

    } catch (err) {
        console.error("loadLimits error:", err.message);
        showToast("Failed to load limits: " + err.message, "error");
    }
}

/* ─────────────────────────────────────────────────────────
   FORM — week selector change
───────────────────────────────────────────────────────── */
function onWeekStartChange() {
    const val = document.getElementById("f-week-start").value;
    clearError("err-week-start");

    if (!val) {
        document.getElementById("week-range-display").textContent =
            "— select a Monday —";
        return;
    }

    const selected = parseDateLocal(val);
    const monday   = getMondayOf(selected);
    const sunday   = getSundayOf(monday);

    /* snap to Monday */
    if (toYMD(monday) !== val) {
        document.getElementById("f-week-start").value = toYMD(monday);
    }

    document.getElementById("week-range-display").textContent =
        formatDateShort(monday) + " — " + formatDateShort(sunday);

    /* pre-fill if limit already exists */
    const existing = allLimits.find(function (l) {
        return l.week_start === toYMD(monday);
    });
    if (existing) {
        document.getElementById("f-max-projects").value =
            existing.max_projects || "";
        document.getElementById("f-max-quantity").value =
            existing.max_quantity || "";
        document.getElementById("f-max-lots").value =
            existing.max_lots || "";
        document.getElementById("f-limit-notes").value =
            existing.notes || "";
        showToast("Existing limit loaded — you are editing it", "info");
    }
}

function onApplyToChange() { /* visual only */ }

/* ─────────────────────────────────────────────────────────
   SAVE WEEKLY LIMIT
───────────────────────────────────────────────────────── */
async function saveWeeklyLimit() {
    clearAllErrors();

    const weekStartRaw = document.getElementById("f-week-start").value;
    const maxProjects  = parseInt(
        document.getElementById("f-max-projects").value);
    const maxQuantity  = parseInt(
        document.getElementById("f-max-quantity").value);
    const maxLots      = parseInt(
        document.getElementById("f-max-lots").value);
    const notes        = document.getElementById("f-limit-notes")
                            .value.trim();
    const applyTo      = document.querySelector(
                            'input[name="apply-to"]:checked').value;

    /* ── Validation ── */
    let valid = true;
    if (!weekStartRaw) {
        showError("err-week-start", "Please select a week");
        valid = false;
    }
    if (!maxProjects || maxProjects < 1) {
        showError("err-max-projects", "Enter a valid number ≥ 1");
        valid = false;
    }
    if (!maxQuantity || maxQuantity < 1) {
        showError("err-max-quantity", "Enter a valid number ≥ 1");
        valid = false;
    }
    if (!maxLots || maxLots < 1) {
        showError("err-max-lots", "Enter a valid number ≥ 1");
        valid = false;
    }
    if (!valid) return;

    const monday    = getMondayOf(parseDateLocal(weekStartRaw));
    const weekStart = toYMD(monday);

    const btn = document.getElementById("save-limit-btn");
    btn.disabled    = true;
    btn.textContent = "⏳ Saving…";

    try {
        if (applyTo === "single") {
            await upsertLimit(weekStart, maxProjects,
                              maxQuantity, maxLots, notes, false);
            showToast(
                `✅ Limit saved for week of ${formatDateShort(monday)}`,
                "success"
            );
        } else {
            /* apply to this week + all future weeks already in DB */
            await upsertLimit(weekStart, maxProjects,
                              maxQuantity, maxLots, notes, true);

            const futureWeeks = allLimits.filter(function (l) {
                return l.week_start >= weekStart;
            });

            for (const row of futureWeeks) {
                if (row.week_start === weekStart) continue;
                await upsertLimit(row.week_start, maxProjects,
                                  maxQuantity, maxLots, notes, false);
            }
            showToast("✅ Limits applied to this week & all future weeks",
                      "success");
        }

        await loadLimits();
        clearLimitForm();

    } catch (err) {
        console.error("saveWeeklyLimit error:", err.message);
        showToast("❌ Save failed: " + err.message, "error");
    } finally {
        btn.disabled    = false;
        btn.textContent = "💾 Save Limits";
    }
}

/* ─────────────────────────────────────────────────────────
   UPSERT ONE LIMIT ROW
───────────────────────────────────────────────────────── */
async function upsertLimit(weekStart, maxProjects,
                           maxQuantity, maxLots, notes, isForwardRule) {
    const monday  = parseDateLocal(weekStart);
    const sunday  = getSundayOf(monday);
    const weekEnd = toYMD(sunday);
    const name = window.currentUser?.name
                  ?? window.currentUser?.email
                  ?? window.currentUser?.id
                  ?? null;

    const record = {
        week_start      : weekStart,
        week_end        : weekEnd,
        max_projects    : maxProjects,
        max_quantity    : maxQuantity,
        max_lots        : maxLots,
        notes           : notes || null,
        created_by      : name,
        is_forward_rule : isForwardRule ? true : false,
        updated_at      : new Date().toISOString()
    };

    console.log("⬆️  upsertLimit →", record);

    const { error } = await window.db
        .from(LIMITS_TABLE)
        .upsert(record, { onConflict: "week_start" });

    if (error) throw error;
}

/* ─────────────────────────────────────────────────────────
   CLEAR FORM
───────────────────────────────────────────────────────── */
function clearLimitForm() {
    document.getElementById("limit-form").reset();
    clearAllErrors();
    setDefaultWeek();
}

/* ─────────────────────────────────────────────────────────
   OVERVIEW CARDS
───────────────────────────────────────────────────────── */
function renderOverviewCards() {
    const container = document.getElementById("overview-cards");
    if (!container) return;

    const today  = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = getMondayOf(today);
    const key    = toYMD(monday);

    const limit = allLimits.find(function (l) {
        return l.week_start === key;
    });
    const usage = usageByWeek[key] ||
                  { projects: 0, quantity: 0, lots: 0 };

    const cards = [
        {
            icon  : "📋",
            label : "Projects This Week",
            value : usage.projects,
            limit : limit?.max_projects ?? null,
            accent: "var(--accent)"
        },
        {
            icon  : "📦",
            label : "Quantity This Week",
            value : usage.quantity,
            limit : limit?.max_quantity ?? null,
            accent: "var(--accent2)"
        },
        {
            icon  : "📚",
            label : "Lots This Week",
            value : usage.lots,
            limit : limit?.max_lots ?? null,
            accent: "var(--success)"
        }
    ];

    container.innerHTML = cards.map(function (c) {
        const pct  = c.limit
            ? Math.min((c.value / c.limit) * 100, 100) : 0;
        const over = c.limit && c.value > c.limit;
        const fillClass = over ? " over"
                        : pct >= 80 ? " warn" : "";

        return `
        <div class="overview-card"
             style="--card-accent:${c.accent}">
            <span class="overview-card-icon">${c.icon}</span>
            <div class="overview-card-label">${c.label}</div>
            <div class="overview-card-value"
                 style="color:${over
                     ? "var(--danger)" : c.accent}">
                ${c.value.toLocaleString()}
            </div>
            <div class="overview-card-limit">
                ${c.limit
                    ? `Limit: ${c.limit.toLocaleString()}
                       &nbsp;|&nbsp;
                       ${over
                         ? `<span style="color:var(--danger);
                                        font-weight:700">
                                ⚠ Over limit
                            </span>`
                         : `<span style="color:var(--success)">
                                ${Math.round(pct)}% used
                            </span>`
                       }`
                    : `<span style="color:var(--text-muted)">
                           No limit set
                       </span>`
                }
            </div>
            ${c.limit ? `
            <div class="progress-bar-wrap">
                <div class="progress-bar-fill${fillClass}"
                     style="width:${pct}%">
                </div>
            </div>` : ""}
        </div>`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   RECENT CHANGES TABLE (last 10)
───────────────────────────────────────────────────────── */
function renderRecentChanges() {
    const tbody = document.getElementById("recent-changes-tbody");
    const empty = document.getElementById("recent-empty");
    if (!tbody) return;

    const recent = [...allLimits]
        .sort(function (a, b) {
            return new Date(b.updated_at || b.created_at) -
                   new Date(a.updated_at || a.created_at);
        })
        .slice(0, 10);

    if (!recent.length) {
        tbody.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
    }
    if (empty) empty.classList.add("hidden");

    tbody.innerHTML = recent.map(function (l) {
        const status  = getWeekStatus(l.week_start);
        const monday  = parseDateLocal(l.week_start);
        const sunday  = getSundayOf(monday);
        const setDate = l.updated_at
            ? new Date(l.updated_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric"
              })
            : "—";

        return `
        <tr>
            <td>
                <span class="week-badge ${status}">
                    ${status === "current" ? "🟢" :
                      status === "past"    ? "⬜" : "🔵"}
                    ${formatDateShort(monday)}
                    – ${formatDateShort(sunday)}
                </span>
            </td>
            <td><strong>${(l.max_projects || 0).toLocaleString()}</strong></td>
            <td><strong>${(l.max_quantity || 0).toLocaleString()}</strong></td>
            <td><strong>${(l.max_lots     || 0).toLocaleString()}</strong></td>
            <td style="color:var(--text-muted)">${l.created_by || "—"}</td>
            <td style="color:var(--text-muted)">${setDate}</td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit"
                            title="Edit"
                            data-id="${l.id}"
                            onclick="openEditModal(this.dataset.id)">
                        ✏️
                    </button>
                    <button class="action-btn delete"
                            title="Delete"
                            data-id="${l.id}"
                            onclick="openDeleteModal(this.dataset.id)">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   LIMITS TABLE
───────────────────────────────────────────────────────── */
function renderLimitsTable() {
    const tbody = document.getElementById("limits-tbody");
    const empty = document.getElementById("limits-empty");
    if (!tbody) return;

    if (!filteredLimits.length) {
        tbody.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
    }
    if (empty) empty.classList.add("hidden");

    tbody.innerHTML = filteredLimits.map(function (l, i) {
        const status = getWeekStatus(l.week_start);
        const monday = parseDateLocal(l.week_start);
        const sunday = getSundayOf(monday);
        const usage  = usageByWeek[l.week_start] ||
                       { projects: 0, quantity: 0, lots: 0 };

        const pctP = l.max_projects
            ? (usage.projects / l.max_projects) * 100 : 0;
        const pctQ = l.max_quantity
            ? (usage.quantity / l.max_quantity) * 100 : 0;
        const pctL = l.max_lots
            ? (usage.lots / l.max_lots) * 100 : 0;
        const worst = Math.max(pctP, pctQ, pctL);
        const barClass = worst >= 100 ? " over"
                       : worst >= 80  ? " warn" : "";

        return `
        <tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td>
                <span class="week-badge ${status}">
                    ${status === "current" ? "🟢" :
                      status === "past"    ? "⬜" : "🔵"}
                    ${formatDateShort(monday)}
                </span>
            </td>
            <td style="color:var(--text-muted)">
                ${formatDateShort(sunday)}
            </td>
            <td><strong>
                ${(l.max_projects || 0).toLocaleString()}
            </strong></td>
            <td><strong>
                ${(l.max_quantity || 0).toLocaleString()}
            </strong></td>
            <td><strong>
                ${(l.max_lots || 0).toLocaleString()}
            </strong></td>
            <td>
                <div class="usage-bar-wrap">
                    <div class="usage-bar-bg">
                        <div class="usage-bar-fill${barClass}"
                             style="width:${
                                 Math.min(worst, 100).toFixed(1)
                             }%">
                        </div>
                    </div>
                    <span class="usage-bar-pct">
                        ${Math.round(worst)}%
                    </span>
                </div>
            </td>
            <td style="color:var(--text-muted);font-size:11px;
                       max-width:160px;overflow:hidden;
                       text-overflow:ellipsis;white-space:nowrap"
                title="${l.notes || ""}">
                ${l.notes || "—"}
            </td>
            <td>
                <div class="action-btns">
                    <button class="action-btn edit"
                            title="Edit"
                            data-id="${l.id}"
                            onclick="openEditModal(this.dataset.id)">
                        ✏️
                    </button>
                    <button class="action-btn delete"
                            title="Delete"
                            data-id="${l.id}"
                            onclick="openDeleteModal(this.dataset.id)">
                        🗑️
                    </button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   FILTER / SORT LIMITS
───────────────────────────────────────────────────────── */
function filterLimits() {
    const q = (document.getElementById("limit-search")?.value || "")
              .toLowerCase();
    const status = document.getElementById("filter-limit-status")
                   ?.value || "";

    filteredLimits = allLimits.filter(function (l) {
        const monday = parseDateLocal(l.week_start);
        const sunday = getSundayOf(monday);
        const text   = [
            formatDateShort(monday),
            formatDateShort(sunday),
            l.notes || ""
        ].join(" ").toLowerCase();

        const matchQ = !q      || text.includes(q);
        const matchS = !status || getWeekStatus(l.week_start) === status;
        return matchQ && matchS;
    });

    sortLimitsData();
    renderLimitsTable();
}

function sortLimits(key) {
    if (sortLimitsKey === key) {
        sortLimitsDir = sortLimitsDir === "asc" ? "desc" : "asc";
    } else {
        sortLimitsKey = key;
        sortLimitsDir = "desc";
    }
    sortLimitsData();
    renderLimitsTable();
}

function sortLimitsData() {
    const dir = sortLimitsDir === "asc" ? 1 : -1;
    filteredLimits.sort(function (a, b) {
        switch (sortLimitsKey) {
            case "week":
                return dir * a.week_start.localeCompare(b.week_start);
            case "projects":
                return dir * ((a.max_projects || 0) -
                              (b.max_projects || 0));
            case "quantity":
                return dir * ((a.max_quantity || 0) -
                              (b.max_quantity || 0));
            case "lots":
                return dir * ((a.max_lots || 0) -
                              (b.max_lots || 0));
            default:
                return 0;
        }
    });
}

/* ─────────────────────────────────────────────────────────
   ANALYTICS
───────────────────────────────────────────────────────── */
async function loadAnalytics() {
    await loadUsageData();

    const rangeWeeks = parseInt(
        document.getElementById("analytics-range")?.value || "8"
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weeks = [];
    for (let i = rangeWeeks - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i * 7);
        weeks.push(toYMD(getMondayOf(d)));
    }

    const uniqueWeeks = [...new Set(weeks)];

    renderChart("chart-projects", uniqueWeeks,
                "projects", "max_projects");
    renderChart("chart-quantity", uniqueWeeks,
                "quantity", "max_quantity");
    renderChart("chart-lots",     uniqueWeeks,
                "lots",     "max_lots");

    const hasData = uniqueWeeks.some(function (wk) {
        return (usageByWeek[wk]?.projects || 0) > 0;
    });

    const empty = document.getElementById("analytics-empty");
    const grid  = document.getElementById("analytics-grid");
    if (empty) empty.classList.toggle("hidden",  hasData);
    if (grid)  grid.style.display = hasData ? "grid" : "none";
}

function renderChart(containerId, weeks, usageKey, limitKey) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let maxVal = 1;
    weeks.forEach(function (wk) {
        const u = (usageByWeek[wk] || {})[usageKey] || 0;
        const limitRow = allLimits.find(function (x) {
            return x.week_start === wk;
        });
        const l = limitRow ? (limitRow[limitKey] || 0) : 0;
        maxVal = Math.max(maxVal, u, l);
    });

    container.innerHTML = weeks.map(function (wk) {
        const monday   = parseDateLocal(wk);
        const usage    = (usageByWeek[wk] || {})[usageKey] || 0;
        const limitRow = allLimits.find(function (x) {
            return x.week_start === wk;
        });
        const limit    = limitRow ? (limitRow[limitKey] || 0) : 0;

        const pct      = maxVal > 0
            ? (usage / maxVal) * 100 : 0;
        const limitPct = maxVal > 0
            ? (limit / maxVal) * 100 : 0;
        const usagePct = limit > 0
            ? (usage / limit) * 100 : 0;
        const barClass = limit > 0 && usage > limit ? " over"
                       : usagePct >= 80              ? " warn"
                       : " normal";

        const label = monday.toLocaleDateString("en-US", {
            month: "short", day: "numeric"
        });

        return `
        <div class="chart-row">
            <div class="chart-row-label">${label}</div>
            <div class="chart-row-bar-wrap">
                <div class="chart-row-bar-fill${barClass}"
                     style="width:${pct.toFixed(1)}%">
                </div>
                ${limit ? `
                <div class="chart-row-limit-line"
                     style="left:${limitPct.toFixed(1)}%"
                     title="Limit: ${limit.toLocaleString()}">
                </div>` : ""}
            </div>
            <div class="chart-row-value">
                ${usage.toLocaleString()}
                ${limit
                    ? `<span style="color:var(--text-muted)">
                           / ${limit.toLocaleString()}
                       </span>`
                    : ""}
            </div>
        </div>`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   HEADER STATS
───────────────────────────────────────────────────────── */
function updateHeaderStats() {
    const today  = new Date();
    today.setHours(0, 0, 0, 0);
    const key    = toYMD(getMondayOf(today));

    const elActive = document.getElementById("stat-active-limits");
    const elUsage  = document.getElementById("stat-week-usage");
    const elWeeks  = document.getElementById("stat-weeks-configured");

    if (elActive) elActive.textContent = allLimits.length;
    if (elWeeks)  elWeeks.textContent  = allLimits.length;

    if (elUsage) {
        const limit = allLimits.find(function (l) {
            return l.week_start === key;
        });
        const usage = usageByWeek[key] || { projects: 0 };

        if (limit?.max_projects) {
            const pct = Math.round(
                (usage.projects / limit.max_projects) * 100
            );
            elUsage.textContent = pct + "%";
        } else {
            elUsage.textContent = "—";
        }
    }
}

/* ═══════════════════════════════════════════════════════════
   MONTHLY SUMMARY
═══════════════════════════════════════════════════════════ */
let monthlyData      = [];
let currentYearMonth = "";

/* ─────────────────────────────────────────────────────────
   INIT
───────────────────────────────────────────────────────── */
function initMonthlyTab() {
    const picker = document.getElementById("monthly-picker");
    if (!picker) return;
    if (!picker.value) {
        const now    = new Date();
        picker.value = now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0");
    }
    loadMonthlySummary();
}

/* ─────────────────────────────────────────────────────────
   NAV
───────────────────────────────────────────────────────── */
function goToCurrentMonth() {
    const now    = new Date();
    const picker = document.getElementById("monthly-picker");
    if (picker) {
        picker.value = now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, "0");
    }
    loadMonthlySummary();
}

function shiftMonth(delta) {
    const picker = document.getElementById("monthly-picker");
    if (!picker || !picker.value) return;
    const [y, m] = picker.value.split("-").map(Number);
    const d      = new Date(y, m - 1 + delta, 1);
    picker.value = d.getFullYear() + "-" +
        String(d.getMonth() + 1).padStart(2, "0");
    loadMonthlySummary();
}

/* ─────────────────────────────────────────────────────────
   LOAD
───────────────────────────────────────────────────────── */
async function loadMonthlySummary() {
    const picker = document.getElementById("monthly-picker");

    /* ── safety checks ── */
    if (!picker) {
        console.error("monthly-picker element not found");
        return;
    }
    if (!picker.value) {
        console.error("picker.value is empty");
        return;
    }

    currentYearMonth = picker.value;
    console.log("📅 loadMonthlySummary for:", currentYearMonth);

    /* ── parse ── */
    const parts = currentYearMonth.split("-");
    if (parts.length < 2) {
        console.error("Invalid picker format:", currentYearMonth);
        return;
    }

    const year  = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);

    if (isNaN(year) || isNaN(month) ||
        month < 1   || month > 12) {
        console.error("Invalid year/month:", year, month);
        return;
    }

    /* ── build date strings ── */
    const firstDateStr = year + "-" +
        String(month).padStart(2, "0") + "-01";
    const lastDayNum   = new Date(year, month, 0).getDate();
    const lastDateStr  = year + "-" +
        String(month).padStart(2, "0") + "-" +
        String(lastDayNum).padStart(2, "0");
    const firstDay     = new Date(year, month - 1, 1);

    console.log("📅 Range:", firstDateStr, "→", lastDateStr);

    /* ── update title ── */
    const titleEl = document.getElementById("monthly-title");
    if (titleEl) {
        titleEl.textContent = "📅 " +
            firstDay.toLocaleDateString("en-US", {
                month: "long", year: "numeric"
            });
    }

    renderMonthlySkeletons();

    try {
        const { data, error } = await window.db
            .from(PROJECTS_TABLE)
            .select("*")
            .gte("start_date", firstDateStr)
            .lte("start_date", lastDateStr)
            .order("start_date", { ascending: true });

        if (error) throw error;

        monthlyData = data || [];
        console.log("✅ Monthly loaded:",
            monthlyData.length, "projects");

        renderMonthlySummaryCards();
        renderMonthlyWeeklyBreakdown(firstDay);
        renderMonthlyEquipmentBreakdown();
        renderMonthlyPJMBreakdown();

    } catch (err) {
        console.error("loadMonthlySummary error:", err.message);
        showToast("Failed to load: " + err.message, "error");
    }
}

/* ─────────────────────────────────────────────────────────
   SKELETONS
───────────────────────────────────────────────────────── */
function renderMonthlySkeletons() {
    const cards = document.getElementById("monthly-cards");
    if (cards) {
        cards.innerHTML = Array(4).fill(
            `<div class="overview-card-skeleton"></div>`
        ).join("");
    }
}

/* ─────────────────────────────────────────────────────────
   SUMMARY CARDS
───────────────────────────────────────────────────────── */
function renderMonthlySummaryCards() {
    const container = document.getElementById("monthly-cards");
    if (!container) return;

    const totalProjects   = monthlyData.length;
    const totalQuantity   = monthlyData.reduce(function (s, r) {
        return s + (Number(r.quantity) || 0);
    }, 0);
    const totalLots       = monthlyData.reduce(function (s, r) {
        return s + (Number(r.no_lot) || 1);
    }, 0);
    const uniqueEquipment = new Set(
        monthlyData.map(function (r) {
            return r.equipment || "";
        }).filter(Boolean)
    ).size;
    const uniquePJM       = new Set(
        monthlyData.map(function (r) {
            return r.pjm_name || "";
        }).filter(Boolean)
    ).size;
    const uniquePlatform  = new Set(
        monthlyData.map(function (r) {
            return r.platform || "";
        }).filter(Boolean)
    ).size;

    const cards = [
        {
            icon  : "📋",
            label : "Total Projects",
            value : totalProjects,
            accent: "var(--accent)",
            sub   : uniquePJM + " PJM(s)"
        },
        {
            icon  : "📦",
            label : "Total Quantity",
            value : totalQuantity.toLocaleString(),
            accent: "var(--accent2)",
            sub   : uniquePlatform + " platform(s)"
        },
        {
            icon  : "📚",
            label : "Total Lots",
            value : totalLots.toLocaleString(),
            accent: "var(--success)",
            sub   : "across all weeks"
        },
        {
            icon  : "⚙️",
            label : "Equipment Used",
            value : uniqueEquipment,
            accent: "var(--warning)",
            sub   : "unique equipment"
        }
    ];

    container.innerHTML = cards.map(function (c) {
        return `
        <div class="overview-card"
             style="--card-accent:${c.accent}">
            <span class="overview-card-icon">${c.icon}</span>
            <div class="overview-card-label">${c.label}</div>
            <div class="overview-card-value"
                 style="color:${c.accent}">
                ${c.value}
            </div>
            <div class="overview-card-limit"
                 style="color:var(--text-muted)">
                ${c.sub}
            </div>
        </div>`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   WEEKLY BREAKDOWN
───────────────────────────────────────────────────────── */
function renderMonthlyWeeklyBreakdown(firstDay) {
    if (!firstDay || isNaN(firstDay.getTime())) {
        console.error("❌ firstDay invalid:", firstDay);
        return;
    }

    const tbody = document.getElementById("monthly-weekly-tbody");
    const empty = document.getElementById("monthly-weekly-empty");
    if (!tbody) return;

    const mondays = getMondaysInMonth(firstDay);

    if (!monthlyData.length) {
        tbody.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
    }
    if (empty) empty.classList.add("hidden");

    tbody.innerHTML = mondays.map(function (monday) {
        const sunday    = getSundayOf(monday);
        const mondayStr = toYMD(monday);
        const sundayStr = toYMD(sunday);

        /* ── use start_date string directly — no cols ── */
        const weekRows = monthlyData.filter(function (r) {
            if (!r.start_date) return false;
            const d = String(r.start_date).slice(0, 10);
            return d >= mondayStr && d <= sundayStr;
        });

        const projects  = weekRows.length;
        const quantity  = weekRows.reduce(function (s, r) {
            return s + (Number(r.quantity) || 0); // ← no cols
        }, 0);
        const lots      = weekRows.reduce(function (s, r) {
            return s + (Number(r.no_lot) || 1);   // ← no cols
        }, 0);
        const equipment = new Set(weekRows.map(function (r) {
            return r.equipment || "";
        }).filter(Boolean)).size;
        const upd       = new Set(weekRows.map(function (r) {
            return r.upd || "";
        }).filter(Boolean)).size;

        const weekKey = toYMD(monday);
        const limit   = allLimits.find(function (l) {
            return l.week_start === weekKey;
        });

        let statusBadge = "";
        if (!limit) {
            statusBadge =
                `<span class="limit-status-badge none">
                     — No Limit
                 </span>`;
        } else {
            const overP = limit.max_projects &&
                          projects > limit.max_projects;
            const overQ = limit.max_quantity &&
                          quantity > limit.max_quantity;
            const overL = limit.max_lots &&
                          lots > limit.max_lots;
            const warnP = limit.max_projects &&
                          projects / limit.max_projects >= 0.8;
            const warnQ = limit.max_quantity &&
                          quantity / limit.max_quantity >= 0.8;

            if (overP || overQ || overL) {
                statusBadge =
                    `<span class="limit-status-badge over">
                         ⚠️ Over Limit
                     </span>`;
            } else if (warnP || warnQ) {
                statusBadge =
                    `<span class="limit-status-badge warn">
                         🟡 Near Limit
                     </span>`;
            } else {
                statusBadge =
                    `<span class="limit-status-badge ok">
                         ✅ Within Limit
                     </span>`;
            }
        }

        return `
        <tr style="${!projects ? "opacity:0.4" : ""}">
            <td style="font-size:12px;
                       color:var(--text-secondary);
                       white-space:nowrap">
                ${formatDateShort(monday)}
                – ${formatDateShort(sunday)}
            </td>
            <td style="font-weight:700">${projects}</td>
            <td>${quantity.toLocaleString()}</td>
            <td>${lots.toLocaleString()}</td>
            <td>${equipment}</td>
            <td>${upd}</td>
            <td>${statusBadge}</td>
        </tr>`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   EQUIPMENT BREAKDOWN
───────────────────────────────────────────────────────── */
function renderMonthlyEquipmentBreakdown() {
    const tbody = document.getElementById("monthly-equipment-tbody");
    const empty = document.getElementById("monthly-equipment-empty");
    if (!tbody) return;

    if (!monthlyData.length) {
        tbody.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
    }
    if (empty) empty.classList.add("hidden");

    const eqMap = {};
    monthlyData.forEach(function (r) {
        const key = r.equipment || "Unknown";
        if (!eqMap[key]) {
            eqMap[key] = { projects:0, quantity:0, lots:0 };
        }
        eqMap[key].projects += 1;
        eqMap[key].quantity += Number(r.quantity) || 0;
        eqMap[key].lots     += Number(r.no_lot)   || 1;
    });

    const sorted = Object.entries(eqMap)
        .sort(function (a, b) {
            return b[1].projects - a[1].projects;
        });

    const maxP = sorted[0]?.[1]?.projects || 1;

    tbody.innerHTML = sorted.map(function (entry, i) {
        const [name, stats] = entry;
        const pct  = (stats.projects / maxP) * 100;
        const cls  = pct >= 80 ? " over"
                   : pct >= 50 ? " warn" : "";

        return `
        <tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td style="font-weight:600;
                       color:var(--text-primary)">
                ${escHtml(name)}
            </td>
            <td><strong>${stats.projects}</strong></td>
            <td>${stats.quantity.toLocaleString()}</td>
            <td>${stats.lots.toLocaleString()}</td>
            <td>
                <div class="usage-bar-wrap">
                    <div class="usage-bar-bg">
                        <div class="usage-bar-fill${cls}"
                             style="width:${pct.toFixed(1)}%">
                        </div>
                    </div>
                    <span class="usage-bar-pct">
                        ${stats.projects}
                    </span>
                </div>
            </td>
        </tr>`;
    }).join("");
}
/* ─────────────────────────────────────────────────────────
   PJM BREAKDOWN
───────────────────────────────────────────────────────── */
function renderMonthlyPJMBreakdown() {
    const tbody = document.getElementById("monthly-pjm-tbody");
    const empty = document.getElementById("monthly-pjm-empty");
    if (!tbody) return;

    if (!monthlyData.length) {
        tbody.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
    }
    if (empty) empty.classList.add("hidden");

    const pjmMap = {};
    monthlyData.forEach(function (r) {
        const key = r.pjm_name || "Unknown";
        if (!pjmMap[key]) {
            pjmMap[key] = {
                projects : 0,
                quantity : 0,
                lots     : 0,
                platforms: new Set()
            };
        }
        pjmMap[key].projects += 1;
        pjmMap[key].quantity += Number(r.quantity) || 0;
        pjmMap[key].lots     += Number(r.no_lot)   || 1;
        if (r.platform) pjmMap[key].platforms.add(r.platform);
    });

    const sorted = Object.entries(pjmMap)
        .sort(function (a, b) {
            return b[1].projects - a[1].projects;
        });

    tbody.innerHTML = sorted.map(function (entry, i) {
        const [name, stats] = entry;
        const platforms =
            [...stats.platforms].join(", ") || "—";

        return `
        <tr>
            <td style="color:var(--text-muted)">${i + 1}</td>
            <td>
                <div style="display:flex;
                            align-items:center;gap:8px">
                    <div style="width:28px;height:28px;
                                border-radius:50%;
                                background:linear-gradient(
                                    135deg,
                                    var(--accent),
                                    var(--accent2));
                                display:flex;
                                align-items:center;
                                justify-content:center;
                                font-weight:700;
                                font-size:12px;
                                color:#fff;flex-shrink:0">
                        ${escHtml(name.charAt(0).toUpperCase())}
                    </div>
                    <strong>${escHtml(name)}</strong>
                </div>
            </td>
            <td><strong>${stats.projects}</strong></td>
            <td>${stats.quantity.toLocaleString()}</td>
            <td>${stats.lots.toLocaleString()}</td>
            <td style="font-size:11px;
                       color:var(--text-muted);
                       max-width:200px;overflow:hidden;
                       text-overflow:ellipsis;
                       white-space:nowrap"
                title="${escHtml(platforms)}">
                ${escHtml(platforms)}
            </td>
        </tr>`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   GET ALL MONDAYS IN A MONTH
───────────────────────────────────────────────────────── */
function getMondaysInMonth(firstDayOfMonth) {
    if (!firstDayOfMonth ||
        isNaN(firstDayOfMonth.getTime())) {
        console.error("getMondaysInMonth: invalid date →",
            firstDayOfMonth);
        return [];
    }

    const mondays = [];
    const year    = firstDayOfMonth.getFullYear();
    const month   = firstDayOfMonth.getMonth(); // 0-indexed

    /* find the first Monday on or before the 1st of month */
    let current = new Date(year, month, 1);
    /* rewind to Monday */
    while (current.getDay() !== 1) {
        current.setDate(current.getDate() - 1);
    }

    /* collect Mondays until we are fully past the month */
    let safety = 0;
    while (safety < 7) {
        safety++;

        /* add this Monday if it overlaps with our month */
        const sunday = new Date(current);
        sunday.setDate(sunday.getDate() + 6);

        const mondayInMonth =
            current.getFullYear() === year &&
            current.getMonth()    === month;
        const sundayInMonth =
            sunday.getFullYear() === year &&
            sunday.getMonth()    === month;

        if (mondayInMonth || sundayInMonth) {
            mondays.push(new Date(current));
        }

        /* advance to next Monday */
        current = new Date(current);
        current.setDate(current.getDate() + 7);

        /* stop when Monday is in next month or beyond */
        if (current.getFullYear() > year ||
            (current.getFullYear() === year &&
             current.getMonth() > month)) {
            break;
        }
    }

    console.log("📅 getMondaysInMonth result:",
        mondays.map(function(m) { return toYMD(m); }));

    return mondays;
}

/* ─────────────────────────────────────────────────────────
   EXPORT CSV
───────────────────────────────────────────────────────── */
async function exportMonthlyCSV(event) {
    /* prevent any form submission / page refresh */
    if (event) event.preventDefault();

    if (!monthlyData.length) {
        showToast("No data to export", "warning");
        return;
    }

    const headers = [
        "PJM Name", "Project Title", "Platform",
        "Equipment", "UPD",
        "Start Date", "Start Time",
        "End Date",   "End Time",
        "Quantity", "No. of Lot", "Special Instructions"
    ];

    const rows = monthlyData.map(function (r) {
        return [
            r.pjm_name     || "",
            r.proj_title   || "",
            r.platform     || "",
            r.equipment    || "",
            r.upd          || "",
            r.start_date   || "",
            r.start_time   || "",
            r.end_date     || "",
            r.end_time     || "",
            r.quantity     || "",
            r.no_lot       || "",
            (r.special_inst || "").replace(/,/g, ";")
        ].join(",");
    });

    const [year, month] = currentYearMonth.split("-");
    const monthName     = new Date(
        parseInt(year), parseInt(month) - 1, 1
    ).toLocaleDateString("en-US", {
        month: "long", year: "numeric"
    }).replace(" ", "_");

    const csv      = [headers.join(","), ...rows].join("\n");
    const blob     = new Blob([csv], { type: "text/csv" });
    const url      = URL.createObjectURL(blob);
    const a        = document.createElement("a");
    a.href         = url;
    a.download     = `monthly_summary_${monthName}.csv`;
    a.style.display= "none";
    document.body.appendChild(a);
    a.click();

    /* cleanup */
    setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 200);

    showToast("📥 Monthly CSV exported", "success");
}
// ═══════════════════════════════════════════════════════════════
// MANAGE USERS
// ═══════════════════════════════════════════════════════════════

const DEFAULT_PASSWORD = "Pjm@12345";

let allUsers       = [];
let filteredUsers  = [];
let userSortCol    = "name";
let userSortDir    = "asc";
let editingUserId  = null;
let deletingUserId = null;

// ── Fetch all users from DB ────────────────────────────────────
async function fetchAllUsers() {
    try {
        const { data, error } = await window.db
            .from("users")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;

        allUsers       = data || [];
        filteredUsers  = [...allUsers];
        renderUsersTable();
        updateUserStats();

    } catch (err) {
        console.error("fetchAllUsers:", err.message);
        showToast("error", "Error", "Failed to load users: " + err.message);
    }
}

// ── Update stats pills ─────────────────────────────────────────
function updateUserStats() {
    const total = allUsers.length;
    const pjm   = allUsers.filter(u => u.role === "pjm").length;
    const coord = allUsers.filter(u => u.role === "sample coordinator").length;
    const active= allUsers.filter(u => u.is_active).length;

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    set("user-stat-total",  total);
    set("user-stat-pjm",    pjm);
    set("user-stat-coord",  coord);
    set("user-stat-active", active);
}

// ── Render users table ─────────────────────────────────────────
function renderUsersTable() {
    const tbody = document.getElementById("users-tbody");
    const empty = document.getElementById("users-empty");
    if (!tbody) return;

    // Sort
    const sorted = [...filteredUsers].sort((a, b) => {
        let va, vb;
        switch (userSortCol) {
            case "name"   : va = a.name    || ""; vb = b.name    || ""; break;
            case "email"  : va = a.email   || ""; vb = b.email   || ""; break;
            case "role"   : va = a.role    || ""; vb = b.role    || ""; break;
            case "status" : va = String(a.is_active); vb = String(b.is_active); break;
            case "created": va = a.created_at || ""; vb = b.created_at || ""; break;
            default       : va = a.name    || ""; vb = b.name    || "";
        }
        const cmp = va.localeCompare(vb);
        return userSortDir === "asc" ? cmp : -cmp;
    });

    if (sorted.length === 0) {
        tbody.innerHTML = "";
        empty?.classList.remove("hidden");
        return;
    }
    empty?.classList.add("hidden");

    tbody.innerHTML = sorted.map((u, i) => {
        const roleBadge = u.role === "pjm"
            ? `<span style="
                background    : rgba(99,102,241,.15);
                color         : #a5b4fc;
                border        : 1px solid rgba(99,102,241,.3);
                padding       : 2px 10px;
                border-radius : 20px;
                font-size     : 11px;
                font-weight   : 700;
                text-transform: uppercase;
               ">PJM</span>`
            : `<span style="
                background    : rgba(20,184,166,.12);
                color         : #5eead4;
                border        : 1px solid rgba(20,184,166,.3);
                padding       : 2px 10px;
                border-radius : 20px;
                font-size     : 11px;
                font-weight   : 700;
                text-transform: uppercase;
               ">Coordinator</span>`;

        const statusBadge = u.is_active
            ? `<span style="
                background    : rgba(34,197,94,.12);
                color         : #86efac;
                border        : 1px solid rgba(34,197,94,.3);
                padding       : 2px 10px;
                border-radius : 20px;
                font-size     : 11px;
                font-weight   : 600;
               ">✅ Active</span>`
            : `<span style="
                background    : rgba(239,68,68,.1);
                color         : #fca5a5;
                border        : 1px solid rgba(239,68,68,.25);
                padding       : 2px 10px;
                border-radius : 20px;
                font-size     : 11px;
                font-weight   : 600;
               ">🚫 Inactive</span>`;

        const createdDate = u.created_at
            ? new Date(u.created_at).toLocaleDateString("en-GB", {
                day: "2-digit", month: "short", year: "numeric"
              })
            : "—";

        // Prevent coordinator from deleting themselves
        const isSelf = u.id === window.currentUser?.id;

        return `
        <tr>
            <td>${i + 1}</td>
            <td>
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="
                        width           : 30px;
                        height          : 30px;
                        border-radius   : 50%;
                        background      : linear-gradient(135deg,#4f46e5,#7c3aed);
                        display         : flex;
                        align-items     : center;
                        justify-content : center;
                        font-size       : 13px;
                        font-weight     : 700;
                        color           : #fff;
                        flex-shrink     : 0;
                    ">
                        ${escHtml((u.name || "?").charAt(0).toUpperCase())}
                    </div>
                    <span style="font-weight:600;">
                        ${escHtml(u.name || "—")}
                        ${isSelf
                            ? `<span style="
                                font-size:10px;
                                color:#94a3b8;
                                margin-left:4px;
                               ">(you)</span>`
                            : ""}
                    </span>
                </div>
            </td>
            <td style="color:#94a3b8; font-size:12px;">
                ${escHtml(u.email || "—")}
            </td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td style="font-size:12px; color:#94a3b8;">
                ${createdDate}
            </td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn-icon btn-edit"
                            onclick="openEditUserModal('${u.id}')"
                            title="Edit user">✏️</button>
                    ${!isSelf
                        ? `<button class="btn-icon btn-delete"
                                   onclick="openDeleteUserModal('${u.id}')"
                                   title="Delete user">🗑️</button>`
                        : `<span title="Cannot delete yourself"
                                 style="opacity:.3; font-size:14px;
                                        cursor:not-allowed;">🗑️</span>`
                    }
                </div>
            </td>
        </tr>`;
    }).join("");
}

// ── Filter users ───────────────────────────────────────────────
function filterUsers() {
    const search = (document.getElementById("user-search")?.value || "")
        .toLowerCase();
    const role   = document.getElementById("filter-user-role")?.value   || "";
    const status = document.getElementById("filter-user-status")?.value || "";

    filteredUsers = allUsers.filter(u => {
        if (role && u.role !== role) return false;
        if (status === "active"   &&  !u.is_active) return false;
        if (status === "inactive" &&   u.is_active) return false;
        if (search) {
            const hay = [u.name, u.email, u.role].join(" ").toLowerCase();
            if (!hay.includes(search)) return false;
        }
        return true;
    });
    renderUsersTable();
}

// ── Sort ───────────────────────────────────────────────────────
function sortUsers(col) {
    if (userSortCol === col) {
        userSortDir = userSortDir === "asc" ? "desc" : "asc";
    } else {
        userSortCol = col;
        userSortDir = "asc";
    }
    renderUsersTable();
}

// ═══════════════════════════════════════════════════════════════
// REGISTER USER — COOLDOWN STATE
// Add these BEFORE confirmRegisterUser()
// ═══════════════════════════════════════════════════════════════

let regCooldown         = false;
let regCooldownSeconds  = 0;
let regCooldownTimer    = null;

function startRegCooldown(seconds) {
    regCooldown        = true;
    regCooldownSeconds = seconds;

    const btn   = document.getElementById("reg-save-btn");
    const label = document.getElementById("reg-save-label");

    clearInterval(regCooldownTimer);

    regCooldownTimer = setInterval(function () {
        regCooldownSeconds--;

        if (label) label.textContent = `⏱️ Wait ${regCooldownSeconds}s…`;
        if (btn)   btn.disabled = true;

        if (regCooldownSeconds <= 0) {
            clearInterval(regCooldownTimer);
            regCooldown = false;
            if (label) label.textContent = "➕ Register User";
            if (btn)   btn.disabled = false;
            hideRegError();
        }
    }, 1000);
}

function setRegLoading(loading) {
    const btn   = document.getElementById("reg-save-btn");
    const label = document.getElementById("reg-save-label");
    if (btn)   btn.disabled      = loading || regCooldown;
    if (label) label.textContent = loading ? "Registering…" : "➕ Register User";
}

function showRegError(msg) {
    const box = document.getElementById("reg-error");
    const txt = document.getElementById("reg-error-msg");
    if (txt) txt.textContent = msg;
    if (box) box.style.display = "flex";
}

function hideRegError() {
    const box = document.getElementById("reg-error");
    if (box) box.style.display = "none";
}

function showRegFieldErr(inputId, errId, msg) {
    document.getElementById(inputId)?.classList.add("error");
    const e = document.getElementById(errId);
    if (e) { e.textContent = msg; e.classList.add("show"); }
}

function clearRegFieldErr(inputId, errId) {
    document.getElementById(inputId)?.classList.remove("error");
    const e = document.getElementById(errId);
    if (e) { e.textContent = ""; e.classList.remove("show"); }
}

function toggleRegPw() {
    const inp = document.getElementById("reg-confirm-pw");
    const btn = document.getElementById("reg-pw-toggle");
    if (!inp) return;
    const hidden    = inp.type === "password";
    inp.type        = hidden ? "text" : "password";
    if (btn) btn.textContent = hidden ? "🙈" : "👁️";
}

function openRegisterModal() {
    // Clear all fields
    ["reg-name", "reg-email", "reg-confirm-pw"].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = ""; el.classList.remove("error"); }
    });
    const roleEl = document.getElementById("reg-role");
    if (roleEl) roleEl.value = "";

    // Clear all error messages
    [
        ["reg-name",       "err-reg-name"],
        ["reg-email",      "err-reg-email"],
        ["reg-role",       "err-reg-role"],
        ["reg-confirm-pw", "err-reg-pw"]
    ].forEach(([inputId, errId]) => clearRegFieldErr(inputId, errId));

    hideRegError();
    closeAdminModal("register-user-modal"); // reset first
    openAdminModal("register-user-modal");
}

async function confirmRegisterUser() {
    if (regCooldown) {
        showRegError(`⏱️ Please wait ${regCooldownSeconds}s before trying again.`);
        return;
    }

    const name      = (document.getElementById("reg-name")?.value       || "").trim();
    const email     = (document.getElementById("reg-email")?.value      || "").trim().toLowerCase();
    const role      = (document.getElementById("reg-role")?.value       || "").trim();
    const confirmPw = (document.getElementById("reg-confirm-pw")?.value || "").trim();

    // ── Clear errors ───────────────────────────────────────
    hideRegError();
    [
        ["reg-name",       "err-reg-name"],
        ["reg-email",      "err-reg-email"],
        ["reg-role",       "err-reg-role"],
        ["reg-confirm-pw", "err-reg-pw"]
    ].forEach(([inputId, errId]) => clearRegFieldErr(inputId, errId));

    // ── Validate ───────────────────────────────────────────
    let hasError = false;
    if (!name || name.length < 2) {
        showRegFieldErr("reg-name", "err-reg-name",
            !name ? "Full name is required." : "Name too short.");
        hasError = true;
    }
    if (!email) {
        showRegFieldErr("reg-email", "err-reg-email",
            "Email is required.");
        hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showRegFieldErr("reg-email", "err-reg-email",
            "Please enter a valid email.");
        hasError = true;
    }
    if (!role) {
        showRegFieldErr("reg-role", "err-reg-role",
            "Please select a role.");
        hasError = true;
    }
    if (!confirmPw) {
        showRegFieldErr("reg-confirm-pw", "err-reg-pw",
            "Please confirm the default password.");
        hasError = true;
    } else if (confirmPw !== DEFAULT_PASSWORD) {
        showRegFieldErr("reg-confirm-pw", "err-reg-pw",
            `Incorrect. Default password is: ${DEFAULT_PASSWORD}`);
        hasError = true;
    }
    if (hasError) return;

    setRegLoading(true);

    try {
        // ── STEP 1: Check users table by email ─────────────
        const { data: existingByEmail } = await window.db
            .from("users")
            .select("id, email")
            .eq("email", email)
            .maybeSingle();

        console.log("🔍 Step 1 - existing by email:", existingByEmail);

        if (existingByEmail) {
            showRegFieldErr("reg-email", "err-reg-email",
                "This email is already registered.");
            return;
        }

        // ── STEP 2: Create auth account ────────────────────
        const { data: authData, error: authError } =
            await window.db.auth.signUp({
                email   : email,
                password: DEFAULT_PASSWORD,
                options : { data: { name, role } }
            });

        console.log("🔍 Step 2 - signUp:",
            "id:", authData?.user?.id,
            "identities:", authData?.user?.identities?.length,
            "error:", authError?.message
        );

        if (authError) {
            const msg = authError.message.toLowerCase();
            if (msg.includes("429") ||
                msg.includes("rate limit") ||
                msg.includes("too many")) {
                startRegCooldown(120);
                showRegError("⏱️ Too many attempts. Please wait 2 minutes.");
                return;
            }
            throw authError;
        }

        if (!authData?.user?.id) {
            throw new Error("No user ID returned from signup.");
        }

        const newUserId = authData.user.id;

        // ── STEP 3: Add ID check before insert ────────────────
// Check if this exact ID already exists (different email same ID)
const { data: existingById } = await window.db
    .from("users")
    .select("id, email")
    .eq("id", newUserId)
    .maybeSingle();

console.log("🔍 Step 2.5 - existing by ID:", existingById);

if (existingById) {
    console.log("🔍 ID conflict - existing:", existingById.email, "new:", email);
    
    // ── This auth ID already has a DB record ───────────
    // Update it with new info instead of inserting
    const { error: updateErr } = await window.db
        .from("users")
        .update({
            name     : name,
            email    : email,
            role     : role,
            is_active: true
        })
        .eq("id", newUserId);

    if (updateErr) throw new Error(updateErr.message);

    console.log("✅ Updated existing record with new info");
    closeAdminModal("register-user-modal");
    showToast("success", "User Registered",
        `✅ ${name} has been registered as ${role}`);
    startRegCooldown(30);
    await fetchAllUsers();
    return;
}

        // ── SUCCESS ────────────────────────────────────────
        console.log("✅ User registered successfully!");
        closeAdminModal("register-user-modal");
        showToast("success", "User Registered",
            `✅ ${name} has been registered as ${role}`);
        startRegCooldown(30);
        await fetchAllUsers();

    } catch (err) {
        console.error("❌ confirmRegisterUser:", err.message);
        const msg = (err.message || "").toLowerCase();

        if (msg.includes("429") ||
            msg.includes("rate limit") ||
            msg.includes("too many")) {
            startRegCooldown(120);
            showRegError("⏱️ Rate limit reached. Please wait 2 minutes.");
        } else if (msg.includes("duplicate") ||
                   msg.includes("unique")    ||
                   msg.includes("pkey")      ||
                   msg.includes("23505")) {
            showRegFieldErr("reg-email", "err-reg-email",
                "This email is already registered.");
        } else {
            showRegError("Registration failed: " + err.message);
        }
    } finally {
        setRegLoading(false);
    }
}
// ═══════════════════════════════════════════════════════════════
// EDIT USER MODAL
// ═══════════════════════════════════════════════════════════════

function openEditUserModal(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    editingUserId = id;

    const nameEl   = document.getElementById("edit-user-name");
    const roleEl   = document.getElementById("edit-user-role");
    const statusEl = document.getElementById("edit-user-status");
    const subtitle = document.getElementById("edit-user-subtitle");

    if (nameEl)   nameEl.value   = user.name  || "";
    if (roleEl)   roleEl.value   = user.role  || "pjm";
    if (statusEl) statusEl.value = String(user.is_active ?? true);
    if (subtitle) subtitle.textContent = user.email || "";

    // Clear errors
    const errEl = document.getElementById("err-edit-user-name");
    if (errEl) { errEl.textContent = ""; errEl.classList.remove("show"); }
    nameEl?.classList.remove("error");

    openAdminModal("edit-user-modal");
}

async function confirmEditUser() {
    const name     = (document.getElementById("edit-user-name")?.value   || "").trim();
    const role     = document.getElementById("edit-user-role")?.value     || "pjm";
    const isActive = document.getElementById("edit-user-status")?.value   === "true";

    const errEl = document.getElementById("err-edit-user-name");
    if (!name) {
        document.getElementById("edit-user-name")?.classList.add("error");
        if (errEl) { errEl.textContent = "Name is required."; errEl.classList.add("show"); }
        return;
    }

    try {
        const { error } = await window.db
            .from("users")
            .update({
                name      : name,
                role      : role,
                is_active : isActive,
                updated_at: new Date().toISOString()
            })
            .eq("id", editingUserId);

        if (error) throw error;

        closeAdminModal("edit-user-modal");
        showToast("success", "User Updated", `✅ ${name} has been updated`);

        // Update sessionStorage if editing self
        if (editingUserId === window.currentUser?.id) {
            window.currentUser.name = name;
            sessionStorage.setItem("pjm_user",
                JSON.stringify(window.currentUser));
        }

        await fetchAllUsers();

    } catch (err) {
        console.error("confirmEditUser:", err.message);
        showToast("error", "Update Failed", err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// DELETE USER MODAL
// ═══════════════════════════════════════════════════════════════

function openDeleteUserModal(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    // Prevent self-delete
    if (id === window.currentUser?.id) {
        showToast("error", "Cannot Delete",
            "You cannot delete your own account.");
        return;
    }

    deletingUserId = id;

    const label    = document.getElementById("delete-user-name-label");
    const subtitle = document.getElementById("delete-user-subtitle");
    if (label)    label.textContent    = user.name || user.email;
    if (subtitle) subtitle.textContent = user.email || "";

    openAdminModal("delete-user-modal");
}

async function confirmDeleteUser() {
    if (!deletingUserId) return;

    const btn = document.getElementById("confirm-delete-user-btn");
    const user = allUsers.find(u => u.id === deletingUserId);

    // ── Guard: make sure dbAdmin exists ──────────────────
    if (!window.dbAdmin) {
        console.error("❌ window.dbAdmin is not initialized");
        showToast("error", "Config Error", "Admin client not initialized. Check supabase-config.js");
        return;
    }

    // ── Guard: make sure .from is a function ─────────────
    if (typeof window.dbAdmin.from !== "function") {
        console.error("❌ window.dbAdmin.from is not a function");
        showToast("error", "Config Error", "Admin client broken. Check service role key.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `Deleting...`;
    }

    try {
        // ── Step 1: Delete from public.users ──────────────
        const { error: dbError } = await window.dbAdmin
            .from("users")
            .delete()
            .eq("id", deletingUserId);

        if (dbError) throw dbError;
        console.log("✅ Deleted from public.users");

        // ── Step 2: Delete from Supabase Auth ─────────────
        const { error: authError } = await window.dbAdmin
            .auth
            .admin
            .deleteUser(deletingUserId);

        if (authError) throw authError;
        console.log("✅ Deleted from auth.users");

        closeAdminModal("delete-user-modal");
        showToast(
            "success",
            "User Deleted",
            `🗑️ ${user?.name || "User"} has been permanently deleted`
        );
        deletingUserId = null;
        await fetchAllUsers();

    } catch (err) {
        console.error("confirmDeleteUser:", err.message);
        showToast("error", "Delete Failed", err.message);

    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `Delete`;
        }
    }
}
// ═══════════════════════════════════════════════════════════════
// EXPORT USERS CSV
// ═══════════════════════════════════════════════════════════════

function exportUsersCSV() {
    const headers = ["Name","Email","Role","Status","Created At"];
    const rows    = filteredUsers.map(u => [
        u.name       || "",
        u.email      || "",
        u.role       || "",
        u.is_active  ? "Active" : "Inactive",
        u.created_at
            ? new Date(u.created_at).toLocaleDateString("en-GB")
            : ""
    ].map(v => `"${String(v).replace(/"/g,'""')}"`));

    const csv  = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `users-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Helper (add if not already in admin.js) ────────────────────
function openAdminModal(id) {
    document.getElementById(id)?.classList.add("active");
}

function escHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
/* ═══════════════════════════════════════════════════════════
   TAB SWITCHING — ONE function, handles ALL tabs
   Never override this with hooks
═══════════════════════════════════════════════════════════ */
function switchAdminTab(tab) {
    document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.remove("active");
    });
    document.querySelectorAll(".tab-content").forEach(function (c) {
        c.classList.remove("active");
    });

    const btn = document.getElementById("tab-" + tab);
    const con = document.getElementById("tab-content-" + tab);
    if (btn) btn.classList.add("active");
    if (con) con.classList.add("active");

    /* ── lazy load per tab ── */
    if (tab === "usage")     loadAnalytics();
    if (tab === "equipment") loadEquipment();
    if (tab === "monthly") initMonthlyTab();
    if (tab === "users") fetchAllUsers();

}

/* ─────────────────────────────────────────────────────────
   EDIT MODAL — open
───────────────────────────────────────────────────────── */
function openEditModal(id) {
    /* find the limit — id comes as string from data-id attr */
    const limit = allLimits.find(function (l) {
        return String(l.id) === String(id);
    });

    if (!limit) {
        console.error("openEditModal: id not found →", id);
        showToast("Record not found — please refresh", "error");
        return;
    }

    editingLimitId = limit.id;

    const monday = parseDateLocal(limit.week_start);
    const sunday = getSundayOf(monday);

    /* subtitle */
    const sub = document.getElementById("edit-modal-subtitle");
    if (sub) {
        sub.textContent =
            formatDateShort(monday) + " — " + formatDateShort(sunday);
    }

    /* fill inputs */
    const pEl = document.getElementById("edit-max-projects");
    const qEl = document.getElementById("edit-max-quantity");
    const lEl = document.getElementById("edit-max-lots");
    const nEl = document.getElementById("edit-limit-notes");

    if (pEl) pEl.value = limit.max_projects ?? "";
    if (qEl) qEl.value = limit.max_quantity ?? "";
    if (lEl) lEl.value = limit.max_lots     ?? "";
    if (nEl) nEl.value = limit.notes        ?? "";

    openAdminModal("edit-limit-modal");
}

/* ─────────────────────────────────────────────────────────
   EDIT MODAL — save (called by the Save Changes button)
───────────────────────────────────────────────────────── */
async function confirmEditLimit() {
    if (!editingLimitId) {
        showToast("No record selected", "error");
        return;
    }

    const maxProjects = parseInt(
        document.getElementById("edit-max-projects").value);
    const maxQuantity = parseInt(
        document.getElementById("edit-max-quantity").value);
    const maxLots     = parseInt(
        document.getElementById("edit-max-lots").value);
    const notes       = document.getElementById("edit-limit-notes")
                            .value.trim();

    /* validate */
    if (!maxProjects || maxProjects < 1 ||
        !maxQuantity || maxQuantity < 1 ||
        !maxLots     || maxLots     < 1) {
        showToast("All limit values must be ≥ 1", "error");
        return;
    }

    /* get week_end from existing record */
    const existing = allLimits.find(function (l) {
        return String(l.id) === String(editingLimitId);
    });
    if (!existing) {
        showToast("Record not found — please refresh", "error");
        return;
    }

    const monday  = parseDateLocal(existing.week_start);
    const sunday  = getSundayOf(monday);
    const weekEnd = toYMD(sunday);

    /* disable button while saving */
    const saveBtn = document.querySelector(
        "#edit-limit-modal .btn-success");
    if (saveBtn) {
        saveBtn.disabled    = true;
        saveBtn.textContent = "⏳ Saving…";
    }

    try {
        const { error } = await window.db
            .from(LIMITS_TABLE)
            .update({
                week_end    : weekEnd,
                max_projects: maxProjects,
                max_quantity: maxQuantity,
                max_lots    : maxLots,
                notes       : notes || null,
                updated_at  : new Date().toISOString()
            })
            .eq("id", editingLimitId);

        if (error) throw error;

        showToast("✅ Limit updated successfully", "success");
        closeAdminModal("edit-limit-modal");
        editingLimitId = null;
        await loadLimits();

    } catch (err) {
        console.error("confirmEditLimit error:", err.message);
        showToast("❌ Update failed: " + err.message, "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled    = false;
            saveBtn.textContent = "💾 Save Changes";
        }
    }
}

/* ─────────────────────────────────────────────────────────
   DELETE MODAL
───────────────────────────────────────────────────────── */
function openDeleteModal(id) {
    const limit = allLimits.find(function (l) {
        return String(l.id) === String(id);
    });
    if (!limit) {
        showToast("Record not found — please refresh", "error");
        return;
    }

    deletingLimitId = limit.id;

    const monday = parseDateLocal(limit.week_start);
    const sunday = getSundayOf(monday);
    const label  = formatDateShort(monday) +
                   " — " + formatDateShort(sunday);

    const weekLabel = document.getElementById("delete-week-label");
    if (weekLabel) weekLabel.textContent = label;

    const sub = document.getElementById("delete-modal-subtitle");
    if (sub) sub.textContent = label;

    openAdminModal("delete-limit-modal");
}

async function confirmDeleteLimit() {
    if (!deletingLimitId) {
        showToast("No record selected", "error");
        return;
    }

    const delBtn = document.querySelector(
        "#delete-limit-modal .btn-danger");
    if (delBtn) {
        delBtn.disabled    = true;
        delBtn.textContent = "⏳ Deleting…";
    }

    try {
        const { error } = await window.db
            .from(LIMITS_TABLE)
            .delete()
            .eq("id", deletingLimitId);

        if (error) throw error;

        showToast("🗑️ Limit deleted", "success");
        closeAdminModal("delete-limit-modal");
        deletingLimitId = null;
        await loadLimits();

    } catch (err) {
        console.error("confirmDeleteLimit error:", err.message);
        showToast("❌ Delete failed: " + err.message, "error");
    } finally {
        if (delBtn) {
            delBtn.disabled    = false;
            delBtn.textContent = "🗑️ Yes, Delete";
        }
    }
}

/* ─────────────────────────────────────────────────────────
   MODAL HELPERS
───────────────────────────────────────────────────────── */
function openAdminModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
}

function closeAdminModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
}

/* close modal on overlay click */
document.addEventListener("click", function (e) {
    if (e.target.classList.contains("modal-overlay")) {
        e.target.classList.remove("active");
        editingLimitId  = null;
        deletingLimitId = null;
    }
});

/* ─────────────────────────────────────────────────────────
   EXPORT CSV
───────────────────────────────────────────────────────── */
function exportLimitsCSV() {
    if (!filteredLimits.length) {
        showToast("Nothing to export", "warning");
        return;
    }

    const headers = [
        "Week Start", "Week End", "Max Projects",
        "Max Quantity", "Max Lots", "Notes", "Updated At"
    ];

    const rows = filteredLimits.map(function (l) {
        const monday = parseDateLocal(l.week_start);
        const sunday = getSundayOf(monday);
        return [
            formatDateShort(monday),
            formatDateShort(sunday),
            l.max_projects || "",
            l.max_quantity || "",
            l.max_lots     || "",
            (l.notes || "").replace(/,/g, ";"),
            l.updated_at
                ? new Date(l.updated_at).toLocaleString()
                : ""
        ].join(",");
    });

    const csv  = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "weekly_limits_" + toYMD(new Date()) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("📥 CSV exported", "success");
}

/* ─────────────────────────────────────────────────────────
   FORM ERROR HELPERS
───────────────────────────────────────────────────────── */
function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    const inputId  = id.replace("err-", "f-");
    const input    = document.getElementById(inputId);
    if (input) input.classList.add("input-error");
}

function clearError(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = "";
    const inputId  = id.replace("err-", "f-");
    const input    = document.getElementById(inputId);
    if (input) input.classList.remove("input-error");
}

function clearAllErrors() {
    ["err-week-start", "err-max-projects",
     "err-max-quantity", "err-max-lots"].forEach(clearError);
}

/* ─────────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────────── */
function showToast(msg, type) {
    type = type || "info";
    const icons = {
        success: "✅", error: "❌",
        warning: "⚠️", info: "ℹ️"
    };
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast       = document.createElement("div");
    toast.className   = "toast " + type;
    toast.innerHTML   = `
        <span>${icons[type] || ""}</span>
        <span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(function () {
        toast.classList.add("fade-out");
        setTimeout(function () { toast.remove(); }, 320);
    }, 3500);
}

/* ─────────────────────────────────────────────────────────
   PUBLIC — weekly limit checker (called from script.js)
───────────────────────────────────────────────────────── */
window.checkWeeklyLimits = async function (startDatetime,
                                           quantity, noLot) {
    try {
        const d = new Date(startDatetime);
        if (isNaN(d.getTime())) return { ok: true };

        const monday  = getMondayOf(d);
        const key     = toYMD(monday);
        const weekEnd = new Date(
            monday.getTime() + 7 * 24 * 3600 * 1000
        );

        /* fetch limit */
        const { data: limit, error: lErr } = await window.db
            .from(LIMITS_TABLE)
            .select("*")
            .eq("week_start", key)
            .maybeSingle();

        if (lErr || !limit) return { ok: true };

        /* fetch existing projects in that week */
        const cols = await detectColumns();
        const { data: existing, error: pErr } = await window.db
            .from(PROJECTS_TABLE)
            .select(cols.select)
            .gte(cols.startCol, monday.toISOString())
            .lt(cols.startCol,  weekEnd.toISOString());

        if (pErr) return { ok: true }; /* fail-open */

        const rows            = existing || [];
        const currentProjects = rows.length;
        const currentQuantity = rows.reduce(function (s, p) {
            return s + (Number(p[cols.qtyCol] || p.quantity) || 0);
        }, 0);
        const currentLots = rows.reduce(function (s, p) {
            return s + (Number(p[cols.lotCol] || p.no_lot) || 1);
        }, 0);

        const violations = [];

        if (limit.max_projects &&
            currentProjects + 1 > limit.max_projects) {
            violations.push(
                `Max <strong>projects</strong> this week is
                 <strong>${limit.max_projects}</strong>
                 — ${currentProjects} already scheduled`
            );
        }
        if (limit.max_quantity &&
            currentQuantity + Number(quantity) > limit.max_quantity) {
            violations.push(
                `Max <strong>quantity</strong> this week is
                 <strong>${limit.max_quantity.toLocaleString()}</strong>
                 — currently ${currentQuantity.toLocaleString()},
                 adding ${Number(quantity).toLocaleString()}`
            );
        }
        if (limit.max_lots &&
            currentLots + Number(noLot || 1) > limit.max_lots) {
            violations.push(
                `Max <strong>lots</strong> this week is
                 <strong>${limit.max_lots}</strong>
                 — ${currentLots} already scheduled`
            );
        }

        return violations.length
            ? {
                ok       : false,
                violations,
                weekLabel: formatDateShort(monday)
              }
            : { ok: true };

    } catch (err) {
        console.error("checkWeeklyLimits error:", err.message);
        return { ok: true }; /* fail-open */
    }
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC — weekly limit checker (used by script.js)
═══════════════════════════════════════════════════════════ */
window.checkWeeklyLimits = async function(startDatetime,
                                          quantity, noLot) {
    try {
        const d = new Date(startDatetime);
        if (isNaN(d.getTime())) return { ok:true };
        const monday  = getMondayOf(d);
        const key     = toYMD(monday);
        const weekEnd = new Date(monday.getTime()+7*24*3600*1000);

        const { data:limit, error:lErr } = await window.db
            .from(LIMITS_TABLE).select("*")
            .eq("week_start",key).maybeSingle();
        if (lErr||!limit) return { ok:true };

        const cols = await detectColumns();
        const { data:existing, error:pErr } = await window.db
            .from(PROJECTS_TABLE).select(cols.select)
            .gte(cols.startCol, monday.toISOString())
            .lt(cols.startCol,  weekEnd.toISOString());
        if (pErr) return { ok:true };

        const rows = existing||[];
        const cP   = rows.length;
        const cQ   = rows.reduce(function(s,p) {
            return s+(Number(p[cols.qtyCol]||p.quantity)||0);
        },0);
        const cL   = rows.reduce(function(s,p) {
            return s+(Number(p[cols.lotCol]||p.no_lot)||1);
        },0);

        const violations = [];
        if (limit.max_projects && cP+1>limit.max_projects)
            violations.push(
                `Max <strong>projects</strong> is
                 <strong>${limit.max_projects}</strong>
                 — ${cP} already scheduled`);
        if (limit.max_quantity &&
            cQ+Number(quantity)>limit.max_quantity)
            violations.push(
                `Max <strong>quantity</strong> is
                 <strong>${limit.max_quantity.toLocaleString()}</strong>
                 — currently ${cQ.toLocaleString()},
                 adding ${Number(quantity).toLocaleString()}`);
        if (limit.max_lots && cL+Number(noLot||1)>limit.max_lots)
            violations.push(
                `Max <strong>lots</strong> is
                 <strong>${limit.max_lots}</strong>
                 — ${cL} already scheduled`);

        return violations.length
            ? { ok:false, violations,
                weekLabel:formatDateShort(monday) }
            : { ok:true };
    } catch(err) {
        console.error("checkWeeklyLimits:",err.message);
        return { ok:true };
    }
}
const EQUIPMENT_TABLE = "equipment";

/* ── Equipment state ─────────────────────────────────────── */
let allEquipment         = [];
let filteredEquipment    = [];
let selectedEquipmentIds = new Set();
let editingEquipmentId   = null;
let deletingEquipmentId  = null;
let sortEqKey            = "group";
let sortEqDir            = "asc";

/* ── Group colour palette ────────────────────────────────── */
const GROUP_COLOURS = [
    { bg:"rgba(139,92,246,.15)", color:"#a78bfa",
      border:"rgba(139,92,246,.3)" },
    { bg:"rgba(6,182,212,.15)",  color:"#22d3ee",
      border:"rgba(6,182,212,.3)" },
    { bg:"rgba(16,185,129,.15)", color:"#34d399",
      border:"rgba(16,185,129,.3)" },
    { bg:"rgba(245,158,11,.15)", color:"#fbbf24",
      border:"rgba(245,158,11,.3)" },
    { bg:"rgba(239,68,68,.15)",  color:"#f87171",
      border:"rgba(239,68,68,.3)" },
    { bg:"rgba(59,130,246,.15)", color:"#60a5fa",
      border:"rgba(59,130,246,.3)" },
    { bg:"rgba(236,72,153,.15)", color:"#f472b6",
      border:"rgba(236,72,153,.3)" },
    { bg:"rgba(20,184,166,.15)", color:"#2dd4bf",
      border:"rgba(20,184,166,.3)" },
];
const groupColourCache = {};

function getGroupColour(groupName) {
    if (!groupName) return {
        bg:"rgba(100,116,139,.12)",
        color:"var(--text-muted)",
        border:"rgba(100,116,139,.2)"
    };
    if (!groupColourCache[groupName]) {
        const n = Object.keys(groupColourCache).length;
        groupColourCache[groupName] =
            GROUP_COLOURS[n % GROUP_COLOURS.length];
    }
    return groupColourCache[groupName];
}

/* ─────────────────────────────────────────────────────────
   LOAD
───────────────────────────────────────────────────────── */
async function loadEquipment() {
    try {
        const { data, error } = await window.db
            .from(EQUIPMENT_TABLE)
            .select("id, created_at, group, name")
            .order("group", { ascending: true })
            .order("name",  { ascending: true });

        if (error) throw error;

        allEquipment      = data || [];
        filteredEquipment = [...allEquipment];

        renderEquipmentTable();
        renderEquipmentStats();
        populateGroupFilter();
        populateGroupDatalist();

        console.log("✅ Equipment loaded:", allEquipment.length);

    } catch (err) {
        console.error("loadEquipment error:", err.message);
        showToast("Failed to load equipment: " + err.message, "error");
    }
}

/* ─────────────────────────────────────────────────────────
   RENDER TABLE
───────────────────────────────────────────────────────── */
function renderEquipmentTable() {
    const tbody = document.getElementById("equipment-tbody");
    const empty = document.getElementById("equipment-empty");
    if (!tbody) return;

    if (!filteredEquipment.length) {
        tbody.innerHTML = "";
        if (empty) empty.classList.remove("hidden");
        return;
    }
    if (empty) empty.classList.add("hidden");

    let html    = "";
    let rowNum  = 1;

    /* ── group the equipment by group name ── */
    const groups = [];
    const seen   = {};

    filteredEquipment.forEach(function (eq) {
        const key = eq.group || "__none__";
        if (!seen[key]) {
            seen[key] = [];
            groups.push({ key: key, items: seen[key] });
        }
        seen[key].push(eq);
    });

    /* ── render each group ── */
    groups.forEach(function (g) {
        const gc = getGroupColour(g.key === "__none__" ? null : g.key);

        g.items.forEach(function (eq, idx) {
            const isChecked  = selectedEquipmentIds.has(String(eq.id));
            const isFirst    = idx === 0;
            const rowSpan    = g.items.length;

            html += `
            <tr class="${isChecked ? "row-selected" : ""}"
                id="eq-row-${eq.id}">

                <!-- Checkbox -->
                <td class="checkbox-cell">
                    <input type="checkbox"
                           data-id="${eq.id}"
                           ${isChecked ? "checked" : ""}
                           onchange="toggleEquipmentRow(
                               this.dataset.id, this.checked)">
                </td>

                <!-- Row number -->
                <td style="color      : var(--text-muted);
                           font-size  : 12px;
                           text-align : center">
                    ${rowNum++}
                </td>

                <!-- Group — only show on first row of each group -->
                ${isFirst ? `
                <td rowspan="${rowSpan}"
                    style="vertical-align : middle;
                           border-right   : 1px solid var(--border)">
                    ${g.key !== "__none__"
                        ? `<span style="
                                display      : inline-flex;
                                align-items  : center;
                                padding      : 4px 12px;
                                border-radius: 20px;
                                font-size    : 11px;
                                font-weight  : 700;
                                background   : ${gc.bg};
                                color        : ${gc.color};
                                border       : 1px solid ${gc.border};
                                white-space  : nowrap">
                               ${escHtml(g.key)}
                           </span>`
                        : `<span style="color:var(--text-muted);
                                        font-size:12px">—</span>`
                    }
                </td>` : ""}

                <!-- Equipment Name -->
                <td style="font-weight   : 600;
                           color         : #1d1c23;
                           font-size     : 13px;
                           padding-left  : 16px">
                    ${eq.name
                        ? escHtml(eq.name)
                        : `<span style="color:var(--text-muted)">—</span>`
                    }
                </td>

                <!-- Actions -->
                <td>
                    <div class="action-btns">
                        <button class="action-btn edit"
                                title="Edit"
                                data-id="${eq.id}"
                                onclick="openEquipmentModal(
                                    'edit', this.dataset.id)">
                            ✏️
                        </button>
                        <button class="action-btn delete"
                                title="Delete"
                                data-id="${eq.id}"
                                onclick="openDeleteEquipmentModal(
                                    this.dataset.id)">
                            🗑️
                        </button>
                    </div>
                </td>
            </tr>`;
        });

        /* ── visual separator between groups ── */
        html += `
        <tr class="group-separator">
            <td colspan="5"
                style="height     : 0px;
                       background : var(--bg-page);
                       border     : none;
                       padding    : 0">
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

/* ─────────────────────────────────────────────────────────
   RENDER STATS
───────────────────────────────────────────────────────── */
function renderEquipmentStats() {
    const totalEl  = document.getElementById("eq-stat-total");
    const groupsEl = document.getElementById("eq-stat-groups");
    const unique   = new Set(
        allEquipment
            .map(function (e) { return e.group; })
            .filter(Boolean)
    );
    if (totalEl)  totalEl.textContent  = allEquipment.length;
    if (groupsEl) groupsEl.textContent = unique.size;
}

/* ─────────────────────────────────────────────────────────
   GROUP FILTER + DATALIST
───────────────────────────────────────────────────────── */
function getSortedGroups() {
    return [...new Set(
        allEquipment
            .map(function (e) { return e.group; })
            .filter(Boolean)
    )].sort();
}

function populateGroupFilter() {
    const sel = document.getElementById("filter-equipment-group");
    if (!sel) return;
    sel.innerHTML = `<option value="">All Groups</option>`;
    getSortedGroups().forEach(function (g) {
        const opt = document.createElement("option");
        opt.value = g; opt.textContent = g;
        sel.appendChild(opt);
    });
}

function populateGroupDatalist() {
    const dl = document.getElementById("eq-group-datalist");
    if (!dl) return;
    dl.innerHTML = getSortedGroups().map(function (g) {
        return `<option value="${escHtml(g)}">`;
    }).join("");
}

/* ─────────────────────────────────────────────────────────
   FILTER
───────────────────────────────────────────────────────── */
function filterEquipment() {
    const q = (
        document.getElementById("equipment-search")?.value || ""
    ).toLowerCase();
    const group = (
        document.getElementById("filter-equipment-group")?.value || ""
    );

    filteredEquipment = allEquipment.filter(function (eq) {
        const text = [eq.name||"", eq.group||""]
                     .join(" ").toLowerCase();
        return (!q     || text.includes(q)) &&
               (!group || (eq.group||"") === group);
    });

    selectedEquipmentIds = new Set(
        [...selectedEquipmentIds].filter(function (id) {
            return filteredEquipment.some(function (e) {
                return String(e.id) === id;
            });
        })
    );

    sortEquipmentData();
    renderEquipmentTable();
    updateEquipmentSelectionUI();
}

/* ─────────────────────────────────────────────────────────
   SORT
───────────────────────────────────────────────────────── */
function sortEquipment(key) {
    sortEqDir = (sortEqKey === key && sortEqDir === "asc")
        ? "desc" : "asc";
    sortEqKey = key;

    ["group","name"].forEach(function (col) {
        const th = document.getElementById("eq-th-" + col);
        if (!th) return;
        const label = col.charAt(0).toUpperCase() + col.slice(1);
        th.textContent = label +
            (sortEqKey === col
                ? (sortEqDir === "asc" ? " ▲" : " ▼")
                : " ↕");
    });

    sortEquipmentData();
    renderEquipmentTable();
}

function sortEquipmentData() {
    const dir = sortEqDir === "asc" ? 1 : -1;
    filteredEquipment.sort(function (a, b) {
        const va = (a[sortEqKey]||"").toLowerCase();
        const vb = (b[sortEqKey]||"").toLowerCase();
        return va < vb ? -dir : va > vb ? dir : 0;
    });
}

/* ─────────────────────────────────────────────────────────
   CHECKBOX HELPERS
───────────────────────────────────────────────────────── */
function toggleEquipmentRow(id, checked) {
    checked
        ? selectedEquipmentIds.add(String(id))
        : selectedEquipmentIds.delete(String(id));
    const row = document.getElementById("eq-row-" + id);
    if (row) row.classList.toggle("row-selected", checked);
    updateEquipmentSelectionUI();
}

function toggleSelectAllEquipment() {
    const master = document.getElementById("eq-select-all");
    if (!master) return;
    filteredEquipment.forEach(function (eq) {
        master.checked
            ? selectedEquipmentIds.add(String(eq.id))
            : selectedEquipmentIds.delete(String(eq.id));
    });
    renderEquipmentTable();
    updateEquipmentSelectionUI();
}

function updateEquipmentSelectionUI() {
    const count   = selectedEquipmentIds.size;
    const countEl = document.getElementById("equipment-selected-count");
    const delBtn  = document.getElementById("eq-bulk-delete-btn");
    if (countEl) countEl.textContent =
        count > 0 ? count + " selected" : "";
    if (delBtn)  delBtn.style.display =
        count > 0 ? "inline-flex" : "none";
    const master = document.getElementById("eq-select-all");
    if (master) {
        master.checked =
            count > 0 && count === filteredEquipment.length;
        master.indeterminate =
            count > 0 && count < filteredEquipment.length;
    }
}

/* ─────────────────────────────────────────────────────────
   OPEN ADD / EDIT MODAL
───────────────────────────────────────────────────────── */
function openEquipmentModal(mode, id) {
    clearEquipmentErrors();
    document.getElementById("eq-group").value = "";
    document.getElementById("eq-name").value  = "";

    const titleEl    = document.getElementById("eq-modal-title");
    const subtitleEl = document.getElementById("eq-modal-subtitle");
    const saveBtn    = document.getElementById("eq-save-btn");

    if (mode === "add") {
        editingEquipmentId  = null;
        if (titleEl)    titleEl.textContent    = "➕ Add Equipment";
        if (subtitleEl) subtitleEl.textContent = "Fill in the details";
        if (saveBtn)    saveBtn.textContent    = "💾 Save Equipment";
    } else {
        const eq = allEquipment.find(function (e) {
            return String(e.id) === String(id);
        });
        if (!eq) {
            showToast("Equipment not found — refresh", "error");
            return;
        }
        editingEquipmentId = eq.id;
        document.getElementById("eq-group").value = eq.group || "";
        document.getElementById("eq-name").value  = eq.name  || "";
        if (titleEl)    titleEl.textContent    = "✏️ Edit Equipment";
        if (subtitleEl) subtitleEl.textContent = "Editing: " + eq.name;
        if (saveBtn)    saveBtn.textContent    = "💾 Save Changes";
    }
    populateGroupDatalist();
    openAdminModal("equipment-modal");
}

/* ─────────────────────────────────────────────────────────
   SAVE (insert or update)
───────────────────────────────────────────────────────── */
async function confirmSaveEquipment() {
    clearEquipmentErrors();
    const group = document.getElementById("eq-group").value.trim();
    const name  = document.getElementById("eq-name").value.trim();

    let valid = true;
    if (!group) {
        showEquipmentError("err-eq-group", "Group is required");
        valid = false;
    }
    if (!name) {
        showEquipmentError("err-eq-name", "Name is required");
        valid = false;
    }
    const duplicate = allEquipment.find(function (e) {
        return e.name.toLowerCase() === name.toLowerCase() &&
               String(e.id) !== String(editingEquipmentId);
    });
    if (duplicate) {
        showEquipmentError("err-eq-name",
            "Equipment with this name already exists");
        valid = false;
    }
    if (!valid) return;

    const saveBtn = document.getElementById("eq-save-btn");
    if (saveBtn) {
        saveBtn.disabled    = true;
        saveBtn.textContent = "⏳ Saving…";
    }
    try {
        if (editingEquipmentId) {
            const { error } = await window.db
                .from(EQUIPMENT_TABLE)
                .update({ group, name })
                .eq("id", editingEquipmentId);
            if (error) throw error;
            showToast(`✅ "${name}" updated`, "success");
        } else {
            const { error } = await window.db
                .from(EQUIPMENT_TABLE)
                .insert({ group, name });
            if (error) throw error;
            showToast(`✅ "${name}" added`, "success");
        }
        closeAdminModal("equipment-modal");
        editingEquipmentId = null;
        await loadEquipment();
    } catch (err) {
        console.error("confirmSaveEquipment:", err.message);
        showToast("❌ Save failed: " + err.message, "error");
    } finally {
        if (saveBtn) {
            saveBtn.disabled    = false;
            saveBtn.textContent = editingEquipmentId
                ? "💾 Save Changes" : "💾 Save Equipment";
        }
    }
}

/* ─────────────────────────────────────────────────────────
   DELETE SINGLE
───────────────────────────────────────────────────────── */
function openDeleteEquipmentModal(id) {
    const eq = allEquipment.find(function (e) {
        return String(e.id) === String(id);
    });
    if (!eq) { showToast("Not found — refresh","error"); return; }
    deletingEquipmentId = eq.id;
    const nameLabel = document.getElementById("delete-eq-name-label");
    const sub       = document.getElementById("delete-eq-subtitle");
    if (nameLabel) nameLabel.textContent = eq.name;
    if (sub)       sub.textContent       = eq.name;
    openAdminModal("delete-equipment-modal");
}

async function confirmDeleteEquipment() {
    if (!deletingEquipmentId) return;
    const btn = document.getElementById("confirm-delete-eq-btn");
    if (btn) { btn.disabled=true; btn.textContent="⏳ Deleting…"; }
    try {
        const { error } = await window.db
            .from(EQUIPMENT_TABLE)
            .delete()
            .eq("id", deletingEquipmentId);
        if (error) throw error;
        showToast("🗑️ Equipment deleted","success");
        closeAdminModal("delete-equipment-modal");
        selectedEquipmentIds.delete(String(deletingEquipmentId));
        deletingEquipmentId = null;
        await loadEquipment();
        updateEquipmentSelectionUI();
    } catch (err) {
        console.error("confirmDeleteEquipment:", err.message);
        showToast("❌ Delete failed: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled=false;
                   btn.textContent="🗑️ Yes, Delete"; }
    }
}

/* ─────────────────────────────────────────────────────────
   BULK DELETE
───────────────────────────────────────────────────────── */
function openBulkDeleteEquipmentModal() {
    const count = selectedEquipmentIds.size;
    if (!count) return;
    const sub    = document.getElementById("bulk-delete-eq-subtitle");
    const textEl = document.getElementById("bulk-delete-eq-text");
    if (sub)    sub.textContent  = count + " item(s) selected";
    if (textEl) textEl.innerHTML =
        `Permanently delete <strong>${count} equipment item(s)</strong>.
         This cannot be undone.`;
    openAdminModal("bulk-delete-equipment-modal");
}

async function confirmBulkDeleteEquipment() {
    const ids = [...selectedEquipmentIds];
    if (!ids.length) return;
    const btn = document.getElementById("confirm-bulk-delete-eq-btn");
    if (btn) { btn.disabled=true; btn.textContent="⏳ Deleting…"; }
    try {
        const { error } = await window.db
            .from(EQUIPMENT_TABLE)
            .delete()
            .in("id", ids);
        if (error) throw error;
        showToast(`🗑️ ${ids.length} equipment deleted`,"success");
        closeAdminModal("bulk-delete-equipment-modal");
        selectedEquipmentIds.clear();
        await loadEquipment();
        updateEquipmentSelectionUI();
    } catch (err) {
        console.error("confirmBulkDeleteEquipment:", err.message);
        showToast("❌ Bulk delete failed: " + err.message,"error");
    } finally {
        if (btn) { btn.disabled=false;
                   btn.textContent="🗑️ Yes, Delete All"; }
    }
}

/* ─────────────────────────────────────────────────────────
   EXPORT CSV
───────────────────────────────────────────────────────── */
function exportEquipmentCSV() {
    const list = filteredEquipment.length
        ? filteredEquipment : allEquipment;
    if (!list.length) {
        showToast("Nothing to export","warning"); return;
    }
    const headers = ["Group","Equipment Name","Created At"];
    const rows    = list.map(function (eq) {
        return [
            eq.group||"", eq.name||"",
            eq.created_at
                ? new Date(eq.created_at)
                    .toLocaleDateString("en-US")
                : ""
        ].join(",");
    });
    const csv  = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "equipment_" + toYMD(new Date()) + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("📥 Equipment CSV exported","success");
}

/* ─────────────────────────────────────────────────────────
   EQUIPMENT ERROR HELPERS
───────────────────────────────────────────────────────── */
function showEquipmentError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    const input = document.getElementById(
        id.replace("err-eq-","eq-"));
    if (input) input.classList.add("input-error");
}

function clearEquipmentErrors() {
    ["err-eq-group","err-eq-name"].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.textContent = "";
        const input = document.getElementById(
            id.replace("err-eq-","eq-"));
        if (input) input.classList.remove("input-error");
    });
}

/* ─────────────────────────────────────────────────────────
   HTML ESCAPE
───────────────────────────────────────────────────────── */
function escHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC — weekly limit checker (used by script.js)
═══════════════════════════════════════════════════════════ */
window.checkWeeklyLimits = async function(startDatetime, quantity, noLot) {
    try {
        const d = new Date(startDatetime);
        if (isNaN(d.getTime())) return { ok:true };
        const monday  = getMondayOf(d);
        const key     = toYMD(monday);
        const weekEnd = new Date(monday.getTime()+7*24*3600*1000);

        const { data:limit, error:lErr } = await window.db
            .from(LIMITS_TABLE).select("*")
            .eq("week_start",key).maybeSingle();
        if (lErr||!limit) return { ok:true };

        const cols = await detectColumns();
        const { data:existing, error:pErr } = await window.db
            .from(PROJECTS_TABLE).select(cols.select)
            .gte(cols.startCol, monday.toISOString())
            .lt(cols.startCol,  weekEnd.toISOString());
        if (pErr) return { ok:true };

        const rows = existing||[];
        const cP   = rows.length;
        const cQ   = rows.reduce(function(s,p) {
            return s+(Number(p[cols.qtyCol]||p.quantity)||0);
        },0);
        const cL   = rows.reduce(function(s,p) {
            return s+(Number(p[cols.lotCol]||p.no_lot)||1);
        },0);

        const violations = [];
        if (limit.max_projects && cP+1>limit.max_projects)
            violations.push(
                `Max <strong>projects</strong> is
                 <strong>${limit.max_projects}</strong>
                 — ${cP} already scheduled`);
        if (limit.max_quantity &&
            cQ+Number(quantity)>limit.max_quantity)
            violations.push(
                `Max <strong>quantity</strong> is
                 <strong>${limit.max_quantity.toLocaleString()}</strong>
                 — currently ${cQ.toLocaleString()},
                 adding ${Number(quantity).toLocaleString()}`);
        if (limit.max_lots && cL+Number(noLot||1)>limit.max_lots)
            violations.push(
                `Max <strong>lots</strong> is
                 <strong>${limit.max_lots}</strong>
                 — ${cL} already scheduled`);

        return violations.length
            ? { ok:false, violations,
                weekLabel:formatDateShort(monday) }
            : { ok:true };
    } catch(err) {
        console.error("checkWeeklyLimits:",err.message);
        return { ok:true };
    }

    
}
