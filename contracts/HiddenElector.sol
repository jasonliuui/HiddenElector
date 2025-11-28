// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title HiddenElector
/// @notice Manages encrypted elections where votes remain private until finalization.
contract HiddenElector is ZamaEthereumConfig {
    uint8 public constant MIN_OPTIONS = 2;
    uint8 public constant MAX_OPTIONS = 8;

    struct Election {
        string name;
        uint64 endTime;
        bool finalized;
        address creator;
        string[] options;
    }

    struct ElectionView {
        string name;
        uint64 endTime;
        bool finalized;
        address creator;
        uint8 optionCount;
        string[] options;
    }

    error ElectionNotFound();
    error InvalidOptionCount();
    error EmptyOption();
    error InvalidEndTime();
    error AlreadyVoted();
    error ElectionAlreadyFinalized();
    error ElectionOngoing();
    error InvalidOption();
    error ElectionClosed();

    uint256 private _nextElectionId;
    mapping(uint256 => Election) private _elections;
    mapping(uint256 => mapping(uint8 => euint32)) private _tallies;
    mapping(uint256 => mapping(address => bool)) private _hasVoted;

    event ElectionCreated(uint256 indexed electionId, address indexed creator, string name, uint64 endTime);
    event VoteSubmitted(uint256 indexed electionId, address indexed voter);
    event ElectionFinalized(uint256 indexed electionId, uint64 finalizedAt);

    /// @notice Creates a new election with the provided configuration.
    function createElection(string calldata name, string[] calldata options, uint64 endTime) external returns (uint256) {
        if (bytes(name).length == 0) {
            revert EmptyOption();
        }
        if (endTime <= block.timestamp) {
            revert InvalidEndTime();
        }
        if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
            revert InvalidOptionCount();
        }

        uint256 electionId = _nextElectionId++;
        Election storage election = _elections[electionId];
        election.name = name;
        election.endTime = endTime;
        election.creator = msg.sender;

        for (uint256 i = 0; i < options.length; i++) {
            if (bytes(options[i]).length == 0) {
                revert EmptyOption();
            }
            election.options.push(options[i]);
        }

        emit ElectionCreated(electionId, msg.sender, name, endTime);
        return electionId;
    }

    /// @notice Allows a wallet to submit an encrypted vote.
    function vote(uint256 electionId, externalEuint32 encryptedChoice, bytes calldata inputProof) external {
        Election storage election = _requireElection(electionId);

        if (block.timestamp >= election.endTime) {
            revert ElectionClosed();
        }
        if (election.finalized) {
            revert ElectionAlreadyFinalized();
        }
        if (_hasVoted[electionId][msg.sender]) {
            revert AlreadyVoted();
        }

        euint32 choice = FHE.fromExternal(encryptedChoice, inputProof);
        uint8 optionCount = uint8(election.options.length);
        euint32 one = FHE.asEuint32(1);
        euint32 zero = FHE.asEuint32(0);

        for (uint8 i = 0; i < optionCount; i++) {
            ebool matches = FHE.eq(choice, FHE.asEuint32(i));
            euint32 delta = FHE.select(matches, one, zero);
            _tallies[electionId][i] = FHE.add(_tallies[electionId][i], delta);
            FHE.allowThis(_tallies[electionId][i]);
        }

        _hasVoted[electionId][msg.sender] = true;
        emit VoteSubmitted(electionId, msg.sender);
    }

    /// @notice Finalizes an election and marks its tallies as public.
    function finalizeElection(uint256 electionId) external {
        Election storage election = _requireElection(electionId);

        if (block.timestamp < election.endTime) {
            revert ElectionOngoing();
        }
        if (election.finalized) {
            revert ElectionAlreadyFinalized();
        }

        uint8 optionCount = uint8(election.options.length);
        for (uint8 i = 0; i < optionCount; i++) {
            euint32 tally = _tallies[electionId][i];
            if (!FHE.isInitialized(tally)) {
                tally = FHE.asEuint32(0);
            }
            _tallies[electionId][i] = FHE.makePubliclyDecryptable(tally);
        }

        election.finalized = true;
        emit ElectionFinalized(electionId, uint64(block.timestamp));
    }

    /// @notice Returns how many elections were created.
    function getElectionCount() external view returns (uint256) {
        return _nextElectionId;
    }

    /// @notice Returns metadata for an election.
    function getElection(uint256 electionId) external view returns (ElectionView memory) {
        Election storage election = _requireElection(electionId);
        uint8 optionCount = uint8(election.options.length);
        string[] memory options = new string[](optionCount);
        for (uint256 i = 0; i < optionCount; i++) {
            options[i] = election.options[i];
        }
        return ElectionView({
            name: election.name,
            endTime: election.endTime,
            finalized: election.finalized,
            creator: election.creator,
            optionCount: optionCount,
            options: options
        });
    }

    /// @notice Returns the encrypted tally for an option.
    function getEncryptedTally(uint256 electionId, uint8 optionIndex) external view returns (euint32) {
        _requireValidOption(electionId, optionIndex);
        return _tallies[electionId][optionIndex];
    }

    /// @notice Returns whether an address has voted in an election.
    function hasAddressVoted(uint256 electionId, address voter) external view returns (bool) {
        _requireElection(electionId);
        return _hasVoted[electionId][voter];
    }

    /// @notice Tells whether an option tally can be publicly decrypted.
    function isTallyPublic(uint256 electionId, uint8 optionIndex) external view returns (bool) {
        _requireValidOption(electionId, optionIndex);
        return FHE.isPubliclyDecryptable(_tallies[electionId][optionIndex]);
    }

    function _requireElection(uint256 electionId) private view returns (Election storage election) {
        election = _elections[electionId];
        if (bytes(election.name).length == 0) {
            revert ElectionNotFound();
        }
    }

    function _requireValidOption(uint256 electionId, uint8 optionIndex) private view {
        Election storage election = _requireElection(electionId);
        if (optionIndex >= election.options.length) {
            revert InvalidOption();
        }
    }
}
