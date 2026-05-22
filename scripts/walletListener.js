/**
 * walletListener.js – Watches ETH and ERC-20 inflow/outflow for a wallet
 *
 * ─── What it does ────────────────────────────────────────────────────────────
 * 1. Connects to the configured RPC endpoint (WebSocket preferred for live
 *    subscription, HTTP polling also supported by ethers.js).
 * 2. Listens for *new* blocks and checks each transaction for ETH transfers
 *    to/from MONITORED_WALLET.
 * 3. Subscribes to ERC-20 Transfer events (topic0 = keccak256("Transfer(address,address,uint256)"))
 *    filtered by the monitored wallet as sender or recipient.
 * 4. On inflow (wallet is recipient): calls POST /nav/increment with the raw
 *    token amount (in the token's smallest unit, e.g. wei for ETH).
 * 5. On outflow (wallet is sender):  calls POST /nav/decrement with the same.
 *
 * ─── Limitations ─────────────────────────────────────────────────────────────
 * • HISTORICAL SCANNING: This script only listens for *new* events from the
 *   moment it starts. It does NOT replay historical transactions. If you need
 *   to back-fill, uncomment and use the `scanHistoricalBlocks()` function.
 * • TOKEN DECIMALS: Amounts are stored in the token's *smallest unit* (e.g.
 *   USDC uses 6 decimals, so 1 USDC = 1_000_000). The NAV in the database is
 *   therefore a raw integer accumulator; divide by the appropriate decimals
 *   before displaying human-readable values.
 * • REORGS: Block reorganisations are not handled. In production add a
 *   confirmation threshold before applying NAV changes.
 * • GAS TRANSACTIONS: ETH spent on gas fees is NOT deducted from NAV. Only the
 *   value field (amount sent) is counted.
 *
 * ─── Configuration (via .env) ────────────────────────────────────────────────
 * MONITORED_WALLET   – address whose transactions update NAV
 * LISTENER_RPC_URL   – WebSocket or HTTP RPC URL
 * NAV_API_URL        – base URL of the backend (default http://localhost:3000)
 * ERC20_ADDRESSES    – comma-separated list of ERC-20 contract addresses to watch
 *
 * Start with: npm run listener
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { ethers } = require("ethers");
const axios = require("axios");

// ─── Configuration ────────────────────────────────────────────────────────────

const MONITORED_WALLET = (
  process.env.MONITORED_WALLET || ""
).toLowerCase();

const LISTENER_RPC_URL =
  process.env.LISTENER_RPC_URL || "http://localhost:8545";

const NAV_API_URL =
  (process.env.NAV_API_URL || "http://localhost:3000").replace(/\/$/, "");

const ERC20_ADDRESSES = (process.env.ERC20_ADDRESSES || "")
  .split(",")
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

if (!MONITORED_WALLET) {
  console.error(
    "ERROR: MONITORED_WALLET is not set. Please configure it in .env"
  );
  process.exit(1);
}

// Minimal ERC-20 ABI – only the Transfer event is needed
const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// ─── NAV API helpers ──────────────────────────────────────────────────────────

async function navIncrement(amount) {
  try {
    const res = await axios.post(`${NAV_API_URL}/nav/increment`, {
      delta: amount.toString(),
    });
    console.log(`  ↑ NAV incremented by ${amount} → ${res.data.nav}`);
  } catch (err) {
    console.error(`  ✗ Failed to increment NAV: ${err.message}`);
  }
}

async function navDecrement(amount) {
  try {
    const res = await axios.post(`${NAV_API_URL}/nav/decrement`, {
      delta: amount.toString(),
    });
    console.log(`  ↓ NAV decremented by ${amount} → ${res.data.nav}`);
  } catch (err) {
    console.error(`  ✗ Failed to decrement NAV: ${err.message}`);
  }
}

// ─── Provider setup ───────────────────────────────────────────────────────────

function createProvider() {
  if (LISTENER_RPC_URL.startsWith("wss://") || LISTENER_RPC_URL.startsWith("ws://")) {
    return new ethers.WebSocketProvider(LISTENER_RPC_URL);
  }
  return new ethers.JsonRpcProvider(LISTENER_RPC_URL);
}

// ─── ETH listener ────────────────────────────────────────────────────────────

/**
 * Listen for new blocks and check each transaction for ETH transfers
 * involving the monitored wallet.
 */
async function listenETH(provider) {
  console.log(`[ETH] Listening for ETH transfers on ${MONITORED_WALLET}...`);

  provider.on("block", async (blockNumber) => {
    try {
      const block = await provider.getBlock(blockNumber, true /* with txs */);
      if (!block || !block.transactions) return;

      for (const tx of block.transactions) {
        const txObj = typeof tx === "string" ? await provider.getTransaction(tx) : tx;
        if (!txObj || txObj.value === 0n) continue;

        const from = txObj.from?.toLowerCase();
        const to = txObj.to?.toLowerCase();
        const value = txObj.value;

        if (to === MONITORED_WALLET) {
          console.log(
            `[ETH] Inflow  tx=${txObj.hash} from=${txObj.from} amount=${ethers.formatEther(value)} ETH`
          );
          await navIncrement(value);
        } else if (from === MONITORED_WALLET) {
          console.log(
            `[ETH] Outflow tx=${txObj.hash} to=${txObj.to} amount=${ethers.formatEther(value)} ETH`
          );
          await navDecrement(value);
        }
      }
    } catch (err) {
      console.error(`[ETH] Error processing block ${blockNumber}: ${err.message}`);
    }
  });
}

// ─── ERC-20 listener ─────────────────────────────────────────────────────────

/**
 * Subscribe to Transfer events for the given ERC-20 contract addresses,
 * filtered by the monitored wallet.
 */
async function listenERC20(provider) {
  if (ERC20_ADDRESSES.length === 0) {
    console.log("[ERC-20] No token addresses configured – skipping ERC-20 listener.");
    return;
  }

  for (const tokenAddress of ERC20_ADDRESSES) {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

    // Inflow: monitored wallet is the recipient
    contract.on(
      contract.filters.Transfer(null, MONITORED_WALLET),
      async (from, to, value, event) => {
        console.log(
          `[ERC-20] Inflow  token=${tokenAddress} tx=${event.log.transactionHash} from=${from} amount=${value}`
        );
        await navIncrement(value);
      }
    );

    // Outflow: monitored wallet is the sender
    contract.on(
      contract.filters.Transfer(MONITORED_WALLET, null),
      async (from, to, value, event) => {
        console.log(
          `[ERC-20] Outflow token=${tokenAddress} tx=${event.log.transactionHash} to=${to} amount=${value}`
        );
        await navDecrement(value);
      }
    );

    console.log(`[ERC-20] Subscribed to Transfer events for token ${tokenAddress}`);
  }
}

// ─── Historical scanner (optional, off by default) ───────────────────────────

/**
 * Scan historical ERC-20 Transfer events from `fromBlock` to `toBlock`.
 * Call this before starting the live listener if you need to back-fill NAV.
 *
 * NOTE: HTTP providers have log limits (e.g. 2000 blocks per query on Alchemy).
 *       Break large ranges into smaller chunks in production.
 *
 * @param {ethers.Provider} provider
 * @param {number} fromBlock
 * @param {number|string} toBlock  e.g. "latest"
 */
async function scanHistoricalERC20(provider, fromBlock, toBlock = "latest") {
  if (ERC20_ADDRESSES.length === 0) return;

  console.log(`[ERC-20 history] Scanning blocks ${fromBlock}–${toBlock}...`);

  const transferTopic = ethers.id("Transfer(address,address,uint256)");
  const paddedWallet = ethers.zeroPadValue(MONITORED_WALLET, 32);

  for (const tokenAddress of ERC20_ADDRESSES) {
    // Inflows
    const inLogs = await provider.getLogs({
      address: tokenAddress,
      topics: [transferTopic, null, paddedWallet],
      fromBlock,
      toBlock,
    });
    for (const log of inLogs) {
      const iface = new ethers.Interface(ERC20_ABI);
      const parsed = iface.parseLog(log);
      console.log(`[ERC-20 history] Inflow tx=${log.transactionHash} amount=${parsed.args.value}`);
      await navIncrement(parsed.args.value);
    }

    // Outflows
    const outLogs = await provider.getLogs({
      address: tokenAddress,
      topics: [transferTopic, paddedWallet, null],
      fromBlock,
      toBlock,
    });
    for (const log of outLogs) {
      const iface = new ethers.Interface(ERC20_ABI);
      const parsed = iface.parseLog(log);
      console.log(`[ERC-20 history] Outflow tx=${log.transactionHash} amount=${parsed.args.value}`);
      await navDecrement(parsed.args.value);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("NAV Wallet Listener");
  console.log("=".repeat(60));
  console.log(`Monitored wallet : ${MONITORED_WALLET}`);
  console.log(`RPC endpoint     : ${LISTENER_RPC_URL}`);
  console.log(`NAV API          : ${NAV_API_URL}`);
  console.log(`ERC-20 tokens    : ${ERC20_ADDRESSES.join(", ") || "(none)"}`);
  console.log("=".repeat(60));

  const provider = createProvider();

  // Verify connectivity
  const network = await provider.getNetwork();
  console.log(
    `Connected to network: ${network.name} (chainId=${network.chainId})\n`
  );

  await listenETH(provider);
  await listenERC20(provider);

  console.log("\nListener running. Press Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
