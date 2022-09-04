import { ethers } from "./lib/ethers.js";
import { AnyoneAuthenticator, PhonyERC20, Trader } from "./contracts.js";

const provider = new ethers.providers.JsonRpcProvider(
  `https://mainnet.infura.io/v3/${Deno.env.get("INFURA_PROJECT_ID")}`,
);

const weth = new ethers.Contract(
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  [],
  provider,
);
const usdc = new ethers.Contract(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  [
    ...PhonyERC20.abi,
    `function approve(address, uint256) returns (bool)`,
  ],
  provider,
);

const uniswapRouter = new ethers.Contract(
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  [`
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) returns (uint[] memory amounts)
  `],
  provider,
);

const settlement = new ethers.Contract(
  "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
  [`function authenticator() view returns (address)`],
  provider,
);

const trader = new ethers.Contract(
  "0x9A204e02DAdD8f5A89FC37E6F7627789615824Eb",
  Trader.abi,
  provider,
);

async function call(request, overrides, returnTypes) {
  const result = await provider
    .send("eth_call", [request, "latest", overrides])
    .catch((err) => {
      const { error: { message } } = JSON.parse(err.body);
      throw new Error(message.replace(/^execution reverted: /, ""));
    });
  return ethers.utils.defaultAbiCoder.decode(returnTypes, result);
}

function fu(amount, decimals = 18) {
  return ethers.utils.formatUnits(amount, decimals);
}

/* Simulate trade individually */

const [tradeGas, executedIn, executedOut] = await call(
  {
    to: trader.address,
    data: trader.interface.encodeFunctionData("trade", [
      usdc.address,
      weth.address,
      ethers.utils.parseUnits("1000.0", 6),
      uniswapRouter.address,
      uniswapRouter.address,
      uniswapRouter.interface.encodeFunctionData("swapExactTokensForTokens", [
        ethers.utils.parseUnits("1000.0", 6),
        ethers.constants.Zero,
        [usdc.address, weth.address],
        trader.address,
        ethers.constants.MaxUint256,
      ]),
    ]),
  },
  {
    [trader.address]: {
      code: `0x${Trader["bin-runtime"]}`,
    },
    [usdc.address]: {
      code: `0x${PhonyERC20["bin-runtime"]}`,
    },
    ["0x0000000000000000000000000000000000010000"]: {
      code: await provider.getCode(usdc.address),
    },
  },
  ["uint256", "uint256", "uint256"],
);

console.log(`trade used ${tradeGas} gas units`);
console.log(`${fu(executedIn, 6)} USDC -> ${fu(executedOut)} WETH`);

/* Simulate trade in settlement */

const [
  settlementGas,
  [traderIn, traderOut],
  [settlementIn, settlementOut],
] = await call(
  {
    to: trader.address,
    data: trader.interface.encodeFunctionData("settle", [
      [usdc.address, weth.address],
      [executedOut, executedIn],
      [
        [],
        [
          {
            target: usdc.address,
            value: 0,
            callData: usdc.interface.encodeFunctionData("approve", [
              settlement.address,
              ethers.constants.MaxUint256,
            ]),
          },
          {
            target: uniswapRouter.address,
            value: 0,
            callData: uniswapRouter.interface.encodeFunctionData(
              "swapExactTokensForTokens",
              [
                executedIn,
                ethers.constants.Zero,
                [usdc.address, weth.address],
                settlement.address,
                ethers.constants.MaxUint256,
              ],
            ),
          },
        ],
        [],
      ],
      executedIn,
    ]),
  },
  {
    [trader.address]: {
      code: `0x${Trader["bin-runtime"]}`,
    },
    [usdc.address]: {
      code: `0x${PhonyERC20["bin-runtime"]}`,
    },
    ["0x0000000000000000000000000000000000010000"]: {
      code: await provider.getCode(usdc.address),
    },
    [await settlement.authenticator()]: {
      code: `0x${AnyoneAuthenticator["bin-runtime"]}`,
    },
  },
  ["uint256", "int256[]", "int256[]"],
);

console.log(`settlement used ${settlementGas} gas units`);
console.table({
  trader: { sell: fu(traderIn, 6), buy: fu(traderOut) },
  settlement: { sell: fu(settlementIn, 6), buy: fu(settlementOut) },
});
