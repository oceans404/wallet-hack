import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  loadStoredNetwork,
  storeNetwork,
  type NetworkId,
} from "../lib/network";
import {
  createVault,
  destroyVault,
  generateAccount,
  importSecret,
  importWatchAddress,
  removeAccount,
  renameAccount,
  unlockVault,
  vaultExists,
  type StoredAccount,
  type VaultSession,
} from "../lib/vault";

interface WalletContextValue {
  network: NetworkId;
  setNetwork: (id: NetworkId) => void;

  hasVault: boolean;
  unlocked: boolean;
  accounts: StoredAccount[];
  selectedAccount: StoredAccount | null;
  selectAccount: (id: string) => void;

  createWallet: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  reset: () => void;

  addGeneratedAccount: (firstName: string, name?: string) => Promise<StoredAccount>;
  addImportedSecret: (
    secret: string,
    firstName: string,
    name?: string
  ) => Promise<StoredAccount>;
  addWatchAddress: (
    publicKey: string,
    firstName: string,
    name?: string
  ) => Promise<StoredAccount>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [network, setNetworkState] = useState<NetworkId>(loadStoredNetwork);
  const [session, setSession] = useState<VaultSession | null>(null);
  const [hasVault, setHasVault] = useState(vaultExists);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const accounts = useMemo(() => session?.accounts ?? [], [session]);

  // Keep the selection valid as accounts are added and removed.
  useEffect(() => {
    if (accounts.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !accounts.some((a) => a.id === selectedId)) {
      setSelectedId(accounts[0].id);
    }
  }, [accounts, selectedId]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedId) ?? null,
    [accounts, selectedId]
  );

  const setNetwork = useCallback((id: NetworkId) => {
    setNetworkState(id);
    storeNetwork(id);
  }, []);

  const createWallet = useCallback(async (password: string) => {
    setSession(await createVault(password));
    setHasVault(true);
  }, []);

  const unlock = useCallback(async (password: string) => {
    setSession(await unlockVault(password));
  }, []);

  /** Drops the in-memory key. The encrypted vault stays on disk. */
  const lock = useCallback(() => {
    setSession(null);
    setSelectedId(null);
  }, []);

  const reset = useCallback(() => {
    destroyVault();
    setSession(null);
    setSelectedId(null);
    setHasVault(false);
  }, []);

  /**
   * Every mutation returns a fresh session, so this wrapper keeps the "run it,
   * store the new session, select the new account" sequence in one place.
   */
  const mutateWithAccount = useCallback(
    async (
      action: (
        current: VaultSession
      ) => Promise<{ session: VaultSession; account: StoredAccount }>
    ): Promise<StoredAccount> => {
      if (!session) throw new Error("Wallet is locked.");
      const { session: next, account } = await action(session);
      setSession(next);
      setSelectedId(account.id);
      return account;
    },
    [session]
  );

  const addGeneratedAccount = useCallback(
    (firstName: string, name?: string) =>
      mutateWithAccount((s) => generateAccount(s, firstName, name)),
    [mutateWithAccount]
  );

  const addImportedSecret = useCallback(
    (secret: string, firstName: string, name?: string) =>
      mutateWithAccount((s) => importSecret(s, secret, firstName, name)),
    [mutateWithAccount]
  );

  const addWatchAddress = useCallback(
    (publicKey: string, firstName: string, name?: string) =>
      mutateWithAccount((s) => importWatchAddress(s, publicKey, firstName, name)),
    [mutateWithAccount]
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      if (!session) throw new Error("Wallet is locked.");
      setSession(await renameAccount(session, id, name));
    },
    [session]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!session) throw new Error("Wallet is locked.");
      setSession(await removeAccount(session, id));
    },
    [session]
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      network,
      setNetwork,
      hasVault,
      unlocked: session !== null,
      accounts,
      selectedAccount,
      selectAccount: setSelectedId,
      createWallet,
      unlock,
      lock,
      reset,
      addGeneratedAccount,
      addImportedSecret,
      addWatchAddress,
      rename,
      remove,
    }),
    [
      network,
      setNetwork,
      hasVault,
      session,
      accounts,
      selectedAccount,
      createWallet,
      unlock,
      lock,
      reset,
      addGeneratedAccount,
      addImportedSecret,
      addWatchAddress,
      rename,
      remove,
    ]
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside a WalletProvider.");
  }
  return context;
}
