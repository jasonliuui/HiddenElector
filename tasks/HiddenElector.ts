import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

type HiddenElectorTaskArgs = TaskArguments & {
  id?: string;
  name?: string;
  options?: string;
  duration?: string;
  choice?: string;
  address?: string;
};

function parseOptions(rawOptions?: string): string[] {
  if (!rawOptions) {
    return [];
  }
  return rawOptions
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function resolveHiddenElectorAddress(taskArguments: HiddenElectorTaskArgs, hre: any) {
  if (taskArguments.address) {
    return taskArguments.address;
  }
  const deployment = await hre.deployments.get("HiddenElector");
  return deployment.address;
}

task("task:address", "Prints the HiddenElector address").setAction(async function (_taskArguments, hre) {
  const address = await resolveHiddenElectorAddress(_taskArguments, hre);
  console.log("HiddenElector address is " + address);
});

task("task:create-election", "Creates a new encrypted election")
  .addParam("name", "Name for the election")
  .addParam("options", "Comma separated list of 2-8 options")
  .addParam("duration", "How many seconds from now until voting closes")
  .addOptionalParam("address", "Override HiddenElector address")
  .setAction(async function (taskArguments: HiddenElectorTaskArgs, hre) {
    const { ethers } = hre;
    const options = parseOptions(taskArguments.options);
    if (options.length < 2) {
      throw new Error("Please provide at least two options");
    }
    const duration = parseInt(taskArguments.duration ?? "0", 10);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("--duration must be a positive integer");
    }

    const address = await resolveHiddenElectorAddress(taskArguments, hre);
    const contract = await ethers.getContractAt("HiddenElector", address);
    const [signer] = await ethers.getSigners();
    const endTime = BigInt(Math.floor(Date.now() / 1000) + duration);
    const tx = await contract.connect(signer).createElection(taskArguments.name, options, endTime);
    console.log(`Creating election... tx: ${tx.hash}`);
    await tx.wait();
    console.log("Election created successfully");
  });

task("task:list-elections", "Lists all elections stored on-chain")
  .addOptionalParam("address", "Override HiddenElector address")
  .setAction(async function (taskArguments: HiddenElectorTaskArgs, hre) {
    const { ethers } = hre;
    const address = await resolveHiddenElectorAddress(taskArguments, hre);
    const contract = await ethers.getContractAt("HiddenElector", address);
    const total: bigint = await contract.getElectionCount();
    console.log(`Total elections: ${total}`);
    for (let i = 0n; i < total; i++) {
      const election = await contract.getElection(i);
      console.log(
        `#${i} "${election.name}" options=${election.optionCount} endsAt=${election.endTime} finalized=${election.finalized}`,
      );
    }
  });

task("task:vote", "Encrypts and submits a vote for an option index")
  .addParam("id", "Election id to vote for")
  .addParam("choice", "Index of the option you want to support")
  .addOptionalParam("address", "Override HiddenElector address")
  .setAction(async function (taskArguments: HiddenElectorTaskArgs, hre) {
    const { ethers, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const electionId = parseInt(taskArguments.id ?? "", 10);
    const choice = parseInt(taskArguments.choice ?? "", 10);
    if (!Number.isInteger(electionId)) {
      throw new Error("--id must be an integer");
    }
    if (!Number.isInteger(choice)) {
      throw new Error("--choice must be an integer");
    }

    const address = await resolveHiddenElectorAddress(taskArguments, hre);
    const contract = await ethers.getContractAt("HiddenElector", address);
    const [signer] = await ethers.getSigners();

    const encryptedChoice = await fhevm
      .createEncryptedInput(address, signer.address)
      .add32(choice)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .vote(electionId, encryptedChoice.handles[0], encryptedChoice.inputProof);
    console.log(`Submitting vote... tx: ${tx.hash}`);
    await tx.wait();
    console.log("Vote stored successfully");
  });

task("task:finalize", "Finalizes an election so tallies can be decrypted publicly")
  .addParam("id", "Election id to finalize")
  .addOptionalParam("address", "Override HiddenElector address")
  .setAction(async function (taskArguments: HiddenElectorTaskArgs, hre) {
    const { ethers } = hre;
    const electionId = parseInt(taskArguments.id ?? "", 10);
    if (!Number.isInteger(electionId)) {
      throw new Error("--id must be an integer");
    }
    const address = await resolveHiddenElectorAddress(taskArguments, hre);
    const contract = await ethers.getContractAt("HiddenElector", address);
    const [signer] = await ethers.getSigners();
    const tx = await contract.connect(signer).finalizeElection(electionId);
    console.log(`Finalizing election... tx: ${tx.hash}`);
    await tx.wait();
    console.log("Election finalized");
  });

task("task:decrypt-tallies", "Decrypts every tally for an election if it is public")
  .addParam("id", "Election id you want to inspect")
  .addOptionalParam("address", "Override HiddenElector address")
  .setAction(async function (taskArguments: HiddenElectorTaskArgs, hre) {
    const { ethers, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const electionId = parseInt(taskArguments.id ?? "", 10);
    if (!Number.isInteger(electionId)) {
      throw new Error("--id must be an integer");
    }

    const address = await resolveHiddenElectorAddress(taskArguments, hre);
    const contract = await ethers.getContractAt("HiddenElector", address);
    const election = await contract.getElection(electionId);

    console.log(`Decrypting tallies for "${election.name}"`);
    for (let i = 0; i < election.optionCount; i++) {
      const encryptedTally = await contract.getEncryptedTally(electionId, i);
      const clearValue = await fhevm.publicDecryptEuint(
        FhevmType.euint32,
        encryptedTally,
      );
      console.log(`Option[${i}] "${election.options[i]}" -> ${clearValue}`);
    }
  });
