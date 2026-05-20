// ============================================================
// auth.js  —  PJM Build Plan Login Logic
// ============================================================
"use strict";

// ============================================================
// ROLE → PAGE MAPPING
// ============================================================
const ROLE_REDIRECTS = {
    "pjm"               : "autoscheduler.html",
    "sample coordinator": "autoscheduler.html"
};

let selectedRole    = "pjm";
let redirectTimeout = null;

// ============================================================
// WAIT FOR DOM
// ============================================================
document.addEventListener("DOMContentLoaded", function () {
    console.log("🔍 AUTH: DOM ready");

    waitForDB()
        .then(function () {
            console.log("🔍 AUTH: ✅ DB ready, starting app");
            initApp();
        })
        .catch(function () {
            console.error("🔍 AUTH: ❌ window.db never became available");
            showAlert("error",
                "❌ Cannot connect to database. Please refresh.");
        });
});

// ============================================================
// WAIT FOR DB HELPER
// ============================================================
function waitForDB() {
    return new Promise(function (resolve, reject) {
        if (window.db && typeof window.db.from === "function") {
            console.log("🔍 AUTH: window.db already ready");
            resolve();
            return;
        }
        console.log("🔍 AUTH: Waiting for window.db...");
        let attempts   = 0;
        const maxTries = 50;
        const interval = setInterval(function () {
            attempts++;
            if (window.db && typeof window.db.from === "function") {
                clearInterval(interval);
                console.log("🔍 AUTH: window.db ready after",
                    attempts, "attempts");
                resolve();
            } else if (attempts >= maxTries) {
                clearInterval(interval);
                console.error("🔍 AUTH: window.db TIMEOUT after",
                    attempts, "attempts");
                reject(new Error("DB timeout"));
            }
        }, 100);
    });
}

// ============================================================
// INIT APP
// ============================================================
function initApp() {
    console.log("🔍 AUTH: initApp running");

    // ── Role buttons ─────────────────────────────────────────
    document.querySelectorAll(".role-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".role-btn")
                    .forEach(function (b) { b.classList.remove("active"); });
            this.classList.add("active");
            selectedRole = this.dataset.role;
            console.log("🔍 AUTH: Role selected →", selectedRole);
        });
    });

    // ── Password toggle ──────────────────────────────────────
    const toggleBtn = document.getElementById("toggle-pw-btn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", function () {
            const inp = document.getElementById("login-password");
            if (!inp) return;
            if (inp.type === "password") {
                inp.type            = "text";
                toggleBtn.innerHTML = "&#128064;";
            } else {
                inp.type            = "password";
                toggleBtn.innerHTML = "&#128065;";
            }
        });
    }

    // ── Login form ───────────────────────────────────────────
    const form = document.getElementById("login-form");
    if (form) {
        form.removeAttribute("onsubmit");
        form.addEventListener("submit", handleLogin);
        console.log("🔍 AUTH: ✅ Login form listener attached");
    } else {
        console.error("🔍 AUTH: ❌ #login-form not found!");
    }

    // ── SSO button ───────────────────────────────────────────
    const ssoBtn = document.getElementById("sso-btn");
    if (ssoBtn) {
        ssoBtn.addEventListener("click", handleSSO);
    }

    // ── Forgot password ──────────────────────────────────────
    const forgotBtn = document.getElementById("forgot-link-btn");
    if (forgotBtn) {
        forgotBtn.addEventListener("click", function () {
            const modal = document.getElementById("forgot-modal");
            if (modal) modal.classList.remove("hidden");
            const emailVal = document.getElementById("login-email")?.value;
            if (emailVal) {
                const forgotEmail = document.getElementById("forgot-email");
                if (forgotEmail) forgotEmail.value = emailVal;
            }
        });
    }

    // ── Modal controls ───────────────────────────────────────
    document.getElementById("modal-close-btn")
        ?.addEventListener("click", closeModal);
    document.getElementById("btn-cancel")
        ?.addEventListener("click", closeModal);
    document.getElementById("btn-send")
        ?.addEventListener("click", handlePasswordReset);
    document.getElementById("forgot-modal")
        ?.addEventListener("click", function (e) {
            if (e.target === this) closeModal();
        });

    // ── Restore remembered email ─────────────────────────────
    const savedEmail = localStorage.getItem("pjm_email");
    if (savedEmail) {
        const emailEl = document.getElementById("login-email");
        const cbEl    = document.getElementById("remember-me");
        if (emailEl) emailEl.value = savedEmail;
        if (cbEl)    cbEl.checked  = true;
        console.log("🔍 AUTH: Restored saved email →", savedEmail);
    }

    console.log("🔍 AUTH: ✅ Login page ready");
}

// ============================================================
// HANDLE LOGIN
// ============================================================
async function handleLogin(event) {
    event.preventDefault();
    console.log("🔍 AUTH: ── handleLogin fired ──────────────────");

    const email    = document.getElementById("login-email")?.value.trim() || "";
    const password = document.getElementById("login-password")?.value     || "";
    const remember = document.getElementById("remember-me")?.checked      || false;

    console.log("🔍 AUTH: email =", email);
    console.log("🔍 AUTH: selectedRole =", selectedRole);
    console.log("🔍 AUTH: remember =", remember);

    clearErrors();

    // ── Validate ─────────────────────────────────────────────
    let valid = true;
    if (!email) {
        showFieldError("err-email", "Email is required.");
        valid = false;
    } else if (!email.includes("@") || !email.includes(".")) {
        showFieldError("err-email", "Enter a valid email address.");
        valid = false;
    }
    if (!password) {
        showFieldError("err-password", "Password is required.");
        valid = false;
    } else if (password.length < 6) {
        showFieldError("err-password",
            "Password must be at least 6 characters.");
        valid = false;
    }
    if (!valid) {
        console.log("🔍 AUTH: ❌ Validation failed");
        return;
    }

    console.log("🔍 AUTH: ✅ Validation passed");
    setLoading(true);

    try {
        // ── STEP 1: Sign in ───────────────────────────────────
        console.log("🔍 AUTH: STEP 1 — Signing in...");
        const { data: authData, error: authError } =
            await window.db.auth.signInWithPassword({
                email:    email,
                password: password
            });

        if (authError) {
            setLoading(false);
            console.error("🔍 AUTH: STEP 1 ❌ Auth error →",
                authError.message);
            if (authError.message.includes("Invalid login credentials")) {
                showAlert("error", "❌ Wrong email or password.");
            } else if (authError.message.includes("Email not confirmed")) {
                showAlert("error", "📧 Please verify your email first.");
            } else if (authError.message.includes("Too many requests")) {
                showAlert("error", "⏳ Too many attempts. Please wait.");
            } else {
                showAlert("error", `❌ ${authError.message}`);
            }
            return;
        }

        console.log("🔍 AUTH: STEP 1 ✅ Auth success →",
            authData.user.email);
        console.log("🔍 AUTH: STEP 1 — authData.user.id =",
            authData.user.id);

        // ── STEP 2: Get user from users table ─────────────────
        console.log("🔍 AUTH: STEP 2 — Querying users table...");
        const { data: user, error: userError } = await window.db
            .from("users")
            .select("id, name, role, is_active")
            .eq("id", authData.user.id)
            .single();

        console.log("🔍 AUTH: STEP 2 — user =", user);
        console.log("🔍 AUTH: STEP 2 — userError =",
            userError?.message || null);

        if (userError || !user) {
            setLoading(false);
            console.error("🔍 AUTH: STEP 2 ❌ User not found in DB");
            showAlert("error", "Account not found. Contact your admin.");
            await window.db.auth.signOut();
            return;
        }

        console.log("🔍 AUTH: STEP 2 ✅ User found →", user);

        // ── STEP 3: Check active ──────────────────────────────
        console.log("🔍 AUTH: STEP 3 — is_active =", user.is_active);
        if (!user.is_active) {
            setLoading(false);
            console.warn("🔍 AUTH: STEP 3 ❌ Account deactivated");
            showAlert("error",
                "🚫 Account deactivated. Contact your admin.");
            await window.db.auth.signOut();
            return;
        }
        console.log("🔍 AUTH: STEP 3 ✅ Account is active");

        // ── STEP 4: Check role ────────────────────────────────
        console.log("🔍 AUTH: STEP 4 — DB role =", user.role);
        console.log("🔍 AUTH: STEP 4 — selectedRole =", selectedRole);
        console.log("🔍 AUTH: STEP 4 — match =",
            user.role === selectedRole);

        // ✅ Show char codes to catch invisible characters
        console.log("🔍 AUTH: STEP 4 — DB role charCodes =",
            [...user.role].map(function (c) { return c.charCodeAt(0); }));
        console.log("🔍 AUTH: STEP 4 — selectedRole charCodes =",
            [...selectedRole].map(function (c) { return c.charCodeAt(0); }));

        if (user.role !== selectedRole) {
            setLoading(false);
            console.warn("🔍 AUTH: STEP 4 ❌ Role mismatch!");
            showAlert("error",
                `⚠️ Wrong role selected! ` +
                `Your role is "${user.role}". ` +
                `Please select "${user.role}" above.`
            );
            await window.db.auth.signOut();
            return;
        }
        console.log("🔍 AUTH: STEP 4 ✅ Role matched");

        // ── STEP 5: Remember me ───────────────────────────────
        console.log("🔍 AUTH: STEP 5 — remember =", remember);
        if (remember) {
            localStorage.setItem("pjm_email", email);
            console.log("🔍 AUTH: STEP 5 — Email saved to localStorage");
        } else {
            localStorage.removeItem("pjm_email");
            console.log("🔍 AUTH: STEP 5 — Email removed from localStorage");
        }

        // ── STEP 6: Verify session saved ──────────────────────
        console.log("🔍 AUTH: STEP 6 — Verifying session...");
        const { data: sessionData, error: sessionError } =
            await window.db.auth.getSession();

        console.log("🔍 AUTH: STEP 6 — session =",
            sessionData?.session
                ? {
                    email  : sessionData.session.user?.email,
                    expires: sessionData.session.expires_at
                  }
                : null
        );
        console.log("🔍 AUTH: STEP 6 — sessionError =",
            sessionError?.message || null);
        console.log("🔍 AUTH: STEP 6 — localStorage keys =",
            Object.keys(localStorage));

        if (sessionError || !sessionData?.session) {
            setLoading(false);
            console.error("🔍 AUTH: STEP 6 ❌ Session not persisted!");
            showAlert("error",
                "Session could not be saved. Please try again.");
            return;
        }
        console.log("🔍 AUTH: STEP 6 ✅ Session confirmed →",
            sessionData.session.user.email);

        // ── STEP 7: Save to sessionStorage ───────────────────
        console.log("🔍 AUTH: STEP 7 — Saving to sessionStorage...");
        const userPayload = {
            id   : user.id,
            name : user.name || email.split("@")[0],
            role : user.role,
            email: email
        };
        sessionStorage.setItem("pjm_user", JSON.stringify(userPayload));
        console.log("🔍 AUTH: STEP 7 ✅ sessionStorage saved →",
            userPayload);

        // ── STEP 8: Redirect ──────────────────────────────────
        const displayName = user.name || email.split("@")[0];
        const targetPage  = ROLE_REDIRECTS[user.role];

        console.log("🔍 AUTH: STEP 8 — displayName =", displayName);
        console.log("🔍 AUTH: STEP 8 — targetPage =", targetPage);
        console.log("🔍 AUTH: STEP 8 — Redirecting in 1500ms...");

        setLoading(false);
        showAlert("success", `✅ Welcome, ${displayName}! Redirecting…`);

        redirectTimeout = setTimeout(function () {
            console.log("🔍 AUTH: STEP 8 — Redirect firing NOW →",
                targetPage);
            try {
                redirectByRole(user.role);
            } catch (redirectErr) {
                console.error("🔍 AUTH: STEP 8 ❌ Redirect failed →",
                    redirectErr);
                showAlert("error",
                    "Login succeeded but redirect failed. " +
                    "Please navigate manually.");
            }
        }, 1500);

    } catch (err) {
        console.error("🔍 AUTH: ❌ Unexpected error →",
            err.message, err);
        setLoading(false);
        const message = err?.message?.includes("network")
            ? "🌐 Network error. Please check your connection."
            : "Something went wrong. Please try again.";
        showAlert("error", message);
    }
}

// ============================================================
// HANDLE SSO
// ============================================================
async function handleSSO() {
    try {
        console.log("🔍 AUTH: SSO initiated");
        showAlert("info", "🏢 Redirecting to company SSO…");
        const { error } = await window.db.auth.signInWithOAuth({
            provider: "azure",
            options: {
                redirectTo: `${window.location.origin}/autoscheduler.html`
            }
        });
        if (error) {
            console.error("🔍 AUTH: SSO error →", error.message);
            showAlert("error", `❌ SSO failed: ${error.message}`);
        }
    } catch (err) {
        console.error("🔍 AUTH: SSO unexpected error →", err.message);
        showAlert("error", "❌ SSO unavailable. Try email login.");
    }
}

// ============================================================
// HANDLE PASSWORD RESET
// ============================================================
async function handlePasswordReset() {
    const email = document.getElementById("forgot-email")?.value.trim() || "";
    const errEl = document.getElementById("err-forgot-email");

    if (errEl) { errEl.textContent = ""; errEl.classList.add("hidden"); }

    if (!email) {
        showFieldError("err-forgot-email", "Please enter your email.");
        return;
    }
    if (!email.includes("@") || !email.includes(".")) {
        showFieldError("err-forgot-email", "Enter a valid email address.");
        return;
    }

    const btn = document.getElementById("btn-send");
    if (btn) { btn.disabled = true; btn.textContent = "⏳ Sending…"; }

    console.log("🔍 AUTH: Sending password reset to →", email);

    try {
        const { error } = await window.db.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/forgot-password.html`
        });
        if (error) throw error;
        console.log("Reset email sent");
        closeModal();
        showAlert("success", `Reset link sent to ${email}!`);
    } catch (err) {
        console.error("🔍 AUTH: ❌ Reset failed →", err.message);
        showFieldError("err-forgot-email", `Failed: ${err.message}`);
    } finally {
        if (btn) {
            btn.disabled  = false;
            btn.innerHTML = "&#128140; Send Reset Link";
        }
    }
}

// ============================================================
// REDIRECT BY ROLE
// ============================================================
function redirectByRole(role) {
    const page = ROLE_REDIRECTS[role];
    console.log("🔍 AUTH: redirectByRole called →",
        { role, page, ROLE_REDIRECTS });
    if (page) {
        console.log(`🔍 AUTH: ✅ Redirecting "${role}" → "${page}"`);
        window.location.href = page;
    } else {
        console.warn(`🔍 AUTH: ❌ Unknown role: "${role}"`);
        console.warn("🔍 AUTH: Available roles →",
            Object.keys(ROLE_REDIRECTS));
        showAlert("error",
            `Unknown role: "${role}". Contact your admin.`);
    }
}

// ============================================================
// UI HELPERS
// ============================================================
function closeModal() {
    const modal = document.getElementById("forgot-modal");
    if (modal) modal.classList.add("hidden");
    const fe = document.getElementById("forgot-email");
    if (fe) fe.value = "";
    const err = document.getElementById("err-forgot-email");
    if (err) { err.textContent = ""; err.classList.add("hidden"); }
}

function setLoading(on) {
    const btn  = document.getElementById("login-btn");
    const txt  = document.getElementById("login-btn-text");
    const spin = document.getElementById("login-btn-spinner");
    if (!btn) return;
    btn.disabled = on;
    if (on) {
        txt?.classList.add("hidden");
        spin?.classList.remove("hidden");
    } else {
        txt?.classList.remove("hidden");
        spin?.classList.add("hidden");
    }
}

function showAlert(type, message) {
    const box  = document.getElementById("alert-box");
    const icon = document.getElementById("alert-icon");
    const msg  = document.getElementById("alert-message");
    if (!box) return;
    const iconMap = {
        success : "✅",
        error   : "❌",
        warning : "⚠️",
        info    : "ℹ️"
    };
    box.className = `alert-box alert-${type}`;
    if (icon) icon.textContent = iconMap[type] || "ℹ️";
    if (msg)  msg.textContent  = message;
    box.classList.remove("hidden");
    if (type === "success" || type === "info") {
        setTimeout(function () {
            box.classList.add("hidden");
        }, 5000);
    }
}

function showFieldError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
}

function clearErrors() {
    ["err-email", "err-password"].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) { el.textContent = ""; el.classList.add("hidden"); }
    });
    const box = document.getElementById("alert-box");
    if (box) box.classList.add("hidden");
}