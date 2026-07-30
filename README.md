# Stellar Wallet

A non-custodial Stellar wallet that runs in the browser. Keys are generated and
stored locally, encrypted with a password you set. It holds any number of
accounts and works against both testnet and mainnet.

Built following the guidance at [skills.stellar.org](https://skills.stellar.org).

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:5173. On first load you set a password, which creates the
encrypted vault. Add an account, fund it with Friendbot on testnet, and you can
send.

For mainnet Soroban contract calls, copy `.env.example` to `.env` and set
`VITE_STELLAR_MAINNET_RPC_URL` to a provider endpoint. Everything else on
mainnet works without it.

## What it does

- **Multiple accounts.** Generate new keypairs, import existing secret keys, or
  add watch-only addresses. Watch-only accounts show balances and history but
  cannot sign.
- **Balances.** Every asset the account holds, plus the XLM reserve and the
  amount actually spendable after it.
- **Payments.** Send XLM or any held asset, with an optional memo. Sending XLM
  to an address that does not exist yet uses a `createAccount` operation
  automatically, since a plain payment would fail there.
- **Trustlines.** Add and remove them. Each one costs 0.5 XLM of reserve.
- **Activity.** Recent operations, labelled by direction and linked to
  stellar.expert.
- **Smart contracts.** Load any Soroban contract by ID. Its methods are read
  from the network, so there is no ABI file or codegen step. Simulate a call for
  free, or sign and invoke it.

## How keys are stored

The password is stretched with PBKDF2-SHA256 (600,000 iterations) into an
AES-GCM key, which encrypts the whole account list as one blob in
`localStorage`. The derived key lives in memory only while the wallet is
unlocked, and locking discards it.

Two consequences worth being clear about:

- **The password cannot be recovered.** It is never transmitted or stored. If
  you lose it, the vault is unreadable and the keys inside it are gone.
- **This is browser storage.** Clearing site data deletes the vault. Back up
  secret keys elsewhere for anything that matters (Balances tab, *Reveal secret
  key*).

Browser `localStorage` is readable by any script running on the origin, so this
design suits testnet work and small mainnet balances rather than serious
custody. For real funds, a hardware wallet or an audited browser extension is
the right tool.

## Stack

- `@stellar/stellar-sdk` v16 (Node 22+, ESM-first, native fetch)
- React 19 + TypeScript + Vite
- Horizon for classic operations and history, Soroban RPC for contracts
- WebCrypto for vault encryption, no crypto dependencies

## Layout

```
src/
  lib/
    network.ts    network config, cached Horizon and RPC servers
    crypto.ts     PBKDF2 + AES-GCM primitives
    vault.ts      encrypted multi-account store
    stellar.ts    balances, history, Friendbot
    tx.ts         build, sign, and submit payments and trustlines
    soroban.ts    contract introspection and invocation
    format.ts     display helpers
  hooks/
    useAccountData.ts   loads balances and history for the selected account
  context/
    WalletContext.tsx   network, vault, and account selection
  components/           one per screen
```

Transaction submission routes by operation type: `invokeHostFunction` goes
through Soroban RPC with `pollTransaction`, everything else through Horizon.
Horizon submission failures are decoded from `extras.result_codes` into
readable messages.
