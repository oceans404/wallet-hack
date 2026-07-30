import * as StellarSdk from "@stellar/stellar-sdk";
import { NotFoundError } from "@stellar/stellar-sdk";
import { getHorizon, getNetworkConfig, getRpc, type NetworkId } from "./network";

/** Seconds a built transaction stays valid before it expires unsubmitted. */
const TX_TIMEOUT = 180;

export interface SubmitResult {
  hash: string;
  explorerUrl: string;
}

/**
 * Horizon packs the useful failure detail into `extras.result_codes`, which is
 * far more actionable than the generic "Request failed" message.
 */
export function describeSubmitError(error: unknown): string {
  const codes = (
    error as {
      response?: {
        data?: {
          extras?: {
            result_codes?: { transaction?: string; operations?: string[] };
          };
        };
      };
    }
  )?.response?.data?.extras?.result_codes;

  if (codes) {
    const parts: string[] = [];
    if (codes.transaction) parts.push(codes.transaction);
    if (codes.operations?.length) parts.push(`ops: ${codes.operations.join(", ")}`);

    const detail = parts.join(" — ");
    const hints: Record<string, string> = {
      tx_insufficient_balance: "Not enough XLM to cover the amount plus fee and reserve.",
      tx_bad_auth: "The signature did not match the source account.",
      tx_bad_seq: "Sequence number was stale. Retry to pick up a fresh one.",
      op_underfunded: "The sending account does not hold enough of that asset.",
      op_no_trust: "The destination has no trustline for this asset.",
      op_no_destination: "The destination account does not exist and is not being created.",
      op_low_reserve: "The amount is below the minimum needed to create the account (1 XLM).",
      op_line_full: "The destination's trustline limit would be exceeded.",
    };

    const hint =
      hints[codes.transaction ?? ""] ??
      codes.operations?.map((c) => hints[c]).find(Boolean);

    return hint ? `${detail} — ${hint}` : detail;
  }

  return error instanceof Error ? error.message : String(error);
}

export function parseAsset(
  code: string,
  issuer?: string
): StellarSdk.Asset {
  if (code === "XLM" && !issuer) return StellarSdk.Asset.native();
  if (!issuer) throw new Error(`Asset ${code} requires an issuer address.`);
  return new StellarSdk.Asset(code, issuer);
}

async function accountExists(
  network: NetworkId,
  publicKey: string
): Promise<boolean> {
  try {
    await getHorizon(network).loadAccount(publicKey);
    return true;
  } catch (error) {
    if (error instanceof NotFoundError) return false;
    throw error;
  }
}

export interface PaymentRequest {
  network: NetworkId;
  source: string;
  destination: string;
  amount: string;
  asset: StellarSdk.Asset;
  memo?: string;
}

/**
 * Builds a payment. An unfunded XLM destination gets a `createAccount`
 * operation instead, since `payment` fails with `op_no_destination` there.
 */
export async function buildPaymentTx(
  request: PaymentRequest
): Promise<StellarSdk.Transaction> {
  const { network, source, destination, amount, asset, memo } = request;

  if (!StellarSdk.StrKey.isValidEd25519PublicKey(destination)) {
    throw new Error("Destination is not a valid Stellar address.");
  }
  if (!(Number(amount) > 0)) {
    throw new Error("Amount must be greater than zero.");
  }

  const config = getNetworkConfig(network);
  const account = await getHorizon(network).loadAccount(source);

  const needsCreate =
    asset.isNative() && !(await accountExists(network, destination));

  if (needsCreate && Number(amount) < 1) {
    throw new Error(
      `${destination.slice(0, 4)}…${destination.slice(-4)} is not funded yet, so this payment creates it. Send at least 1 XLM.`
    );
  }

  const builder = new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  }).addOperation(
    needsCreate
      ? StellarSdk.Operation.createAccount({
          destination,
          startingBalance: amount,
        })
      : StellarSdk.Operation.payment({ destination, asset, amount })
  );

  if (memo?.trim()) {
    builder.addMemo(StellarSdk.Memo.text(memo.trim()));
  }

  return builder.setTimeout(TX_TIMEOUT).build();
}

export interface TrustlineRequest {
  network: NetworkId;
  source: string;
  asset: StellarSdk.Asset;
  /** Omit for the maximum limit; "0" removes the trustline. */
  limit?: string;
}

export async function buildTrustlineTx(
  request: TrustlineRequest
): Promise<StellarSdk.Transaction> {
  const { network, source, asset, limit } = request;
  const config = getNetworkConfig(network);
  const account = await getHorizon(network).loadAccount(source);

  return new StellarSdk.TransactionBuilder(account, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(StellarSdk.Operation.changeTrust({ asset, limit }))
    .setTimeout(TX_TIMEOUT)
    .build();
}

export function signTx(
  transaction: StellarSdk.Transaction,
  secret: string
): StellarSdk.Transaction {
  const keypair = StellarSdk.Keypair.fromSecret(secret);
  if (keypair.publicKey() !== transaction.source) {
    // Guards against a UI bug signing with the wrong account's key.
    throw new Error("Signing key does not match the transaction source account.");
  }
  transaction.sign(keypair);
  return transaction;
}

/**
 * Submits a signed transaction. Soroban operations must go through RPC;
 * everything classic goes through Horizon.
 */
export async function submitTx(
  network: NetworkId,
  transaction: StellarSdk.Transaction
): Promise<SubmitResult> {
  const config = getNetworkConfig(network);
  const isSoroban = transaction.operations.some(
    (op) => op.type === "invokeHostFunction"
  );

  if (isSoroban) {
    const rpc = getRpc(network);
    const sent = await rpc.sendTransaction(transaction);
    if (sent.status === "ERROR") {
      throw new Error(`Send failed: ${JSON.stringify(sent.errorResult)}`);
    }

    // pollTransaction handles the retry loop instead of a hand-rolled wait.
    const result = await rpc.pollTransaction(sent.hash);
    if (result.status !== "SUCCESS") {
      throw new Error(`Transaction failed on-chain: ${result.status}`);
    }
    return { hash: sent.hash, explorerUrl: config.explorerTxUrl(sent.hash) };
  }

  const response = await getHorizon(network).submitTransaction(transaction);
  return {
    hash: response.hash,
    explorerUrl: config.explorerTxUrl(response.hash),
  };
}

/** Convenience wrapper: build → sign → submit, with readable errors. */
export async function signAndSubmit(
  network: NetworkId,
  transaction: StellarSdk.Transaction,
  secret: string
): Promise<SubmitResult> {
  const signed = signTx(transaction, secret);
  try {
    return await submitTx(network, signed);
  } catch (error) {
    throw new Error(describeSubmitError(error));
  }
}
