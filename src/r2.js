const ethers = require("ethers");
const axios = require("axios");
const fs = require("fs");
const chalk = require("chalk").default || require("chalk");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

class R2Task {
  constructor() {
    this.RPC_URL = "https://testnet.dplabs-internal.com/";
    this.USDC_CONTRACT_ADDRESS = "0x8bebfcbe5468f146533c182df3dfbf5ff9be00e2";
    this.R2USD_CONTRACT_ADDRESS = "0x4f5b54d4AF2568cefafA73bB062e5d734b55AA05";
    this.sR2USD_CONTRACT_ADDRESS = "0xF8694d25947A0097CB2cea2Fc07b071Bdf72e1f8";
    
    this.ERC20_CONTRACT_ABI = [
      "function balanceOf(address owner) view returns (uint256)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function decimals() view returns (uint8)"
    ];
    
    this.R2_CONTRACT_ABI = [
      {
        type: "function",
        name: "mint",
        inputs: [
          { name: "to", type: "address", internalType: "address" },
          { name: "value", type: "uint256", internalType: "uint256" },
          {
            name: "permit",
            type: "tuple",
            internalType: "struct R2USD.PermitData",
            components: [
              { name: "value", type: "uint256", internalType: "uint256" },
              { name: "deadline", type: "uint256", internalType: "uint256" },
              { name: "v", type: "uint8", internalType: "uint8" },
              { name: "r", type: "bytes32", internalType: "bytes32" },
              { name: "s", type: "bytes32", internalType: "bytes32" }
            ]
          }
        ],
        outputs: [],
        stateMutability: "nonpayable"
      },
      {
        type: "function",
        name: "burn",
        inputs: [
          { name: "to", type: "address", internalType: "address" },
          { name: "value", type: "uint256", internalType: "uint256" }
        ],
        outputs: [],
        stateMutability: "nonpayable"
      },
      {
        type: "function",
        name: "stake",
        inputs: [
          { name: "r2USDValue", type: "uint256", internalType: "uint256" },
          {
            name: "permit",
            type: "tuple",
            internalType: "struct SR2USDTestnet.PermitData",
            components: [
              { name: "value", type: "uint256", internalType: "uint256" },
              { name: "deadline", type: "uint256", internalType: "uint256" },
              { name: "v", type: "uint8", internalType: "uint8" },
              { name: "r", type: "bytes32", internalType: "bytes32" },
              { name: "s", type: "bytes32", internalType: "bytes32" }
            ]
          }
        ],
        outputs: [],
        stateMutability: "nonpayable"
      }
    ];
    
    this.proxies = [];
    this.proxy_index = 0;
    this.account_proxies = {};
  }

  getShortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
  }

  formatSeconds(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  async loadProxies() {
    const filename = "proxy.txt";
    try {
      if (!fs.existsSync(filename)) {
        return [];
      }
      const data = fs.readFileSync(filename, 'utf8');
      this.proxies = data.split('\n').map(line => line.trim()).filter(line => line);
      return this.proxies;
    } catch (error) {
      return [];
    }
  }

  checkProxyScheme(proxy) {
    const schemes = ["http://", "https://", "socks4://", "socks5://"];
    if (schemes.some(scheme => proxy.startsWith(scheme))) {
      return proxy;
    }
    return `http://${proxy}`;
  }

  getNextProxyForAccount(address) {
    if (!this.account_proxies[address]) {
      if (!this.proxies.length) return null;
      const proxy = this.checkProxyScheme(this.proxies[this.proxy_index]);
      this.account_proxies[address] = proxy;
      this.proxy_index = (this.proxy_index + 1) % this.proxies.length;
    }
    return this.account_proxies[address];
  }

  rotateProxyForAccount(address) {
    if (!this.proxies.length) return null;
    const proxy = this.checkProxyScheme(this.proxies[this.proxy_index]);
    this.account_proxies[address] = proxy;
    this.proxy_index = (this.proxy_index + 1) % this.proxies.length;
    return proxy;
  }

  buildProxyAgent(proxy) {
    if (!proxy) return null;
    
    if (proxy.startsWith("socks")) {
      return new SocksProxyAgent(proxy);
    } else if (proxy.startsWith("http")) {
      return new HttpsProxyAgent(proxy);
    }
    return null;
  }

  generateAddress(privateKey) {
    try {
      const wallet = new ethers.Wallet(privateKey);
      return wallet.address;
    } catch (error) {
      return null;
    }
  }

  maskAccount(account) {
    if (!account || account.length < 12) return account;
    return account.slice(0, 6) + '*'.repeat(6) + account.slice(-6);
  }

  generateSwapOption(swapOption, usdcSwapAmount, r2usdSwapAmount) {
    const buy = {
      pair: "USDC to R2USD",
      ticker: "USDC",
      amount: usdcSwapAmount,
      asset: this.USDC_CONTRACT_ADDRESS
    };

    const sell = {
      pair: "R2USD to USDC",
      ticker: "R2USD",
      amount: r2usdSwapAmount,
      asset: this.R2USD_CONTRACT_ADDRESS
    };

    if (swapOption === 1) {
      return buy;
    } else if (swapOption === 2) {
      return sell;
    } else if (swapOption === 3) {
      return Math.random() < 0.5 ? buy : sell;
    }
  }

  async getWeb3Provider(useProxy, address) {
    const proxy = useProxy ? this.getNextProxyForAccount(address) : null;
    const agent = this.buildProxyAgent(proxy);
    
    const provider = new ethers.JsonRpcProvider(this.RPC_URL, 688688, {
      agent: agent
    });
    
    // Test connection
    try {
      await provider.getBlockNumber();
      return provider;
    } catch (error) {
      throw new Error(`Failed to connect to RPC: ${error.message}`);
    }
  }

  async getTokenBalance(address, contractAddress, useProxy) {
    try {
      const provider = await this.getWeb3Provider(useProxy, address);
      const tokenContract = new ethers.Contract(contractAddress, this.ERC20_CONTRACT_ABI, provider);
      
      const balance = await tokenContract.balanceOf(address);
      
      // USDC and R2USD use 6 decimals
      return Number(ethers.formatUnits(balance, 6));
    } catch (error) {
      throw new Error(`Failed to get token balance: ${error.message}`);
    }
  }

  async approvingToken(wallet, routerAddress, assetAddress, amount, logger) {
    try {
      const tokenContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const allowance = await tokenContract.allowance(wallet.address, routerAddress);
      
      if (BigInt(allowance) < BigInt(amount)) {
        logger(`${this.getShortAddress(wallet.address)} | Approving token...`);
        
        const approveTx = await tokenContract.approve(routerAddress, ethers.MaxUint256);
        logger(`${this.getShortAddress(wallet.address)} | Success: Approved | Confirmed: ${approveTx.hash}`);
        await approveTx.wait();
        
        // Wait for approval to propagate
        logger(`${this.getShortAddress(wallet.address)} | Waiting for approval confirmation...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      return true;
    } catch (error) {
      throw new Error(`Approving token failed: ${error.message}`);
    }
  }

  async performMint(wallet, amount, logger) {
    try {
      const amountWei = ethers.parseUnits(amount.toString(), 6);
      
      // Approve USDC
      await this.approvingToken(
        wallet,
        this.R2USD_CONTRACT_ADDRESS,
        this.USDC_CONTRACT_ADDRESS,
        amountWei,
        logger
      );
      
      // Create permit data with proper bytes32 values
      const permit = [
        0n, // value
        0n, // deadline
        0, // v
        "0x0000000000000000000000000000000000000000000000000000000000000000", // r (bytes32)
        "0x0000000000000000000000000000000000000000000000000000000000000000"  // s (bytes32)
      ];
      
      const r2Contract = new ethers.Contract(this.R2USD_CONTRACT_ADDRESS, this.R2_CONTRACT_ABI, wallet);
      
      const tx = await r2Contract.mint(wallet.address, amountWei, permit);
      await tx.wait();
      
      return tx.hash;
    } catch (error) {
      throw new Error(`Mint failed: ${error.message}`);
    }
  }

  async performBurn(wallet, amount, logger) {
    try {
      const amountWei = ethers.parseUnits(amount.toString(), 6);
      
      const r2Contract = new ethers.Contract(this.R2USD_CONTRACT_ADDRESS, this.R2_CONTRACT_ABI, wallet);
      
      const tx = await r2Contract.burn(wallet.address, amountWei);
      await tx.wait();
      
      return tx.hash;
    } catch (error) {
      throw new Error(`Burn failed: ${error.message}`);
    }
  }

  async performStake(wallet, amount, logger) {
    try {
      const amountWei = ethers.parseUnits(amount.toString(), 6);
      
      // Approve R2USD for staking
      await this.approvingToken(
        wallet,
        this.sR2USD_CONTRACT_ADDRESS,
        this.R2USD_CONTRACT_ADDRESS,
        amountWei,
        logger
      );
      
      // Create permit data with proper bytes32 values
      const permit = [
        0n, // value
        0n, // deadline
        0, // v
        "0x0000000000000000000000000000000000000000000000000000000000000000", // r (bytes32)
        "0x0000000000000000000000000000000000000000000000000000000000000000"  // s (bytes32)
      ];
      
      const stakeContract = new ethers.Contract(this.sR2USD_CONTRACT_ADDRESS, this.R2_CONTRACT_ABI, wallet);
      
      const tx = await stakeContract.stake(amountWei, permit);
      await tx.wait();
      
      return tx.hash;
    } catch (error) {
      throw new Error(`Stake failed: ${error.message}`);
    }
  }

  async checkConnection(proxy) {
    try {
      const agent = this.buildProxyAgent(proxy);
      const response = await axios.get('https://api.ipify.org?format=json', {
        httpsAgent: agent,
        timeout: 30000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

async function performR2Task(
  logger,
  privateKeys,
  proxies,
  taskConfig,
  usedNonces
) {
  const r2 = new R2Task();
  
  // Load proxies if provided
  if (proxies && proxies.length > 0) {
    r2.proxies = proxies;
  } else if (taskConfig.useProxy) {
    await r2.loadProxies();
  }
  
  logger("System | Starting R2 Task...");
  
  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const address = r2.generateAddress(privateKey);
    
    if (!address) {
      logger(`Account ${i + 1} | Error: Invalid private key`);
      continue;
    }
    
    logger(`${r2.getShortAddress(address)} | Processing R2 Task for account ${i + 1}`);
    
    try {
      // Check proxy connection if using proxy
      if (taskConfig.useProxy) {
        const proxy = r2.getNextProxyForAccount(address);
        logger(`${r2.getShortAddress(address)} | Using proxy: ${proxy}`);
        
        const isValid = await r2.checkConnection(proxy);
        if (!isValid && taskConfig.rotateProxy) {
          logger(`${r2.getShortAddress(address)} | Warning: Proxy invalid, rotating...`);
          r2.rotateProxyForAccount(address);
        }
      }
      
      // Get provider and wallet
      const provider = await r2.getWeb3Provider(taskConfig.useProxy, address);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Initialize nonce
      if (!usedNonces[address]) {
        usedNonces[address] = await provider.getTransactionCount(address, "pending");
      }
      
      // Execute based on selected action
      if (taskConfig.action === "swap") {
        logger(`${r2.getShortAddress(address)} | Processing R2 Swap...`);
        
        for (let j = 0; j < taskConfig.swapCount; j++) {
          logger(`${r2.getShortAddress(address)} | Swap ${j + 1} of ${taskConfig.swapCount}`);
          
          const option = r2.generateSwapOption(
            taskConfig.swapOption,
            taskConfig.usdcSwapAmount,
            taskConfig.r2usdSwapAmount
          );
          
          logger(`${r2.getShortAddress(address)} | Option: ${option.pair}`);
          logger(`${r2.getShortAddress(address)} | Amount: ${option.amount} ${option.ticker}`);
          
          // Check balance
          const balance = await r2.getTokenBalance(address, option.asset, taskConfig.useProxy);
          logger(`${r2.getShortAddress(address)} | Balance: ${balance} ${option.ticker}`);
          
          if (balance < option.amount) {
            logger(`${r2.getShortAddress(address)} | Warning: Insufficient ${option.ticker} balance`);
            break;
          }
          
          // Execute swap
          let txHash;
          if (option.pair === "USDC to R2USD") {
            txHash = await r2.performMint(wallet, option.amount, logger);
            logger(`${r2.getShortAddress(address)} | Success: Minted ${option.amount} R2USD | Confirmed: ${txHash}`);
          } else {
            txHash = await r2.performBurn(wallet, option.amount, logger);
            logger(`${r2.getShortAddress(address)} | Success: Burned ${option.amount} R2USD | Confirmed: ${txHash}`);
          }
          
          usedNonces[address]++;
          
          // Delay between swaps
          if (j < taskConfig.swapCount - 1) {
            const delay = Math.floor(Math.random() * (taskConfig.maxDelay - taskConfig.minDelay + 1)) + taskConfig.minDelay;
            logger(`${r2.getShortAddress(address)} | Waiting ${delay} seconds for next swap...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
          }
        }
        
      } else if (taskConfig.action === "earn") {
        logger(`${r2.getShortAddress(address)} | Processing R2 Earn...`);
        
        for (let j = 0; j < taskConfig.earnCount; j++) {
          logger(`${r2.getShortAddress(address)} | Earn ${j + 1} of ${taskConfig.earnCount}`);
          logger(`${r2.getShortAddress(address)} | Option: R2USD to sR2USD`);
          logger(`${r2.getShortAddress(address)} | Amount: ${taskConfig.r2usdEarnAmount} R2USD`);
          
          // Check R2USD balance
          const balance = await r2.getTokenBalance(address, r2.R2USD_CONTRACT_ADDRESS, taskConfig.useProxy);
          logger(`${r2.getShortAddress(address)} | Balance: ${balance} R2USD`);
          
          if (balance < taskConfig.r2usdEarnAmount) {
            logger(`${r2.getShortAddress(address)} | Warning: Insufficient R2USD balance`);
            break;
          }
          
          // Execute stake
          const txHash = await r2.performStake(wallet, taskConfig.r2usdEarnAmount, logger);
          logger(`${r2.getShortAddress(address)} | Success: Staked ${taskConfig.r2usdEarnAmount} R2USD | Confirmed: ${txHash}`);
          usedNonces[address]++;
          
          // Delay between stakes
          if (j < taskConfig.earnCount - 1) {
            const delay = Math.floor(Math.random() * (taskConfig.maxDelay - taskConfig.minDelay + 1)) + taskConfig.minDelay;
            logger(`${r2.getShortAddress(address)} | Waiting ${delay} seconds for next stake...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
          }
        }
        
      } else if (taskConfig.action === "all") {
        // Run swap first
        if (taskConfig.swapCount > 0) {
          logger(`${r2.getShortAddress(address)} | Processing R2 Swap...`);
          
          for (let j = 0; j < taskConfig.swapCount; j++) {
            logger(`${r2.getShortAddress(address)} | Swap ${j + 1} of ${taskConfig.swapCount}`);
            
            const option = r2.generateSwapOption(
              taskConfig.swapOption,
              taskConfig.usdcSwapAmount,
              taskConfig.r2usdSwapAmount
            );
            
            logger(`${r2.getShortAddress(address)} | Option: ${option.pair}`);
            logger(`${r2.getShortAddress(address)} | Amount: ${option.amount} ${option.ticker}`);
            
            const balance = await r2.getTokenBalance(address, option.asset, taskConfig.useProxy);
            logger(`${r2.getShortAddress(address)} | Balance: ${balance} ${option.ticker}`);
            
            if (balance < option.amount) {
              logger(`${r2.getShortAddress(address)} | Warning: Insufficient ${option.ticker} balance`);
              break;
            }
            
            let txHash;
            if (option.pair === "USDC to R2USD") {
              txHash = await r2.performMint(wallet, option.amount, logger);
              logger(`${r2.getShortAddress(address)} | Success: Minted ${option.amount} R2USD | Confirmed: ${txHash}`);
            } else {
              txHash = await r2.performBurn(wallet, option.amount, logger);
              logger(`${r2.getShortAddress(address)} | Success: Burned ${option.amount} R2USD | Confirmed: ${txHash}`);
            }
            
            usedNonces[address]++;
            
            if (j < taskConfig.swapCount - 1) {
              const delay = Math.floor(Math.random() * (taskConfig.maxDelay - taskConfig.minDelay + 1)) + taskConfig.minDelay;
              logger(`${r2.getShortAddress(address)} | Waiting ${delay} seconds...`);
              await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
          }
        }
        
        // Then run earn
        if (taskConfig.earnCount > 0) {
          logger(`${r2.getShortAddress(address)} | Processing R2 Earn...`);
          
          for (let j = 0; j < taskConfig.earnCount; j++) {
            logger(`${r2.getShortAddress(address)} | Earn ${j + 1} of ${taskConfig.earnCount}`);
            logger(`${r2.getShortAddress(address)} | Option: R2USD to sR2USD`);
            logger(`${r2.getShortAddress(address)} | Amount: ${taskConfig.r2usdEarnAmount} R2USD`);
            
            const balance = await r2.getTokenBalance(address, r2.R2USD_CONTRACT_ADDRESS, taskConfig.useProxy);
            logger(`${r2.getShortAddress(address)} | Balance: ${balance} R2USD`);
            
            if (balance < taskConfig.r2usdEarnAmount) {
              logger(`${r2.getShortAddress(address)} | Warning: Insufficient R2USD balance`);
              break;
            }
            
            const txHash = await r2.performStake(wallet, taskConfig.r2usdEarnAmount, logger);
            logger(`${r2.getShortAddress(address)} | Success: Staked ${taskConfig.r2usdEarnAmount} R2USD | Confirmed: ${txHash}`);
            usedNonces[address]++;
            
            if (j < taskConfig.earnCount - 1) {
              const delay = Math.floor(Math.random() * (taskConfig.maxDelay - taskConfig.minDelay + 1)) + taskConfig.minDelay;
              logger(`${r2.getShortAddress(address)} | Waiting ${delay} seconds...`);
              await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
          }
        }
      }
      
    } catch (error) {
      logger(`${r2.getShortAddress(address)} | Error: ${error.message}`);
    }
    
    // Delay between accounts
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  logger("System | R2 Task completed!");
}

module.exports = { performR2Task };
