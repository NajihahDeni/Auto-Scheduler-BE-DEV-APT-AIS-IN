"use strict";

const SUPABASE_URL = "https://psprlvzbjpgqnfhekfuu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzcHJsdnpianBncW5maGVrZnV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMzg4NTgsImV4cCI6MjA5MzYxNDg1OH0.KsA9_xgIxEbOx8GYMuB563y_IAWVW2cPNufN-9dMJ2k";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzcHJsdnpianBncW5maGVrZnV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODAzODg1OCwiZXhwIjoyMDkzNjE0ODU4fQ.9rXD-ePP857Fea_0jmOMHKXsBD1IhYV5FjLEi7GsHkI";

// ── Regular client (keep exactly as original) ─────────
window.db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Admin client (only for delete operations) ─────────
window.dbAdmin = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        storageKey        : "sb-admin-auth",  // 👈 only admin gets unique key
        autoRefreshToken  : false,
        persistSession    : false,
        detectSessionInUrl: false
    }
});

console.log("✅ window.db ready    :", typeof window.db.from     === "function");
console.log("✅ window.dbAdmin ready:", typeof window.dbAdmin.from === "function");
