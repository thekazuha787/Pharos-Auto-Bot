const ethers = require("ethers");
const axios = require("axios");
const fs = require("fs");
const chalk = require("chalk").default || require("chalk");
const crypto = require("crypto");
const { HttpsProxyAgent } = require("https-proxy-agent");
const { SocksProxyAgent } = require("socks-proxy-agent");

// Original Domain Config
const DOMAIN_CONFIG = {
  RPC_URL: "https://testnet.dplabs-internal.com",
  CONTROLLER_ADDRESS: "0x51be1ef20a1fd5179419738fc71d95a8b6f8a175",
  DURATION: 31536000,
  RESOLVER: "0x9a43dcA1C3BB268546b98eb2AB1401bFc5b58505",
  DATA: [],
  REVERSE_RECORD: true,
  OWNER_CONTROLLED_FUSES: 0,
  CHAIN_ID: 688688,
  REG_PER_KEY: 1,
  MAX_CONCURRENCY: 1,
};

const CONTROLLER_ABI = [
  {
    constant: true,
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" },
    ],
    name: "makeCommitment",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "pure",
    type: "function",
  },
  {
    constant: false,
    inputs: [{ name: "commitment", type: "bytes32" }],
    name: "commit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    constant: true,
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    name: "rentPrice",
    outputs: [
      {
        components: [
          { name: "base", type: "uint256" },
          { name: "premium", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    constant: false,
    inputs: [
      { name: "name", type: "string" },
      { name: "owner", type: "address" },
      { name: "duration", type: "uint256" },
      { name: "secret", type: "bytes32" },
      { name: "resolver", type: "address" },
      { name: "data", type: "bytes[]" },
      { name: "reverseRecord", type: "bool" },
      { name: "ownerControlledFuses", type: "uint16" },
    ],
    name: "register",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
];

class PNSTask {
  constructor() {
    this.RPC_URL = "https://testnet.dplabs-internal.com/";
    this.ENS_CONTROLLER_ADDRESS = "0x51bE1EF20a1fD5179419738FC71D95A8b6f8A175";
    this.ENS_RESOLVER_ADDRESS = "0x9a43dcA1C3BB268546b98eb2AB1401bFc5b58505";
    this.ENS_CONTRACT_ABI = CONTROLLER_ABI;
    
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

  generateSecretBytes() {
    return crypto.randomBytes(32);
  }

  generateDomains() {
    const vowels = "aeiou";
    const consonants = "bcdfghjklmnpqrstvwxyz";
    
    const length = Math.floor(Math.random() * 5) + 8; // 8-12 characters
    let word = "";
    
    while (word.length < length) {
      // Add consonant
      if (word.length < length) {
        word += consonants[Math.floor(Math.random() * consonants.length)];
      }
      
      // Add vowel
      if (word.length < length) {
        word += vowels[Math.floor(Math.random() * vowels.length)];
      }
    }
    
    return word.substring(0, length);
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

  async getTokenBalance(address, useProxy) {
    try {
      const provider = await this.getWeb3Provider(useProxy, address);
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    } catch (error) {
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }

  async makeCommitment(address, domain, secret, provider) {
    try {
      const contract = new ethers.Contract(
        this.ENS_CONTROLLER_ADDRESS,
        this.ENS_CONTRACT_ABI,
        provider
      );
      
      const commitment = await contract.makeCommitment(
        domain,
        address,
        31536000, // 1 year
        secret,
        this.ENS_RESOLVER_ADDRESS,
        [],
        true,
        0
      );
      
      return commitment;
    } catch (error) {
      throw new Error(`Make commitment failed: ${error.message}`);
    }
  }

  async getMintPrice(domain, provider) {
    try {
      const contract = new ethers.Contract(
        this.ENS_CONTROLLER_ADDRESS,
        this.ENS_CONTRACT_ABI,
        provider
      );
      
      const price = await contract.rentPrice(domain, 31536000);
      const mintPrice = BigInt(price.base) + BigInt(price.premium);
      
      return mintPrice;
    } catch (error) {
      throw new Error(`Get mint price failed: ${error.message}`);
    }
  }

  async performCommitDomain(wallet, domain, secret) {
    try {
      const provider = wallet.provider;
      const commitment = await this.makeCommitment(wallet.address, domain, secret, provider);
      
      const contract = new ethers.Contract(
        this.ENS_CONTROLLER_ADDRESS,
        this.ENS_CONTRACT_ABI,
        wallet
      );
      
      const tx = await contract.commit(commitment);
      await tx.wait();
      
      return tx.hash;
    } catch (error) {
      throw new Error(`Commit domain failed: ${error.message}`);
    }
  }

  async performRegisterDomain(wallet, domain, secret, mintPrice) {
    try {
      const contract = new ethers.Contract(
        this.ENS_CONTROLLER_ADDRESS,
        this.ENS_CONTRACT_ABI,
        wallet
      );
      
      const tx = await contract.register(
        domain,
        wallet.address,
        31536000, // 1 year
        secret,
        this.ENS_RESOLVER_ADDRESS,
        [],
        true,
        0,
        { value: mintPrice }
      );
      
      await tx.wait();
      return tx.hash;
    } catch (error) {
      throw new Error(`Register domain failed: ${error.message}`);
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

// Original domain mint task (existing)
async function performDomainMintTask(logger, privateKeys, proxies, domainMintCount, usedNonces) {
  const delay = 60; // Hardcoded delay in seconds
  const MAX_RETRY = 5;

  function randomName(length = 9) {
    if (length < 3) length = 3;
    const charsLetters = "abcdefghijklmnopqrstuvwxyz";
    const charsLettersDigits = charsLetters + "0123456789";
    let nameList = [charsLetters[Math.floor(Math.random() * charsLetters.length)]];
    
    for (let i = 0; i < length - 1; i++) {
      if (nameList[nameList.length - 1] === "-") {
        nameList.push(charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)]);
      } else {
        const chars = charsLettersDigits + "-";
        nameList.push(chars[Math.floor(Math.random() * chars.length)]);
      }
    }

    if (nameList[nameList.length - 1] === "-") {
      nameList[nameList.length - 1] = charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)];
    }

    let cleanedName = [];
    for (let i = 0; i < nameList.length; i++) {
      if (nameList[i] === "-" && cleanedName.length > 0 && cleanedName[cleanedName.length - 1] === "-") {
        cleanedName.push(charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)]);
      } else {
        cleanedName.push(nameList[i]);
      }
    }

    while (cleanedName.length < length) {
      if (cleanedName.length > 0 && cleanedName[cleanedName.length - 1] === "-") {
        cleanedName.push(charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)]);
      } else {
        const chars = charsLettersDigits + "-";
        cleanedName.push(chars[Math.floor(Math.random() * chars.length)]);
      }
    }

    let finalResult = cleanedName.slice(0, length).join("");
    if (finalResult.startsWith("-")) {
      finalResult = charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)] + finalResult.slice(1);
    }
    if (finalResult.endsWith("-")) {
      finalResult = finalResult.slice(0, -1) + charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)];
    }

    finalResult = finalResult.replace(/--/g, () => {
      return charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)] + charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)];
    });

    while (finalResult.length < length) {
      finalResult += charsLettersDigits[Math.floor(Math.random() * charsLettersDigits.length)];
    }

    return finalResult.slice(0, length);
  }

  function validatePrivateKey(privateKey) {
    if (privateKey.startsWith("0x")) privateKey = privateKey.slice(2);
    return privateKey.length === 64 && /^[0-9a-fA-F]+$/.test(privateKey);
  }

  function getShortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
  }

  logger("System | Starting Domain Mint Task...");

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const walletLogPrefix = `Wallet #${i + 1}`;
    
    if (!validatePrivateKey(privateKey)) {
      logger(`${walletLogPrefix} | Error: Invalid private key, skipping...`);
      continue;
    }

    const provider = new ethers.JsonRpcProvider(DOMAIN_CONFIG.RPC_URL, DOMAIN_CONFIG.CHAIN_ID);
    let ownerAddress, controllerAddress, resolverAddress;

    try {
      const wallet = new ethers.Wallet(privateKey, provider);
      ownerAddress = wallet.address;
      controllerAddress = ethers.getAddress(DOMAIN_CONFIG.CONTROLLER_ADDRESS);
      resolverAddress = ethers.getAddress(DOMAIN_CONFIG.RESOLVER);
    } catch (error) {
      logger(`${walletLogPrefix} | Error: Invalid contract or resolver address: ${error.message}`);
      continue;
    }

    logger(`${getShortAddress(ownerAddress)} | Processing Domain Mint for account ${i + 1}`);

    for (let j = 0; j < domainMintCount; j++) {
      const regIndex = j + 1;
      const domainName = randomName();
      const logPrefix = `${walletLogPrefix} | Attempt ${regIndex} | ${domainName}.phrs`;

      let domainRegistered = false;
      let retry = 0;

      while (retry < MAX_RETRY && !domainRegistered) {
        try {
          const wallet = new ethers.Wallet(privateKey, provider);
          const controller = new ethers.Contract(controllerAddress, CONTROLLER_ABI, wallet);
          const secret = "0x" + crypto.randomBytes(32).toString("hex");

          logger(`${logPrefix} | COMMIT - Creating commitment...`);
          const commitment = await controller.makeCommitment(
            domainName,
            ownerAddress,
            DOMAIN_CONFIG.DURATION,
            secret,
            resolverAddress,
            DOMAIN_CONFIG.DATA,
            DOMAIN_CONFIG.REVERSE_RECORD,
            DOMAIN_CONFIG.OWNER_CONTROLLED_FUSES
          );

          logger(`${logPrefix} | COMMIT - Sending transaction...`);
          const commitTx = await controller.commit(commitment, {
            gasLimit: 200000,
            maxFeePerGas: (await provider.getFeeData()).maxFeePerGas || ethers.parseUnits("1", "gwei"),
            maxPriorityFeePerGas: (await provider.getFeeData()).maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
            nonce: usedNonces[ownerAddress] || (await provider.getTransactionCount(ownerAddress, "pending")),
          });

          const commitReceipt = await commitTx.wait();
          if (commitReceipt.status === 1) {
            logger(`${logPrefix} | Success: COMMIT - Confirmed: ${commitTx.hash}`);
          } else {
            throw new Error(`Commitment transaction failed. TX Hash: ${commitTx.hash}`);
          }

          logger(`${logPrefix} | WAITING ${delay} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay * 1000));

          logger(`${logPrefix} | REGISTER - Calculating rent price...`);
          const price = await controller.rentPrice(domainName, DOMAIN_CONFIG.DURATION);
          const value = BigInt(price.base) + BigInt(price.premium);
          logger(`${logPrefix} | REGISTER - Rent price: ${ethers.formatEther(value)} ETH`);

          logger(`${logPrefix} | REGISTER - Sending transaction...`);
          const registerTx = await controller.register(
            domainName,
            ownerAddress,
            DOMAIN_CONFIG.DURATION,
            secret,
            resolverAddress,
            DOMAIN_CONFIG.DATA,
            DOMAIN_CONFIG.REVERSE_RECORD,
            DOMAIN_CONFIG.OWNER_CONTROLLED_FUSES,
            {
              gasLimit: 300000,
              maxFeePerGas: (await provider.getFeeData()).maxFeePerGas || ethers.parseUnits("1", "gwei"),
              maxPriorityFeePerGas: (await provider.getFeeData()).maxPriorityFeePerGas || ethers.parseUnits("0.5", "gwei"),
              value: value.toString(),
              nonce: usedNonces[ownerAddress] || (await provider.getTransactionCount(ownerAddress, "pending")),
            }
          );

          const registerReceipt = await registerTx.wait();
          if (registerReceipt.status === 1) {
            logger(`${logPrefix} | Success: REGISTER - Domain registered | Confirmed: ${registerTx.hash}`);
            domainRegistered = true;
            usedNonces[ownerAddress] = (usedNonces[ownerAddress] || (await provider.getTransactionCount(ownerAddress, "pending"))) + 1;
          } else {
            throw new Error(`Registration transaction failed. TX Hash: ${registerTx.hash}`);
          }
        } catch (error) {
          retry++;
          const msg = error.message.length > 150 ? error.message.slice(0, 150) + "..." : error.message;
          logger(`${logPrefix} | Error: ${msg} - retrying (${retry}/${MAX_RETRY}) in ${delay} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, delay * 1000));
        }
      }

      if (!domainRegistered) {
        logger(`${logPrefix} | Error: Failed to register domain after ${MAX_RETRY} retries`);
      }
    }
  }

  logger("System | Domain Mint Task completed!");
}

// New PNS domain mint task
async function performPNSDomainTask(
  logger,
  privateKeys,
  proxies,
  taskConfig,
  usedNonces
) {
  const pns = new PNSTask();
  
  // Load proxies if provided
  if (proxies && proxies.length > 0) {
    pns.proxies = proxies;
  } else if (taskConfig.useProxy) {
    await pns.loadProxies();
  }
  
  logger("System | Starting PNS Domain Task...");
  
  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const address = pns.generateAddress(privateKey);
    
    if (!address) {
      logger(`Account ${i + 1} | Error: Invalid private key`);
      continue;
    }
    
    logger(`${pns.getShortAddress(address)} | Processing PNS Domain for account ${i + 1}`);
    
    try {
      // Check proxy connection if using proxy
      if (taskConfig.useProxy) {
        const proxy = pns.getNextProxyForAccount(address);
        logger(`${pns.getShortAddress(address)} | Using proxy: ${proxy}`);
        
        const isValid = await pns.checkConnection(proxy);
        if (!isValid && taskConfig.rotateProxy) {
          logger(`${pns.getShortAddress(address)} | Warning: Proxy invalid, rotating...`);
          pns.rotateProxyForAccount(address);
        }
      }
      
      // Get provider and wallet
      const provider = await pns.getWeb3Provider(taskConfig.useProxy, address);
      const wallet = new ethers.Wallet(privateKey, provider);
      
      // Initialize nonce
      if (!usedNonces[address]) {
        usedNonces[address] = await provider.getTransactionCount(address, "pending");
      }
      
      logger(`${pns.getShortAddress(address)} | Domain:`);
      
      for (let j = 0; j < taskConfig.mintCount; j++) {
        logger(`${pns.getShortAddress(address)} | Mint ${j + 1} of ${taskConfig.mintCount}`);
        
        const domain = pns.generateDomains();
        const secret = pns.generateSecretBytes();
        
        logger(`${pns.getShortAddress(address)} | Domain: ${domain}.phrs`);
        logger(`${pns.getShortAddress(address)} | Duration: 1 Year`);
        
        // Get mint price
        let mintPrice;
        try {
          mintPrice = await pns.getMintPrice(domain, provider);
          const formattedPrice = ethers.formatEther(mintPrice);
          logger(`${pns.getShortAddress(address)} | Price: ${formattedPrice} PHRS`);
        } catch (error) {
          logger(`${pns.getShortAddress(address)} | Error: Failed to get mint price: ${error.message}`);
          continue;
        }
        
        // Check balance
        const balance = await pns.getTokenBalance(address, taskConfig.useProxy);
        logger(`${pns.getShortAddress(address)} | Balance: ${balance} PHRS`);
        
        const requiredBalance = Number(ethers.formatEther(mintPrice));
        if (Number(balance) <= requiredBalance) {
          logger(`${pns.getShortAddress(address)} | Warning: Insufficient PHRS balance`);
          break;
        }
        
        // Commit phase
        logger(`${pns.getShortAddress(address)} | Commit`);
        
        try {
          const commitHash = await pns.performCommitDomain(wallet, domain, secret);
          logger(`${pns.getShortAddress(address)} | Success: Commit Success | Confirmed: ${commitHash}`);
          usedNonces[address]++;
        } catch (error) {
          logger(`${pns.getShortAddress(address)} | Error: Commit failed: ${error.message}`);
          continue;
        }
        
        // Wait 60-65 seconds
        const waitTime = Math.floor(Math.random() * 6) + 60;
        logger(`${pns.getShortAddress(address)} | Waiting ${waitTime} seconds for registering domain...`);
        await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
        
        // Register phase
        logger(`${pns.getShortAddress(address)} | Register`);
        
        try {
          const registerHash = await pns.performRegisterDomain(wallet, domain, secret, mintPrice);
          logger(`${pns.getShortAddress(address)} | Success: Register Success | Confirmed: ${registerHash}`);
          usedNonces[address]++;
        } catch (error) {
          logger(`${pns.getShortAddress(address)} | Error: Register failed: ${error.message}`);
          continue;
        }
        
        // Delay between mints
        if (j < taskConfig.mintCount - 1) {
          const delay = Math.floor(Math.random() * (taskConfig.maxDelay - taskConfig.minDelay + 1)) + taskConfig.minDelay;
          logger(`${pns.getShortAddress(address)} | Waiting ${delay} seconds for next minting...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
      }
      
    } catch (error) {
      logger(`${pns.getShortAddress(address)} | Error: ${error.message}`);
    }
    
    // Delay between accounts
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  logger("System | PNS Domain Task completed!");
}

module.exports = { 
  performDomainMintTask,
  performPNSDomainTask 
};
