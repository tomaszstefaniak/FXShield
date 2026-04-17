import { Connection, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, Wallet, BN } from "@coral-xyz/anchor";
import { IDL, PROGRAM_ID } from "../web/src/idl/fxshield";
import * as fs from "fs";

async function main() {
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const keypairBuf = Buffer.from(JSON.parse(fs.readFileSync("/Users/tomaszstefaniak/.config/solana/id.json", "utf-8")));
    const wallet = new Wallet(Keypair.fromSecretKey(keypairBuf));
    const provider = new AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
    const program = new Program(IDL as any, new PublicKey(PROGRAM_ID), provider);

    const STRIKE_PRICE = new BN(150_000_000); // $150
    const PYTH_ORACLE = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLSRTSndpeCPy");
    const COLLATERAL_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const TOKEN_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

    // Fetch the Market state to get the exact expiry_ts to correctly compute the seed
    const markets = await program.account.marketState.all();
    if (markets.length === 0) {
        console.log("No markets found!");
        return;
    }
    const marketState = markets[0];
    const market = marketState.publicKey;
    
    const [longNoteMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("long_note"), market.toBuffer()],
        program.programId
    );
    const [shortNoteMint] = PublicKey.findProgramAddressSync(
        [Buffer.from("short_note"), market.toBuffer()],
        program.programId
    );

    const [longMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), longNoteMint.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
    );
    
    const [shortMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), shortNoteMint.toBuffer()],
        TOKEN_METADATA_PROGRAM_ID
    );

    const ix = await program.methods
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
          rent: SYSVAR_RENT_PUBKEY,
        } as any)
        .instruction();

    console.log("Transaction Instruction Keys:");
    ix.keys.forEach((k, i) => {
        console.log(`[${i}] ${k.pubkey.toBase58()} (signer: ${k.isSigner}, writable: ${k.isWritable})`);
    });
}
main().catch(console.error);
