use anchor_lang::prelude::*;
use crate::state::MarketState;
use crate::constants::*;
use crate::errors::ProtocolError;

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.pyth_oracle.as_ref(), market.strike_price.to_le_bytes().as_ref(), market.expiry_ts.to_le_bytes().as_ref()],
        bump = market.bump,
        constraint = caller.key() == market.creator @ ProtocolError::Unauthorized
    )]
    pub market: Box<Account<'info, MarketState>>,
}

pub fn handler(ctx: Context<SettleMarket>, settlement_price: u64) -> Result<()> {
    let clock = Clock::get()?;

    require!(
        !ctx.accounts.market.is_settled,
        ProtocolError::MarketAlreadySettled
    );

    require!(
        clock.unix_timestamp >= ctx.accounts.market.expiry_ts,
        ProtocolError::StillActive
    );

    // Relay the validated price into the market state
    ctx.accounts.market.settlement_price = Some(settlement_price);
    ctx.accounts.market.is_settled = true;

    Ok(())
}

