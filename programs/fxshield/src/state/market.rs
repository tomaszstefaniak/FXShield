use anchor_lang::prelude::*;

#[account]
pub struct MarketState {
    pub creator: Pubkey,
    pub strike_price: u64,
    pub expiry_ts: i64,
    pub pyth_oracle: Pubkey,
    pub settlement_price: Option<u64>,
    pub is_settled: bool,
    pub collateral_mint: Pubkey,
    pub mints_initialized: bool,
    pub bump: u8,
}

impl Space for MarketState {
    const INIT_SPACE: usize = 8 // discriminator
        + 32 // creator
        + 8  // strike_price
        + 8  // expiry_ts
        + 32 // pyth_oracle
        + 9  // settlement_price (1 + 8) Option<u64> maps to 1 byte boolean flag + 8 bytes payload
        + 1  // is_settled
        + 32 // collateral_mint
        + 1  // mints_initialized
        + 1; // bump
}
