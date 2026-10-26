# Architecture rules

- Keep responsive presentation in shared UI primitives and scoped layout utilities; preserve page handlers, queries, permissions, routes and document generation because this modernization is UI-only.
- Use semantic CSS tokens for colors and fixed readable type scales, with reduced-motion overrides, to keep themes and accessibility consistent.
- Resolve default POS prices through the shared posPricing helper for product cards, cart additions and voice checkout; inventory costing stays separate so displayed prices and charged unit prices cannot diverge.