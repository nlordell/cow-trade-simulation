import { ethers } from "./lib/ethers.js";

function buildPath(file) {
  return `contracts/build/${file}`;
}

export function load(name) {
  const abi = JSON.parse(Deno.readTextFileSync(buildPath(`${name}.abi`)));
  const bin = `0x${Deno.readTextFileSync(buildPath(`${name}.bin-runtime`))}`;

  const contract = new ethers.utils.Interface(abi);
  contract.bin = bin;

  return contract;
}

export function loadSettlement() {
  const abi = JSON.parse(Deno.readTextFileSync(buildPath("ISettlement.abi")));
  return new ethers.Contract("0x9008D19f58AAbD9eD0D60971565AA8510560ab41", abi);
}
