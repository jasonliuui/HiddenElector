import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { HiddenElector, HiddenElector__factory } from "../types";

type Signers = {
  owner: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("HiddenElector")) as HiddenElector__factory;
  const contract = (await factory.deploy()) as HiddenElector;
  const address = await contract.getAddress();
  return { contract, address };
}

describe("HiddenElector", function () {
  let signers: Signers;
  let contract: HiddenElector;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { owner: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, address: contractAddress } = await deployFixture());
  });

  it("creates elections with the expected metadata", async function () {
    const now = await time.latest();
    const endTime = BigInt(now + 3600);
    const tx = await contract.createElection("Leadership Vote", ["Alice", "Bob"], endTime);
    await tx.wait();

    const count = await contract.getElectionCount();
    expect(count).to.eq(1n);

    const stored = await contract.getElection(0);
    expect(stored.name).to.eq("Leadership Vote");
    expect(stored.optionCount).to.eq(2);
    expect(stored.endTime).to.eq(endTime);
    expect(stored.options).to.deep.eq(["Alice", "Bob"]);
    expect(stored.finalized).to.eq(false);
  });

  it("increments encrypted tallies, blocks double votes, and exposes public tallies after finalization", async function () {
    const now = await time.latest();
    const endTime = BigInt(now + 60);
    await contract.createElection("Policy Vote", ["A", "B", "C"], endTime);

    const encrypt = async (signer: HardhatEthersSigner, choice: number) => {
      return fhevm.createEncryptedInput(contractAddress, signer.address).add32(choice).encrypt();
    };

    const aliceVote = await encrypt(signers.alice, 1);
    await contract.connect(signers.alice).vote(0, aliceVote.handles[0], aliceVote.inputProof);

    await expect(
      contract.connect(signers.alice).vote(0, aliceVote.handles[0], aliceVote.inputProof),
    ).to.be.revertedWithCustomError(contract, "AlreadyVoted");

    const bobVote = await encrypt(signers.bob, 1);
    await contract.connect(signers.bob).vote(0, bobVote.handles[0], bobVote.inputProof);

    expect(await contract.isTallyPublic(0, 1)).to.eq(false);

    await time.increase(120);
    await contract.finalizeElection(0);
    expect(await contract.isTallyPublic(0, 1)).to.eq(true);

    const encryptedTally = await contract.getEncryptedTally(0, 1);
    const result = await fhevm.publicDecryptEuint(FhevmType.euint32, encryptedTally);
    expect(result).to.eq(2n);
  });
});
