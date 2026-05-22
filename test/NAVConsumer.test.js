/**
 * NAVConsumer.test.js – Unit tests for the NAVConsumer smart contract
 *
 * These tests run on the local Hardhat network.
 * Chainlink Functions callbacks are mocked by deploying a MockFunctionsRouter
 * that immediately fulfils requests, so no real DON is required.
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");

// Minimal mock router ABI used below
const MOCK_ROUTER_ABI = [
  "function sendRequest(uint64 subscriptionId, bytes calldata data, uint16 dataVersion, uint32 callbackGasLimit, bytes32 donId) external returns (bytes32)",
  "function fulfil(address consumer, bytes32 requestId, bytes calldata response, bytes calldata err) external",
];

describe("NAVConsumer", function () {
  let owner, other;
  let mockRouter;
  let navConsumer;

  const subscriptionId = 1n;
  const callbackGasLimit = 300_000;
  const donId = ethers.zeroPadBytes("0x01", 32);
  const dummySource = 'return Functions.encodeUint256(42n);';

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy the mock router
    const MockRouter = await ethers.getContractFactory("MockFunctionsRouter");
    mockRouter = await MockRouter.deploy();
    await mockRouter.waitForDeployment();

    // Deploy NAVConsumer pointing to the mock router
    const NAVConsumer = await ethers.getContractFactory("NAVConsumer");
    navConsumer = await NAVConsumer.deploy(
      await mockRouter.getAddress(),
      subscriptionId,
      callbackGasLimit,
      donId,
      dummySource
    );
    await navConsumer.waitForDeployment();
  });

  // ── Deployment ─────────────────────────────────────────────────────────────

  describe("Deployment", function () {
    it("sets the owner correctly", async function () {
      expect(await navConsumer.owner()).to.equal(owner.address);
    });

    it("initialises nav to 0", async function () {
      expect(await navConsumer.nav()).to.equal(0n);
    });

    it("stores the functions source", async function () {
      expect(await navConsumer.functionsSource()).to.equal(dummySource);
    });

    it("stores the subscriptionId", async function () {
      expect(await navConsumer.subscriptionId()).to.equal(subscriptionId);
    });
  });

  // ── Access control ─────────────────────────────────────────────────────────

  describe("Access control", function () {
    it("reverts requestNAVUpdate from non-owner", async function () {
      await expect(
        navConsumer.connect(other).requestNAVUpdate()
      ).to.be.revertedWith("Only callable by owner");
    });

    it("reverts setSubscriptionId from non-owner", async function () {
      await expect(
        navConsumer.connect(other).setSubscriptionId(2)
      ).to.be.revertedWith("Only callable by owner");
    });

    it("reverts setCallbackGasLimit from non-owner", async function () {
      await expect(
        navConsumer.connect(other).setCallbackGasLimit(100_000)
      ).to.be.revertedWith("Only callable by owner");
    });

    it("reverts setDonId from non-owner", async function () {
      await expect(
        navConsumer.connect(other).setDonId(donId)
      ).to.be.revertedWith("Only callable by owner");
    });

    it("reverts setFunctionsSource from non-owner", async function () {
      await expect(
        navConsumer.connect(other).setFunctionsSource("new source")
      ).to.be.revertedWith("Only callable by owner");
    });
  });

  // ── Owner configuration setters ────────────────────────────────────────────

  describe("Configuration setters", function () {
    it("owner can update subscriptionId", async function () {
      await navConsumer.setSubscriptionId(99);
      expect(await navConsumer.subscriptionId()).to.equal(99n);
    });

    it("owner can update callbackGasLimit", async function () {
      await navConsumer.setCallbackGasLimit(150_000);
      expect(await navConsumer.callbackGasLimit()).to.equal(150_000n);
    });

    it("owner can update donId", async function () {
      const newDonId = ethers.zeroPadBytes("0x02", 32);
      await navConsumer.setDonId(newDonId);
      expect(await navConsumer.donId()).to.equal(newDonId);
    });

    it("owner can update functionsSource", async function () {
      const newSource = "return Functions.encodeUint256(100n);";
      await navConsumer.setFunctionsSource(newSource);
      expect(await navConsumer.functionsSource()).to.equal(newSource);
    });
  });

  // ── Request / Fulfillment flow ─────────────────────────────────────────────

  describe("requestNAVUpdate", function () {
    it("emits NAVUpdateRequested and sets lastRequestId", async function () {
      const tx = await navConsumer.requestNAVUpdate();
      const receipt = await tx.wait();

      // Parse the event
      const event = receipt.logs
        .map((log) => {
          try {
            return navConsumer.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "NAVUpdateRequested");

      expect(event).to.not.be.null;
      const requestId = event.args.requestId;
      expect(requestId).to.not.equal(ethers.ZeroHash);
      expect(await navConsumer.lastRequestId()).to.equal(requestId);
    });
  });

  describe("fulfillRequest (mocked)", function () {
    it("updates nav on successful fulfillment", async function () {
      // Send the request
      const tx = await navConsumer.requestNAVUpdate();
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => {
          try {
            return navConsumer.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "NAVUpdateRequested");

      const requestId = event.args.requestId;

      // Mock fulfillment: encode 500e18 as uint256
      const newNAV = ethers.parseEther("500");
      const response = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256"],
        [newNAV]
      );

      // Call the mock router to fulfil the request
      const fulfillTx = await mockRouter.fulfil(
        await navConsumer.getAddress(),
        requestId,
        response,
        "0x"
      );
      await fulfillTx.wait();

      expect(await navConsumer.nav()).to.equal(newNAV);
    });

    it("emits NAVUpdated on successful fulfillment", async function () {
      const tx = await navConsumer.requestNAVUpdate();
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((log) => {
          try { return navConsumer.interface.parseLog(log); } catch { return null; }
        })
        .find((e) => e && e.name === "NAVUpdateRequested");

      const requestId = event.args.requestId;
      const newNAV = ethers.parseEther("100");
      const response = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [newNAV]);

      await expect(mockRouter.fulfil(await navConsumer.getAddress(), requestId, response, "0x"))
        .to.emit(navConsumer, "NAVUpdated")
        .withArgs(newNAV, requestId);
    });

    it("emits NAVUpdateFailed when error bytes are non-empty", async function () {
      const tx = await navConsumer.requestNAVUpdate();
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((log) => {
          try { return navConsumer.interface.parseLog(log); } catch { return null; }
        })
        .find((e) => e && e.name === "NAVUpdateRequested");

      const requestId = event.args.requestId;
      const errorBytes = ethers.toUtf8Bytes("fetch failed");

      await expect(
        mockRouter.fulfil(await navConsumer.getAddress(), requestId, "0x", errorBytes)
      )
        .to.emit(navConsumer, "NAVUpdateFailed")
        .withArgs(requestId, ethers.hexlify(errorBytes));
    });

    it("does not update nav when error bytes are non-empty", async function () {
      const tx = await navConsumer.requestNAVUpdate();
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((log) => {
          try { return navConsumer.interface.parseLog(log); } catch { return null; }
        })
        .find((e) => e && e.name === "NAVUpdateRequested");

      const requestId = event.args.requestId;

      // First fulfil with a real value
      const firstNAV = ethers.parseEther("50");
      const response = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [firstNAV]);
      await mockRouter.fulfil(await navConsumer.getAddress(), requestId, response, "0x");
      expect(await navConsumer.nav()).to.equal(firstNAV);

      // Second request, fulfil with error
      const tx2 = await navConsumer.requestNAVUpdate();
      const receipt2 = await tx2.wait();
      const event2 = receipt2.logs
        .map((log) => {
          try { return navConsumer.interface.parseLog(log); } catch { return null; }
        })
        .find((e) => e && e.name === "NAVUpdateRequested");

      await mockRouter.fulfil(
        await navConsumer.getAddress(),
        event2.args.requestId,
        "0x",
        ethers.toUtf8Bytes("error")
      );

      // NAV should remain unchanged
      expect(await navConsumer.nav()).to.equal(firstNAV);
    });
  });
});
