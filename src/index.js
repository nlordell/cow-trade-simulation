import { ethers } from "./lib/ethers.js";
import { load, loadSettlement } from "./contracts.js";

const provider = new ethers.providers.JsonRpcProvider(Deno.env.get("NODE_URL"));

const token = "0x5d493Ad22894C06BC2495eaae5F6339cF34Cf522";
const holder = "0x8413f65e93d31f52706C301BCc86e0727FD7c025";
const context = {
  token: "0x1111111111111111111111111111111111111111",
  pool: "0x2222222222222222222222222222222222222222",
  //pool: "0x22B5a4C3EE84E95C6b6CaE21B7f9413B68e486b0",
};
const amount = ethers.utils.parseUnits("1.0", 18);

const settlement = loadSettlement().connect(provider);
const trader = load("Trader");
const dummy = load("Dummy");

try {
  const [result] = ethers.utils.defaultAbiCoder.decode(
    ["bytes4"],
    await provider.send("eth_call", [
      {
        to: holder,
        data: trader.encodeFunctionData("execute", [token, amount, context]),
      },
      "latest",
      {
        [holder]: { code: trader.bin },
        [context.token]: { code: dummy.bin },
        [context.pool]: { code: dummy.bin },
        [await settlement.authenticator()]: { code: dummy.bin },
      },
    ]).catch((err) => {
      const { error: { message } } = JSON.parse(err.body);
      throw new Error(message.replace(/^execution reverted: /, ""));
    }),
  );

  if (result != trader.getSighash("execute")) {
    throw new Error(`unexpected result ${result}`);
  }

  console.log("OK");
} catch (err) {
  console.log(`Err: ${err.message}`);
  Deno.exit(1);
}
