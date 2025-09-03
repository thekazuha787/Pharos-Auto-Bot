const { ethers, Wallet, JsonRpcProvider, parseUnits, Contract, parseEther } = require("ethers");
const fs = require("fs");

// --- CONFIGURATION ---
const RPC_URL = "https://api.zan.top/node/v1/pharos/testnet/1c23cdaa41f34fd2a74fc375d2400c47";
const routerAddress = "0x11d1ca4012d94846962bca2FBD58e5A27ddcBfC5"; // POOL_ROUTER_ADDRESS
const wrappedRouterAddress = "0x974828e18bff1E71780f9bE19d0DFf4Fe1f61fCa"; // WRAPPED_ROUTER_ADDRESS
const faucetRouterAddress = "0x0E29d74Af0489f4B08fBfc774e25C0D3b5f43285"; // FAUCET_ROUTER_ADDRESS
const poolProviderAddress = "0x54cb4f6C4c12105B48b11e21d78becC32Ef694EC"; // POOL_PROVIDER_ADDRESS
const lendingPoolAddress = "0x0000000000000000000000000000000000000000"; // LENDING_POOL_ADDRESS

// Token addresses (symbol: address)
const tokens = {
  PHRS: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  WPHRS: "0x3019B247381c850ab53Dc0EE53bCe7A07Ea9155f",
  USDC: "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED",
  USDT: "0xD4071393f8716661958F766DF660033b3d35fD29",
  WETH: "0x4E28826d32F1C398DED160DC16Ac6873357d048f",
  WBTC: "0x8275c526d1bCEc59a31d673929d3cE8d108fF5c7",
  GOLD: "0xAaf03Cbb486201099EdD0a52E03Def18cd0c7354",
  TSLA: "0xA778b48339d3c6b4Bc5a75B37c6Ce210797076b1",
  NVIDIA: "0xAaF3A7F1676385883593d7Ea7ea4FcCc675EE5d6",
};

// Per-token decimals (symbol: decimals)
const tokenDecimals = {
  PHRS: 18,
  WPHRS: 18,
  USDC: 6,
  USDT: 6,
  WETH: 18,
  WBTC: 8,
  GOLD: 18,
  TSLA: 18,
  NVIDIA: 18,
};

// Mint router config
const mintAmount = "100";

// Transaction counts and amounts
const transactionConfig = {
  depositCount: 1,
  depositAmount: "0.0001", // Fixed at 0.0001 PHRS as requested
  borrowCount: 1,
  repayCount: 1,
  withdrawCount: 1,
  minDelay: 5, // seconds
  maxDelay: 10, // seconds
};

// ABI for mint, depositETH, supply, borrow, repay, withdraw
const openFiAbi = [
  {
    name: "isMintable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "getUserReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "asset", type: "address" },
      { name: "user", type: "address" },
    ],
    outputs: [
      { name: "currentBTokenBalance", type: "uint256" },
      { name: "currentStableDebt", type: "uint256" },
      { name: "currentVariableDebt", type: "uint256" },
      { name: "principalStableDebt", type: "uint256" },
      { name: "scaledVariableDebt", type: "uint256" },
      { name: "stableBorrowRate", type: "uint256" },
      { name: "liquidityRate", type: "uint256" },
      { name: "stableRateLastUpdated", type: "uint40" },
      { name: "usageAsCollateralEnabled", type: "bool" },
    ],
  },
  {
    name: "getReserveConfigurationData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "decimals", type: "uint256" },
      { name: "ltv", type: "uint256" },
      { name: "liquidationThreshold", type: "uint256" },
      { name: "liquidationBonus", type: "uint256" },
      { name: "reserveFactor", type: "uint256" },
      { name: "usageAsCollateralEnabled", type: "bool" },
      { name: "borrowingEnabled", type: "bool" },
      { name: "stableBorrowRateEnabled", type: "bool" },
      { name: "isActive", type: "bool" },
      { name: "isFrozen", type: "bool" },
    ],
  },
  {
    name: "getReserveData",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "unbacked", type: "uint256" },
      { name: "accruedToTreasuryScaled", type: "uint256" },
      { name: "totalBToken", type: "uint256" },
      { name: "totalStableDebt", type: "uint256" },
      { name: "totalVariableDebt", type: "uint256" },
      { name: "liquidityRate", type: "uint256" },
      { name: "variableBorrowRate", type: "uint256" },
      { name: "stableBorrowRate", type: "uint256" },
      { name: "averageStableBorrowRate", type: "uint256" },
      { name: "liquidityIndex", type: "uint256" },
      { name: "variableBorrowIndex", type: "uint256" },
      { name: "lastUpdateTimestamp", type: "uint40" },
    ],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "depositETH",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "", type: "address" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "supply",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
  },
  {
    name: "borrow",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "interestRateMode", type: "uint256" },
      { name: "referralCode", type: "uint16" },
      { name: "onBehalfOf", type: "address" },
    ],
    outputs: [],
  },
  {
    name: "repay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "interestRateMode", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
];

// ERC20 ABI fragment for approve/allowance/balanceOf/decimals
const erc20Abi = [
  "function approve(address spender, uint256 amount) public returns (bool)",
  "function allowance(address owner, address spender) public view returns (uint256)",
  "function balanceOf(address account) public view returns (uint256)",
  "function decimals() public view returns (uint8)",
];

// --- HELPER FUNCTIONS ---
function getShortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

async function sleep(seconds) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Load proxies from file (placeholder, as ethers.js doesn’t natively support proxies)
function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    return data.split("\n").map((line) => line.trim()).filter((line) => line);
  } catch (err) {
    console.error(`Error reading proxy.txt: ${err.message}`);
    return [];
  }
}

// Get token balance
async function getTokenBalance(provider, wallet, tokenAddress) {
  try {
    if (tokenAddress === tokens.PHRS) {
      const balance = await provider.getBalance(wallet.address);
      return ethers.formatUnits(balance, 18);
    } else {
      const tokenContract = new Contract(tokenAddress, erc20Abi, provider);
      const balance = await tokenContract.balanceOf(wallet.address);
      const decimals = await tokenContract.decimals();
      return ethers.formatUnits(balance, decimals);
    }
  } catch (err) {
    throw new Error(`Balance fetch error: ${err.message}`);
  }
}

// Check faucet status
async function checkFaucetStatus(provider, wallet, assetAddress) {
  try {
    const faucetContract = new Contract(faucetRouterAddress, openFiAbi, wallet);
    return await faucetContract.isMintable(assetAddress);
  } catch (err) {
    throw new Error(`Faucet status error: ${err.message}`);
  }
}

// Get supplied balance
async function getSuppliedBalance(provider, wallet, assetAddress, decimals) {
  try {
    const poolContract = new Contract(poolProviderAddress, openFiAbi, wallet);
    const reserveData = await poolContract.getUserReserveData(assetAddress, wallet.address);
    return ethers.formatUnits(reserveData.currentBTokenBalance, decimals);
  } catch (err) {
    throw new Error(`Supplied balance error: ${err.message}`);
  }
}

// Get borrowed balance
async function getBorrowedBalance(provider, wallet, assetAddress, decimals) {
  try {
    const poolContract = new Contract(poolProviderAddress, openFiAbi, wallet);
    const reserveData = await poolContract.getUserReserveData(assetAddress, wallet.address);
    const totalDebt = BigInt(reserveData.currentStableDebt) + BigInt(reserveData.currentVariableDebt);
    return ethers.formatUnits(totalDebt, decimals);
  } catch (err) {
    throw new Error(`Borrowed balance error: ${err.message}`);
  }
}

// Get available borrow balance
async function getAvailableBorrowBalance(provider, wallet, assetAddress, decimals) {
  try {
    const poolContract = new Contract(poolProviderAddress, openFiAbi, wallet);
    const reserveData = await poolContract.getUserReserveData(assetAddress, wallet.address);
    const configData = await poolContract.getReserveConfigurationData(assetAddress);
    const poolData = await poolContract.getReserveData(assetAddress);

    const suppliedBalance = BigInt(reserveData.currentBTokenBalance);
    const stableDebt = BigInt(reserveData.currentStableDebt);
    const variableDebt = BigInt(reserveData.currentVariableDebt);
    const ltv = BigInt(configData.ltv);
    const totalToken = BigInt(poolData.totalBToken);
    const totalStableDebt = BigInt(poolData.totalStableDebt);
    const totalVariableDebt = BigInt(poolData.totalVariableDebt);

    const totalDebt = stableDebt + variableDebt;
    const maxBorrowFromCollateral = (suppliedBalance * ltv) / 10000n;
    let availableToBorrow = maxBorrowFromCollateral - totalDebt;
    if (availableToBorrow < 0n) availableToBorrow = 0n;
    const availableLiquidity = totalToken - (totalStableDebt + totalVariableDebt);
    return ethers.formatUnits(availableToBorrow < availableLiquidity ? availableToBorrow : availableLiquidity, decimals);
  } catch (err) {
    throw new Error(`Available borrow balance error: ${err.message}`);
  }
}

// --- MAIN TASK FUNCTION ---
async function performOpenFiTask(logger, privateKeys, proxies, openFiTxCount, usedNonces) {
  const green = "\x1b[32m"; // Green color for successful tx hashes
  const reset = "\x1b[0m"; // Reset color

  logger("System | Starting OpenFi Task...");

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const wallet = new Wallet(privateKey, provider);
    const onBehalfOf = wallet.address;

    logger(`${getShortAddress(wallet.address)} | Processing OpenFi for account ${i + 1}`);

    // Initialize nonce if not already set
    if (!usedNonces[wallet.address]) {
      usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
    }

    for (let j = 0; j < openFiTxCount; j++) {
      logger(`${getShortAddress(wallet.address)} | OpenFi transaction ${j + 1}/${openFiTxCount}`);

      // ----- MINT -----
      const mintContract = new Contract(faucetRouterAddress, openFiAbi, wallet);
      for (const [symbol, tokenAddress] of Object.entries(tokens)) {
        if (["GOLD", "TSLA", "NVIDIA"].includes(symbol)) { // Limit minting to GOLD, TSLA, NVIDIA
          const decimals = tokenDecimals[symbol];
          const amt = parseUnits(mintAmount, decimals);
          let attempts = 0;
          const maxAttempts = 3;

          try {
            const isMintable = await checkFaucetStatus(provider, wallet, tokenAddress);
            if (!isMintable) {
              logger(`${getShortAddress(wallet.address)} | [${symbol}] Not mintable`);
              continue;
            }

            while (attempts < maxAttempts) {
              try {
                usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
                logger(`${getShortAddress(wallet.address)} | [${symbol}] Minting ${mintAmount}...`);
                const nonce = usedNonces[wallet.address];
                const feeData = await provider.getFeeData();
                const tx = await mintContract.mint(tokenAddress, wallet.address, amt, {
                  gasLimit: 200000,
                  maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
                  maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
                  nonce,
                });
                logger(`${getShortAddress(wallet.address)} | [${symbol}] Mint tx: ${green}${tx.hash}${reset}`);
                await tx.wait();
                logger(`${getShortAddress(wallet.address)} | [${symbol}] Mint confirmed`);
                usedNonces[wallet.address]++;
                break;
              } catch (err) {
                attempts++;
                const errorMsg = err.reason || err.message || "Unknown error";
                logger(
                  `${getShortAddress(wallet.address)} | [${symbol}] Mint failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
                );
                if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
                  await sleep(5);
                } else {
                  break;
                }
              }
            }
          } catch (err) {
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Faucet check error: ${err.message}`);
          }
          await sleep(getRandomDelay(transactionConfig.minDelay, transactionConfig.maxDelay));
        }
      }

      // ----- DEPOSIT ETH -----
      const depositContract = new Contract(wrappedRouterAddress, openFiAbi, wallet);
      for (let k = 0; k < transactionConfig.depositCount; k++) {
        logger(
          `${getShortAddress(wallet.address)} | Deposit ${k + 1}/${transactionConfig.depositCount} of ${transactionConfig.depositAmount} PHRS`
        );
        let balance = 0;
        try {
          balance = await getTokenBalance(provider, wallet, tokens.PHRS);
          logger(`${getShortAddress(wallet.address)} | PHRS Balance: ${balance}`);
          if (parseFloat(balance) < parseFloat(transactionConfig.depositAmount)) {
            logger(`${getShortAddress(wallet.address)} | Insufficient PHRS balance`);
            continue;
          }
        } catch (err) {
          logger(`${getShortAddress(wallet.address)} | PHRS balance check error: ${err.message}`);
          continue;
        }

        let attempts = 0;
        const maxAttempts = 3;
        const amount = parseEther(transactionConfig.depositAmount);
        while (attempts < maxAttempts) {
          try {
            usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
            const nonce = usedNonces[wallet.address];
            const feeData = await provider.getFeeData();
            const tx = await depositContract.depositETH(lendingPoolAddress, wallet.address, 0, {
              gasLimit: 300000,
              maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
              nonce,
              value: amount,
            });
            logger(`${getShortAddress(wallet.address)} | Deposit tx: ${green}${tx.hash}${reset}`);
            await tx.wait();
            logger(`${getShortAddress(wallet.address)} | Deposit confirmed`);
            usedNonces[wallet.address]++;
            break;
          } catch (err) {
            attempts++;
            const errorMsg = err.reason || err.message || "Unknown error";
            logger(
              `${getShortAddress(wallet.address)} | Deposit failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
            );
            if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
              await sleep(5);
            } else {
              break;
            }
          }
        }
        await sleep(getRandomDelay(transactionConfig.minDelay, transactionConfig.maxDelay));
      }

      // ----- APPROVE -----
      for (const [symbol, tokenAddress] of Object.entries(tokens)) {
        if (tokenAddress === tokens.PHRS) continue; // Skip PHRS for approval
        const decimals = tokenDecimals[symbol];
        const tokenContract = new Contract(tokenAddress, erc20Abi, wallet);
        let allowance = 0n;
        try {
          allowance = await tokenContract.allowance(wallet.address, routerAddress);
        } catch (e) {
          logger(
            `${getShortAddress(wallet.address)} | [${symbol}] Allowance fetch error: ${e.reason || e.message}`
          );
          continue;
        }
        const maxUint = ethers.MaxUint256;
        if (allowance < maxUint / 2n) {
          let attempts = 0;
          const maxAttempts = 3;
          while (attempts < maxAttempts) {
            try {
              usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
              logger(`${getShortAddress(wallet.address)} | [${symbol}] Approving router unlimited...`);
              const nonce = usedNonces[wallet.address];
              const feeData = await provider.getFeeData();
              const approveTx = await tokenContract.approve(routerAddress, maxUint, {
                gasLimit: 100000,
                maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
                nonce,
              });
              logger(`${getShortAddress(wallet.address)} | [${symbol}] Approve tx: ${green}${approveTx.hash}${reset}`);
              await approveTx.wait();
              logger(`${getShortAddress(wallet.address)} | [${symbol}] Approval confirmed`);
              usedNonces[wallet.address]++;
              break;
            } catch (e) {
              attempts++;
              const errorMsg = e.reason || e.message || "Unknown error";
              logger(
                `${getShortAddress(wallet.address)} | [${symbol}] Approve failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
              );
              if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
                await sleep(5);
              } else {
                break;
              }
            }
          }
        } else {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Already unlimited approval`);
        }
        await sleep(getRandomDelay(transactionConfig.minDelay, transactionConfig.maxDelay));
      }

      // ----- SUPPLY -----
      const supplyContract = new Contract(routerAddress, openFiAbi, wallet);
      for (const [symbol, tokenAddress] of Object.entries(tokens)) {
        if (tokenAddress === tokens.PHRS) continue; // Skip PHRS for supply
        const decimals = tokenDecimals[symbol];
        let balance = 0;
        try {
          balance = await getTokenBalance(provider, wallet, tokenAddress);
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Balance: ${balance}`);
        } catch (err) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Balance check error: ${err.message}`);
          continue;
        }
        const supplyAmt = parseUnits((parseFloat(balance) * 0.05).toFixed(6), decimals); // 5% of balance
        if (parseFloat(balance) <= 0 || supplyAmt === 0n) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Insufficient balance for supply`);
          continue;
        }

        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
            logger(
              `${getShortAddress(wallet.address)} | [${symbol}] Supplying ${ethers.formatUnits(
                supplyAmt,
                decimals
              )}...`
            );
            const nonce = usedNonces[wallet.address];
            const feeData = await provider.getFeeData();
            const tx = await supplyContract.supply(tokenAddress, supplyAmt, wallet.address, 0, {
              gasLimit: 300000,
              maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
              nonce,
            });
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Supply tx: ${green}${tx.hash}${reset}`);
            await tx.wait();
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Supply confirmed`);
            usedNonces[wallet.address]++;
            break;
          } catch (e) {
            attempts++;
            const errorMsg = e.reason || e.message || "Unknown error";
            logger(
              `${getShortAddress(wallet.address)} | [${symbol}] Supply failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
            );
            if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
              await sleep(5);
            } else {
              break;
            }
          }
        }
        await sleep(getRandomDelay(transactionConfig.minDelay, transactionConfig.maxDelay));
      }

      // ----- BORROW -----
      const borrowContract = new Contract(routerAddress, openFiAbi, wallet);
      for (let k = 0; k < transactionConfig.borrowCount; k++) {
        logger(`${getShortAddress(wallet.address)} | Borrow ${k + 1}/${transactionConfig.borrowCount}`);
        const symbol = Object.keys(tokens)[Math.floor(Math.random() * Object.keys(tokens).length)];
        const tokenAddress = tokens[symbol];
        const decimals = tokenDecimals[symbol];
        let available = 0;
        try {
          available = await getAvailableBorrowBalance(provider, wallet, tokenAddress, decimals);
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Available to borrow: ${available}`);
        } catch (err) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Borrow balance check error: ${err.message}`);
          continue;
        }
        const borrowAmt = parseUnits((parseFloat(available) * 0.05).toFixed(6), decimals); // 5% of available
        if (parseFloat(available) <= 0 || borrowAmt === 0n) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Insufficient borrow balance`);
          continue;
        }

        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Borrowing ${ethers.formatUnits(borrowAmt, decimals)}...`);
            const nonce = usedNonces[wallet.address];
            const feeData = await provider.getFeeData();
            const tx = await borrowContract.borrow(tokenAddress, borrowAmt, 2, 0, wallet.address, {
              gasLimit: 400000, // Increased gas limit
              maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
              nonce,
            });
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Borrow tx: ${green}${tx.hash}${reset}`);
            await tx.wait();
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Borrow confirmed`);
            usedNonces[wallet.address]++;
            break;
          } catch (err) {
            attempts++;
            const errorMsg = err.reason || err.message || "Unknown error";
            logger(
              `${getShortAddress(wallet.address)} | [${symbol}] Borrow failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
            );
            if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
              await sleep(5);
            } else {
              break;
            }
          }
        }
        await sleep(getRandomDelay(transactionConfig.minDelay, transactionConfig.maxDelay));
      }

      // ----- REPAY -----
      const repayContract = new Contract(routerAddress, openFiAbi, wallet);
      for (let k = 0; k < transactionConfig.repayCount; k++) {
        logger(`${getShortAddress(wallet.address)} | Repay ${k + 1}/${transactionConfig.repayCount}`);
        const symbol = Object.keys(tokens)[Math.floor(Math.random() * Object.keys(tokens).length)];
        const tokenAddress = tokens[symbol];
        const decimals = tokenDecimals[symbol];
        let borrowed = 0;
        try {
          borrowed = await getBorrowedBalance(provider, wallet, tokenAddress, decimals);
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Borrowed: ${borrowed}`);
        } catch (err) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Borrowed balance check error: ${err.message}`);
          continue;
        }
        const repayAmt = parseUnits((parseFloat(borrowed) * 0.05).toFixed(6), decimals); // 5% of borrowed
        if (parseFloat(borrowed) <= 0 || repayAmt === 0n) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Insufficient borrowed balance`);
          continue;
        }

        // Check token balance
        let balance = 0;
        try {
          balance = await getTokenBalance(provider, wallet, tokenAddress);
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Balance: ${balance}`);
          if (parseFloat(balance) < parseFloat(ethers.formatUnits(repayAmt, decimals))) {
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Insufficient token balance`);
            continue;
          }
        } catch (err) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Balance check error: ${err.message}`);
          continue;
        }

        // Approve
        if (tokenAddress !== tokens.PHRS) {
          const tokenContract = new Contract(tokenAddress, erc20Abi, wallet);
          let allowance = 0n;
          try {
            allowance = await tokenContract.allowance(wallet.address, routerAddress);
          } catch (err) {
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Allowance fetch error: ${err.message}`);
            continue;
          }
          if (allowance < repayAmt) {
            let attempts = 0;
            const maxAttempts = 3;
            while (attempts < maxAttempts) {
              try {
                usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
                logger(`${getShortAddress(wallet.address)} | [${symbol}] Approving router...`);
                const nonce = usedNonces[wallet.address];
                const feeData = await provider.getFeeData();
                const approveTx = await tokenContract.approve(routerAddress, ethers.MaxUint256, {
                  gasLimit: 100000,
                  maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
                  maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
                  nonce,
                });
                logger(`${getShortAddress(wallet.address)} | [${symbol}] Approve tx: ${green}${approveTx.hash}${reset}`);
                await approveTx.wait();
                logger(`${getShortAddress(wallet.address)} | [${symbol}] Approval confirmed`);
                usedNonces[wallet.address]++;
                break;
              } catch (err) {
                attempts++;
                const errorMsg = err.reason || err.message || "Unknown error";
                logger(
                  `${getShortAddress(wallet.address)} | [${symbol}] Approve failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
                );
                if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
                  await sleep(5);
                } else {
                  break;
                }
              }
            }
          }
        }

        // Repay
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Repaying ${ethers.formatUnits(repayAmt, decimals)}...`);
            const nonce = usedNonces[wallet.address];
            const feeData = await provider.getFeeData();
            const tx = await repayContract.repay(tokenAddress, repayAmt, 2, wallet.address, {
              gasLimit: 300000,
              maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
              nonce,
            });
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Repay tx: ${green}${tx.hash}${reset}`);
            await tx.wait();
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Repay confirmed`);
            usedNonces[wallet.address]++;
            break;
          } catch (err) {
            attempts++;
            const errorMsg = err.reason || err.message || "Unknown error";
            logger(
              `${getShortAddress(wallet.address)} | [${symbol}] Repay failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
            );
            if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
              await sleep(5);
            } else {
              break;
            }
          }
        }
        await sleep(getRandomDelay(transactionConfig.minDelay, transactionConfig.maxDelay));
      }

      // ----- WITHDRAW -----
      const withdrawContract = new Contract(routerAddress, openFiAbi, wallet);
      for (let k = 0; k < transactionConfig.withdrawCount; k++) {
        logger(`${getShortAddress(wallet.address)} | Withdraw ${k + 1}/${transactionConfig.withdrawCount}`);
        const symbol = Object.keys(tokens)[Math.floor(Math.random() * Object.keys(tokens).length)];
        const tokenAddress = tokens[symbol];
        const decimals = tokenDecimals[symbol];
        let supplied = 0;
        try {
          supplied = await getSuppliedBalance(provider, wallet, tokenAddress, decimals);
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Supplied: ${supplied}`);
        } catch (err) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Supplied balance check error: ${err.message}`);
          continue;
        }
        const withdrawAmt = parseUnits((parseFloat(supplied) * 0.05).toFixed(6), decimals); // 5% of supplied
        if (parseFloat(supplied) <= 0 || withdrawAmt === 0n) {
          logger(`${getShortAddress(wallet.address)} | [${symbol}] Insufficient supplied balance`);
          continue;
        }

        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
          try {
            usedNonces[wallet.address] = await provider.getTransactionCount(wallet.address, "pending");
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Withdrawing ${ethers.formatUnits(withdrawAmt, decimals)}...`);
            const nonce = usedNonces[wallet.address];
            const feeData = await provider.getFeeData();
            const tx = await withdrawContract.withdraw(tokenAddress, withdrawAmt, wallet.address, {
              gasLimit: 400000, // Increased gas limit
              maxFeePerGas: feeData.maxFeePerGas || parseUnits("5", "gwei"),
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || parseUnits("1", "gwei"),
              nonce,
            });
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Withdraw tx: ${green}${tx.hash}${reset}`);
            await tx.wait();
            logger(`${getShortAddress(wallet.address)} | [${symbol}] Withdraw confirmed`);
            usedNonces[wallet.address]++;
            break;
          } catch (err) {
            attempts++;
            const errorMsg = err.reason || err.message || "Unknown error";
            logger(
              `${getShortAddress(wallet.address)} | [${symbol}] Withdraw failed (attempt ${attempts}/${maxAttempts}): ${errorMsg}`
            );
            if (attempts < maxAttempts && !errorMsg.includes("TX_REPLAY_ATTACK")) {
              await sleep(5);
            } else {
              break;
            }
          }
        }
        await sleep(getRandomDelay(transactionConfig.minDelay, transactionConfig.maxDelay));
      }

      await sleep(2); // Original delay between transactions
    }
  }

  logger("System | OpenFi Task completed!");
}

module.exports = { performOpenFiTask };
