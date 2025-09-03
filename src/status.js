#!/usr/bin/env node

const fs = require('fs').promises;
const axios = require('axios');

class WalletManager {
  constructor(walletFile = 'wallets.txt') {
    this.walletFile = walletFile;
    this.wallets = [];
  }

  async loadWallets() {
    try {
      if (!(await fs.access(this.walletFile).then(() => true).catch(() => false))) {
        console.log(`File ${this.walletFile} not found. Creating example file...`);
        await this.createExampleWalletFile();
        return [];
      }

      const data = await fs.readFile(this.walletFile, 'utf-8');
      const lines = data.split('\n').map(line => line.trim());
      const wallets = [];

      for (let [lineNum, line] of lines.entries()) {
        if (line && !line.startsWith('#')) {
          if (this.isValidAddress(line)) {
            wallets.push(line);
          } else {
            console.log(`Invalid wallet address in line ${lineNum + 1}: ${line}`);
          }
        }
      }

      this.wallets = wallets;
      if (wallets.length === 0) {
        console.log('No valid wallets found in wallets.txt. Please add valid Ethereum addresses.');
      }
      return wallets;
    } catch (error) {
      console.log(`Error loading wallets: ${error.message}`);
      return [];
    }
  }

  async createExampleWalletFile() {
    const exampleContent = `# Ethereum wallet addresses (one per line)\n# Example:\n# 0x1234567890123456789012345678901234567890\n# 0xabcdefabcdefabcdefabcdefabcdefabcdefabcd\n\n# Add your wallet addresses below:\n`;
    try {
      await fs.writeFile(this.walletFile, exampleContent);
      console.log(`Created file ${this.walletFile}. Add wallet addresses to it.`);
    } catch (error) {
      console.log(`Error creating wallet file: ${error.message}`);
    }
  }

  isValidAddress(address) {
    return typeof address === 'string' &&
           address.length === 42 &&
           address.startsWith('0x') &&
           /^[0-9a-fA-F]{40}$/.test(address.slice(2));
  }
}

class PharosAPIClient {
  static API_BASE = 'https://api.pharosnetwork.xyz';
  static BEARER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODA5MTQ3NjEsImlhdCI6MTc0OTM3ODc2MSwic3ViIjoiMHgyNkIxMzVBQjFkNjg3Mjk2N0I1YjJjNTcwOWNhMkI1RERiREUxMDZGIn0.k1JtNw2w67q7lw1kFHmSXxapUS4GpBwXdZH3ByVMFfg';

  constructor() {
    this.axiosInstance = axios.create({
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Authorization': `Bearer ${PharosAPIClient.BEARER_TOKEN}`,
        'Origin': 'https://testnet.pharosnetwork.xyz',
        'Referer': 'https://testnet.pharosnetwork.xyz/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
  }

  async getUserData(walletAddress) {
    try {
      const profileUrl = `${PharosAPIClient.API_BASE}/user/profile`;
      const tasksUrl = `${PharosAPIClient.API_BASE}/user/tasks`;

      const [profileResponse, tasksResponse] = await Promise.all([
        this.makeRequest(profileUrl, { address: walletAddress }),
        this.makeRequest(tasksUrl, { address: walletAddress })
      ]);

      if (!profileResponse || !tasksResponse) {
        return {
          success: false,
          error: 'Failed to get data from API',
          address: walletAddress
        };
      }

      return this.processApiResponse(profileResponse, tasksResponse, walletAddress);
    } catch (error) {
      return {
        success: false,
        error: `API Error: ${error.message}`,
        address: walletAddress
      };
    }
  }

  async makeRequest(url, params, timeout = 10000) {
    try {
      const response = await this.axiosInstance.get(url, {
        params,
        timeout
      });

      if (response.status === 200) {
        return response.data;
      } else {
        console.log(`HTTP ${response.status} for ${url}`);
        return null;
      }
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log(`Request timeout to ${url}`);
      } else {
        console.log(`Request error to ${url}: ${error.message}`);
      }
      return null;
    }
  }

  processApiResponse(profileData, tasksData, walletAddress) {
    try {
      if (profileData.code !== 0) {
        let errorMsg = profileData.msg || 'Unknown error';
        if (errorMsg.includes('get user info failed')) {
          errorMsg = 'Wallet not registered in Pharos Network';
        }
        return {
          success: false,
          error: errorMsg,
          address: walletAddress
        };
      }

      const profile = profileData.data?.user_info || {};
      const totalPoints = profile.TotalPoints || 0;
      const currentLevel = this.calculateLevel(totalPoints);

      let taskCounts;
      if (tasksData.code !== 0) {
        taskCounts = {
          send_count: 0, swap_count: 0, lp_count: 0, social_tasks: 0,
          mint_domain: 0, mint_nft: 0, faroswap_lp: 0, faroswap_swaps: 0,
          primuslabs_send: 0, rwafi: 0, stake: 0, fiamma_bridge: 0, brokex: 0
        };
      } else {
        taskCounts = this.parseTaskData(tasksData.data?.user_tasks || []);
      }

      return {
        success: true,
        address: walletAddress,
        total_points: totalPoints,
        current_level: currentLevel,
        send_count: taskCounts.send_count,
        swap_count: taskCounts.swap_count,
        lp_count: taskCounts.lp_count,
        social_tasks: taskCounts.social_tasks,
        mint_domain: taskCounts.mint_domain,
        mint_nft: taskCounts.mint_nft,
        faroswap_lp: taskCounts.faroswap_lp,
        faroswap_swaps: taskCounts.faroswap_swaps,
        primuslabs_send: taskCounts.primuslabs_send,
        rwafi: taskCounts.rwafi,
        stake: taskCounts.stake,
        fiamma_bridge: taskCounts.fiamma_bridge,
        brokex: taskCounts.brokex,
        member_since: profile.CreateTime,
        rank: null
      };
    } catch (error) {
      return {
        success: false,
        error: `Data processing error: ${error.message}`,
        address: walletAddress
      };
    }
  }

  parseTaskData(userTasks) {
    const taskCounts = {
      send_count: 0, swap_count: 0, lp_count: 0, social_tasks: 0,
      mint_domain: 0, mint_nft: 0, faroswap_lp: 0, faroswap_swaps: 0,
      primuslabs_send: 0, rwafi: 0, stake: 0, fiamma_bridge: 0, brokex: 0
    };

    const taskIdMapping = {
      103: 'send_count',
      101: 'swap_count',
      102: 'lp_count',
      107: 'faroswap_swaps',
      106: 'faroswap_lp',
      105: 'mint_nft',
      104: 'mint_domain',
      108: 'primuslabs_send',
      112: 'rwafi',
      110: 'stake',
      111: 'brokex',
      113: 'fiamma_bridge',
      201: 'social_tasks',
      202: 'swap_count',
      203: 'lp_count',
      109: 'rwafi',
      114: 'rwafi'
    };

    for (const task of userTasks) {
      const taskId = task.TaskId || 0;
      const completeTimes = task.CompleteTimes || 0;
      const taskType = taskIdMapping[taskId];
      if (taskType) {
        taskCounts[taskType] += completeTimes;
      }
    }

    return taskCounts;
  }

  calculateLevel(totalPoints) {
    if (totalPoints >= 10000) return 5;
    if (totalPoints >= 5000) return 4;
    if (totalPoints >= 2000) return 3;
    if (totalPoints >= 500) return 2;
    return 1;
  }
}

class PharosChecker {
  constructor() {
    this.walletManager = new WalletManager();
    this.apiClient = new PharosAPIClient();
  }

  async checkWallets(maxWorkers = 5) {
    await this.walletManager.loadWallets();

    const wallets = this.walletManager.wallets;
    if (!wallets.length) {
      console.log('No wallets to check. Add addresses to wallets.txt');
      return;
    }

    console.log(`Starting check of ${wallets.length} wallets...`);
    console.log('='.repeat(80));

    const results = [];
    const chunks = [];
    for (let i = 0; i < wallets.length; i += maxWorkers) {
      chunks.push(wallets.slice(i, i + maxWorkers));
    }

    for (let [index, chunk] of chunks.entries()) {
      const promises = chunk.map((wallet, i) => {
        return this.apiClient.getUserData(wallet).then(result => {
          console.log(`Processed wallet ${index * maxWorkers + i + 1}/${wallets.length}: ${wallet.slice(0, 10)}...`);
          return result;
        });
      });

      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);

      // Random delay between chunks
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
    }

    console.log('\n' + '='.repeat(80));
    this.displayResults(results);
  }

  displayResults(results) {
    for (const result of results) {
      if (result.success) {
        console.log('\nWALLET CHECK RESULTS');
        console.log('='.repeat(80));
        console.log(`Wallet Address: ${result.address}`);
        console.log(`Points: ${result.total_points}`);
        console.log(`Level: ${result.current_level}`);
        console.log(`Member Since: ${result.member_since ? result.member_since.slice(0, 10) : 'N/A'}`);
        console.log('\nDETAILED TRANSACTION INFORMATION');
        console.log('='.repeat(80));
        console.log(`Send Transactions: ${result.send_count}`);
        console.log(`Zenith Swap Transactions: ${result.swap_count}`);
        console.log(`Zenith LP Transactions: ${result.lp_count}`);
        console.log(`Mint Domain: ${result.mint_domain}`);
        console.log(`Mint NFT: ${result.mint_nft}`);
        console.log(`FaroSwap LP: ${result.faroswap_lp}`);
        console.log(`FaroSwap Swaps: ${result.faroswap_swaps}`);
        console.log(`PrimusLabs Send: ${result.primuslabs_send}`);
        console.log(`RWAfi: ${result.rwafi}`);
        console.log(`Stake: ${result.stake}`);
        console.log(`Fiamma Bridge: ${result.fiamma_bridge}`);
        console.log(`BrokeX: ${result.brokex}`);
      } else {
        console.log(`\nERROR for ${result.address}: ${result.error}`);
        console.log('='.repeat(80));
      }
    }
  }
}

async function runStatusCheck() {
  const checker = new PharosChecker();
  await checker.checkWallets();
}

module.exports = { runStatusCheck };

if (require.main === module) {
  runStatusCheck().catch(err => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
