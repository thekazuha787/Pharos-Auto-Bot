#!/usr/bin/env ruby

require 'eth'
require 'httparty'
require 'colorize'
require 'terminal-table'
require 'io/console'

# Constants
PHAROS_RPC = 'https://testnet.dplabs-internal.com'
WPHRS_CONTRACT = '0x76aaaDA469D23216bE5f7C596fA25F282Ff9b364'
USDT_CONTRACT = '0xD4071393f8716661958F766DF660033b3d35fD29'
API_BASE = 'https://api.pharosnetwork.xyz'
REF_CODE = 'yoHvlg6UmrQWQTpw'
TRANSFER_AMOUNT = '0.001' # ETH (PHRS) amount for transfers

# Global variables
$private_keys = []
$target_wallets = []
$account_tokens = {}

# Utility Functions
def format_log_message(msg)
  timestamp = Time.now.strftime('%H:%M:%S')
  wallet_name = msg.split('|').first&.strip || 'System'
  message = msg.split('|')[1..-1].join('|').strip

  if message.empty?
    return "[#{timestamp}] #{wallet_name.ljust(25)} | Empty log".colorize(:light_black)
  elsif message.include?('success') || message.include?('Confirmed')
    parts = message.split(/success:|Confirmed:/)
    main_msg = parts[0]&.strip || ''
    hash_part = parts[1]&.strip || ''
    "[#{timestamp}] #{wallet_name.ljust(25)} | #{main_msg} #{hash_part}".colorize(:green)
  elsif message.include?('Starting') || message.include?('Processing')
    "[#{timestamp}] #{wallet_name.ljust(25)} | #{message}".colorize(:magenta)
  elsif message.include?('Warning')
    "[#{timestamp}] #{wallet_name.ljust(25)} | #{message}".colorize(:yellow)
  elsif message.include?('Error') || message.include?('failed')
    "[#{timestamp}] #{wallet_name.ljust(25)} | #{message}".colorize(:red)
  else
    "[#{timestamp}] #{wallet_name.ljust(25)} | #{message}".colorize(:light_black)
  end
end

def log(message)
  puts format_log_message(message)
end

def load_private_keys
  if File.exist?('wallets.txt')
    $private_keys = File.readlines('wallets.txt').map do |key|
      key = key.strip
      key.start_with?('0x') ? key : "0x#{key}"
    end.select { |key| key.length == 66 }
    $private_keys.empty? ? false : true
  else
    false
  end
rescue StandardError => e
  log("System | Error: Failed to load wallets.txt: #{e.message}")
  false
end

def load_target_wallets
  if File.exist?('wallet.txt')
    $target_wallets = File.readlines('wallet.txt').map do |addr|
      addr.strip if Eth::Address.new(addr.strip).valid?
    end.compact
  else
    $target_wallets = []
  end
rescue StandardError => e
  log("System | Error: Failed to load wallet.txt: #{e.message}")
end

def get_short_address(address)
  address ? "#{address[0..5]}...#{address[-4..-1]}" : 'N/A'
end

# Blockchain Setup
def get_client
  Eth::Client.create(PHAROS_RPC)
rescue StandardError => e
  log("System | Error: Failed to connect to RPC: #{e.message}")
  nil
end

# Balance Check
def get_balances(address, client)
  phrs_balance = client.get_balance(address) / 10**18
  wphrs_contract = Eth::Contract.from_abi(
    name: 'ERC20',
    address: WPHRS_CONTRACT,
    abi: [
      { 'constant': true, 'inputs': [{ 'name': 'owner', 'type': 'address' }],
        'name': 'balanceOf', 'outputs': [{ 'name': '', 'type': 'uint256' }], 'type': 'function' },
      { 'constant': true, 'inputs': [], 'name': 'decimals', 'outputs': [{ 'name': '', 'type': 'uint8' }], 'type': 'function' }
    ]
  )
  usdt_contract = Eth::Contract.from_abi(
    name: 'ERC20',
    address: USDT_CONTRACT,
    abi: wphrs_contract.abi
  )

  wphrs_balance = client.call(wphrs_contract, 'balanceOf', address) / 10**18
  usdt_balance = client.call(usdt_contract, 'balanceOf', address) / 10**6

  { 'PHRS' => format_number(phrs_balance, 4), 'WPHRS' => format_number(wphrs_balance, 4), 'USDT' => format_number(usdt_balance, 4) }
rescue StandardError => e
  log("#{get_short_address(address)} | Error: Failed to fetch balances: #{e.message}")
  { 'PHRS' => '0', 'WPHRS' => '0', 'USDT' => '0' }
end

def format_number(num, decimals = 4)
  format("%.#{decimals}f", num)
end

# Transfer PHRS
def perform_transfers
  return log('System | Warning: No target wallets loaded for transfers') if $target_wallets.empty?

  log('System | Starting Transfers...')
  client
