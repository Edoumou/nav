/**
 * localDemo.js – End-to-end local demo (no testnet required)
 *
 * Shows the full NAV flow without a real Chainlink network:
 * 1. Starts the backend server (if not already running).
 * 2. Sets an initial NAV value in the backend.
 * 3. Simulates an ETH inflow transaction → NAV increases.
 * 4. Simulates an ETH outflow transaction → NAV decreases.
 * 5. Reads the final NAV from the backend.
 *
 * NOTE: The smart contract interaction in this demo uses a local Hardhat
 *       node. Chainlink Functions fulfillment is mocked by directly calling
 *       a mock function (the real DON is not available locally).
 *
 * Usage: npm run demo
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const axios = require("axios");

const NAV_API_URL = (process.env.NAV_API_URL || "http://localhost:3000").replace(/\/$/, "");

function eth(amount) {
  // Convert ETH amount (as string) to wei BigInt
  return BigInt(Math.round(parseFloat(amount) * 1e18)).toString();
}

async function apiGet(url) {
  const res = await axios.get(url);
  return res.data;
}

async function apiPost(url, data) {
  const res = await axios.post(url, data);
  return res.data;
}

function printNav(label, data) {
  const navWei = BigInt(data.nav);
  const navEth = Number(navWei) / 1e18;
  console.log(`  ${label}: ${data.nav} wei (≈ ${navEth.toFixed(6)} ETH)`);
}

async function main() {
  console.log("=".repeat(60));
  console.log("NAV Local Demo");
  console.log("=".repeat(60));

  // 1. Check backend is reachable
  try {
    await apiGet(`${NAV_API_URL}/health`);
    console.log(`✅ Backend reachable at ${NAV_API_URL}`);
  } catch {
    console.error(
      `✗ Cannot reach backend at ${NAV_API_URL}\n` +
        "  Please start it first: npm run backend"
    );
    process.exit(1);
  }

  // 2. Reset NAV to 0
  let data = await apiPost(`${NAV_API_URL}/nav/set`, { nav: "0" });
  printNav("NAV after reset", data);

  // 3. Simulate inflow: 2.5 ETH received
  console.log("\n→ Simulating inflow: 2.5 ETH received");
  data = await apiPost(`${NAV_API_URL}/nav/increment`, { delta: eth("2.5") });
  printNav("NAV after inflow", data);

  // 4. Simulate another inflow: 1.0 ETH received
  console.log("\n→ Simulating inflow: 1.0 ETH received");
  data = await apiPost(`${NAV_API_URL}/nav/increment`, { delta: eth("1.0") });
  printNav("NAV after inflow", data);

  // 5. Simulate outflow: 0.5 ETH sent
  console.log("\n→ Simulating outflow: 0.5 ETH sent");
  data = await apiPost(`${NAV_API_URL}/nav/decrement`, { delta: eth("0.5") });
  printNav("NAV after outflow", data);

  // 6. Final NAV
  data = await apiGet(`${NAV_API_URL}/nav`);
  console.log("\n" + "─".repeat(40));
  printNav("Final NAV", data);
  console.log("─".repeat(40));

  console.log(
    "\nNext: deploy the contract and run `npm run request:nav:local`"
  );
  console.log(
    "      to see the contract read this value via Chainlink Functions."
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
