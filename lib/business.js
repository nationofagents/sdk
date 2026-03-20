const { ethers } = require('ethers');

const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com';
const MAINNET_ORACLE = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
const PCT_BASE = 1_000_000;
const ARTIFACT_URL = 'https://raw.githubusercontent.com/nationofagents/business_smart_contract/main/business-artifact.json';

let _artifactCache = null;

async function fetchArtifact() {
  if (_artifactCache) return _artifactCache;
  const res = await fetch(ARTIFACT_URL);
  if (!res.ok) throw new Error(`Failed to fetch business contract artifact: ${res.status}`);
  _artifactCache = await res.json();
  return _artifactCache;
}

class BusinessClient {
  constructor({ privateKey, contractAddress, rpcUrl, abi }) {
    if (!privateKey) throw new Error('privateKey is required');
    if (!contractAddress) throw new Error('contractAddress is required — use BusinessClient.deploy() to create a new business');
    if (!abi) throw new Error('abi is required — use BusinessClient.connect() or BusinessClient.deploy()');
    this.provider = new ethers.JsonRpcProvider(rpcUrl || DEFAULT_RPC);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.address = this.wallet.address;
    this.contractAddress = contractAddress;
    this.contract = new ethers.Contract(contractAddress, abi, this.wallet);
  }

  static async connect({ privateKey, contractAddress, rpcUrl }) {
    const { abi } = await fetchArtifact();
    return new BusinessClient({ privateKey, contractAddress, rpcUrl, abi });
  }

  static async deploy({ privateKey, tokenName, tokenSymbol, owners, initialSupply, oracle, contractText, rpcUrl }) {
    if (!privateKey) throw new Error('privateKey is required');
    if (!tokenName || !tokenSymbol) throw new Error('tokenName and tokenSymbol are required');
    if (!contractText) throw new Error('contractText is required');

    const { abi, bytecode } = await fetchArtifact();
    const provider = new ethers.JsonRpcProvider(rpcUrl || DEFAULT_RPC);
    const wallet = new ethers.Wallet(privateKey, provider);
    const ownerList = owners || [wallet.address];
    const supply = initialSupply || 1_000_000;
    const oracleAddr = oracle || MAINNET_ORACLE;

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy(tokenName, tokenSymbol, ownerList, supply, oracleAddr, contractText);
    await contract.waitForDeployment();

    const addr = await contract.getAddress();
    return new BusinessClient({ privateKey, contractAddress: addr, rpcUrl: rpcUrl || DEFAULT_RPC, abi });
  }

  // --- Read state ---

  async name() { return this.contract.name(); }
  async symbol() { return this.contract.symbol(); }
  async decimals() { return this.contract.decimals(); }
  async totalSupply() { return this.contract.totalSupply(); }
  async balanceOf(addr) { return this.contract.balanceOf(addr); }
  async treasuryBalance() { return this.contract.balanceOf(this.contractAddress); }
  async ethBalance() { return this.provider.getBalance(this.contractAddress); }

  async getBusinessOwners() { return this.contract.getBusinessOwners(); }
  async isBusinessOwner(addr) { return this.contract.isBusinessOwner(addr); }

  async getContractText() { return this.contract.business_contract_text(); }
  async getContractHash() { return this.contract.business_contract_hash(); }

  async marketInfo() {
    const [sellPct, valuationUsd, sold, remaining, priceEth] = await Promise.all([
      this.contract.market_sell_pct(),
      this.contract.market_valuation_usd(),
      this.contract.market_sold(),
      this.contract.market_remaining(),
      this.contract.token_price_eth().catch(() => 0n),
    ]);
    return { sellPct, valuationUsd, sold, remaining, priceEth, open: sellPct > 0n };
  }

  // --- Owner operations (single owner) ---

  async openMarket(sellPct, valuationUsd) {
    const tx = await this.contract.open_market(sellPct, valuationUsd);
    return tx.wait();
  }

  async closeMarket() {
    const tx = await this.contract.close_market();
    return tx.wait();
  }

  async mint(to, amount) {
    const tx = await this.contract.mint(to, amount);
    return tx.wait();
  }

  async withdrawEth(to, amount) {
    const tx = await this.contract.withdrawEth(to, amount);
    return tx.wait();
  }

  // --- Multi-owner operations ---

  async getDigest(operation, payload) {
    return this.contract.getDigest(operation, payload);
  }

  async getAddOwnerDigest(newOwner) {
    return this.contract.getDigest('add owner', ethers.AbiCoder.defaultAbiCoder().encode(['address'], [newOwner]));
  }

  async getRemoveOwnerDigest(owner) {
    return this.contract.getDigest('remove owner', ethers.AbiCoder.defaultAbiCoder().encode(['address'], [owner]));
  }

  async getUpdateContractDigest(newText) {
    return this.contract.getDigest('update', ethers.toUtf8Bytes(newText));
  }

  async signDigest(digest) {
    return this.wallet.signMessage(ethers.getBytes(digest));
  }

  async addOwner(newOwner, signatures) {
    const tx = await this.contract.addOwner(newOwner, signatures);
    return tx.wait();
  }

  async removeOwner(owner, signatures) {
    const tx = await this.contract.removeOwner(owner, signatures);
    return tx.wait();
  }

  async updateBusinessContract(newText, signatures) {
    const tx = await this.contract.updateBusinessContract(newText, signatures);
    return tx.wait();
  }

  // --- Public operations ---

  async buyToken(ethAmount, minTokensOut) {
    const tx = await this.contract.buy_token(minTokensOut || 0, { value: ethers.parseEther(ethAmount.toString()) });
    return tx.wait();
  }

  // --- ERC20 ---

  async transfer(to, amount) {
    const tx = await this.contract.transfer(to, amount);
    return tx.wait();
  }

  async approve(spender, amount) {
    const tx = await this.contract.approve(spender, amount);
    return tx.wait();
  }
}

module.exports = { BusinessClient, DEFAULT_RPC, MAINNET_ORACLE, PCT_BASE };
