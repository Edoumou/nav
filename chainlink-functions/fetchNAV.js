/**
 * Chainlink Functions JavaScript source – fetchNAV.js
 *
 * This script is executed by the Chainlink DON (Decentralised Oracle Network).
 * It fetches the current NAV from the backend HTTP API and returns it as a
 * uint256 encoded as bytes so the smart contract can decode it with abi.decode.
 *
 * The `Functions` global object and helpers are injected by the DON runtime;
 * do NOT import or require anything – the sandbox is isolated.
 *
 * Environment variable NAV_API_URL must be configured either:
 *  - as a plaintext arg (args[0]) passed when sending the request, or
 *  - hard-coded below for testing.
 *
 * Return value: ABI-encoded uint256 (the NAV scaled by 1e18).
 */

// The URL is passed as args[0] from the smart contract (or hard-code for tests)
const navApiUrl = args[0] || "http://localhost:3000/nav";

// Fetch NAV from the backend
const response = await Functions.makeHttpRequest({
  url: navApiUrl,
  method: "GET",
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

if (response.error) {
  throw Error(`HTTP request failed: ${response.error}`);
}

const data = response.data;

if (data === undefined || data === null) {
  throw Error("Empty response from NAV API");
}

// Expected response shape: { "nav": "1000000000000000000" }
// The nav is stored as a string to avoid JS precision issues with large uint256
let navValue;

if (typeof data === "object" && data.nav !== undefined) {
  navValue = BigInt(data.nav.toString());
} else if (typeof data === "string" || typeof data === "number") {
  navValue = BigInt(data.toString());
} else {
  throw Error(`Unexpected response format: ${JSON.stringify(data)}`);
}

// Encode as uint256 bytes (32 bytes, big-endian)
// Functions.encodeUint256 returns a Uint8Array of 32 bytes
return Functions.encodeUint256(navValue);
