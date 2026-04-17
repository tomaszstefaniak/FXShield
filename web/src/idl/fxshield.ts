export const PROGRAM_ID = "o3hwgN5oi3VkJxDSTbzHYNXQevJ7e96G6TK6XK6novc";

export const IDL = {
  "address": PROGRAM_ID,
  "version": "0.1.0",
  "name": "fxshield",
  "instructions": [
    {
      "name": "initializeMarket",
      "discriminator": [35, 35, 189, 193, 155, 48, 170, 203],
      "accounts": [
        { "name": "creator", "writable": true, "signer": true },
        { "name": "market", "writable": true, "signer": false },
        { "name": "collateralMint", "writable": false, "signer": false },
        { "name": "pythOracle", "writable": false, "signer": false },
        { "name": "marketVault", "writable": true, "signer": false },
        { "name": "tokenProgram", "writable": false, "signer": false },
        { "name": "systemProgram", "writable": false, "signer": false },
        { "name": "rentInfo", "writable": false, "signer": false }
      ],
      "args": [
        { "name": "strikePrice", "type": "u64" },
        { "name": "expiryTs", "type": "i64" }
      ]
    },
    {
      "name": "initNoteMints",
      "discriminator": [161, 108, 211, 65, 226, 207, 133, 90],
      "accounts": [
        { "name": "creator", "writable": true, "signer": true },
        { "name": "market", "writable": true, "signer": false },
        { "name": "collateralMint", "writable": false, "signer": false },
        { "name": "longNoteMint", "writable": true, "signer": false },
        { "name": "shortNoteMint", "writable": true, "signer": false },
        { "name": "tokenProgram", "writable": false, "signer": false },
        { "name": "systemProgram", "writable": false, "signer": false },
        { "name": "tokenMetadataProgram", "writable": false, "signer": false },
        { "name": "longMetadata", "writable": true, "signer": false },
        { "name": "shortMetadata", "writable": true, "signer": false },
        { "name": "rentInfo", "writable": false, "signer": false }
      ],
      "args": []
    },
    {
      "name": "mintNotes",
      "discriminator": [177, 155, 178, 224, 252, 216, 97, 66],
      "accounts": [
        { "name": "user", "writable": true, "signer": true },
        { "name": "market", "writable": true, "signer": false },
        { "name": "collateralMint", "writable": true, "signer": false },
        { "name": "userCollateralAta", "writable": true, "signer": false },
        { "name": "marketVault", "writable": true, "signer": false },
        { "name": "longNoteMint", "writable": true, "signer": false },
        { "name": "userLongNoteAta", "writable": true, "signer": false },
        { "name": "shortNoteMint", "writable": true, "signer": false },
        { "name": "userShortNoteAta", "writable": true, "signer": false },
        { "name": "tokenProgram", "writable": false, "signer": false },
        { "name": "associatedTokenProgram", "writable": false, "signer": false },
        { "name": "systemProgram", "writable": false, "signer": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    },
    {
      "name": "settleMarket",
      "discriminator": [193, 153, 95, 216, 166, 6, 144, 217],
      "accounts": [
        { "name": "caller", "writable": true, "signer": true },
        { "name": "market", "writable": true, "signer": false }
      ],
      "args": [
        { "name": "settlementPrice", "type": "u64" }
      ]
    },
    {
      "name": "redeemNotes",
      "discriminator": [149, 128, 42, 86, 143, 58, 107, 115],
      "accounts": [
        { "name": "user", "writable": true, "signer": true },
        { "name": "market", "writable": false, "signer": false },
        { "name": "collateralMint", "writable": true, "signer": false },
        { "name": "marketVault", "writable": true, "signer": false },
        { "name": "userCollateralAta", "writable": true, "signer": false },
        { "name": "targetNoteMint", "writable": true, "signer": false },
        { "name": "userNoteAta", "writable": true, "signer": false },
        { "name": "tokenProgram", "writable": false, "signer": false }
      ],
      "args": [
        { "name": "amount", "type": "u64" }
      ]
    }
  ],
  "accounts": [
    {
      "name": "marketState",
      "discriminator": [0, 125, 123, 215, 95, 96, 164, 194]
    }
  ],
  "types": [
    {
      "name": "marketState",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "creator", "type": "pubkey" },
          { "name": "strikePrice", "type": "u64" },
          { "name": "expiryTs", "type": "i64" },
          { "name": "pythOracle", "type": "pubkey" },
          { "name": "settlementPrice", "type": { "option": "u64" } },
          { "name": "isSettled", "type": "bool" },
          { "name": "collateralMint", "type": "pubkey" },
          { "name": "mintsInitialized", "type": "bool" },
          { "name": "bump", "type": "u8" }
        ]
      }
    }
  ]
};
