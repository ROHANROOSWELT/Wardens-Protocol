# Wardens Protocol: Multichain Liquidity & SDK Specifications

## 1. Multichain Liquidity Bridge Adapter

The Wardens Protocol includes a preliminary architecture for multichain liquidity routing. This allows stablecoins or tokens from other chains (e.g., Ethereum, Arbitrum) to be bridged to Casper and used to supply capital to the `LendingVault` and `ReserveVault`.

### Bridging Flow
1. **Lock on Source Chain**: Liquidity providers (LPs) lock ERC-20 stablecoins on the source chain into a Wardens Bridge Contract.
2. **Attestation Generation**: A decentralized oracle network (or cross-chain messaging protocol like LayerZero or Wormhole) verifies the lock event.
3. **Minting/Releasing on Casper**: The message is verified by the `LiquidityAdapter` on Casper, which then mints equivalent wrapped stablecoins or routes native Casper tokens to the `LendingVault`.
4. **Capital Tranching**: When liquidity is provided, it is assigned a `tranche_id` in the `ReserveVault`, tied to the underlying RWA. The `CovenantEngine` strictly dictates when this capital can be drawn or when it must be frozen.

### Example Cross-Chain Method Signatures
```rust
// Proposed Odra Interface for Liquidity Bridge
#[odra::module]
pub struct LiquidityBridgeAdapter {
    pub vaults: odra::Mapping<String, Address>,
}

#[odra::module]
impl LiquidityBridgeAdapter {
    /// Receive a cross-chain payload and release funds to a ReserveVault tranche.
    pub fn receive_cross_chain_liquidity(&mut self, source_chain: String, payload: Bytes, signature: Bytes) {
        // 1. Verify payload signature against trusted bridge verifiers
        // 2. Decode payload into { amount, target_vault, tranche_id }
        // 3. Transfer mapped CSPR/Tokens to the ReserveVault
    }
}
```

---

## 2. Verifier & dApp Integration SDK (API Specs)

To easily onboard third-party verifiers and external dApps, the backend orchestrator exposes standardized REST and JSON-RPC APIs.

### Verifier Registration SDK
Third-party verifiers can programmatically register into the Wardens reputation marketplace.

**Endpoint:** `POST /api/p2/agents/register`
**Body:**
```json
{
  "name": "MyCustomVerifier",
  "role": "verifier",
  "endpoint": "https://my-verifier.com/api/verify"
}
```
**Response:**
```json
{
  "status": "success",
  "agent_id": 1,
  "x402_pricing_tier": "dynamic",
  "required_bond": "100"
}
```

### dApp Integration API (Querying Asset State)
External lending protocols or yield aggregators can query the `CovenantEngine` to decide whether an asset is safe for further leveraging.

**Endpoint:** `GET /api/p2/covenant/:asset_id`
**Response:**
```json
{
  "asset_id": "INV-001",
  "covenant_status": "FullAccess",
  "current_score": 94,
  "max_ltv": "75"
}
```
*If `covenant_status` is `DrawsFrozen` or `BreachMode`, external protocols should programmatically halt leveraging.*
