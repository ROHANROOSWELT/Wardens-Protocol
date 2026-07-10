# Contributing to Wardens Protocol

Thank you for your interest in contributing to the Wardens Protocol! We welcome issues, suggestions, and pull requests to help secure RWA collateral on Casper.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

### Prerequisites
- **Rust**: Nightly toolchain recommended for livenet compilation.
- **Bun**: For orchestrator, agents, and dashboard.
- **cargo-odra**: Optional helper CLI for compiled contracts.

### Local Development Flow

1. **Clone and Setup**
   ```bash
   git clone https://github.com/YOURORG/YOURREPO.git
   cd wardens
   ```

2. **Smart Contracts**
   To build and test the Odra-based smart contracts:
   ```bash
   cd contracts/wardens_core
   cargo test
   ```

3. **Backend Orchestrator**
   To run the orchestrator backend locally:
   ```bash
   cd backend
   bun install
   bun run dev
   ```
   To run backend tests:
   ```bash
   bun test
   ```

4. **Dashboard Frontend**
   To start the Next.js interactive console:
   ```bash
   cd dashboard
   bun install
   bun run dev
   ```

## Pull Request Process

1. **Create a branch**: Use a descriptive name like `feature/new-agent` or `fix/ltv-math`.
2. **Write tests**: Ensure any smart contract logic is backed by tests in `src/tests.rs` and backend changes have tests in `*.test.ts`.
3. **Verify checks**: Ensure that `cargo test`, `bun test`, and dashboard building pass locally before submitting.
4. **Document changes**: Update the `README.md` or any appropriate API specs in `docs/` if your change adds new behavior or parameters.
5. **Open PR**: Provide a clear description of the feature or bug, details on your testing method, and link any related issues.
