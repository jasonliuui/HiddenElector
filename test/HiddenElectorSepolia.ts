import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { expect } from "chai";
import { HiddenElector } from "../types";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("HiddenElectorSepolia", function () {
  let signer: HardhatEthersSigner;
  let contract: HiddenElector;
  let contractAddress: string;

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("HiddenElector");
      contractAddress = deployment.address;
      contract = await ethers.getContractAt("HiddenElector", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const signers: HardhatEthersSigner[] = await ethers.getSigners();
    signer = signers[0];
  });

  it("creates an election and records a vote", async function () {
    this.timeout(5 * 60 * 1000);

    const currentSeconds = Math.floor(Date.now() / 1000);
    const endTime = BigInt(currentSeconds + 900);

    const tx = await contract.connect(signer).createElection("Sepolia election", ["Yes", "No"], endTime);
    await tx.wait();

    const electionId = Number(await contract.getElectionCount()) - 1;
    const encryptedVote = await fhevm
      .createEncryptedInput(contractAddress, signer.address)
      .add32(0)
      .encrypt();

    const voteTx = await contract
      .connect(signer)
      .vote(electionId, encryptedVote.handles[0], encryptedVote.inputProof);
    await voteTx.wait();

    const voted = await contract.hasAddressVoted(electionId, signer.address);
    expect(voted).to.eq(true);
  });
});
