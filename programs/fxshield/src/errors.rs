use anchor_lang::prelude::*;

#[error_code]
pub enum ProtocolError {
    #[msg("Market expiry must be strictly in the future")]
    InvalidExpiry,
    #[msg("Strike price must be greater than zero")]
    InvalidStrike,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Market is already settled")]
    MarketAlreadySettled,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Market is still active, wait for expiry")]
    StillActive,
    #[msg("Market is not settled yet")]
    NotSettled,
    #[msg("Oracle price is stale")]
    StaleOracle,
    #[msg("Math Overflow")]
    MathOverflow,
    #[msg("This note is not the winning note for this market")]
    NotWinningNote,
    #[msg("Mints already initialized")]
    MintingFailed,
    #[msg("Unauthorized access")]
    Unauthorized,
}
