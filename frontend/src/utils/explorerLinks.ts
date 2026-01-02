/**
 * Utility functions to generate block explorer and IPFS gateway links
 * for transparent verification of on-chain and IPFS operations
 */

export interface ExplorerLinkConfig {
  rpcUrl?: string;
  transactionHash?: string;
  rootCid?: string;
  pieceCid?: string;
  entityKey?: string;
  ipfsGateway?: string;
}

/**
 * Detect chain from RPC URL and return explorer base URL
 */
export function getExplorerBaseUrl(rpcUrl?: string): string | null {
  if (!rpcUrl) return null;
  
  const rpcLower = rpcUrl.toLowerCase();
  
  // Ethereum networks
  if (rpcLower.includes('ethereum') || rpcLower.includes('mainnet') || rpcLower.includes('eth')) {
    if (rpcLower.includes('sepolia') || rpcLower.includes('goerli')) {
      return 'https://sepolia.etherscan.io'; // or goerli.etherscan.io
    }
    return 'https://etherscan.io';
  }
  
  // Polygon networks
  if (rpcLower.includes('polygon') || rpcLower.includes('matic')) {
    if (rpcLower.includes('mumbai') || rpcLower.includes('testnet')) {
      return 'https://mumbai.polygonscan.com';
    }
    return 'https://polygonscan.com';
  }
  
  // Binance Smart Chain
  if (rpcLower.includes('bsc') || rpcLower.includes('binance')) {
    if (rpcLower.includes('testnet')) {
      return 'https://testnet.bscscan.com';
    }
    return 'https://bscscan.com';
  }
  
  // Avalanche
  if (rpcLower.includes('avalanche') || rpcLower.includes('avax')) {
    if (rpcLower.includes('fuji') || rpcLower.includes('testnet')) {
      return 'https://testnet.snowtrace.io';
    }
    return 'https://snowtrace.io';
  }
  
  // Arbitrum
  if (rpcLower.includes('arbitrum')) {
    if (rpcLower.includes('goerli') || rpcLower.includes('testnet')) {
      return 'https://goerli.arbiscan.io';
    }
    return 'https://arbiscan.io';
  }
  
  // Optimism
  if (rpcLower.includes('optimism') || rpcLower.includes('optimistic')) {
    if (rpcLower.includes('goerli') || rpcLower.includes('testnet')) {
      return 'https://goerli-optimism.etherscan.io';
    }
    return 'https://optimistic.etherscan.io';
  }
  
  // Base
  if (rpcLower.includes('base')) {
    if (rpcLower.includes('goerli') || rpcLower.includes('sepolia') || rpcLower.includes('testnet')) {
      return 'https://goerli.basescan.org';
    }
    return 'https://basescan.org';
  }
  
  // Filecoin
  if (rpcLower.includes('filecoin') || rpcLower.includes('fil')) {
    if (rpcLower.includes('calibration') || rpcLower.includes('testnet')) {
      return 'https://calibration.filfox.info';
    }
    return 'https://filfox.info';
  }
  
  return null;
}

/**
 * Generate transaction explorer link
 */
export function getTransactionLink(transactionHash: string, rpcUrl?: string): string | null {
  if (!transactionHash) return null;
  
  const explorerBase = getExplorerBaseUrl(rpcUrl);
  if (!explorerBase) return null;
  
  return `${explorerBase}/tx/${transactionHash}`;
}

/**
 * Generate IPFS gateway link for a CID
 */
export function getIpfsGatewayLink(cid: string, gatewayBase?: string): string {
  if (!cid) return '';
  
  const gateway = gatewayBase || 'https://ipfs.io/ipfs/';
  const normalizedGateway = gateway.endsWith('/') ? gateway : `${gateway}/`;
  const normalizedCid = cid.replace(/^\/+/, '').replace(/\/+$/, '');
  
  return `${normalizedGateway}${normalizedCid}`;
}

/**
 * Generate Filecoin block explorer link for a CID
 */
export function getFilecoinExplorerLink(cid: string, rpcUrl?: string): string | null {
  if (!cid) return null;
  
  const rpcLower = rpcUrl?.toLowerCase() || '';
  const isTestnet = rpcLower.includes('calibration') || rpcLower.includes('testnet');
  
  if (isTestnet) {
    return `https://calibration.filfox.info/en/message/${cid}`;
  }
  return `https://filfox.info/en/message/${cid}`;
}

/**
 * Generate IPNI (InterPlanetary Network Index) link for a CID
 */
export function getIpniLink(cid: string): string {
  if (!cid) return '';
  return `https://cid.contact/cid/${cid}`;
}

/**
 * Generate Arkiv entity explorer link (if available)
 */
export function getArkivEntityLink(entityKey: string, rpcUrl?: string): string | null {
  if (!entityKey) return null;
  
  // Arkiv doesn't have a public explorer yet, but we can construct a potential link
  // For now, return null - this can be updated when Arkiv has an explorer
  return null;
}

/**
 * Generate all relevant links for an upload/transaction
 */
export function generateExplorerLinks(config: ExplorerLinkConfig): {
  transaction?: string;
  ipfs?: string;
  filecoin?: string;
  ipni?: string;
  entity?: string;
} {
  const links: {
    transaction?: string;
    ipfs?: string;
    filecoin?: string;
    ipni?: string;
    entity?: string;
  } = {};
  
  if (config.transactionHash) {
    links.transaction = getTransactionLink(config.transactionHash, config.rpcUrl) || undefined;
  }
  
  if (config.rootCid) {
    links.ipfs = getIpfsGatewayLink(config.rootCid, config.ipfsGateway);
    links.filecoin = getFilecoinExplorerLink(config.rootCid, config.rpcUrl) || undefined;
    links.ipni = getIpniLink(config.rootCid);
  }
  
  if (config.pieceCid) {
    // Also link piece CID if different from root
    if (config.pieceCid !== config.rootCid) {
      links.filecoin = getFilecoinExplorerLink(config.pieceCid, config.rpcUrl) || undefined;
    }
  }
  
  if (config.entityKey) {
    links.entity = getArkivEntityLink(config.entityKey, config.rpcUrl) || undefined;
  }
  
  return links;
}

