export PATH="/Users/tomaszstefaniak/.local/share/solana/install/active_release/bin:$PATH"
while true; do
  output=$(cargo build-sbf --manifest-path programs/fxshield/Cargo.toml 2>&1)
  if echo "$output" | grep -q 'feature `edition2024` is required'; then
    echo "Found edition2024 error. Patching new crates..."
    find ~/.cargo/registry/src -name "Cargo.toml" -exec sed -i '' 's/edition = "2024"/edition = "2021"/g' {} +
    find ~/.cargo/registry/src -name "Cargo.toml" -exec sed -i '' 's/cargo-features = \["edition2024"\]/cargo-features = \[\]/g' {} +
  else
    echo "$output"
    if echo "$output" | grep -q 'error:'; then
      exit 1
    fi
    break
  fi
done
