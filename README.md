# Pharos Auto Bot

![Node.js](https://img.shields.io/badge/Node.js-v16.0+-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-5.0-orange)
![GitHub Issues](https://img.shields.io/github/issues/thekazuha787/Pharos-Auto-Bot)
![GitHub Stars](https://img.shields.io/github/stars/thekazuha787/Pharos-Auto-Bot)

**Pharos Auto Bot** is an advanced automation tool for the Pharos Testnet (Chain ID: 688688), designed to streamline blockchain interactions. It supports a wide range of tasks including daily sign-ins, faucet claims, token transfers, wrapping/unwrapping PHRS to WPHRS, token swaps, liquidity provision, NFT minting, and specialized tasks like AquaFlux minting, Faroswap, AutoStaking, PNS domain minting, OpenFi, CFD trading, Spout, Bitverse, and R2 activities. Built with Node.js and `ethers.js`, it features a user-friendly CLI with colorful logging via `chalk` and robust error handling.

**"LETS FUCK THIS TESTNET"** - Kazuha787

## Table of Contents
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Available Tasks](#available-tasks)
- [Directory Structure](#directory-structure)
- [Contributing](#contributing)
- [License](#license)
- [Disclaimer](#disclaimer)

## Features
- **Multi-Wallet Automation**: Manage multiple accounts using private keys from `wallets.txt`.
- **Task Variety**:
  - Daily sign-ins and faucet claims.
  - Transfer PHRS to target wallets.
  - Wrap/unwrap PHRS to WPHRS.
  - Swap tokens (WPHRS ↔ USDT).
  - Add liquidity to pools (e.g., USDT/WPHRS).
  - Mint NFTs like Pharos Octopus Badge, FaroSwap Captain Dolphin, and more.
  - Advanced tasks: AquaFlux, Faroswap, AutoStaking, PNS, OpenFi, CFD, Spout, Bitverse, and R2.
- **Customizable Settings**: Adjust transaction counts, delays, amounts, and proxy options.
- **Error Handling**: Retries for `TX_REPLAY_ATTACK` and detailed error logging.
- **Proxy Support**: Optional proxy usage and rotation for tasks like AutoStaking, PNS, Bitverse, and R2.
- **Interactive CLI**: Menu-driven interface with ASCII banner for task selection and configuration.
- **Logging**: Color-coded logs with timestamps for easy tracking.

## Prerequisites
- **Node.js**: v16.0 or higher.
- **Git**: For cloning the repository.
- **Pharos Testnet RPC**: `https://testnet.dplabs-internal.com` (Chain ID: 688688).
- **Wallets**: Private keys in `wallets.txt` (Ethereum-compatible, with or without `0x` prefix).
- **Target Wallets**: Optional addresses in `wallet.txt` for transfers.
- **Dependencies**: Listed in `package.json` (e.g., `ethers`, `chalk`, `axios`).

## Installation
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/thekazuha787/Pharos-Auto-Bot.git
   cd Pharos-Auto-Bot
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```
   Installs `chalk`, `ethers`, `fs`, `cli-table3`, `axios`, `readline`, `crypto`, and others.

3. **Set Up Wallet Files**:
   - Create `wallets.txt` in the root directory with one private key per line:
     ```text
     0xYourPrivateKey1
     0xYourPrivateKey2
     ```
   - Optionally, create `wallet.txt` for target wallet addresses:
     ```text
     0xTargetAddress1
     0xTargetAddress2
     ```

## Configuration
Customize task parameters via the "Set Transaction Count" menu or by editing the `global` object in `index.js`. Key settings:
- `maxTransaction`: Transactions per task (default: 5).
- `aquaFluxMintCount`: AquaFlux mints (default: 1).
- `tipCount` and `tipUsername`: For PrimusLab tips.
- `faroswapTxCount`, `autoStakingTxCount`, `pnsMintCount`, `openFiTxCount`, `cfdTxCount`, `spoutTxCount`, `bitverseTradeCount`, `r2SwapCount`, `r2EarnCount`: Transaction counts for tasks.
- Delays: `minDelay` and `maxDelay` for AutoStaking, PNS, Spout, Bitverse, and R2.
- Proxy: `useProxy` and `rotateProxy` for supported tasks.
- Amounts: Configurable for AutoStaking (USDC/USDT/MockUSD), Spout (USDC/LQD), Bitverse (USDT), and R2 (USDC/R2USD).

## Usage
1. **Run the Script**:
   ```bash
   node index.js
   ```
   Displays an ASCII banner and task menu.

2. **Select Tasks**:
   - Enter numbers (1–23) to choose tasks like "Daily Sign-In" or "Run All Activities".
   - Use "Set Transaction Count" to adjust settings interactively.
   - Press Enter to return to the menu after tasks.

3. **Example**:
   - Select `1` for daily sign-ins across all wallets.
   - Select `13` for PNS domain minting with custom delays.
   - Select `21` to run all tasks sequentially.

## Available Tasks
| #  | Task | Description |
|----|------|-------------|
| 1  | Daily Sign-In | Signs in all accounts. |
| 2  | Claim Faucet | Claims daily faucet tokens. |
| 3  | Send PHRS to Friends | Transfers 0.001 PHRS to random targets. |
| 4  | Wrap PHRS to WPHRS | Wraps 0.0001 PHRS per transaction. |
| 5  | Unwrap WPHRS to PHRS | Unwraps 0.0001 WPHRS per transaction. |
| 6  | Swap Tokens | Swaps WPHRS ↔ USDT (0.0001 WPHRS or 0.45 USDT). |
| 7  | Add Liquidity | Adds liquidity to USDT/WPHRS pools. |
| 8  | AquaFlux Mint | Mints AquaFlux NFTs. |
| 9  | Send Tip (PrimusLab) | Sends tips to an X username. |
| 10 | Faroswap Task | Executes Faroswap transactions. |
| 11 | AutoStaking Task | Stakes USDC/USDT/MockUSD with configurable amounts. |
| 12 | Domain Mint Task | Mints domain NFTs. |
| 13 | PNS Domain Task | Mints PNS domains with delay and proxy options. |
| 14 | OpenFi Task | Performs OpenFi transactions. |
| 15 | CFD Trading Task | Executes CFD trading tasks. |
| 16 | Spout Task | Performs buy/sell with KYC support. |
| 17 | Bitverse Task | Handles deposit, withdraw, or trade actions. |
| 18 | R2 Task | Performs swaps or earn transactions. |
| 19 | Check Status | Displays account status. |
| 20 | Display All Accounts | Shows PHRS, WPHRS, USDT balances. |
| 21 | Run All Activities | Executes all tasks for each account. |
| 22 | Mint NFTs | Mints NFTs (e.g., Pharos Octopus Badge). |
| 23 | Set Transaction Count | Configures transaction counts, delays, and proxies. |

## Directory Structure
```
Pharos-Auto-Bot/
├── src/
│   ├── aquaflux.js
│   ├── primuslab.js
│   ├── faroswap.js
│   ├── autoStaking.js
│   ├── openfi.js
│   ├── status.js
│   ├── cfd.js
│   ├── spout.js
│   ├── bit.js
│   ├── r2.js
│   ├── domain.js
│   └── ... (other modules)
├── wallets.txt        # Private keys
├── wallet.txt         # Target addresses (optional)
├── index.js           # Main script
├── package.json       # Dependencies
└── README.md          # Documentation
```

## Contributing
1. Fork the repo.
2. Create a feature branch: `git checkout -b feature/YourFeature`.
3. Commit changes: `git commit -m "Add YourFeature"`.
4. Push: `git push origin feature/YourFeature`.
5. Open a pull request.

Ensure code aligns with the existing style and includes tests.

## License
MIT License. See [LICENSE](LICENSE) for details.

## Disclaimer
For educational and testing purposes on the Pharos Testnet only. Use at your own risk. The author is not liable for any losses or damages.

---
*Created by [thekazuha787](https://github.com/thekazuha787)*
