const ethers = require("ethers");
const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

// Constants
const AUTOSTAKING_BASE_URL = "https://autostaking.pro/";
const RPC_URL = "https://testnet.dplabs-internal.com/";
const USDC_CONTRACT_ADDRESS = "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED";
const USDT_CONTRACT_ADDRESS = "0xD4071393f8716661958F766DF660033b3d35fD29";
const MUSD_CONTRACT_ADDRESS = "0x7F5e05460F927Ee351005534423917976F92495e";
const mvMUSD_CONTRACT_ADDRESS = "0xF1CF5D79bE4682D50f7A60A047eACa9bD351fF8e";
const STAKING_ROUTER_ADDRESS = "0x11cD3700B310339003641Fdce57c1f9BD21aE015";

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDWPv2qP8+xLABhn3F/U/hp76HP
e8dD7kvPUh70TC14kfvwlLpCTHhYf2/6qulU1aLWpzCz3PJr69qonyqocx8QlThq
5Hik6H/5fmzHsjFvoPeGN5QRwYsVUH07MbP7MNbJH5M2zD5Z1WEp9AHJklITbS1z
h23cf2WfZ0vwDYzZ8QIDAQAB
-----END PUBLIC KEY-----`;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function claimFaucet() returns (uint256)"
];

const AUTOSTAKING_ABI = [
  "function getNextFaucetClaimTime(address user) view returns (uint256)"
];

const PROMPT = "1. Mandatory Requirement: The product's TVL must be higher than one million USD.\n" +
  "2. Balance Preference: Prioritize products that have a good balance of high current APY and high TVL.\n" +
  "3. Portfolio Allocation: Select the 3 products with the best combined ranking in terms of current APY and TVL among those with TVL > 1,000,000 USD. " +
  "To determine the combined ranking, rank all eligible products by current APY (highest to lowest) and by TVL (highest to lowest), " +
  "then sum the two ranks for each product. Choose the 3 products with the smallest sum of ranks. Allocate the investment equally among these 3 products, " +
  "with each receiving approximately 33.3% of the investment.";

// Global variables
let baseApiUrl = null;
let authTokens = {};
let accountProxies = {};
let proxyIndex = 0;
let proxies = [];

// Helper functions
function getShortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay(minDelay, maxDelay) {
  return Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay) * 1000;
}

async function loadProxies() {
  try {
    if (!fs.existsSync("proxy.txt")) {
      return [];
    }
    const data = fs.readFileSync("proxy.txt", "utf8");
    return data.split("\n").map(line => line.trim()).filter(line => line);
  } catch (error) {
    return [];
  }
}

function checkProxyScheme(proxy) {
  const schemes = ["http://", "https://", "socks4://", "socks5://"];
  if (schemes.some(scheme => proxy.startsWith(scheme))) {
    return proxy;
  }
  return `http://${proxy}`;
}

function getNextProxyForAccount(address, useProxy, rotateProxy) {
  if (!useProxy || proxies.length === 0) return null;
  
  if (!accountProxies[address] || rotateProxy) {
    const proxy = checkProxyScheme(proxies[proxyIndex]);
    accountProxies[address] = proxy;
    proxyIndex = (proxyIndex + 1) % proxies.length;
  }
  
  return accountProxies[address];
}

function buildProxyAgent(proxy) {
  if (!proxy) return null;
  
  if (proxy.startsWith("socks")) {
    return new SocksProxyAgent(proxy);
  } else if (proxy.startsWith("http")) {
    return new HttpsProxyAgent(proxy);
  }
  
  return null;
}

function generateAuthToken(address) {
  try {
    const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
    const encrypted = crypto.publicEncrypt(
      {
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(address, "utf8")
    );
    return encrypted.toString("base64");
  } catch (error) {
    return null;
  }
}

async function fetchBaseApi(logger) {
  try {
    const response = await axios.get(AUTOSTAKING_BASE_URL);
    const html = response.data;
    
    const jsPattern = /src="([^"]+_next\/static\/chunks\/[^"]+\.js)"/g;
    const jsFiles = [...html.matchAll(jsPattern)].map(match => match[1]);
    
    if (jsFiles.length === 0) {
      throw new Error("JS files not found");
    }
    
    for (const jsFile of jsFiles) {
      const jsUrl = jsFile.startsWith("http") ? jsFile : AUTOSTAKING_BASE_URL + jsFile;
      const jsResponse = await axios.get(jsUrl);
      const jsContent = jsResponse.data;
      
      const apiPattern = /r\.Z\s*\?\s*"([^"]+)"/;
      const match = jsContent.match(apiPattern);
      
      if (match) {
        return match[1];
      }
    }
    
    throw new Error("API URL not found");
  } catch (error) {
    logger(`System | Error: Failed to fetch base API: ${error.message}`);
    return null;
  }
}

async function checkConnection(proxy) {
  try {
    const agent = buildProxyAgent(proxy);
    const config = agent ? { httpsAgent: agent, httpAgent: agent } : {};
    
    const response = await axios.get("https://api.ipify.org?format=json", {
      ...config,
      timeout: 30000
    });
    
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function getTokenBalance(provider, address, contractAddress) {
  try {
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(address);
    const decimals = await contract.decimals();
    return Number(ethers.formatUnits(balance, decimals));
  } catch (error) {
    return 0;
  }
}

async function getNextFaucetClaimTime(provider, address) {
  try {
    const contract = new ethers.Contract(mvMUSD_CONTRACT_ADDRESS, AUTOSTAKING_ABI, provider);
    const nextClaimTime = await contract.getNextFaucetClaimTime(address);
    return Number(nextClaimTime);
  } catch (error) {
    return null;
  }
}

async function performClaimFaucet(wallet, logger, usedNonces) {
  try {
    const provider = wallet.provider;
    const address = wallet.address;
    const contract = new ethers.Contract(mvMUSD_CONTRACT_ADDRESS, ERC20_ABI, wallet);
    
    const nonce = usedNonces[address] || await provider.getTransactionCount(address, "pending");
    const feeData = await provider.getFeeData();
    
    const tx = await contract.claimFaucet({
      gasLimit: 150000,
      maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
      nonce: nonce
    });
    
    logger(`${getShortAddress(address)} | Claiming faucet... TX: ${tx.hash}`);
    const receipt = await tx.wait();
    
    usedNonces[address] = nonce + 1;
    
    return { hash: tx.hash, blockNumber: receipt.blockNumber };
  } catch (error) {
    throw error;
  }
}

async function approveToken(wallet, tokenAddress, spenderAddress, amount, logger, usedNonces) {
  try {
    const provider = wallet.provider;
    const address = wallet.address;
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
    
    const decimals = await contract.decimals();
    const amountWei = ethers.parseUnits(amount.toString(), decimals);
    
    const allowance = await contract.allowance(address, spenderAddress);
    if (allowance >= amountWei) {
      return true;
    }
    
    const nonce = usedNonces[address] || await provider.getTransactionCount(address, "pending");
    const feeData = await provider.getFeeData();
    
    const tx = await contract.approve(spenderAddress, ethers.MaxUint256, {
      gasLimit: 100000,
      maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
      nonce: nonce
    });
    
    logger(`${getShortAddress(address)} | Approving token... TX: ${tx.hash}`);
    await tx.wait();
    
    usedNonces[address] = nonce + 1;
    
    return true;
  } catch (error) {
    throw error;
  }
}

async function generateRecommendationPayload(address, usdcAmount, usdtAmount, musdAmount) {
  const usdcAssets = Math.floor(usdcAmount * 1e6);
  const usdtAssets = Math.floor(usdtAmount * 1e6);
  const musdAssets = Math.floor(musdAmount * 1e6);
  
  return {
    user: address,
    profile: PROMPT,
    userPositions: [],
    userAssets: [
      {
        chain: { id: 688688 },
        name: "USDC",
        symbol: "USDC",
        decimals: 6,
        address: USDC_CONTRACT_ADDRESS,
        assets: usdcAssets.toString(),
        price: 1,
        assetsUsd: usdcAmount
      },
      {
        chain: { id: 688688 },
        name: "USDT",
        symbol: "USDT",
        decimals: 6,
        address: USDT_CONTRACT_ADDRESS,
        assets: usdtAssets.toString(),
        price: 1,
        assetsUsd: usdtAmount
      },
      {
        chain: { id: 688688 },
        name: "MockUSD",
        symbol: "MockUSD",
        decimals: 6,
        address: MUSD_CONTRACT_ADDRESS,
        assets: musdAssets.toString(),
        price: 1,
        assetsUsd: musdAmount
      }
    ],
    chainIds: [688688],
    tokens: ["USDC", "USDT", "MockUSD"],
    protocols: ["MockVault"],
    env: "pharos"
  };
}

async function getFinancialPortfolioRecommendation(address, usdcAmount, usdtAmount, musdAmount, proxy) {
  try {
    const agent = buildProxyAgent(proxy);
    const config = agent ? { httpsAgent: agent, httpAgent: agent } : {};
    
    const payload = await generateRecommendationPayload(address, usdcAmount, usdtAmount, musdAmount);
    
    const response = await axios.post(
      `${baseApiUrl}/investment/financial-portfolio-recommendation`,
      payload,
      {
        ...config,
        headers: {
          "Authorization": authTokens[address],
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*",
          "Origin": "https://autostaking.pro",
          "Referer": "https://autostaking.pro/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        timeout: 120000
      }
    );
    
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function generateChangeTransactions(address, changes, proxy) {
  try {
    const agent = buildProxyAgent(proxy);
    const config = agent ? { httpsAgent: agent, httpAgent: agent } : {};
    
    const payload = {
      user: address,
      changes: changes,
      prevTransactionResults: {}
    };
    
    const response = await axios.post(
      `${baseApiUrl}/investment/generate-change-transactions`,
      payload,
      {
        ...config,
        headers: {
          "Authorization": authTokens[address],
          "Content-Type": "application/json",
          "Accept": "application/json, text/plain, */*",
          "Origin": "https://autostaking.pro",
          "Referer": "https://autostaking.pro/",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        },
        timeout: 120000
      }
    );
    
    return response.data;
  } catch (error) {
    throw error;
  }
}

async function performStaking(wallet, changes, logger, usedNonces) {
  try {
    const provider = wallet.provider;
    const address = wallet.address;
    const proxy = accountProxies[address];
    
    const transactions = await generateChangeTransactions(address, changes, proxy);
    if (!transactions || !transactions.data || !transactions.data["688688"]) {
      throw new Error("Failed to generate transaction calldata");
    }
    
    const calldata = transactions.data["688688"].data;
    
    const nonce = usedNonces[address] || await provider.getTransactionCount(address, "pending");
    const feeData = await provider.getFeeData();
    
const tx = await wallet.sendTransaction({
      to: STAKING_ROUTER_ADDRESS,
      data: calldata,
      gasLimit: 500000,
      maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("1", "gwei"),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1", "gwei"),
      nonce: nonce
    });
    
    logger(`${getShortAddress(address)} | Performing staking... TX: ${tx.hash}`);
    const receipt = await tx.wait();
    
    usedNonces[address] = nonce + 1;
    
    return { hash: tx.hash, blockNumber: receipt.blockNumber };
  } catch (error) {
    throw error;
  }
}

async function performAutoStakingTask(
  logger,
  privateKeys,
  proxies_,
  txCount,
  minDelay,
  maxDelay,
  usdcAmount,
  usdtAmount,
  musdAmount,
  useProxy,
  rotateProxy,
  usedNonces
) {
  logger("System | Starting AutoStaking Task...");
  
  // Load proxies if needed
  if (useProxy) {
    proxies = await loadProxies();
    if (proxies.length === 0) {
      logger("System | Warning: No proxies found in proxy.txt");
      useProxy = false;
    } else {
      logger(`System | Loaded ${proxies.length} proxies`);
    }
  }
  
  // Fetch base API
  baseApiUrl = await fetchBaseApi(logger);
  if (!baseApiUrl) {
    logger("System | Error: Failed to fetch AutoStaking API URL");
    return;
  }
  logger(`System | AutoStaking API: ${baseApiUrl}`);
  
  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = wallet.address;
    
    logger(`${getShortAddress(address)} | Processing AutoStaking for account ${i + 1}`);
    
    // Generate auth token
    authTokens[address] = generateAuthToken(address);
    if (!authTokens[address]) {
      logger(`${getShortAddress(address)} | Error: Failed to generate auth token`);
      continue;
    }
    
    // Check proxy connection if using proxy
    if (useProxy) {
      const proxy = getNextProxyForAccount(address, useProxy, false);
      logger(`${getShortAddress(address)} | Using proxy: ${proxy}`);
      
      const isConnected = await checkConnection(proxy);
      if (!isConnected) {
        logger(`${getShortAddress(address)} | Error: Proxy connection failed`);
        if (rotateProxy) {
          logger(`${getShortAddress(address)} | Rotating to next proxy...`);
          getNextProxyForAccount(address, useProxy, true);
        }
        continue;
      }
    }
    
    try {
      // Check and claim faucet first
      logger(`${getShortAddress(address)} | Checking faucet status...`);
      const nextClaimTime = await getNextFaucetClaimTime(provider, address);
      
      if (nextClaimTime !== null) {
        const currentTime = Math.floor(Date.now() / 1000);
        if (currentTime >= nextClaimTime) {
          logger(`${getShortAddress(address)} | Claiming MockUSD faucet...`);
          try {
            const faucetResult = await performClaimFaucet(wallet, logger, usedNonces);
            logger(`${getShortAddress(address)} | Success: Faucet claimed | Confirmed: ${faucetResult.hash}`);
          } catch (error) {
            logger(`${getShortAddress(address)} | Error: Faucet claim failed: ${error.message}`);
          }
        } else {
          const nextClaimDate = new Date(nextClaimTime * 1000).toLocaleString();
          logger(`${getShortAddress(address)} | Warning: Faucet already claimed. Next claim at: ${nextClaimDate}`);
        }
      }
      
      // Perform staking transactions
      for (let j = 0; j < txCount; j++) {
        logger(`${getShortAddress(address)} | Starting staking transaction ${j + 1} of ${txCount}`);
        
        try {
          // Check balances
          const usdcBalance = await getTokenBalance(provider, address, USDC_CONTRACT_ADDRESS);
          const usdtBalance = await getTokenBalance(provider, address, USDT_CONTRACT_ADDRESS);
          const musdBalance = await getTokenBalance(provider, address, MUSD_CONTRACT_ADDRESS);
          
          logger(`${getShortAddress(address)} | Balances: USDC: ${usdcBalance.toFixed(2)}, USDT: ${usdtBalance.toFixed(2)}, MockUSD: ${musdBalance.toFixed(2)}`);
          
          // Check if sufficient balance
          if (usdcBalance < usdcAmount) {
            logger(`${getShortAddress(address)} | Warning: Insufficient USDC balance`);
            break;
          }
          if (usdtBalance < usdtAmount) {
            logger(`${getShortAddress(address)} | Warning: Insufficient USDT balance`);
            break;
          }
          if (musdBalance < musdAmount) {
            logger(`${getShortAddress(address)} | Warning: Insufficient MockUSD balance`);
            break;
          }
          
          // Approve tokens
          logger(`${getShortAddress(address)} | Approving USDC...`);
          await approveToken(wallet, USDC_CONTRACT_ADDRESS, STAKING_ROUTER_ADDRESS, usdcAmount, logger, usedNonces);
          
          logger(`${getShortAddress(address)} | Approving USDT...`);
          await approveToken(wallet, USDT_CONTRACT_ADDRESS, STAKING_ROUTER_ADDRESS, usdtAmount, logger, usedNonces);
          
          logger(`${getShortAddress(address)} | Approving MockUSD...`);
          await approveToken(wallet, MUSD_CONTRACT_ADDRESS, STAKING_ROUTER_ADDRESS, musdAmount, logger, usedNonces);
          
          // Get portfolio recommendation
          logger(`${getShortAddress(address)} | Getting portfolio recommendation...`);
          const proxy = accountProxies[address];
          const portfolio = await getFinancialPortfolioRecommendation(address, usdcAmount, usdtAmount, musdAmount, proxy);
          
          if (!portfolio || !portfolio.data || !portfolio.data.changes) {
            throw new Error("Failed to get portfolio recommendation");
          }
          
          const changes = portfolio.data.changes;
          logger(`${getShortAddress(address)} | Received ${changes.length} recommended changes`);
          
          // Perform staking
          const stakingResult = await performStaking(wallet, changes, logger, usedNonces);
          logger(`${getShortAddress(address)} | Success: Staking ${j + 1} completed | Confirmed: ${stakingResult.hash}`);
          
        } catch (error) {
          logger(`${getShortAddress(address)} | Error: Staking ${j + 1} failed: ${error.message}`);
          if (error.message.includes("proxy") && rotateProxy) {
            logger(`${getShortAddress(address)} | Rotating proxy and retrying...`);
            getNextProxyForAccount(address, useProxy, true);
            j--; // Retry this transaction
          }
        }
        
        // Delay between transactions
        if (j < txCount - 1) {
          const delayTime = getRandomDelay(minDelay, maxDelay);
          logger(`${getShortAddress(address)} | Waiting ${delayTime / 1000} seconds before next transaction...`);
          await delay(delayTime);
        }
      }
      
    } catch (error) {
      logger(`${getShortAddress(address)} | Error: AutoStaking failed: ${error.message}`);
    }
    
    // Delay between accounts
    if (i < privateKeys.length - 1) {
      await delay(3000);
    }
  }
  
  logger("System | AutoStaking Task completed!");
}

module.exports = { performAutoStakingTask };
