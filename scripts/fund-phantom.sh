#!/bin/bash
PHANTOM_ADDRESS=$1
MOCK_USDC="FR7vsrVB8TtVFPUgZFuyvkWbG3qQGLA96CePRjfZ1T4A"

if [ -z "$PHANTOM_ADDRESS" ]
then
      echo "Error: Please provide your Phantom Wallet Address."
      echo "Usage: ./scripts/fund-phantom.sh <PHANTOM_ADDRESS>"
      exit 1
fi

echo "Funding Phantom Wallet: $PHANTOM_ADDRESS"
echo "Creating Devnet ATA for Mock USDC..."
spl-token create-account $MOCK_USDC --owner $PHANTOM_ADDRESS

echo "Minting 10,000 Mock USDC..."
spl-token mint $MOCK_USDC 10000 --recipient $PHANTOM_ADDRESS

echo "Complete! Wallet is funded for MintNotes endpoint."
