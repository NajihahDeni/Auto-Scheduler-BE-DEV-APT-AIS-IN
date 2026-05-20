// ============================================================
// guard.js — Protects autoscheduler.html and admin.html
// ============================================================
(async function guardPage() {
    "use strict";

    var SUPABASE_URL      = "https://psprlvzbjpgqnfhekfuu.supabase.co";
    var SUPABASE_ANON_KEY = "sb_publishable_SIaK6W42cR8ijVJu-IZlcQ_GMS1n1ny";

    var ROLE_PAGES = {
        "PJM"               : "autoscheduler.html",
        "sample coordinator": "admin.html"
    };

    try {
        // ── Use existing client or create one ─────────────
        var client = window.db ||
            window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        var { data: { session } } = await client.auth.getSession();

        // ── No session → go to login ──────────────────────
        if (!session) {
            console.warn("No session — redirecting to login");
            window.location.replace("login.html");
            return;
        }

        // ── Get user from users table ─────────────────────
        var { data: user, error } = await client
            .from("users")
            .select("role, is_active, name")
            .eq("id", session.user.id)
            .single();

        // ── Invalid user → go to login ────────────────────
        if (error || !user || !user.is_active) {
            console.warn("Invalid user — redirecting to login");
            await client.auth.signOut();
            window.location.replace("login.html");
            return;
        }

        // ── Wrong page for role → go to correct page ──────
        var correctPage = ROLE_PAGES[user.role];
        var currentPage = window.location.pathname.split("/").pop()
                          || "index.html";

        if (correctPage && currentPage !== correctPage) {
            console.warn("Wrong page for role — redirecting to", correctPage);
            window.location.replace(correctPage);
            return;
        }

        // ── Access granted ────────────────────────────────
        console.log("✅ Access granted:", user.role, "|", user.name);

        // ── Store user info for the page to use ───────────
        window.currentUser = {
            id       : session.user.id,
            email    : session.user.email,
            name     : user.name || session.user.email.split("@")[0],
            role     : user.role
        };

    } catch (e) {
        console.error("Guard error:", e.message);
        window.location.replace("login.html");
    }
})();