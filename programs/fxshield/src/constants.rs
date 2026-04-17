use anchor_lang::prelude::*;

#[constant]
pub const MARKET_SEED: &[u8] = b"market";

#[constant]
pub const VAULT_SEED: &[u8] = b"vault";

#[constant]
pub const LONG_NOTE_SEED: &[u8] = b"long_note";

#[constant]
pub const SHORT_NOTE_SEED: &[u8] = b"short_note";

pub const MIN_DURATION_SECONDS: i64 = 60; // 1 minute minimum for demo testing
