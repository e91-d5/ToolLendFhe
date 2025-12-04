// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ToolLendFhe is SepoliaConfig {
    struct EncryptedTool {
        uint256 id;
        address owner;
        euint32 toolType;
        euint32 availability;
        euint32 depositAmount;
        uint256 timestamp;
    }

    struct EncryptedRequest {
        uint256 id;
        uint256 toolId;
        address requester;
        euint32 duration;
        euint32 status; // 0-pending, 1-approved, 2-rejected
        uint256 timestamp;
    }

    struct EncryptedRating {
        uint256 id;
        uint256 toolId;
        euint32 score;
        euint32 feedback;
        uint256 timestamp;
    }

    uint256 public toolCount;
    uint256 public requestCount;
    uint256 public ratingCount;
    mapping(uint256 => EncryptedTool) public tools;
    mapping(uint256 => EncryptedRequest) public requests;
    mapping(uint256 => EncryptedRating) public ratings;
    mapping(address => uint256[]) public userTools;
    mapping(address => uint256[]) public userRequests;
    mapping(uint256 => uint256[]) public toolRatings;

    event ToolAdded(uint256 indexed id, address indexed owner, uint256 timestamp);
    event RequestSubmitted(uint256 indexed id, uint256 indexed toolId, uint256 timestamp);
    event RequestApproved(uint256 indexed id);
    event RequestRejected(uint256 indexed id);
    event RatingSubmitted(uint256 indexed id, uint256 indexed toolId, uint256 timestamp);

    modifier onlyOwner(uint256 toolId) {
        require(tools[toolId].owner == msg.sender, "Not tool owner");
        _;
    }

    modifier onlyRequester(uint256 requestId) {
        require(requests[requestId].requester == msg.sender, "Not requester");
        _;
    }

    function addTool(
        euint32 toolType,
        euint32 availability,
        euint32 depositAmount
    ) external {
        toolCount++;
        uint256 newId = toolCount;

        tools[newId] = EncryptedTool({
            id: newId,
            owner: msg.sender,
            toolType: toolType,
            availability: availability,
            depositAmount: depositAmount,
            timestamp: block.timestamp
        });

        userTools[msg.sender].push(newId);
        emit ToolAdded(newId, msg.sender, block.timestamp);
    }

    function requestTool(
        uint256 toolId,
        euint32 duration
    ) external {
        require(toolId <= toolCount, "Invalid tool");
        
        requestCount++;
        uint256 newId = requestCount;

        requests[newId] = EncryptedRequest({
            id: newId,
            toolId: toolId,
            requester: msg.sender,
            duration: duration,
            status: FHE.asEuint32(0),
            timestamp: block.timestamp
        });

        userRequests[msg.sender].push(newId);
        emit RequestSubmitted(newId, toolId, block.timestamp);
    }

    function approveRequest(uint256 requestId) external onlyOwner(requests[requestId].toolId) {
        requests[requestId].status = FHE.asEuint32(1);
        emit RequestApproved(requestId);
    }

    function rejectRequest(uint256 requestId) external onlyOwner(requests[requestId].toolId) {
        requests[requestId].status = FHE.asEuint32(2);
        emit RequestRejected(requestId);
    }

    function submitRating(
        uint256 toolId,
        euint32 score,
        euint32 feedback
    ) external onlyRequester(getUserRequestId(msg.sender, toolId)) {
        ratingCount++;
        uint256 newId = ratingCount;

        ratings[newId] = EncryptedRating({
            id: newId,
            toolId: toolId,
            score: score,
            feedback: feedback,
            timestamp: block.timestamp
        });

        toolRatings[toolId].push(newId);
        emit RatingSubmitted(newId, toolId, block.timestamp);
    }

    function getUserRequestId(address user, uint256 toolId) private view returns (uint256) {
        for (uint256 i = 0; i < userRequests[user].length; i++) {
            uint256 requestId = userRequests[user][i];
            if (requests[requestId].toolId == toolId) {
                return requestId;
            }
        }
        revert("No matching request");
    }

    function getToolRequests(uint256 toolId) external view onlyOwner(toolId) returns (uint256[] memory) {
        uint256[] memory result = new uint256[](requestCount);
        uint256 counter = 0;
        
        for (uint256 i = 1; i <= requestCount; i++) {
            if (requests[i].toolId == toolId) {
                result[counter] = i;
                counter++;
            }
        }

        uint256[] memory trimmedResult = new uint256[](counter);
        for (uint256 j = 0; j < counter; j++) {
            trimmedResult[j] = result[j];
        }

        return trimmedResult;
    }

    function getUserTools(address user) external view returns (uint256[] memory) {
        return userTools[user];
    }

    function getUserRequests(address user) external view returns (uint256[] memory) {
        return userRequests[user];
    }

    function getToolRatings(uint256 toolId) external view returns (uint256[] memory) {
        return toolRatings[toolId];
    }
}