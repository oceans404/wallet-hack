import * as StellarSdk from "@stellar/stellar-sdk";
import { NotFoundError } from "@stellar/stellar-sdk";
import { getHorizon, getNetworkConfig, type NetworkId } from "./network";

export interface Balance {
  /** "native" for XLM, otherwise `CODE:ISSUER`. Unique within an account. */
  key: string;
  assetType: string;
  code: string;
  issuer?: string;
  balance: string;
  limit?: string;
  /** Liquidity-pool shares have no code/issuer and can't be sent as payments. */
  isPoolShare: boolean;
}

export interface AccountSummary {
  funded: boolean;
  balances: Balance[];
  /** Sequence number, only present when funded. */
  sequence?: string;
  subentryCount: number;
  /** Minimum XLM that must stay in the account: (2 + subentries) * 0.5. */
  reserveXlm: string;
  /** XLM actually available to send after reserve and open offers. */
  spendableXlm: string;
}

/**
 * A copy of the summary with every spendable amount zeroed.
 *
 * Display only. Transactions are still built from the real summary, so this
 * changes what the user sees and nothing about what gets signed. `funded` is
 * left alone so the UI keeps showing the balances screen rather than flipping
 * to the "not funded" state.
 */
export function zeroSummary(summary: AccountSummary): AccountSummary {
  return {
    ...summary,
    balances: summary.balances.map((balance) => ({ ...balance, balance: "0" })),
    spendableXlm: "0",
  };
}

function describeBalance(
  raw: StellarSdk.Horizon.HorizonApi.BalanceLine
): Balance {
  if (raw.asset_type === "native") {
    return {
      key: "native",
      assetType: raw.asset_type,
      code: "XLM",
      balance: raw.balance,
      isPoolShare: false,
    };
  }

  if (raw.asset_type === "liquidity_pool_shares") {
    return {
      key: `pool:${raw.liquidity_pool_id}`,
      assetType: raw.asset_type,
      code: "Pool shares",
      balance: raw.balance,
      limit: raw.limit,
      isPoolShare: true,
    };
  }

  return {
    key: `${raw.asset_code}:${raw.asset_issuer}`,
    assetType: raw.asset_type,
    code: raw.asset_code,
    issuer: raw.asset_issuer,
    balance: raw.balance,
    limit: raw.limit,
    isPoolShare: false,
  };
}

const BASE_RESERVE = 0.5;

export async function loadAccountSummary(
  network: NetworkId,
  publicKey: string
): Promise<AccountSummary> {
  try {
    const account = await getHorizon(network).loadAccount(publicKey);
    const balances = account.balances.map(describeBalance);
    const native = balances.find((b) => b.key === "native");

    // Every account holds a 2-slot base reserve plus one per subentry
    // (trustlines, offers, signers, data entries).
    const reserve = (2 + account.subentry_count) * BASE_RESERVE;
    const spendable = Math.max(0, Number(native?.balance ?? "0") - reserve);

    return {
      funded: true,
      balances,
      sequence: account.sequenceNumber(),
      subentryCount: account.subentry_count,
      reserveXlm: reserve.toFixed(7),
      spendableXlm: spendable.toFixed(7),
    };
  } catch (error) {
    // loadAccount rejects with NotFoundError when the account has never been funded.
    if (error instanceof NotFoundError) {
      return {
        funded: false,
        balances: [],
        subentryCount: 0,
        reserveXlm: "1.0000000",
        spendableXlm: "0.0000000",
      };
    }
    throw error;
  }
}

export interface HistoryEntry {
  id: string;
  type: string;
  createdAt: string;
  transactionHash: string;
  successful: boolean;
  /** Human-readable one-liner built per operation type. */
  summary: string;
  /** Direction relative to the viewing account, when meaningful. */
  direction: "in" | "out" | "self" | null;
}

function summarize(
  op: StellarSdk.Horizon.ServerApi.OperationRecord,
  viewer: string
): { summary: string; direction: HistoryEntry["direction"] } {
  const assetName = (
    o: { asset_type?: string; asset_code?: string }
  ): string => (o.asset_type === "native" ? "XLM" : o.asset_code ?? "asset");

  switch (op.type) {
    case "payment": {
      const incoming = op.to === viewer;
      const other = incoming ? op.from : op.to;
      return {
        summary: `${incoming ? "Received" : "Sent"} ${op.amount} ${assetName(op)} ${
          incoming ? "from" : "to"
        } ${other.slice(0, 4)}…${other.slice(-4)}`,
        direction: op.from === op.to ? "self" : incoming ? "in" : "out",
      };
    }
    case "create_account": {
      const incoming = op.account === viewer;
      return {
        summary: incoming
          ? `Account created with ${op.starting_balance} XLM`
          : `Created account ${op.account.slice(0, 4)}…${op.account.slice(-4)} with ${op.starting_balance} XLM`,
        direction: incoming ? "in" : "out",
      };
    }
    case "change_trust": {
      const removing = op.limit === "0.0000000";
      return {
        summary: `${removing ? "Removed" : "Added"} trustline for ${assetName(op)}`,
        direction: null,
      };
    }
    case "path_payment_strict_send":
    case "path_payment_strict_receive": {
      const incoming = op.to === viewer;
      return {
        summary: `${incoming ? "Received" : "Sent"} ${op.amount} ${assetName(op)} via path payment`,
        direction: incoming ? "in" : "out",
      };
    }
    case "invoke_host_function":
      return { summary: "Smart contract invocation", direction: null };
    case "account_merge":
      return { summary: `Merged account into ${op.into}`, direction: "out" };
    default:
      return { summary: op.type.replace(/_/g, " "), direction: null };
  }
}

export async function loadHistory(
  network: NetworkId,
  publicKey: string,
  limit = 25
): Promise<HistoryEntry[]> {
  try {
    const page = await getHorizon(network)
      .operations()
      .forAccount(publicKey)
      .order("desc")
      .limit(limit)
      .call();

    return page.records.map((op) => {
      const { summary, direction } = summarize(op, publicKey);
      return {
        id: op.id,
        type: op.type,
        createdAt: op.created_at,
        transactionHash: op.transaction_hash,
        successful: op.transaction_successful,
        summary,
        direction,
      };
    });
  } catch (error) {
    if (error instanceof NotFoundError) return [];
    throw error;
  }
}

/** Funds a testnet account via Friendbot. Throws on mainnet. */
export async function fundWithFriendbot(
  network: NetworkId,
  publicKey: string
): Promise<void> {
  const { friendbotUrl } = getNetworkConfig(network);
  if (!friendbotUrl) {
    throw new Error("Friendbot is only available on testnet.");
  }

  const response = await fetch(
    `${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Friendbot funding failed: ${body.slice(0, 200)}`);
  }
}
