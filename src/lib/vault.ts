import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  createVaultKey,
  decryptJson,
  encryptJson,
  fromBase64,
  openVaultKey,
  type EncryptedBlob,
} from "./crypto";
import { EMPTY_IDENTITY, hasIdentity, type Identity } from "./identity";

const VAULT_STORAGE_KEY = "wallet-hack:vault";

export interface StoredAccount {
  id: string;
  name: string;
  publicKey: string;
  /** Absent for watch-only accounts, which can be viewed but not signed with. */
  secret?: string;
}

interface VaultData {
  accounts: StoredAccount[];
  /** Collected at onboarding, encrypted in the same blob as the secret keys. */
  identity: Identity;
}

/**
 * An unlocked vault. Holds the derived AES key in memory for the session so
 * mutations can re-encrypt without re-prompting for the password.
 */
export interface VaultSession {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
  accounts: StoredAccount[];
  identity: Identity;
}

export function vaultExists(): boolean {
  return localStorage.getItem(VAULT_STORAGE_KEY) !== null;
}

function readBlob(): EncryptedBlob | null {
  const raw = localStorage.getItem(VAULT_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EncryptedBlob;
  } catch {
    throw new Error("Stored vault is corrupt and could not be parsed.");
  }
}

async function persist(session: VaultSession): Promise<void> {
  const blob = await encryptJson(session.key, session.salt, session.iterations, {
    accounts: session.accounts,
    identity: session.identity,
  } satisfies VaultData);
  localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(blob));
}

export async function createVault(
  password: string,
  identity: Identity
): Promise<VaultSession> {
  if (vaultExists()) {
    throw new Error("A vault already exists in this browser.");
  }
  const { key, salt, iterations } = await createVaultKey(password);
  const session: VaultSession = {
    key,
    salt,
    iterations,
    accounts: [],
    identity,
  };
  await persist(session);
  return session;
}

export async function unlockVault(password: string): Promise<VaultSession> {
  const blob = readBlob();
  if (!blob) throw new Error("No vault found in this browser.");

  const key = await openVaultKey(password, blob);
  let data: VaultData;
  try {
    data = await decryptJson<VaultData>(key, blob);
  } catch {
    // AES-GCM authentication failure — effectively always a wrong password.
    throw new Error("Incorrect password.");
  }

  return {
    key,
    salt: fromBase64(blob.salt),
    iterations: blob.iterations,
    accounts: data.accounts ?? [],
    // Vaults created before onboarding collected personal details have none.
    identity: data.identity ?? EMPTY_IDENTITY,
  };
}

/** Wipes the vault. Irreversible — any key without an external backup is lost. */
export function destroyVault(): void {
  localStorage.removeItem(VAULT_STORAGE_KEY);
}

function nextName(accounts: StoredAccount[]): string {
  return `Account ${accounts.length + 1}`;
}

export const IDENTITY_REQUIRED_MESSAGE =
  "Verify your identity before adding an account.";

/**
 * Enforced on every path that adds an account, so a complete identity is a
 * precondition for the vault holding any keys at all.
 */
function requireIdentity(session: VaultSession): void {
  if (!hasIdentity(session.identity)) {
    throw new Error(IDENTITY_REQUIRED_MESSAGE);
  }
}

/** Replaces the stored identity. Rejects a partial one. */
export async function saveIdentity(
  session: VaultSession,
  identity: Identity
): Promise<VaultSession> {
  if (!identity.firstName.trim() || !identity.lastName.trim()) {
    throw new Error("First and last name are required.");
  }
  if (!identity.phone.trim()) {
    throw new Error("Phone number is required.");
  }

  const next: VaultSession = { ...session, identity };
  await persist(next);
  return next;
}

async function withAccounts(
  session: VaultSession,
  accounts: StoredAccount[]
): Promise<VaultSession> {
  const next: VaultSession = { ...session, accounts };
  await persist(next);
  return next;
}

export async function generateAccount(
  session: VaultSession,
  name?: string
): Promise<{ session: VaultSession; account: StoredAccount }> {
  requireIdentity(session);

  const keypair = Keypair.random();
  const account: StoredAccount = {
    id: crypto.randomUUID(),
    name: name?.trim() || nextName(session.accounts),
    publicKey: keypair.publicKey(),
    secret: keypair.secret(),
  };
  return {
    session: await withAccounts(session, [...session.accounts, account]),
    account,
  };
}

export async function importSecret(
  session: VaultSession,
  secret: string,
  name?: string
): Promise<{ session: VaultSession; account: StoredAccount }> {
  requireIdentity(session);

  const trimmed = secret.trim();
  if (!StrKey.isValidEd25519SecretSeed(trimmed)) {
    throw new Error("That is not a valid Stellar secret key (starts with S).");
  }

  const keypair = Keypair.fromSecret(trimmed);
  const publicKey = keypair.publicKey();

  const existing = session.accounts.find((a) => a.publicKey === publicKey);
  if (existing?.secret) {
    throw new Error(`${publicKey.slice(0, 8)}… is already in this wallet.`);
  }

  // Importing the secret for an address already tracked as watch-only
  // upgrades it in place rather than creating a duplicate row.
  if (existing) {
    const accounts = session.accounts.map((a) =>
      a.id === existing.id ? { ...a, secret: trimmed } : a
    );
    return {
      session: await withAccounts(session, accounts),
      account: { ...existing, secret: trimmed },
    };
  }

  const account: StoredAccount = {
    id: crypto.randomUUID(),
    name: name?.trim() || nextName(session.accounts),
    publicKey,
    secret: trimmed,
  };
  return {
    session: await withAccounts(session, [...session.accounts, account]),
    account,
  };
}

export async function importWatchAddress(
  session: VaultSession,
  publicKey: string,
  name?: string
): Promise<{ session: VaultSession; account: StoredAccount }> {
  requireIdentity(session);

  const trimmed = publicKey.trim();
  if (!StrKey.isValidEd25519PublicKey(trimmed)) {
    throw new Error("That is not a valid Stellar address (starts with G).");
  }
  if (session.accounts.some((a) => a.publicKey === trimmed)) {
    throw new Error(`${trimmed.slice(0, 8)}… is already in this wallet.`);
  }

  const account: StoredAccount = {
    id: crypto.randomUUID(),
    name: name?.trim() || nextName(session.accounts),
    publicKey: trimmed,
  };
  return {
    session: await withAccounts(session, [...session.accounts, account]),
    account,
  };
}

export async function renameAccount(
  session: VaultSession,
  id: string,
  name: string
): Promise<VaultSession> {
  const accounts = session.accounts.map((a) =>
    a.id === id ? { ...a, name: name.trim() || a.name } : a
  );
  return withAccounts(session, accounts);
}

export async function removeAccount(
  session: VaultSession,
  id: string
): Promise<VaultSession> {
  return withAccounts(
    session,
    session.accounts.filter((a) => a.id !== id)
  );
}

export function isSignable(
  account: StoredAccount | null | undefined
): account is StoredAccount & { secret: string } {
  return Boolean(account?.secret);
}
