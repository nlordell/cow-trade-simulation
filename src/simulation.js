import { ethers } from "./lib/ethers.js";
import { AnyoneAuthenticator, PhonyERC20, Trader } from "./contracts.js";

export const SETTLEMENT = new ethers.Contract(
  "0x9008D19f58AAbD9eD0D60971565AA8510560ab41",
  [`function authenticator() view returns (address)`],
);

const TRADER = new ethers.utils.Interface(Trader.abi);

const ERC20 = new ethers.utils.Interface(
  [`function approve(address, uint256) returns (bool)`],
);

async function call(provider, request, overrides, returnTypes) {
  const result = await provider
    .send("eth_call", [request, "latest", overrides])
    .catch((err) => {
      const { error: { message } } = JSON.parse(err.body);
      throw new Error(message.replace(/^execution reverted: /, ""));
    });
  return ethers.utils.defaultAbiCoder.decode(returnTypes, result);
}

async function phonyTokenOverrides(provider, token, mint) {
  return ethers.BigNumber.from(mint ?? 0).gt(0)
    ? {
      [token]: {
        code: `0x${PhonyERC20["bin-runtime"]}`,
      },
      ["0x0000000000000000000000000000000000010000"]: {
        code: await provider.getCode(token),
      },
    }
    : {};
}

function directTradeInteractions({
  tokenIn,
  spender,
  exchange,
  data,
}) {
  return [
    [{
      target: tokenIn,
      value: 0,
      callData: ERC20.encodeFunctionData("approve", [
        spender,
        ethers.constants.MaxUint256,
      ]),
    }],
    [{
      target: exchange,
      value: 0,
      callData: data,
    }],
  ];
}

export async function simulateTrade(
  provider,
  {
    trader,
    tokenIn,
    tokenOut,
    interactions,
    mint,
  },
) {
  const [gasUsed, balanceIn, balanceOut] = await call(
    provider,
    {
      from: trader,
      to: trader,
      data: TRADER.encodeFunctionData("trade", [
        tokenIn,
        tokenOut,
        interactions,
        mint ?? 0,
      ]),
    },
    {
      [trader]: {
        code: `0x${Trader["bin-runtime"]}`,
      },
      ...await phonyTokenOverrides(provider, tokenIn, mint),
    },
    ["uint256", "int256", "int256"],
  );

  return { gasUsed, balanceIn, balanceOut };
}

export async function simulateSettlement(
  provider,
  {
    trader,
    tokens,
    clearingPrices,
    interactions,
    mint,
  },
) {
  const [gasUsed, traderBalances, settlementBalances] = await call(
    provider,
    {
      from: trader,
      to: trader,
      data: TRADER.encodeFunctionData("settle", [
        tokens,
        clearingPrices,
        interactions,
        mint ?? 0,
      ]),
    },
    {
      [trader]: {
        code: `0x${Trader["bin-runtime"]}`,
      },
      [await SETTLEMENT.connect(provider).authenticator()]: {
        code: `0x${AnyoneAuthenticator["bin-runtime"]}`,
      },
      ...await phonyTokenOverrides(provider, tokens[0], mint),
    },
    ["uint256", "int256[]", "int256[]"],
  );

  return { gasUsed, traderBalances, settlementBalances };
}

export async function simulateRoundtrip(
  provider,
  {
    trader,
    native,
    token,
    amountNative,
    amountToken,
    native2token,
    token2native,
  },
) {
  await call(
    provider,
    {
      from: trader,
      to: trader,
      data: TRADER.encodeFunctionData("roundtrip", [
        native,
        token,
        amountToken,
        native2token,
        token2native,
      ]),
    },
    {
      [trader]: {
        code: `0x${Trader["bin-runtime"]}`,
        balance: ethers.BigNumber.from(amountNative)
          .toHexString()
          .replace(/^0x0*/, "0x"),
      },
      [await SETTLEMENT.connect(provider).authenticator()]: {
        code: `0x${AnyoneAuthenticator["bin-runtime"]}`,
      },
    },
    [],
  );
}

export async function simulateDirectTrade(
  provider,
  {
    trader,
    tokenIn,
    tokenOut,
    mint,
    spender,
    exchange,
    data,
  },
) {
  return await simulateTrade(
    provider,
    {
      trader,
      tokenIn,
      tokenOut,
      interactions: directTradeInteractions({
        tokenIn,
        spender,
        exchange,
        data,
      }),
      mint,
    },
  );
}

export async function simulateDirectTradeSettlement(
  provider,
  {
    trader,
    tokenIn,
    tokenOut,
    amountIn,
    amountOut,
    mint,
    spender,
    exchange,
    data,
  },
) {
  const {
    gasUsed,
    traderBalances,
    settlementBalances,
  } = await simulateSettlement(
    provider,
    {
      trader,
      tokens: [tokenIn, tokenOut],
      clearingPrices: [amountOut, amountIn],
      interactions: [
        ...directTradeInteractions({
          tokenIn,
          spender,
          exchange,
          data,
        }),
        [],
      ],
      mint,
    },
  );

  return {
    gasUsed,
    trader: {
      balanceIn: traderBalances[0],
      balanceOut: traderBalances[1],
    },
    settlement: {
      balanceIn: settlementBalances[0],
      balanceOut: settlementBalances[1],
    },
  };
}

export async function simulateDirectTradeRoundtrip(
  provider,
  {
    trader,
    native,
    token,
    amountNative,
    amountToken,
    native2token,
    token2native,
  },
) {
  await simulateRoundtrip(
    provider,
    {
      trader,
      native,
      token,
      amountNative,
      amountToken,
      native2token: [
        ...directTradeInteractions({
          tokenIn: native,
          ...native2token,
        }),
        [],
      ],
      token2native: [
        ...directTradeInteractions({
          tokenIn: token,
          ...token2native,
        }),
        [],
      ],
    },
  );
}
