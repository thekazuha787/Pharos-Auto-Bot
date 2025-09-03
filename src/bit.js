const ethers = require("ethers");
const axios = require("axios");
const fs = require("fs");
const chalk = require("chalk").default || require("chalk");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

class BitverseTask {
  constructor() {
    this.BASE_API = "https://api.bitverse.zone/bitverse";
    this.RPC_URL = "https://testnet.dplabs-internal.com/";
    this.USDT_CONTRACT_ADDRESS = "0xD4071393f8716661958F766DF660033b3d35fD29";
    this.POSITION_ROUTER_ADDRESS = "0xA307cE75Bc6eF22794410D783e5D4265dEd1A24f";
    this.TRADE_ROUTER_ADDRESS = "0xbf428011d76eFbfaEE35a20dD6a0cA589B539c54";
    this.TRADE_PROVIDER_ADDRESS = "bvx17w0adeg64ky0daxwd2ugyuneellmjgnx53lm9l";
    
    this.ERC20_CONTRACT_ABI = [
      "function balanceOf(address owner) view returns (uint256)",
      "function allowance(address owner, address spender) view returns (uint256)",
      "function approve(address spender, uint256 amount) returns (bool)",
      "function decimals() view returns (uint8)",
      "function deposit(address token, uint256 amount)",
      "function withdraw(address token, uint256 amount)"
    ];
    
    this.BITVERSE_CONTRACT_ABI = [
      {
        type: "function",
        name: "placeOrder",
        stateMutability: "nonpayable",
        inputs: [
          { internalType: "string", name: "pairId", type: "string" },
          { internalType: "uint256", name: "price", type: "uint256" },
          { internalType: "uint8", name: "orderType", type: "uint8" },
          { internalType: "uint64", name: "leverageE2", type: "uint64" },
          { internalType: "uint8", name: "side", type: "uint8" },
          { internalType: "uint64", name: "slippageE6", type: "uint64" },
          {
            type: "tuple[]",
            name: "margins",
            internalType: "struct Margin[]",
            components: [
              { internalType: "address", name: "token", type: "address" },
              { internalType: "uint256", name: "amount", type: "uint256" }
            ]
          },
          { internalType: "uint256", name: "takeProfitPrice", type: "uint256" },
          { internalType: "uint256", name: "stopLossPrice", type: "uint256" },
          { internalType: "uint256", name: "positionLongOI", type: "uint256" },
          { internalType: "uint256", name: "positionShortOI", type: "uint256" },
          { internalType: "uint256", name: "timestamp", type: "uint256" },
          { internalType: "bytes", name: "signature", type: "bytes" },
          { internalType: "bool", name: "isExecuteImmediately", type: "bool" }
        ],
        outputs: []
      }
    ];
    
    this.HEADERS = {};
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

  generateTradeOption() {
    const tradePair = ["BTC-USD", "ETH-USD"][Math.floor(Math.random() * 2)];
    return { tradePair, tradeSide: 1 }; // Always Long for now
  }

  generateOrderPayload(tradePair, acceptablePrice, tradeSide, tradeAmount) {
    return {
      address: this.TRADE_PROVIDER_ADDRESS,
      pair: tradePair,
      price: acceptablePrice.toString(),
      orderType: 2,
      leverageE2: 500,
      side: tradeSide,
      margin: [
        { denom: "USDT", amount: Math.floor(tradeAmount).toString() }
      ],
      allowedSlippage: "10",
      isV2: "0"
    };
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
      
      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(address),
        tokenContract.decimals()
      ]);
      
      return Number(ethers.formatUnits(balance, decimals));
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
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      return true;
    } catch (error) {
      throw new Error(`Approving token failed: ${error.message}`);
    }
  }

  async performDeposit(wallet, assetAddress, amount, logger) {
    try {
      const assetContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const decimals = await assetContract.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);
      
      await this.approvingToken(wallet, this.POSITION_ROUTER_ADDRESS, assetAddress, amountWei, logger);
      
      const routerContract = new ethers.Contract(this.POSITION_ROUTER_ADDRESS, this.ERC20_CONTRACT_ABI, wallet);
      const tx = await routerContract.deposit(assetAddress, amountWei);
      
      await tx.wait();
      return tx.hash;
    } catch (error) {
      throw new Error(`Deposit failed: ${error.message}`);
    }
  }

  async performWithdraw(wallet, assetAddress, amount, logger) {
    try {
      const assetContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const decimals = await assetContract.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);
      
      const routerContract = new ethers.Contract(this.POSITION_ROUTER_ADDRESS, this.ERC20_CONTRACT_ABI, wallet);
      const tx = await routerContract.withdraw(assetAddress, amountWei);
      
      await tx.wait();
      return tx.hash;
    } catch (error) {
      throw new Error(`Withdraw failed: ${error.message}`);
    }
  }

  async performTrade(wallet, orders, acceptablePrice, assetAddress, amount, logger) {
    try {
      const assetContract = new ethers.Contract(assetAddress, this.ERC20_CONTRACT_ABI, wallet);
      const decimals = await assetContract.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);
      
      const tradeContract = new ethers.Contract(this.TRADE_ROUTER_ADDRESS, this.BITVERSE_CONTRACT_ABI, wallet);
      
      const params = {
        pairId: orders.result.pair,
        price: acceptablePrice,
        orderType: 2,
        leverageE2: parseInt(orders.result.leverageE2),
        side: parseInt(orders.result.side),
        slippageE6: parseInt(orders.result.allowedSlippage),
        margins: [[assetAddress, amountWei]],
        takeProfitPrice: 0,
        stopLossPrice: 0,
        positionLongOI: BigInt(orders.result.longOI),
        positionShortOI: BigInt(orders.result.shortOI),
        timestamp: parseInt(orders.result.signTimestamp),
        signature: orders.result.sign,
        isExecuteImmediately: Boolean(orders.result.marketOpening)
      };
      
      const tx = await tradeContract.placeOrder(
        params.pairId,
        params.price,
        params.orderType,
        params.leverageE2,
        params.side,
        params.slippageE6,
        params.margins,
        params.takeProfitPrice,
        params.stopLossPrice,
        params.positionLongOI,
        params.positionShortOI,
        params.timestamp,
        params.signature,
        params.isExecuteImmediately
      );
      
      await tx.wait();
      return tx.hash;
    } catch (error) {
      throw new Error(`Trade failed: ${error.message}`);
    }
  }

  async getAllBalance(address, useProxy) {
    try {
      const url = `${this.BASE_API}/trade-data/v1/account/balance/allCoinBalance`;
      const proxy = useProxy ? this.getNextProxyForAccount(address) : null;
      const agent = this.buildProxyAgent(proxy);
      
      const response = await axios.post(url, 
        { address },
        {
          headers: {
            ...this.HEADERS[address],
            "Content-Type": "application/json"
          },
          httpsAgent: agent,
          timeout: 60000
        }
      );
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get all balances: ${error.message}`);
    }
  }

  async getMarketPrice(address, tradePair, useProxy) {
    try {
      const url = `${this.BASE_API}/quote-all-in-one/v1/public/market/ticker?symbol=${tradePair}`;
      const proxy = useProxy ? this.getNextProxyForAccount(address) : null;
      const agent = this.buildProxyAgent(proxy);
      
      const response = await axios.get(url, {
        headers: this.HEADERS[address],
        httpsAgent: agent,
        timeout: 60000
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get market price: ${error.message}`);
    }
  }

  async orderSimulation(address, tradePair, acceptablePrice, tradeSide, tradeAmount, useProxy) {
    try {
      const url = `${this.BASE_API}/trade-data/v1//order/simulation/pendingOrder`;
      const proxy = useProxy ? this.getNextProxyForAccount(address) : null;
      const agent = this.buildProxyAgent(proxy);
      
      const payload = this.generateOrderPayload(tradePair, acceptablePrice, tradeSide, tradeAmount);
      
      const response = await axios.post(url, payload, {
        headers: {
          ...this.HEADERS[address],
          "Content-Type": "application/json"
        },
        httpsAgent: agent,
        timeout: 60000
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Order simulation failed: ${error.message}`);
    }
  }

  async checkConnection(proxy) {
    try {
      const agent = this.buildProxyAgent(proxy);
      const response = await axios.get('https://api.ipify.org?format=json', {
        httpsAgent: agent,
        timeout: 10000
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

async function performBitverseTask(
  logger,
  privateKeys,
  proxies,
  taskConfig,
  usedNonces
) {
  const bitverse = new BitverseTask();
  
  // Load proxies if provided
  if (proxies && proxies.length > 0) {
    bitverse.proxies = proxies;
  } else if (taskConfig.useProxy) {
    await bitverse.loadProxies();
  }
  
  logger("System | Starting Bitverse Task...");
  
  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const address = bitverse.generateAddress(privateKey);
    
    if (!address) {
      logger(`Account ${i + 1} | Error: Invalid private key`);
      continue;
    }
    
    logger(`${bitverse.getShortAddress(address)} | Processing Bitverse for account ${i + 1}`);
    
    // Set headers for this address
    bitverse.HEADERS[address] = {
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Chain-Id": "688688",
      "Origin": "https://testnet.bitverse.zone",
      "Referer": "https://testnet.bitverse.zone/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-site",
      "Tenant-Id": "PHAROS",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };
    
    try {
      // Check proxy connection if using proxy
      if (taskConfig.useProxy) {
        const proxy = bitverse.getNextProxyForAccount(address);
        logger(`${bitverse.getShortAddress(address)} | Using proxy: ${proxy}`);
        
        const isValid = await bitverse.checkConnection(proxy);
        if (!isValid && taskConfig.rotateProxy) {
          logger(`${bitverse.getShortAddress(address)} | Warning: Proxy invalid, rotating...`);
          bitverse.rotateProxyForAccount(address);
        }
      }
      
      // Get provider and wallet
      const provider = await bitverse.getWeb3Provider(taskConfig.useProxy, address);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Initialize nonce
      if (!usedNonces[address]) {
        usedNonces[address] = await provider.getTransactionCount(address, "pending");
      }
      
      // Execute based on selected action
      if (taskConfig.action === "deposit") {
        logger(`${bitverse.getShortAddress(address)} | Processing deposit...`);
        
        // Check USDT balance
        const balance = await bitverse.getTokenBalance(address, bitverse.USDT_CONTRACT_ADDRESS, taskConfig.useProxy);
        logger(`${bitverse.getShortAddress(address)} | USDT Balance: ${balance}`);
        
        if (balance < taskConfig.depositAmount) {
          logger(`${bitverse.getShortAddress(address)} | Warning: Insufficient USDT balance`);
          continue;
        }
        
        const txHash = await bitverse.performDeposit(
          wallet,
          bitverse.USDT_CONTRACT_ADDRESS,
          taskConfig.depositAmount,
          logger
        );
        
        logger(`${bitverse.getShortAddress(address)} | Success: Deposit ${taskConfig.depositAmount} USDT | Confirmed: ${txHash}`);
        usedNonces[address]++;
        
      } else if (taskConfig.action === "withdraw") {
        logger(`${bitverse.getShortAddress(address)} | Processing withdraw...`);
        
        // Get deposited balance
        const allBalance = await bitverse.getAllBalance(address, taskConfig.useProxy);
        
        if (allBalance.retCode !== 0) {
          logger(`${bitverse.getShortAddress(address)} | Error: ${allBalance.retMsg || 'Failed to fetch balance'}`);
          continue;
        }
        
        const coinBalance = allBalance.result?.coinBalance || [];
        const usdtData = coinBalance.find(coin => coin.coinName === "USDT");
        const balance = usdtData ? parseFloat(usdtData.balanceSize) : 0;
        
        logger(`${bitverse.getShortAddress(address)} | Deposited USDT Balance: ${balance}`);
        
        if (balance < taskConfig.withdrawAmount) {
          logger(`${bitverse.getShortAddress(address)} | Warning: Insufficient deposited USDT balance`);
          continue;
        }
        
        const txHash = await bitverse.performWithdraw(
          wallet,
          bitverse.USDT_CONTRACT_ADDRESS,
          taskConfig.withdrawAmount,
          logger
        );
        
        logger(`${bitverse.getShortAddress(address)} | Success: Withdraw ${taskConfig.withdrawAmount} USDT | Confirmed: ${txHash}`);
        usedNonces[address]++;
        
      } else if (taskConfig.action === "trade") {
        logger(`${bitverse.getShortAddress(address)} | Processing trades...`);
        
        for (let j = 0; j < taskConfig.tradeCount; j++) {
          logger(`${bitverse.getShortAddress(address)} | Trade ${j + 1} of ${taskConfig.tradeCount}`);
          
          const { tradePair, tradeSide } = bitverse.generateTradeOption();
          const tradeOption = tradeSide === 1 ? "[Long]" : "[Short]";
          
          logger(`${bitverse.getShortAddress(address)} | Pair: ${tradePair} ${tradeOption}`);
          logger(`${bitverse.getShortAddress(address)} | Amount: ${taskConfig.tradeAmount} USDT`);
          
          // Check deposited balance
          const allBalance = await bitverse.getAllBalance(address, taskConfig.useProxy);
          if (allBalance.retCode !== 0) {
            logger(`${bitverse.getShortAddress(address)} | Error: ${allBalance.retMsg || 'Failed to fetch balance'}`);
            continue;
          }
          
          const coinBalance = allBalance.result?.coinBalance || [];
          const usdtData = coinBalance.find(coin => coin.coinName === "USDT");
          const balance = usdtData ? parseFloat(usdtData.balanceSize) : 0;
          
          logger(`${bitverse.getShortAddress(address)} | Deposited Balance: ${balance} USDT`);
          
          if (balance < taskConfig.tradeAmount) {
            logger(`${bitverse.getShortAddress(address)} | Warning: Insufficient deposited USDT balance`);
            break;
          }
          
          // Get market price
          const markets = await bitverse.getMarketPrice(address, tradePair, taskConfig.useProxy);
          if (markets.retCode !== 0) {
            logger(`${bitverse.getShortAddress(address)} | Error: ${markets.retMsg || 'Failed to fetch market price'}`);
            continue;
          }
          
          const marketPrice = parseFloat(markets.result.lastPrice);
          logger(`${bitverse.getShortAddress(address)} | Market Price: ${marketPrice} USDT`);
          
          // Calculate acceptable price with 1% slippage
          let acceptablePrice;
          if (tradeSide === 1) {
            acceptablePrice = marketPrice * 1.01;
          } else {
            acceptablePrice = marketPrice * 0.99;
          }
          
          const acceptablePriceWei = Math.floor(acceptablePrice * 1e6);
          
          // Order simulation
          const orders = await bitverse.orderSimulation(
            address,
            tradePair,
            acceptablePriceWei,
            tradeSide,
            taskConfig.tradeAmount,
            taskConfig.useProxy
          );
          
          if (orders.retCode !== 0) {
            logger(`${bitverse.getShortAddress(address)} | Error: ${orders.retMsg || 'Order simulation failed'}`);
            continue;
          }
          
          // Execute trade
          const txHash = await bitverse.performTrade(
            wallet,
            orders,
            acceptablePriceWei,
            bitverse.USDT_CONTRACT_ADDRESS,
            taskConfig.tradeAmount,
            logger
          );
          
          logger(`${bitverse.getShortAddress(address)} | Success: Trade executed | Confirmed: ${txHash}`);
          usedNonces[address]++;
          
          // Delay between trades
          if (j < taskConfig.tradeCount - 1) {
            const delay = Math.floor(Math.random() * (taskConfig.maxDelay - taskConfig.minDelay + 1)) + taskConfig.minDelay;
            logger(`${bitverse.getShortAddress(address)} | Waiting ${delay} seconds for next trade...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
          }
        }
        
      } else if (taskConfig.action === "all") {
        // Run deposit/withdraw first
        if (taskConfig.subAction === "deposit") {
          logger(`${bitverse.getShortAddress(address)} | Processing deposit...`);
          const balance = await bitverse.getTokenBalance(address, bitverse.USDT_CONTRACT_ADDRESS, taskConfig.useProxy);
          logger(`${bitverse.getShortAddress(address)} | USDT Balance: ${balance}`);
          
          if (balance >= taskConfig.depositAmount) {
            const txHash = await bitverse.performDeposit(
              wallet,
              bitverse.USDT_CONTRACT_ADDRESS,
              taskConfig.depositAmount,
              logger
            );
            logger(`${bitverse.getShortAddress(address)} | Success: Deposit ${taskConfig.depositAmount} USDT | Confirmed: ${txHash}`);
            usedNonces[address]++;
          } else {
            logger(`${bitverse.getShortAddress(address)} | Warning: Insufficient USDT balance for deposit`);
          }
        } else {
          logger(`${bitverse.getShortAddress(address)} | Processing withdraw...`);
          const allBalance = await bitverse.getAllBalance(address, taskConfig.useProxy);
          
          if (allBalance.retCode === 0) {
            const coinBalance = allBalance.result?.coinBalance || [];
            const usdtData = coinBalance.find(coin => coin.coinName === "USDT");
            const balance = usdtData ? parseFloat(usdtData.balanceSize) : 0;
            
            logger(`${bitverse.getShortAddress(address)} | Deposited USDT Balance: ${balance}`);
            
            if (balance >= taskConfig.withdrawAmount) {
              const txHash = await bitverse.performWithdraw(
                wallet,
                bitverse.USDT_CONTRACT_ADDRESS,
                taskConfig.withdrawAmount,
                logger
              );
              logger(`${bitverse.getShortAddress(address)} | Success: Withdraw ${taskConfig.withdrawAmount} USDT | Confirmed: ${txHash}`);
              usedNonces[address]++;
            } else {
              logger(`${bitverse.getShortAddress(address)} | Warning: Insufficient deposited balance for withdraw`);
            }
          }
        }
        
        // Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Then run trades
        logger(`${bitverse.getShortAddress(address)} | Processing trades...`);
        for (let j = 0; j < taskConfig.tradeCount; j++) {
          logger(`${bitverse.getShortAddress(address)} | Trade ${j + 1} of ${taskConfig.tradeCount}`);
          
          const { tradePair, tradeSide } = bitverse.generateTradeOption();
          const tradeOption = tradeSide === 1 ? "[Long]" : "[Short]";
          
          logger(`${bitverse.getShortAddress(address)} | Pair: ${tradePair} ${tradeOption}`);
          logger(`${bitverse.getShortAddress(address)} | Amount: ${taskConfig.tradeAmount} USDT`);
          
          const allBalance = await bitverse.getAllBalance(address, taskConfig.useProxy);
          if (allBalance.retCode !== 0) continue;
          
          const coinBalance = allBalance.result?.coinBalance || [];
          const usdtData = coinBalance.find(coin => coin.coinName === "USDT");
          const balance = usdtData ? parseFloat(usdtData.balanceSize) : 0;
          
          if (balance < taskConfig.tradeAmount) {
            logger(`${bitverse.getShortAddress(address)} | Warning: Insufficient balance for trade`);
            break;
          }
          
          const markets = await bitverse.getMarketPrice(address, tradePair, taskConfig.useProxy);
          if (markets.retCode !== 0) continue;
          
          const marketPrice = parseFloat(markets.result.lastPrice);
          const acceptablePrice = tradeSide === 1 ? marketPrice * 1.01 : marketPrice * 0.99;
          const acceptablePriceWei = Math.floor(acceptablePrice * 1e6);
          
          const orders = await bitverse.orderSimulation(
            address,
            tradePair,
            acceptablePriceWei,
            tradeSide,
            taskConfig.tradeAmount,
            taskConfig.useProxy
          );
          
          if (orders.retCode !== 0) continue;
          
          const txHash = await bitverse.performTrade(
            wallet,
            orders,
            acceptablePriceWei,
            bitverse.USDT_CONTRACT_ADDRESS,
            taskConfig.tradeAmount,
            logger
          );
          
          logger(`${bitverse.getShortAddress(address)} | Success: Trade executed | Confirmed: ${txHash}`);
          usedNonces[address]++;
          
          if (j < taskConfig.tradeCount - 1) {
            const delay = Math.floor(Math.random() * (taskConfig.maxDelay - taskConfig.minDelay + 1)) + taskConfig.minDelay;
            logger(`${bitverse.getShortAddress(address)} | Waiting ${delay} seconds...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
          }
        }
      }
      
    } catch (error) {
      logger(`${bitverse.getShortAddress(address)} | Error: ${error.message}`);
    }
    
    // Delay between accounts
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  logger("System | Bitverse Task completed!");
}

module.exports = { performBitverseTask };
