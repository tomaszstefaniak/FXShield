import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Fxshield } from "../target/types/fxshield";

const PYTH_ORACLE = new PublicKey("J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLSRTSndpeCPy");
const STRIKE_PRICE = new anchor.BN(150_000_000); 

async function runKeeper() {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  
  const program = anchor.workspace.Fxshield as Program<Fxshield>;
  
  console.log("🛡️ FXShield Settlement Keeper Bot Started...");
  console.log(`Wallet: ${provider.wallet.publicKey.toBase58()}`);
  
  setInterval(async () => {
    try {
      const allMarkets = await program.account.marketState.all();
      
      const currentTime = Math.floor(Date.now() / 1000);
      
      for (const marketWrapper of allMarkets) {
        const market = marketWrapper.account;
        const marketPda = marketWrapper.publicKey;
        
        if (market.isSettled) {
          continue; 
        }

        const expiryTs = market.expiryTs.toNumber();
        if (currentTime >= expiryTs) {
          console.log(`\n⏳ Market ${marketPda.toBase58().slice(0, 8)} has expired! Executing settlement...`);
          
          try {
             const tx = await program.methods
               .settleMarket()
               .accounts({
                 caller: provider.wallet.publicKey,
                 market: marketPda,
                 pythOracle: PYTH_ORACLE,
               } as any)
               .rpc();
               
             console.log(`✅ SUCCESS: Market settled! Tx: ${tx}`);
          } catch (e: any) {
             console.error(`❌ Failed to settle market ${marketPda.toBase58()}:`, e.message);
          }
        }
      }
    } catch (e) {
      console.error("Error polling markets:", e);
    }
  }, 10000);
}

runKeeper();
