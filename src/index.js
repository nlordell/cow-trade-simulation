import { ethers } from "./lib/ethers.js";
import {
  SETTLEMENT,
  simulateDirectTrade,
  simulateDirectTradeRoundtrip,
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

const uniswapRouter = new ethers.Contract(
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  [
    `
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] path,
        address to,
        uint deadline
    ) returns (uint[] memory amounts)
    `,
    `
    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] path,
        address to,
        uint deadline
    ) returns (uint[] memory amounts)
    `,
  ],
  provider,
);

function fu(amount, decimals = 18) {
  return ethers.utils.formatUnits(amount, decimals);
}

async function report({
  token,
  trader,
  amount,
}) {
  const tokenInstance = new ethers.Contract(
    token,
    [
      `function balanceOf(address) view returns (uint256)`,
      `function decimals() view returns (uint256)`,
      `function symbol() view returns (string)`,
    ],
    provider,
  );

  const [tokenBalance, tokenDecimals, tokenSymbol] = await Promise.all([
    tokenInstance.balanceOf(trader),
    tokenInstance.decimals(),
    tokenInstance.symbol(),
  ]);
  const ft = (amount) => fu(amount, tokenDecimals);

  console.log(`### TRADING ${tokenSymbol} WITH ${trader} ###`);
  const tokenIn = ethers.utils.parseUnits(`${amount ?? 1}`, tokenDecimals);
  const mint = tokenIn.gt(tokenBalance) ? tokenIn.sub(tokenBalance) : 0;

  console.log(`==> minting ${ft(mint)} phony${tokenSymbol}`);

  const {
    gasUsed: tradeGas,
    balanceIn,
    balanceOut,
  } = await simulateDirectTrade(
    provider,
    {
      trader,
      tokenIn: token,
      tokenOut: weth.address,
      mint,
      spender: uniswapRouter.address,
      exchange: uniswapRouter.address,
      data: uniswapRouter.interface.encodeFunctionData(
        "swapExactTokensForTokens",
        [
          tokenIn,
          ethers.constants.Zero,
          [token, weth.address],
          trader,
          ethers.constants.MaxUint256,
        ],
      ),
    },
  );

  console.log(`trade used ${tradeGas} gas units`);
  console.table({
    trader: { sell: ft(balanceIn), buy: fu(balanceOut) },
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
      tokenIn: token,
      tokenOut: weth.address,
      amountIn: tokenIn,
      amountOut: balanceOut,
      mint,
      spender: uniswapRouter.address,
      exchange: uniswapRouter.address,
      data: uniswapRouter.interface.encodeFunctionData(
        "swapExactTokensForTokens",
        [
          tokenIn,
          ethers.constants.Zero,
          [token, weth.address],
          SETTLEMENT.address,
          ethers.constants.MaxUint256,
        ],
      ),
    },
  );

  console.log(`settlement used ${settlementGas} gas units`);
  console.table({
    trader: { sell: ft(traderIn), buy: fu(traderOut) },
    settlement: { sell: ft(settlementIn), buy: fu(settlementOut) },
  });

  await simulateDirectTradeRoundtrip(
    provider,
    {
      trader,
      native: weth.address,
      token: token,
      amountNative: ethers.utils.parseEther("1000.0"),
      amountToken: tokenIn,
      native2token: {
        spender: uniswapRouter.address,
        exchange: uniswapRouter.address,
        data: uniswapRouter.interface.encodeFunctionData(
          "swapTokensForExactTokens",
          [
            tokenIn,
            ethers.constants.MaxUint256,
            [weth.address, token],
            SETTLEMENT.address,
            ethers.constants.MaxUint256,
          ],
        ),
      },
      token2native: {
        spender: uniswapRouter.address,
        exchange: uniswapRouter.address,
        data: uniswapRouter.interface.encodeFunctionData(
          "swapExactTokensForTokens",
          [
            tokenIn,
            ethers.constants.Zero,
            [token, weth.address],
            SETTLEMENT.address,
            ethers.constants.MaxUint256,
          ],
        ),
      },
    },
  );
  console.log(`roundtrip successful`);
}

async function doReport(params) {
  try {
    await report(params);
  } catch (err) {
    console.error(`ERROR: ${err}`);
  }
}

await doReport({
  token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  trader: "0x9A204e02DAdD8f5A89FC37E6F7627789615824Eb",
  amount: 1000.0,
});
await doReport({
  token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  trader: "0xA1cb7762F40318ee0260F53e15De835fF001cb7E",
  amount: 1000.0,
});

await doReport({
  token: "0x5d493Ad22894C06BC2495eaae5F6339cF34Cf522",
  trader: "0x9A204e02DAdD8f5A89FC37E6F7627789615824Eb",
  amount: 1e6,
});
await doReport({
  token: "0x5d493Ad22894C06BC2495eaae5F6339cF34Cf522",
  trader: "0x8413f65e93d31f52706C301BCc86e0727FD7c025",
  amount: 1e6,
});
