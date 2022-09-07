import { ethers } from "./lib/ethers.js";
import {
  SETTLEMENT,
  simulateDirectTrade,
  simulateDirectTradeSettlement,
} from "./simulation.js";

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
  [`function balanceOf(address) view returns (uint256)`],
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

function fu(amount, decimals = 18) {
  return ethers.utils.formatUnits(amount, decimals);
}

for (
  const trader of [
    "0x9A204e02DAdD8f5A89FC37E6F7627789615824Eb",
    "0xA1cb7762F40318ee0260F53e15De835fF001cb7E",
  ]
) {
  console.log(`### TRADING WITH ${trader} ###`);
  const usdcIn = ethers.utils.parseUnits("1000.0", 6);
  const usdcBalance = await usdc.balanceOf(trader);
  const mint = usdcIn.gt(usdcBalance) ? usdcIn.sub(usdcBalance) : 0;

  console.log(`==> minting ${fu(mint, 6)} phonyUSDC`);

  const {
    gasUsed: tradeGas,
    balanceIn,
    balanceOut,
  } = await simulateDirectTrade(
    provider,
    {
      trader,
      tokenIn: usdc.address,
      tokenOut: weth.address,
      mint,
      spender: uniswapRouter.address,
      exchange: uniswapRouter.address,
      data: uniswapRouter.interface.encodeFunctionData(
        "swapExactTokensForTokens",
        [
          usdcIn,
          ethers.constants.Zero,
          [usdc.address, weth.address],
          trader,
          ethers.constants.MaxUint256,
        ],
      ),
    },
  );

  console.log(`trade used ${tradeGas} gas units`);
  console.table({
    trader: { sell: fu(balanceIn, 6), buy: fu(balanceOut) },
  });

  const {
    gasUsed: settlementGas,
    trader: {
      balanceIn: traderIn,
      balanceOut: traderOut,
    },
    settlement: {
      balanceIn: settlementIn,
      balanceOut: settlementOut,
    },
  } = await simulateDirectTradeSettlement(
    provider,
    {
      trader,
      tokenIn: usdc.address,
      tokenOut: weth.address,
      amountIn: usdcIn,
      amountOut: balanceOut,
      mint,
      spender: uniswapRouter.address,
      exchange: uniswapRouter.address,
      data: uniswapRouter.interface.encodeFunctionData(
        "swapExactTokensForTokens",
        [
          ethers.utils.parseUnits("1000.0", 6),
          ethers.constants.Zero,
          [usdc.address, weth.address],
          SETTLEMENT.address,
          ethers.constants.MaxUint256,
        ],
      ),
    },
  );

  console.log(`settlement used ${settlementGas} gas units`);
  console.table({
    trader: { sell: fu(traderIn, 6), buy: fu(traderOut) },
    settlement: { sell: fu(settlementIn, 6), buy: fu(settlementOut) },
  });
}
