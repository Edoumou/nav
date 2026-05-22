// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {ConfirmedOwner} from "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

/**
 * @title NAVConsumer
 * @notice Stores a Net Asset Value (NAV) that is updated via Chainlink Functions.
 *         The Functions request calls an external HTTP API to fetch the latest NAV,
 *         which the DON then reports back through the fulfillment callback.
 *
 * @dev Deployed on Chainlink Functions-supported testnets (e.g. Sepolia).
 *      The owner must fund a Chainlink Functions subscription and add this
 *      contract as a consumer before calling requestNAVUpdate().
 */
contract NAVConsumer is FunctionsClient, ConfirmedOwner {
    using FunctionsRequest for FunctionsRequest.Request;

    // ─── State ──────────────────────────────────────────────────────────────

    /// @notice The current Net Asset Value, scaled by 1e18 (same as ETH/wei).
    uint256 public nav;

    /// @notice The last raw response bytes returned by Chainlink Functions.
    bytes public lastResponse;

    /// @notice The last error bytes returned by Chainlink Functions (if any).
    bytes public lastError;

    /// @notice The most recent Chainlink Functions request ID.
    bytes32 public lastRequestId;

    /// @notice Chainlink Functions subscription ID used to pay for requests.
    uint64 public subscriptionId;

    /// @notice Gas limit for the fulfillment callback transaction.
    uint32 public callbackGasLimit;

    /// @notice The DON ID that should execute the Functions request.
    bytes32 public donId;

    /// @notice JavaScript source executed by the DON to fetch NAV.
    string public functionsSource;

    // ─── Events ─────────────────────────────────────────────────────────────

    /// @notice Emitted when a new NAV update is requested.
    event NAVUpdateRequested(bytes32 indexed requestId);

    /// @notice Emitted when the NAV value is successfully updated.
    event NAVUpdated(uint256 indexed newNAV, bytes32 indexed requestId);

    /// @notice Emitted when a Functions request fails.
    event NAVUpdateFailed(bytes32 indexed requestId, bytes error);

    // ─── Constructor ────────────────────────────────────────────────────────

    /**
     * @param router           Chainlink Functions router address for the network.
     * @param _subscriptionId  Chainlink Functions subscription ID.
     * @param _callbackGasLimit Gas limit for the fulfillment callback.
     * @param _donId           DON ID (bytes32) for the target network.
     * @param _functionsSource JavaScript source code executed by the DON.
     */
    constructor(
        address router,
        uint64 _subscriptionId,
        uint32 _callbackGasLimit,
        bytes32 _donId,
        string memory _functionsSource
    ) FunctionsClient(router) ConfirmedOwner(msg.sender) {
        subscriptionId = _subscriptionId;
        callbackGasLimit = _callbackGasLimit;
        donId = _donId;
        functionsSource = _functionsSource;
    }

    // ─── Owner-only configuration ────────────────────────────────────────────

    /// @notice Update the Chainlink Functions subscription ID.
    function setSubscriptionId(uint64 _subscriptionId) external onlyOwner {
        subscriptionId = _subscriptionId;
    }

    /// @notice Update the callback gas limit.
    function setCallbackGasLimit(uint32 _callbackGasLimit) external onlyOwner {
        callbackGasLimit = _callbackGasLimit;
    }

    /// @notice Update the DON ID.
    function setDonId(bytes32 _donId) external onlyOwner {
        donId = _donId;
    }

    /// @notice Replace the JavaScript source that the DON executes.
    function setFunctionsSource(string memory _functionsSource) external onlyOwner {
        functionsSource = _functionsSource;
    }

    // ─── Core logic ─────────────────────────────────────────────────────────

    /**
     * @notice Send a Chainlink Functions request to fetch the latest NAV.
     *         Only the owner can trigger an update to prevent spam.
     * @return requestId The Chainlink Functions request ID.
     */
    function requestNAVUpdate() external onlyOwner returns (bytes32 requestId) {
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(functionsSource);

        requestId = _sendRequest(
            req.encodeCBOR(),
            subscriptionId,
            callbackGasLimit,
            donId
        );

        lastRequestId = requestId;
        emit NAVUpdateRequested(requestId);
    }

    /**
     * @notice Chainlink Functions fulfillment callback.
     *         Called by the router with the DON's response.
     * @param requestId  The matching request ID.
     * @param response   ABI-encoded response bytes (expected: uint256).
     * @param err        Error bytes if the DON encountered an error.
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        lastResponse = response;
        lastError = err;

        if (err.length > 0) {
            emit NAVUpdateFailed(requestId, err);
            return;
        }

        // The JS source returns a uint256 encoded as bytes
        uint256 newNAV = abi.decode(response, (uint256));
        nav = newNAV;

        emit NAVUpdated(newNAV, requestId);
    }
}
