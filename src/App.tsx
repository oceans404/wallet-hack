import { useState } from "react";
import { WalletProvider, useWallet } from "./context/WalletContext";
import { useAccountData } from "./hooks/useAccountData";
import { AccountSidebar } from "./components/AccountSidebar";
import { Balances } from "./components/Balances";
import { SendPayment } from "./components/SendPayment";
import { Trustlines } from "./components/Trustlines";
import { History } from "./components/History";
import { ContractLab } from "./components/ContractLab";
import { Unlock } from "./components/Unlock";
import { NETWORK_IDS, getNetworkConfig } from "./lib/network";
import "./App.css";

type Tab = "balances" | "send" | "trustlines" | "history" | "contracts";

const TABS: { id: Tab; label: string }[] = [
  { id: "balances", label: "Balances" },
  { id: "send", label: "Send" },
  { id: "trustlines", label: "Trustlines" },
  { id: "history", label: "Activity" },
  { id: "contracts", label: "Contracts" },
];

function Workspace() {
  const { network, setNetwork, unlocked, selectedAccount, lock } = useWallet();
  const [tab, setTab] = useState<Tab>("balances");

  const { summary, history, loading, error, refresh } = useAccountData(
    network,
    selectedAccount?.publicKey ?? null
  );

  if (!unlocked) return <Unlock />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">✦</span>
          <span>Stellar Wallet</span>
        </div>

        <div className="row gap center">
          <div className="network-switch">
            {NETWORK_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={network === id ? "active" : ""}
                onClick={() => setNetwork(id)}
              >
                {getNetworkConfig(id).label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm" onClick={lock}>
            Lock
          </button>
        </div>
      </header>

      {network === "mainnet" && (
        <div className="banner">
          Mainnet is live. Transactions move real funds and cannot be undone.
        </div>
      )}

      <div className="layout">
        <AccountSidebar />

        <main className="content">
          {!selectedAccount ? (
            <section className="card empty">
              <h3>No account selected</h3>
              <p className="muted">
                Add an account from the sidebar to get started.
              </p>
            </section>
          ) : (
            <>
              <nav className="tabs">
                {TABS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={tab === entry.id ? "active" : ""}
                    onClick={() => setTab(entry.id)}
                  >
                    {entry.label}
                  </button>
                ))}
              </nav>

              {tab === "balances" && (
                <Balances
                  account={selectedAccount}
                  network={network}
                  summary={summary}
                  loading={loading}
                  error={error}
                  onRefresh={refresh}
                />
              )}

              {tab === "send" && (
                <SendPayment
                  account={selectedAccount}
                  network={network}
                  summary={summary}
                  onRefresh={refresh}
                />
              )}

              {tab === "trustlines" && (
                <Trustlines
                  account={selectedAccount}
                  network={network}
                  summary={summary}
                  onRefresh={refresh}
                />
              )}

              {tab === "history" && (
                <History network={network} history={history} loading={loading} />
              )}

              {tab === "contracts" && (
                <ContractLab account={selectedAccount} network={network} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <WalletProvider>
      <Workspace />
    </WalletProvider>
  );
}
