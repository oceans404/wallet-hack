import * as StellarSdk from "@stellar/stellar-sdk";

export type NetworkId = "testnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  horizonUrl: string;
  /** Soroban RPC. Mainnet has no free public endpoint, so this can be empty. */
  rpcUrl: string;
  networkPassphrase: string;
  friendbotUrl: string | null;
  explorerTxUrl: (hash: string) => string;
}

// Mainnet RPC has no public endpoint. Supply one from a provider:
// https://developers.stellar.org/docs/data/apis/rpc/providers
const MAINNET_RPC_URL = import.meta.env.VITE_STELLAR_MAINNET_RPC_URL ?? "";

const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    horizonUrl: "https://horizon-testnet.stellar.org",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: StellarSdk.Networks.TESTNET,
    friendbotUrl: "https://friendbot.stellar.org",
    explorerTxUrl: (hash) =>
      `https://stellar.expert/explorer/testnet/tx/${hash}`,
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    horizonUrl: "https://horizon.stellar.org",
    rpcUrl: MAINNET_RPC_URL,
    networkPassphrase: StellarSdk.Networks.PUBLIC,
    friendbotUrl: null,
    explorerTxUrl: (hash) =>
      `https://stellar.expert/explorer/public/tx/${hash}`,
  },
};

export const NETWORK_IDS: NetworkId[] = ["testnet", "mainnet"];

export function getNetworkConfig(id: NetworkId): NetworkConfig {
  return NETWORKS[id];
}

/**
 * Horizon and RPC servers are cached per network so switching back and forth
 * doesn't churn connections.
 */
const horizonCache = new Map<NetworkId, StellarSdk.Horizon.Server>();
const rpcCache = new Map<NetworkId, StellarSdk.rpc.Server>();

export function getHorizon(id: NetworkId): StellarSdk.Horizon.Server {
  let server = horizonCache.get(id);
  if (!server) {
    server = new StellarSdk.Horizon.Server(NETWORKS[id].horizonUrl);
    horizonCache.set(id, server);
  }
  return server;
}

/** Throws when the network has no configured RPC URL (mainnet without a provider). */
export function getRpc(id: NetworkId): StellarSdk.rpc.Server {
  const { rpcUrl } = NETWORKS[id];
  if (!rpcUrl) {
    throw new Error(
      "No Soroban RPC URL configured for mainnet. Set VITE_STELLAR_MAINNET_RPC_URL to a provider endpoint."
    );
  }
  let server = rpcCache.get(id);
  if (!server) {
    server = new StellarSdk.rpc.Server(rpcUrl);
    rpcCache.set(id, server);
  }
  return server;
}

export function hasRpc(id: NetworkId): boolean {
  return NETWORKS[id].rpcUrl !== "";
}

const NETWORK_STORAGE_KEY = "wallet-hack:network";

export function loadStoredNetwork(): NetworkId {
  const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
  return stored === "mainnet" || stored === "testnet" ? stored : "testnet";
}

export function storeNetwork(id: NetworkId): void {
  localStorage.setItem(NETWORK_STORAGE_KEY, id);
}
