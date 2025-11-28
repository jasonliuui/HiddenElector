# Hidden Elector

Privacy-preserving elections powered by Zama FHEVM. Hidden Elector lets anyone create, run, and finalize on-chain ballots where every vote stays encrypted until the election ends.

## Overview
- Create elections with 2-8 options, a clear closing time, and on-chain ownership.
- Voters encrypt their choice client-side through the Zama relayer; the contract never sees plaintext votes.
- Tallies remain encrypted during the vote, preventing early results or coercion.
- After the deadline, anyone can finalize the election, making tallies publicly decryptable so results become auditable.

## Problems This Project Solves
- **On-chain privacy**: Traditional smart contracts expose votes as plaintext transactions. Hidden Elector keeps ballots encrypted end-to-end until the election is closed.
- **Fairness during voting**: Because tallies are opaque until finalization, there is no information leak that could influence late voters.
- **Verifiable integrity**: Every action (create, vote, finalize) is on-chain, and final tallies can be publicly decrypted to confirm correctness.
- **Simple participation**: Voters only need a wallet on Sepolia; encryption and proof generation are handled automatically by the relayer SDK.

## Advantages
- **True confidentiality** with Fully Homomorphic Encryption (FHE) applied on-chain through Zama's FHEVM.
- **Deterministic rules** enforced by the contract: option bounds (2-8), future end time, no double voting, and immutable election metadata.
- **Separation of concerns**: Reads use viem for speed and safety; writes use ethers for wallet-friendly signing.
- **Ready for production testnet**: Includes deployment artifacts for Sepolia, Hardhat tasks, and a React + Vite frontend wired to the deployed ABI.
- **Transparent finalization**: Anyone can trigger finalization once the deadline passes, ensuring results cannot be suppressed by the creator.

## Tech Stack
- **Smart contracts**: Solidity 0.8.27, Hardhat, hardhat-deploy, @fhevm/solidity, @fhevm/hardhat-plugin.
- **Testing & tooling**: TypeScript, chai, hardhat-network-helpers, solidity-coverage, gas reporter, TypeChain (ethers v6).
- **Frontend**: React + Vite, RainbowKit/Wagmi (Sepolia only), viem (reads), ethers (writes), @zama-fhe/relayer-sdk (encryption/decryption). Styling is pure CSS (no Tailwind).
- **Deployment**: Sepolia via Infura RPC with a private key (no mnemonic). Deployment artifacts live in `deployments/sepolia/HiddenElector.json`.

## Project Layout
```
contracts/                HiddenElector.sol (FHE-enabled election logic)
deploy/                   Hardhat deployment scripts
tasks/                    CLI tasks for interacting with the contract
test/                     Unit and Sepolia integration tests
deployments/sepolia/      Generated address + ABI for Sepolia
app/                      React + Vite frontend (no env vars; Sepolia only)
docs/                     Zama FHE and relayer reference notes
```

## Smart Contract Capabilities
- Create elections with enforced constraints (2-8 options, future end time).
- Encrypted voting through `vote(...)` using `FHE.fromExternal` and access control set via `FHE.allowThis`.
- Per-option tallies stored as `euint32` and kept private until `finalizeElection(...)`.
- Finalization converts encrypted tallies to publicly decryptable ciphertext so anyone can reveal results.
- Read helpers: `getElection`, `getElectionCount`, `getEncryptedTally`, `hasAddressVoted`, `isTallyPublic`.

## Prerequisites
- Node.js 20+ and npm.
- An Infura API key for Sepolia.
- A deployer private key with Sepolia ETH (mnemonics are not used).

## Backend Setup
1) Install dependencies  
   ```bash
   npm install
   ```
2) Configure environment (`.env` in the repo root):  
   ```
   INFURA_API_KEY=your_infura_key
   PRIVATE_KEY=0xyour_private_key   # required for deployments
   ETHERSCAN_API_KEY=optional_for_verification
   ```
   The Hardhat config reads `INFURA_API_KEY` and `PRIVATE_KEY`; do not use a mnemonic.
3) Compile and typechain  
   ```bash
   npm run compile
   ```
4) Run tests (mock FHE on Hardhat)  
   ```bash
   npm run test
   ```
   For a live Sepolia check (requires a deployed contract):  
   ```bash
   npm run test:sepolia
   ```

## Local Development Loop
- Start a local chain with the FHE mock: `npm run chain`
- Deploy to the local chain: `npm run deploy:localhost`
- Rebuild types after changes: `npm run typechain`
- Lint and formatting checks: `npm run lint`

## Deploying to Sepolia
1) Ensure `.env` is set with `INFURA_API_KEY` and `PRIVATE_KEY`.  
2) Deploy:  
   ```bash
   npm run deploy:sepolia
   ```
3) (Optional) Verify on Etherscan:  
   ```bash
   npm run verify:sepolia -- <DEPLOYED_ADDRESS>
   ```
4) The generated ABI and address are in `deployments/sepolia/HiddenElector.json`. Copy that ABI and address into the frontend config (see below). The frontend must always use the ABI produced by the contract build.

## Hardhat Tasks (CLI)
All tasks accept `--network` (e.g., `--network sepolia`) and optionally `--address` to override the deployment address.
- Show the deployed address:  
  `npx hardhat task:address`
- Create an election:  
  `npx hardhat task:create-election --name "Board Vote" --options "Alice,Bob,Carol" --duration 3600`
- List elections:  
  `npx hardhat task:list-elections`
- Submit an encrypted vote (option index):  
  `npx hardhat task:vote --id 0 --choice 1`
- Finalize an election:  
  `npx hardhat task:finalize --id 0`
- Decrypt public tallies after finalization:  
  `npx hardhat task:decrypt-tallies --id 0`

## Frontend (React + Vite)
The UI lives in `app/` and targets Sepolia only (no localhost/network env vars).

1) Install dependencies  
   ```bash
   cd app
   npm install
   ```
2) Configure blockchain and encryption  
   - `src/config/contracts.ts`: set `hiddenElectorAddress` to the deployed Sepolia address and paste the ABI from `deployments/sepolia/HiddenElector.json`.  
   - `src/config/wagmi.ts`: set your WalletConnect `projectId`; chain is fixed to Sepolia.  
3) Run the app  
   ```bash
   npm run dev
   ```
   The app lets you create elections, submit encrypted votes, finalize closed elections, and decrypt public tallies via the Zama relayer SDK. Reads use viem; writes use ethers.

## Data Flow
1) Creator publishes an election on-chain with options and an end timestamp.  
2) Voters connect a wallet, encrypt their choice client-side via `@zama-fhe/relayer-sdk`, and submit the ciphertext handle to `vote(...)`.  
3) Tallies accumulate in encrypted form; view calls expose only ciphertext.  
4) After the deadline, anyone calls `finalizeElection(...)`, making tallies publicly decryptable.  
5) Users (or the UI) request public decryption to reveal clear counts.

## Roadmap / Future Work
- Multi-language UI and improved accessibility.
- Additional result views (percentage charts) after decryption.
- Indexer/subgraph integration for faster election discovery.
- Admin/DAO hooks for coordinated finalization or pause rules.
- Gas and storage optimizations as FHEVM tooling evolves.

## License
BSD-3-Clause-Clear. See `LICENSE` for details.
