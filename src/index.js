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
    `function factory() view returns (address)`,
    `function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] path,
        address to,
        uint deadline
    ) returns (uint[] amounts)`,
    `function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] path,
        address to,
        uint deadline
    ) returns (uint[] amounts)`,
  ],
  provider,
);
const uniswapFactory = new ethers.Contract(
  await uniswapRouter.factory(),
  [`function getPair(address tokenA, address tokenB) view returns (address pair)`],
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
  amount = amount ?? 1;

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
  const tokenIn = ethers.utils.parseUnits(`${amount}`, tokenDecimals);
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

async function isSupported(token) {
  const trader = "0x9A204e02DAdD8f5A89FC37E6F7627789615824Eb";
  const tokenInstance = new ethers.Contract(
    token,
    [`function decimals() view returns (uint256)`],
    provider,
  );

  try {
    if (
      await uniswapFactory.getPair(token, weth.address) ==
        ethers.constants.AddressZero
    ) {
      console.log(`SKIP:  ${token}`);
      return;
    }

    const tokenDecimals = await tokenInstance.decimals();
    const tokenIn = ethers.utils.parseUnits("1000000.0", tokenDecimals);

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

    console.log(`OK:    ${token}`);
    return true;
  } catch (err) {
    console.error(`ERROR: ${token} ${err.message}`);
    return false;
  }
}

await report({
  token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  trader: "0x9A204e02DAdD8f5A89FC37E6F7627789615824Eb",
  amount: 1000.0,
});

await report({
  token: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  trader: "0xA1cb7762F40318ee0260F53e15De835fF001cb7E",
  amount: 1000.0,
});

await report({
  token: "0x5d493Ad22894C06BC2495eaae5F6339cF34Cf522",
  trader: "0x8413f65e93d31f52706C301BCc86e0727FD7c025",
});

console.log(`### VERIFYING TOKENS ###`);
const goodTokens = [];
for (
  const token of [
    "0x0000852600ceb001e08e00bc008be620d60031f2",
    "0x0027449Bf0887ca3E431D263FFDeFb244D95b555",
    "0x0189d31f6629c359007f72b8d5ec8fa1c126f95c",
    "0x01995786f1435743c42b7f2276c496a610b58612",
    "0x06f65b8cfcb13a9fe37d836fe9708da38ecb29b2",
    "0x072c46f392e729c1f0d92a307c2c6dba06b5d078",
    "0x074545177a36ab81aac783211f25e14f1ed03c2b",
    "0x07be1ead7aebee544618bdc688fa3cff09857c32",
    "0x0858a26055d6584e5b47bbecf7f7e8cbc390995b",
    "0x0aacfbec6a24756c20d41914f2caba817c0d8521",
    "0x0ba45a8b5d5575935b8158a88c631e9f9c95a2e5",
    "0x0c6f0f339e0fb37761e2ff30a853c23f0455edd6",
    "0x0e239dB593619bcF6248FdeF4723f26cf40e1f37",
    "0x0e69d0a2bbb30abcb7e5cfea0e4fde19c00a8d47",
    "0x0ee646F5ae323A2a5a6266D3C01cd7416Ea909C8",
    "0x1016f3c0a1939fa27538339da7e2a300031b6f37",
    "0x106552c11272420aad5d7e94f8acab9095a6c952",
    "0x106d3c66d22d2dd0446df23d7f5960752994d600",
    "0x10994aa2fb8e6ba5d9fb2bc127ff228c4fe6167f",
    "0x10ba8c420e912bf07bedac03aa6908720db04e0c",
    "0x11afe7fa792589dd1236257f99ba09f510460ad9",
    "0x12a326a3dd63c2fb2184cf58b827ae0b67c8277a",
    "0x1337def18c680af1f9f45cbcab6309562975b1dd",
    "0x133B8f31ABA904294A95CD6477633b593F019818",
    "0x1341a2257fa7b770420ef70616f888056f90926c",
    "0x134f18a6864eFb61eA8636D1bDB0cc3C4c8FD797",
    "0x13945e3908ac09f682d2770d764542ab23001cf7",
    "0x1426cc6d52d1b14e2b3b1cb04d57ea42b39c4c7c",
    "0x1492e70035c1f57c3be0b409385ed58c177aed46",
    "0x14dd7ebe6cb084cb73ef377e115554d47dc9d61e",
    "0x1529d38ec383c9157d2547456428735e1e9898bb",
    "0x15874d65e649880c2614e7a480cb7c9a55787ff6",
    "0x1681bcb589b3cfcf0c0616b0ce9b19b240643dc1",
    "0x1715ac0743102bf5cd58efbb6cf2dc2685d967b6",
    "0x17a459bff9277e945354fc32b2daef5211fe801b",
    "0x18bdfc80b97cb97f6b466cce967849ce9cd9d58c",
    "0x1b9baf2a3edea91ee431f02d449a1044d5726669",
    "0x1e0fad3fc0fd2d1479bc5a5e09c6b88a3426fd7f",
    "0x201d6110063c9e119af9e70f07bcb2c98fb2e936",
    "0x203dc38c94f26256d8f298079b5bccc1e360874c",
    "0x2129ff6000b95a973236020bcd2b2006b0d8e019",
    "0x22e845cbbafda629c0401de5f23e3f73b0cfa68a",
    "0x239dc02a28a0774738463e06245544a72745d5c5",
    "0x251457b7c5d85251Ca1aB384361c821330bE2520",
    "0x25a1de1c3ee658fe034b8914a1d8d34110423af8",
    "0x26a79bd709a7ef5e5f747b8d8f83326ea044d8cc",
    "0x289d5488ab09f43471914e572ec9e3651c735af2",
    "0x298d492e8c1d909d3f63bc4a36c66c64acb3d695",
    "0x2b1fe2cea92436e8c34b7c215af66aaa2932a8b2",
    "0x2ece1e3fcb52bc47d99ed4427bb37a6011594388",
    "0x2efc83c953f7a6a059744270c358edd6162f89d7",
    "0x30dcBa0405004cF124045793E1933C798Af9E66a",
    "0x3125c70e2de274e5347898dfd277b9549ea9e434",
    "0x31acf54fae6166dc2f90c4d6f20d379965e96bc1",
    "0x322a46e88fa3c78f9c9e3dbb0254b61664a06109",
    "0x32c868f6318d6334b2250f323d914bc2239e4eee",
    "0x333853a7ff34931e816a99471412bd83bef31188",
    "0x33f128394af03db639107473e52d84ff1290499e",
    "0x3506b7eff28e41ff0746a432897777973cfb2d46",
    "0x37611b28aca5673744161dc337128cfdd2657f69",
    "0x389999216860ab8e0175387a0c90e5c52522c945",
    "0x39b8523fa094b0dc045e2c3e5dff34b3f2ca6220",
    "0x3a6fe4c752eb8d571a660a776be4003d619c30a3",
    "0x3a9fff453d50d4ac52a6890647b823379ba36b9e",
    "0x3b78fa671698e6a6fb7956937b64550d95966606",
    "0x3ea50b7ef6a7eaf7e966e2cb72b519c16557497c",
    "0x3fca773d13f831753ec3ae9f39ad4a6814ebb695",
    "0x3fea51daab1672d3385f6af02980e1462ca0687b",
    "0x41933422dc4a1cb8c822e06f12f7b52fa5e7e094",
    "0x45734927fa2f616fbe19e65f42a0ef3d37d1c80a",
    "0x45804880de22913dafe09f4980848ece6ecbaf78",
    "0x45d0749A4E355495c675673D4f3B36A67aA08046",
    "0x48be867b240d2ffaff69e0746130f2c027d8d3d2",
    "0x48ee738ad62f64b6c38af21d24277100127e761e",
    "0x4922a015c4407f87432b179bb209e125432e4a2a",
    "0x4a6be56a211a4c4e0dd4474d524138933c17f3e3",
    "0x4b86e0295e7d32433ffa6411b82b4f4e56a581e1",
    "0x4b92d19c11435614cd49af1b589001b7c08cd4d5",
    "0x4ba6ddd7b89ed838fed25d208d4f644106e34279",
    "0x4bae380b5d762d543d426331b8437926443ae9ec",
    "0x4bcddfcfa8cb923952bcf16644b36e5da5ca3184",
    "0x4c9d5672ae33522240532206ab45508116daf263",
    "0x4f0fe00d1ba047c39a1d9d6aed426e20f1b39abf",
    "0x4f5814839B651b64F82c081D4A3A1F356bBEdD3A",
    "0x4f9254c83eb525f9fcf346490bbb3ed28a81c667",
    "0x4fab740779c73aa3945a5cf6025bf1b0e7f6349c",
    "0x51d3e4c0b2c83e62f5d517d250b3e856897d2052",
    "0x53ba22cb4e5e9c1be0d73913764f572192a71aca",
    "0x56de8bc61346321d4f2211e3ac3c0a7f00db9b76",
    "0x574dAf1a7a51bBD20bF7f2A43d91aC6690f40e07",
    "0x576097fa17e1f702bb9167f0f08f2ea0898a3ea5",
    "0x577e7f9fa80ab33e87a01b701114257c8d9455a8",
    "0x586c680e9a6d21b81ebecf46d78844dab7b3bcf9",
    "0x5d0fa08aeb173ade44b0cf7f31d506d8e04f0ac8",
    "0x5e6fcd3f4ae535e43e60e28de4b754b41c9824a7",
    "0x5e8d14d666fe539e9ae86dd48e87f1750ad7e08a",
    "0x5f474906637bdcda05f29c74653f6962bb0f8eda",
    "0x5fe8c486b5f216b9ad83c12958d8a03eb3fd5060",
    "0x62095b9570e39ca68a9f9c375fbbcac75c13165a",
    "0x62359ed7505efc61ff1d56fef82158ccaffa23d7",
    "0x63120ccd7b415743e8753afd167f5ad4a1732c43",
    "0x63454d31e6bbb7ef305b485115c941bb78ca3a48",
    "0x63d0eea1d7c0d1e89d7e665708d7e8997c0a9ed6",
    "0x66d31def9c47b62184d7f57175eed5b5d9b7f038",
    "0x671ab077497575dcafb68327d2d2329207323e74",
    "0x685aea4f02e39e5a5bb7f7117e88db1151f38364",
    "0x685EeE8A295dc9B01A913948B0919cE1817d41C4",
    "0x68e0a48d3bff6633a31d1d100b70f93c3859218b",
    "0x69692d3345010a207b759a7d1af6fc7f38b35c5e",
    "0x6a00b86e30167f73e38be086081b80213e8266aa",
    "0x6b8e77d3db1faa17f7b24c24242b6a1eb5008a16",
    "0x6c3f90f043a72fa612cbac8115ee7e52bde6e490",
    "0x6dDC10f9F5E391b13C3D3BcB8B8F173B6390938D",
    "0x6e10aacb89a28d6fa0fe68790777fec7e7f01890",
    "0x6fcb6408499a7c0f242e32d77eb51ffa1dd28a7e",
    "0x7119750244A7Aa411CB92dFc0BBCA64474471719",
    "0x714599f7604144a3fe1737c440a70fc0fd6503ea",
    "0x74fd51a98a4a1ecbef8cc43be801cce630e260bd",
    "0x75fef397d74a2d11b64e6915cd847c1e7f8e5520",
    "0x76851a93977bea9264c32255b6457882035c7501",
    "0x76c84e800d12604a39f7ad724d3cd78ab5ea8853",
    "0x79ba92dda26fce15e1e9af47d5cfdfd2a093e000",
    "0x79c7fa5d113893b172b6db053b83d617c2551a88",
    "0x7ae29d59720239a37e59271675a3eec833be46f3",
    "0x7f0f118d083d5175ab9d2d34c4c8fa4f43c3f47b",
    "0x7ff4169a6b5122b664c51c95727d87750ec07c84",
    "0x801ea8c463a776e85344c565e355137b5c3324cd",
    "0x8254e26e453eb5abd29b3c37ac9e8da32e5d3299",
    "0x8712a5580995a1b0e10856e8c3e26b14c1cdf7b6",
    "0x8807e69dc04155af64172cd6f0b4738f8068d0d4",
    "0x8854713db6ef34ec3ecf0876a742fe72da377bd3",
    "0x887168120cb89fb06f3e74dc4af20d67df0977f6",
    "0x88ef27e69108b2633f8e1c184cc37940a075cc02",
    "0x8a74bc8c372bc7f0e9ca3f6ac0df51be15aec47a",
    "0x8bdf93a8adc01eba2f760bdb3f392d92167a07f0",
    "0x8c7424c3000942e5a93de4a01ce2ec86c06333cb",
    "0x8db1d28ee0d822367af8d220c0dc7cb6fe9dc442",
    "0x8eb24319393716668d768dcec29356ae9cffe285",
    "0x909ddd2d01aa82ca9fb856d7720f9358d46092da",
    "0x910524678c0b1b23ffb9285a81f99c29c11cbaed",
    "0x910985ffa7101bf5801dd2e91555c465efd9aab3",
    "0x918da91ccbc32b7a6a0cc4ecd5987bbab6e31e6d",
    "0x925f2c11b99c1a4c46606898ee91ed3d450cfeda",
    "0x92d6c1e31e14520e676a687f0a93788b716beff5",
    "0x944eee930933be5e23b690c8589021ec8619a301",
    "0x94987bc8aa5f36cb2461c190134929a29c3df726",
    "0x96dd2c778fb281294fa9c1d2b8af3b47369306f2",
    "0x97ad070879be5c31a03a1fe7e35dfb7d51d0eef1",
    "0x97b65710d03e12775189f0d113202cc1443b0aa2",
    "0x980a64e33e4c5cc6d5179e00e4606839ae7bf94b",
    "0x98ecf3d8e21adaafe16c00cc3ff681e72690278b",
    "0x99043bb680ab9262c7b2ac524e00b215efb7db9b",
    "0x99ddddd8dfe33905338a073047cfad72e6833c06",
    "0x9a514389172863f12854ad40090aa4b928028542",
    "0x9af15d7b8776fa296019979e70a5be53c714a7ec",
    "0x9ea3b5b4ec044b70375236a281986106457b20ef",
    "0x9f41da75ab2b8c6f0dcef7173c4bf66bd4f6b36a",
    "0xa0335820dc549dbfae5b8d691331cadfca7026e0",
    "0xa03f1250aa448226ed4066d8d1722ddd8b51df59",
    "0xa2b4c0af19cc16a6cfacce81f192b024d625817d",
    "0xa3509a16bbfc5992eb01cc861b615ccd8e937da8",
    "0xa3e059c0b01f07f211c85bf7b4f1d907afb011df",
    "0xa407739423a8cd9719cb408c2db071cb46f4c7c6",
    "0xa47c8bf37f92abed4a126bda807a7b7498661acd",
    "0xa5959e9412d27041194c3c3bcbe855face2864f7",
    "0xa6610ed604047e7b76c1da288172d15bcda57596",
    "0xa693b19d2931d498c5b318df961919bb4aee87a5",
    "0xa767db9701fe2ac7c10c60651018333c6c0a3340",
    "0xa89dc2a9e3061d09966adc28a9eaa3fad08ef22c",
    "0xa9a8377287ea9c6b8b4249dd502e75d34148fc5b",
    "0xAb5bf953040628277eb7EC5090f38325D7C132B5",
    "0xadaa92cba08434c22d036c4115a6b3d7e2b5569b",
    "0xadb0739822374a05653f513683ddbeba3cc81f2e",
    "0xaee53701e18d5ff6af4964c3a381e7d09b9b9075",
    "0xb1ec55536b2c0ba575c4bc8ff96046eec3027d31",
    "0xB4bFDEE9DDe791F1416DB37FB857cff18ba7ba15",
    "0xb68f32410a7dd4cf7a1ae18c6b6ddefa2eed80b3",
    "0xb86c2e47b8a4e23650d2f771f1be29e56fb99c68",
    "0xb893a8049f250b57efa8c62d51527a22404d7c9a",
    "0xb8c77482e45f1f44de1745f52c74426c631bdd52",
    "0xb8e3bb633f7276cc17735d86154e0ad5ec9928c0",
    "0xb90d6bec20993be5d72a5ab353343f7a0281f158",
    "0xb96f0e9bb32760091eb2d6b0a5ca0d2c7b5644b1",
    "0xba7435a4b4c747e0101780073eeda872a69bdcd4",
    "0xbae5f2d8a1299e5c4963eaff3312399253f27ccb",
    "0xbcca60bb61934080951369a648fb03df4f96263c",
    "0xbd36b14c63f483b286c7b49b6eaffb2fe10aabc4",
    "0xbdea5bb640dbfc4593809deec5cdb8f99b704cd2",
    "0xbf04e48c5d8880306591ef888cde201d3984eb3e",
    "0xbf25ea982b4f850dafb4a95367b890eee5a9e8f2",
    "0xbf494f02ee3fde1f20bee6242bce2d1ed0c15e47",
    "0xbf65bfcb5da067446cee6a706ba3fe2fb1a9fdfd",
    "0xbf6ff49ffd3d104302ef0ab0f10f5a84324c091c",
    "0xc03841b5135600312707d39eb2af0d2ad5d51a91",
    "0xc10bbb8fd399d580b740ed31ff5ac94aa78ba9ed",
    "0xc12d1c73ee7dc3615ba4e37e4abfdbddfa38907e",
    "0xc40af1e4fecfa05ce6bab79dcd8b373d2e436c4e",
    "0xc4d586ef7be9ebe80bd5ee4fbd228fe2db5f2c4e",
    "0xc50EF449171a51FbeAFd7c562b064B6471C36caA",
    "0xc626d951eff8e421448074bd2ad7805c6d585793",
    "0xc693a32a3c26d2aa7123f43ed8d398808b19c805",
    "0xc73c167e7a4ba109e4052f70d5466d0c312a344d",
    "0xc778417e063141139fce010982780140aa0cd5ab",
    "0xc7c24fe893c21e8a4ef46eaf31badcab9f362841",
    "0xc92e74b131d7b1d46e60e07f3fae5d8877dd03f0",
    "0xc997318fc52aa66b0b5118f437322c52386cc9e0",
    "0xca1250b42fbf507cf19647c3f03571b7a5fcfdd2",
    "0xca72d8969705c201d0166ae7fce415dc1f7450ec",
    "0xcd7492db29e2ab436e819b249452ee1bbdf52214",
    "0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E",
    "0xcf2f589bea4645c3ef47f1f33bebf100bee66e05",
    "0xcf8c23cf17bb5815d5705a15486fa83805415625",
    "0xcfbd04b3cef2cf1527f143a49e5dc1e19941d254",
    "0xd0834d08c83dbe216811aaea0eeffb2349e57634",
    "0xd0d3ebcad6a20ce69bc3bc0e1ec964075425e533",
    "0xd1afbccc9a2c2187ea544363b986ea0ab6ef08b5",
    "0xd1bfb50bcb96635cf13fe50ba507ebbf37b09234",
    "0xd226124f8b0c6741e25e814c2bc3ac61cb51b28e",
    "0xd26fb021bcdf84d38da2598ef9852d828467b1fe",
    "0xd27e1ecc4748f42e052331bea917d89beb883fc3",
    "0xd2877702675e6ceb975b4a1dff9fb7baf4c91ea9",
    "0xd375a513692336cf9eebce5e38869b447948016f",
    "0xd3f6571be1d91ac68b40daaa24075ca7e2f0f72e",
    "0xd45113de317ed2ff4c365787447f6eef65c857d9",
    "0xd47c30ffef3d50a4fe764e34d755b057eb8755e6",
    "0xd50825f50384bc40d5a10118996ef503b3670afd",
    "0xd5281bb2d1ee94866b03a0fccdd4e900c8cb5091",
    "0xda1e53e088023fe4d1dc5a418581748f52cbd1b8",
    "0xdb0aCC14396D108b3C5574483aCB817855C9dc8d",
    "0xDce8b8BD8889Ae97933f9bB33632bB4B2b763bb1",
    "0xdd2955b7b00cfcde3c49dc212709a97da182ef3e",
    "0xdd339f370bbb18b8f389bd0443329d82ecf4b593",
    "0xdd96b45877d0e8361a4ddb732da741e97f3191ff",
    "0xdecade1c6bf2cd9fb89afad73e4a519c867adcf5",
    "0xdfc3829b127761a3218bfcee7fc92e1232c9d116",
    "0xdfdd3459d4f87234751696840092ee20c970fb07",
    "0xe089a30e5bec50587d2c7dce0bbd04a5462d9d6f",
    "0xe0b0c16038845bed3fcf70304d3e167df81ce225",
    "0xe0bdaafd0aab238c55d68ad54e616305d4a21772",
    "0xe29cca6ae51d4b815ccf084b0f7154e2092e9621",
    "0xe2d66561b39eadbd488868af8493fb55d4b9d084",
    "0xe302bf71b1f6f3024e7642f9c824ac86b58436a0",
    "0xe7f72bc0252ca7b16dbb72eeee1afcdb2429f2dd",
    "0xea319e87cf06203dae107dd8e5672175e3ee976c",
    "0xebfc9d08f47b6b4411eaf5b97f1fd7d9b6d2929c",
    "0xec0b6afb3f9a609ceed67e2ca551a4c573fd45f7",
    "0xece38d866250d36EBd944108865f7f6FE76aD4B1",
    "0xed5e5ab076ae60bdb9c49ac255553e65426a2167",
    "0xed68E2B09eD91E0C2C22CB00266B15f8D9BAE599",
    "0xed704e11d975a966b4edcc5780a2e8955c536fa0",
    "0xeeee2a622330e6d2036691e983dee87330588603",
    "0xef5b32486ed432b804a51d129f4d2fbdf18057ec",
    "0xefe1bbc0912b33b3a29660871b1f27dc8f3ed2fb",
    "0xf10bc87d4d00158d573f502eafeae621b22faa4f",
    "0xf1365ab39e192808b5301bcf6da973830e9e817f",
    "0xf16007dbf9d4d566cbc9fd00e850d824e236d464",
    "0xf1656ae9e8227da5ebb93406e2edd74d9820d0ad",
    "0xf198b4a2631b7d0b9fac36f8b546ed3dce472a47",
    "0xf41a40430356793d2e344fe9eae571bea550cbb9",
    "0xf4faea455575354d2699bc209b0a65ca99f69982",
    "0xfad45e47083e4607302aa43c65fb3106f1cd7607",
    "0xFcAA8EeF70f373E00aC29208023D106c846259eE",
    "0xfeeeef4d7b4bf3cc8bd012d02d32ba5fd3d51e31",
    "0xff69e48af1174da7f15d0c771861c33d3f19ed8a",
  ]
) {
  if (await isSupported(token)) {
    goodTokens.push(token);
  }
}

console.log(`==> tokens that are tradable:`);
for (const token of goodTokens) {
  console.log(ethers.utils.getAddress(token));
}
