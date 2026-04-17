use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};
use anchor_spl::metadata::{create_metadata_accounts_v3, CreateMetadataAccountsV3, Metadata};
use anchor_spl::metadata::mpl_token_metadata::types::DataV2;
use crate::state::MarketState;
use crate::constants::*;
use crate::errors::ProtocolError;

#[derive(Accounts)]
pub struct InitNoteMints<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        has_one = creator,
        seeds = [MARKET_SEED, market.pyth_oracle.as_ref(), market.strike_price.to_le_bytes().as_ref(), market.expiry_ts.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, MarketState>>,

    pub collateral_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        seeds = [LONG_NOTE_SEED, market.key().as_ref()],
        bump,
        mint::decimals = collateral_mint.decimals,
        mint::authority = market,
    )]
    pub long_note_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = creator,
        seeds = [SHORT_NOTE_SEED, market.key().as_ref()],
        bump,
        mint::decimals = collateral_mint.decimals,
        mint::authority = market,
    )]
    pub short_note_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    
    pub token_metadata_program: Program<'info, Metadata>,
    /// CHECK: Validated natively by metaplex explicit derivations
    #[account(mut)]
    pub long_metadata: UncheckedAccount<'info>,
    /// CHECK: Validated natively by metaplex explicit derivations
    #[account(mut)]
    pub short_metadata: UncheckedAccount<'info>,
    
    /// CHECK: Passed to Metaplex CPI. Renamed from `rent` to avoid Anchor init macro auto-validation.
    pub rent_info: UncheckedAccount<'info>,
}

pub fn handler(ctx: Context<InitNoteMints>) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(!market.mints_initialized, ProtocolError::MintingFailed); // or unique error
    market.mints_initialized = true;

    let pyth_oracle_key = market.pyth_oracle;
    let strike_bytes = market.strike_price.to_le_bytes();
    let expiry_bytes = market.expiry_ts.to_le_bytes();
    let bump = &[market.bump];

    let seeds: &[&[u8]] = &[
        MARKET_SEED,
        pyth_oracle_key.as_ref(),
        strike_bytes.as_ref(),
        expiry_bytes.as_ref(),
        bump,
    ];
    let signer_seeds = &[&seeds[..]];

    msg!("Initializing Metaplex Metadata for Long Note...");
    create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.long_metadata.to_account_info(),
                mint: ctx.accounts.long_note_mint.to_account_info(),
                mint_authority: market.to_account_info(),
                payer: ctx.accounts.creator.to_account_info(),
                update_authority: market.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent_info.to_account_info(),
            },
            signer_seeds,
        ),
        DataV2 {
            name: "FXShield LONG".to_string(),
            symbol: "FXS-L".to_string(),
            uri: "".to_string(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        true,
        true,
        None,
    )?;

    msg!("Initializing Metaplex Metadata for Short Note...");
    create_metadata_accounts_v3(
        CpiContext::new_with_signer(
            ctx.accounts.token_metadata_program.to_account_info(),
            CreateMetadataAccountsV3 {
                metadata: ctx.accounts.short_metadata.to_account_info(),
                mint: ctx.accounts.short_note_mint.to_account_info(),
                mint_authority: market.to_account_info(),
                payer: ctx.accounts.creator.to_account_info(),
                update_authority: market.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                rent: ctx.accounts.rent_info.to_account_info(),
            },
            signer_seeds,
        ),
        DataV2 {
            name: "FXShield SHORT".to_string(),
            symbol: "FXS-S".to_string(),
            uri: "".to_string(),
            seller_fee_basis_points: 0,
            creators: None,
            collection: None,
            uses: None,
        },
        true,
        true,
        None,
    )?;

    Ok(())
}
