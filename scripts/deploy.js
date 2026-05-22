/**
 * deploy.js – Deploys the NAVConsumer contract
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network sepolia
 *   npx hardhat run scripts/deploy.js --network localhost
 *
 * Required environment variables (see .env.example):
 *   CHAINLINK_ROUTER
 *   CHAINLINK_SUBSCRIPTION_ID
 *   CHAINLINK_CALLBACK_GAS_LIMIT
 *   CHAINLINK_DON_ID
 */

"use strict";

const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "ETH"
  );

  // ── Configuration ──────────────────────────────────────────────────────────

  const router =
    process.env.CHAINLINK_ROUTER ||
    "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0"; // Sepolia default

  const subscriptionId = parseInt(
    process.env.CHAINLINK_SUBSCRIPTION_ID || "1",
    10
  );

  const callbackGasLimit = parseInt(
    process.env.CHAINLINK_CALLBACK_GAS_LIMIT || "300000",
    10
  );

  // DON ID must be a bytes32 value
  const donId =
    process.env.CHAINLINK_DON_ID ||
    "0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000";

  // Read the Chainlink Functions JS source from file
  const functionsSourcePath = path.join(
    __dirname,
    "../chainlink-functions/fetchNAV.js"
  );
  const functionsSource = fs.readFileSync(functionsSourcePath, "utf8");

  console.log("\nDeployment parameters:");
  console.log("  Router             :", router);
  console.log("  Subscription ID    :", subscriptionId);
  console.log("  Callback Gas Limit :", callbackGasLimit);
  console.log("  DON ID             :", donId);
  console.log("  Functions source   : chainlink-functions/fetchNAV.js");

  // ── Deploy ─────────────────────────────────────────────────────────────────

  const NAVConsumer = await ethers.getContractFactory("NAVConsumer");
  const navConsumer = await NAVConsumer.deploy(
    router,
    subscriptionId,
    callbackGasLimit,
    donId,
    functionsSource
  );

  await navConsumer.waitForDeployment();
  const contractAddress = await navConsumer.getAddress();

  console.log("\n✅ NAVConsumer deployed to:", contractAddress);
  console.log(
    "\nNext steps:"
  );
  console.log(
    "  1. Add the contract as a consumer in your Chainlink Functions subscription:"
  );
  console.log("     https://functions.chain.link");
  console.log("  2. Fund the subscription with LINK");
  console.log(
    "  3. Run `npm run request:nav` to trigger the first NAV update"
  );

  // Save deployment info for other scripts
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    contractAddress,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    router,
    subscriptionId,
    callbackGasLimit,
    donId,
  };

  const deploymentPath = path.join(__dirname, "../deployment.json");
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
