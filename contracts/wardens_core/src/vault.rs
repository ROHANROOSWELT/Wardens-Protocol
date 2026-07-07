//! Pure lending-vault helpers: the authoritative LTV table (Section 6.3) and
//! the score-to-status mapping (Section 6.2 tiers). No storage access here so
//! the rules stay trivially testable.

use crate::types::AssetStatus;

/// Authoritative LTV rule for `current_ltv` / `borrow` (Section 6.3).
///
/// | Score | LTV           |
/// | ≥ 90  | 75%           |
/// | ≥ 75  | 60%           |
/// | ≥ 60  | 40%           |
/// | ≥ 50  | 20%           |
/// | < 50  | 0% and frozen |
pub fn ltv_for_score(score: u8) -> u8 {
    if score >= 90 {
        75
    } else if score >= 75 {
        60
    } else if score >= 60 {
        40
    } else if score >= 50 {
        20
    } else {
        0
    }
}

/// Score tier -> asset status label (Section 6.2 scoring tiers).
pub fn status_for_score(score: u8) -> AssetStatus {
    if score >= 90 {
        AssetStatus::Healthy
    } else if score >= 70 {
        AssetStatus::Active
    } else if score >= 50 {
        AssetStatus::Watchlist
    } else {
        // 1..=49 frozen / high risk, 0 invalid/default/fraud
        AssetStatus::Frozen
    }
}

/// A score below 50 means the collateral is frozen (0% LTV).
pub fn is_frozen_score(score: u8) -> bool {
    score < 50
}
