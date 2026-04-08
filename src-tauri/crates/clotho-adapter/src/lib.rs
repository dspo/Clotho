// Thin adapter crate re-exporting the clotho-domain public API.
// This crate provides a single indirection layer so the assistant runtime
// plugin can depend on an adapter. In future this adapter can be replaced
// with a framework-agnostic trait-based implementation.

pub use clotho_domain::*;
