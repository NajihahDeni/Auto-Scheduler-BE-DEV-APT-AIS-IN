"use strict";                                    
const _supabase = window.db;                     

if (!_supabase || typeof _supabase.from !== "function") {
    console.error("❌ SCRIPT: Supabase not ready");
} else {
    console.log("✅ SCRIPT: Supabase ready →", typeof _supabase);
}

let lastSavedData = null;
// SESSION GUARD
(function () {
    const SESSION_KEY = "pjm_user";
    const ALLOWED_ROLES = ["sample coordinator", "pjm"]; // ✅ both

    const stored      = sessionStorage.getItem(SESSION_KEY);

    if (!stored) {
        console.warn("🔍 SCRIPT: No session → redirecting");
        window.location.href = "login.html";
        return;
    }

    const user = JSON.parse(stored);
    console.log("🔍 SCRIPT: ✅ Session found →", user);

    window.addEventListener("DOMContentLoaded", function () {
        populateUserBar(user);
        fetchPJMFromSupabase(user.id);
    });
})();

// ============================================================
// POPULATE USER BAR
// ============================================================
function populateUserBar(user) {
    const avatarEl = document.getElementById("user-avatar");
    const nameEl   = document.getElementById("user-name");
    const roleEl   = document.getElementById("user-role");

    if (avatarEl) avatarEl.textContent =
        user.name
            ? user.name.charAt(0).toUpperCase()
            : "?";

    if (nameEl) nameEl.textContent = user.name || "Unknown";
    if (roleEl) roleEl.textContent = user.role || "Unknown";

    console.log("User bar populated →", user.name);
}

// ============================================================
// FETCH USER NAME FROM SUPABASE
// — Only fetches 'name' to fill the PJM Name field
// ============================================================
async function fetchPJMFromSupabase(userId) {
    if (!userId) return;
    try {
        const { data, error } = await _supabase
            .from("users")
            .select("name")
            .eq("id", userId)
            .single();
        if (error) {
            console.error("❌ Name fetch error →", error.message);
            return;
        }
        if (!data?.name) {
            console.warn("No name found →", userId);
            return;
        }
        const pjmInput = document.getElementById("f-pjm_name");
        if (pjmInput) {
            pjmInput.value = data.name;
            pjmInput.setAttribute('readonly', 'true'); 
        }
        const nameEl = document.getElementById("user-name");
        if (nameEl) nameEl.textContent = data.name;

        const stored = sessionStorage.getItem("pjm_user");
        if (stored) {
            const user = JSON.parse(stored);
            user.name  = data.name;
            sessionStorage.setItem(
                "pjm_user", JSON.stringify(user)
            );
        }
    } catch (err) {
        console.error("❌ Unexpected error →", err.message);
    }
}
// ============================================================
// LOGOUT
// ============================================================
async function logout() {
    if (confirm("Are you sure you want to logout?")) {
        try {
            // ✅ Sign out from Supabase auth session
            const { error } = await _supabase.auth.signOut();

            if (error) {
                console.error("🔍 SCRIPT: ❌ Logout error →", error.message);
            } else {
                console.log("🔍 SCRIPT: ✅ Logged out successfully");
            }

        } catch (err) {
            console.error("🔍 SCRIPT: ❌ Unexpected logout error →", err.message);

        } finally {
            // ✅ Always clear session and redirect
            sessionStorage.removeItem("pjm_user");
            window.location.href = "login.html";
        }
    }
}

// ============================================================
// GLOBALS
// ============================================================
let projects         = [];
let currentWeekStart = getWeekStart(new Date());
let sortConfig       = { col: "start", dir: "asc" };
let editingId        = null;
let rowCounter       = 1;
let equipmentInputMode = "dropdown";
let updInputMode       = "dropdown";

const SLOT_H    = 52;
const CAL_START = 0;
const CAL_END   = 23;

function colorFromTitle(title) {
  const s = (title ?? '').trim().toLowerCase();
  if (!s) return 'hsl(210 10% 55%)';

  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 90% 57%)`;
} 

let EQUIPMENT_LIST = [];
let UPD_LIST       = [];
let PLATFORM_LIST  = [];

// ============================================================
// INIT
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
    console.log("🔍 SCRIPT: DOMContentLoaded fired");
    if (!_supabase) {
        console.error("SCRIPT: supabase not ready — aborting init");
        return;
    }
    console.log("SCRIPT: proceeding with init");
    if (typeof initTimeSelects !== "function") {
        console.error("initTimeSelects not found");
        return;
    }
    if (typeof handleTableClick !== "function") {
        console.error("handleTableClick not found");
        return;
    }
    try {
        initTimeSelects();
        setDefaultDates();
        updateCurrentDate();
        await fetchDropdownData();
        renderCalendar();
        updateStats();
        setInterval(updateCurrentDate,     60000);
        setInterval(updateCurrentTimeLine, 60000);
    } catch (err) {
        console.error("❌ SCRIPT: Init error →", err.message);
    }
    // ── Event wiring ─────────────────────────────────────
    document.getElementById("project-tbody")
        ?.addEventListener("click", handleTableClick);
    document.getElementById("equipment-dropdown")
        ?.addEventListener("click", e => {
            const opt = e.target.closest(".combo-option");
            if (opt) selectEquipmentOption(opt.dataset.value);
        });
    document.getElementById("upd-dropdown")
        ?.addEventListener("click", e => {
            const opt = e.target.closest(".combo-option");
            if (opt) selectupdOption(opt.dataset.value);
        });
    document.getElementById("platform-dropdown")
        ?.addEventListener("click", e => {
            const opt = e.target.closest(".combo-option");
            if (opt) selectPlatformOption(opt.dataset.value);
        });
    const equipInput = document.getElementById("f-equipment");
    if (equipInput) {
        equipInput.addEventListener("focus", () => {
            if (equipmentInputMode === "dropdown")
                showEquipmentDropdown();
        });
        equipInput.addEventListener("input", () => {
            if (equipmentInputMode === "dropdown")
                filterEquipmentDropdown();
            else
                liveConflictCheck();
        });
        equipInput.addEventListener("change", liveConflictCheck);
        equipInput.addEventListener("keydown", handleEquipmentKeydown);
    }
    const updInput = document.getElementById("f-upd");
    if (updInput) {
        updInput.addEventListener("focus", () => {
            if (updInputMode === "dropdown")
                showupdDropdown();
        });
        updInput.addEventListener("input", () => {
            if (updInputMode === "dropdown")
                filterupdDropdown();
            else
                liveConflictCheck();
        });
        updInput.addEventListener("change", liveConflictCheck);
        updInput.addEventListener("keydown", handleupdKeydown);
    }
    const platformInput = document.getElementById("f-platform");
    if (platformInput) {
        platformInput.addEventListener("focus",
            showPlatformDropdown);
        platformInput.addEventListener("input",
            filterPlatformDropdown);
        platformInput.addEventListener("keydown",
            handlePlatformKeydown);
    }
    document.getElementById("equipment-mode-toggle")
        ?.addEventListener("click", toggleEquipmentInputMode);
    document.addEventListener("click", handleOutsideClick);
    setEquipmentInputMode("dropdown");

    // ── ✅ Restore reuse-btn state from localStorage ──────
    try {
        const stored = localStorage.getItem("pjm_last_saved");
        if (stored) {
            lastSavedData = JSON.parse(stored);
            const reuseBtn = document.getElementById("reuse-btn");
            if (reuseBtn) reuseBtn.disabled = false;
            console.log("♻️ Previous snapshot restored →", lastSavedData);
        }
    } catch (e) {
        console.warn("restoreReuseSnapshot: parse failed →", e);
    }

    await loadBookingsFromSupabase();
});
// ============================================================
// SHOW / HIDE EQUIPMENT DROPDOWN
// ============================================================
function showEquipmentDropdown() {
    if (equipmentInputMode !== "dropdown") return;
    const dropdown = document.getElementById("equipment-dropdown");
    if (!dropdown) return;
    resetDropdownOptions("equipment-dropdown");
    dropdown.classList.remove("hidden");
}

function hideEquipmentDropdown() {
    const dropdown = document.getElementById("equipment-dropdown");
    if (dropdown) {
        dropdown.classList.add("hidden");
        resetDropdownOptions("equipment-dropdown");
    }
}

function filterEquipmentDropdown() {
    if (equipmentInputMode !== "dropdown") {
        liveConflictCheck();
        return;
    }

    const input    = document.getElementById("f-equipment");
    const dropdown = document.getElementById("equipment-dropdown");
    if (!input || !dropdown) return;

    const query = input.value.toLowerCase().trim();
    dropdown.classList.remove("hidden");
    dropdown.querySelector(".combo-no-result")?.remove();

    const options = dropdown.querySelectorAll(".combo-option");
    const labels  = dropdown.querySelectorAll(".combo-group-label");

    let totalVisible = 0;

    // ✅ Show/hide options based on search
    options.forEach(opt => {
        const match = opt.dataset.value
            .toLowerCase()
            .includes(query);
        opt.classList.toggle("hidden-opt", !match);
        if (match) totalVisible++;
    });

    // ✅ Hide group label if ALL options in that group are hidden
    labels.forEach(label => {
        const groupName = label.textContent.trim();

        // Find all options belonging to this group
        const groupOptions = dropdown.querySelectorAll(
            `.combo-option[data-group="${groupName}"]`
        );

        // Check if any option in group is visible
        const anyVisible = [...groupOptions].some(
            opt => !opt.classList.contains("hidden-opt")
        );

        // Hide label if no options visible
        label.classList.toggle("hidden-opt", !anyVisible);
    });

    // ✅ Show no-result hint
    if (totalVisible === 0 && query.length > 0) {
        const hint       = document.createElement("div");
        hint.className   = "combo-no-result";
        hint.textContent = `No match for: "${input.value}"`;
        dropdown.appendChild(hint);
    }

    liveConflictCheck();
}

function selectEquipmentOption(value) {
    selectGenericOption(
        "f-equipment", "equipment-dropdown", "err-equipment", value
    );
    liveConflictCheck();
}

function handleEquipmentKeydown(e) {
    if (equipmentInputMode !== "dropdown") return;
    handleGenericKeydown(
        e, "equipment-dropdown", "f-equipment", "err-equipment"
    );
}

// ============================================================
// SHOW / HIDE upd DROPDOWN
// ============================================================
function showupdDropdown() {
    if (updInputMode !== "dropdown") return;
    const dropdown = document.getElementById("upd-dropdown");
    if (!dropdown) return;
    resetDropdownOptions("upd-dropdown");
    dropdown.classList.remove("hidden");
}

function hideupdDropdown() {
    const dropdown = document.getElementById("upd-dropdown");
    if (dropdown) {
        dropdown.classList.add("hidden");
        resetDropdownOptions("upd-dropdown");
    }
}

function filterupdDropdown() {
    if (updInputMode !== "dropdown") {
        liveConflictCheck();
        return;
    }
    filterGenericDropdown("f-upd", "upd-dropdown");
    liveConflictCheck();
}

function selectupdOption(value) {
    selectGenericOption(
        "f-upd", "upd-dropdown", "err-upd", value
    );
    liveConflictCheck();
}

function handleupdKeydown(e) {
    if (updInputMode !== "dropdown") return;
    handleGenericKeydown(
        e, "upd-dropdown", "f-upd", "err-upd"
    );
}

// ============================================================
// SHOW / HIDE PLATFORM DROPDOWN
// ============================================================
function showPlatformDropdown() {
    const dropdown = document.getElementById("platform-dropdown");
    if (!dropdown) return;
    resetDropdownOptions("platform-dropdown");
    dropdown.classList.remove("hidden");
}

function hidePlatformDropdown() {
    const dropdown = document.getElementById("platform-dropdown");
    if (dropdown) {
        dropdown.classList.add("hidden");
        resetDropdownOptions("platform-dropdown");
    }
}

function filterPlatformDropdown() {
    filterGenericDropdown("f-platform", "platform-dropdown");
}

function selectPlatformOption(value) {
    selectGenericOption(
        "f-platform", "platform-dropdown", "err-platform", value
    );
    liveConflictCheck();
}

function handlePlatformKeydown(e) {
    handleGenericKeydown(
        e, "platform-dropdown", "f-platform", "err-platform"
    );
}

// ============================================================
// GENERIC COMBOBOX HELPERS
// ============================================================
function filterGenericDropdown(inputId, dropdownId) {
    const input    = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const query   = input.value.toLowerCase().trim();
    const options = dropdown.querySelectorAll(".combo-option");

    dropdown.classList.remove("hidden");

    dropdown.querySelector(".combo-no-result")?.remove();

    let visibleCount = 0;
    options.forEach(opt => {
        const match = opt.dataset.value
            .toLowerCase()
            .includes(query);
        opt.classList.toggle("hidden-opt", !match);
        if (match) visibleCount++;
    });

    if (visibleCount === 0 && query.length > 0) {
        const hint       = document.createElement("div");
        hint.className   = "combo-no-result";
        hint.textContent = `No match for: "${input.value}"`;
        dropdown.appendChild(hint);
    }
}

function selectGenericOption(inputId, dropdownId, errId, value) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errId);
    if (!input) return;

    input.value = value;
    resetDropdownOptions(dropdownId);
    document.getElementById(dropdownId)
        ?.classList.add("hidden");

    input.classList.remove("error", "clash-field");
    if (err) {
        err.textContent = "";
        err.classList.remove("show");
    }
}

function resetDropdownOptions(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.querySelectorAll(".combo-option")
        .forEach(opt =>
            opt.classList.remove("hidden-opt", "highlighted")
        );
    dropdown.querySelector(".combo-no-result")?.remove();
}

function handleGenericKeydown(e, dropdownId, inputId, errId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown ||
        dropdown.classList.contains("hidden")) return;

    const visible = [
        ...dropdown.querySelectorAll(
            ".combo-option:not(.hidden-opt)"
        )
    ];
    if (!visible.length) return;

    const highlighted = dropdown.querySelector(
        ".combo-option.highlighted"
    );
    let idx = visible.indexOf(highlighted);

    switch (e.key) {
        case "ArrowDown":
            e.preventDefault();
            highlighted?.classList.remove("highlighted");
            idx = (idx + 1) % visible.length;
            visible[idx].classList.add("highlighted");
            visible[idx].scrollIntoView({ block: "nearest" });
            break;
        case "ArrowUp":
            e.preventDefault();
            highlighted?.classList.remove("highlighted");
            idx = (idx - 1 + visible.length) % visible.length;
            visible[idx].classList.add("highlighted");
            visible[idx].scrollIntoView({ block: "nearest" });
            break;
        case "Enter":
            e.preventDefault();
            if (highlighted) {
                selectGenericOption(
                    inputId, dropdownId,
                    errId, highlighted.dataset.value
                );
            } else {
                document.getElementById(dropdownId)
                    ?.classList.add("hidden");
            }
            break;
        case "Escape":
            document.getElementById(dropdownId)
                ?.classList.add("hidden");
            break;
    }
}

// ✅ Close all dropdowns on outside click
function handleOutsideClick(e) {
    const map = [
        { wrapper: "equipment-combo-wrapper", hide: hideEquipmentDropdown },
        { wrapper: "upd-combo-wrapper",       hide: hideupdDropdown       },
        { wrapper: "platform-combo-wrapper",  hide: hidePlatformDropdown  },
    ];
    map.forEach(({ wrapper, hide }) => {
        const el = document.getElementById(wrapper);
        if (el && !el.contains(e.target)) hide();
    });
}

// ═══════════════════════════════════════════════════════════════
// PJM FRIDAY CUTOFF HELPERS
// ═══════════════════════════════════════════════════════════════
function getMonday(date) {
    const d   = new Date(date);
    const day = d.getDay();
    const diff = (day === 0) ? -6 : 1 - day; // if Sunday go back 6, else go to Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function toDateString(d) {
    const y  = d.getFullYear();
    const m  = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
}

function applyPjmDateRestriction() {
    if (!window.currentUser || window.currentUser.role !== "pjm") return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayOfWeek = today.getDay();

    // Only restrict on Friday (5) or Saturday (6)
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
        document.getElementById("f-start-date")?.removeAttribute("min");
        document.getElementById("f-end-date")?.removeAttribute("min");
        return;
    }

    // Calculate next Monday
    const daysUntilMonday = dayOfWeek === 5 ? 3 : 2; // Fri+3=Mon, Sat+2=Mon
    const nextMonday      = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    const minDateStr = toDateString(nextMonday);

    const startInput = document.getElementById("f-start-date");
    const endInput   = document.getElementById("f-end-date");

    if (startInput) {
        startInput.min = minDateStr;
        if (startInput.value && startInput.value < minDateStr) {
            startInput.value = "";
        }
    }
    if (endInput) {
        endInput.min = minDateStr;
        if (endInput.value && endInput.value < minDateStr) {
            endInput.value = "";
        }
    }
}

// ============================================================
// LIVE CONFLICT CHECK
// ============================================================
function liveConflictCheck() {

    // ── PJM Friday cutoff ──────────────────────────────────
    const startDateStr = document.getElementById("f-start-date")?.value || "";
    
    if (startDateStr && isPjmCutoffBlocked(startDateStr)) {
        showPjmCutoffWarning();
        return; // stop here, skip normal clash check
    }

    const equipEl = document.getElementById("f-equipment");
    const updEl   = document.getElementById("f-upd");
    const sdEl    = document.getElementById("f-start-date");
    const stEl    = document.getElementById("f-start-time");
    const edEl    = document.getElementById("f-end-date");
    const etEl    = document.getElementById("f-end-time");
    const box     = document.getElementById("live-conflict-box");
    const list    = document.getElementById("live-conflict-list");

    if (!equipEl || !updEl || !sdEl ||
        !stEl   || !edEl  || !etEl) return;

    const equipment = equipEl.value.trim();
    const upd       = updEl.value.trim();
    const startDate = sdEl.value;
    const startTime = stEl.value;
    const endDate   = edEl.value;
    const endTime   = etEl.value;

    clearClashHighlights();

    if (!equipment || !upd || !startDate || !endDate) {
        box?.classList.add("hidden");
        if (list) list.innerHTML = "";
        enableSaveButton();
        return;
    }

    const startDt = new Date(`${startDate}T${startTime}`);
    const endDt   = new Date(`${endDate}T${endTime}`);

    if (isNaN(startDt) || isNaN(endDt) || startDt >= endDt) {
        box?.classList.add("hidden");
        if (list) list.innerHTML = "";
        enableSaveButton();
        return;
    }

    const clashes = detectClashes(
        equipment, upd, startDt, endDt, editingId
    );

    if (!clashes.length) {
        box?.classList.add("hidden");
        if (list) list.innerHTML = "";
        enableSaveButton();
        return;
    }

    // ── Render clash warning ──────────────────────────────
    box?.classList.remove("hidden");
    if (list) list.innerHTML = "";

    clashes.forEach(c => {
        const fmtDt = (d, t) =>
            new Date(`${d}T${t}`)
                .toLocaleDateString("en-GB", {
                    weekday : "short",
                    day     : "2-digit",
                    month   : "short"
                }) + " " + t;

        const item     = document.createElement("div");
        item.className = "live-conflict-item";
        item.innerHTML = `
            <div class="conflict-item-header">
                <span class="conflict-item-badge
                    ${c.type === "Equipment"
                        ? "badge-equipment"
                        : "badge-upd"}">
                    ${c.type === "Equipment"
                        ? "&#128295; Equipment"
                        : "&#128100; upd"}
                </span>
                <strong>${c.resource}</strong>
            </div>
            <div class="conflict-item-detail">
                Already assigned to
                <strong>${c.clashWith.pjm}</strong>
                &mdash; ${c.clashWith.title}
            </div>
            <div class="conflict-item-detail">
                &#9654; ${fmtDt(
                    c.clashWith.startDate,
                    c.clashWith.startTime
                )}
                &nbsp;&rarr;&nbsp;
                &#9632; ${fmtDt(
                    c.clashWith.endDate,
                    c.clashWith.endTime
                )}
            </div>
        `;
        list?.appendChild(item);

        if (c.type === "Equipment") {
            equipEl.classList.add("clash-field");
        } else {
            updEl.classList.add("clash-field");
        }
    });

    disableSaveButton();
}

function clearClashHighlights() {
    ["f-equipment", "f-upd"].forEach(id => {
        document.getElementById(id)
            ?.classList.remove("clash-field");
    });
}

function disableSaveButton() {
    const btn = document.getElementById("save-btn");
    if (!btn) return;
    btn.classList.add("blocked");
    btn.setAttribute("disabled", "true");
    btn.innerHTML = "&#128683; Clash Detected — Cannot Save";
}

function enableSaveButton() {
    const btn = document.getElementById("save-btn");
    if (!btn) return;
    btn.classList.remove("blocked");
    btn.removeAttribute("disabled");
    btn.innerHTML = editingId
        ? "&#9998; Update Project"
        : "&#128190; Save Project";
}

// ============================================================
// EQUIPMENT INPUT MODE TOGGLE
// ============================================================
function toggleEquipmentInputMode() {
    const newMode = equipmentInputMode === "dropdown"
        ? "manual"
        : "dropdown";
    setEquipmentInputMode(newMode);
}

function setEquipmentInputMode(mode) {
    equipmentInputMode = mode;
    const equipInput   = document.getElementById("f-equipment");
    const toggleBtn    = document.getElementById("equipment-mode-toggle");
    const modeLabel    = document.getElementById("equipment-mode-label");
    const comboWrapper = document.getElementById("equipment-combo-wrapper");

    if (!equipInput || !toggleBtn) return;

    hideEquipmentDropdown();
    equipInput.value = "";
    equipInput.classList.remove("error", "clash-field");

    const err = document.getElementById("err-equipment");
    if (err) { err.textContent = ""; err.classList.remove("show"); }

    if (mode === "manual") {
        equipInput.placeholder = "Type equipment name manually…";
        equipInput.removeAttribute("readonly");
        comboWrapper?.classList.add("manual-mode");
        toggleBtn.classList.add("is-manual");
        if (modeLabel) modeLabel.textContent = "✏️ Manual entry";
        toggleBtn.innerHTML = "&#128269; Choose from List";
        setTimeout(() => equipInput.focus(), 50);
    } else {
        equipInput.placeholder = "Select or search equipment…";
        equipInput.removeAttribute("readonly");
        comboWrapper?.classList.remove("manual-mode");
        toggleBtn.classList.remove("is-manual");
        if (modeLabel) modeLabel.textContent = "🔍 Choose from list";
        toggleBtn.innerHTML = "&#9997;&#65039; Enter Manually";
    }
    liveConflictCheck();
}
// ============================================================
// INIT TIME SELECTS
// ============================================================
function initTimeSelects() {
    const times = [];
    for (let h = 0; h < 24; h++) {
        for (const m of [0, 30]) {
            times.push(
                String(h).padStart(2, "0") + ":" +
                String(m).padStart(2, "0")
            );
        }
    }

    ["f-start-time", "f-end-time"].forEach((id, idx) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        sel.innerHTML = "";
        times.forEach(t => {
            const opt       = document.createElement("option");
            opt.value       = t;
            opt.textContent = t;
            sel.appendChild(opt);
        });
        // default: start = 08:00, end = 17:00
        sel.value = idx === 0 ? "08:00" : "17:00";
    });

    console.log("✅ initTimeSelects done");
}

// ============================================================
// SET DEFAULT DATES
// ============================================================
function setDefaultDates() {
    const today = new Date().toISOString().split("T")[0];
    const sd    = document.getElementById("f-start-date");
    const ed    = document.getElementById("f-end-date");
    if (sd) sd.value = today;
    if (ed) ed.value = today;

    console.log("✅ setDefaultDates done →", today);
}

// ============================================================
// HANDLE TABLE CLICK (delegation)
// ============================================================
function handleTableClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const tr = btn.closest("tr");
    if (!tr) return;

    const id     = tr.dataset.id;
    const action = btn.dataset.action;
    if (!id) return;

    if (action === "view")   showProjectDetail(id);
    if (action === "edit")   editProject(id);
    if (action === "delete") deleteProject(id);
}
// ============================================================
// ✅ FETCH DROPDOWN DATA FROM SUPABASE
// ============================================================
async function fetchDropdownData() {
    try {
        showDropdownLoading(true);

        // ── Equipment ────────────────────────────────────────
        const { data: equipData, error: equipError } =
            await _supabase
                .from("equipment")
                .select("*")
                .order("group", { ascending: true })
                .order("name",  { ascending: true });

        if (equipError)
            throw new Error("Equipment: " + equipError.message);

        console.log("🔍 Raw equipment data:", equipData);

        EQUIPMENT_LIST = equipData.map(e => ({
            value : e.name  ? e.name.trim()  : "",
            label : e.name  ? e.name.trim()  : "",
            id    : e.id,
            group : e.group
        }));

        console.log("EQUIPMENT_LIST[0]:", EQUIPMENT_LIST[0]);

        // ── UPD = upd ─────────────────────────────────────────
        const { data: updData, error: updError } =
            await _supabase
                .from("upd")
                .select("*")
                .order("name", { ascending: true });

        if (updError)
            throw new Error("UPD: " + updError.message);

        console.log("🔍 Raw UPD data:", updData);

        UPD_LIST = updData.map(u => ({
            value : u.name ? u.name.trim() : "",
            label : u.name ? u.name.trim() : "",
            id    : u.id
        }));

        // ── Platform ──────────────────────────────────────────
        const { data: platformData, error: platformError } =
            await _supabase
                .from("platform")
                .select("*")
                .order("name", { ascending: true });

        if (platformError)
            throw new Error("Platform: " + platformError.message);

        console.log("🔍 Raw platform data:", platformData);

        PLATFORM_LIST = platformData.map(p => ({
            value : p.name ? p.name.trim() : "",
            label : p.name ? p.name.trim() : "",
            id    : p.id
        }));

        // ── Build dropdowns ───────────────────────────────────
        buildGroupedDropdownOptions(               
            "equipment-dropdown",
            EQUIPMENT_LIST
        );
        buildDropdownOptions(                      
            "upd-dropdown",
            UPD_LIST
        );
        buildDropdownOptions(                      
            "platform-dropdown",
            PLATFORM_LIST
        );

        console.log("Dropdowns loaded:", {
            equipment : EQUIPMENT_LIST.length,
            upd       : UPD_LIST.length,
            platform  : PLATFORM_LIST.length
        });

    } catch (err) {
        console.error("fetchDropdownData:", err.message);
        showToast("error", "Load Error", err.message);
    } finally {
        showDropdownLoading(false);
    }
}

// ✅ Build dropdown options from list array
function buildDropdownOptions(dropdownId, list) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    // Clear old options
    dropdown.querySelectorAll(
        '.combo-option, .combo-no-result'
    ).forEach(el => el.remove());

    // ✅ Hide the loading spinner for this field
    const loadingSpinnerMap = {
        'equipment-dropdown' : 'equipment-loading',
        'upd-dropdown'       : 'upd-loading',
        'platform-dropdown'  : 'platform-loading',
    };
    const spinnerId = loadingSpinnerMap[dropdownId];
    if (spinnerId) {
        const spinner = document.getElementById(spinnerId);
        if (spinner) spinner.style.display = 'none';
    }

    if (!list.length) {
        const empty       = document.createElement('div');
        empty.className   = 'combo-no-result';
        empty.textContent = 'No options available';
        dropdown.appendChild(empty);
        return;
    }

    list.forEach(item => {
        const opt         = document.createElement('div');
        opt.className     = 'combo-option';
        opt.dataset.value = item.value;
        opt.dataset.id    = item.id;
        opt.textContent   = item.label;
        dropdown.appendChild(opt);
    });

    console.log(`✅ ${list.length} options → #${dropdownId}`);
}

// ✅ Loading state for all dropdown inputs
function showDropdownLoading(isLoading) {
    const inputs = [
        { id: 'f-equipment', placeholder: 'Select or search equipment…' },
        { id: 'f-upd',       placeholder: 'Select upd (UPD)…'           }, // ✅
        { id: 'f-platform',  placeholder: 'Select platform…'            },
    ];

    inputs.forEach(({ id, placeholder }) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.disabled    = isLoading;
        el.placeholder = isLoading ? 'Loading…' : placeholder;
    });
}
// ============================================================
// BUILD GROUPED DROPDOWN — group names come from DB
// ============================================================
function buildGroupedDropdownOptions(dropdownId, list) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    console.log("list length:", list.length);
    console.log("first item:", list[0]);
    console.log("first item group:", JSON.stringify(list[0]?.group));

    dropdown.querySelectorAll(
        ".combo-option, .combo-group-label, .combo-no-result"
    ).forEach(el => el.remove());

    if (!list.length) {
        const empty       = document.createElement("div");
        empty.className   = "combo-no-result";
        empty.textContent = "No equipment available";
        dropdown.appendChild(empty);
        return;
    }

    const groups = {};
    list.forEach(item => {
        const g = item.group;
        if (!groups[g]) groups[g] = [];
        groups[g].push(item);
    });

    console.log("groups found:", Object.keys(groups));
    console.log("groups count:", Object.keys(groups).length);

    Object.keys(groups).sort().forEach(groupName => {
        // Group header
        const label       = document.createElement("div");
        label.className   = "combo-group-label";
        label.textContent = groupName;
        dropdown.appendChild(label);

        console.log(`rendering group: "${groupName}" with ${groups[groupName].length} items`);

        // Options under this group
        groups[groupName].forEach(item => {
            const opt         = document.createElement("div");
            opt.className     = "combo-option";
            opt.dataset.value = item.value;
            opt.dataset.id    = item.id;
            opt.dataset.group = groupName; 
            opt.textContent   = item.label;
            dropdown.appendChild(opt);
        });
        
    });

        console.log("📦 dropdown total children:", dropdown.children.length);
}
// ============================================================
// ✅ upd COMBOBOX (backed by UPD table)
// ============================================================
function showupdDropdown() {
    if (updInputMode !== 'dropdown') return;
    const dropdown = document.getElementById('upd-dropdown');
    if (!dropdown) return;
    resetDropdownOptions('upd-dropdown');
    dropdown.classList.remove('hidden');
}

function filterupdDropdown() {
    if (updInputMode !== 'dropdown') {
        liveConflictCheck();
        return;
    }
    filterGenericDropdown('f-upd', 'upd-dropdown');
    liveConflictCheck();
}

function selectupdOption(value) {
    selectGenericOption('f-upd', 'upd-dropdown', 'err-upd', value);
    liveConflictCheck();
}

function hideupdDropdown() {
    const dropdown = document.getElementById('upd-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
        resetDropdownOptions('upd-dropdown');
    }
}

function handleupdKeydown(e) {
    if (updInputMode !== 'dropdown') return;
    handleGenericKeydown(e, 'upd-dropdown', 'f-upd', 'err-upd');
}

// ============================================================
// PLATFORM COMBOBOX
// ============================================================
function showPlatformDropdown() {
    const dropdown = document.getElementById('platform-dropdown');
    if (!dropdown) return;
    resetDropdownOptions('platform-dropdown');
    dropdown.classList.remove('hidden');
}

function filterPlatformDropdown() {
    filterGenericDropdown('f-platform', 'platform-dropdown');
}

function selectPlatformOption(value) {
    selectGenericOption(
        'f-platform', 'platform-dropdown', 'err-platform', value
    );
    liveConflictCheck();
}

function hidePlatformDropdown() {
    const dropdown = document.getElementById('platform-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
        resetDropdownOptions('platform-dropdown');
    }
}

function handlePlatformKeydown(e) {
    handleGenericKeydown(
        e, 'platform-dropdown', 'f-platform', 'err-platform'
    );
}

// ============================================================
// GENERIC COMBOBOX HELPERS
// ============================================================
function filterGenericDropdown(inputId, dropdownId) {
    const input    = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const query   = input.value.toLowerCase().trim();
    const options = dropdown.querySelectorAll('.combo-option');

    dropdown.classList.remove('hidden');

    const old = dropdown.querySelector('.combo-no-result');
    if (old) old.remove();

    let visibleCount = 0;
    options.forEach(opt => {
        const match = opt.dataset.value
            .toLowerCase()
            .includes(query);
        opt.classList.toggle('hidden-opt', !match);
        if (match) visibleCount++;
    });

    if (visibleCount === 0 && query.length > 0) {
        const hint       = document.createElement('div');
        hint.className   = 'combo-no-result';
        hint.textContent = `No match for: "${input.value}"`;
        dropdown.appendChild(hint);
    }
}

function selectGenericOption(inputId, dropdownId, errId, value) {
    const input = document.getElementById(inputId);
    const err   = document.getElementById(errId);
    if (!input) return;

    input.value = value;
    resetDropdownOptions(dropdownId);
    document.getElementById(dropdownId)
        ?.classList.add('hidden');

    input.classList.remove('error', 'clash-field');
    if (err) {
        err.textContent = '';
        err.classList.remove('show');
    }
}

function resetDropdownOptions(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    dropdown.querySelectorAll('.combo-option')
        .forEach(opt =>
            opt.classList.remove('hidden-opt', 'highlighted')
        );
    dropdown.querySelector('.combo-no-result')?.remove();
}

function handleGenericKeydown(e, dropdownId, inputId, errId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown || dropdown.classList.contains('hidden')) return;

    const visible = [
        ...dropdown.querySelectorAll(
            '.combo-option:not(.hidden-opt)'
        )
    ];
    if (!visible.length) return;

    const highlighted = dropdown.querySelector(
        '.combo-option.highlighted'
    );
    let idx = visible.indexOf(highlighted);

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            highlighted?.classList.remove('highlighted');
            idx = (idx + 1) % visible.length;
            visible[idx].classList.add('highlighted');
            visible[idx].scrollIntoView({ block: 'nearest' });
            break;

        case 'ArrowUp':
            e.preventDefault();
            highlighted?.classList.remove('highlighted');
            idx = (idx - 1 + visible.length) % visible.length;
            visible[idx].classList.add('highlighted');
            visible[idx].scrollIntoView({ block: 'nearest' });
            break;

        case 'Enter':
            e.preventDefault();
            if (highlighted) {
                selectGenericOption(
                    inputId, dropdownId,
                    errId, highlighted.dataset.value
                );
            } else {
                document.getElementById(dropdownId)
                    ?.classList.add('hidden');
            }
            break;

        case 'Escape':
            document.getElementById(dropdownId)
                ?.classList.add('hidden');
            break;
    }
}

// ✅ Close ALL dropdowns on outside click
function handleOutsideClick(e) {
    const map = [
        {
            wrapper : 'equipment-combo-wrapper',
            hide    : hideEquipmentDropdown
        },
        {
            wrapper : 'upd-combo-wrapper',
            hide    : hideupdDropdown
        },
        {
            wrapper : 'platform-combo-wrapper',
            hide    : hidePlatformDropdown
        },
    ];
    map.forEach(({ wrapper, hide }) => {
        const el = document.getElementById(wrapper);
        if (el && !el.contains(e.target)) hide();
    });
}

function isPjmCutoffBlocked(startDateStr) {
    console.log("🔍 isPjmCutoffBlocked called with:", startDateStr);
    console.log("🔍 currentUser:", window.currentUser?.role);

    // ── Only applies to pjm role ───────────────────────────
    if (!window.currentUser || window.currentUser.role !== "pjm") {
        console.log("🔍 Not PJM role — returning false");
        return false;
    }

    // ── Get today ──────────────────────────────────────────
    const now       = new Date();
    const dayOfWeek = now.getDay();
    // 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    console.log("🔍 Today:", now.toDateString(),
        "dayOfWeek:", dayOfWeek,
        "(0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat)");

    // ── Only block on Friday (5) or Saturday (6) ──────────
    if (dayOfWeek !== 5 && dayOfWeek !== 6) {
        console.log("🔍 Not Friday/Saturday — no cutoff");
        return false;
    }

    // ── Get Monday of current week ─────────────────────────
    // dayOfWeek: Fri=5 → diff=-4 to get Monday
    //            Sat=6 → diff=-5 to get Monday
    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        0, 0, 0, 0
    );

    // ✅ Correct Monday calculation
    // JS getDay(): Sun=0,Mon=1,Tue=2,Wed=3,Thu=4,Fri=5,Sat=6
    // To get Monday: subtract (dayOfWeek - 1) days
    // Fri(5) - 1 = 4 days back = Monday ✅
    // Sat(6) - 1 = 5 days back = Monday ✅
    const daysFromMonday = dayOfWeek - 1;
    const currentMonday  = new Date(today);
    currentMonday.setDate(today.getDate() - daysFromMonday);

    // ── Get Thursday of current week ───────────────────────
    // Monday + 3 = Thursday
    // PJM can book Mon-Thu freely
    // On Friday, Mon-Thu of THIS week are locked
    const currentThursday = new Date(currentMonday);
    currentThursday.setDate(currentMonday.getDate() + 3);

    console.log("🔍 Current week Monday   :", currentMonday.toDateString());
    console.log("🔍 Current week Thursday :", currentThursday.toDateString());

    // ── Parse booking start date ───────────────────────────
    if (!startDateStr) {
        console.log("🔍 No startDateStr — returning false");
        return false;
    }

    const parts = String(startDateStr).split("-");
    if (parts.length !== 3) {
        console.log("🔍 Invalid date format:", startDateStr);
        return false;
    }

    const bookingDate = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
        0, 0, 0, 0
    );

    // ── Block if booking falls Mon–Thu of current week ─────
    const isBlocked = bookingDate >= currentMonday
                   && bookingDate <= currentThursday;

    console.log("🔍 Booking date    :", bookingDate.toDateString());
    console.log("🔍 Block range     :", currentMonday.toDateString(),
        "→", currentThursday.toDateString());
    console.log("🔍 Is blocked?     :", isBlocked);

    return isBlocked;
}
function showPjmCutoffWarning() {
    const box  = document.getElementById("live-conflict-box");
    const list = document.getElementById("live-conflict-list");
    if (!box || !list) return;
    list.innerHTML = `
        <div class="live-conflict-item" style="color:#b45309;">
            ⛔ <strong>Friday Cutoff:</strong>
            You cannot book, edit, or delete bookings for the
            <strong>current week</strong> on or after Friday.
            Please select a date from <strong>next week onwards</strong>.
        </div>
    `;
    box.classList.remove("hidden");
}
// ============================================================
// ✅ LOAD BOOKINGS FROM SUPABASE
// ============================================================
async function loadBookingsFromSupabase() {
  try {
    const { data, error } = await _supabase
      .from("booking")
      .select("*")
      .order("start_date", { ascending: true });

    if (error) throw error;

    // ✅ hard guard
    const rows = Array.isArray(data) ? data : [];
    console.log("raw booking data:", rows);

    projects = rows.map((row, i) => buildProjectObject(row, i));

    console.log(`✅ Loaded ${projects.length} bookings`);
    refreshAll();
  } catch (err) {
    console.error("❌ loadBookingsFromSupabase:", err.message);
    showToast("error", "Load Error", err.message);
    projects = [];        // ✅ prevent UI from breaking
    refreshAll();
  }
}
// ============================================================
// DETECT CLASHES
// ============================================================
function detectClashes(equipment, upd, startDt, endDt, excludeId = null) {
    const clashes = [];

    projects.forEach(p => {
        // Skip the project being edited
        if (p.id === excludeId) return;

        // Check if time overlaps
        if (!(startDt < p.endDt && endDt > p.startDt)) return;

        // Equipment clash
        if (p.equipment === equipment) {
            clashes.push({
                type     : "Equipment",
                resource : equipment,
                clashWith: p
            });
        }

        // upd clash
        if (p.upd === upd) {
            clashes.push({
                type     : "upd",
                resource : upd,
                clashWith: p
            });
        }
    });

    return clashes;
}
// ============================================================
// ✅ UPDATED getFormData
// ============================================================
function getFormData() {
    const v = id =>
        document.getElementById(id)?.value.trim() ?? '';
    const startDate = v('f-start-date');
    const startTime = v('f-start-time');
    const endDate   = v('f-end-date');
    const endTime   = v('f-end-time');
    return {
        pjm_name     : v('f-pjm_name'),      
        proj_title   : v('f-proj_title'),     
        equipment    : v('f-equipment'),      
        upd          : v('f-upd'),            
        platform     : v('f-platform'),       
        start_date   : startDate,             
        start_time   : startTime,             
        end_date     : endDate,               
        end_time     : endTime,               
        startDt      : new Date(`${startDate}T${startTime}`),
        endDt        : new Date(`${endDate}T${endTime}`),
        quantity     : v('f-quantity'),      
        no_lot       : v('f-no_lot'),         
        special_inst : v('f-special_inst'),   
        color        : colorFromTitle(v('f-proj_title')),
    };
}

// ============================================================
// validateForm
// ============================================================
function validateForm() {
    let valid = true;

    const fields = [
        {
            id  : 'f-pjm_name',
            err : 'err-pjm_name',
            msg : 'PJM Number is required'
        },
        {
            id  : 'f-proj_title',
            err : 'err-proj_title',
            msg : 'Project Title is required'
        },
        {
            id  : 'f-equipment',
            err : 'err-equipment',
            msg : 'Equipment is required'
        },
        {
            id  : 'f-upd',
            err : 'err-upd',
            msg : 'UPD is required'   
        },
        {
            id  : 'f-platform',
            err : 'err-platform',
            msg : 'Platform is required'
        },
        {
            id  : 'f-start-date',
            err : 'err-start',
            msg : 'Start date is required'
        },
        {
            id  : 'f-end-date',
            err : 'err-end',
            msg : 'End date is required'
        },
        {
            id  : 'f-quantity',
            err : 'err-quantity',
            msg : 'Quantity is required'
        },
        {
            id  : 'f-no_lot',
            err : 'err-no_lot',
            msg : 'No of Lot is required'
        },
    ];

    fields.forEach(f => {
        const el  = document.getElementById(f.id);
        const err = document.getElementById(f.err);
        if (!el || !err) return;

        if (!el.value.trim()) {
            el.classList.add('error');
            err.textContent = f.msg;
            err.classList.add('show');
            valid = false;
        } else {
            el.classList.remove('error');
            err.textContent = '';
            err.classList.remove('show');
        }
    });

    return valid;
}

// ============================================================
// SHOW CLASH MODAL
// ============================================================
function showClashModal(clashes, data) {
    const content = document.getElementById("clash-modal-content");
    const modal   = document.getElementById("clash-modal");
    if (!content || !modal) return;

    content.innerHTML = "";

    clashes.forEach(c => {
        const item = document.createElement("div");
        item.className = "clash-item";
        item.innerHTML = `
            <div class="clash-type">
                ${c.type === "Equipment"
                    ? "⚙️ Equipment Clash"
                    : "👤 upd Clash"}
            </div>
            <div class="clash-detail">
                <strong>${c.resource}</strong>
                is already booked for
                <strong>${c.clashWith.pjm}</strong>
                — ${c.clashWith.title}
            </div>
            <div class="clash-time">
                ${c.clashWith.startDate} ${c.clashWith.startTime}
                → 
                ${c.clashWith.endDate} ${c.clashWith.endTime}
            </div>
        `;
        content.appendChild(item);
    });

    modal.classList.add("active");
}

// ============================================================
// RESET FORM
// ============================================================
function resetForm() {
    const form = document.getElementById("project-form");
    if (form) form.reset();

    // Clear combobox inputs
    ["f-equipment", "f-upd", "f-platform"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    // Clear error messages
    document.querySelectorAll(".error-msg")
        .forEach(el => {
            el.textContent = "";
            el.classList.remove("show");
        });

    // Clear clash highlights
    document.querySelectorAll(".clash-field, .error")
        .forEach(el => {
            el.classList.remove("clash-field", "error");
        });

    // Hide conflict box
    document.getElementById("live-conflict-box")
        ?.classList.add("hidden");

    // Reset save button
    editingId = null;
    enableSaveButton();

    // Reset equipment mode
    setEquipmentInputMode("dropdown");

    // Reset dates
    setDefaultDates();

    console.log("✅ Form reset");
}

// ============================================================
// CLEAR FORM (called by Clear button)
// ============================================================
function clearForm() {
    // ── Reset all form inputs ─────────────────────────────
    document.getElementById("f-proj_title").value  = "";
    document.getElementById("f-platform").value    = "";
    document.getElementById("f-equipment").value   = "";
    document.getElementById("f-upd").value         = "";
    document.getElementById("f-start-date").value  = "";
    document.getElementById("f-end-date").value    = "";
    document.getElementById("f-quantity").value    = "";
    document.getElementById("f-no_lot").value      = "";
    document.getElementById("f-special_inst").value = "";

    // Reset time selects to first option
    const startTime = document.getElementById("f-start-time");
    const endTime   = document.getElementById("f-end-time");
    if (startTime) startTime.selectedIndex = 0;
    if (endTime)   endTime.selectedIndex   = 0;

    // Clear error messages
    document.querySelectorAll(".error-msg").forEach(el => el.textContent = "");

    // Clear clash highlight classes
    document.querySelectorAll(".clash-field")
            .forEach(el => el.classList.remove("clash-field"));

    // Hide live conflict box
    hideLiveConflict();

    // ✅ DO NOT clear lastSavedData — Reuse Last must still work
    // ✅ DO NOT disable reuse-btn — snapshot is still valid
}

// ============================================================
// ✅ SAVE PROJECT → SUPABASE
// ============================================================
function saveProject() {
    enableSaveButton();
    /* ── PJM Friday cutoff check ── */
    console.log("🔍 cutoff check result:", 
        isPjmCutoffBlocked(
            document.getElementById('f-start-date')?.value
        )
    );
    const startDateStr = document.getElementById('f-start-date')?.value || '';
    if (isPjmCutoffBlocked(startDateStr)) {
        showToast('error', 'Locked',
            '⛔ Current-week bookings are locked on Friday. Please book from next week.');
        showPjmCutoffWarning();
        document.getElementById('f-start-date')?.classList.add('clash-field');
        return;
    }
    if (!validateForm()) {
        showToast('error', 'Validation Error',
            'Please fill all required fields');
        return;
    }
    const data = getFormData();
    // Date order
    if (data.startDt >= data.endDt) {
        const el  = document.getElementById('f-end-date');
        const err = document.getElementById('err-end');
        if (el)  el.classList.add('error');
        if (err) {
            err.textContent = 'End must be after start';
            err.classList.add('show');
        }
        showToast('error', 'Date Error',
            'End must be after start');
        return;
    }
    // Clash check
    const clashes = detectClashes(
        data.equipment, data.upd,
        data.startDt,   data.endDt,
        editingId
    );
    if (clashes.length > 0) {
        showClashModal(clashes, data);
        disableSaveButton();
        document.getElementById('live-conflict-box')
            ?.classList.remove('hidden');
        showToast('error', 'Save Blocked',
            `${clashes.length} clash(es) detected`);
        return;
    }

    // ✅ Snapshot form data for "Reuse Last" BEFORE committing
    snapshotLastSaved({
        pjm_name     : document.getElementById('f-pjm_name')?.value.trim()      || '',
        proj_title   : document.getElementById('f-proj_title')?.value.trim()    || '',
        platform     : document.getElementById('f-platform')?.value.trim()      || '',
        equipment    : document.getElementById('f-equipment')?.value.trim()     || '',
        upd          : document.getElementById('f-upd')?.value.trim()           || '',
        start_date   : document.getElementById('f-start-date')?.value           || '',
        start_time   : document.getElementById('f-start-time')?.value           || '',
        end_date     : document.getElementById('f-end-date')?.value             || '',
        end_time     : document.getElementById('f-end-time')?.value             || '',
        quantity     : document.getElementById('f-quantity')?.value             || '',
        no_lot       : document.getElementById('f-no_lot')?.value               || '',
        special_inst : document.getElementById('f-special_inst')?.value.trim()  || '',
    });

    commitSaveToSupabase(data);
}

// ============================================================
// ✅ COMMIT SAVE TO SUPABASE
// ============================================================
async function commitSaveToSupabase(data) {
    const stored      = sessionStorage.getItem('pjm_user');
    const sessionUser = stored ? JSON.parse(stored) : null;

    const row = {
        pjm_name     : data.pjm_name,
        proj_title   : data.proj_title,
        equipment    : data.equipment,
        upd          : data.upd,
        platform     : data.platform,
        start_date   : data.start_date,
        start_time   : data.start_time,
        end_date     : data.end_date,
        end_time     : data.end_time,
        quantity     : data.quantity ? parseInt(data.quantity) : null, // ✅
        no_lot       : data.no_lot   ? parseInt(data.no_lot)   : null, // ✅
            special_inst : data.special_inst || null,
    };

    try {
        let savedRow;

        if (editingId) {
            // UPDATE
            const { data: updated, error } = await _supabase
                .from('booking')
                .update(row)
                .eq('id', editingId)
                .select()
                .single();

            if (error) throw error;
            savedRow = updated;

            const idx = projects.findIndex(
                p => p.id === editingId
            );
            if (idx !== -1) {
                projects[idx] = buildProjectObject(
                    savedRow, idx
                );
            }

            showToast('success', 'Updated',
                `"${data.title}" updated`);

        } else {
            // INSERT
            row.created_at = new Date().toISOString();

            const { data: inserted, error } = await _supabase
                .from('booking')
                .insert(row)
                .select()
                .single();

            if (error) throw error;
            savedRow = inserted;

            projects.push(
                buildProjectObject(savedRow, projects.length)
            );

            showToast('success', 'Saved',
                `"${data.proj_title}" saved`);
        }

        editingId = null;
        resetForm();
        refreshAll();
        fetchPJMFromSupabase();


        console.log('✅ Saved to Supabase:', savedRow);

    } catch (err) {
        console.error('❌ commitSaveToSupabase:', err.message);
        showToast('error', 'Save Failed',
            'Could not save: ' + err.message);
    }
}
function setComboValue(inputId, value) {
    if (!value) return;

    const input = document.getElementById(inputId);
    if (!input) return;

    // Set the visible text
    input.value = value;

    // Fire 'input' so any internal filter/search logic updates
    input.dispatchEvent(new Event("input", { bubbles: true }));

    // Fire 'change' so any change-listeners update dependent state
    input.dispatchEvent(new Event("change", { bubbles: true }));
}
function snapshotLastSaved(record) {
    // Deep-copy so later mutations don't corrupt the snapshot
    lastSavedData = JSON.parse(JSON.stringify(record));

    // Also persist to localStorage so it survives page refresh
    try {
        localStorage.setItem("pjm_last_saved", JSON.stringify(lastSavedData));
    } catch (e) {
        console.warn("snapshotLastSaved: localStorage write failed", e);
    }

    // Enable the Reuse Last button
    const reuseBtn = document.getElementById("reuse-btn");
    if (reuseBtn) reuseBtn.disabled = false;

    console.log("Snapshot saved →", lastSavedData);
}

function reuseLastData() {
    /* ── 1. Try memory first, then localStorage ─────────── */
    if (!lastSavedData) {
        try {
            const stored = localStorage.getItem("pjm_last_saved");
            if (stored) lastSavedData = JSON.parse(stored);
        } catch (e) {
            console.warn("reuseLastData: localStorage read failed →", e);
        }
    }

    if (!lastSavedData) {
        showToast('warning', 'No Data', '⚠️ No previous data found to reuse.');
        return;
    }

    /* ── 2. Clear the form first ─────────────────────────── */
    clearForm();

    /* ── 3. PJM Name (readonly — set value directly) ─────── */
    const pjmEl = document.getElementById('f-pjm_name');
    if (pjmEl) pjmEl.value = lastSavedData.pjm_name || '';

    /* ── 4. Project Title ────────────────────────────────── */
    const titleEl = document.getElementById('f-proj_title');
    if (titleEl) titleEl.value = lastSavedData.proj_title || '';

    /* ── 5. Platform ─────────────────────────────────────── */
    if (lastSavedData.platform) {
        selectPlatformOption(lastSavedData.platform);
    }

    /* ── 6. Equipment — no equipmentList check, just set it ─ */
    const equipEl = document.getElementById('f-equipment');
    if (equipEl && lastSavedData.equipment) {
        // check if value exists in dropdown options
        const ddOpts = document.querySelectorAll(
            '#equipment-dropdown .combo-option'
        );
        const inDropdown = [...ddOpts]
            .some(opt => opt.dataset.value === lastSavedData.equipment);

        if (inDropdown) {
            setEquipmentInputMode('dropdown');
            selectEquipmentOption(lastSavedData.equipment);
        } else {
            setEquipmentInputMode('manual');
            equipEl.value = lastSavedData.equipment;
        }
    }

    /* ── 7. UPD / PIC — set via DOM options, not updList ─── */
    const updEl = document.getElementById('f-upd');
    if (updEl && lastSavedData.upd) {
        // try select via dropdown option click handler
        const ddOpts = document.querySelectorAll(
            '#upd-dropdown .combo-option'
        );
        const match = [...ddOpts]
            .find(opt => opt.dataset.value === lastSavedData.upd);

        if (match) {
            selectupdOption(lastSavedData.upd);
        } else {
            // fallback: set input value directly
            updEl.value = lastSavedData.upd;
        }
    }

    /* ── 8. Start date & time ────────────────────────────── */
    const startDateEl = document.getElementById('f-start-date');
    const startTimeEl = document.getElementById('f-start-time');
    if (startDateEl) startDateEl.value = lastSavedData.start_date || '';
    if (startTimeEl) startTimeEl.value = lastSavedData.start_time || '';

    /* ── 9. End date & time ──────────────────────────────── */
    const endDateEl = document.getElementById('f-end-date');
    const endTimeEl = document.getElementById('f-end-time');
    if (endDateEl) endDateEl.value = lastSavedData.end_date || '';
    if (endTimeEl) endTimeEl.value = lastSavedData.end_time || '';

    /* ── 10. Quantity ────────────────────────────────────── */
    const qtyEl = document.getElementById('f-quantity');
    if (qtyEl) qtyEl.value = lastSavedData.quantity ?? '';

    /* ── 11. No. of Lot ──────────────────────────────────── */
    const lotEl = document.getElementById('f-no_lot');
    if (lotEl) lotEl.value = lastSavedData.no_lot ?? '';

    /* ── 12. Special Instructions ────────────────────────── */
    const siEl = document.getElementById('f-special_inst');
    if (siEl) siEl.value = lastSavedData.special_inst || '';

    /* ── 13. Hide conflict box safely ────────────────────── */
    const conflictBox = document.getElementById('live-conflict-box');
    if (conflictBox) conflictBox.classList.add('hidden');

    /* ── 14. Re-enable reuse button ──────────────────────── */
    const btn = document.getElementById('reuse-btn');
    if (btn) btn.disabled = false;

    /* ── 15. Focus title field ───────────────────────────── */
    if (titleEl) titleEl.focus();

    showToast('success', 'Reuse Applied',
        '♻️ Previous data loaded successfully.');
    console.log("♻️ Reuse applied →", lastSavedData);
}

// ============================================================
// DELETE FROM SUPABASE
// ============================================================
async function deleteProject(id) {
    /* ── find project ── */
    const p = projects.find(function(proj) {
        return proj.id === id;
    });
    if (!p) {
        showToast('error', 'Error', 'Project not found');
        return;
    }
    /* ── ownership check (inline) ── */
    const isCoordinator = window.currentUser?.role === "sample coordinator";
    const isOwner       = String(p.pjm_name).toLowerCase().trim() ===
                          String(window.currentUser?.name).toLowerCase().trim();
    if (!isCoordinator && !isOwner) {
        showToast('error', 'Access Denied',
            '❌ You can only delete your own projects');
        return;
    }
    /* ── PJM Friday cutoff check ── */
    if (isPjmCutoffBlocked(p.start_date)) {
        showToast('error', 'Locked',
            '⛔ You cannot delete current-week bookings on or after Friday.');
        closeModal('detail-modal');
        return;
    }
    if (!confirm(`Delete "${p.proj_title}"?`)) return;
    try {
        const { error } = await _supabase
            .from('booking')
            .delete()
            .eq('id', id);
        if (error) throw error;
        projects = projects.filter(p => p.id !== id);
        refreshAll();
        showToast('success', 'Deleted',
            `"${p.proj_title}" deleted`);
    } catch (err) {
        console.error('❌ deleteProject:', err.message);
        showToast('error', 'Delete Failed',
            'Could not delete: ' + err.message);
    }
}

// ============================================================
// ✅ MAP SUPABASE ROW → LOCAL PROJECT OBJECT
// ============================================================
function buildProjectObject(row, index) {
  const start_date = row.start_date ?? "";
  const start_time = (row.start_time ?? "00:00").slice(0, 5); // ✅ HH:MM
  const end_date   = row.end_date ?? "";
  const end_time   = (row.end_time ?? "00:00").slice(0, 5);

  const startDt = (start_date && start_time) ? new Date(`${start_date}T${start_time}`) : null;
  const endDt   = (end_date && end_time)     ? new Date(`${end_date}T${end_time}`)     : null;

  return {
    id           : row.id,
    pjm_name     : row.pjm_name ?? "",
    proj_title   : row.proj_title ?? "",
    equipment    : row.equipment ?? "",
    upd          : row.upd ?? "",
    platform     : row.platform ?? "",
    start_date,
    start_time,
    end_date,
    end_time,
    startDt,
    endDt,
    quantity     : row.quantity ?? 0,
    no_lot       : row.no_lot ?? "",
    special_inst : row.special_inst ?? "",
    color        : colorFromTitle(row.proj_title),
    rowNum       : rowCounter++
  };
}

// =============================================
// CLEAR FORM
// =============================================
function clearForm() {
    const form = document.getElementById('project-form');
    if (form) form.reset();

    setDefaultDates();

    const st = document.getElementById('f-start-time');
    const et = document.getElementById('f-end-time');
    if (st) st.value = '08:00';
    if (et) et.value = '17:00';

    // Explicitly blank the free-text fields
    const equipEl = document.getElementById('f-equipment');
    const updEl   = document.getElementById('f-upd');
    if (equipEl) equipEl.value = '';
    if (updEl)   updEl.value   = '';

    hideEquipmentDropdown();

    // Reset equipment mode to dropdown
    setEquipmentInputMode('dropdown');

    editingId = null;

    const box = document.getElementById('live-conflict-box');
    if (box) {
        box.classList.add('hidden');
        const list = document.getElementById('live-conflict-list');
        if (list) list.innerHTML = '';
    }

    document.querySelectorAll('.form-input, .form-select')
        .forEach(el =>
            el.classList.remove('error', 'clash-field')
        );
    document.querySelectorAll('.error-msg')
        .forEach(el => {
            el.textContent = '';
            el.classList.remove('show');
        });

    enableSaveButton();
}

// =============================================
// CLASH BLOCK MODAL
// =============================================
function showClashModal(clashes, newData) {
    const container =
        document.getElementById('clash-modal-content');
    if (!container) return;
    container.innerHTML = '';

    const fmtDt = (d, t) =>
        new Date(`${d}T${t}`)
            .toLocaleDateString('en-GB', {
                weekday : 'short',
                day     : '2-digit',
                month   : 'short'
            }) + ' ' + t;

    clashes.forEach(c => {
        const card     = document.createElement('div');
        card.className = 'clash-card';
        card.innerHTML = `
            <div class="clash-card-header">
                <span class="clash-type-badge
                    ${c.type === 'Equipment'
                        ? 'type-equipment'
                        : 'type-upd'}">
                    ${c.type === 'Equipment'
                        ? '&#128295; Equipment Clash'
                        : '&#128100; upd Clash'}
                </span>
                <span class="clash-resource">
                    ${c.resource}
                </span>
            </div>
            <div class="clash-projects">
                <div class="clash-proj"
                    style="background:#eef4fb;
                           border:1px solid #bfcfdf">
                    <div class="clash-proj-pjm"
                        style="color:#1e3a5f">
                        ${newData.pjm}
                        <span class="new-project-badge">NEW</span>
                    </div>
                    <div class="clash-proj-title">
                        ${newData.title}
                    </div>
                    <div class="clash-proj-time">
                        &#9654; ${fmtDt(
                            newData.startDate,
                            newData.startTime
                        )}
                    </div>
                    <div class="clash-proj-time">
                        &#9632; ${fmtDt(
                            newData.endDate,
                            newData.endTime
                        )}
                    </div>
                </div>
                <div class="clash-vs">&#9889;<br>CLASH</div>
                <div class="clash-proj"
                    style="background:${c.clashWith.color}18;
                           border:1px solid
                               ${c.clashWith.color}55">
                    <div class="clash-proj-pjm"
                        style="color:${c.clashWith.color}">
                        ${c.clashWith.pjm}
                    </div>
                    <div class="clash-proj-title">
                        ${c.clashWith.title}
                    </div>
                    <div class="clash-proj-time">
                        &#9654; ${fmtDt(
                            c.clashWith.startDate,
                            c.clashWith.startTime
                        )}
                    </div>
                    <div class="clash-proj-time">
                        &#9632; ${fmtDt(
                            c.clashWith.endDate,
                            c.clashWith.endTime
                        )}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    const modal = document.getElementById('clash-modal');
    if (modal) modal.classList.add('show');
}

// =============================================
// CALENDAR
// =============================================
function getWeekStart(date) {
    const d   = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    d.setHours(0, 0, 0, 0);
    return d;
}

function prevWeek() {
    currentWeekStart = new Date(
        currentWeekStart.getTime() - 7 * 86400000
    );
    renderCalendar();
}

function nextWeek() {
    currentWeekStart = new Date(
        currentWeekStart.getTime() + 7 * 86400000
    );
    renderCalendar();
}

function goToToday() {
    currentWeekStart = getWeekStart(new Date());
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const days = [
        'Monday','Tuesday','Wednesday',
        'Thursday','Friday','Saturday','Sunday'
    ];
    const hours = [];
    for (let h = CAL_START; h <= CAL_END; h++)
        hours.push(h);

    const weekEnd = new Date(
        currentWeekStart.getTime() + 6 * 86400000
    );
    const fmt = d =>
        d.toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short'
        });

const wl = document.getElementById('week-label');
if (wl) {
    const weekNum = getWeekNumber(currentWeekStart);
    wl.textContent =
        `Week ${weekNum}  ·  ${fmt(currentWeekStart)} - ` +
        `${fmt(weekEnd)} ${weekEnd.getFullYear()}`;
}

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Corner
    const corner     = document.createElement('div');
    corner.className = 'cal-header-cell time-header';
    grid.appendChild(corner);

    // Day headers
    const dayDates = [];
    days.forEach((day, i) => {
        const dayDate = new Date(
            currentWeekStart.getTime() + i * 86400000
        );
        dayDates.push(dayDate);
        const isToday = dayDate.getTime() === today.getTime();
        const cell     = document.createElement('div');
        cell.className =
            'cal-header-cell' +
            (isToday ? ' today-header' : '');
        cell.innerHTML = `
            <div class="cal-day-name">
                ${day.substring(0, 3)}
            </div>
            <div class="cal-day-date
                ${isToday ? ' today-date' : ''}">
                ${dayDate.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short'
                })}
            </div>
            ${isToday
                ? '<span class="today-badge">TODAY</span>'
                : ''}
        `;
        grid.appendChild(cell);
    });

    // Hour rows
    hours.forEach(hour => {
        const isMidnight = (hour === 0);
        const tc     = document.createElement('div');
        tc.className =
            'cal-time-cell' + (isMidnight ? ' midnight' : '');
        tc.innerHTML = `
            <span class="cal-time-label">
                ${String(hour).padStart(2,'0')}:00
            </span>
        `;
        grid.appendChild(tc);

        days.forEach((_, i) => {
            const isToday =
                dayDates[i].getTime() === today.getTime();
            const isAlt = hour % 2 === 1;
            const cell     = document.createElement('div');
            cell.className = [
                'cal-day-cell',
                isToday    ? 'today-col' : '',
                isAlt      ? 'alt-row'   : '',
                isMidnight ? 'midnight'  : '',
            ].filter(Boolean).join(' ');
            cell.style.height = SLOT_H + 'px';
            cell.dataset.day  = i;
            cell.dataset.hour = hour;
            grid.appendChild(cell);
        });
    });

    placeProjectBlocks(dayDates, hours);
    updateCurrentTimeLine();
    renderCalendarLegend();
}
// ── Week number helper ────────────────────────────────────
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}


// =============================================
// PLACE PROJECT BLOCKS
// =============================================
function placeProjectBlocks(dayDates, hours) {
  const startHour = hours[0];
  const endHour   = hours[hours.length - 1] + 1;
  dayDates.forEach((dayDate, dayIdx) => {
    const dayStart = new Date(dayDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dayProjects = projects.filter(p =>
      p.startDt instanceof Date && !isNaN(p.startDt) &&
      p.endDt   instanceof Date && !isNaN(p.endDt) &&
      p.startDt < dayEnd && p.endDt > dayStart
    );
    if (!dayProjects.length) return;
    const columns = assignColumns(dayProjects);
    dayProjects.forEach(project => {
      const segStart = project.startDt < dayStart ? dayStart : project.startDt;
      const segEnd   = project.endDt   > dayEnd   ? dayEnd   : project.endDt;
      const startH = segStart.getHours() + segStart.getMinutes() / 60;
      const endH   = segEnd.getHours()   + segEnd.getMinutes() / 60;
      const visStart = Math.max(startH, startHour);
      const visEnd   = Math.min(endH, endHour);
      if (visStart >= visEnd) return;
      const heightPx = Math.max((visEnd - visStart) * SLOT_H - 2, 16);
      const { col, totalCols } = columns[project.id] || { col: 0, totalCols: 1 };
      const widthPct = 100 / totalCols;
      const leftPct  = col * widthPct;
      const durationH = Math.round(((segEnd - segStart) / 3600000) * 10) / 10;
      const pjmName   = project.pjm_name   ?? '';
      const title     = project.proj_title ?? '';
      const equipment = project.equipment  ?? '';
      const upd       = project.upd        ?? '';
      const block = document.createElement('div');
      block.className = 'project-block';
      block.style.cssText = `
        height     : ${heightPx}px;
        left       : calc(${leftPct}% + 2px);
        width      : calc(${widthPct}% - 4px);
        background : linear-gradient(
          160deg,
          ${project.color}ee,
          ${darkenColor(project.color)}cc
        );
      `;
      const c = project.color || 'hsl(210 10% 55%)';

        block.style.setProperty('--c', c);
        block.style.setProperty('--c-dark',  `color-mix(in srgb, ${c} 70%, black)`);
        block.style.setProperty('--c-light', `color-mix(in srgb, ${c} 100%, white)`);

      block.innerHTML = `
        <div class="project-block-header"
             style="background:${darkenColor(project.color)}">
          ${pjmName}
        </div>
        <div class="project-block-body">
          ${heightPx > 36 ? `<div class="project-block-title">
              ${truncate(title, 18)}
            </div>` : ''}
          ${heightPx > 56 ? `<div class="project-block-detail">
              ${truncate((equipment.split(' - ')[0] || ''), 15)}
            </div>` : ''}
          ${heightPx > 76 ? `<div class="project-block-detail">
              ${(upd.split(' ')[0] || '')}
            </div>` : ''}
          ${heightPx > 96 ? `<div class="project-block-detail">
              ${durationH}h
            </div>` : ''}
        </div>
      `;
      block.addEventListener('click', () => showProjectDetail(project.id));
      const targetHour = Math.floor(visStart);
      const hostCell = document
        .getElementById('calendar-grid')
        ?.querySelector(
          `.cal-day-cell[data-day="${dayIdx}"][data-hour="${targetHour}"]`
        );
      if (!hostCell) return;
      block.style.top = (visStart - targetHour) * SLOT_H + 'px';
      hostCell.style.overflow = 'visible';
      hostCell.appendChild(block);
    });
  });
}
// =============================================
// COLUMN ASSIGNMENT
// =============================================
function assignColumns(dayProjects) {
    const columns = {};
    const sorted  =
        [...dayProjects].sort((a, b) => a.startDt - b.startDt);

    sorted.forEach(project => {
        const usedCols = sorted
            .filter(o =>
                o.id !== project.id &&
                project.startDt < o.endDt &&
                project.endDt   > o.startDt &&
                columns[o.id]   !== undefined
            )
            .map(o => columns[o.id].col);

        let col = 0;
        while (usedCols.includes(col)) col++;
        columns[project.id] = { col, totalCols: 1 };
    });

    sorted.forEach(project => {
        const overlapping = sorted.filter(o =>
            project.startDt < o.endDt &&
            project.endDt   > o.startDt
        );
        const maxCol = Math.max(
            ...overlapping.map(o => columns[o.id]?.col ?? 0)
        );
        overlapping.forEach(o => {
            if (columns[o.id])
                columns[o.id].totalCols = maxCol + 1;
        });
    });

    return columns;
}

// =============================================
// CURRENT TIME LINE
// =============================================
function updateCurrentTimeLine() {
    document.querySelectorAll('.current-time-line')
        .forEach(el => el.remove());

    const now     = new Date();
    const weekEnd = new Date(
        currentWeekStart.getTime() + 7 * 86400000
    );
    if (now < currentWeekStart || now >= weekEnd) return;

    const dayIdx =
        now.getDay() === 0 ? 6 : now.getDay() - 1;
    const currentHour =
        now.getHours() + now.getMinutes() / 60;
    const targetHour = Math.floor(currentHour);
    const posInHour  = (currentHour % 1) * SLOT_H;

    const cell = document
        .getElementById('calendar-grid')
        ?.querySelector(
            `.cal-day-cell[data-day="${dayIdx}"]` +
            `[data-hour="${targetHour}"]`
        );
    if (!cell) return;

    const line     = document.createElement('div');
    line.className = 'current-time-line';
    line.style.top = posInHour + 'px';
    line.innerHTML = '<div class="current-time-dot"></div>';
    cell.appendChild(line);
}

// =============================================
// CALENDAR LEGEND
// =============================================
function renderCalendarLegend() {
  const legend = document.getElementById('calendar-legend');
  if (!legend) return;

  legend.innerHTML = '';

  const seen = new Set();
  const unique = [];
  for (const p of projects) {
    const key = (p.proj_title ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
    if (unique.length === 5) break;
  }

  unique.forEach(p => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `
      <div class="legend-dot" style="background:${p.color}"></div>
      <span>${p.proj_title ?? ''}</span>
    `;
    legend.appendChild(item);
  });

  if (seen.size > 5) {
    const more = document.createElement('div');
    more.className = 'legend-item';
    more.innerHTML = `
      <span style="color:var(--text-dim)">
        +${seen.size - 5} more
      </span>
    `;
    legend.appendChild(more);
  }
}

// =============================================
// TABLE
// =============================================
function renderTable(data = null) {
    const tbody = document.getElementById('project-tbody');
    const empty = document.getElementById('empty-state');
    const list  = data ?? projects;
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!list || !list.length) {
        if (empty) empty.style.display = 'block';
        updateFilters();
        return;
    }
    if (empty) empty.style.display = 'none';

    const sorted = [...list].sort((a, b) => {
        let va = a[sortConfig.col] ?? '';
        let vb = b[sortConfig.col] ?? '';
        if (sortConfig.col === 'start') { va = a.startDt; vb = b.startDt; }
        if (sortConfig.col === 'end')   { va = a.endDt;   vb = b.endDt; }
        if (va < vb) return sortConfig.dir === 'asc' ? -1 : 1;
        if (va > vb) return sortConfig.dir === 'asc' ?  1 : -1;
        return 0;
    });

    const fmtDt = (d, t) => {
        if (!d || !t) return '';
        return new Date(`${d}T${t}`).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: '2-digit'
        }) + ' ' + t;
    };

    sorted.forEach(project => {
        /* ── ownership check per row ── */
        const isCoordinator = window.currentUser?.role ===
                              "sample coordinator";
        const isOwner       = String(project.pjm_name)
                              .toLowerCase().trim() ===
                              String(window.currentUser?.name)
                              .toLowerCase().trim();
        const canEdit       = isCoordinator || isOwner;

        const tr = document.createElement('tr');
        tr.dataset.id = project.id;
        tr.innerHTML = `
            <td class="checkbox-cell">
                <input type="checkbox"
                       data-id="${project.id}"
                       class="row-check"
                       ${canEdit ? '' : 'disabled'}>
            </td>
            <td style="color:var(--text-dim); font-size:11px">
                ${project.rowNum}
            </td>
            <td>
                <div style="display:flex;
                            align-items:center;
                            gap:6px">
                    <div class="color-dot"
                         style="background:${project.color}">
                    </div>
                    <strong>${project.pjm_name ?? ''}</strong>
                </div>
            </td>
            <td>${project.proj_title  ?? ''}</td>
            <td style="font-size:12px">${project.platform  ?? ''}</td>
            <td style="font-size:12px">${project.equipment ?? ''}</td>
            <td>${project.upd         ?? ''}</td>
            <td style="font-size:12px; white-space:nowrap">
                ${fmtDt(project.start_date, project.start_time)}
            </td>
            <td style="font-size:12px; white-space:nowrap">
                ${fmtDt(project.end_date, project.end_time)}
            </td>
            <td style="text-align:center">
                ${project.quantity ?? ''}
            </td>
            <td style="font-size:12px">
                ${project.no_lot ?? ''}
            </td>
            <td>
                <!-- View — everyone can see -->
                <button class="action-btn"
                        data-action="view"
                        data-tooltip="View">
                    &#128065;
                </button>

                ${canEdit
                    ? `<!-- Edit + Delete — owner or coordinator only -->
                       <button class="action-btn"
                               data-action="edit"
                               data-tooltip="Edit">
                           &#9998;
                       </button>
                       <button class="action-btn del"
                               data-action="delete"
                               data-tooltip="Delete">
                           &#128465;
                       </button>`
                    : `<!-- View only indicator -->
                       <button class="action-btn"
                               data-tooltip="View Only"
                               style="opacity:0.35;
                                      cursor:not-allowed;
                                      pointer-events:none"
                               disabled>
                           &#128274;
                       </button>`
                }
            </td>
        `;
        tbody.appendChild(tr);
    });

    updateFilters();
}

// =============================================
// SORT
// =============================================
function sortTable(col) {
    sortConfig.dir =
        sortConfig.col === col &&
        sortConfig.dir === 'asc'
        ? 'desc' : 'asc';
    sortConfig.col = col;

    document.querySelectorAll('.data-table th')
        .forEach(th =>
            th.classList.remove('sort-asc', 'sort-desc')
        );

    const th = document.querySelector(
        `.data-table th[data-col="${col}"]`
    );
    if (th) {
        th.classList.add(
            sortConfig.dir === 'asc' ? 'sort-asc' : 'sort-desc'
        );
    }

    renderTable();
}

// =============================================
// FILTER
// =============================================
function filterProjects() {
    const query =
        (document.getElementById('search-input')
            ?.value ?? '').toLowerCase().trim();
    const equip =
        document.getElementById('filter-equipment')
            ?.value ?? '';
    const upd   =
        document.getElementById('filter-upd')
            ?.value ?? '';
    const filtered = projects.filter(p => {
        // ── Search matches project title ONLY ──
        const titleMatch = !query ||
            (p.proj_title ?? '').toLowerCase().includes(query);

        return (
            titleMatch &&
            (!equip || p.equipment === equip) &&
            (!upd   || p.upd       === upd)
        );
    });
    renderTable(filtered);
}

function updateFilters() {
    const equipSel = document.getElementById('filter-equipment');
    const updSel   = document.getElementById('filter-upd');
    if (!equipSel || !updSel) return;

    const curEquip = equipSel.value;
    const curupd   = updSel.value;

    equipSel.innerHTML =
        '<option value="">All Equipment</option>' +
        [...new Set(projects.map(p => p.equipment))]
        .sort()
        .map(e =>
            `<option${e === curEquip
                ? ' selected' : ''}>${e}</option>`
        ).join('');

    updSel.innerHTML =
        '<option value="">All upd</option>' +
        [...new Set(projects.map(p => p.upd))]
        .sort()
        .map(p =>
            `<option${p === curupd
                ? ' selected' : ''}>${p}</option>`
        ).join('');
}

// =============================================
// SELECT ALL / BULK DELETE
// =============================================
function toggleSelectAll() {
    const checked =
        document.getElementById('select-all')?.checked ?? false;
    document
        .querySelectorAll('#project-tbody .row-check')
        .forEach(cb => { cb.checked = checked; });
    updateSelectedCount();
}

function updateSelectedCount() {
    const n = document.querySelectorAll(
        '#project-tbody .row-check:checked'
    ).length;
    const el = document.getElementById('selected-count');
    if (el) {
        el.textContent = n > 0 ? `${n} selected` : '';
    }
}

document.addEventListener('change', e => {
    if (e.target.classList.contains('row-check')) {
        updateSelectedCount();
    }
});

function deleteSelected() {
    if (window.currentUser?.role === "pjm") {
        const checkboxes = document.querySelectorAll(
            "#project-tbody .row-checkbox:checked"
        );
        const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
        const blockedCount = ids.filter(id => {
            const p = allProjects.find(x => x.id === id);
            return p && isPjmCutoffBlocked(p.start_date);
        }).length;

        if (blockedCount > 0) {
            showToast(
                `⛔ ${blockedCount} selected booking(s) are locked for the current week on Friday.`,
                "error", 5000
            );
            return;
        }
    }

    const selected = [
        ...document.querySelectorAll(
            '#project-tbody .row-check:checked'
        )
    ];
    if (!selected.length) {
        showToast('warning', 'No Selection',
            'Please select at least one project');
        return;
    }
    if (!confirm(
        `Delete ${selected.length} selected project(s)?`
    )) return;

    const ids = selected.map(cb => cb.dataset.id);
    projects  = projects.filter(p => !ids.includes(p.id));
    refreshAll();
    showToast('success', 'Deleted',
        `${ids.length} project(s) removed`);
}
function populateTimeSelects() {
    const timeSlots = [];
    
    // Generate times from 00:00 to 23:30 in 30-min intervals
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) {
            const hh  = String(h).padStart(2, '0');
            const mm  = String(m).padStart(2, '0');
            timeSlots.push(`${hh}:${mm}`);
        }
    }

    // ✅ Fill both start and end time selects
    ['f-start_time', 'f-end_time'].forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) {
            console.warn(`⚠️ Select not found: ${id}`);
            return;
        }
        // Clear existing options
        sel.innerHTML = '';

        // Add options
        timeSlots.forEach(t => {
            const opt   = document.createElement('option');
            opt.value   = t;
            opt.textContent = t;
            sel.appendChild(opt);
        });

        // ✅ Default start = 08:00, end = 17:00
        if (id === 'f-start_time') sel.value = '08:00';
        if (id === 'f-end_time')   sel.value = '17:00';

        console.log(`✅ ${id} populated with ${timeSlots.length} options`);
    });
}
// =============================================
// EDIT PROJECT
// =============================================
function editProject(id) {
    /* ── find project ── */
    const p = projects.find(function(proj) {
        return proj.id === id;
    });
    if (!p) {
        showToast('error', 'Error', 'Project not found');
        return;
    }
    /* ── ownership check (inline) ── */
    const isCoordinator = window.currentUser?.role === "sample coordinator";
    const isOwner       = String(p.pjm_name).toLowerCase().trim() ===
                          String(window.currentUser?.name).toLowerCase().trim();
    if (!isCoordinator && !isOwner) {
        showToast('error', 'Access Denied',
            '❌ You can only edit your own projects');
        return;
    }
    /* ── PJM Friday cutoff check ── */
    if (isPjmCutoffBlocked(p.start_date)) {
        showToast('error', 'Locked',
            '⛔ You cannot edit current-week bookings on or after Friday.');
        return;
    }
    /* ── proceed with edit ── */
    editingId = id;
    const set = (elId, val) => {
        const el = document.getElementById(elId);
        if (el) el.value = val ?? '';
    };
    set('f-pjm_name',     p.pjm_name);
    set('f-proj_title',   p.proj_title);
    set('f-platform',     p.platform);
    set('f-upd',          p.upd);
    set('f-start-date',   p.start_date);
    set('f-start-time',   p.start_time);
    set('f-end-date',     p.end_date);
    set('f-end-time',     p.end_time);
    set('f-quantity',     p.quantity);
    set('f-no_lot',       p.no_lot);
    set('f-special_inst', p.special_inst || '');
    const isKnown = EQUIPMENT_LIST.includes(p.equipment);
    setEquipmentInputMode(isKnown ? 'dropdown' : 'manual');
    set('f-equipment', p.equipment);
    document
        .querySelectorAll('.form-input, .form-select')
        .forEach(el => el.classList.remove('error', 'clash-field'));
    document
        .querySelectorAll('.error-msg')
        .forEach(el => {
            el.textContent = '';
            el.classList.remove('show');
        });
    const box = document.getElementById('live-conflict-box');
    if (box) {
        box.classList.add('hidden');
        const list = document.getElementById('live-conflict-list');
        if (list) list.innerHTML = '';
    }
    hideEquipmentDropdown();
    enableSaveButton();
    liveConflictCheck();
    closeModal('detail-modal');
    closeModal('clash-modal');
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.scrollTop = 0;
    showToast('info', 'Edit Mode',
        `Now editing: ${p.pjm_name} — ${p.proj_title}`);
}

// =============================================
// EXPORT CSV
// =============================================
function exportCSV() {
    if (!projects.length) {
        showToast('warning', 'No Data',
            'No projects to export');
        return;
    }

      const asExcelText = (v) => `="${String(v ?? '').replace(/"/g, '""')}"`;

    const headers = [
        'No', 'PJM Name', 'Project Title',
        'Equipment', 'upd',
        'Start Date', 'Start Time',
        'End Date',   'End Time',
        'Quantity', 'No. of Lot', 'special_inst'
    ];

    const rows = projects.map(p => [
        p.rowNum, p.pjm_name, p.proj_title,
        p.equipment, p.upd,
        asExcelText(p.start_date),
        asExcelText(p.start_time),
        asExcelText(p.end_date),
        asExcelText(p.end_time),
        p.quantity, p.no_lot, p.special_inst || ''
    ]);

    const csv = [headers, ...rows]
        .map(row =>
            row.map(v =>
                `"${String(v).replace(/"/g, '""')}"`
            ).join(',')
        ).join('\n');

    const blob   = new Blob(
        [csv], { type: 'text/csv;charset=utf-8;' }
    );
    const url    = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href     = url;
    anchor.download =
        `PJM_BuildPlan_` +
        `${new Date().toISOString().split('T')[0]}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);

    showToast('success', 'Exported', 'CSV downloaded');
}

// =============================================
// DETAIL MODAL
// =============================================
function showProjectDetail(id) {
  const pid = Number(id);
  const project = projects.find(p => Number(p.id) === pid);
  if (!project) return;
  const duration =
    (project.startDt instanceof Date && !isNaN(project.startDt) &&
     project.endDt   instanceof Date && !isNaN(project.endDt))
      ? Math.round(((project.endDt - project.startDt) / 3600000) * 10) / 10
      : 0;
  const fmtDt = (d, t) => {
    if (!d || !t) return '—';
    const dt = new Date(`${d}T${t}`);
    if (isNaN(dt)) return '—';
    return dt.toLocaleDateString('en-GB', {
      weekday:'short', day:'2-digit', month:'short', year:'numeric'
    }) + ' — ' + t;
  };
  const c = project.color || 'hsl(210 25% 70%)';
  const modal = document.getElementById('detail-modal');
  if (modal) {
    modal.style.setProperty('--c', c);
    modal.style.setProperty('--c-dark',  `color-mix(in srgb, ${c} 70%, black)`);
    modal.style.setProperty('--c-light', `color-mix(in srgb, ${c} 85%, white)`);
  }
  const header = document.getElementById('modal-header');
  if (header) header.style.background = '';
  const titleEl    = document.getElementById('modal-title');
  const subtitleEl = document.getElementById('modal-subtitle');
  if (titleEl)    titleEl.textContent    = project.pjm_name ?? '';
  if (subtitleEl) subtitleEl.textContent = project.proj_title ?? '';
  const body = document.getElementById('modal-body');
  if (body) {
    body.innerHTML = `
      <div class="detail-grid">
        ${[
          ['Equipment', project.equipment ?? '—'],
          ['Person in Charge', project.upd ?? '—'],
          ['Start', fmtDt(project.start_date, project.start_time)],
          ['End',   fmtDt(project.end_date, project.end_time)],
          ['Duration', `${duration} hours`],
          ['Quantity', project.quantity ?? '—'],
          ['No of lot', project.no_lot ?? '—'],
          ['Special instructions', project.special_inst || '&mdash;'],
        ].map(([label, value]) => `
          <div class="detail-row">
            <span class="detail-label">${label}</span>
            <span class="detail-value">${value}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
  const footer = document.getElementById('modal-footer');
  if (footer) {
    /* ── PJM Friday cutoff check ── */
    if (isPjmCutoffBlocked(project.start_date)) {
      footer.innerHTML = `
        <button class="btn btn-ghost"
                data-action="close-detail">
          Close
        </button>
        <span style="
          color       : #dc2626;
          font-weight : 600;
          font-size   : 12px;
          align-self  : center;
          margin-left : 8px;">
          🔒 Locked — cannot edit or delete current-week bookings on Friday
        </span>
      `;
    } else {
      footer.innerHTML = `
        <button class="btn btn-ghost" data-action="close-detail">Close</button>
        <button class="btn btn-ghost"
          data-action="edit-from-modal"
          data-id="${project.id}"
          style="color:#1e3a5f; border-color:#1e3a5f">
          &#9998; Edit
        </button>
        <button class="btn btn-danger"
          data-action="delete-from-modal"
          data-id="${project.id}">
          &#128465; Delete
        </button>
      `;
    }
  }
  if (modal) modal.classList.add('show');
}

// =============================================
// MODAL FOOTER / ACTION DELEGATION
// =============================================
document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id     = btn.dataset.id;

    switch (action) {
        case 'close-detail':
            closeModal('detail-modal');
            break;
        case 'edit-from-modal':
            if (id) editProject(Number(id));
            break;
        case 'delete-from-modal':
            if (id) deleteProject(Number(id));
            break;
    }
});

// =============================================
// MODAL HELPERS
// =============================================
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
}

document.querySelectorAll('.modal-overlay')
    .forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay)
                closeModal(overlay.id);
        });
    });

// =============================================
// TABS
// =============================================
function switchTab(name) {
    document.querySelectorAll('.tab-btn')
        .forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content')
        .forEach(c => c.classList.remove('active'));

    document.getElementById(`tab-${name}`)
        ?.classList.add('active');
    document.getElementById(`tab-content-${name}`)
        ?.classList.add('active');

    if (name === 'calendar') renderCalendar();
    if (name === 'list')     renderTable();
}

// =============================================
// STATS
// =============================================
function updateStats() {
    const now    = new Date();
    const wStart = getWeekStart(now);
    const wEnd   = new Date(wStart.getTime() + 7 * 86400000);

    const total = document.getElementById('stat-total');
    const week  = document.getElementById('stat-week');
    const equip = document.getElementById('stat-equipment');

    if (total)
        total.textContent = projects.length;
    if (week)
        week.textContent =
            projects.filter(
                p => p.startDt < wEnd &&
                     p.endDt   > wStart
            ).length;
    if (equip)
        equip.textContent =
            new Set(projects.map(p => p.equipment)).size;
}

function updateCurrentDate() {
    const el = document.getElementById('current-date');
    if (el) {
        el.textContent =
            new Date().toLocaleDateString('en-GB', {
                weekday : 'long',
                day     : '2-digit',
                month   : 'long',
                year    : 'numeric'
            });
    }
}

function refreshAll() {
    renderCalendar();
    renderTable();
    updateStats();
}


// =============================================
// TOAST
// =============================================
function showToast(type, title, message) {
    const icons = {
        success : '&#9989;',
        error   : '&#10060;',
        warning : '&#9888;',
        info    : '&#8505;'
    };

    const toast     = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">
            ${icons[type] ?? '&#8505;'}
        </span>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;

    const container = document.getElementById('toast-container');
    if (container) container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 300);
    }, 4000);
}

// =============================================
// UTILITIES
// =============================================
function darkenColor(hex) {
    hex     = hex.replace('#', '');
    const r = Math.floor(parseInt(hex.substr(0,2), 16) * 0.65);
    const g = Math.floor(parseInt(hex.substr(2,2), 16) * 0.65);
    const b = Math.floor(parseInt(hex.substr(4,2), 16) * 0.65);
    return '#' +
        r.toString(16).padStart(2,'0') +
        g.toString(16).padStart(2,'0') +
        b.toString(16).padStart(2,'0');
}

function truncate(str, max) {
    return str.length > max
        ? str.substring(0, max) + '\u2026'
        : str;
}

// ESC closes any open modal + equipment dropdown
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show')
            .forEach(m => m.classList.remove('show'));
        hideEquipmentDropdown();
    }
});

// ── Show Admin tab only for sample coordinators ───────────
(function initAdminTabVisibility() {
    function check() {
        if (!window.currentUser) { setTimeout(check, 200); return; }
        const adminTab = document.getElementById("tab-admin");
        if (!adminTab) return;
        if (window.currentUser.role === "sample coordinator") {
            adminTab.style.display = "inline-flex";
        }
    }
    check();
})();

function goToAdminDashboard() {
    window.location.href = "admin.html";
}

// ── Weekly limit check hook — call inside saveProject() ───
// Add this BEFORE the actual DB insert in your saveProject():
async function checkLimitsBeforeSave(startDatetime, quantity) {
    if (typeof window.checkWeeklyLimits !== "function") return true;
    const result = await window.checkWeeklyLimits(
        startDatetime, quantity, 1
    );
    if (!result.ok) {
        const content = document.getElementById("clash-modal-content");
        if (content) {
            content.innerHTML = `
            <div style="margin-bottom:12px;font-weight:700;
                        color:var(--warning)">
                ⚠️ Weekly Limits Exceeded
                (Week of ${result.weekLabel})
            </div>
            ${result.violations.map(function(v) {
                return `<div style="padding:8px 12px;
                                    margin-bottom:6px;
                                    background:rgba(239,68,68,.1);
                                    border:1px solid rgba(239,68,68,.25);
                                    border-radius:6px;
                                    font-size:12px;
                                    color:#fca5a5">
                            ❌ ${v}
                        </div>`;
            }).join("")}`;
        }
        document.getElementById("clash-modal")
            ?.classList.add("active");
        return false;
    }
    return true;
}