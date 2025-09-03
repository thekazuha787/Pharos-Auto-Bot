const chalk = require("chalk");
const { ethers } = require('ethers');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const axios = require('axios');
const fs = require('fs');

// Configuration
const CONFIG = {
  MAX_THREADS: 10, // Maximum concurrent threads
  THREAD_TIMEOUT: 1200000, // 20 minutes timeout per thread
  MAX_TRADE_RETRIES: 100, // Maximum retry attempts per trade
  MIN_DELAY: 0, // Minimum delay between transactions (seconds)
  MAX_DELAY: 0, // Maximum delay between transactions (seconds)
  OPEN_AMOUNT: 10, // Minimum open position amount in USDT
};

const NETWORK_CONFIG = {
  name: 'Pharos Testnet',
  chainId: 688688,
  rpcUrl: 'https://testnet.dplabs-internal.com',
};

const CONTRACT_ADDRESSES = {
  TOKEN: '0x78ac5e2d8a78a8b8e6d10c7b7274b03c10c91cef', // USDT
  PHRS: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', // PHRS
  CLAIM: '0xa7Bb3C282Ff1eFBc3F2D8fcd60AaAB3aeE3CBa49', // Faucet Router
  TRADE_ROUTER: '0x34f89ca5a1c6dc4eb67dfe0af5b621185df32854', // Trade Router
  APPROVE_SPENDER: '0x9A88d07850723267DB386C681646217Af7e220d7', // Pool Router
};

const BASE_API = 'https://proof.brokex.trade';

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'hasClaimed',
    stateMutability: 'view',
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
];

const BROKEX_CONTRACT_ABI = [
  {
    name: 'openPosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'uint256', name: 'idx', type: 'uint256' },
      { internalType: 'bytes', name: 'proof', type: 'bytes' },
      { internalType: 'bool', name: 'isLong', type: 'bool' },
      { internalType: 'uint256', name: 'lev', type: 'uint256' },
      { internalType: 'uint256', name: 'size', type: 'uint256' },
      { internalType: 'uint256', name: 'sl', type: 'uint256' },
      { internalType: 'uint256', name: 'tp', type: 'uint256' },
    ],
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  },
  {
    name: 'getUserOpenIds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ internalType: 'address', name: 'user', type: 'address' }],
    outputs: [{ internalType: 'uint256[]', name: '', type: 'uint256[]' }],
  },
  {
    name: 'getOpenById',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ internalType: 'uint256', name: 'id', type: 'uint256' }],
    outputs: [
      {
        internalType: 'struct IBrokexStorage.Open',
        name: '',
        type: 'tuple',
        components: [
          { internalType: 'address', name: 'trader', type: 'address' },
          { internalType: 'uint256', name: 'id', type: 'uint256' },
          { internalType: 'uint256', name: 'assetIndex', type: 'uint256' },
          { internalType: 'bool', name: 'isLong', type: 'bool' },
          { internalType: 'uint256', name: 'leverage', type: 'uint256' },
          { internalType: 'uint256', name: 'openPrice', type: 'uint256' },
          { internalType: 'uint256', name: 'sizeUsd', type: 'uint256' },
          { internalType: 'uint256', name: 'timestamp', type: 'uint256' },
          { internalType: 'uint256', name: 'stopLossPrice', type: 'uint256' },
          { internalType: 'uint256', name: 'takeProfitPrice', type: 'uint256' },
          { internalType: 'uint256', name: 'liquidationPrice', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'closePosition',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { internalType: 'uint256', name: 'openId', type: 'uint256' },
      { internalType: 'bytes', name: 'proof', type: 'bytes' },
    ],
    outputs: [],
  },
];

const TRADING_PAIRS = [
  { name: 'BTC_USDT', dc: 0 },
  { name: 'ETH_USDT', dc: 1 },
  { name: 'SOL_USDT', dc: 10 },
  { name: 'XRP_USDT', dc: 14 },
  { name: 'AVAX_USDT', dc: 5 },
  { name: 'TRX_USDT', dc: 15 },
  { name: 'ADA_USDT', dc: 16 },
  { name: 'SUI_USDT', dc: 90 },
  { name: 'LINK_USDT', dc: 2 },
];

// Logging utility
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

function log(msg, type = 'info') {
  let styled;
  switch (type) {
    case 'success':
      styled = formatLogMessage(`System | ${msg} | successful`);
      break;
    case 'error':
      styled = formatLogMessage(`System | Error: ${msg}`);
      break;
    case 'warning':
      styled = formatLogMessage(`System | Warning: ${msg}`);
      break;
    default:
      styled = formatLogMessage(`System | ${msg}`);
  }
  console.log(styled);
}

// Delay utility
async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Random delay between transactions
async function randomDelay() {
  if (CONFIG.MIN_DELAY === CONFIG.MAX_DELAY) return;
  const delay = Math.floor(Math.random() * (CONFIG.MAX_DELAY - CONFIG.MIN_DELAY + 1)) + CONFIG.MIN_DELAY;
  log(`Waiting ${delay} seconds for next transaction...`, 'info');
  await sleep(delay * 1000);
}

// TradeService class for handling trading operations
class TradeService {
  constructor({ accountIndex, privateKey }) {
    this.provider = new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl);
    this.wallet = privateKey ? new ethers.Wallet(privateKey, this.provider) : null;
    this.accountIndex = accountIndex;
    this.usedNonce = {};
    this.approvedSpenders = new Set();
    this.axiosInstance = axios.create();
    this.openIds = [];
    this.usedIds = new Set();
  }

  async log(msg, type = 'info') {
    const accountPrefix = `[Account ${this.accountIndex + 1}]`;
    let styled;
    switch (type) {
      case 'success':
        styled = formatLogMessage(`${accountPrefix} | ${msg} | successful`);
        break;
      case 'error':
        styled = formatLogMessage(`${accountPrefix} | Error: ${msg}`);
        break;
      case 'warning':
        styled = formatLogMessage(`${accountPrefix} | Warning: ${msg}`);
        break;
      default:
        styled = formatLogMessage(`${accountPrefix} | ${msg}`);
    }
    console.log(styled);
  }

  async getTokenBalance(tokenAddress) {
    try {
      if (tokenAddress === CONTRACT_ADDRESSES.PHRS) {
        const balance = await this.provider.getBalance(this.wallet.address);
        return ethers.formatUnits(balance, 18);
      }
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
      const balance = await tokenContract.balanceOf(this.wallet.address);
      const decimals = await tokenContract.decimals();
      return ethers.formatUnits(balance, decimals);
    } catch (error) {
      await this.log(`Error fetching token balance for ${tokenAddress}: ${error.message}`, 'error');
      return null;
    }
  }

  async checkFaucetStatus() {
    try {
      const claimContract = new ethers.Contract(CONTRACT_ADDRESSES.CLAIM, ERC20_ABI, this.provider);
      const hasClaimed = await claimContract.hasClaimed(this.wallet.address);
      return hasClaimed;
    } catch (error) {
      await this.log(`Error checking faucet status: ${error.message}`, 'error');
      return null;
    }
  }

  async approveTokenForTrading(spenderAddress) {
    try {
      const tokenContract = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN, ERC20_ABI, this.wallet);
      const allowance = await tokenContract.allowance(this.wallet.address, spenderAddress);
      const maxUint256 = ethers.MaxUint256;

      if (allowance >= maxUint256 / 2n) {
        await this.log(`Token already approved for ${spenderAddress}`, 'info');
        this.approvedSpenders.add(spenderAddress);
        return true;
      }

      await this.log(`Approving token for spender: ${spenderAddress}`, 'info');
      await this.log(`Current allowance: ${ethers.formatUnits(allowance, 6)} USDT`, 'info');

      const maxFeePerGas = ethers.parseUnits('1', 'gwei');
      const maxPriorityFeePerGas = ethers.parseUnits('1', 'gwei');

      let estimatedGas;
      try {
        estimatedGas = await tokenContract.approve.estimateGas(spenderAddress, maxUint256, { from: this.wallet.address });
      } catch (error) {
        await this.log(`Error estimating gas for approval: ${error.message}`, 'error');
        return false;
      }

      const approveTx = await tokenContract.approve(spenderAddress, maxUint256, {
        gasLimit: ethers.toBigInt(Math.floor(Number(estimatedGas) * 1.2)),
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce: ethers.toBigInt(this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')),
      });

      await this.log(`Approval transaction sent: ${approveTx.hash}`, 'info');

      try {
        const receipt = await approveTx.wait(1, 60000);
        this.usedNonce[this.wallet.address] = (this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')) + 1;

        if (receipt.status === 1) {
          await this.log(`Approval successful: ${approveTx.hash}`, 'success');
          this.approvedSpenders.add(spenderAddress);
          const newAllowance = await tokenContract.allowance(this.wallet.address, spenderAddress);
          await this.log(`Allowance after approval: ${ethers.formatUnits(newAllowance, 6)} USDT`, 'success');
          return true;
        } else {
          await this.log(`Approval failed - transaction reverted`, 'error');
          return false;
        }
      } catch (waitError) {
        await this.log(`Approval timeout but may have succeeded: ${waitError.message}`, 'warning');
        this.usedNonce[this.wallet.address] = await this.provider.getTransactionCount(this.wallet.address, 'pending');
        const newAllowance = await tokenContract.allowance(this.wallet.address, spenderAddress);
        if (newAllowance >= maxUint256 / 2n) {
          await this.log(`Approval succeeded (verified by allowance check)`, 'success');
          this.approvedSpenders.add(spenderAddress);
          return true;
        }
        return false;
      }
    } catch (error) {
      await this.log(`Error approving token: ${error.message}`, 'error');
      return false;
    }
  }

  async getProof(pair) {
    try {
      const response = await this.axiosInstance.get(`${BASE_API}/proof?pairs=${pair}`, {
        headers: {
          Accept: '*/*',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          Origin: 'https://app.brokex.trade',
          Referer: 'https://app.brokex.trade/',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      });
      if (response.status === 200) return response.data;
      throw new Error('No data received from API');
    } catch (error) {
      await this.log(`Error fetching proof: ${error.message}`, 'error');
      return null;
    }
  }

  async getUserOpenIds() {
    try {
      const tradeContract = new ethers.Contract(CONTRACT_ADDRESSES.TRADE_ROUTER, BROKEX_CONTRACT_ABI, this.provider);
      const openIds = await tradeContract.getUserOpenIds(this.wallet.address);
      return openIds.map(id => id.toString());
    } catch (error) {
      await this.log(`Error fetching open IDs: ${error.message}`, 'error');
      return null;
    }
  }

  async getOpenDataById(openId) {
    try {
      const tradeContract = new ethers.Contract(CONTRACT_ADDRESSES.TRADE_ROUTER, BROKEX_CONTRACT_ABI, this.provider);
      const openData = await tradeContract.getOpenById(openId);
      return {
        trader: openData[0],
        id: openData[1].toString(),
        assetIndex: openData[2].toString(),
        isLong: openData[3],
        leverage: openData[4].toString(),
        openPrice: openData[5].toString(),
        sizeUsd: openData[6].toString(),
        timestamp: openData[7].toString(),
        stopLossPrice: openData[8].toString(),
        takeProfitPrice: openData[9].toString(),
        liquidationPrice: openData[10].toString(),
      };
    } catch (error) {
      await this.log(`Error fetching open data for ID ${openId}: ${error.message}`, 'error');
      return null;
    }
  }

  async performClaim() {
    try {
      const hasClaimed = await this.checkFaucetStatus();
      if (hasClaimed) {
        await this.log('USDT Faucet already claimed', 'warning');
        return [null, null];
      }

      const claimContract = new ethers.Contract(CONTRACT_ADDRESSES.CLAIM, ERC20_ABI, this.wallet);
      const claimData = claimContract.interface.encodeFunctionData('claim');
      const maxFeePerGas = ethers.parseUnits('1', 'gwei');
      const maxPriorityFeePerGas = ethers.parseUnits('1', 'gwei');

      let estimatedGas;
      try {
        estimatedGas = await claimContract.claim.estimateGas({ from: this.wallet.address });
      } catch (error) {
        await this.log(`Error estimating gas for claim: ${error.message}`, 'error');
        return [null, null];
      }

      const tx = {
        to: CONTRACT_ADDRESSES.CLAIM,
        data: claimData,
        gasLimit: ethers.toBigInt(Math.floor(Number(estimatedGas) * 1.2)),
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce: ethers.toBigInt(this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')),
        chainId: ethers.toBigInt(NETWORK_CONFIG.chainId),
      };

      const txHash = await this.sendRawTransactionWithRetries(tx);
      await this.log(`Claim transaction sent: ${txHash}`, 'info');

      const receipt = await this.waitForReceiptWithRetries(txHash);
      this.usedNonce[this.wallet.address] = (this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')) + 1;

      await this.log(`Claim successful`, 'success');
      await this.log(`Tx Hash: ${txHash}`, 'success');
      await this.log(`Explorer: https://testnet.pharosscan.xyz/tx/${txHash}`, 'success');
      return [txHash, receipt.blockNumber];
    } catch (error) {
      await this.log(`Claim failed: ${error.message}`, 'error');
      return [null, null];
    }
  }

  async performTrade(pairIndex, isLong, tradeAmount) {
    for (let attempt = 1; attempt <= CONFIG.MAX_TRADE_RETRIES; attempt++) {
      try {
        await this.log(`Attempting trade ${attempt}/${CONFIG.MAX_TRADE_RETRIES}`, 'info');

        for (const spender of [CONTRACT_ADDRESSES.APPROVE_SPENDER, CONTRACT_ADDRESSES.TRADE_ROUTER]) {
          if (!this.approvedSpenders.has(spender)) {
            await this.log(`Need to approve token for ${spender} before trading`, 'info');
            const approveSuccess = await this.approveTokenForTrading(spender);
            if (!approveSuccess) {
              await this.log(`Approval failed for ${spender}, skipping trade attempt ${attempt}`, 'error');
              continue;
            }
          }
        }

        const tradeContract = new ethers.Contract(CONTRACT_ADDRESSES.TRADE_ROUTER, BROKEX_CONTRACT_ABI, this.wallet);
        const tokenContract = new ethers.Contract(CONTRACT_ADDRESSES.TOKEN, ERC20_ABI, this.wallet);
        const decimals = 6;
        const tradeAmountWei = ethers.parseUnits(tradeAmount.toString(), decimals);

        await this.log(`Fetching new proof for attempt ${attempt}`, 'info');
        const proof = await this.getProof(pairIndex);
        if (!proof || !proof.proof) {
          await this.log('Failed to fetch proof from API', 'error');
          await sleep(3000);
          continue;
        }

        for (const spender of [CONTRACT_ADDRESSES.APPROVE_SPENDER, CONTRACT_ADDRESSES.TRADE_ROUTER]) {
          const allowance = await tokenContract.allowance(this.wallet.address, spender);
          if (allowance < tradeAmountWei) {
            await this.log(`Insufficient allowance for ${spender} (${ethers.formatUnits(allowance, 6)} < ${ethers.formatUnits(tradeAmountWei, 6)}), re-approving`, 'warning');
            const reApprove = await this.approveTokenForTrading(spender);
            if (!reApprove) continue;
          }
        }

        const tradeData = tradeContract.interface.encodeFunctionData('openPosition', [
          pairIndex,
          proof.proof,
          isLong,
          1,
          tradeAmountWei,
          0,
          0,
        ]);

        const maxFeePerGas = ethers.parseUnits('1', 'gwei');
        const maxPriorityFeePerGas = ethers.parseUnits('1', 'gwei');

        let estimatedGas;
        try {
          estimatedGas = await tradeContract.openPosition.estimateGas(
            pairIndex, proof.proof, isLong, 1, tradeAmountWei, 0, 0,
            { from: this.wallet.address }
          );
        } catch (error) {
          await this.log(`Error estimating gas for trade: ${error.message}`, 'error');
          if (error.message.includes('execution reverted') || error.message.includes('unknown custom error')) {
            await this.log(`Proof may be expired or market conditions changed, retrying with new proof`, 'warning');
            await sleep(5000);
            continue;
          }
          continue;
        }

        const tx = {
          to: CONTRACT_ADDRESSES.TRADE_ROUTER,
          data: tradeData,
          gasLimit: ethers.toBigInt(Math.floor(Number(estimatedGas) * 1.2)),
          maxFeePerGas,
          maxPriorityFeePerGas,
          nonce: ethers.toBigInt(this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')),
          chainId: ethers.toBigInt(NETWORK_CONFIG.chainId),
        };

        const txHash = await this.sendRawTransactionWithRetries(tx);
        await this.log(`Transaction sent: ${txHash}`, 'info');

        try {
          const receipt = await this.waitForReceiptWithRetries(txHash);
          this.usedNonce[this.wallet.address] = (this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')) + 1;
          await this.log(`Trade successful`, 'success');
          await this.log(`Tx Hash: ${txHash}`, 'success');
          await this.log(`Explorer: https://testnet.pharosscan.xyz/tx/${txHash}`, 'success');
          return [txHash, receipt.blockNumber];
        } catch (receiptError) {
          await this.log(`Failed to get receipt but transaction may have succeeded: ${receiptError.message}`, 'warning');
          this.usedNonce[this.wallet.address] = await this.provider.getTransactionCount(this.wallet.address, 'pending');
          const newBalance = await this.getTokenBalance(CONTRACT_ADDRESSES.TOKEN);
          if (newBalance !== null) {
            await this.log(`Transaction verified via balance check`, 'info');
            return [txHash, null];
          }
        }
      } catch (error) {
        await this.log(`[Attempt ${attempt}/${CONFIG.MAX_TRADE_RETRIES}] Trade failed: ${error.message}`, 'error');
        if (attempt < CONFIG.MAX_TRADE_RETRIES) {
          const waitTime = Math.min(5000 + (attempt * 2000), 15000);
          await this.log(`Waiting ${waitTime/1000} seconds before retrying`, 'warning');
          await sleep(waitTime);
        }
        continue;
      }
    }
    await this.log(`Trade failed after ${CONFIG.MAX_TRADE_RETRIES} attempts`, 'error');
    return [null, null];
  }

  async performClosePosition(openId, pairIndex) {
    for (let attempt = 1; attempt <= CONFIG.MAX_TRADE_RETRIES; attempt++) {
      try {
        await this.log(`Attempting to close position ${openId} (Attempt ${attempt}/${CONFIG.MAX_TRADE_RETRIES})`, 'info');

        const tradeContract = new ethers.Contract(CONTRACT_ADDRESSES.TRADE_ROUTER, BROKEX_CONTRACT_ABI, this.wallet);

        await this.log(`Fetching new proof for attempt ${attempt}`, 'info');
        const proof = await this.getProof(pairIndex);
        if (!proof || !proof.proof) {
          await this.log('Failed to fetch proof from API', 'error');
          await sleep(3000);
          continue;
        }

        const closeData = tradeContract.interface.encodeFunctionData('closePosition', [openId, proof.proof]);

        const maxFeePerGas = ethers.parseUnits('1', 'gwei');
        const maxPriorityFeePerGas = ethers.parseUnits('1', 'gwei');

        let estimatedGas;
        try {
          estimatedGas = await tradeContract.closePosition.estimateGas(openId, proof.proof, { from: this.wallet.address });
        } catch (error) {
          await this.log(`Error estimating gas for close position: ${error.message}`, 'error');
          if (error.message.includes('execution reverted') || error.message.includes('unknown custom error')) {
            await this.log(`Proof may be expired or market conditions changed, retrying with new proof`, 'warning');
            await sleep(5000);
            continue;
          }
          continue;
        }

        const tx = {
          to: CONTRACT_ADDRESSES.TRADE_ROUTER,
          data: closeData,
          gasLimit: ethers.toBigInt(Math.floor(Number(estimatedGas) * 1.2)),
          maxFeePerGas,
          maxPriorityFeePerGas,
          nonce: ethers.toBigInt(this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')),
          chainId: ethers.toBigInt(NETWORK_CONFIG.chainId),
        };

        const txHash = await this.sendRawTransactionWithRetries(tx);
        await this.log(`Close position transaction sent: ${txHash}`, 'info');

        try {
          const receipt = await this.waitForReceiptWithRetries(txHash);
          this.usedNonce[this.wallet.address] = (this.usedNonce[this.wallet.address] || await this.provider.getTransactionCount(this.wallet.address, 'pending')) + 1;
          await this.log(`Close position successful`, 'success');
          await this.log(`Tx Hash: ${txHash}`, 'success');
          await this.log(`Explorer: https://testnet.pharosscan.xyz/tx/${txHash}`, 'success');
          return [txHash, receipt.blockNumber];
        } catch (receiptError) {
          await this.log(`Failed to get receipt but transaction may have succeeded: ${receiptError.message}`, 'warning');
          this.usedNonce[this.wallet.address] = await this.provider.getTransactionCount(this.wallet.address, 'pending');
          return [txHash, null];
        }
      } catch (error) {
        await this.log(`[Attempt ${attempt}/${CONFIG.MAX_TRADE_RETRIES}] Close position failed: ${error.message}`, 'error');
        if (attempt < CONFIG.MAX_TRADE_RETRIES) {
          const waitTime = Math.min(5000 + (attempt * 2000), 15000);
          await this.log(`Waiting ${waitTime/1000} seconds before retrying`, 'warning');
          await sleep(waitTime);
        }
        continue;
      }
    }
    await this.log(`Close position failed after ${CONFIG.MAX_TRADE_RETRIES} attempts`, 'error');
    return [null, null];
  }

  async sendRawTransactionWithRetries(tx, retries = 5) {
    let maxFeePerGas = ethers.parseUnits('1', 'gwei');
    let maxPriorityFeePerGas = ethers.parseUnits('1', 'gwei');
    let gasBumpCount = 0;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        tx.maxFeePerGas = maxFeePerGas;
        tx.maxPriorityFeePerGas = maxPriorityFeePerGas;
        const txResponse = await this.wallet.sendTransaction(tx);
        return txResponse.hash;
      } catch (error) {
        if (error.message.includes('TX_REPLAY_ATTACK') || (error.code === -32600 && error.message.includes('TX_REPLAY_ATTACK'))) {
          await this.log(`[Attempt ${attempt + 1}] TX_REPLAY_ATTACK, waiting 30 seconds`, 'warning');
          await sleep(30000);
          continue;
        }
        if (error.code === 'NONCE_EXPIRED' || error.code === 'REPLACEMENT_UNDERPRICED') {
          this.usedNonce[this.wallet.address] = await this.provider.getTransactionCount(this.wallet.address, 'pending');
          tx.nonce = ethers.toBigInt(this.usedNonce[this.wallet.address]);
          await this.log(`[Attempt ${attempt + 1}] Transaction error, updated nonce: ${error.message}`, 'warning');
          continue;
        }
        if (gasBumpCount < 3) {
          maxFeePerGas = maxFeePerGas * 12n / 10n;
          maxPriorityFeePerGas = maxPriorityFeePerGas * 12n / 10n;
          gasBumpCount++;
          await this.log(`[Attempt ${attempt + 1}] Increasing gas by 20% (bump ${gasBumpCount}): maxFeePerGas=${ethers.formatUnits(maxFeePerGas, 'gwei')}, maxPriorityFeePerGas=${ethers.formatUnits(maxPriorityFeePerGas, 'gwei')}`, 'warning');
        }
        await this.log(`[Attempt ${attempt + 1}] Transaction send error: ${error.message}`, 'warning');
        await sleep(2 ** attempt * 1000);
      }
    }
    throw new Error('Failed to send transaction after maximum retries');
  }

  async waitForReceiptWithRetries(txHash, retries = 10) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const receipt = await this.provider.waitForTransaction(txHash, 1, 300000);
        if (receipt) return receipt;
      } catch (error) {
        await this.log(`[Attempt ${attempt + 1}] Error waiting for receipt: ${error.message}`, 'warning');
        if (error.code === 'TIMEOUT') {
          try {
            const txStatus = await this.checkTransactionStatus(txHash);
            if (txStatus) {
              await this.log('Transaction confirmed via alternative check', 'success');
              return txStatus;
            }
          } catch (checkError) {
            await this.log(`Failed to check transaction status: ${checkError.message}`, 'warning');
          }
        }
        if (error.code === 'TRANSACTION_NOT_FOUND') {
          await this.log('Transaction not found, possibly dropped from mempool', 'warning');
          continue;
        }
        const waitTime = Math.min(2 ** attempt * 1000, 10000);
        await this.log(`Waiting ${waitTime/1000} seconds before retrying`, 'info');
        await sleep(waitTime);
      }
    }
    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    throw new Error('Transaction receipt not found after maximum retries');
  }

  async checkTransactionStatus(txHash) {
    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        await this.log('Transaction does not exist', 'warning');
        return null;
      }
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (receipt) {
        await this.log(`Receipt found via alternative method`, 'success');
        return receipt;
      }
      const currentBlock = await this.provider.getBlockNumber();
      await this.log(`Current block: ${currentBlock}, Transaction still pending`, 'info');
      return null;
    } catch (error) {
      await this.log(`Error checking transaction status: ${error.message}`, 'error');
      return null;
    }
  }

  async processSingleWallet(tradeIndex, operation, positionCount) {
    try {
      await this.log(`Processing wallet: ${this.wallet.address.slice(0, 6)}...${this.wallet.address.slice(-6)}`, 'info');
      this.usedNonce[this.wallet.address] = await this.provider.getTransactionCount(this.wallet.address, 'pending');

      // Step 1: Check balance and claim faucet if needed
      let balance = await this.getTokenBalance(CONTRACT_ADDRESSES.TOKEN);
      if (balance === null) {
        await this.log('Unable to check token balance', 'error');
        return false;
      }
      await this.log(`Token balance: ${balance} USDT`, 'info');

      if (parseFloat(balance) === 0) {
        await this.log('Token balance is 0, attempting claim', 'info');
        const [txHash, blockNumber] = await this.performClaim();
        if (!txHash || !blockNumber) {
          await this.log('Claim failed, cannot proceed with operation', 'error');
          return false;
        }
        await this.log('Claim completed successfully', 'success');
        balance = await this.getTokenBalance(CONTRACT_ADDRESSES.TOKEN);
        if (balance === null) {
          await this.log('Unable to check token balance after claim', 'error');
          return false;
        }
        await this.log(`Token balance after claim: ${balance} USDT`, 'info');
      }

      if (operation === 'open') {
        await this.log(`Operation ${tradeIndex + 1}: Open Position`, 'info');
        await this.log(`Approving token for trading`, 'info');
        let approveSuccess = false;
        for (let approveAttempt = 1; approveAttempt <= 5; approveAttempt++) {
          approveSuccess = await this.approveTokenForTrading(CONTRACT_ADDRESSES.TRADE_ROUTER);
          if (approveSuccess) break;
          await this.log(`Approval failed attempt ${approveAttempt}, retrying`, 'warning');
          await sleep(3000);
        }
        if (!approveSuccess) {
          await this.log('Failed to approve token after 5 attempts, skipping trade', 'error');
          return false;
        }

        balance = await this.getTokenBalance(CONTRACT_ADDRESSES.TOKEN);
        if (balance === null) {
          await this.log('Unable to check token balance', 'error');
          return false;
        }

        let tradeAmount;
        if (parseFloat(balance) >= CONFIG.OPEN_AMOUNT) {
          tradeAmount = (Math.random() * (parseFloat(balance) - CONFIG.OPEN_AMOUNT + 1) + CONFIG.OPEN_AMOUNT).toFixed(6);
        } else if (parseFloat(balance) >= 1) {
          tradeAmount = parseFloat(balance).toFixed(6);
        } else {
          await this.log(`Balance too low (${balance} USDT), skipping trade`, 'warning');
          return false;
        }

        const pair = TRADING_PAIRS[Math.floor(Math.random() * TRADING_PAIRS.length)];
        const isLong = Math.random() > 0.5;
        const action = isLong ? 'Long' : 'Short';

        await this.log(`Current balance: ${balance} USDT`, 'info');
        await this.log(`Trade amount: ${tradeAmount} USDT`, 'info');
        await this.log(`Pair: ${action} - ${pair.name}`, 'info');

        const [txHash, blockNumber] = await this.performTrade(pair.dc, isLong, tradeAmount);
        if (txHash && blockNumber) {
          await this.log(`Trade ${tradeIndex + 1} completed successfully`, 'success');
          await randomDelay();
        } else {
          await this.log(`Trade ${tradeIndex + 1} failed after ${CONFIG.MAX_TRADE_RETRIES} attempts`, 'error');
        }
      } else if (operation === 'close') {
        await this.log(`Operation ${tradeIndex + 1}: Close Position`, 'info');
        this.openIds = await this.getUserOpenIds();
        if (!this.openIds || this.openIds.length === 0) {
          await this.log('No open positions found', 'warning');
          return false;
        }

        await this.log(`Found ${this.openIds.length} open position(s)`, 'info');

        const availableIds = this.openIds.filter(id => !this.usedIds.has(id));
        if (availableIds.length === 0) {
          await this.log('No more unique open IDs available', 'warning');
          return false;
        }

        const openId = availableIds[Math.floor(Math.random() * availableIds.length)];
        const openData = await this.getOpenDataById(openId);
        if (!openData) {
          await this.log(`Failed to fetch data for open ID ${openId}`, 'error');
          return false;
        }

        const pairIndex = openData.assetIndex;
        const pairName = TRADING_PAIRS.find(p => p.dc === parseInt(pairIndex))?.name || 'NaN_USDT';
        const isLong = openData.isLong;
        const action = isLong ? 'Long' : 'Short';
        const sizeUsd = ethers.formatUnits(openData.sizeUsd, 6);

        await this.log(`Open ID: ${openId}`, 'info');
        await this.log(`Size: ${sizeUsd} USDT`, 'info');
        await this.log(`Pair: ${action} - ${pairName}`, 'info');

        const [txHash, blockNumber] = await this.performClosePosition(openId, pairIndex);
        if (txHash && blockNumber) {
          this.usedIds.add(openId);
          await this.log(`Close position ${tradeIndex + 1} completed successfully`, 'success');
          await randomDelay();
        } else {
          await this.log(`Close position ${tradeIndex + 1} failed after ${CONFIG.MAX_TRADE_RETRIES} attempts`, 'error');
        }
      }
    } catch (error) {
      await this.log(`Wallet processing failed: ${error.message}`, 'error');
      return false;
    }
  }
}

// Worker pool for parallel processing
async function runWorkerPool(wallets, tradeIndex, operation, positionCount) {
  return new Promise((resolve) => {
    if (wallets.length === 0) {
      log('No wallets to process, skipping worker pool', 'warning');
      resolve();
      return;
    }

    let next = 0;
    let running = 0;
    const total = wallets.length;

    function startWorker() {
      if (next >= total) return;
      const accountIndex = next;
      const privateKey = wallets[next];
      next++;
      running++;
      const worker = new Worker(__filename, {
        workerData: { accountIndex, privateKey, tradeIndex, operation, positionCount },
      });

      const timeout = setTimeout(() => {
        worker.terminate();
        console.log(formatLogMessage(`System | Worker ${accountIndex} | Thread timed out after 20 minutes`));
      }, CONFIG.THREAD_TIMEOUT);

      worker.on('message', (msg) => console.log(formatLogMessage(`System | Worker ${accountIndex} | ${msg}`)));
      worker.on('error', (err) => console.log(formatLogMessage(`System | Worker ${accountIndex} | Thread error: ${err.message}`)));
      worker.on('exit', (code) => {
        clearTimeout(timeout);
        running--;
        startWorker();
        if (running === 0 && next >= total) resolve();
        console.log(formatLogMessage(`System | Worker ${accountIndex} | Thread exited with code ${code}`));
      });
    }

    for (let i = 0; i < CONFIG.MAX_THREADS && i < total; i++) {
      startWorker();
    }
  });
}

// Main execution
async function performCFDTask(logger, privateKeys, proxies, positionCount, usedNonces) {
  log('Starting CFD Trading Task...', 'info');
  try {
    let walletData;
    try {
      walletData = fs.readFileSync('wallets.txt', 'utf8');
    } catch (error) {
      log(`Error reading wallets.txt: ${error.message}`, 'error');
      return;
    }

    const walletKeys = walletData
      .split(/\r?\n/)
      .map(key => key.trim())
      .filter(key => key !== '' && key.length > 0);

    // Use all keys from wallets.txt if privateKeys is empty, otherwise filter
    const privateKeysFiltered = privateKeys.length > 0
      ? walletKeys.filter(key => privateKeys.includes(key))
      : walletKeys;

    log(`Total accounts: ${privateKeysFiltered.length}`, 'info');
    log(`Number of transactions to perform: ${positionCount}`, 'info');

    if (privateKeysFiltered.length === 0) {
      log('No valid wallets found in wallets.txt or matching privateKeys', 'error');
      return;
    }

    // Step 1: Claim faucet for all wallets
    log('Starting faucet claim for all wallets', 'info');
    await runWorkerPool(privateKeysFiltered, 0, 'claim', positionCount);
    log('Faucet claim for all wallets completed', 'success');

    // Step 2: Open positions
    for (let tradeIndex = 0; tradeIndex < positionCount; tradeIndex++) {
      log(`Starting open position round ${tradeIndex + 1}`, 'info');
      await runWorkerPool(privateKeysFiltered, tradeIndex, 'open', positionCount);
      log(`Open position round ${tradeIndex + 1} for all wallets completed`, 'success');
      await sleep(3000);
    }

    // Step 3: Close positions
    for (let tradeIndex = 0; tradeIndex < positionCount; tradeIndex++) {
      log(`Starting close position round ${tradeIndex + 1}`, 'info');
      await runWorkerPool(privateKeysFiltered, tradeIndex, 'close', positionCount);
      log(`Close position round ${tradeIndex + 1} for all wallets completed`, 'success');
      await sleep(3000);
    }

    log('CFD Trading Task completed', 'success');
  } catch (err) {
    log(`Error in CFD Trading Task: ${err.message}`, 'error');
  }
}

// Worker thread logic
if (!isMainThread) {
  const { accountIndex, privateKey, tradeIndex, operation, positionCount } = workerData;
  (async () => {
    const bot = new TradeService({ accountIndex, privateKey });
    if (operation === 'claim') {
      await bot.performClaim();
    } else {
      await bot.processSingleWallet(tradeIndex, operation, positionCount);
    }
    parentPort.postMessage('Completed');
  })().catch((err) => parentPort.postMessage(`Worker error: ${err.message}`));
}

// Global error handlers
process.on('SIGINT', () => {
  console.log(formatLogMessage('System | Bot stopped'));
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error(formatLogMessage(`System | Uncaught Exception: ${error.message}`));
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(formatLogMessage(`System | Unhandled Rejection at: ${promise} reason: ${reason.message || reason}`));
  process.exit(1);
});

module.exports = { performCFDTask };