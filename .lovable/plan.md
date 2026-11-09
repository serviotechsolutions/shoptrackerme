# Phase 1: Financial and inventory integrity

## Data preservation
- Preserve all existing records, tables, columns, relationships and historical cost snapshots.
- Use additive, backward-compatible changes only. No resets, hard deletes, inferred historical links or silent financial corrections.
- Preserve the existing POS, customer, PO, GRN, receipt and pricing-advisor experience; no unrelated redesign.
- Historical corrections or destructive operations require a separate explanation and explicit approval. Approval of this plan does not authorize either.

## Confirmed baseline
Read-only live checks confirmed **80 unlinked transaction lines, zero sales headers, seven customer-linked payments without sale links and two payment/item total mismatches**. Both checkout paths and GRN posting use separate writes. Reversal clamps quantities and does not reverse inventory value. No business records have been changed.

## 1. Isolated verification
Create a separate empty PostgreSQL test database from inspected schema definitions, with synthetic shops, users and products only. Do not copy live business data. Test the actual transaction functions intended for deployment, including concurrent calls and injected failures. The initial local database setup failed because a PostgreSQL library is unavailable; resolve that before claiming database tests passed.

## 2. Atomic POS checkout
- Share one authenticated server-side operation between normal and voice checkout.
- Validate shop membership, role, products, quantities, customer, payment methods, price overrides and discounts.
- Lock current product rows in deterministic order; reject insufficient stock instead of overwriting quantities from cart snapshots.
- Create the sale header, transaction lines, linked payment, reconciled payment items, historical cost snapshots, inventory movements and applicable promotion redemption within one transaction.
- Preserve displayed POS prices and explicit overrides. Calculate profit using current inventory costs independently of selling prices.
- Add durable request identifiers and payload consistency checks. Repeated requests return the original committed result; uncertain responses retain the same identifier for retry. Add synchronous submission protection across keyboard, button and voice paths.
- Preserve one payment header per sale; support split tender through additive payment-component records rather than breaking existing uniqueness.
- Store actual tender and change separately. Reject underpayment until an explicit credit-sale policy is authorized, rather than falsely recording full payment. Do not invent new tax rules or a credit-sale interface.

## 3. Customer linkage and accounts
- Link selected customers during checkout; create voice-requested customers inside that transaction.
- Add an audited post-checkout assignment operation linking the existing sale, transaction association and payment without creating duplicates. Preserve the customer-selection/Walk-in step.
- Distinguish pending customer identification from unpaid money.
- Apply consistent purchases, actual-payment and balance calculations in customer screens and statements. Keep uncertain legacy payments separate from confirmed sale settlement; do not infer missing historical relationships.
- Preserve refunds/reversals already represented in records; do not invent missing historical refund data.

## 4. Atomic GRN creation and approval
- Save GRN headers, lines and creation audit together. Immediate approval includes inventory posting in the same transaction.
- Approve existing drafts with owner authorization, locked GRN/PO/product rows, current receipt totals and checked line references.
- Reject draft/cancelled POs, cross-shop references, invalid quantities, ambiguous product matches and unaccepted excess.
- Resolve or create products without creation races; propagate supplier, category, unit and catalogue-image metadata.
- Update stock, moving weighted-average cost, purchase history, inventory movements, purchase metadata, receipt quantities, PO status and GRN approval atomically.
- Keep selling prices unchanged. Preserve cost precision. Existing inventory quantities are whole units: explicitly reject unsupported fractional quantities rather than truncating them or changing live column types.
- Repeated/concurrent approval posts stock exactly once. Pricing-advisor and catalogue prompts remain post-commit follow-ups, not prerequisites for posting success.

## 5. Safe audited reversal
- Require owner authorization, an approved GRN and a reason. Duplicate reversal must never deduct stock again.
- Reverse quantity and value through compensating movements and a reversal reference; retain original GRNs and purchase history.
- Verify subsequent movement history and current stock/value against original posting snapshots. Block reversal after subsequent consumption, incompatible later movements or insufficient stock; never clamp quantities or rewrite historical sale costs.
- Verify the supplied example: 10 units at 100 plus 10 at 200 becomes 20 at 150; reversing the second receipt before later movements restores 10 at 100 and value 1,000.
- Legacy GRNs lacking reliable posting evidence require reconciliation, not automatic reversal.
- Provide an owner-authorized adjustment request with proposed quantity/value, evidence and reason when reversal is blocked. Requests are auditable and do not silently change stock; actual historical correction remains separately approved.
- Recalculate PO received quantities/status and fully-received dates within reversal.

## 6. Synchronization and protections
- Refresh Products, POS, Sales, Payments, accounts, POs, GRNs, costing, forecasts, AI insights, reports and dashboard after committed operations using existing realtime subscriptions plus focused refresh/invalidation.
- Enforce tenant isolation, owner approval/reversal and immutable new movement/audit records at the database boundary.
- Protect newly posted finalized records against bypassing the posting rules without rewriting legacy data or disabling unrelated workflows.

## 7. Acceptance tests and deliverables
Execute tests using isolated synthetic records:
- **Checkout:** single/multiple products, anonymous/customer sales, discounts, split tender, invalid/underpaid payments, insufficient stock, duplicate and uncertain retries, concurrent last-unit sale, rollback at each critical write.
- **Linkage/accounts:** sale/line/payment references, customer history, post-checkout assignment without duplication, fully paid zero balance, discounted net payment-item reconciliation.
- **GRNs:** first/higher/lower-cost purchases, partial/multiple deliveries, missing product creation, duplicate/concurrent approval, failed line creation and injected posting failures.
- **Reversals:** supplied valuation example, subsequent consumption/purchases, insufficient stock, duplicate/concurrent reversal, compensating audit and PO reconciliation.
- **Security:** unauthenticated, wrong-shop and unauthorized-role operations rejected.
- **Browser:** normal/voice sale to payment/account/receipt, PO to partial receipt/inventory/POS and reversal using safely isolated test records. Never submit test sales against live inventory or contact real customers/providers.

Deliver a read-only historical reconciliation report listing affected record IDs, plausible matches, ambiguities and recommendations. Make no historical corrections. Deliver a verification report listing changed files, migrations, functions, indexes, permissions, tests passed/failed/not run, remaining blockers and manual checks. Do not claim concurrency or production readiness from source inspection or page rendering alone.

## Technical implementation
- PostgreSQL security-definer operations with fixed search paths, authentication/tenant checks, deterministic row/advisory locks and restricted execute grants.
- Add request/result tracking, immutable inventory movements, tender components, assignment audit and adjustment requests with explicit grants and tenant-scoped policies.
- Add only nullable/defaulted metadata columns and compatible indexes; no backfill of uncertain financial relationships.
- Integrate through a shared typed client helper, replacing existing multi-write POS/GRN paths rather than introducing competing business logic.
- Keep failure-injection hooks exclusively in the isolated test environment.
- Retain automated tests in the project and document the posting architecture in AGENTS.md.
