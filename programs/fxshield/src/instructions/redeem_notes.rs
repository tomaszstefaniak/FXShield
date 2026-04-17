use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};
use crate::state::MarketState;
use crate::constants::*;
use crate::errors::ProtocolError;

#[derive(Accounts)]
pub struct RedeemNotes<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [MARKET_SEED, market.pyth_oracle.as_ref(), market.strike_price.to_le_bytes().as_ref(), market.expiry_ts.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, MarketState>>,

    #[account(mut)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = user,
    )]
    pub user_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub target_note_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = target_note_mint,
        associated_token::authority = user,
    )]
    pub user_note_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<RedeemNotes>,
    amount: u64,
) -> Result<()> {
    require!(ctx.accounts.market.is_settled, ProtocolError::NotSettled);
    require!(amount > 0, ProtocolError::InvalidAmount);

    let settlement_price = ctx.accounts.market.settlement_price.unwrap();
    let strike = ctx.accounts.market.strike_price;

    let long_won = settlement_price >= strike;
    
    // Validate target_note is the winning note
    let (long_mint_key, _bump) = Pubkey::find_program_address(
        &[LONG_NOTE_SEED, ctx.accounts.market.key().as_ref()],
        ctx.program_id
    );
    
    let (short_mint_key, _bump) = Pubkey::find_program_address(
        &[SHORT_NOTE_SEED, ctx.accounts.market.key().as_ref()],
        ctx.program_id
    );

    let is_long_mint = ctx.accounts.target_note_mint.key() == long_mint_key;
    let is_short_mint = ctx.accounts.target_note_mint.key() == short_mint_key;

    let is_winner = (is_long_mint && long_won) || (is_short_mint && !long_won);
    require!(is_winner, ProtocolError::NotWinningNote);

    // 1. Burn user notes
    let burn_accounts = Burn {
        mint: ctx.accounts.target_note_mint.to_account_info(),
        from: ctx.accounts.user_note_ata.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let burn_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), burn_accounts);
    token::burn(burn_ctx, amount)?;

    // 2. Transfer exogenous collateral out of Vault to user
    let oracle_key = ctx.accounts.market.pyth_oracle.key();
    let strike_bytes = ctx.accounts.market.strike_price.to_le_bytes();
    let expiry_bytes = ctx.accounts.market.expiry_ts.to_le_bytes();
    
    let market_seeds = &[
        MARKET_SEED,
        oracle_key.as_ref(),
        strike_bytes.as_ref(),
        expiry_bytes.as_ref(),
        &[ctx.accounts.market.bump]
    ];
    let signer = &[&market_seeds[..]];

    let transfer_accounts = Transfer {
        from: ctx.accounts.market_vault.to_account_info(),
        to: ctx.accounts.user_collateral_ata.to_account_info(),
        authority: ctx.accounts.market.to_account_info(), // Vault authority is Market PDA!
    };
    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        transfer_accounts,
        signer
    );
    // Binary options payout: winner gets their stake back + the losing side's stake (2x)
    let payout = amount.checked_mul(2).unwrap();
    token::transfer(transfer_ctx, payout)?;

    Ok(())
}
