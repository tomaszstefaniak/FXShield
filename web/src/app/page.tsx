"use client";

import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import { Buffer } from "buffer";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { IDL, PROGRAM_ID } from "@/idl/fxshield";

if (typeof window !== "undefined") {
  (window as any).Buffer = (window as any).Buffer || require("buffer").Buffer;
}

const EXPIRY_BUFFER = 180;
const PYTH_ORACLE = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLSRTSndpeCPy");
const COLLATERAL_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export default function Home() {
  const { connection } = useConnection();
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.from(".gsap-fade-up", {
      y: 40,
      opacity: 0,
      duration: 1,
      stagger: 0.15,
      ease: "power3.out",
      delay: 0.1
    });
  }, { scope: containerRef });
  const wallet = useWallet();
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState("");
  const [mounted, setMounted] = useState(false);

  const [marketState, setMarketState] = useState<any>(null);
  const [marketAddress, setMarketAddress] = useState<PublicKey | null>(null);

  const [expiryTs, setExpiryTs] = useState<BN>(new BN(0));
  const [strikePrice, setStrikePrice] = useState<BN>(new BN(0));
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
  const [vaultUsdcBalance, setVaultUsdcBalance] = useState<string>("0.00");
  const [currentTs, setCurrentTs] = useState<number>(Math.floor(Date.now() / 1000));

  const [isAdminMode, setIsAdminMode] = useState(false);
  const [hasPosition, setHasPosition] = useState(false);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [noteBalance, setNoteBalance] = useState("0");
  const [direction, setDirection] = useState<"above" | "below">("above");

  useEffect(() => {
    const savedDirection = localStorage.getItem("fxshield_position_direction");
    if (savedDirection === "above" || savedDirection === "below") {
      setDirection(savedDirection);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    const cachedExpiry = localStorage.getItem("fxshield_expiryTs");
    const cachedStrike = localStorage.getItem("fxshield_strikePrice");
    if (cachedExpiry && cachedStrike) {
      setExpiryTs(new BN(cachedExpiry));
      setStrikePrice(new BN(cachedStrike));
    }

    const fetchSolPrice = async () => {
      try {
        const res = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids[]=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d");
        const data = await res.json();
        if (data && data.parsed && data.parsed[0]) {
          const priceData = data.parsed[0].price;
          const priceStr = priceData.price;
          const expo = priceData.expo;
          const currentPrice = Number(priceStr) * Math.pow(10, expo);
          setSolPrice(currentPrice);

          if (!localStorage.getItem("fxshield_strikePrice")) {
            const targetStrike = currentPrice * 1.001;
            const strikeBn = new BN(Math.floor(targetStrike * 1_000_000));
            const ts = new BN(Math.floor(Date.now() / 1000) + EXPIRY_BUFFER);
            localStorage.setItem("fxshield_strikePrice", strikeBn.toString());
            localStorage.setItem("fxshield_expiryTs", ts.toString());
            setStrikePrice(strikeBn);
            setExpiryTs(ts);
          }
        }
      } catch (e) {
        console.warn("Failed to ping Pyth Hermes", e);
      }
    };
    fetchSolPrice();
    const priceInterval = setInterval(fetchSolPrice, 10000);
    const timerInterval = setInterval(() => setCurrentTs(Math.floor(Date.now() / 1000)), 1000);
    return () => {
      clearInterval(priceInterval);
      clearInterval(timerInterval);
    };
  }, []);

  const formatAddress = (addr: PublicKey | null) => {
    if (!addr) return "Not Calculated";
    const str = addr.toBase58();
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  };

  const getProgram = () => {
    const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
    return new Program(IDL as any, provider);
  };

  const getDerivedAccounts = () => {
    const program = getProgram();

    if (expiryTs.toNumber() === 0 || strikePrice.toNumber() === 0) throw new Error("ExpiryTs or StrikePrice is not initialized");

    const [market] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("market"),
        PYTH_ORACLE.toBuffer(),
        strikePrice.toArrayLike(Buffer, "le", 8),
        expiryTs.toArrayLike(Buffer, "le", 8),
      ],
      program.programId
    );

    const [marketVault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), market.toBuffer()],
      program.programId
    );

    const [longNoteMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("long_note"), market.toBuffer()],
      program.programId
    );

    const [shortNoteMint] = PublicKey.findProgramAddressSync(
      [Buffer.from("short_note"), market.toBuffer()],
      program.programId
    );

    return { market, marketVault, longNoteMint, shortNoteMint };
  };

  const loadMarketData = async () => {
    if (!wallet.publicKey || expiryTs.toNumber() === 0) return;
    try {
      const program = getProgram();
      const { market } = getDerivedAccounts();
      setMarketAddress(market);

      const state = await (program.account as any).marketState.fetchNullable(market);
      setMarketState(state);

      const userCollateralAta = getAssociatedTokenAddressSync(COLLATERAL_MINT, wallet.publicKey);
      try {
        const balance = await connection.getTokenAccountBalance(userCollateralAta);
        setUsdcBalance(balance.value.uiAmountString ?? "0.00");
      } catch (e) {
        setUsdcBalance("0.00");
      }

      const { marketVault } = getDerivedAccounts();
      try {
        const vaultBal = await connection.getTokenAccountBalance(marketVault);
        setVaultUsdcBalance(vaultBal.value.uiAmountString ?? "0.00");
      } catch (e) {
        setVaultUsdcBalance("0.00");
      }

      const { longNoteMint } = getDerivedAccounts();
      const userLongNoteAta = getAssociatedTokenAddressSync(longNoteMint, wallet.publicKey);
      try {
        const noteBal = await connection.getTokenAccountBalance(userLongNoteAta);
        if (Number(noteBal.value.uiAmountString) > 0) {
          setHasPosition(true);
          setNoteBalance(noteBal.value.uiAmountString || "0");
        } else {
          setHasPosition(false);
          setNoteBalance("0");
        }
      } catch (e) {
        setHasPosition(false);
        setNoteBalance("0");
      }
    } catch (e) {
      console.error("Error loading market:", e);
    }
  };

  useEffect(() => {
    if (wallet.publicKey) {
      loadMarketData();
      const interval = setInterval(loadMarketData, 5000);
      return () => clearInterval(interval);
    }
  }, [wallet.publicKey, expiryTs]);

  const handleInitMarket = async () => {
    if (!wallet.publicKey) return;
    try {
      setLoading(true);
      setLog("Initializing Market (Deriving PDA mappings)...");
      const program = getProgram();

      const freshExpiryTs = new BN(Math.floor(Date.now() / 1000) + EXPIRY_BUFFER);
      localStorage.setItem("fxshield_expiryTs", freshExpiryTs.toString());
      setExpiryTs(freshExpiryTs);

      let freshStrike = strikePrice;
      if (solPrice) {
        freshStrike = new BN(Math.floor(solPrice * 1.001 * 1_000_000));
        localStorage.setItem("fxshield_strikePrice", freshStrike.toString());
        setStrikePrice(freshStrike);
      }

      const [market] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("market"),
          PYTH_ORACLE.toBuffer(),
          freshStrike.toArrayLike(Buffer, "le", 8),
          freshExpiryTs.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [marketVault] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), market.toBuffer()],
        program.programId
      );

      const txSignature = await program.methods
        .initializeMarket(freshStrike, freshExpiryTs)
        .accounts({
          creator: wallet.publicKey,
          market: market,
          collateralMint: COLLATERAL_MINT,
          pythOracle: PYTH_ORACLE,
          marketVault: marketVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rentInfo: SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();

      setLog(`Successfully initialized market!\nTx: ${txSignature}`);
      await loadMarketData();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("already been processed") || err.message?.includes("already in use")) {
        setLog("Transaction already processed! Reloading state...");
        await loadMarketData();
      } else {
        setLog(`Error Initializing Market: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInitMints = async () => {
    if (!wallet.publicKey) return;
    try {
      setLoading(true);
      setLog("Initializing Note Mints (Long & Short)...");
      const program = getProgram();
      const { market, longNoteMint, shortNoteMint } = getDerivedAccounts();

      const [longMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), longNoteMint.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      );

      const [shortMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), shortNoteMint.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
      );

      const txSignature = await program.methods
        .initNoteMints()
        .accounts({
          creator: wallet.publicKey,
          market: market,
          collateralMint: COLLATERAL_MINT,
          longNoteMint: longNoteMint,
          shortNoteMint: shortNoteMint,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
          longMetadata: longMetadata,
          shortMetadata: shortMetadata,
          rentInfo: SYSVAR_RENT_PUBKEY,
        } as any)
        .rpc();

      setLog(`Sub-mints Successfully Initialized!\nTx: ${txSignature}`);
      await loadMarketData();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("already been processed")) {
        setLog("Transaction already processed! Reloading state...");
        await loadMarketData();
      } else {
        setLog(`Error Initializing Mints: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMintNotes = async () => {
    if (!wallet.publicKey) return;
    try {
      setLoading(true);
      setLog("Preparing Mint execution...");
      const program = getProgram();
      const { market, marketVault, longNoteMint, shortNoteMint } = getDerivedAccounts();

      const amount = new BN(10 * 1_000_000);

      const userCollateralAta = getAssociatedTokenAddressSync(COLLATERAL_MINT, wallet.publicKey);
      const userLongNoteAta = getAssociatedTokenAddressSync(longNoteMint, wallet.publicKey);
      const userShortNoteAta = getAssociatedTokenAddressSync(shortNoteMint, wallet.publicKey);

      const tx = new Transaction();

      const checkAndCreateAta = async (ata: PublicKey, mint: PublicKey) => {
        const info = await connection.getAccountInfo(ata);
        if (!info) {
          setLog((prev) => prev + `\nCreating ATA for mint ${mint.toBase58().slice(0, 4)}...`);
          tx.add(
            createAssociatedTokenAccountInstruction(
              wallet.publicKey!,
              ata,
              wallet.publicKey!,
              mint
            )
          );
        }
      };

      await checkAndCreateAta(userCollateralAta, COLLATERAL_MINT);
      await checkAndCreateAta(userLongNoteAta, longNoteMint);
      await checkAndCreateAta(userShortNoteAta, shortNoteMint);

      setLog((prev) => prev + "\nInvoking Mint Notes execution block...");

      const mintIx = await program.methods
        .mintNotes(amount)
        .accounts({
          user: wallet.publicKey,
          market: market,
          collateralMint: COLLATERAL_MINT,
          userCollateralAta: userCollateralAta,
          marketVault: marketVault,
          longNoteMint: longNoteMint,
          userLongNoteAta: userLongNoteAta,
          shortNoteMint: shortNoteMint,
          userShortNoteAta: userShortNoteAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        } as any)
        .instruction();

      tx.add(mintIx);

      const provider = getProgram().provider as AnchorProvider;
      const txSignature = await provider.sendAndConfirm(tx);

      localStorage.setItem("fxshield_position_direction", direction);

      setLog(`Minting Executed!\nTransferred Collateral inside vault.\nIssued Local Derivative Position Notes.\nTx: ${txSignature}`);
      await loadMarketData();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("0x1")) {
        setLog("Error: Insufficient USDC. Please fund your wallet.");
      } else if (err.message?.includes("already been processed")) {
        setLog("Transaction already processed! Reloading state...");
        await loadMarketData();
      } else {
        setLog(`Error Minting Notes: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSettleMarket = async () => {
    if (!wallet.publicKey) return;
    try {
      setLoading(true);
      setLog("Invoking Settlement – reading Pyth Oracle feed...");
      const program = getProgram();
      const { market } = getDerivedAccounts();

      if (solPrice === null) {
        setLog("Cannot settle: Solana price is currently unavailable.");
        setLoading(false);
        return;
      }

      const scaledPrice = Math.floor(solPrice * 1_000_000);
      const settlementPrice = new BN(scaledPrice);

      const txSignature = await program.methods
        .settleMarket(settlementPrice)
        .accounts({
          caller: wallet.publicKey,
          market: market,
        } as any)
        .rpc();

      setLog(`Market Settled!\nAdmin manually pushed Pyth Settlement Price: $${solPrice.toFixed(2)}\nTx: ${txSignature}`);
      await loadMarketData();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("StillActive")) {
        setLog("Market has not expired yet. Please wait for the countdown to reach 00:00.");
      } else if (err.message?.includes("MarketAlreadySettled")) {
        setLog("Market is already settled! Reloading state...");
        await loadMarketData();
      } else if (err.message?.includes("already been processed")) {
        setLog("Settlement already processed! Reloading state...");
        await loadMarketData();
      } else {
        setLog(`Error Settling Market: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRedeemNotes = async () => {
    if (!wallet.publicKey) return;
    try {
      setLoading(true);
      setLog("Preparing Redemption – burning winning notes and claiming collateral...");
      const program = getProgram();
      const { market, marketVault, longNoteMint, shortNoteMint } = getDerivedAccounts();

      const isAbove = direction === 'above';
      const targetNoteMint = isAbove ? longNoteMint : shortNoteMint;

      const userCollateralAta = getAssociatedTokenAddressSync(COLLATERAL_MINT, wallet.publicKey);
      const userNoteAta = getAssociatedTokenAddressSync(targetNoteMint, wallet.publicKey);

      let redeemAmount: BN;
      try {
        const noteBal = await connection.getTokenAccountBalance(userNoteAta);
        const rawAmount = noteBal.value.amount;
        if (!rawAmount || rawAmount === "0") {
          setLog("You don't hold any notes on this side to redeem.");
          return;
        }
        redeemAmount = new BN(rawAmount);
      } catch (e) {
        setLog("No note token account found. You may not have a position on this side.");
        return;
      }

      const txSignature = await program.methods
        .redeemNotes(redeemAmount)
        .accounts({
          user: wallet.publicKey,
          market: market,
          collateralMint: COLLATERAL_MINT,
          marketVault: marketVault,
          userCollateralAta: userCollateralAta,
          targetNoteMint: targetNoteMint,
          userNoteAta: userNoteAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();

      setLog(`Redemption Successful!\nBurned ${redeemAmount.toString()} winning notes.\nCollateral returned to your wallet.\nTx: ${txSignature}`);
      setHasClaimed(true);
      await loadMarketData();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("NotWinningNote")) {
        setLog("Your notes are not the winning side. No payout available.");
      } else if (err.message?.includes("NotSettled")) {
        setLog("Market is not settled yet.");
      } else if (err.message?.includes("0x1")) {
        setLog("Insufficient funds in Vault. Switch to Admin mode and top up the vault to claim winnings.");
      } else if (err.message?.includes("already been processed")) {
        setLog("Transaction already processed! If you already claimed, your notes are burned.");
        setHasClaimed(true);
        await loadMarketData();
      } else {
        setLog(`Error Redeeming Notes: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetSandbox = () => {
    localStorage.removeItem("fxshield_expiryTs");
    localStorage.removeItem("fxshield_strikePrice");
    localStorage.removeItem("fxshield_position_direction");
    setLog("Sandbox state cleared. Reloading...");
    setTimeout(() => window.location.reload(), 1000);
  };

  const handleFundVault = async (fundAmount: number) => {
    if (!wallet.publicKey) return;
    try {
      setLoading(true);
      setLog(`Funding vault with ${fundAmount} USDC...`);
      const { marketVault } = getDerivedAccounts();

      const userCollateralAta = getAssociatedTokenAddressSync(COLLATERAL_MINT, wallet.publicKey);

      const { createTransferInstruction } = await import("@solana/spl-token");
      const tx = new Transaction().add(
        createTransferInstruction(
          userCollateralAta,
          marketVault,
          wallet.publicKey,
          fundAmount * 1_000_000,
        )
      );

      const signature = await wallet.sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      setLog(`Vault funded with ${fundAmount} USDC!\nVault: ${marketVault.toBase58()}\nTx: ${signature}`);
      await loadMarketData();
    } catch (err: any) {
      console.error(err);
      setLog(`Error funding vault: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderAdminControls = () => {
    if (!wallet.publicKey) {
      return <p className="text-gray-400 text-sm">Please connect a wallet to interact.</p>;
    }

    if (expiryTs.toNumber() === 0) {
      return <p className="text-gray-400 text-sm">Synchronizing Blockchain Clock...</p>;
    }

    if (!marketState) {
      return (
        <div>
          <p className="text-[var(--color-primary)] text-sm mb-4">Phase Layout: 0 (Uninitialized Market Cache)</p>
          <button
            onClick={handleInitMarket}
            disabled={loading}
            className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary)]/20 glass-panel-hover disabled:opacity-50 font-bold py-4 rounded-xl transition-all"
          >
            {loading ? "Processing..." : "Initialize New Market"}
          </button>
        </div>
      );
    }

    if (!marketState.mintsInitialized) {
      return (
        <div>
          <p className="text-pink-400 text-sm mb-4">Phase Layout: 1 (Deploying Derivative Tokens)</p>
          <p className="text-gray-500 text-xs mb-4">Market PDA is active, but LONG/SHORT recursive derivative notes must be compiled natively to begin trading.</p>
          <button
            onClick={handleInitMints}
            disabled={loading}
            className="w-full bg-pink-600 hover:bg-pink-500 disabled:opacity-50 font-bold py-4 rounded-xl transition-all"
          >
            {loading ? "Processing..." : "Initialize Note Mints"}
          </button>
        </div>
      );
    }

    if (!marketState.isSettled) {
      const isExpired = currentTs >= marketState.expiryTs.toNumber();
      return (
        <div className="space-y-4">
          <div className="flex justify-between items-center glass-panel gsap-fade-up px-4 py-3 rounded-lg border border-gray-800 shadow-inner">
            <span className="text-gray-400 font-mono text-sm">Target Oracle Expiration</span>
            {!isExpired ? (
              <span className="text-orange-400 font-mono font-bold animate-pulse">
                {Math.floor((marketState.expiryTs.toNumber() - currentTs) / 60).toString().padStart(2, '0')}:
                {((marketState.expiryTs.toNumber() - currentTs) % 60).toString().padStart(2, '0')}
              </span>
            ) : (
              <span className="text-green-400 font-mono font-bold">EXPIRED / READY</span>
            )}
          </div>

          <p className="text-green-400 text-sm mb-2">Phase Layout: 2 (Active Market)</p>
          <p className="text-gray-500 text-xs mb-4">Derivative notes are active! You may exchange Exogenous Collateral (USDC) into symmetric quantities of LONG/SHORT options mapping exactly to the ${(strikePrice.toNumber() / 1_000_000).toFixed(2)} strike price threshold against Pyth.</p>

          <button
            onClick={handleMintNotes}
            disabled={loading || isExpired}
            className="w-full bg-green-600 hover:bg-green-500 shadow-lg shadow-green-500/20 glass-panel-hover disabled:opacity-50 font-bold py-4 rounded-xl transition-all"
          >
            {loading ? "Processing..." : isExpired ? "Market Expired (Minting Closed)" : "Mint Notes (10 USDC)"}
          </button>

          <div className="flex space-x-2 mt-3">
            <button
              onClick={() => handleFundVault(10)}
              disabled={loading}
              className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 font-bold py-3 rounded-xl transition-all text-sm"
            >
              {loading ? "..." : "Fund Vault +10"}
            </button>
            <button
              onClick={() => handleFundVault(20)}
              disabled={loading}
              className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 font-bold py-3 rounded-xl transition-all text-sm"
            >
              {loading ? "..." : "Fund Vault +20"}
            </button>
          </div>
          <p className="text-gray-600 text-[10px] mt-1 text-center">Funds the current market vault for payouts (per-market PDA)</p>

          <div className="pt-6 border-t border-gray-800">
            <p className="text-gray-400 text-xs mb-3 italic">{isExpired ? "Oracle expiry reached – you may now settle the market to lock in the final price." : "Advanced: The Settle endpoint physically verifies Oracle streams, requiring chronological blockchain expiration requirements."}</p>
            <button
              onClick={isExpired ? handleSettleMarket : undefined}
              disabled={!isExpired || loading}
              className={isExpired
                ? "w-full bg-[var(--color-warning)] hover:brightness-110 shadow-lg shadow-[var(--color-warning)]/20 glass-panel-hover disabled:opacity-50 font-bold py-4 rounded-xl transition-all"
                : "w-full bg-gray-800 text-gray-500 opacity-50 cursor-not-allowed font-bold py-4 rounded-xl transition-all"}
            >
              {loading ? "Processing..." : isExpired ? "Settle Market Now" : "Settle Market (Awaiting Oracle Target)"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div>
        <p className="text-purple-400 text-sm mb-4">Phase Layout: 3 (Settled Protocol)</p>
        <p className="text-gray-500 text-xs mb-4">Execution payload finalized. Winning notes are strictly enabled for underlying liquidity Redemption.</p>
        <button
          onClick={handleRedeemNotes}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-500 shadow-lg shadow-purple-500/20 glass-panel-hover disabled:opacity-50 font-bold py-4 rounded-xl transition-all"
        >
          {loading ? "Processing..." : "Redeem Winning Notes"}
        </button>

        <div className="flex space-x-2 mt-3">
          <button
            onClick={() => handleFundVault(10)}
            disabled={loading}
            className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 font-bold py-3 rounded-xl transition-all text-sm"
          >
            {loading ? "..." : "Fund Vault +10"}
          </button>
          <button
            onClick={() => handleFundVault(20)}
            disabled={loading}
            className="flex-1 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 font-bold py-3 rounded-xl transition-all text-sm"
          >
            {loading ? "..." : "Fund Vault +20"}
          </button>
        </div>
      </div>
    );
  };

  const renderUserControls = () => {
    if (!wallet.publicKey) {
      return (
        <div className="text-center py-24 glass-panel rounded-2xl gsap-fade-up shadow-xl">
          <h2 className="text-2xl font-bold mb-4">Simple FX outcome markets on Solana</h2>
          <p className="text-gray-400 mb-8 max-w-sm mx-auto">A simple way to hedge or bet on where SOL/USD will be at a fixed time.</p>
          <div className="inline-block scale-110">
            {mounted && <WalletMultiButton className="!bg-[var(--color-primary)] hover:!bg-[var(--color-primary-hover)] glass-panel-hover !rounded-xl !font-bold transition-all" />}
          </div>
        </div>
      );
    }

    if (expiryTs.toNumber() === 0) {
      return <p className="text-gray-400 text-sm text-center py-10">Synchronizing...</p>;
    }

    if (!marketState || !marketState.mintsInitialized) {
      return (
        <>
          <div className="text-center py-20 glass-panel rounded-2xl gsap-fade-up shadow-xl max-w-md mx-auto">
            <p className="text-gray-500 mb-2 text-sm italic">Featured market is currently being prepared...</p>
          </div>
          <div className="bg-indigo-950/30 border border-[var(--color-primary)]/20 rounded-xl p-5 mt-4 max-w-md mx-auto">
            <h4 className="text-[var(--color-primary)] text-xs font-bold uppercase tracking-widest mb-2">MVP Testing</h4>
            <p className="text-gray-400 text-sm">Switch to <span className="text-white font-bold">"Admin / Operator Mode"</span> (top right) to Initialize the Market & Mints before trading can begin.</p>
          </div>
        </>
      );
    }

    const isExpired = currentTs >= marketState.expiryTs.toNumber();

    if (marketState.isSettled) {
      if (!hasPosition && !hasClaimed) {
        return (
          <div className="glass-panel gsap-fade-up rounded-2xl p-8 border border-gray-800 shadow-xl max-w-md mx-auto text-center">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-gray-800 text-gray-400 mb-6 mx-auto">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Market Settled</h3>
            <p className="text-gray-400 text-sm mb-6">This market has concluded. You did not hold a position in this round.</p>
            <button
              onClick={handleResetSandbox}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary)]/20 glass-panel-hover text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
            >
              Start New Round
            </button>
          </div>
        );
      }

      const settlementPrice = marketState.settlementPrice ? (Number(marketState.settlementPrice.toString()) / 1_000_000) : 0;
      const strike = strikePrice.toNumber() / 1_000_000;
      const longWon = settlementPrice >= strike;
      const userWon = (direction === 'above' && longWon) || (direction === 'below' && !longWon);

      if (userWon) {
        if (hasClaimed) {
          return (
            <div className="glass-panel gsap-fade-up rounded-2xl p-8 border border-green-800/50 shadow-xl max-w-md mx-auto">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 text-green-400 mb-6 mx-auto">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-2xl font-bold text-center text-green-400 mb-2">Winnings Claimed! </h3>
              <p className="text-gray-400 text-sm text-center mb-6">Your payout has been sent directly to your wallet. The smart contract has burned your notes.</p>
              <button
                onClick={handleResetSandbox}
                className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] shadow-lg shadow-[var(--color-primary)]/20 glass-panel-hover text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
              >
                Start New Round
              </button>
            </div>
          );
        }

        return (
          <>
            <div className="glass-panel gsap-fade-up rounded-2xl p-8 border border-green-800/50 shadow-xl max-w-md mx-auto">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 text-green-400 mb-6 mx-auto">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h3 className="text-2xl font-bold text-center text-green-400 mb-2">You Won! </h3>
              <p className="text-gray-400 text-sm text-center mb-4">SOL settled at <span className="text-white font-bold">${settlementPrice.toFixed(2)}</span> – your prediction was correct!</p>
              <div className="bg-black/40 rounded-xl p-4 mb-6 space-y-2 border border-gray-800">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Your bet</span>
                  <span className="text-white font-medium">{direction === 'above' ? 'Above' : 'Below'} ${strike.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Settlement price</span>
                  <span className="text-green-400 font-bold">${settlementPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Payout</span>
                  <span className="text-green-400 font-bold">{(Number(noteBalance) * 2).toFixed(2)} USDC (+100%)</span>
                </div>
              </div>

              <button
                onClick={handleRedeemNotes}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-500 shadow-lg shadow-green-500/20 glass-panel-hover disabled:opacity-50 font-bold py-4 rounded-xl transition-all"
              >
                {loading ? "Processing..." : "Claim Winnings"}
              </button>
              <button
                onClick={handleResetSandbox}
                className="w-full mt-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-3 rounded-xl transition-all border border-gray-700"
              >
                Start New Round
              </button>
              <p className="text-center text-xs text-gray-500 mt-3">Claim first, then start a new round.</p>
            </div>
            
            <div className="bg-indigo-950/30 border border-[var(--color-primary)]/20 rounded-xl p-5 mt-4 max-w-md mx-auto">
              <h4 className="text-[var(--color-primary)] text-xs font-bold uppercase tracking-widest mb-2">MVP Testing</h4>
              <p className="text-gray-400 text-sm">If the transaction fails, the vault may be empty. Switch to <span className="text-white font-bold">"Admin / Operator Mode"</span> to top up the vault before claiming your winnings.</p>
            </div>
          </>
        );
      } else {
        return (
          <div className="glass-panel gsap-fade-up rounded-2xl p-8 border border-red-900/30 shadow-xl max-w-md mx-auto">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/20 text-red-400 mb-6 mx-auto">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </div>
            <h3 className="text-2xl font-bold text-center text-red-400 mb-2">You Lost</h3>
            <p className="text-gray-400 text-sm text-center mb-4">SOL settled at <span className="text-white font-bold">${settlementPrice.toFixed(2)}</span> – your prediction was incorrect.</p>
            <div className="bg-black/40 rounded-xl p-4 mb-6 space-y-2 border border-gray-800">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Your bet</span>
                <span className="text-white font-medium">{direction === 'above' ? 'Above' : 'Below'} ${strike.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Settlement price</span>
                <span className="text-red-400 font-bold">${settlementPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Loss</span>
                <span className="text-red-400 font-bold">-{noteBalance} USDC</span>
              </div>
            </div>
            <p className="text-center text-sm text-gray-500 mb-4">Your notes expired worthless. Better luck next time!</p>
            <button
              onClick={handleResetSandbox}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-3 rounded-xl transition-all border border-gray-700"
            >
              Start New Round
            </button>
          </div>
        );
      }
    }

    if (isExpired) {
      return (
        <>
          <div className="glass-panel gsap-fade-up rounded-2xl p-8 border border-gray-800 shadow-xl max-w-md mx-auto text-center">
            <div className="animate-pulse flex items-center justify-center w-12 h-12 rounded-full bg-orange-500/20 text-orange-400 mb-6 mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <h3 className="text-xl font-bold text-orange-400 mb-2">Expired – awaiting resolution</h3>
            <p className="text-gray-400 text-sm">Target timestamp reached. Settlement pending via Pyth oracle feed.</p>
          </div>
          <div className="bg-amber-950/30 border border-amber-500/20 rounded-xl p-5 mt-4 max-w-md mx-auto">
            <h4 className="text-amber-400 text-xs font-bold uppercase tracking-widest mb-2">MVP Testing</h4>
            <p className="text-gray-400 text-sm">Switch to <span className="text-white font-bold">"Admin / Operator Mode"</span> (top right) and click <span className="text-white font-bold">"Settle Market Now"</span> to resolve.</p>
          </div>
        </>
      );
    }

    if (hasPosition) {
      const diff = marketState.expiryTs.toNumber() - currentTs;
      const mins = Math.floor(diff / 60);
      const secs = diff % 60;
      const formattedCountdown = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      return (
        <div className="glass-panel gsap-fade-up rounded-2xl p-8 border border-gray-800 shadow-xl max-w-md mx-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
          <h3 className="text-sm uppercase tracking-widest text-[var(--color-primary)] font-bold mb-6">Your Position</h3>

          <h2 className="text-3xl font-bold text-white mb-8">SOL/USD {direction === 'above' ? 'Above' : 'Below'} {(strikePrice.toNumber() / 1_000_000).toFixed(2)}</h2>

          <div className="space-y-4 mb-8">
            <div className="flex justify-between items-center pb-4 border-b border-gray-800">
              <span className="text-gray-400">You hold</span>
              <span className="text-white text-lg font-bold">{noteBalance} {direction === 'above' ? 'Yes' : 'No'} Notes</span>
            </div>
            <div className="flex justify-between items-center pb-4 border-b border-gray-800">
              <span className="text-gray-400">Max loss</span>
              <span className="text-red-400 font-medium">-{noteBalance} USDC (100%)</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Max payout</span>
              <span className="text-green-400 text-lg font-bold">{(Number(noteBalance) * 2).toFixed(2)} USDC (+100%)</span>
            </div>
          </div>

          <div className="bg-black/50 rounded-xl p-4 space-y-3 border border-gray-800">
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Current SOL/USD</span>
              {solPrice ? (
                <span className={`font-mono font-bold ${(() => {
                  const strike = strikePrice.toNumber() / 1_000_000;
                  const winning = direction === 'above' ? solPrice >= strike : solPrice < strike;
                  return winning ? 'text-green-400' : 'text-red-400';
                })()}`}>
                  ${solPrice.toFixed(2)}
                  <span className="ml-2 text-xs">
                    {(() => {
                      const strike = strikePrice.toNumber() / 1_000_000;
                      const winning = direction === 'above' ? solPrice >= strike : solPrice < strike;
                      return winning ? 'Winning' : 'Losing';
                    })()}
                  </span>
                </span>
              ) : (
                <span className="text-gray-500 font-mono">Loading...</span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-sm">Target Price</span>
              <span className="text-white font-mono">${(strikePrice.toNumber() / 1_000_000).toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-gray-800">
              <span className="text-gray-400 text-sm">Ends in</span>
              <span className="text-white font-mono font-bold">{formattedCountdown}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="glass-panel gsap-fade-up rounded-2xl p-8 border border-gray-800 hover:border-[var(--color-primary)]/50 transition-colors shadow-2xl max-w-md mx-auto relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-primary)]/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
        <div className="flex justify-between items-start mb-6 relative z-10">
          <div>
            <span className="px-3 py-1 bg-indigo-900/40 text-[var(--color-primary)] text-[10px] font-bold rounded-full uppercase tracking-widest border border-[var(--color-primary)]/20">Featured Market</span>
            <h3 className="text-3xl font-extrabold text-white mt-4">SOL/USD {direction === 'above' ? 'Above' : 'Below'} {(strikePrice.toNumber() / 1_000_000).toFixed(2)}</h3>
            <p className="text-gray-400 mt-2 text-sm">Predict if SOL will close {direction === 'above' ? 'above' : 'below'} ${(strikePrice.toNumber() / 1_000_000).toFixed(2)} by expiry.</p>
          </div>
        </div>

        <div className="flex space-x-3 mb-6">
          <button onClick={() => setDirection('above')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${direction === 'above' ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-indigo-500/20' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800'}`}>ABOVE</button>
          <button onClick={() => setDirection('below')} className={`flex-1 py-3 rounded-xl font-bold transition-all ${direction === 'below' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-gray-900 text-gray-500 border border-gray-800 hover:bg-gray-800'}`}>BELOW</button>
        </div>

        <div className="bg-black/40 rounded-xl p-5 space-y-3 mb-8 border border-gray-800/50">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Price per note</span>
            <span className="text-white font-medium">1.00 USDC</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Payout if correct</span>
            <span className="text-green-400 font-bold text-base">20.00 USDC (+100%)</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400">Verified by</span>
            <div className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              <span className="text-white">Pyth Network</span>
            </div>
          </div>
          {marketState && (
            <>
              <div className="flex justify-between items-center text-sm pt-3 border-t border-gray-800/50">
                <span className="text-gray-400">Betting closes in</span>
                <span className="text-amber-400 font-mono font-bold">
                  {(() => {
                    const diff = marketState.expiryTs.toNumber() - currentTs;
                    const bettingDiff = diff - 90;
                    if (bettingDiff <= 0) return "Closed";
                    const mins = Math.floor(bettingDiff / 60);
                    const secs = bettingDiff % 60;
                    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                  })()}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400">Market ends in</span>
                <span className="text-white font-mono font-bold">
                  {(() => {
                    const diff = marketState.expiryTs.toNumber() - currentTs;
                    if (diff <= 0) return "00:00";
                    const mins = Math.floor(diff / 60);
                    const secs = diff % 60;
                    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                  })()}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="space-y-3">
          {(() => {
            const timeLeft = marketState ? marketState.expiryTs.toNumber() - currentTs : 999;
            const tooLate = timeLeft <= 90;
            return (
              <>
                <button
                  onClick={handleMintNotes}
                  disabled={loading || tooLate}
                  className={`w-full hover:bg-gray-100 text-black shadow-lg disabled:opacity-50 font-bold py-4 rounded-xl transition-all ${direction === 'above' ? 'bg-white' : 'bg-gray-300'}`}
                >
                  {loading ? "Processing..." : tooLate ? "Betting closed (< 90s left)" : (direction === 'above' ? "Buy 10 Yes Notes" : "Buy 10 No Notes")}
                </button>
                <p className="text-center text-xs text-gray-500">{tooLate ? "Market closes in less than 90 seconds" : "You pay now: 10.00 USDC"}</p>
              </>
            );
          })()}
        </div>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="min-h-screen text-white font-sans flex flex-col pt-12 pb-24 relative z-10">
      <div className="max-w-5xl mx-auto w-full px-6">
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-baseline space-x-3">
            <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="text-[var(--color-primary)]">FX</span>Shield
            </h1>
            {isAdminMode && <span className="text-red-500 text-[10px] uppercase tracking-widest font-bold px-2 py-1 bg-red-950/50 rounded-sm border border-red-900/50">Admin Mode Active</span>}
          </div>

          <div className="flex items-center space-x-6">
            <button
              onClick={() => setIsAdminMode(!isAdminMode)}
              className="text-gray-500 hover:text-white text-xs font-medium transition-colors border border-gray-800 px-3 py-1.5 rounded-lg hover:border-gray-600"
            >
              {isAdminMode ? "Exit Admin Mode" : "Admin / Operator Mode"}
            </button>
            {mounted && (!isAdminMode) && wallet.publicKey && <WalletMultiButton className="!glass-panel gsap-fade-up !border !border-gray-800 hover:!bg-gray-900 !rounded-xl !font-bold !text-sm transition-all shadow-lg" />}
          </div>
        </div>

        {isAdminMode ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8" style={{ perspective: "1200px" }}>
            <div className="glass-panel rounded-2xl gsap-fade-up p-8 shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold mb-1">Protocol Deployment</h2>
                  <p className="text-gray-400 text-sm max-w-sm">Interactive Endpoint Environment mapped natively to the <a href={`https://explorer.solana.com/address/${PROGRAM_ID}?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="font-mono text-[var(--color-primary)] hover:text-indigo-300 transition-colors underline underline-offset-2">{formatAddress(new PublicKey(PROGRAM_ID))}</a> program.</p>
                </div>
                {mounted && <WalletMultiButton className="!bg-[var(--color-primary)] hover:!bg-[var(--color-primary-hover)] glass-panel-hover !rounded-xl !font-bold !text-xs transition-all" />}
              </div>

              <div className="bg-gray-950 p-4 rounded-xl mb-6 font-mono text-xs border border-gray-800 flex flex-col space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target Asset Feed</span>
                  <span className="text-green-400">Devnet SOL/USD</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Current SOL Price</span>
                  <span className="text-white">{solPrice ? `$${solPrice.toFixed(2)}` : "Fetching..."}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Derivative Strike Price</span>
                  <span className="text-white">${(strikePrice.toNumber() / 1_000_000).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">State Derived Address</span>
                  <span className="text-[var(--color-primary)] text-right">{formatAddress(marketAddress)}</span>
                </div>
                {(() => {
                  try {
                    const { marketVault } = getDerivedAccounts();
                    return (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500">Vault Address</span>
                        <span className="text-amber-400 text-right text-[11px] font-mono cursor-pointer" onClick={() => { navigator.clipboard.writeText(marketVault.toBase58()); setLog('Vault address copied: ' + marketVault.toBase58()); }}>{formatAddress(marketVault)} 📋</span>
                      </div>
                    );
                  } catch { return null; }
                })()}
                <div className="bg-gray-900 -mx-4 -mb-4 p-4 mt-2 rounded-b-xl border-t border-gray-800 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Your USDC Balance</span>
                    <span className={usdcBalance === "0.00" || usdcBalance === "0" ? "text-red-400 font-bold" : "text-green-400 font-bold"}>{usdcBalance} USDC</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-gray-800/50">
                    <span className="text-gray-500">Vault USDC Balance</span>
                    <span className={vaultUsdcBalance === "0.00" || vaultUsdcBalance === "0" ? "text-red-400 font-bold" : "text-amber-400 font-bold"}>{vaultUsdcBalance} USDC</span>
                  </div>
                </div>
              </div>

              {renderAdminControls()}

              {(marketState || expiryTs.toNumber() > 0) && (
                <button
                  onClick={handleResetSandbox}
                  className="w-full mt-6 bg-transparent border border-red-900/50 text-red-500 hover:bg-red-950/30 text-xs font-bold py-3 rounded-xl transition-all"
                >
                  Reset Sandbox State (Wipe Local PDA Cache)
                </button>
              )}
            </div>

            <div className="glass-panel rounded-2xl p-6 shadow-2xl gsap-fade-up flex flex-col font-mono text-xs h-full min-h-[400px] transition-transform duration-700 ease-out hover:[transform:rotateX(2deg)_rotateY(2deg)]" style={{ transformStyle: "preserve-3d" }}>
              <div className="flex items-center space-x-2 mb-4 text-gray-500 border-b border-gray-900 pb-4">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="uppercase tracking-widest text-[10px] font-bold text-gray-400">Node Terminal Output</span>
              </div>
              <div className="flex-1 bg-black rounded-xl p-4 text-gray-300 overflow-y-auto whitespace-pre-wrap break-all leading-relaxed shadow-inner border border-gray-900">
                {log || "Awaiting Node Communication Payload..."}
              </div>
            </div>
          </div>
        ) : (
          <div className="pt-4 pb-12">
            {renderUserControls()}

            <div className="mt-16 max-w-md mx-auto opacity-60 hover:opacity-100 transition-opacity duration-500">
              <div className="glass-panel rounded-2xl p-6 gsap-fade-up shadow-xl">
                <h4 className="text-[var(--color-primary)] text-xs font-bold uppercase tracking-widest mb-4">FAQ for FXShield</h4>
                <div className="space-y-4">
                  <details className="group border-b border-gray-800 pb-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition-colors list-none [&::-webkit-details-marker]:hidden flex justify-between items-center">
                      1. What is FXShield?
                      <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                      FXShield is a simple onchain product that lets you take a view on whether an FX rate, like EUR/USD, will finish above or below a chosen level at a fixed time. Each winning note pays a fixed amount, so the payoff is easy to understand from the start.
                    </p>
                  </details>
                  <details className="group border-b border-gray-800 pb-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition-colors list-none [&::-webkit-details-marker]:hidden flex justify-between items-center">
                      2. How does it work?
                      <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                      You choose a market, buy a position, and wait until expiry. When the market ends, FXShield checks the final price using a verified oracle, and if your side is correct, you can claim the payout.
                    </p>
                  </details>
                  <details className="group border-b border-gray-800 pb-3">
                    <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition-colors list-none [&::-webkit-details-marker]:hidden flex justify-between items-center">
                      3. What can I lose or win?
                      <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                      Your maximum loss is the amount you paid for the note. Your maximum payout is fixed in advance, so there are no margin calls, no liquidations, and no hidden downside beyond what you put in.
                    </p>
                  </details>
                  <details className="group pb-1">
                    <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white transition-colors list-none [&::-webkit-details-marker]:hidden flex justify-between items-center">
                      4. How is the result decided?
                      <span className="text-gray-500 group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                      The result is determined automatically at expiry using an onchain price feed, such as Pyth. That means settlement follows predefined rules instead of manual decisions or off-platform intervention.
                    </p>
                  </details>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
