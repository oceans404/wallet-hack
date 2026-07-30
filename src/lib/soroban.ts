import * as StellarSdk from "@stellar/stellar-sdk";
import { contract } from "@stellar/stellar-sdk";
import { getNetworkConfig, getRpc, type NetworkId } from "./network";

export interface ContractMethodInput {
  name: string;
  type: string;
}

export interface ContractMethod {
  name: string;
  inputs: ContractMethodInput[];
  outputs: string[];
  doc?: string;
}

/**
 * Reads a contract's callable interface straight from the network. No ABI file
 * or codegen needed — the spec is stored on-chain alongside the WASM.
 */
export async function loadContractMethods(
  network: NetworkId,
  contractId: string
): Promise<ContractMethod[]> {
  if (!StellarSdk.StrKey.isValidContract(contractId)) {
    throw new Error("That is not a valid contract ID (starts with C).");
  }
  const methods = await getRpc(network).getContractMethods(contractId);
  return methods as ContractMethod[];
}

/**
 * Turns a form's text input into the native JS value the contract spec expects.
 * The SDK converts native values to ScVals itself, so this only has to get the
 * JS type right.
 */
export function coerceArg(rawValue: string, type: string): unknown {
  const value = rawValue.trim();
  const normalized = type.toLowerCase();

  if (normalized === "bool") {
    if (value === "true") return true;
    if (value === "false") return false;
    throw new Error(`Expected true or false for a Bool, got "${value}".`);
  }

  // 64-bit and wider integers must be BigInt — Number would silently lose precision.
  if (/^[iu](64|128|256)$/.test(normalized)) {
    try {
      return BigInt(value);
    } catch {
      throw new Error(`Expected a whole number for ${type}, got "${value}".`);
    }
  }

  if (/^[iu](32|8|16)$/.test(normalized)) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new Error(`Expected a whole number for ${type}, got "${value}".`);
    }
    return parsed;
  }

  if (normalized === "address") {
    const valid =
      StellarSdk.StrKey.isValidEd25519PublicKey(value) ||
      StellarSdk.StrKey.isValidContract(value);
    if (!valid) {
      throw new Error(`Expected a G… or C… address, got "${value}".`);
    }
    return value;
  }

  if (normalized === "bytes" || normalized.startsWith("bytesn")) {
    const hex = value.startsWith("0x") ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
      throw new Error(`Expected hex bytes for ${type}, got "${value}".`);
    }
    return Uint8Array.from(
      hex.match(/.{2}/g)?.map((byte) => parseInt(byte, 16)) ?? []
    );
  }

  // String, Symbol, and anything structured (Vec/Map/custom) fall through.
  // Structured types accept JSON so nested values stay expressible.
  if (normalized === "string" || normalized === "symbol") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function buildArgs(
  method: ContractMethod,
  values: Record<string, string>
): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const input of method.inputs) {
    const raw = values[input.name] ?? "";
    if (raw.trim() === "") {
      throw new Error(`Missing value for "${input.name}" (${input.type}).`);
    }
    args[input.name] = coerceArg(raw, input.type);
  }
  return args;
}

/** JSON.stringify can't serialize BigInt, which contract results are full of. */
export function stringifyResult(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );
}

export interface ReadResult {
  kind: "read";
  value: unknown;
  /** False when the method would change state — the value is a simulation preview. */
  isReadCall: boolean;
}

/**
 * Simulates a call without signing or spending anything. Works for read-only
 * methods; for state-changing ones the result is a preview of what would happen.
 */
export async function simulateCall(
  network: NetworkId,
  contractId: string,
  method: ContractMethod,
  values: Record<string, string>
): Promise<ReadResult> {
  const args = buildArgs(method, values);
  const { result, isReadCall } = await getRpc(network).queryContract(
    contractId,
    method.name,
    args
  );
  return { kind: "read", value: result, isReadCall };
}

export interface InvokeResult {
  kind: "write";
  value: unknown;
  hash: string;
  explorerUrl: string;
}

/**
 * Signs and submits a state-changing contract call. `contract.Client` reads the
 * spec from the network, so arguments and the return value cross as native JS.
 */
export async function invokeCall(
  network: NetworkId,
  contractId: string,
  method: ContractMethod,
  values: Record<string, string>,
  publicKey: string,
  secret: string
): Promise<InvokeResult> {
  const config = getNetworkConfig(network);
  const args = buildArgs(method, values);
  const keypair = StellarSdk.Keypair.fromSecret(secret);

  if (keypair.publicKey() !== publicKey) {
    throw new Error("Signing key does not match the selected account.");
  }

  const signer = contract.basicNodeSigner(keypair, config.networkPassphrase);

  const client = await contract.Client.from({
    contractId,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    publicKey,
    signTransaction: signer.signTransaction,
    signAuthEntry: signer.signAuthEntry,
  });

  const invoke = (
    client as unknown as Record<
      string,
      (a: Record<string, unknown>) => Promise<contract.AssembledTransaction<unknown>>
    >
  )[method.name];

  if (typeof invoke !== "function") {
    throw new Error(`Contract has no method "${method.name}".`);
  }

  const assembled = await invoke(args);
  const sent = await assembled.signAndSend();

  const hash = sent.sendTransactionResponse?.hash ?? "";
  return {
    kind: "write",
    value: sent.result,
    hash,
    explorerUrl: hash ? config.explorerTxUrl(hash) : "",
  };
}
