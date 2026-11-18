"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider, type SetActiveWalletForWagmiType } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { network } from "@/lib/network";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Which wallet the app acts as. Someone with a built-in (Privy) wallet — anyone who signed in with Google or
 * email — always uses it, even if MetaMask is installed or linked, so their address (and GoodDollar
 * verification) never silently switches. People who signed in with their own wallet use that wallet.
 */
const pickActiveWallet: SetActiveWalletForWagmiType = ({ wallets }) =>
  wallets.find((w) => w.walletClientType === "privy") ?? wallets.find((w) => w.linked) ?? wallets[0];

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ["google", "email", "wallet"],
        appearance: { theme: "light", walletChainType: "ethereum-only" },
        // Confirmation pop-ups ON by default. useTx turns them off per call only for allow-listed testnet calls.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: true },
        defaultChain: network.chain,
        supportedChains: [network.chain],
        walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig} setActiveWalletForWagmi={pickActiveWallet}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
