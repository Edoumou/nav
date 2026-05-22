/**
 * requestNAVUpdate.js – Triggers a Chainlink Functions NAV update
 *
 * Calls requestNAVUpdate() on the deployed NAVConsumer contract and
 * waits for the fulfillment event (or a timeout).
 *
 * Usage:
 *   npx hardhat run scripts/requestNAVUpdate.js --network sepolia
 *
 * Reads the contract address from deployment.json (created by deploy.js)
 * or from the CONTRACT_ADDRESS env variable.
 */

"use strict";

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const NAV_CONSUMER_ABI = [
  "function requestNAVUpdate() external returns (bytes32)",
  "function nav() external view returns (uint256)",
  "function lastRequestId() external view returns (bytes32)",
  "event NAVUpdateRequested(bytes32 indexed requestId)",
  "event NAVUpdated(uint256 indexed newNAV, bytes32 indexed requestId)",
  "event NAVUpdateFailed(bytes32 indexed requestId, bytes error)",
];

async function main() {
  const [signer] = await ethers.getSigners();

  // ── Resolve contract address ───────────────────────────────────────────────

  let contractAddress = process.env.CONTRACT_ADDRESS;
  if (!contractAddress) {
    const deploymentPath = path.join(__dirname, "../deployment.json");
    if (!fs.existsSync(deploymentPath)) {
      console.error(
        "deployment.json not found. Run `npm run deploy:sepolia` first, or set CONTRACT_ADDRESS in .env"
      );
      process.exit(1);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    contractAddress = deployment.contractAddress;
  }

  console.log("NAVConsumer address:", contractAddress);
  console.log("Signer:", signer.address);

  const contract = new ethers.Contract(contractAddress, NAV_CONSUMER_ABI, signer);

  // ── Current NAV ───────────────────────────────────────────────────────────

  const currentNAV = await contract.nav();
  console.log("\nCurrent on-chain NAV:", currentNAV.toString());

  // ── Send request ──────────────────────────────────────────────────────────

  console.log("\nSending Chainlink Functions request...");
  const tx = await contract.requestNAVUpdate();
  console.log("Transaction hash:", tx.hash);

  const receipt = await tx.wait();
  const requestedEvent = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "NAVUpdateRequested");

  if (requestedEvent) {
    console.log("Request ID:", requestedEvent.args.requestId);
  }

  // ── Wait for fulfillment ──────────────────────────────────────────────────

  console.log(
    "\nWaiting for Chainlink DON to fulfill the request (up to 5 minutes)..."
  );
  console.log(
    "(On a local Hardhat network fulfillment will NOT occur automatically)"
  );

  const TIMEOUT_MS = 5 * 60 * 1000;
  const fulfilled = await Promise.race([
    new Promise((resolve) => {
      contract.once("NAVUpdated", (newNAV, reqId) => {
        console.log(`\n✅ NAV updated! requestId=${reqId} newNAV=${newNAV}`);
        resolve(true);
      });
      contract.once("NAVUpdateFailed", (reqId, error) => {
        console.error(`\n✗ NAV update failed. requestId=${reqId} error=${error}`);
        resolve(false);
      });
    }),
    new Promise((resolve) =>
      setTimeout(() => {
        console.log("\n⏱ Timeout: fulfillment not received within 5 minutes.");
        resolve(null);
      }, TIMEOUT_MS)
    ),
  ]);

  if (fulfilled === true) {
    const newNAV = await contract.nav();
    console.log("New on-chain NAV:", newNAV.toString());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
