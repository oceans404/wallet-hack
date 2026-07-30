# Trust Me Bro.XRP

Worst wallet ever 2h hackathon submission: A non-custodial Stellar wallet that runs in the browser. Keys are generated and
stored locally, encrypted with a password you set. It holds any number of
accounts and works against both testnet and mainnet.

Built following the guidance at [skills.stellar.org](https://skills.stellar.org).

## Run it locally

You need **Node.js 22 or newer**. Stellar SDK v16 sets that as its minimum, and
older versions fail with an `EBADENGINE` warning. Check with `node --version`.

```bash
git clone <your-repo-url>
cd wallet-hack
npm install
npm run dev
```

Open **http://localhost:5173**.

### First run, step by step

1. **Set a password.** This creates the encrypted vault. It is not recoverable,
   so use something you will remember (or a password manager).
2. **Add an account.** Sidebar, *+ Add account*, then *Add*. This generates a
   fresh keypair and stores it encrypted.
3. **Fund it.** You start on testnet, so the Balances tab offers *Fund with
   Friendbot*. That drops 10,000 test XLM in. One click, no signup.
4. **Try it out.** Send a payment to another account you add, put a trustline on
   an asset, or open the Contracts tab and load a contract ID.

Handy testnet contract to poke at, the native XLM Stellar Asset Contract:

```
CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Load it, pick `decimals` or `balance`, and hit *Simulate*. Simulation is free
and submits nothing.

### Scripts

| Command           | What it does                              |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Dev server with hot reload on port 5173   |
| `npm run build`   | Typecheck (`tsc -b`) then production build |
| `npm run preview` | Serve the built `dist/` locally           |
| `npm run lint`    | Oxlint                                    |

### Mainnet

The network toggle in the header switches to mainnet, and a banner appears
because transactions there move real funds. Balances, payments, trustlines, and
history all work with no extra setup.

Soroban **contract calls** on mainnet need an RPC endpoint, because there is no
free public one. Copy the example env file and fill it in:

```bash
cp .env.example .env
```

```
VITE_STELLAR_MAINNET_RPC_URL=https://your-provider.example/rpc
```

Pick a provider from the
[RPC provider list](https://developers.stellar.org/docs/data/apis/rpc/providers).
Restart the dev server after editing `.env`. Until it is set, the Contracts tab
explains what is missing instead of failing at call time.

## Deploying to Vercel

`vercel.json` is checked in, so the build settings, SPA rewrite, cache headers,
and security headers are already configured.

```bash
npm i -g vercel
vercel        # preview deployment
vercel --prod # production
```

Or connect the Git repo at [vercel.com/new](https://vercel.com/new) for a deploy
on every push. Vercel detects Vite and reads `vercel.json` either way.

Two things to set up in the dashboard:

- **Environment variable.** If you want mainnet contract calls in the deployed
  app, add `VITE_STELLAR_MAINNET_RPC_URL` under Settings, Environment Variables.
  It is baked in at build time, so redeploy after adding it. Note that anything
  prefixed `VITE_` ships to the browser and is publicly readable, so use a
  provider key that is domain-restricted or safe to expose.
- **Content Security Policy.** The CSP in `vercel.json` allows connections only
  to the four known Stellar hosts. Adding your own RPC provider means adding its
  origin to `connect-src`, or the browser blocks the request. The trade-off is
  deliberate: a wallet holding keys in `localStorage` benefits from a strict
  `connect-src`, since it limits where a compromised dependency could send them.

The CSP also sets `frame-ancestors 'none'`, which stops the wallet being
embedded in an iframe on another site. Keep that.

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
