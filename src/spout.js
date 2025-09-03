const { ethers } = require('ethers');
const axios = require('axios');

// Pharos Testnet configuration
const RPC_URL = "https://testnet.dplabs-internal.com";
const CHAIN_ID = 688688;
const KYC_API_URL = "https://www.spout.finance/api/kyc-signature";

// Contract addresses
const IDENTITY_FACTORY_CONTRACT = "0x18cB5F2774a80121d1067007933285B32516226a";
const GATEWAY_CONTRACT = "0x126F0c11F3e5EafE37AB143D4AA688429ef7DCB3";
const ORDERS_CONTRACT = "0x81b33972f8bdf14fD7968aC99CAc59BcaB7f4E9A";
const USDC_CONTRACT = "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED";
const RWA_TOKEN_CONTRACT = "0x54b753555853ce22f66Ac8CB8e324EB607C4e4eE";

// ABIs
const IDENTITY_FACTORY_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_wallet", "type": "address" },
            { "internalType": "string", "name": "_salt", "type": "string" }
        ],
        "name": "createIdentity",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_wallet", "type": "address" }],
        "name": "getIdentity",
        "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    }
];

const IDENTITY_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "_topic", "type": "uint256" },
            { "internalType": "uint256", "name": "_scheme", "type": "uint256" },
            { "internalType": "address", "name": "_issuer", "type": "address" },
            { "internalType": "bytes", "name": "_signature", "type": "bytes" },
            { "internalType": "bytes", "name": "_data", "type": "bytes" },
            { "internalType": "string", "name": "_uri", "type": "string" }
        ],
        "name": "addClaim",
        "outputs": [{ "internalType": "bytes32", "name": "claimRequestId", "type": "bytes32" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "uint256", "name": "_topic", "type": "uint256" }],
        "name": "getClaimIdsByTopic",
        "outputs": [{ "internalType": "bytes32[]", "name": "claimIds", "type": "bytes32[]" }],
        "stateMutability": "view",
        "type": "function"
    }
];

const USDC_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_spender", "type": "address" },
            { "internalType": "uint256", "name": "_value", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    }
];

const RWA_TOKEN_ABI = [
    {
        "inputs": [
            { "internalType": "address", "name": "_spender", "type": "address" },
            { "internalType": "uint256", "name": "_value", "type": "uint256" }
        ],
        "name": "approve",
        "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "internalType": "address", "name": "_owner", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "internalType": "uint256", "name": "balance", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    }
];

const ORDERS_ABI = [
    {
        "inputs": [
            { "internalType": "uint256", "name": "adfsFeedId", "type": "uint256" },
            { "internalType": "string", "name": "ticker", "type": "string" },
            { "internalType": "address", "name": "token", "type": "address" },
            { "internalType": "uint256", "name": "usdcAmount", "type": "uint256" }
        ],
        "name": "buyAsset",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "feedId", "type": "uint256" },
            { "internalType": "string", "name": "ticker", "type": "string" },
            { "internalType": "address", "name": "token", "type": "address" },
            { "internalType": "uint256", "name": "tokenAmount", "type": "uint256" }
        ],
        "name": "sellAsset",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

function getShortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

function getWeb3Provider() {
    return new ethers.JsonRpcProvider(RPC_URL);
}

async function getKYCSignature(userAddress, onchainId, logger) {
    const payload = {
        userAddress,
        onchainIDAddress: onchainId,
        claimData: "KYC passed",
        topic: 1,
        countryCode: 91
    };

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    try {
        const response = await axios.post(KYC_API_URL, payload, { headers, timeout: 30000 });
        if (response.status === 200) {
            return response.data;
        } else {
            logger(`${getShortAddress(userAddress)} | Warning: KYC API error: ${response.status}, using fallback`);
            return getFallbackKYCData();
        }
    } catch (error) {
        logger(`${getShortAddress(userAddress)} | Warning: Using fallback KYC data: ${error.message}`);
        return getFallbackKYCData();
    }
}

function getFallbackKYCData() {
    return {
        signature: {
            r: "0xb2e2622d765ed8c5ba78ffa490cecd95693571031b3954ca429925e69ed15f57",
            s: "0x614a040deef613d026382a9f745ff13963a75ff8a6f4032b177350a25364f8c4",
            v: 28
        },
        issuerAddress: "0x92b9baA72387Fb845D8Fe88d2a14113F9cb2C4E7",
        dataHash: "0x7de3cf25b2741629c9158f89f92258972961d4357b9f027487765f655caec367",
        topic: 1
    };
}

async function createIdentity(wallet, logger) {
    try {
        const contract = new ethers.Contract(IDENTITY_FACTORY_CONTRACT, IDENTITY_FACTORY_ABI, wallet);
        const salt = `wallet_${wallet.address.toLowerCase()}_${Math.floor(Date.now() / 1000)}`;
        
        logger(`${getShortAddress(wallet.address)} | Creating identity with salt: ${salt}`);

        const tx = await contract.createIdentity(wallet.address, salt, {
            gasLimit: 1000000,
            gasPrice: ethers.parseUnits('1.25', 'gwei')
        });

        logger(`${getShortAddress(wallet.address)} | Identity creation tx: ${tx.hash}`);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            logger(`${getShortAddress(wallet.address)} | Success: Identity created | Confirmed: ${tx.hash}`);
            return receipt;
        } else {
            logger(`${getShortAddress(wallet.address)} | Error: Identity creation failed`);
            return null;
        }
    } catch (error) {
        logger(`${getShortAddress(wallet.address)} | Error: Creating identity: ${error.message}`);
        return null;
    }
}

async function getOnchainId(provider, walletAddress) {
    try {
        const contract = new ethers.Contract(IDENTITY_FACTORY_CONTRACT, IDENTITY_FACTORY_ABI, provider);
        const result = await contract.getIdentity(walletAddress);
        if (result && result !== ethers.ZeroAddress) {
            return result;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function addClaim(wallet, onchainId, kycResponse, logger) {
    try {
        const contract = new ethers.Contract(onchainId, IDENTITY_ABI, wallet);

        const { signature, issuerAddress, dataHash, topic } = kycResponse;
        const { r, s, v } = signature;

        const rHex = r.startsWith('0x') ? r.slice(2) : r;
        const sHex = s.startsWith('0x') ? s.slice(2) : s;
        const rPadded = rHex.padStart(64, '0');
        const sPadded = sHex.padStart(64, '0');
        const fullSignature = `0x${rPadded}${sPadded}${v.toString(16).padStart(2, '0')}`;
        const dataBytes = ethers.hexDataSlice(dataHash, 0);

        logger(`${getShortAddress(wallet.address)} | Adding KYC claim to identity: ${onchainId}`);

        const tx = await contract.addClaim(
            topic,
            1,
            issuerAddress,
            fullSignature,
            dataBytes,
            "",
            {
                gasLimit: 800000,
                gasPrice: ethers.parseUnits('1.25', 'gwei')
            }
        );

        logger(`${getShortAddress(wallet.address)} | KYC claim tx: ${tx.hash}`);
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            logger(`${getShortAddress(wallet.address)} | Success: KYC claim added | Confirmed: ${tx.hash}`);
            return receipt;
        } else {
            logger(`${getShortAddress(wallet.address)} | Error: KYC claim addition failed`);
            return null;
        }
    } catch (error) {
        logger(`${getShortAddress(wallet.address)} | Error: Adding claim: ${error.message}`);
        return null;
    }
}

async function performKYCProcess(wallet, provider, logger) {
    const address = wallet.address;
    
    let onchainId = await getOnchainId(provider, address);
    if (onchainId) {
        logger(`${getShortAddress(address)} | Success: Identity already exists: ${onchainId}`);
    } else {
        logger(`${getShortAddress(address)} | Creating new identity`);
        const receipt = await createIdentity(wallet, logger);
        if (!receipt) return false;

        await new Promise(resolve => setTimeout(resolve, 3000));
        onchainId = await getOnchainId(provider, address);
        if (!onchainId) {
            logger(`${getShortAddress(address)} | Error: Identity creation verification failed`);
            return false;
        }
    }

    logger(`${getShortAddress(address)} | Getting KYC signature`);
    const kycResponse = await getKYCSignature(address, onchainId, logger);

    try {
        const contract = new ethers.Contract(onchainId, IDENTITY_ABI, provider);
        const existingClaims = await contract.getClaimIdsByTopic(kycResponse.topic);
        if (existingClaims.length > 0) {
            logger(`${getShortAddress(address)} | Success: KYC claim already exists`);
            return true;
        }
    } catch (error) {
        logger(`${getShortAddress(address)} | Warning: Error checking existing claims: ${error.message}`);
    }

    logger(`${getShortAddress(address)} | Adding KYC claim`);
    await addClaim(wallet, onchainId, kycResponse, logger);
    
    return true;
}

async function buyTokens(wallet, provider, amount, logger) {
    const address = wallet.address;
    
    try {
        const usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, wallet);
        const usdcBalance = await usdcContract.balanceOf(address);
        const usdcDecimals = await usdcContract.decimals();
        const usdcBalanceFormatted = Number(ethers.formatUnits(usdcBalance, usdcDecimals));

        logger(`${getShortAddress(address)} | USDC Balance: ${usdcBalanceFormatted.toFixed(2)} USDC`);

        if (usdcBalanceFormatted < amount) {
            logger(`${getShortAddress(address)} | Error: Insufficient USDC balance for ${amount} USDC`);
            return false;
        }

        // Check KYC status
        const existingId = await getOnchainId(provider, address);
        if (!existingId) {
            logger(`${getShortAddress(address)} | Error: No identity found - complete KYC first`);
            return false;
        }

        const identityContract = new ethers.Contract(existingId, IDENTITY_ABI, provider);
        const existingClaims = await identityContract.getClaimIdsByTopic(1);
        if (existingClaims.length === 0) {
            logger(`${getShortAddress(address)} | Error: No KYC claim found - complete KYC first`);
            return false;
        }

        const usdcAmountWei = ethers.parseUnits(amount.toString(), usdcDecimals);
        
        // Reset allowance
        logger(`${getShortAddress(address)} | Resetting USDC allowance`);
        const resetTx = await usdcContract.approve(ORDERS_CONTRACT, 0, {
            gasLimit: 100000,
            gasPrice: ethers.parseUnits('1.25', 'gwei')
        });
        await resetTx.wait();

        // Approve
        logger(`${getShortAddress(address)} | Approving USDC spending`);
        const approveTx = await usdcContract.approve(ORDERS_CONTRACT, usdcAmountWei, {
            gasLimit: 100000,
            gasPrice: ethers.parseUnits('1.25', 'gwei')
        });
        logger(`${getShortAddress(address)} | Approval tx: ${approveTx.hash}`);
        await approveTx.wait();

        // Buy tokens
        logger(`${getShortAddress(address)} | Buying ${amount} USDC worth of RWA tokens`);
        const ordersContract = new ethers.Contract(ORDERS_CONTRACT, ORDERS_ABI, wallet);
        const feedIds = [2000002, 2000001];
        
        for (const feedId of feedIds) {
            try {
                const buyTx = await ordersContract.buyAsset(
                    feedId,
                    "LQD",
                    RWA_TOKEN_CONTRACT,
                    usdcAmountWei,
                    {
                        gasLimit: 800000,
                        gasPrice: ethers.parseUnits('1.25', 'gwei')
                    }
                );

                logger(`${getShortAddress(address)} | Buy tx: ${buyTx.hash}`);
                const receipt = await buyTx.wait();

                if (receipt.status === 1) {
                    logger(`${getShortAddress(address)} | Success: Bought RWA tokens | Confirmed: ${buyTx.hash}`);
                    return true;
                }
            } catch (buyError) {
                logger(`${getShortAddress(address)} | Warning: Buy failed with feedId ${feedId}: ${buyError.message}`);
            }
        }

        logger(`${getShortAddress(address)} | Error: All buy attempts failed`);
        return false;
    } catch (error) {
        logger(`${getShortAddress(address)} | Error: Buy tokens failed: ${error.message}`);
        return false;
    }
}

async function sellTokens(wallet, provider, amount, logger) {
    const address = wallet.address;
    
    try {
        const rwaContract = new ethers.Contract(RWA_TOKEN_CONTRACT, RWA_TOKEN_ABI, wallet);
        const tokenBalance = await rwaContract.balanceOf(address);
        const tokenDecimals = await rwaContract.decimals();
        const tokenBalanceFormatted = Number(ethers.formatUnits(tokenBalance, tokenDecimals));

        logger(`${getShortAddress(address)} | RWA Token Balance: ${tokenBalanceFormatted.toFixed(4)} LQD`);

        if (tokenBalanceFormatted < amount) {
            logger(`${getShortAddress(address)} | Error: Insufficient token balance for ${amount} LQD`);
            return false;
        }

        // Check KYC status
        const existingId = await getOnchainId(provider, address);
        if (!existingId) {
            logger(`${getShortAddress(address)} | Error: No identity found - complete KYC first`);
            return false;
        }

        const tokenAmountWei = ethers.parseUnits(amount.toString(), tokenDecimals);
        
        // Reset allowance
        logger(`${getShortAddress(address)} | Resetting token allowance`);
        const resetTx = await rwaContract.approve(ORDERS_CONTRACT, 0, {
            gasLimit: 100000,
            gasPrice: ethers.parseUnits('1.25', 'gwei')
        });
        await resetTx.wait();

        // Approve
        logger(`${getShortAddress(address)} | Approving token spending`);
        const approveTx = await rwaContract.approve(ORDERS_CONTRACT, tokenAmountWei, {
            gasLimit: 100000,
            gasPrice: ethers.parseUnits('1.25', 'gwei')
        });
        logger(`${getShortAddress(address)} | Approval tx: ${approveTx.hash}`);
        await approveTx.wait();

        // Sell tokens
        logger(`${getShortAddress(address)} | Selling ${amount} RWA tokens`);
        const ordersContract = new ethers.Contract(ORDERS_CONTRACT, ORDERS_ABI, wallet);
        const feedIds = [2000002, 2000001];
        
        for (const feedId of feedIds) {
            try {
                const sellTx = await ordersContract.sellAsset(
                    feedId,
                    "LQD",
                    RWA_TOKEN_CONTRACT,
                    tokenAmountWei,
                    {
                        gasLimit: 800000,
                        gasPrice: ethers.parseUnits('1.25', 'gwei')
                    }
                );

                logger(`${getShortAddress(address)} | Sell tx: ${sellTx.hash}`);
                const receipt = await sellTx.wait();

                if (receipt.status === 1) {
                    logger(`${getShortAddress(address)} | Success: Sold RWA tokens | Confirmed: ${sellTx.hash}`);
                    return true;
                }
            } catch (sellError) {
                logger(`${getShortAddress(address)} | Warning: Sell failed with feedId ${feedId}: ${sellError.message}`);
            }
        }

        logger(`${getShortAddress(address)} | Error: All sell attempts failed`);
        return false;
    } catch (error) {
        logger(`${getShortAddress(address)} | Error: Sell tokens failed: ${error.message}`);
        return false;
    }
}

async function performSpoutTask(
    logger,
    privateKeys,
    proxies,
    transactionCount,
    minAmount,
    maxAmount,
    minDelay,
    maxDelay,
    enableKyc,
    enableBuy,
    enableSell,
    usedNonces
) {
    logger("System | Starting Spout Task...");
    
    const provider = getWeb3Provider();
    
    // Process KYC for all accounts if enabled
    if (enableKyc) {
        logger("System | Processing KYC for all accounts...");
        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            const wallet = new ethers.Wallet(privateKey, provider);
            
            logger(`${getShortAddress(wallet.address)} | Processing KYC for account ${i + 1}`);
            
            const balance = await provider.getBalance(wallet.address);
            const balanceEth = ethers.formatEther(balance);
            logger(`${getShortAddress(wallet.address)} | Balance: ${balanceEth} PHRS`);
            
            if (balance === 0n) {
                logger(`${getShortAddress(wallet.address)} | Error: No balance, skipping KYC`);
                continue;
            }
            
            await performKYCProcess(wallet, provider, logger);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        logger("System | KYC process completed for all accounts");
    }
    
    // Process buy/sell transactions
    for (let txNum = 1; txNum <= transactionCount; txNum++) {
        logger(`System | Starting transaction round ${txNum}/${transactionCount}`);
        
        const randomAmount = parseFloat((Math.random() * (maxAmount - minAmount) + minAmount).toFixed(2));
        const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        
        logger(`System | Transaction ${txNum}: Amount: ${randomAmount}, Next delay: ${randomDelay}s`);
        
        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            const wallet = new ethers.Wallet(privateKey, provider);
            
            logger(`${getShortAddress(wallet.address)} | Processing account ${i + 1}/${privateKeys.length}`);
            
            // Buy tokens if enabled
            if (enableBuy) {
                logger(`${getShortAddress(wallet.address)} | Processing buy transaction ${txNum}`);
                await buyTokens(wallet, provider, randomAmount, logger);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Sell tokens if enabled
            if (enableSell) {
                logger(`${getShortAddress(wallet.address)} | Processing sell transaction ${txNum}`);
                await sellTokens(wallet, provider, randomAmount, logger);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        if (txNum < transactionCount) {
            logger(`System | Waiting ${randomDelay} seconds before next transaction round`);
            await new Promise(resolve => setTimeout(resolve, randomDelay * 1000));
        }
    }
    
    logger("System | Spout Task completed!");
}

module.exports = { performSpoutTask };
