use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, MintTo, Token, TokenAccount, Transfer},
};
use crate::state::MarketState;
use crate::constants::*;
use crate::errors::ProtocolError;

#[derive(Accounts)]
pub struct MintNotes<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [MARKET_SEED, market.pyth_oracle.as_ref(), market.strike_price.to_le_bytes().as_ref(), market.expiry_ts.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, MarketState>>,

    #[account(mut)]
    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = user,
    )]
    pub user_collateral_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
    )]
    pub market_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [LONG_NOTE_SEED, market.key().as_ref()],
        bump,
    )]
    pub long_note_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = long_note_mint,
        associated_token::authority = user,
    )]
    pub user_long_note_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [SHORT_NOTE_SEED, market.key().as_ref()],
        bump,
    )]
    pub short_note_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = short_note_mint,
        associated_token::authority = user,
    )]
    pub user_short_note_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<MintNotes>,
    amount: u64,
) -> Result<()> {
    require!(
        !ctx.accounts.market.is_settled,
        ProtocolError::MarketAlreadySettled
    );
    
    // Safety check: Cannot mint after expiry
    require!(
        Clock::get()?.unix_timestamp < ctx.accounts.market.expiry_ts,
        ProtocolError::MarketExpired
    );

    require!(amount > 0, ProtocolError::InvalidAmount);

    // 1:1 Base unit par transfer
    // Step 1: Transfer exogenous collateral into Vault
    let cpi_accounts = Transfer {
        from: ctx.accounts.user_collateral_ata.to_account_info(),
        to: ctx.accounts.market_vault.to_account_info(),
        authority: ctx.accounts.user.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)?;

    // Core Protocol Authority derivation for CPI 
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

    // Step 2: Mint Long Tokens exactly 1:1
    let cpi_accounts_long = MintTo {
        mint: ctx.accounts.long_note_mint.to_account_info(),
        to: ctx.accounts.user_long_note_ata.to_account_info(),
        authority: ctx.accounts.market.to_account_info(),
    };
    let cpi_program_long = ctx.accounts.token_program.to_account_info();
    let cpi_ctx_long = CpiContext::new_with_signer(cpi_program_long, cpi_accounts_long, signer);
    token::mint_to(cpi_ctx_long, amount)?;

    // Step 3: Mint Short Tokens exactly 1:1
    let cpi_accounts_short = MintTo {
        mint: ctx.accounts.short_note_mint.to_account_info(),
        to: ctx.accounts.user_short_note_ata.to_account_info(),
        authority: ctx.accounts.market.to_account_info(),
    };
    let cpi_program_short = ctx.accounts.token_program.to_account_info();
    let cpi_ctx_short = CpiContext::new_with_signer(cpi_program_short, cpi_accounts_short, signer);
    token::mint_to(cpi_ctx_short, amount)?;

    Ok(())
}
