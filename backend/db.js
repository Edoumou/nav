/**
 * db.js – JSON file-backed NAV storage
 *
 * Stores NAV in a JSON file at ./backend/nav.json.
 * All reads and writes are synchronous for simplicity.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "nav.json");

function read() {
  if (!fs.existsSync(DB_PATH)) {
    return { nav: "0" };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return { nav: "0" };
  }
}

function write(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Get the current NAV as a BigInt.
 * @returns {bigint}
 */
function getNav() {
  return BigInt(read().nav);
}

/**
 * Set the NAV to an absolute value.
 * @param {bigint|string} value  New NAV value (scaled by 1e18).
 */
function setNav(value) {
  const bigValue = BigInt(value);
  if (bigValue < 0n) throw new RangeError("NAV cannot be negative");
  write({ nav: bigValue.toString() });
}

/**
 * Increment the NAV by delta.
 * @param {bigint|string} delta  Amount to add (must be positive).
 */
function incrementNav(delta) {
  const bigDelta = BigInt(delta);
  if (bigDelta <= 0n) throw new RangeError("delta must be positive");
  setNav(getNav() + bigDelta);
}

/**
 * Decrement the NAV by delta.
 * Clamps to 0 if the result would be negative.
 * @param {bigint|string} delta  Amount to subtract (must be positive).
 */
function decrementNav(delta) {
  const bigDelta = BigInt(delta);
  if (bigDelta <= 0n) throw new RangeError("delta must be positive");
  const current = getNav();
  setNav(current > bigDelta ? current - bigDelta : 0n);
}

module.exports = { getNav, setNav, incrementNav, decrementNav };
