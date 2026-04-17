use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("o3hwgN5oi3VkJxDSTbzHYNXQevJ7e96G6TK6XK6novc");

#[program]
pub mod fxshield {
    use super::*;

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        strike_price: u64,
        expiry_ts: i64,
    ) -> Result<()> {
        instructions::init_market::handler(ctx, strike_price, expiry_ts)
    }

    pub fn init_note_mints(ctx: Context<InitNoteMints>) -> Result<()> {
        instructions::init_note_mints::handler(ctx)
    }

    pub fn mint_notes(
        ctx: Context<MintNotes>,
        amount: u64,
    ) -> Result<()> {
        instructions::mint_notes::handler(ctx, amount)
    }

    pub fn settle_market(ctx: Context<SettleMarket>, settlement_price: u64) -> Result<()> {
        instructions::settle_market::handler(ctx, settlement_price)
    }

    pub fn redeem_notes(
        ctx: Context<RedeemNotes>,
        amount: u64,
    ) -> Result<()> {
        instructions::redeem_notes::handler(ctx, amount)
    }
}
