# FXShield

FXShield is a Solana-native protocol for simple, fully collateralized FX outcome notes.

It lets users take a clear position on whether an exchange rate, such as EUR/USD, will finish above or below a chosen level at a fixed time. Each winning note pays a fixed amount, making the product easy to understand, easy to price, and easy to settle.

[![GitHub Repo](https://img.shields.io/badge/GitHub-tomaszstefaniak%2FFXShield-blue?logo=github)](https://github.com/tomaszstefaniak/FXShield)
[![Solana Devnet](https://img.shields.io/badge/Deployed_on-Devnet-green?logo=solana)](#)

## Live Deployment
The core Anchor program is currently deployed on **Solana Devnet**.

- **Program ID**: `o3hwgN5oi3VkJxDSTbzHYNXQevJ7e96G6TK6XK6novc`
- **Explorer Link**: [View on Solana Explorer](https://explorer.solana.com/address/o3hwgN5oi3VkJxDSTbzHYNXQevJ7e96G6TK6XK6novc?cluster=devnet)

---

## What FXShield Does

FXShield turns FX views into simple onchain notes with fixed outcomes.

Example market:

**Will EUR/USD finish above 1.10 at expiry?**

- If the answer is **yes**, the winning side receives the fixed payout
- If the answer is **no**, the opposite side wins
- The result is determined automatically at expiry using a verified price feed

This creates a much simpler alternative to margin-heavy trading products. Users know the outcome rules in advance, the payout logic is fixed, and collateral is locked upfront.

---

## Why This Product Matters

### Simple risk, simple payout
Most onchain trading products are built around leverage, liquidations, and continuously changing risk. FXShield focuses on the opposite approach: fixed outcomes, fixed rules, and clearly bounded exposure.

### Useful for real-world FX use cases
FXShield is designed for:
- **Businesses** that want a simple hedge around a future FX level
- **Treasury users** who want a clean, auditable payoff structure
- **Retail users** who want directional exposure without margin complexity

### Well suited to Solana
Solana makes this product practical because it offers:
1. **Fast execution** for clean expiry and settlement flows
2. **Low transaction costs** for fixed-payout instruments
3. **Strong token composability** through standard SPL assets
4. **Reliable oracle integration** for deterministic market resolution

---

## Architecture Summary

FXShield uses a fully collateralized market design.

1. **Market creation**  
   A market is created with a defined underlying pair, strike level, and expiry time.

2. **Collateral deposit and note issuance**  
   Collateral is locked into the market vault, and outcome notes are issued for that market.

3. **Settlement at expiry**  
   When the market expires, the protocol reads the final price from the oracle and determines the winning outcome.

4. **Payout redemption**  
   Holders of the winning notes can redeem against the locked collateral.

This structure keeps the product simple:
- no liquidation engine
- no margin call flow
- no order book requirement in the MVP
- no governance token dependency
