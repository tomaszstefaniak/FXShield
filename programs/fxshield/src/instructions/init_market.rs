use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::MarketState;
use crate::constants::*;
use crate::errors::ProtocolError;

#[derive(Accounts)]
#[instruction(strike_price: u64, expiry_ts: i64)]
pub struct InitializeMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = MarketState::INIT_SPACE,
        seeds = [MARKET_SEED, pyth_oracle.key().as_ref(), strike_price.to_le_bytes().as_ref(), expiry_ts.to_le_bytes().as_ref()],
        bump
    )]
    pub market: Box<Account<'info, MarketState>>,

    /// The exogenous collateral to use (e.g. USDC)
    pub collateral_mint: Box<Account<'info, Mint>>,

    /// CHECK: Must match the desired Pyth Oracle feed exactly. Validated on chain during settlement.
    pub pyth_oracle: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = market,
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,


    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    /// CHECK: Renamed from `rent` to avoid Anchor init macro auto-validation.
    pub rent_info: UncheckedAccount<'info>,
}

pub fn handler(
    ctx: Context<InitializeMarket>,
    strike_price: u64,
    expiry_ts: i64,
) -> Result<()> {
    require!(
        expiry_ts > Clock::get()?.unix_timestamp + MIN_DURATION_SECONDS,
        ProtocolError::InvalidExpiry
    );
    require!(strike_price > 0, ProtocolError::InvalidStrike);

    let market = &mut ctx.accounts.market;
    
    market.creator = ctx.accounts.creator.key();
    market.strike_price = strike_price;
    market.expiry_ts = expiry_ts;
    market.pyth_oracle = ctx.accounts.pyth_oracle.key();
    market.settlement_price = None;
    market.is_settled = false;
    market.collateral_mint = ctx.accounts.collateral_mint.key();
    market.bump = ctx.bumps.market;

    Ok(())
}
