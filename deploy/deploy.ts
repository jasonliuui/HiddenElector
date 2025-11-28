import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const hiddenElector = await deploy("HiddenElector", {
    from: deployer,
    log: true,
  });

  console.log(`HiddenElector contract: `, hiddenElector.address);
};
export default func;
func.id = "deploy_hiddenElector"; // id required to prevent reexecution
func.tags = ["HiddenElector"];
