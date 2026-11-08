# ShopTracker responsive interface

- [x] Improve shared layout, controls, dialogs, tables and notifications.
- [x] Adapt dashboard, POS, sales, reports and promotion layouts.
- [x] Adapt supplier, GRN, payment, customer and WhatsApp layouts.
- [x] Complete signed-in layout verification across device sizes, profile pages, long forms and navigation after correcting audit findings — 105 page/viewport checks showed no body overflow; real customer/supplier profiles, six dialogs, mobile navigation, real-product cart addition, chat viewing, sidebar and dark theme checked with no runtime errors. No transactions submitted or business operations changed.

# Phase 1 financial and inventory integrity

- [ ] Inspect live schema and affected checkout, accounts, GRN and reversal paths.
- [ ] Add atomic, authenticated, idempotent checkout and customer assignment.
- [ ] Add atomic GRN approval and safe audited reversal; preserve historical records.
- [ ] Integrate existing screens and refresh dependent data without redesign.
- [ ] Execute isolated rollback, linkage, costing and concurrency tests.
- [ ] Deliver verification and read-only historical reconciliation reports.