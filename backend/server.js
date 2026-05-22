/**
 * server.js – Express HTTP API for NAV storage
 *
 * Endpoints:
 *   GET  /nav              Returns the current NAV as JSON: { "nav": "<uint256 string>" }
 *   POST /nav/set          Set NAV to an absolute value.     Body: { "nav": "<uint256 string>" }
 *   POST /nav/increment    Increase NAV by delta.            Body: { "delta": "<uint256 string>" }
 *   POST /nav/decrement    Decrease NAV by delta.            Body: { "delta": "<uint256 string>" }
 *   GET  /health           Simple liveness check.
 *
 * Start with: node backend/server.js
 * Or via npm:  npm run backend
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express = require("express");
const { getNav, setNav, incrementNav, decrementNav } = require("./db");

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.BACKEND_PORT || "3000", 10);

// ─── Routes ──────────────────────────────────────────────────────────────────

/** GET /health */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/** GET /nav – return current NAV */
app.get("/nav", (_req, res) => {
  try {
    const nav = getNav();
    res.json({ nav: nav.toString() });
  } catch (err) {
    console.error("[GET /nav] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/** POST /nav/set – set absolute NAV */
app.post("/nav/set", (req, res) => {
  const { nav } = req.body;
  if (nav === undefined || nav === null) {
    return res.status(400).json({ error: "Missing 'nav' in request body" });
  }
  try {
    setNav(nav);
    const current = getNav();
    console.log(`[POST /nav/set] NAV set to ${current}`);
    res.json({ nav: current.toString() });
  } catch (err) {
    console.error("[POST /nav/set] Error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/** POST /nav/increment – add delta to NAV */
app.post("/nav/increment", (req, res) => {
  const { delta } = req.body;
  if (delta === undefined || delta === null) {
    return res.status(400).json({ error: "Missing 'delta' in request body" });
  }
  try {
    incrementNav(delta);
    const current = getNav();
    console.log(`[POST /nav/increment] NAV incremented by ${delta} → ${current}`);
    res.json({ nav: current.toString() });
  } catch (err) {
    console.error("[POST /nav/increment] Error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

/** POST /nav/decrement – subtract delta from NAV */
app.post("/nav/decrement", (req, res) => {
  const { delta } = req.body;
  if (delta === undefined || delta === null) {
    return res.status(400).json({ error: "Missing 'delta' in request body" });
  }
  try {
    decrementNav(delta);
    const current = getNav();
    console.log(`[POST /nav/decrement] NAV decremented by ${delta} → ${current}`);
    res.json({ nav: current.toString() });
  } catch (err) {
    console.error("[POST /nav/decrement] Error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`NAV backend listening on http://localhost:${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/nav`);
  console.log(`  POST http://localhost:${PORT}/nav/set`);
  console.log(`  POST http://localhost:${PORT}/nav/increment`);
  console.log(`  POST http://localhost:${PORT}/nav/decrement`);
});

module.exports = app; // exported for testing
