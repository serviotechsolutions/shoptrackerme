## Goal
Replace the current free-text / jsonb "supplied_items" with a real relational **Supplier Product Catalogue**, and rewire Purchase Orders + GRN to use it. Existing PO/GRN records keep their snapshot prices — new PO prices come from the current catalogue.

## 1. Database (single migration)
Create `public.supplier_products`:

- `id`, `tenant_id`, `supplier_id` (FK suppliers, cascade)
- `product_id` (nullable FK products — link when catalogue item maps to an inventory product)
- `name` (text, required)
- `sku` (text, optional)
- `unit` (text, default 'piece')
- `unit_cost` (numeric, > 0)
- `min_order_qty` (numeric, nullable)
- `available_qty` (numeric, nullable — supplier's stock reference)
- `brand`, `description` (text, optional)
- `status` ('active' | 'inactive', default 'active')
- `created_at`, `updated_at`

CHECK: `unit_cost > 0`, `min_order_qty >= 0`, `available_qty >= 0`.
UNIQUE(`supplier_id`, lower(`name`)).
GRANTs to authenticated + service_role; RLS by tenant (using `get_user_tenant_id`); updated_at trigger.

Add to `purchase_order_items`:
- `supplier_product_id uuid` (nullable FK → supplier_products, ON DELETE SET NULL)
- `is_custom_item boolean default false`
- `unit text` (snapshot)

(These are additive — existing rows unaffected. `unit_cost` already snapshots price so historical PO totals stay frozen.)

Backfill: for existing suppliers with `supplied_items` jsonb, insert catalogue rows so nothing is lost. Legacy `products_supplied` / `supplied_items` columns stay in place (read-only fallback), we just stop writing to them.

## 2. Suppliers page (`src/pages/Suppliers.tsx`)
Remove the inline "supplied_items" editor from the Add/Edit dialog. Replace with a **"Manage Catalogue"** button on each supplier row that opens a dedicated catalogue dialog with a proper table:

Product | Unit | Supplier Unit Cost | Available Qty | Min Order Qty | Status | Actions

- Add / Edit row dialog with all catalogue fields.
- Validation: no zero/negative price, no negative qty.
- Show catalogue on `SupplierProfile.tsx` too (replace the "Products from this Supplier" tab or add a "Catalogue" tab that lists `supplier_products`).

## 3. Purchase Orders page (`src/pages/PurchaseOrders.tsx`)
Rebuild the create dialog:

1. Select Supplier → fetch that supplier's active `supplier_products`.
2. Line editor rows:
   - Product: `<Select>` populated from catalogue (searchable). On pick, auto-fill Unit + Unit Cost (both **read-only**), show "Available: X" and "Min Order: Y" as hints.
   - Order Quantity: editable, min 1. Warn if `< min_order_qty`.
   - Line Total: auto `qty × unit_cost`.
   - Delete button.
3. "Custom Item" button appends a row with `is_custom_item = true` where Product Name, Unit, Qty, Unit Cost are all editable (validated > 0).
4. Persist `supplier_product_id`, `unit`, `unit_cost` snapshot, `is_custom_item` per line.

Editing a supplier's catalogue price after PO creation must NOT touch existing `purchase_order_items` — this is already guaranteed because we store snapshot `unit_cost` on the line.

## 4. Goods Received Note (`src/pages/GoodsReceivedNotes.tsx`)
- No workflow change: GRN keeps reading `unit_cost` from `purchase_order_items` (snapshot). Weighted-average costing continues to work.
- After a GRN with any **custom items** is approved, show a follow-up dialog:
  > "Add these custom items to <Supplier>'s catalogue for future purchases?"
  Lists each custom line with editable price/unit/min qty and an Add-all button. Inserts into `supplier_products`.

## 5. Validation rules (client + DB)
- Supplier catalogue: `unit_cost > 0`, `min_order_qty ≥ 0`, `available_qty ≥ 0`.
- PO lines: `quantity > 0`; warn (not block) when `quantity < min_order_qty`.
- Custom items: name required, `unit_cost > 0`, `quantity > 0`.

## 6. Files touched
- New migration
- `src/pages/Suppliers.tsx` — remove inline supplied_items editor; add "Manage Catalogue" launcher.
- New `src/components/SupplierCatalogueDialog.tsx` — table + CRUD.
- `src/pages/SupplierProfile.tsx` — add Catalogue tab reading `supplier_products`.
- `src/pages/PurchaseOrders.tsx` — new line editor bound to catalogue.
- `src/pages/GoodsReceivedNotes.tsx` — post-approval "add custom items to catalogue" prompt.

## 7. Out of scope
- Supplier login / accounts (explicitly not wanted).
- Changing existing PO/GRN history or inventory weighted-average logic.

If you approve I'll ship the migration first, then the UI changes in one batch.