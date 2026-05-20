
"use strict";

const SUPABASE_URL = "https://psprlvzbjpgqnfhekfuu.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzcHJsdnpianBncW5maGVrZnV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMzg4NTgsImV4cCI6MjA5MzYxNDg1OH0.KsA9_xgIxEbOx8GYMuB563y_IAWVW2cPNufN-9dMJ2k";

// ✅ supabase here = the factory from supabase.js
// We store the CLIENT as window.db ONLY
// We do NOT overwrite window.supabase
window.db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("supabase-config.js loaded");
console.log("window.supabase type:", typeof window.supabase);
console.log("window.db created and verified!");

if (typeof window.db.from === "function") {
    console.log("✅ window.db.from is ready");
} else {
    console.error("❌ window.db.from is NOT a function");
}