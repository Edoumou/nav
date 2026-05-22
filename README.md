# NAV — Chainlink Functions + Wallet Listener Demo

A complete Hardhat project that demonstrates how to:

1. **Update an on-chain `nav` variable** using [Chainlink Functions](https://docs.chain.link/chainlink-functions) — the contract calls a Chainlink DON to fetch the NAV from an external HTTP API.
2. **Listen to wallet inflows and outflows** (ETH + ERC-20) and automatically update the off-chain NAV stored in the backend.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Off-chain                                                           │
│                                                                      │
│  ┌─────────────────┐   increment/decrement   ┌──────────────────┐  │
│  │  walletListener │ ──────────────────────→ │  Express Backend │  │
│  │  (ETH + ERC-20) │                         │  GET/POST /nav   │  │
│  └─────────────────┘                         │  (Supabase)      │  │
│                                              └────────┬─────────┘  │
│                                                       │ GET /nav    │
│                                           ┌───────────▼──────────┐ │
│                                           │ Chainlink Functions  │ │
│                                           │  fetchNAV.js (DON)   │ │
│                                           └───────────┬──────────┘ │
└───────────────────────────────────────────────────────│────────────┘
                                                        │ fulfillment
                                            ┌───────────▼──────────┐
                                            │  NAVConsumer.sol     │
                                            │  uint256 public nav  │
                                            └──────────────────────┘
```

### Data flow

| Step | Actor | Action |
|------|-------|--------|
| 1 | Monitored wallet receives ETH/ERC-20 | `walletListener.js` detects inflow |
| 2 | walletListener | `POST /nav/increment` with transferred amount |
| 3 | Backend | Persists new NAV in Supabase |
| 4 | Owner (or keeper) | Calls `requestNAVUpdate()` on contract |
| 5 | Chainlink DON | Executes `fetchNAV.js` → `GET /nav` → returns NAV |
| 6 | Contract | `fulfillRequest` decodes the value, sets `nav` |

---

## Project structure

```
nav/
├── contracts/
│   ├── NAVConsumer.sol              # Chainlink Functions consumer
│   └── test/
│       └── MockFunctionsRouter.sol  # Mock router for local tests
├── chainlink-functions/
│   └── fetchNAV.js                  # JS source executed by the DON
├── backend/
│   ├── server.js                    # Express API for NAV storage
│   └── db.js                        # Supabase NAV storage
├── scripts/
│   ├── deploy.js                    # Deploys NAVConsumer
│   ├── requestNAVUpdate.js          # Triggers a Functions request
│   ├── walletListener.js            # Wallet inflow/outflow listener
│   └── localDemo.js                 # End-to-end demo (no testnet)
├── test/
│   └── NAVConsumer.test.js          # Hardhat/Mocha/Chai tests
├── hardhat.config.js
├── package.json
└── .env.example
```

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |

For testnet deployment:
- An Ethereum wallet funded with Sepolia ETH
- A [Chainlink Functions subscription](https://functions.chain.link) funded with LINK
- An Alchemy / Infura Sepolia RPC URL

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Edoumou/nav.git
cd nav
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

Key variables:

| Variable | Description |
|----------|-------------|
| `PRIVATE_KEY` | Deployer wallet private key |
| `SEPOLIA_RPC_URL` | Alchemy/Infura Sepolia HTTPS URL |
| `CHAINLINK_SUBSCRIPTION_ID` | Your Chainlink Functions subscription ID |
| `CHAINLINK_ROUTER` | Functions router address (Sepolia default pre-filled) |
| `CHAINLINK_DON_ID` | DON ID (Sepolia default pre-filled) |
| `NAV_API_URL` | URL the DON fetches NAV from (must be publicly reachable for testnet) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key used by the backend (Dashboard → Project Settings → API → `service_role`) |
| `SUPABASE_TABLE` | Supabase table storing NAV (`nav_store` by default) |
| `SUPABASE_NAV_ROW_ID` | Single row id used by the backend (the row's `id` value, `1` by default) |
| `MONITORED_WALLET` | Address whose transactions update NAV |
| `LISTENER_RPC_URL` | WebSocket or HTTP RPC for the wallet listener |
| `ERC20_ADDRESSES` | Comma-separated ERC-20 contract addresses to watch |

### 3. Create the Supabase table

Create a table in Supabase (SQL editor):

```sql
create table if not exists public.nav_store (
  id integer primary key,
  nav text not null default '0'
);
```

If you use a custom table name, set `SUPABASE_TABLE` to match.

Insert (or upsert) the row referenced by `SUPABASE_NAV_ROW_ID`:

```sql
insert into public.nav_store (id, nav)
values (1, '0')
on conflict (id) do update set nav = excluded.nav;
```

### 4. Compile contracts

```bash
npm run compile
```

---

## Running locally (no testnet)

### Start the backend

```bash
npm run backend
# Starts Express API on http://localhost:3000
```

### Run the local demo

```bash
npm run demo
# Simulates inflows/outflows and shows NAV updates
```

Expected output:
```
NAV after reset:      0 wei (≈ 0.000000 ETH)
→ Simulating inflow: 2.5 ETH received
NAV after inflow:     2500000000000000000 wei (≈ 2.500000 ETH)
→ Simulating inflow: 1.0 ETH received
NAV after inflow:     3500000000000000000 wei (≈ 3.500000 ETH)
→ Simulating outflow: 0.5 ETH sent
NAV after outflow:    3000000000000000000 wei (≈ 3.000000 ETH)
Final NAV:            3000000000000000000 wei (≈ 3.000000 ETH)
```

### Run the tests

```bash
npm test
# Runs Hardhat tests with MockFunctionsRouter
```

---

## Deploying to Sepolia testnet

> **Important:** The `NAV_API_URL` in your `.env` must be a **publicly accessible** URL. The Chainlink DON executes `fetchNAV.js` from its own nodes — `localhost` won't work. Use a tunnel (e.g. [ngrok](https://ngrok.com)) or deploy the backend to a cloud provider.

### 1. Start and expose the backend

```bash
# Terminal 1 — backend
npm run backend

# Terminal 2 — expose via ngrok (example)
ngrok http 3000
# Copy the HTTPS URL to NAV_API_URL in .env
```

### 2. Deploy the contract

```bash
npm run deploy:sepolia
# Saves deployment info to deployment.json
```

### 3. Add the contract as a Chainlink Functions consumer

1. Go to [functions.chain.link](https://functions.chain.link) (Sepolia)
2. Open your subscription
3. Click **Add consumer** → paste the deployed contract address from `deployment.json`

### 4. Start the wallet listener

```bash
npm run listener
# Watches MONITORED_WALLET for ETH + ERC-20 transfers
```

### 5. Trigger a NAV update on-chain

```bash
npm run request:nav
# Calls requestNAVUpdate() and waits for fulfillment
```

---

## How the listener updates NAV off-chain

```
walletListener.js
      │
      ├── provider.on("block") ──→ check each tx.value
      │         to == MONITORED_WALLET  →  POST /nav/increment
      │         from == MONITORED_WALLET → POST /nav/decrement
      │
      └── contract.on(Transfer(null, MONITORED_WALLET)) → POST /nav/increment
          contract.on(Transfer(MONITORED_WALLET, null)) → POST /nav/decrement
```

The listener uses **live block subscription** (WebSocket) by default.
It does **not** back-fill historical transactions — only transactions after
the listener starts are counted. See the "Limitations" section below.

---

## How Chainlink Functions fetches NAV and updates `nav`

1. `requestNAVUpdate()` is called on `NAVConsumer.sol`.
2. The contract sends a Functions request to the Chainlink router with:
   - The JavaScript source from `chainlink-functions/fetchNAV.js`
   - The subscription ID, DON ID, callback gas limit
3. The DON executes `fetchNAV.js`:
   ```js
   const response = await Functions.makeHttpRequest({ url: navApiUrl });
   return Functions.encodeUint256(BigInt(response.data.nav));
   ```
4. The DON reports back via `fulfillRequest(requestId, response, err)`.
5. The contract decodes the `uint256` from `response` and sets `nav`.
6. `NAVUpdated(newNAV, requestId)` is emitted.

---

## Chainlink subscription / network configuration

| Parameter | Sepolia value |
|-----------|--------------|
| Router | `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0` |
| DON ID | `fun-ethereum-sepolia-1` (`0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000`) |
| Link token | `0x779877A7B0D9E8603169DdbD7836e478b4624789` |

See the [Chainlink Functions supported networks](https://docs.chain.link/chainlink-functions/supported-networks) page for other networks.

---

## Limitations

### Local-only vs. testnet

| Feature | Local (Hardhat) | Testnet (Sepolia) |
|---------|----------------|-------------------|
| Contract tests | ✅ via MockFunctionsRouter | ✅ via real DON |
| Real Chainlink DON | ❌ | ✅ |
| Wallet listener | ✅ (Hardhat node) | ✅ |
| Backend API | ✅ | ✅ (needs public URL) |

### Historical scanning

The wallet listener subscribes to **new events only**. Historical transactions are not replayed on startup. To back-fill:

1. Uncomment `scanHistoricalERC20()` in `scripts/walletListener.js`.
2. Pass the desired `fromBlock` (e.g. the deployment block of the token).
3. Be aware that providers typically limit `eth_getLogs` to 2 000 blocks per query — split large ranges.

### Token decimals

Amounts are stored in the token's **smallest unit** (e.g. wei for ETH, the base unit for ERC-20 tokens). The NAV accumulator does **not** normalise decimals — 1 USDC (6 decimals) and 1 WETH (18 decimals) would contribute different raw amounts to NAV. For production use, normalise by token decimals before updating NAV.

### Reorgs

Block reorganisations are not handled. In production, add a confirmation threshold (e.g. 12 blocks) before applying NAV changes.

### Gas fees

ETH spent as gas is **not** deducted from NAV. Only the `value` field of the transaction is counted.

---

## npm scripts reference

| Script | Description |
|--------|-------------|
| `npm install` | Install all dependencies |
| `npm run compile` | Compile Solidity contracts |
| `npm test` | Run Hardhat/Mocha tests |
| `npm run backend` | Start the Express NAV API |
| `npm run listener` | Start the wallet listener |
| `npm run demo` | Run local end-to-end demo |
| `npm run deploy:sepolia` | Deploy to Sepolia testnet |
| `npm run deploy:local` | Deploy to local Hardhat node |
| `npm run request:nav` | Trigger NAV update on Sepolia |
| `npm run request:nav:local` | Trigger NAV update on local node |
| `npm run node` | Start a local Hardhat node |