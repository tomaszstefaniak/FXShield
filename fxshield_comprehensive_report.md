# FXShield Comprehensive System Report

This document provides a highly detailed, end-to-end breakdown of the FXShield protocol. It covers the core financial primitive, the Solana smart contract architecture, the frontend client, and the deterministic lifecycle of a market.

---

## 1. Product Overview

**FXShield** is a fully collateralized, tokenized FX hedge protocol built natively on Solana. It is designed to bring simple, bounded-payoff TradFi products—specifically **Binary FX Hedge Notes**—on-chain. 

Instead of relying on highly complex perpetual margin engines, order books, or dynamic liquidations, FXShield isolates risk into a deterministic "Mint → Settle → Redeem" lifecycle. Users deposit exogenous collateral (e.g., USDC) into a smart contract vault and receive symmetric Long and Short derivative SPL tokens. At a strictly defined expiration date, a decentralized oracle (Pyth) dictates the settlement price, and the winning token subclass gains exclusive rights to redeem the underlying vault collateral.

### Target Audience
- **Importers / Exporters:** Businesses looking for a predictable and transparent way to hedge foreign exchange exposure (e.g., EUR/USD) or Crypto assets (SOL/USD).
- **Corporates:** Financial treasuries seeking safe, bounded-risk exposure on-chain without insolvency risks.
- **Retail Investors:** Users seeking structured, easily understandable binary payouts.

---

## 2. Technical Stack and Architecture

FXShield is a full-stack decentralized application composed of two primary layers:

### The Protocol Layer (Solana / Anchor)
- Built using **Rust** and the **Anchor Framework (v0.30.1)**.
- Integrates seamlessly with the **SPL Token Program** and **Metaplex Token Metadata V3** to dynamically issue derivative standard SPL tokens.
- **Pyth Network V2 Integration:** Leverages the `pyth-solana-receiver-sdk` to read cryptographic price data deterministically without relying on third-party off-chain triggers.

### The Client Layer (Next.js / React)
- Built using **Next.js 16 (App Router)** and **Tailwind CSS**.
- **Solana Web3.js & Anchor TS Client:** Manages wallet connections, serialization of instructions, and real-time state fetching.
- **Interactive Sandbox UI:** The frontend acts as an interactive simulation environment, stepping the user chronologically through the physical lifecycle phases of an FXShield market.

---

## 3. Smart Contract Mechanics (The Lifecycle)

The protocol operates in four distinct chronological phases. Each phase is guarded by strict Anchor constraints preventing premature execution or out-of-bounds state mutations.

### Phase 0: Initialize Market
- **Instruction:** `initializeMarket`
- **What it does:** Scaffolds the foundational `MarketState` Program Derived Address (PDA) deterministically derived from: `[MARKET_SEED, Pyth_Oracle_Key, Strike_Price, Expiry_Timestamp]`.
- **Mechanics:** 
  - Records the market constraints (Strike Price, Expiry Time).
  - Initializes a strictly controlled `TokenAccount` PDA serving as the isolated Vault to hold collateral (USDC) for this specific market.

### Phase 1: Initialize Note Mints
- **Instruction:** `initNoteMints`
- **What it does:** Sets up the actual SPL derivative assets for the market.
- **Mechanics:**
  - Deploys two separate SPL Mints (`long_note_mint` and `short_note_mint`).
  - Executes a Cross-Program Invocation (CPI) to the **Metaplex Token Metadata** program. This dynamically assigns human-readable names (`FXS-L` and `FXS-S`) to the tokens, preventing Phantom and other wallets from labeling them as "Unknown Token".
  - *Engineering Note:* This phase requires explicitly bypassing Anchor's rigid `Sysvar` validation for the Rent account, allowing Metaplex to parse the rent sysvar locally.

### Phase 2: Active Market (Mint Notes)
- **Instruction:** `mintNotes`
- **What it does:** The active trading/hedging window. Users interact with the protocol by providing capital.
- **Mechanics:**
  - A user transfers exogenous collateral (e.g., 10 USDC) from their wallet into the market's secure vault PDA.
  - The market program validates the transfer, assumes mint authority, and mints exactly *10 Long Notes* and *10 Short Notes* to the user's Associated Token Accounts (ATAs).
  - Because 1 Long + 1 Short mathematically equals the total underlying collateral, the system remains strictly 1:1 solvent with completely bounded payoffs.

### Phase 3: Expiration and Settlement
- **Instruction:** `settleMarket`
- **What it does:** Locks the market and resolves the binary outcome.
- **Mechanics:**
  - **Time Lock:** Can *only* be executed if `clock.unix_timestamp >= market.expiry_ts`.
  - **Oracle Resolution:** The smart contract natively pulls the exact, cryptographically verified price of the asset at the current block from the Pyth Oracle account (`PriceUpdateV2`).
  - The market state records the `settlement_price` and flips `is_settled` to `true`. This permanently freezes any further Mint instructions.

### Phase 4: Redemption
- **Instruction:** `redeemNotes`
- **What it does:** Pays out the underlying collateral to the winning side.
- **Mechanics:**
  - Evaluates logic: If `settlement_price >= strike_price`, Long Notes are the winning class. Otherwise, Short Notes win.
  - The user burns their winning Notes in exchange for the underlying collateral unlocking from the vault. Losing wrappers expire worthless.

---

## 4. Frontend State Management

The `page.tsx` UI perfectly maps to the on-chain data, dynamically rendering the interface based on the state of the blockchain. 

- **Phase 0 Recognition:** If the `MarketState` PDA does not exist in the blockchain data, the UI restricts users to only the "Initialize New Market" button.
- **Phase 1 Recognition:** If `market.mintsInitialized == false`, the UI blocks minting and prompts the admin/user to "Initialize Note Mints".
- **Phase 2 Recognition:** If the mints are active but `market.isSettled == false`, the UI calculates a real-time `Target Oracle Expiration` countdown. 
- **Dynamic Unlocking:** The moment the user's clock surpasses the Expiry Timestamp limit, the frontend recognizes the environment is eligible for settlement and unlocks the **Settle Market Now** button, routing the chronological Pyth data to the contract.

## 5. Security & Risk Management

- **Zero Insolvency:** By forcing full symmetric minting (1 Long + 1 Short per unit of Collateral deposited), the vault always holds exactly 100% of the funds necessary to pay the ultimate winner. There is zero algorithmic debt or under-collateralization risk.
- **Deterministic PDAs:** Every major component (Market State, Vaults, Mint Authorities) is protected by strictly derived PDAs. This prevents wallet spoofing or malicious secondary pool injection.
- **No Liquidation Engines:** Traditional perpetuals require Keeper bots to continuously liquidate under-margin users. Because payoffs are bounded to the exact collateral deposited, no liquidations exist—meaning flash crashes do not trigger cascading liquidations.
