const chalk = require("chalk").default || require("chalk");
const ethers = require("ethers");
const fs = require("fs");
const Table = require("cli-table3");
const axios = require("axios");
const readline = require("readline");
const crypto = require("crypto");
const { performAquaFluxMint } = require("./src/aquaflux");
const { sendTipTask } = require("./src/primuslab");
const { performFaroswapTask } = require("./src/faroswap");
const { performAutoStakingTask } = require("./src/autoStaking");
const { performOpenFiTask } = require("./src/openfi");
const { runStatusCheck } = require("./src/status");
const { performCFDTask } = require("./src/cfd");
const { performSpoutTask } = require("./src/spout");
const { performBitverseTask } = require("./src/bit");
const { performR2Task } = require("./src/r2");
const { performDomainMintTask, performPNSDomainTask } = require("./src/domain"); // Added domain imports

// ---- CONSTANTS ----
const nfts = [
  { address: '0x1da9f40036bee3fda37ddd9bff624e1125d8991d', name: 'Pharos Octopus Badge' },
  { address: '0x7fB63bFD3Ef701544BF805e88CB9D2Efaa3C01A9', name: 'FaroSwap Captain Dolphin' },
  { address: '0x2a469A4073480596b9deB19f52aA89891CcFF5ce', name: 'FaroSwap Baby Dolphin' },
  { address: '0xe71188DF7be6321ffd5aaA6e52e6c96375E62793', name: 'Zentra Octopus Badge' },
  { address: '0xb2ac4f09735007562c513ebbe152a8d7fa682bef', name: 'Gotchipus Testnet Badge' },
  { address: '0x0D00314d006e70cA08ac37C3469b4bF958A7580B', name: 'AutoStaking Testnet Badge' },
  { address: '0x96381ed3fcfb385cbacfe6908159f0905b19767a', name: 'Spout Badge' },
  { address: '0x4af366c7269DC9a0335Bd055Af979729c20e0F5F', name: 'PNS Badge' },
  { address: '0x9979b7fedf761c2989642f63ba6ed580dbdfc46f', name: 'Brokex Testnet Badge' },
  { address: '0x822483f6cf39b7dad66fec5f4feecbfd72172626', name: 'OpenFi Pharos Badge' }
];
const PHAROS_RPC = "https://testnet.dplabs-internal.com";
const WPHRS_CONTRACT = "0x76aaaDA469D23216bE5f7C596fA25F282Ff9b364";
const USDT_CONTRACT = "0xD4071393f8716661958F766DF660033b3d35fD29";
const SWAP_ROUTER = "0x1A4DE519154Ae51200b0Ad7c90F7faC75547888a";
const POSITION_MANAGER = "0xF8a1D4FF0f9b9Af7CE58E1fc1833688F3BFd6115";
const API_BASE = "https://api.pharosnetwork.xyz";
const REF_CODE = "yoHvlg6UmrQWQTpw";

// ---- GLOBAL VARIABLES ----
let privateKeys = [];
let targetWallets = [];
let accountTokens = {};
let usedNonces = {};
let global = {
  maxTransaction: 5,
  aquaFluxMintCount: 1,
  tipCount: 1,
  tipUsername: "",
  faroswapTxCount: 1,
  faroswapDelay: 20,
  autoStakingTxCount: 1,
  autoStakingMinDelay: 10,
  autoStakingMaxDelay: 20,
  autoStakingUsdcAmount: 0.45,
  autoStakingUsdtAmount: 0.45,
  autoStakingMusdAmount: 0.45,
  autoStakingUseProxy: false,
  autoStakingRotateProxy: false,
  domainMintCount: 1,
  openFiTxCount: 1,
  cfdTxCount: 1,
  spoutTxCount: 1,
  spoutMinAmount: 1,
  spoutMaxAmount: 5,
  spoutMinDelay: 10,
  spoutMaxDelay: 20,
  spoutEnableKyc: true,
  spoutEnableBuy: true,
  spoutEnableSell: true,
  bitverseAction: "trade",
  bitverseSubAction: "deposit",
  bitverseDepositAmount: 1,
  bitverseWithdrawAmount: 1,
  bitverseTradeCount: 1,
  bitverseTradeAmount: 1,
  bitverseMinDelay: 10,
  bitverseMaxDelay: 20,
  bitverseUseProxy: false,
  bitverseRotateProxy: false,
  r2Action: "swap",
  r2SwapOption: 3,
  r2SwapCount: 1,
  r2EarnCount: 1,
  r2UsdcSwapAmount: 1,
  r2R2usdSwapAmount: 1,
  r2R2usdEarnAmount: 1,
  r2MinDelay: 10,
  r2MaxDelay: 20,
  r2UseProxy: false,
  r2RotateProxy: false,
  pnsMintCount: 1, // Added PNS mint count
  pnsMinDelay: 10, // Added PNS min delay
  pnsMaxDelay: 20, // Added PNS max delay
  pnsUseProxy: false, // Added PNS use proxy
  pnsRotateProxy: false, // Added PNS rotate proxy
};
const FIXED_WRAP_AMOUNT = "0.0001";

// ---- ABIs ----

const ERC721_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function deposit() payable",
  "function withdraw(uint256 wad)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "deadline", type: "uint256" },
      { internalType: "bytes[]", name: "data", type: "bytes[]" },
    ],
    name: "multicall",
    outputs: [{ internalType: "bytes[]", name: "", type: "bytes[]" }],
    stateMutability: "payable",
    type: "function",
  },
];

const POSITION_MANAGER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "token0", type: "address" },
          { internalType: "address", name: "token1", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "int24", name: "tickLower", type: "int24" },
          { internalType: "int24", name: "tickUpper", type: "int24" },
          { internalType: "uint256", name: "amount0Desired", type: "uint256" },
          { internalType: "uint256", name: "amount1Desired", type: "uint256" },
          { internalType: "uint256", name: "amount0Min", type: "uint256" },
          { internalType: "uint256", name: "amount1Min", type: "uint256" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
        ],
        internalType: "struct INonfungiblePositionManager.MintParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "mint",
    outputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint128", name: "liquidity", type: "uint128" },
      { internalType: "uint256", name: "amount0", type: "uint256" },
      { internalType: "uint256", name: "amount1", type: "uint256" },
    ],
    stateMutability: "payable",
    type: "function",
  },
];

// ---- MENU OPTIONS ----
const menuOptions = [
  { label: "Daily Sign-In", value: "performDailySignIn" },
  { label: "Claim Faucet", value: "claimFaucet" },
  { label: "Send PHRS to Friends", value: "performTransfers" },
  { label: "Wrap PHRS to WPHRS", value: "performWrap" },
  { label: "Unwrap WPHRS to PHRS", value: "performUnwrap" },
  { label: "Swap Tokens", value: "performSwaps" },
  { label: "Add Liquidity", value: "addLiquidity" },
  { label: "AquaFlux Mint", value: "performAquaFluxMint" },
  { label: "Send Tip (PrimusLab)", value: "sendTip" },
  { label: "Faroswap Task", value: "performFaroswapTask" },
  { label: "AutoStaking Task", value: "performAutoStakingTask" },
  { label: "Domain Mint Task", value: "performDomainMintTask" },
  { label: "PNS Domain Task", value: "performPNSDomainTask" }, // Added PNS Domain option
  { label: "OpenFi Task", value: "performOpenFiTask" },
  { label: "CFD Trading Task", value: "performCFDTask" },
  { label: "Spout Task", value: "performSpoutTask" },
  { label: "Bitverse Task", value: "performBitverseTask" },
  { label: "R2 Task", value: "performR2Task" },
  { label: "Check Status", value: "checkStatus" },
  { label: "Display All Accounts", value: "displayAccounts" },
  { label: "Run All Activities", value: "runAllActivities" },
  { label: "Mint NFTs", value: "mintNFTs" },
  { label: "Set Transaction Count", value: "setTransactionCount" },
];

// ---- BANNER ----
const asciiBannerLines = [
  "██████╗     ██╗  ██╗     █████╗     ██████╗      ██████╗     ███████╗",
  "██╔══██╗    ██║  ██║    ██╔══██╗    ██╔══██╗    ██╔═══██╗    ██╔════╝",
  "██████╔╝    ███████║    ███████║    ██████╔╝    ██║   ██║    ███████╗",
  "██╔═══╝     ██╔══██║    ██╔══██║    ██╔══██╗    ██║   ██║    ╚════██║",
  "██║         ██║  ██║    ██║  ██║    ██║  ██║    ╚██████╔╝    ███████║",
  "╚═╝         ╚═╝  ╚═╝    ╚═╝  ╚═╝    ╚═╝  ╚═╝     ╚═════╝     ╚══════╝",
  "",
  "       Pharos Testnet Bot v7.0 - Created By Kazuha787       ",
  "                  LETS FUCK THIS TESTNET                   ",
];

// ---- UTILITY FUNCTIONS ----
function formatLogMessage(msg) {
  const timestamp = new Date().toLocaleTimeString("en-US", { hour12: false });
  msg = (msg || "").toString().trim();
  if (!msg) return chalk.hex("#CCCCCC")(`[${timestamp}] Empty log`);

  const parts = msg.split("|").map((s) => s?.trim() || "");
  const walletName = parts[0] || "System";

  if (
    parts.length >= 3 &&
    (parts[2]?.includes("successful") ||
      parts[2]?.includes("Confirmed") ||
      parts[2]?.includes("Approved"))
  ) {
    const logParts = parts[2].split(/successful:|Confirmed:|Approved:/);
    const message = logParts[0]?.trim() || "";
    const hashPart = logParts[1]?.trim() || "";
    return chalk.green.bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${message}${
        hashPart ? "Confirmed: " : "successful: "
      }${chalk.greenBright.bold(hashPart || "")}`
    );
  }

  if (
    parts.length >= 2 &&
    (parts[1]?.includes("Starting") ||
      parts[1]?.includes("Processing") ||
      parts[1]?.includes("Approving"))
  ) {
    return chalk.hex("#C71585").bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${parts[1]}`
    );
  }

  if (parts.length >= 2 && parts[1]?.includes("Warning")) {
    return chalk.yellow.bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${parts.slice(1).join(" | ")}`
    );
  }

  if (msg.includes("Error") || msg.includes("failed")) {
    const errorMsg = parts.length > 2 ? parts.slice(2).join(" | ").trim() : msg;
    return chalk.red.bold(
      `[${timestamp}] ${walletName.padEnd(25)} | ${errorMsg}`
    );
  }

  return chalk.hex("#CCCCCC")(
    `[${timestamp}] ${walletName.padEnd(25)} | ${
      parts.slice(parts.length >= 2 ? 1 : 0).join(" | ") || msg
    }`
  );
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function requestInput(promptText, type = "text", defaultValue = "") {
  return new Promise((resolve) => {
    rl.question(
      chalk.greenBright(`${promptText}${defaultValue ? ` [${defaultValue}]` : ""}: `),
      (value) => {
        if (type === "number") value = Number(value);
        if (value === "" || (type === "number" && isNaN(value))) value = defaultValue;
        resolve(value);
      }
    );
  });
}

function displayBanner() {
  console.clear();
  console.log(chalk.hex("#D8BFD8").bold(asciiBannerLines.join("\n")));
  console.log();
}

function displayMenu() {
  console.log(chalk.blueBright.bold("\n>=== Pharos Testnet Bot Menu ===<"));
  menuOptions.forEach((opt, idx) => {
    const optionNumber = `${idx + 1}`.padStart(2, "0");
    console.log(chalk.blue(`  ${optionNumber} > ${opt.label.padEnd(35)} <`));
  });
  console.log(chalk.blueBright.bold(">===============================<\n"));
}

function formatNumber(num, decimals = 4) {
  return Number(num).toFixed(decimals);
}

function getShortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

function loadPrivateKeys() {
  try {
    const data = fs.readFileSync("wallets.txt", "utf8");
    privateKeys = data
      .split("\n")
      .map((key) => {
        key = key.trim();
        if (key.startsWith("0x")) {
          key = key.slice(2);
        }
        return "0x" + key;
      })
      .filter((key) => key.length === 66);

    if (privateKeys.length === 0) throw new Error("No valid private keys");
    return true;
  } catch (error) {
    return false;
  }
}

function loadTargetWallets() {
  try {
    const data = fs.readFileSync("wallet.txt", "utf8");
    targetWallets = data
      .split("\n")
      .map((addr) => {
        try {
          return ethers.getAddress(addr.trim());
        } catch {
          return null;
        }
      })
      .filter((addr) => addr !== null);
  } catch (error) {
    targetWallets = [];
  }
}

function getEthersProvider() {
  return new ethers.JsonRpcProvider(PHAROS_RPC, 688688);
}

async function initializeNonce(provider, address) {
  try {
    const nonce = await provider.getTransactionCount(address, "pending");
    usedNonces[address] = nonce;
    return nonce;
  } catch (error) {
    throw new Error(`Failed to initialize nonce: ${error.message}`);
  }
}

async function makeApiRequest(method, url, data = null, headers = {}) {
  const defaultHeaders = {
    Accept: "application/json, text/plain, */*",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Origin: "https://testnet.pharosnetwork.xyz",
    Referer: "https://testnet.pharosnetwork.xyz/",
    ...headers,
  };

  const config = {
    method,
    url,
    headers: defaultHeaders,
    timeout: 10000,
  };

  if (data) config.data = data;

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.msg || error.message);
  }
}

async function loginAccount(privateKey, logger) {
  try {
    const wallet = new ethers.Wallet(privateKey);
    const timestamp = new Date().toISOString();
    const nonce = Date.now().toString();

    const message = `testnet.pharosnetwork.xyz wants you to sign in with your Ethereum account:\n${wallet.address}\n\nI accept the Pharos Terms of Service: testnet.pharosnetwork.xyz/privacy-policy/Pharos-PrivacyPolicy.pdf\n\nURI: https://testnet.pharosnetwork.xyz\n\nVersion: 1\n\nChain ID: 688688\n\nNonce: ${nonce}\n\nIssued At: ${timestamp}`;

    const signature = await wallet.signMessage(message);

    const loginData = {
      address: wallet.address,
      signature: signature,
      wallet: "OKX Wallet",
      nonce: nonce,
      chain_id: "688688",
      timestamp: timestamp,
      domain: "testnet.pharosnetwork.xyz",
      invite_code: REF_CODE,
    };

    const response = await makeApiRequest("post", `${API_BASE}/user/login`, loginData);

    if (response.code === 0) {
      accountTokens[wallet.address] = response.data.jwt;
      return true;
    }
    return false;
  } catch (error) {
    logger(`${getShortAddress(wallet.address)} | Error: Login failed: ${error.message}`);
    return false;
  }
}

async function getBalances(address, logger) {
  try {
    const provider = getEthersProvider();

    const [phrsBalance, wphrsBalance, usdtBalance] = await Promise.all([
      provider.getBalance(address),
      new ethers.Contract(WPHRS_CONTRACT, ERC20_ABI, provider).balanceOf(address),
      new ethers.Contract(USDT_CONTRACT, ERC20_ABI, provider).balanceOf(address),
    ]);

    return {
      PHRS: formatNumber(ethers.formatEther(phrsBalance)),
      WPHRS: formatNumber(ethers.formatEther(wphrsBalance)),
      USDT: formatNumber(Number(usdtBalance) / 1e6),
    };
  } catch (error) {
    logger(`${getShortAddress(address)} | Error: Failed to fetch balances: ${error.message}`);
    return { PHRS: "0", WPHRS: "0", USDT: "0" };
  }
}

async function performDailySignIn(logger) {
  logger("System | Starting Daily Sign-In...");

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const wallet = new ethers.Wallet(privateKey);

    logger(`${getShortAddress(wallet.address)} | Processing sign-in for account ${i + 1}`);

    if (!accountTokens[wallet.address]) {
      const loginSuccess = await loginAccount(privateKey, logger);
      if (!loginSuccess) {
        logger(`${getShortAddress(wallet.address)} | Error: Login failed, skipping...`);
        continue;
      }
    }

    try {
      const response = await makeApiRequest(
        "post",
        `${API_BASE}/sign/in`,
        { address: wallet.address },
        { Authorization: `Bearer ${accountTokens[wallet.address]}` }
      );

      if (response.code === 0) {
        logger(`${getShortAddress(wallet.address)} | Success: Daily sign-in successful`);
      } else {
        logger(
          `${getShortAddress(wallet.address)} | Warning: ${response.msg || "Already signed in today"}`
        );
      }
    } catch (error) {
      logger(`${getShortAddress(wallet.address)} | Error: Sign-in error: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  logger("System | Daily Sign-In completed!");
}

async function claimFaucet(logger) {
  logger("System | Starting Faucet Claims...");

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const wallet = new ethers.Wallet(privateKey);

    logger(`${getShortAddress(wallet.address)} | Processing faucet claim for account ${i + 1}`);

    if (!accountTokens[wallet.address]) {
      const loginSuccess = await loginAccount(privateKey, logger);
      if (!loginSuccess) {
        logger(`${getShortAddress(wallet.address)} | Error: Login failed, skipping...`);
        continue;
      }
    }

    try {
      const statusResponse = await makeApiRequest(
        "get",
        `${API_BASE}/faucet/status?address=${wallet.address}`,
        null,
        { Authorization: `Bearer ${accountTokens[wallet.address]}` }
      );

      if (statusResponse.code === 0 && statusResponse.data.is_able_to_faucet) {
        const claimResponse = await makeApiRequest(
          "post",
          `${API_BASE}/faucet/daily`,
          { address: wallet.address },
          { Authorization: `Bearer ${accountTokens[wallet.address]}` }
        );

        if (claimResponse.code === 0) {
          logger(`${getShortAddress(wallet.address)} | Success: Faucet claimed successfully`);
        } else {
          logger(`${getShortAddress(wallet.address)} | Error: ${claimResponse.msg}`);
        }
      } else {
        logger(`${getShortAddress(wallet.address)} | Warning: Already claimed today`);
      }
    } catch (error) {
      logger(`${getShortAddress(wallet.address)} | Error: Faucet error: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  logger("System | Faucet Claims completed!");
}

async function performTransfers(logger) {
  if (targetWallets.length === 0) {
    logger("System | Warning: No target wallets loaded for transfers");
    return;
  }

  logger("System | Starting Transfers...");

  const transferAmount = "0.001";

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const provider = getEthersProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    logger(`${getShortAddress(wallet.address)} | Processing transfers for account ${i + 1}`);

    await initializeNonce(provider, wallet.address);

    for (let j = 0; j < global.maxTransaction; j++) {
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const toAddress = targetWallets[Math.floor(Math.random() * targetWallets.length)];
          const nonce = await provider.getTransactionCount(wallet.address, "pending");
          usedNonces[wallet.address] = nonce + 1;
          const feeData = await provider.getFeeData();

          const tx = await wallet.sendTransaction({
            to: toAddress,
            value: ethers.parseEther(transferAmount),
            gasLimit: 21000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
            nonce,
          });

          logger(
            `${getShortAddress(wallet.address)} | Success: Transfer ${j + 1}: ${transferAmount} PHRS to ${getShortAddress(
              toAddress
            )} | Confirmed: ${tx.hash}`
          );
          await tx.wait();
          break; // Success, exit retry loop
        } catch (error) {
          if (error.message.includes("TX_REPLAY_ATTACK") && attempts < maxAttempts - 1) {
            logger(
              `${getShortAddress(wallet.address)} | Warning: Transfer ${j + 1} retry ${attempts + 1} due to TX_REPLAY_ATTACK`
            );
            attempts++;
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
            continue;
          }
          logger(`${getShortAddress(wallet.address)} | Error: Transfer ${j + 1} failed: ${error.message}`);
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  logger("System | Transfers completed!");
}

async function performWrapUnwrap(isWrap, logger, wallet) {
  const address = wallet.address;
  logger(`${getShortAddress(address)} | Processing ${isWrap ? "wrap" : "unwrap"}...`);

  const provider = getEthersProvider();
  wallet = wallet.connect(provider);

  for (let j = 0; j < global.maxTransaction; j++) {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const amount = FIXED_WRAP_AMOUNT;
        const wphrsContract = new ethers.Contract(WPHRS_CONTRACT, ERC20_ABI, wallet);
        const nonce = await provider.getTransactionCount(address, "pending");
        usedNonces[address] = nonce + 1;
        const feeData = await provider.getFeeData();

        if (isWrap) {
          const balance = await provider.getBalance(address);
          const amountWei = BigInt(ethers.parseEther(amount));
          const gasReserve = BigInt(ethers.parseEther("0.001"));
          const needed = amountWei + gasReserve;
          if (BigInt(balance) < needed) {
            logger(`${getShortAddress(address)} | Warning: Insufficient PHRS balance for wrap ${j + 1}`);
            break;
          }
        } else {
          const balance = await wphrsContract.balanceOf(address);
          const amountWei = BigInt(ethers.parseEther(amount));
          if (BigInt(balance) < amountWei) {
            logger(`${getShortAddress(address)} | Warning: Insufficient WPHRS balance for unwrap ${j + 1}`);
            break;
          }
        }

        let tx;
        if (isWrap) {
          tx = await wphrsContract.deposit({
            value: ethers.parseEther(amount),
            gasLimit: 100000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
            nonce,
          });
          logger(
            `${getShortAddress(address)} | Success: Wrap ${j + 1}: ${amount} PHRS to WPHRS | Confirmed: ${tx.hash}`
          );
        } else {
          tx = await wphrsContract.withdraw(ethers.parseEther(amount), {
            gasLimit: 100000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
            nonce,
          });
          logger(
            `${getShortAddress(address)} | Success: Unwrap ${j + 1}: ${amount} WPHRS to PHRS | Confirmed: ${tx.hash}`
          );
        }

        await tx.wait();
        break; // Success, exit retry loop
      } catch (error) {
        if (error.message.includes("TX_REPLAY_ATTACK") && attempts < maxAttempts - 1) {
          logger(
            `${getShortAddress(address)} | Warning: ${isWrap ? "Wrap" : "Unwrap"} ${j + 1} retry ${
              attempts + 1
            } due to TX_REPLAY_ATTACK`
          );
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        logger(
          `${getShortAddress(address)} | Error: ${isWrap ? "Wrap" : "Unwrap"} ${j + 1} failed: ${error.message}`
        );
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function performSwaps(logger, wallet) {
  const address = wallet.address;
  const provider = getEthersProvider();
  wallet = wallet.connect(provider);

  logger(
    `${getShortAddress(address)} | Warning: USDC swaps disabled due to invalid contract address. Please verify USDC address on https://pharos-testnet.socialscan.io/`
  );

  const swapOptions = [
    {
      from: WPHRS_CONTRACT,
      to: USDT_CONTRACT,
      fromName: "WPHRS",
      toName: "USDT",
      amount: "0.0001",
    },
    {
      from: USDT_CONTRACT,
      to: WPHRS_CONTRACT,
      fromName: "USDT",
      toName: "WPHRS",
      amount: "0.45",
    },
  ];

  for (let j = 0; j < global.maxTransaction; j++) {
    const swap = swapOptions[Math.floor(Math.random() * swapOptions.length)];
    const swapAmount = swap.amount;

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        let fromAddress, toAddress;
        try {
          fromAddress = ethers.getAddress(swap.from);
          toAddress = ethers.getAddress(swap.to);
        } catch (error) {
          logger(`${getShortAddress(address)} | Error: Invalid contract address for swap ${j + 1}: ${error.message}`);
          break;
        }

        const tokenContract = new ethers.Contract(fromAddress, ERC20_ABI, wallet);
        const decimals = await tokenContract.decimals().catch(() => {
          logger(`${getShortAddress(address)} | Warning: Failed to fetch decimals for ${swap.fromName}, skipping...`);
          return null;
        });
        if (!decimals) break;

        const amount = ethers.parseUnits(swapAmount, decimals);

        const balance = await tokenContract.balanceOf(address).catch(() => {
          logger(`${getShortAddress(address)} | Warning: Failed to fetch balance for ${swap.fromName}, skipping...`);
          return BigInt(0);
        });
        if (BigInt(balance) < BigInt(amount)) {
          logger(
            `${getShortAddress(address)} | Warning: Insufficient ${swap.fromName} balance for swap ${j + 1}`
          );
          break;
        }

        const allowance = await tokenContract.allowance(address, SWAP_ROUTER).catch(() => BigInt(0));
        if (BigInt(allowance) < BigInt(amount)) {
          logger(`${getShortAddress(address)} | Approving ${swap.fromName}...`);
          const nonce = await provider.getTransactionCount(address, "pending");
          usedNonces[address] = nonce + 1;
          const feeData = await provider.getFeeData();

          const approveTx = await tokenContract.approve(SWAP_ROUTER, ethers.MaxUint256, {
            gasLimit: 100000,
            maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
            nonce,
          });
          logger(`${getShortAddress(address)} | Success: Approved | Confirmed: ${approveTx.hash}`);
          await approveTx.wait();
          await new Promise((resolve) => setTimeout(resolve, 10000));
        }

        const routerContract = new ethers.Contract(SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);
        const deadline = Math.floor(Date.now() / 1000) + 300;

        const abiCoder = new ethers.AbiCoder();
        const encodedData = abiCoder.encode(
          ["address", "address", "uint256", "address", "uint256", "uint256", "uint256"],
          [fromAddress, toAddress, 500, ethers.getAddress(address), amount, 0, 0]
        );
        const multicallData = ["0x04e45aaf" + encodedData.slice(2)];

        const swapNonce = await provider.getTransactionCount(address, "pending");
        usedNonces[address] = swapNonce + 1;
        const swapFeeData = await provider.getFeeData();

        const tx = await routerContract.multicall(deadline, multicallData, {
          gasLimit: 300000,
          maxFeePerGas: swapFeeData.maxFeePerGas || ethers.parseUnits("2", "gwei"),
          maxPriorityFeePerGas: swapFeeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
          nonce: swapNonce,
        });

        logger(
          `${getShortAddress(address)} | Success: Swap ${j + 1}: ${swapAmount} ${swap.fromName} to ${
            swap.toName
          } | Confirmed: ${tx.hash}`
        );
        await tx.wait();
        break; // Success, exit retry loop
      } catch (error) {
        if (error.message.includes("TX_REPLAY_ATTACK") && attempts < maxAttempts - 1) {
          logger(
            `${getShortAddress(address)} | Warning: Swap ${j + 1} retry ${attempts + 1} due to TX_REPLAY_ATTACK`
          );
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        logger(`${getShortAddress(address)} | Error: Swap ${j + 1} failed: ${error.message}`);
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function addLiquidity(logger, wallet) {
  const address = wallet.address;
  const provider = getEthersProvider();
  wallet = wallet.connect(provider);

  logger(
    `${getShortAddress(address)} | Warning: USDC liquidity pairs disabled due to invalid contract address. Please verify USDC address on https://pharos-testnet.socialscan.io/`
  );

  const lpOptions = [
    {
      token0: USDT_CONTRACT,
      token1: WPHRS_CONTRACT,
      amount0: "0.45",
      amount1: "0.001",
      name: "USDT/WPHRS",
    },
  ];

  for (let j = 0; j < global.maxTransaction; j++) {
    const lp = lpOptions[Math.floor(Math.random() * lpOptions.length)];

    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        let token0, token1;
        try {
          token0 = ethers.getAddress(lp.token0);
          token1 = ethers.getAddress(lp.token1);
        } catch (error) {
          logger(`${getShortAddress(address)} | Error: Invalid contract address for LP ${j + 1}: ${error.message}`);
          break;
        }

        let amount0 = lp.amount0;
        let amount1 = lp.amount1;

        if (token0.toLowerCase() > token1.toLowerCase()) {
          [token0, token1] = [token1, token0];
          [amount0, amount1] = [amount1, amount0];
        }

        const token0Contract = new ethers.Contract(token0, ERC20_ABI, wallet);
        const token1Contract = new ethers.Contract(token1, ERC20_ABI, wallet);

        const decimals0 = await token0Contract.decimals().catch(() => null);
        const decimals1 = await token1Contract.decimals().catch(() => null);
        if (!decimals0 || !decimals1) {
          logger(`${getShortAddress(address)} | Warning: Failed to fetch decimals for LP ${j + 1}, skipping...`);
          break;
        }

        const amount0Wei = ethers.parseUnits(amount0, decimals0);
        const amount1Wei = ethers.parseUnits(amount1, decimals1);

        for (const [contract, amountWei, tokenName] of [
          [token0Contract, amount0Wei, "Token0"],
          [token1Contract, amount1Wei, "Token1"],
        ]) {
          const allowance = await contract.allowance(address, POSITION_MANAGER).catch(() => BigInt(0));
          if (BigInt(allowance) < BigInt(amountWei)) {
            logger(`${getShortAddress(address)} | Approving ${tokenName}...`);
            const nonce = await provider.getTransactionCount(address, "pending");
            usedNonces[address] = nonce + 1;
            const feeData = await provider.getFeeData();

            const approveTx = await contract.approve(POSITION_MANAGER, ethers.MaxUint256, {
              gasLimit: 100000,
              maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
              nonce,
            });
            logger(`${getShortAddress(address)} | Success: Approved | Confirmed: ${approveTx.hash}`);
            await approveTx.wait();
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
        }

        const lpContract = new ethers.Contract(POSITION_MANAGER, POSITION_MANAGER_ABI, wallet);
        const nonce = await provider.getTransactionCount(address, "pending");
        usedNonces[address] = nonce + 1;
        const feeData = await provider.getFeeData();

        const mintParams = {
          token0: token0,
          token1: token1,
          fee: 500,
          tickLower: -887270,
          tickUpper: 887270,
          amount0Desired: amount0Wei,
          amount1Desired: amount1Wei,
          amount0Min: 0,
          amount1Min: 0,
          recipient: ethers.getAddress(address),
          deadline: Math.floor(Date.now() / 1000) + 600,
        };

        const tx = await lpContract.mint(mintParams, {
          gasLimit: 600000,
          maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("5", "gwei"),
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
          nonce,
        });

        logger(
          `${getShortAddress(address)} | Success: LP ${j + 1}: Added liquidity to ${lp.name} | Confirmed: ${tx.hash}`
        );
        await tx.wait();
        break; // Success, exit retry loop
      } catch (error) {
        if (error.message.includes("TX_REPLAY_ATTACK") && attempts < maxAttempts - 1) {
          logger(
            `${getShortAddress(address)} | Warning: LP ${j + 1} retry ${attempts + 1} due to TX_REPLAY_ATTACK`
          );
          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        logger(`${getShortAddress(address)} | Error: LP ${j + 1} failed: ${error.message}`);
        break;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

async function hasMintedNFT(wallet, nftAddress) {
  try {
    const contract = new ethers.Contract(nftAddress, ERC721_ABI, wallet.provider);
    const balance = await contract.balanceOf(wallet.address);
    return balance > 0;
  } catch (e) {
    logger(`Error checking if NFT minted: ${e.message}`);
    return false;
  }
}

async function verifyTask(address, token, task_id, tx_hash, logger) {
  try {
    const response = await makeApiRequest(
      "post",
      `${API_BASE}/task/verify`,
      {
        'address': address,
        'task_id': task_id,
        'tx_hash': tx_hash
      },
      { Authorization: `Bearer ${token}` }
    );
    return response.msg;
  } catch (e) {
    logger(`Error verifying task: ${e.message}`);
  }
}

async function mintNFTBadge(wallet, token, nft, logger) {
  const { address: nftAddress, name } = nft;
  const provider = wallet.provider;
  try {
    const minted = await hasMintedNFT(wallet, nftAddress);
    if (minted) {
      logger(`${getShortAddress(wallet.address)} | Already minted ${name}`);
      return;
    }
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = Number(ethers.formatEther(balance));
    if (balanceEth <= 2) {
      logger(`${getShortAddress(wallet.address)} | Insufficient balance for ${name} mint, current: ${balanceEth}`);
      return;
    }
    const abiCoder = new ethers.AbiCoder();
    const encodedParams = abiCoder.encode(
      ['address', 'uint256', 'address', 'uint256', 'tuple(bytes32[],uint256,uint256,address)', 'bytes'],
      [wallet.address, 1, '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', ethers.parseEther('1'), [[], 0, '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', '0x0000000000000000000000000000000000000000'], '0x']
    );
    const calldata = '0x84bb1e42' + encodedParams.slice(2);
    const nonce = await provider.getTransactionCount(wallet.address, "pending");
    usedNonces[wallet.address] = nonce + 1;
    const feeData = await provider.getFeeData();
    const tx = await wallet.sendTransaction({
      to: nftAddress,
      value: ethers.parseEther('1'),
      data: calldata,
      gasLimit: 300000,
      maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("2", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
      nonce,
    });
    logger(`${getShortAddress(wallet.address)} | Minting ${name}: ${tx.hash}`);
    await tx.wait();
    logger(`${getShortAddress(wallet.address)} | Success: Minted ${name} | Confirmed: ${tx.hash}`);
    const verifyResult = await verifyTask(wallet.address, token, 103, tx.hash, logger);
    logger(`${getShortAddress(wallet.address)} | Verification for ${name}: ${verifyResult}`);
  } catch (e) {
    logger(`${getShortAddress(wallet.address)} | Error minting ${name}: ${e.message}`);
  }
}

async function mintNFTs(logger) {
  logger("System | Starting NFT Minting...");
  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const provider = getEthersProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    logger(`${getShortAddress(wallet.address)} | Processing NFTs for account ${i + 1}`);
    if (!accountTokens[wallet.address]) {
      const loginSuccess = await loginAccount(privateKey, logger);
      if (!loginSuccess) {
        logger(`${getShortAddress(wallet.address)} | Error: Login failed, skipping...`);
        continue;
      }
    }
    const token = accountTokens[wallet.address];
    for (const nft of nfts) {
      await mintNFTBadge(wallet, token, nft, logger);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  logger("System | NFT Minting completed!");
}

async function displayAccounts(logger) {
  logger("System | Displaying Account Balances...");

  const table = new Table({
    head: ["#", "Address", "PHRS", "WPHRS", "USDT"],
    colWidths: [5, 20, 12, 12, 12],
    style: { head: ["cyan"] },
  });

  for (let i = 0; i < privateKeys.length; i++) {
    const wallet = new ethers.Wallet(privateKeys[i]);
    const balances = await getBalances(wallet.address, logger);

    table.push([
      i + 1,
      getShortAddress(wallet.address),
      balances.PHRS,
      balances.WPHRS,
      balances.USDT,
    ]);
  }

  console.log(table.toString());
  logger("System | Account Balances displayed!");
}

async function runAllActivities(logger) {
  logger("System | Starting Run All Activities...");

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const provider = getEthersProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    logger(`${getShortAddress(wallet.address)} | Starting activities for account ${i + 1}`);

    await initializeNonce(provider, wallet.address);

    // 1. Daily Sign-In
    logger(`${getShortAddress(wallet.address)} | Processing Daily Sign-In...`);
    try {
      if (!accountTokens[wallet.address]) {
        const loginSuccess = await loginAccount(privateKey, logger);
        if (!loginSuccess) {
          logger(`${getShortAddress(wallet.address)} | Error: Login failed, skipping sign-in...`);
        } else {
          const response = await makeApiRequest(
            "post",
            `${API_BASE}/sign/in`,
            { address: wallet.address },
            { Authorization: `Bearer ${accountTokens[wallet.address]}` }
          );

          if (response.code === 0) {
            logger(`${getShortAddress(wallet.address)} | Success: Daily sign-in successful`);
          } else {
            logger(
              `${getShortAddress(wallet.address)} | Warning: ${response.msg || "Already signed in today"}`
            );
          }
        }
      } else {
        const response = await makeApiRequest(
          "post",
          `${API_BASE}/sign/in`,
          { address: wallet.address },
          { Authorization: `Bearer ${accountTokens[wallet.address]}` }
        );

        if (response.code === 0) {
          logger(`${getShortAddress(wallet.address)} | Success: Daily sign-in successful`);
        } else {
          logger(
            `${getShortAddress(wallet.address)} | Warning: ${response.msg || "Already signed in today"}`
          );
        }
      }
    } catch (error) {
      logger(`${getShortAddress(wallet.address)} | Error: Sign-in failed: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Claim Faucet
    logger(`${getShortAddress(wallet.address)} | Processing Faucet Claim...`);
    try {
      if (!accountTokens[wallet.address]) {
        const loginSuccess = await loginAccount(privateKey, logger);
        if (!loginSuccess) {
          logger(`${getShortAddress(wallet.address)} | Error: Login failed, skipping faucet...`);
        } else {
          const statusResponse = await makeApiRequest(
            "get",
            `${API_BASE}/faucet/status?address=${wallet.address}`,
            null,
            { Authorization: `Bearer ${accountTokens[wallet.address]}` }
          );

          if (statusResponse.code === 0 && statusResponse.data.is_able_to_faucet) {
            const claimResponse = await makeApiRequest(
              "post",
              `${API_BASE}/faucet/daily`,
              { address: wallet.address },
              { Authorization: `Bearer ${accountTokens[wallet.address]}` }
            );

            if (claimResponse.code === 0) {
              logger(`${getShortAddress(wallet.address)} | Success: Faucet claimed successfully`);
            } else {
              logger(`${getShortAddress(wallet.address)} | Error: ${claimResponse.msg}`);
            }
          } else {
            logger(`${getShortAddress(wallet.address)} | Warning: Already claimed today`);
          }
        }
      } else {
        const statusResponse = await makeApiRequest(
          "get",
          `${API_BASE}/faucet/status?address=${wallet.address}`,
          null,
          { Authorization: `Bearer ${accountTokens[wallet.address]}` }
        );

        if (statusResponse.code === 0 && statusResponse.data.is_able_to_faucet) {
          const claimResponse = await makeApiRequest(
            "post",
            `${API_BASE}/faucet/daily`,
            { address: wallet.address },
            { Authorization: `Bearer ${accountTokens[wallet.address]}` }
          );

          if (claimResponse.code === 0) {
            logger(`${getShortAddress(wallet.address)} | Success: Faucet claimed successfully`);
          } else {
            logger(`${getShortAddress(wallet.address)} | Error: ${claimResponse.msg}`);
          }
        } else {
          logger(`${getShortAddress(wallet.address)} | Warning: Already claimed today`);
        }
      }
    } catch (error) {
      logger(`${getShortAddress(wallet.address)} | Error: Faucet claim failed: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 3. Transfers
    if (targetWallets.length > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing Transfers...`);
      for (let j = 0; j < global.maxTransaction; j++) {
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            const toAddress = targetWallets[Math.floor(Math.random() * targetWallets.length)];
            const nonce = await provider.getTransactionCount(wallet.address, "pending");
            usedNonces[wallet.address] = nonce + 1;
            const feeData = await provider.getFeeData();

            const tx = await wallet.sendTransaction({
              to: toAddress,
              value: ethers.parseEther("0.001"),
              gasLimit: 21000,
              maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
              nonce,
            });

            logger(
              `${getShortAddress(wallet.address)} | Success: Transfer ${j + 1}: 0.001 PHRS to ${getShortAddress(
                toAddress
              )} | Confirmed: ${tx.hash}`
            );
            await tx.wait();
            break;
          } catch (error) {
            if (error.message.includes("TX_REPLAY_ATTACK") && attempts < maxAttempts - 1) {
              logger(
                `${getShortAddress(wallet.address)} | Warning: Transfer ${j + 1} retry ${attempts + 1} due to TX_REPLAY_ATTACK`
              );
              attempts++;
              await new Promise((resolve) => setTimeout(resolve, 5000));
              continue;
            }
            logger(`${getShortAddress(wallet.address)} | Error: Transfer ${j + 1} failed: ${error.message}`);
            break;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: No target wallets loaded for transfers`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Wrap PHRS to WPHRS
    logger(`${getShortAddress(wallet.address)} | Processing Wrap PHRS to WPHRS...`);
    await performWrapUnwrap(true, logger, wallet);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 5. Unwrap WPHRS to PHRS
    logger(`${getShortAddress(wallet.address)} | Processing Unwrap WPHRS to PHRS...`);
    await performWrapUnwrap(false, logger, wallet);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 6. Swaps
    logger(`${getShortAddress(wallet.address)} | Processing Swaps...`);
    await performSwaps(logger, wallet);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 7. Add Liquidity
    logger(`${getShortAddress(wallet.address)} | Processing Add Liquidity...`);
    await addLiquidity(logger, wallet);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 8. AquaFlux Mint
    if (global.aquaFluxMintCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing AquaFlux Mint...`);
      await performAquaFluxMint(logger, [privateKey], [], global.aquaFluxMintCount, usedNonces);
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: AquaFlux mint count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 9. Send Tip (PrimusLab)
    if (global.tipUsername && global.tipCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing Send Tip (PrimusLab)...`);
      await sendTipTask(logger, [privateKey], [], global.tipCount, global.tipUsername, usedNonces);
    } else {
      logger(
        `${getShortAddress(wallet.address)} | Warning: No X username or tip count provided, skipping tips...`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 10. Faroswap Task
    if (global.faroswapTxCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing Faroswap Task...`);
      await performFaroswapTask(
        logger,
        [privateKey],
        [],
        global.faroswapTxCount,
        usedNonces
      );
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: Faroswap transaction count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 11. AutoStaking Task
    if (global.autoStakingTxCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing AutoStaking Task...`);
      await performAutoStakingTask(
        logger,
        [privateKey],
        [],
        global.autoStakingTxCount,
        global.autoStakingMinDelay,
        global.autoStakingMaxDelay,
        global.autoStakingUsdcAmount,
        global.autoStakingUsdtAmount,
        global.autoStakingMusdAmount,
        global.autoStakingUseProxy,
        global.autoStakingRotateProxy,
        usedNonces
      );
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: AutoStaking transaction count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 12. Domain Mint Task
    if (global.domainMintCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing Domain Mint Task...`);
      await performDomainMintTask(
        logger,
        [privateKey],
        [],
        global.domainMintCount,
        usedNonces
      );
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: Domain mint count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 13. PNS Domain Task
    if (global.pnsMintCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing PNS Domain Task...`);
      const pnsConfig = {
        mintCount: global.pnsMintCount,
        minDelay: global.pnsMinDelay,
        maxDelay: global.pnsMaxDelay,
        useProxy: global.pnsUseProxy,
        rotateProxy: global.pnsRotateProxy
      };
      await performPNSDomainTask(logger, [privateKey], [], pnsConfig, usedNonces);
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: PNS mint count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 14. OpenFi Task
    if (global.openFiTxCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing OpenFi Task...`);
      await performOpenFiTask(
        logger,
        [privateKey],
        [],
        global.openFiTxCount,
        usedNonces
      );
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: OpenFi transaction count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 15. CFD Trading Task
    if (global.cfdTxCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing CFD Trading Task...`);
      await performCFDTask(logger, [privateKey], [], global.cfdTxCount, usedNonces);
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: CFD transaction count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 16. Spout Task
    if (global.spoutTxCount > 0) {
      logger(`${getShortAddress(wallet.address)} | Processing Spout Task...`);
      await performSpoutTask(
        logger,
        [privateKey],
        [],
        global.spoutTxCount,
        global.spoutMinAmount,
        global.spoutMaxAmount,
        global.spoutMinDelay,
        global.spoutMaxDelay,
        global.spoutEnableKyc,
        global.spoutEnableBuy,
        global.spoutEnableSell,
        usedNonces
      );
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: Spout transaction count is 0, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 17. Bitverse Task
    if (global.bitverseTradeCount > 0 || global.bitverseAction !== "trade") {
      logger(`${getShortAddress(wallet.address)} | Processing Bitverse Task...`);
      const bitverseConfig = {
        action: global.bitverseAction,
        subAction: global.bitverseSubAction,
        depositAmount: global.bitverseDepositAmount,
        withdrawAmount: global.bitverseWithdrawAmount,
        tradeCount: global.bitverseTradeCount,
        tradeAmount: global.bitverseTradeAmount,
        minDelay: global.bitverseMinDelay,
        maxDelay: global.bitverseMaxDelay,
        useProxy: global.bitverseUseProxy,
        rotateProxy: global.bitverseRotateProxy
      };
      await performBitverseTask(logger, [privateKey], [], bitverseConfig, usedNonces);
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: Bitverse task not configured, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 18. R2 Task
    if (global.r2SwapCount > 0 || global.r2EarnCount > 0 || global.r2Action === "all") {
      logger(`${getShortAddress(wallet.address)} | Processing R2 Task...`);
      const r2Config = {
        action: global.r2Action,
        swapOption: global.r2SwapOption,
        swapCount: global.r2SwapCount,
        earnCount: global.r2EarnCount,
        usdcSwapAmount: global.r2UsdcSwapAmount,
        r2usdSwapAmount: global.r2R2usdSwapAmount,
        r2usdEarnAmount: global.r2R2usdEarnAmount,
        minDelay: global.r2MinDelay,
        maxDelay: global.r2MaxDelay,
        useProxy: global.r2UseProxy,
        rotateProxy: global.r2RotateProxy
      };
      await performR2Task(logger, [privateKey], [], r2Config, usedNonces);
    } else {
      logger(`${getShortAddress(wallet.address)} | Warning: R2 task not configured, skipping...`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 19. Mint NFTs
    logger(`${getShortAddress(wallet.address)} | Processing Mint NFTs...`);
    if (!accountTokens[wallet.address]) {
      const loginSuccess = await loginAccount(privateKey, logger);
      if (!loginSuccess) {
        logger(`${getShortAddress(wallet.address)} | Error: Login failed, skipping NFTs...`);
      } else {
        const token = accountTokens[wallet.address];
        for (const nft of nfts) {
          await mintNFTBadge(wallet, token, nft, logger);
        }
      }
    } else {
      const token = accountTokens[wallet.address];
      for (const nft of nfts) {
        await mintNFTBadge(wallet, token, nft, logger);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));

    logger(`${getShortAddress(wallet.address)} | All activities completed for account ${i + 1}`);
  }

  logger("System | All activities completed for all accounts!");
}

async function mainMenu(logger) {
  while (true) {
    displayBanner();
    displayMenu();
    const choice = await requestInput(`Select an option (1-${menuOptions.length})`, "number");
    const idx = choice - 1;

    if (isNaN(idx) || idx < 0 || idx >= menuOptions.length) {
      logger("System | Error: Invalid option. Try again.");
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    const selected = menuOptions[idx];
    if (selected.value === "exit") {
      logger("System | Exiting...");
      await new Promise((resolve) => setTimeout(resolve, 500));
      rl.close();
      process.exit(0);
    }

    if (selected.value === "setTransactionCount") {
      const newTxCount = await requestInput(
        "Enter number of transactions",
        "number",
        global.maxTransaction.toString()
      );
      if (isNaN(newTxCount) || newTxCount <= 0) {
        logger("System | Error: Invalid transaction count. Keeping current: " + global.maxTransaction);
      } else {
        global.maxTransaction = newTxCount;
        logger(`System | Success: Set transaction count to: ${newTxCount}`);
      }
      const newMintCount = await requestInput(
        "Enter number of AquaFlux mints",
        "number",
        global.aquaFluxMintCount.toString()
      );
      if (isNaN(newMintCount) || newMintCount < 0) {
        logger(
          "System | Error: Invalid AquaFlux mint count. Keeping current: " + global.aquaFluxMintCount
        );
      } else {
        global.aquaFluxMintCount = newMintCount;
        logger(`System | Success: Set AquaFlux mint count to: ${newMintCount}`);
      }
      const newTipCount = await requestInput(
        "Enter number of tips",
        "number",
        global.tipCount.toString()
      );
      if (isNaN(newTipCount) || newTipCount < 0) {
        logger("System | Error: Invalid tip count. Keeping current: " + global.tipCount);
      } else {
        global.tipCount = newTipCount;
        logger(`System | Success: Set tip count to: ${newTipCount}`);
      }
      const newTipUsername = await requestInput(
        "Enter X username to tip",
        "text",
        global.tipUsername
      );
      global.tipUsername = newTipUsername;
      logger(`System | Success: Set tip username to: ${newTipUsername}`);
      const newFaroswapTxCount = await requestInput(
        "Enter number of Faroswap transactions",
        "number",
        global.faroswapTxCount.toString()
      );
      if (isNaN(newFaroswapTxCount) || newFaroswapTxCount < 0) {
        logger(
          "System | Error: Invalid Faroswap transaction count. Keeping current: " + global.faroswapTxCount
        );
      } else {
        global.faroswapTxCount = newFaroswapTxCount;
        logger(`System | Success: Set Faroswap transaction count to: ${newFaroswapTxCount}`);
      }
      const newAutoStakingTxCount = await requestInput(
        "Enter number of AutoStaking transactions",
        "number",
        global.autoStakingTxCount.toString()
      );
      if (isNaN(newAutoStakingTxCount) || newAutoStakingTxCount < 0) {
        logger(
          "System | Error: Invalid AutoStaking transaction count. Keeping current: " + global.autoStakingTxCount
        );
      } else {
        global.autoStakingTxCount = newAutoStakingTxCount;
        logger(`System | Success: Set AutoStaking transaction count to: ${newAutoStakingTxCount}`);
      }
      const newAutoStakingMinDelay = await requestInput(
        "Enter minimum delay between AutoStaking transactions (seconds)",
        "number",
        global.autoStakingMinDelay.toString()
      );
      if (isNaN(newAutoStakingMinDelay) || newAutoStakingMinDelay < 0) {
        logger(
          "System | Error: Invalid AutoStaking min delay. Keeping current: " + global.autoStakingMinDelay
        );
      } else {
        global.autoStakingMinDelay = newAutoStakingMinDelay;
        logger(`System | Success: Set AutoStaking min delay to: ${newAutoStakingMinDelay} seconds`);
      }
      const newAutoStakingMaxDelay = await requestInput(
        "Enter maximum delay between AutoStaking transactions (seconds)",
        "number",
        global.autoStakingMaxDelay.toString()
      );
      if (isNaN(newAutoStakingMaxDelay) || newAutoStakingMaxDelay < 0) {
        logger(
          "System | Error: Invalid AutoStaking max delay. Keeping current: " + global.autoStakingMaxDelay
        );
      } else {
        global.autoStakingMaxDelay = newAutoStakingMaxDelay;
        logger(`System | Success: Set AutoStaking max delay to: ${newAutoStakingMaxDelay} seconds`);
      }
      const newAutoStakingUsdcAmount = await requestInput(
        "Enter USDC amount for AutoStaking",
        "number",
        global.autoStakingUsdcAmount.toString()
      );
      if (isNaN(newAutoStakingUsdcAmount) || newAutoStakingUsdcAmount <= 0) {
        logger(
          "System | Error: Invalid AutoStaking USDC amount. Keeping current: " + global.autoStakingUsdcAmount
        );
      } else {
        global.autoStakingUsdcAmount = newAutoStakingUsdcAmount;
        logger(`System | Success: Set AutoStaking USDC amount to: ${newAutoStakingUsdcAmount}`);
      }
      const newAutoStakingUsdtAmount = await requestInput(
        "Enter USDT amount for AutoStaking",
        "number",
        global.autoStakingUsdtAmount.toString()
      );
      if (isNaN(newAutoStakingUsdtAmount) || newAutoStakingUsdtAmount <= 0) {
        logger(
          "System | Error: Invalid AutoStaking USDT amount. Keeping current: " + global.autoStakingUsdtAmount
        );
      } else {
        global.autoStakingUsdtAmount = newAutoStakingUsdtAmount;
        logger(`System | Success: Set AutoStaking USDT amount to: ${newAutoStakingUsdtAmount}`);
      }
      const newAutoStakingMusdAmount = await requestInput(
        "Enter MockUSD amount for AutoStaking",
        "number",
        global.autoStakingMusdAmount.toString()
      );
      if (isNaN(newAutoStakingMusdAmount) || newAutoStakingMusdAmount <= 0) {
        logger(
          "System | Error: Invalid AutoStaking MockUSD amount. Keeping current: " + global.autoStakingMusdAmount
        );
      } else {
        global.autoStakingMusdAmount = newAutoStakingMusdAmount;
        logger(`System | Success: Set AutoStaking MockUSD amount to: ${newAutoStakingMusdAmount}`);
      }
      const newAutoStakingUseProxy = await requestInput(
        "Use proxy for AutoStaking? (true/false)",
        "text",
        global.autoStakingUseProxy.toString()
      );
      global.autoStakingUseProxy = newAutoStakingUseProxy.toLowerCase() === "true";
      logger(`System | Success: Set AutoStaking use proxy to: ${global.autoStakingUseProxy}`);
      const newAutoStakingRotateProxy = await requestInput(
        "Rotate proxy for AutoStaking? (true/false)",
        "text",
        global.autoStakingRotateProxy.toString()
      );
      global.autoStakingRotateProxy = newAutoStakingRotateProxy.toLowerCase() === "true";
      logger(`System | Success: Set AutoStaking rotate proxy to: ${global.autoStakingRotateProxy}`);
      const newDomainMintCount = await requestInput(
        "Enter number of Domain mints",
        "number",
        global.domainMintCount.toString()
      );
      if (isNaN(newDomainMintCount) || newDomainMintCount < 0) {
        logger(
          "System | Error: Invalid Domain mint count. Keeping current: " + global.domainMintCount
        );
      } else {
        global.domainMintCount = newDomainMintCount;
        logger(`System | Success: Set Domain mint count to: ${newDomainMintCount}`);
      }
      
      // Added PNS Domain configuration
      const newPNSMintCount = await requestInput(
        "Enter number of PNS Domain mints",
        "number",
        global.pnsMintCount.toString()
      );
      if (isNaN(newPNSMintCount) || newPNSMintCount < 0) {
        logger(
          "System | Error: Invalid PNS mint count. Keeping current: " + global.pnsMintCount
        );
      } else {
        global.pnsMintCount = newPNSMintCount;
        logger(`System | Success: Set PNS mint count to: ${newPNSMintCount}`);
      }
      const newPNSMinDelay = await requestInput(
        "Enter minimum delay between PNS transactions (seconds)",
        "number",
        global.pnsMinDelay.toString()
      );
      if (isNaN(newPNSMinDelay) || newPNSMinDelay < 0) {
        logger(
          "System | Error: Invalid PNS min delay. Keeping current: " + global.pnsMinDelay
        );
      } else {
        global.pnsMinDelay = newPNSMinDelay;
        logger(`System | Success: Set PNS min delay to: ${newPNSMinDelay} seconds`);
      }
      const newPNSMaxDelay = await requestInput(
        "Enter maximum delay between PNS transactions (seconds)",
        "number",
        global.pnsMaxDelay.toString()
      );
      if (isNaN(newPNSMaxDelay) || newPNSMaxDelay < global.pnsMinDelay) {
        logger(
          "System | Error: Invalid PNS max delay. Keeping current: " + global.pnsMaxDelay
        );
      } else {
        global.pnsMaxDelay = newPNSMaxDelay;
        logger(`System | Success: Set PNS max delay to: ${newPNSMaxDelay} seconds`);
      }
      const newPNSUseProxy = await requestInput(
        "Use proxy for PNS? (true/false)",
        "text",
        global.pnsUseProxy.toString()
      );
      global.pnsUseProxy = newPNSUseProxy.toLowerCase() === "true";
      logger(`System | Success: Set PNS use proxy to: ${global.pnsUseProxy}`);
      
      if (global.pnsUseProxy) {
        const newPNSRotateProxy = await requestInput(
          "Rotate proxy for PNS? (true/false)",
          "text",
          global.pnsRotateProxy.toString()
        );
        global.pnsRotateProxy = newPNSRotateProxy.toLowerCase() === "true";
        logger(`System | Success: Set PNS rotate proxy to: ${global.pnsRotateProxy}`);
      }
      
      const newOpenFiTxCount = await requestInput(
        "Enter number of OpenFi transactions",
        "number",
        global.openFiTxCount.toString()
      );
      if (isNaN(newOpenFiTxCount) || newOpenFiTxCount < 0) {
        logger(
          "System | Error: Invalid OpenFi transaction count. Keeping current: " + global.openFiTxCount
        );
      } else {
        global.openFiTxCount = newOpenFiTxCount;
        logger(`System | Success: Set OpenFi transaction count to: ${newOpenFiTxCount}`);
      }
      const newCFDTxCount = await requestInput(
        "Enter number of CFD transactions",
        "number",
        global.cfdTxCount.toString()
      );
      if (isNaN(newCFDTxCount) || newCFDTxCount < 0) {
        logger(
          "System | Error: Invalid CFD transaction count. Keeping current: " + global.cfdTxCount
        );
      } else {
        global.cfdTxCount = newCFDTxCount;
        logger(`System | Success: Set CFD transaction count to: ${newCFDTxCount}`);
      }
      // Added Spout configuration
      const newSpoutTxCount = await requestInput(
        "Enter number of Spout transactions",
        "number",
        global.spoutTxCount.toString()
      );
      if (isNaN(newSpoutTxCount) || newSpoutTxCount < 0) {
        logger(
          "System | Error: Invalid Spout transaction count. Keeping current: " + global.spoutTxCount
        );
      } else {
        global.spoutTxCount = newSpoutTxCount;
        logger(`System | Success: Set Spout transaction count to: ${newSpoutTxCount}`);
      }
      const newSpoutMinAmount = await requestInput(
        "Enter minimum amount for Spout (USDC for buy, LQD for sell)",
        "number",
        global.spoutMinAmount.toString()
      );
      if (isNaN(newSpoutMinAmount) || newSpoutMinAmount <= 0) {
        logger(
          "System | Error: Invalid Spout min amount. Keeping current: " + global.spoutMinAmount
        );
      } else {
        global.spoutMinAmount = newSpoutMinAmount;
        logger(`System | Success: Set Spout min amount to: ${newSpoutMinAmount}`);
      }
      const newSpoutMaxAmount = await requestInput(
        "Enter maximum amount for Spout (USDC for buy, LQD for sell)",
        "number",
        global.spoutMaxAmount.toString()
      );
      if (isNaN(newSpoutMaxAmount) || newSpoutMaxAmount <= 0 || newSpoutMaxAmount < global.spoutMinAmount) {
        logger(
          "System | Error: Invalid Spout max amount. Keeping current: " + global.spoutMaxAmount
        );
      } else {
        global.spoutMaxAmount = newSpoutMaxAmount;
        logger(`System | Success: Set Spout max amount to: ${newSpoutMaxAmount}`);
      }
      const newSpoutMinDelay = await requestInput(
        "Enter minimum delay between Spout transactions (seconds)",
        "number",
        global.spoutMinDelay.toString()
      );
      if (isNaN(newSpoutMinDelay) || newSpoutMinDelay < 0) {
        logger(
          "System | Error: Invalid Spout min delay. Keeping current: " + global.spoutMinDelay
        );
      } else {
        global.spoutMinDelay = newSpoutMinDelay;
        logger(`System | Success: Set Spout min delay to: ${newSpoutMinDelay} seconds`);
      }
      const newSpoutMaxDelay = await requestInput(
        "Enter maximum delay between Spout transactions (seconds)",
        "number",
        global.spoutMaxDelay.toString()
      );
      if (isNaN(newSpoutMaxDelay) || newSpoutMaxDelay < 0 || newSpoutMaxDelay < global.spoutMinDelay) {
        logger(
          "System | Error: Invalid Spout max delay. Keeping current: " + global.spoutMaxDelay
        );
      } else {
        global.spoutMaxDelay = newSpoutMaxDelay;
        logger(`System | Success: Set Spout max delay to: ${newSpoutMaxDelay} seconds`);
      }
      const newSpoutEnableKyc = await requestInput(
        "Enable KYC for Spout? (true/false)",
        "text",
        global.spoutEnableKyc.toString()
      );
      global.spoutEnableKyc = newSpoutEnableKyc.toLowerCase() === "true";
      logger(`System | Success: Set Spout enable KYC to: ${global.spoutEnableKyc}`);
      const newSpoutEnableBuy = await requestInput(
        "Enable Buy for Spout? (true/false)",
        "text",
        global.spoutEnableBuy.toString()
      );
      global.spoutEnableBuy = newSpoutEnableBuy.toLowerCase() === "true";
      logger(`System | Success: Set Spout enable buy to: ${global.spoutEnableBuy}`);
      const newSpoutEnableSell = await requestInput(
        "Enable Sell for Spout? (true/false)",
        "text",
        global.spoutEnableSell.toString()
      );
      global.spoutEnableSell = newSpoutEnableSell.toLowerCase() === "true";
      logger(`System | Success: Set Spout enable sell to: ${global.spoutEnableSell}`);
      
      // Added Bitverse configuration
      logger("System | Configuring Bitverse Task...");
      
      // Select Bitverse action
      const bitverseActions = ["1. Deposit USDT", "2. Withdraw USDT", "3. Random Trade", "4. Run All Features"];
      console.log(chalk.greenBright("\nSelect Bitverse Action:"));
      bitverseActions.forEach(action => console.log(chalk.white(action)));
      
      const bitverseActionChoice = await requestInput("Choose [1/2/3/4]", "number", "3");
      if (bitverseActionChoice === 1) {
        global.bitverseAction = "deposit";
        const newBitverseDepositAmount = await requestInput(
          "Enter Bitverse deposit amount (USDT)",
          "number",
          global.bitverseDepositAmount.toString()
        );
        if (!isNaN(newBitverseDepositAmount) && newBitverseDepositAmount > 0) {
          global.bitverseDepositAmount = newBitverseDepositAmount;
          logger(`System | Success: Set Bitverse deposit amount to: ${newBitverseDepositAmount}`);
        }
      } else if (bitverseActionChoice === 2) {
        global.bitverseAction = "withdraw";
        const newBitverseWithdrawAmount = await requestInput(
          "Enter Bitverse withdraw amount (USDT)",
          "number",
          global.bitverseWithdrawAmount.toString()
        );
        if (!isNaN(newBitverseWithdrawAmount) && newBitverseWithdrawAmount > 0) {
          global.bitverseWithdrawAmount = newBitverseWithdrawAmount;
          logger(`System | Success: Set Bitverse withdraw amount to: ${newBitverseWithdrawAmount}`);
        }
      } else if (bitverseActionChoice === 3) {
        global.bitverseAction = "trade";
        const newBitverseTradeCount = await requestInput(
          "Enter number of Bitverse trades",
          "number",
          global.bitverseTradeCount.toString()
        );
        if (!isNaN(newBitverseTradeCount) && newBitverseTradeCount > 0) {
          global.bitverseTradeCount = newBitverseTradeCount;
          logger(`System | Success: Set Bitverse trade count to: ${newBitverseTradeCount}`);
        }
        const newBitverseTradeAmount = await requestInput(
          "Enter Bitverse trade amount (USDT)",
          "number",
          global.bitverseTradeAmount.toString()
        );
        if (!isNaN(newBitverseTradeAmount) && newBitverseTradeAmount > 0) {
          global.bitverseTradeAmount = newBitverseTradeAmount;
          logger(`System | Success: Set Bitverse trade amount to: ${newBitverseTradeAmount}`);
        }
        const newBitverseMinDelay = await requestInput(
          "Enter minimum delay between Bitverse trades (seconds)",
          "number",
          global.bitverseMinDelay.toString()
        );
        if (!isNaN(newBitverseMinDelay) && newBitverseMinDelay >= 0) {
          global.bitverseMinDelay = newBitverseMinDelay;
          logger(`System | Success: Set Bitverse min delay to: ${newBitverseMinDelay} seconds`);
        }
        const newBitverseMaxDelay = await requestInput(
          "Enter maximum delay between Bitverse trades (seconds)",
          "number",
          global.bitverseMaxDelay.toString()
        );
        if (!isNaN(newBitverseMaxDelay) && newBitverseMaxDelay >= global.bitverseMinDelay) {
          global.bitverseMaxDelay = newBitverseMaxDelay;
          logger(`System | Success: Set Bitverse max delay to: ${newBitverseMaxDelay} seconds`);
        }
      } else if (bitverseActionChoice === 4) {
        global.bitverseAction = "all";
        // Ask for sub-action (deposit or withdraw)
        const subActionChoice = await requestInput("Choose deposit (1) or withdraw (2) first", "number", "1");
        global.bitverseSubAction = subActionChoice === 2 ? "withdraw" : "deposit";
        
        if (global.bitverseSubAction === "deposit") {
          const newBitverseDepositAmount = await requestInput(
            "Enter Bitverse deposit amount (USDT)",
            "number",
            global.bitverseDepositAmount.toString()
          );
          if (!isNaN(newBitverseDepositAmount) && newBitverseDepositAmount > 0) {
            global.bitverseDepositAmount = newBitverseDepositAmount;
            logger(`System | Success: Set Bitverse deposit amount to: ${newBitverseDepositAmount}`);
          }
        } else {
          const newBitverseWithdrawAmount = await requestInput(
            "Enter Bitverse withdraw amount (USDT)",
            "number",
            global.bitverseWithdrawAmount.toString()
          );
          if (!isNaN(newBitverseWithdrawAmount) && newBitverseWithdrawAmount > 0) {
            global.bitverseWithdrawAmount = newBitverseWithdrawAmount;
            logger(`System | Success: Set Bitverse withdraw amount to: ${newBitverseWithdrawAmount}`);
          }
        }
        
        const newBitverseTradeCount = await requestInput(
          "Enter number of Bitverse trades",
          "number",
          global.bitverseTradeCount.toString()
        );
        if (!isNaN(newBitverseTradeCount) && newBitverseTradeCount > 0) {
          global.bitverseTradeCount = newBitverseTradeCount;
          logger(`System | Success: Set Bitverse trade count to: ${newBitverseTradeCount}`);
        }
        const newBitverseTradeAmount = await requestInput(
          "Enter Bitverse trade amount (USDT)",
          "number",
          global.bitverseTradeAmount.toString()
        );
        if (!isNaN(newBitverseTradeAmount) && newBitverseTradeAmount > 0) {
          global.bitverseTradeAmount = newBitverseTradeAmount;
          logger(`System | Success: Set Bitverse trade amount to: ${newBitverseTradeAmount}`);
        }
        const newBitverseMinDelay = await requestInput(
          "Enter minimum delay between Bitverse trades (seconds)",
          "number",
          global.bitverseMinDelay.toString()
        );
        if (!isNaN(newBitverseMinDelay) && newBitverseMinDelay >= 0) {
          global.bitverseMinDelay = newBitverseMinDelay;
          logger(`System | Success: Set Bitverse min delay to: ${newBitverseMinDelay} seconds`);
        }
        const newBitverseMaxDelay = await requestInput(
          "Enter maximum delay between Bitverse trades (seconds)",
          "number",
          global.bitverseMaxDelay.toString()
        );
        if (!isNaN(newBitverseMaxDelay) && newBitverseMaxDelay >= global.bitverseMinDelay) {
          global.bitverseMaxDelay = newBitverseMaxDelay;
          logger(`System | Success: Set Bitverse max delay to: ${newBitverseMaxDelay} seconds`);
        }
      }
      
      const newBitverseUseProxy = await requestInput(
        "Use proxy for Bitverse? (true/false)",
        "text",
        global.bitverseUseProxy.toString()
      );
      global.bitverseUseProxy = newBitverseUseProxy.toLowerCase() === "true";
      logger(`System | Success: Set Bitverse use proxy to: ${global.bitverseUseProxy}`);
      
      if (global.bitverseUseProxy) {
        const newBitverseRotateProxy = await requestInput(
          "Rotate proxy for Bitverse? (true/false)",
          "text",
          global.bitverseRotateProxy.toString()
        );
        global.bitverseRotateProxy = newBitverseRotateProxy.toLowerCase() === "true";
        logger(`System | Success: Set Bitverse rotate proxy to: ${global.bitverseRotateProxy}`);
      }
      
      // Added R2 configuration
      logger("System | Configuring R2 Task...");
      
      // Select R2 action
      const r2Actions = ["1. R2 Swap", "2. R2 Earn", "3. Run All Features"];
      console.log(chalk.greenBright("\nSelect R2 Action:"));
      r2Actions.forEach(action => console.log(chalk.white(action)));
      
      const r2ActionChoice = await requestInput("Choose [1/2/3]", "number", "1");
      if (r2ActionChoice === 1) {
        global.r2Action = "swap";
        
        // Select swap option
        console.log(chalk.greenBright("\nSelect Swap Option:"));
        console.log(chalk.white("1. Buy -> USDC to R2USD"));
        console.log(chalk.white("2. Sell -> R2USD to USDC"));
        console.log(chalk.white("3. Random Swap"));
        
        const swapOptionChoice = await requestInput("Choose [1/2/3]", "number", "3");
        global.r2SwapOption = swapOptionChoice;
        
        const newR2SwapCount = await requestInput(
          "Enter number of R2 swaps",
          "number",
          global.r2SwapCount.toString()
        );
        if (!isNaN(newR2SwapCount) && newR2SwapCount > 0) {
          global.r2SwapCount = newR2SwapCount;
          logger(`System | Success: Set R2 swap count to: ${newR2SwapCount}`);
        }
        
        if (global.r2SwapOption === 1 || global.r2SwapOption === 3) {
          const newR2UsdcSwapAmount = await requestInput(
            "Enter USDC swap amount",
            "number",
            global.r2UsdcSwapAmount.toString()
          );
          if (!isNaN(newR2UsdcSwapAmount) && newR2UsdcSwapAmount > 0) {
            global.r2UsdcSwapAmount = newR2UsdcSwapAmount;
            logger(`System | Success: Set R2 USDC swap amount to: ${newR2UsdcSwapAmount}`);
          }
        }
        
        if (global.r2SwapOption === 2 || global.r2SwapOption === 3) {
          const newR2R2usdSwapAmount = await requestInput(
            "Enter R2USD swap amount",
            "number",
            global.r2R2usdSwapAmount.toString()
          );
          if (!isNaN(newR2R2usdSwapAmount) && newR2R2usdSwapAmount > 0) {
            global.r2R2usdSwapAmount = newR2R2usdSwapAmount;
            logger(`System | Success: Set R2 R2USD swap amount to: ${newR2R2usdSwapAmount}`);
          }
        }
      } else if (r2ActionChoice === 2) {
        global.r2Action = "earn";
        
        const newR2EarnCount = await requestInput(
          "Enter number of R2 earn transactions",
          "number",
          global.r2EarnCount.toString()
        );
        if (!isNaN(newR2EarnCount) && newR2EarnCount > 0) {
          global.r2EarnCount = newR2EarnCount;
          logger(`System | Success: Set R2 earn count to: ${newR2EarnCount}`);
        }
        
        const newR2R2usdEarnAmount = await requestInput(
          "Enter R2USD earn amount",
          "number",
          global.r2R2usdEarnAmount.toString()
        );
        if (!isNaN(newR2R2usdEarnAmount) && newR2R2usdEarnAmount > 0) {
          global.r2R2usdEarnAmount = newR2R2usdEarnAmount;
          logger(`System | Success: Set R2 R2USD earn amount to: ${newR2R2usdEarnAmount}`);
        }
      } else if (r2ActionChoice === 3) {
        global.r2Action = "all";
        
        // Configure swap
        console.log(chalk.greenBright("\nSelect Swap Option:"));
        console.log(chalk.white("1. Buy -> USDC to R2USD"));
        console.log(chalk.white("2. Sell -> R2USD to USDC"));
        console.log(chalk.white("3. Random Swap"));
        
        const swapOptionChoice = await requestInput("Choose [1/2/3]", "number", "3");
        global.r2SwapOption = swapOptionChoice;
        
        const newR2SwapCount = await requestInput(
          "Enter number of R2 swaps",
          "number",
          global.r2SwapCount.toString()
        );
        if (!isNaN(newR2SwapCount) && newR2SwapCount > 0) {
          global.r2SwapCount = newR2SwapCount;
          logger(`System | Success: Set R2 swap count to: ${newR2SwapCount}`);
        }
        
        if (global.r2SwapOption === 1 || global.r2SwapOption === 3) {
          const newR2UsdcSwapAmount = await requestInput(
            "Enter USDC swap amount",
            "number",
            global.r2UsdcSwapAmount.toString()
          );
          if (!isNaN(newR2UsdcSwapAmount) && newR2UsdcSwapAmount > 0) {
            global.r2UsdcSwapAmount = newR2UsdcSwapAmount;
            logger(`System | Success: Set R2 USDC swap amount to: ${newR2UsdcSwapAmount}`);
          }
        }
        
        if (global.r2SwapOption === 2 || global.r2SwapOption === 3) {
          const newR2R2usdSwapAmount = await requestInput(
            "Enter R2USD swap amount",
            "number",
            global.r2R2usdSwapAmount.toString()
          );
          if (!isNaN(newR2R2usdSwapAmount) && newR2R2usdSwapAmount > 0) {
            global.r2R2usdSwapAmount = newR2R2usdSwapAmount;
            logger(`System | Success: Set R2 R2USD swap amount to: ${newR2R2usdSwapAmount}`);
          }
        }
        
        // Configure earn
        const newR2EarnCount = await requestInput(
          "Enter number of R2 earn transactions",
          "number",
          global.r2EarnCount.toString()
        );
        if (!isNaN(newR2EarnCount) && newR2EarnCount > 0) {
          global.r2EarnCount = newR2EarnCount;
          logger(`System | Success: Set R2 earn count to: ${newR2EarnCount}`);
        }
        
        const newR2R2usdEarnAmount = await requestInput(
          "Enter R2USD earn amount",
          "number",
          global.r2R2usdEarnAmount.toString()
        );
        if (!isNaN(newR2R2usdEarnAmount) && newR2R2usdEarnAmount > 0) {
          global.r2R2usdEarnAmount = newR2R2usdEarnAmount;
          logger(`System | Success: Set R2 R2USD earn amount to: ${newR2R2usdEarnAmount}`);
        }
      }
      
      // Common R2 settings
      const newR2MinDelay = await requestInput(
        "Enter minimum delay between R2 transactions (seconds)",
        "number",
        global.r2MinDelay.toString()
      );
      if (!isNaN(newR2MinDelay) && newR2MinDelay >= 0) {
        global.r2MinDelay = newR2MinDelay;
        logger(`System | Success: Set R2 min delay to: ${newR2MinDelay} seconds`);
      }
      
      const newR2MaxDelay = await requestInput(
        "Enter maximum delay between R2 transactions (seconds)",
        "number",
        global.r2MaxDelay.toString()
      );
      if (!isNaN(newR2MaxDelay) && newR2MaxDelay >= global.r2MinDelay) {
        global.r2MaxDelay = newR2MaxDelay;
        logger(`System | Success: Set R2 max delay to: ${newR2MaxDelay} seconds`);
      }
      
      const newR2UseProxy = await requestInput(
        "Use proxy for R2? (true/false)",
        "text",
        global.r2UseProxy.toString()
      );
      global.r2UseProxy = newR2UseProxy.toLowerCase() === "true";
      logger(`System | Success: Set R2 use proxy to: ${global.r2UseProxy}`);
      
      if (global.r2UseProxy) {
        const newR2RotateProxy = await requestInput(
          "Rotate proxy for R2? (true/false)",
          "text",
          global.r2RotateProxy.toString()
        );
        global.r2RotateProxy = newR2RotateProxy.toLowerCase() === "true";
        logger(`System | Success: Set R2 rotate proxy to: ${global.r2RotateProxy}`);
      }
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    try {
      logger(`System | Starting ${selected.label}...`);
      const functions = {
        performDailySignIn,
        claimFaucet,
        performTransfers,
        performWrap: async () => {
          for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            const wallet = new ethers.Wallet(privateKey);
            await performWrapUnwrap(true, logger, wallet);
          }
        },
        performUnwrap: async () => {
          for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            const wallet = new ethers.Wallet(privateKey);
            await performWrapUnwrap(false, logger, wallet);
          }
        },
        performSwaps: async () => {
          for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            const wallet = new ethers.Wallet(privateKey);
            await performSwaps(logger, wallet);
          }
        },
        addLiquidity: async () => {
          for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            const wallet = new ethers.Wallet(privateKey);
            await addLiquidity(logger, wallet);
          }
        },
        performAquaFluxMint: async () => {
          await performAquaFluxMint(logger, privateKeys, [], global.aquaFluxMintCount, usedNonces);
        },
        sendTip: async () => {
          await sendTipTask(logger, privateKeys, [], global.tipCount, global.tipUsername, usedNonces);
        },
        performFaroswapTask: async () => {
          await performFaroswapTask(
            logger,
            privateKeys,
            [],
            global.faroswapTxCount,
            usedNonces
          );
        },
        performAutoStakingTask: async () => {
          await performAutoStakingTask(
            logger,
            privateKeys,
            [],
            global.autoStakingTxCount,
            global.autoStakingMinDelay,
            global.autoStakingMaxDelay,
            global.autoStakingUsdcAmount,
            global.autoStakingUsdtAmount,
            global.autoStakingMusdAmount,
            global.autoStakingUseProxy,
            global.autoStakingRotateProxy,
            usedNonces
          );
        },
        performDomainMintTask: async () => {
          await performDomainMintTask(
            logger,
            privateKeys,
            [],
            global.domainMintCount,
            usedNonces
          );
        },
        performPNSDomainTask: async () => { // Added PNS Domain Task
          const pnsConfig = {
            mintCount: global.pnsMintCount,
            minDelay: global.pnsMinDelay,
            maxDelay: global.pnsMaxDelay,
            useProxy: global.pnsUseProxy,
            rotateProxy: global.pnsRotateProxy
          };
          await performPNSDomainTask(logger, privateKeys, [], pnsConfig, usedNonces);
        },
        performOpenFiTask: async () => {
          await performOpenFiTask(logger, privateKeys, [], global.openFiTxCount, usedNonces);
        },
        performCFDTask: async () => {
          await performCFDTask(logger, privateKeys, [], global.cfdTxCount, usedNonces);
        },
        performSpoutTask: async () => {
          await performSpoutTask(
            logger,
            privateKeys,
            [],
            global.spoutTxCount,
            global.spoutMinAmount,
            global.spoutMaxAmount,
            global.spoutMinDelay,
            global.spoutMaxDelay,
            global.spoutEnableKyc,
            global.spoutEnableBuy,
            global.spoutEnableSell,
            usedNonces
          );
        },
        performBitverseTask: async () => {
          const bitverseConfig = {
            action: global.bitverseAction,
            subAction: global.bitverseSubAction,
            depositAmount: global.bitverseDepositAmount,
            withdrawAmount: global.bitverseWithdrawAmount,
            tradeCount: global.bitverseTradeCount,
            tradeAmount: global.bitverseTradeAmount,
            minDelay: global.bitverseMinDelay,
            maxDelay: global.bitverseMaxDelay,
            useProxy: global.bitverseUseProxy,
            rotateProxy: global.bitverseRotateProxy
          };
          await performBitverseTask(logger, privateKeys, [], bitverseConfig, usedNonces);
        },
        performR2Task: async () => {
          const r2Config = {
            action: global.r2Action,
            swapOption: global.r2SwapOption,
            swapCount: global.r2SwapCount,
            earnCount: global.r2EarnCount,
            usdcSwapAmount: global.r2UsdcSwapAmount,
            r2usdSwapAmount: global.r2R2usdSwapAmount,
            r2usdEarnAmount: global.r2R2usdEarnAmount,
            minDelay: global.r2MinDelay,
            maxDelay: global.r2MaxDelay,
            useProxy: global.r2UseProxy,
            rotateProxy: global.r2RotateProxy
          };
          await performR2Task(logger, privateKeys, [], r2Config, usedNonces);
        },
        checkStatus: async () => {
          await runStatusCheck();
        },
        displayAccounts,
        mintNFTs: mintNFTs,
        runAllActivities,
      };
      const scriptFunc = functions[selected.value];
      if (scriptFunc) {
        await scriptFunc(logger);
        logger(`System | ${selected.label} completed.`);
      } else {
        logger(`System | Error: ${selected.label} not implemented.`);
      }
    } catch (e) {
      logger(`System | Error in ${selected.label}: ${chalk.red(e.message)}`);
    }

    await requestInput("Press Enter to continue...");
  }
}

async function main() {
  const logger = (message) => console.log(formatLogMessage(message));

  displayBanner();

  if (!loadPrivateKeys()) {
    logger("System | Error: No valid private keys found in wallets.txt. Please add at least one private key.");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    process.exit(1);
  }

  loadTargetWallets();

  logger(`System | Loaded ${privateKeys.length} private keys, ${targetWallets.length} target wallets`);

  await mainMenu(logger);
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
