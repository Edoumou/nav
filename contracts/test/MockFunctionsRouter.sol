// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IFunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsClient.sol";

/**
 * @title MockFunctionsRouter
 * @notice Minimal mock of the Chainlink Functions router for local testing.
 *         Records requests and allows test code to manually fulfil them.
 */
contract MockFunctionsRouter {
    uint256 private _requestCounter;

    /// @notice Accepts a Functions request and returns a deterministic requestId.
    function sendRequest(
        uint64, /* subscriptionId */
        bytes calldata, /* data */
        uint16, /* dataVersion */
        uint32, /* callbackGasLimit */
        bytes32 /* donId */
    ) external returns (bytes32 requestId) {
        _requestCounter++;
        requestId = keccak256(abi.encodePacked(msg.sender, _requestCounter, block.number));
    }

    /**
     * @notice Called by tests to simulate DON fulfillment.
     * @param consumer   The NAVConsumer contract address.
     * @param requestId  The request ID returned by sendRequest.
     * @param response   ABI-encoded response (uint256 nav value).
     * @param err        Error bytes (pass "0x" for success).
     */
    function fulfill(
        address consumer,
        bytes32 requestId,
        bytes calldata response,
        bytes calldata err
    ) external {
        IFunctionsClient(consumer).handleOracleFulfillment(requestId, response, err);
    }
}
