/**
 * db.js – Supabase-backed NAV storage
 *
 * Stores NAV in a single row in a Supabase table.
 */

"use strict";

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "nav_store";
const SUPABASE_NAV_ROW_ID = parseInt(process.env.SUPABASE_NAV_ROW_ID || "1", 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables"
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function ensureRow() {
  const { data, error } = await supabase
    .from(SUPABASE_TABLE)
    .select("id, nav")
    .eq("id", SUPABASE_NAV_ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read NAV row: ${error.message}`);
  }

  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from(SUPABASE_TABLE)
    .upsert(
      { id: SUPABASE_NAV_ROW_ID, nav: "0" },
      { onConflict: "id" }
    )
    .select("id, nav")
    .single();

  if (insertError) {
    throw new Error(`Failed to initialize NAV row: ${insertError.message}`);
  }

  return inserted;
}

function parseNav(nav) {
  const value = nav ?? "0";
  return BigInt(value.toString());
}

/**
 * Get the current NAV as a BigInt.
 * @returns {Promise<bigint>}
 */
async function getNav() {
  const row = await ensureRow();
  return parseNav(row.nav);
}

/**
 * Set the NAV to an absolute value.
 * @param {bigint|string} value  New NAV value (scaled by 1e18).
 */
async function setNav(value) {
  const bigValue = BigInt(value);
  if (bigValue < 0n) throw new RangeError("NAV cannot be negative");

  const { error } = await supabase.from(SUPABASE_TABLE).upsert(
    { id: SUPABASE_NAV_ROW_ID, nav: bigValue.toString() },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(`Failed to set NAV: ${error.message}`);
  }
}

/**
 * Increment the NAV by delta.
 * @param {bigint|string} delta  Amount to add (must be positive).
 */
async function incrementNav(delta) {
  const bigDelta = BigInt(delta);
  if (bigDelta <= 0n) throw new RangeError("delta must be positive");
  await setNav((await getNav()) + bigDelta);
}

/**
 * Decrement the NAV by delta.
 * Clamps to 0 if the result would be negative.
 * @param {bigint|string} delta  Amount to subtract (must be positive).
 */
async function decrementNav(delta) {
  const bigDelta = BigInt(delta);
  if (bigDelta <= 0n) throw new RangeError("delta must be positive");
  const current = await getNav();
  await setNav(current > bigDelta ? current - bigDelta : 0n);
}

module.exports = { getNav, setNav, incrementNav, decrementNav };
