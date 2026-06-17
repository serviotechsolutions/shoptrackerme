import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Plus, Trash2, FileText, ShoppingBag, ArrowRight, Sparkles } from "lucide-react";

type SuppliedItem = { name: string; unit: string; price: number };
type Supplier = { id: string; name: string; products_supplied: string | null; supplied_items: SuppliedItem[] | null };
type Product = { id: string; name: string; buying_price: number | null; last_purchase_price: number | null };
type Item = { product_id: string | null; product_name: string; unit: string; quantity: number; unit_cost: number };
type PO = { id: string; po_number: string; supplier_id: string | null; status: string; total_amount: number; amount_paid: number; ordered_at: string; received_at: string | null };

const parseSuppliedItems = (s: Supplier | null | undefined): SuppliedItem[] => {
  if (!s) return [];
  if (Array.isArray(s.supplied_items) && s.supplied_items.length) return s.supplied_items;
  // Fallback: legacy comma/newline string with no price
  if (!s.products_supplied) return [];
  return s.products_supplied
    .split(/[\n,;|]+/).map(x => x.trim()).filter(Boolean)
    .map(name => ({ name, unit: "piece", price: 0 }));
};

const PurchaseOrders = () => {
  const [params] = useSearchParams();
  const presetSupplier = params.get("supplier");
  const presetProduct = params.get("product");
  const presetQty = params.get("qty");

  const { user } = useAuth();
  const { canManageProducts, isAdmin } = useUserRole();
  const canEdit = canManageProducts || isAdmin;

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<(PO & { supplier_name?: string })[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ supplier_id: string; notes: string; items: Item[] }>({
    supplier_id: "", notes: "", items: [],
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: ords }, { data: sups }, { data: prods }] = await Promise.all([
      (supabase as any).from("purchase_orders").select("*, suppliers(name)").order("created_at", { ascending: false }),
      (supabase as any).from("suppliers").select("id,name,products_supplied").eq("status", "active").order("name"),
      supabase.from("products").select("id,name,buying_price,last_purchase_price").order("name"),
    ]);
    setOrders((ords || []).map((o: any) => ({ ...o, supplier_name: o.suppliers?.name })));
    setSuppliers((sups || []) as Supplier[]);
    setProducts((prods || []) as Product[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Auto-open create with prefill from Stock Forecast
  useEffect(() => {
    if (!loading && (presetSupplier || presetProduct) && products.length && !open) {
      const items: Item[] = [];
      if (presetProduct) {
        const prod = products.find(p => p.id === presetProduct);
        if (prod) {
          items.push({
            product_id: prod.id,
            product_name: prod.name,
            unit: "piece",
            quantity: presetQty ? Math.max(1, Number(presetQty)) : 1,
            unit_cost: Number(prod.last_purchase_price || prod.buying_price || 0),
          });
        }
      }
      setForm({ supplier_id: presetSupplier || "", notes: "", items });
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products.length]);

  const selectedSupplier = useMemo(
    () => suppliers.find(s => s.id === form.supplier_id) || null,
    [suppliers, form.supplier_id]
  );
  const supplierItems = useMemo(
    () => parseSuppliedItems(selectedSupplier),
    [selectedSupplier]
  );

  const totalAmount = useMemo(
    () => form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0),
    [form.items]
  );

  const buildItemFromSupplied = (si: SuppliedItem): Item => {
    const match = products.find(p => p.name.trim().toLowerCase() === si.name.trim().toLowerCase());
    return {
      product_id: match?.id || null,
      product_name: si.name,
      unit: si.unit || "piece",
      quantity: 1,
      // Use supplier's default price; fall back to inventory cost only when supplier has 0
      unit_cost: Number(si.price) > 0
        ? Number(si.price)
        : Number(match?.last_purchase_price || match?.buying_price || 0),
    };
  };

  const addItem = (preset?: SuppliedItem | string) => {
    if (preset && typeof preset !== "string") {
      setForm(f => ({ ...f, items: [...f.items, buildItemFromSupplied(preset)] }));
      return;
    }
    const presetName = typeof preset === "string" ? preset : "";
    const match = presetName
      ? products.find(p => p.name.trim().toLowerCase() === presetName.trim().toLowerCase())
      : null;
    setForm(f => ({
      ...f,
      items: [...f.items, {
        product_id: match?.id || null,
        product_name: presetName,
        unit: "piece",
        quantity: 1,
        unit_cost: Number(match?.last_purchase_price || match?.buying_price || 0),
      }],
    }));
  };
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, patch: Partial<Item>) => setForm(f => ({
    ...f,
    items: f.items.map((it, idx) => {
      if (idx !== i) return it;
      const next = { ...it, ...patch };
      if (patch.product_name !== undefined) {
        const match = products.find(p => p.name.trim().toLowerCase() === next.product_name.trim().toLowerCase());
        next.product_id = match?.id || null;
        // Try supplier default price first when name matches a supplier entry
        const supplied = supplierItems.find(s => s.name.trim().toLowerCase() === next.product_name.trim().toLowerCase());
        if (supplied) {
          if (!it.unit_cost && Number(supplied.price) > 0) next.unit_cost = Number(supplied.price);
          if (!it.unit || it.unit === "piece") next.unit = supplied.unit || next.unit;
        } else if (match && !it.unit_cost) {
          next.unit_cost = Number(match.last_purchase_price || match.buying_price || 0);
        }
      }
      return next;
    }),
  }));

  const addAllSupplierProducts = () => {
    if (!supplierItems.length) return;
    const existingNames = new Set(form.items.map(i => i.product_name.trim().toLowerCase()));
    const toAdd = supplierItems.filter(si => !existingNames.has(si.name.toLowerCase()));
    setForm(f => ({
      ...f,
      items: [...f.items, ...toAdd.map(buildItemFromSupplied)],
    }));
  };

  const save = async (status: "draft" | "approved") => {
    if (!form.supplier_id) { toast.error("Select a supplier"); return; }
    if (form.items.length === 0) { toast.error("Add at least one item"); return; }
    if (form.items.some(i => !i.product_name.trim() || !i.quantity || i.quantity <= 0)) {
      toast.error("Every item needs a name and quantity"); return;
    }
    setSaving(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
      const tenant_id = profile?.tenant_id;
      if (!tenant_id) throw new Error("No tenant");

      const po_number = `PO-${Date.now().toString().slice(-7)}`;
      const { data: po, error } = await (supabase as any)
        .from("purchase_orders")
        .insert({
          tenant_id,
          supplier_id: form.supplier_id,
          po_number,
          status,
          total_amount: totalAmount,
          notes: form.notes || null,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;

      const itemsRows = form.items.map(i => ({
        purchase_order_id: po.id,
        product_id: i.product_id,
        product_name: i.product_name.trim(),
        quantity: Number(i.quantity),
        unit_cost: Number(i.unit_cost),
        total_cost: Number(i.quantity) * Number(i.unit_cost),
      }));
      const { error: itErr } = await (supabase as any).from("purchase_order_items").insert(itemsRows);
      if (itErr) throw itErr;

      toast.success(`Purchase order ${status === "draft" ? "saved as draft" : "approved"}`);
      setOpen(false);
      setForm({ supplier_id: "", notes: "", items: [] });
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <ShoppingBag className="h-6 w-6 text-primary" /> Purchase Orders
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage orders sent to your suppliers.</p>
          </div>
          {canEdit && <Button onClick={() => { setForm({ supplier_id: "", notes: "", items: [] }); setOpen(true); }}><Plus className="h-4 w-4 mr-1" />New PO</Button>}
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
        ) : orders.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
            No purchase orders yet.
          </CardContent></Card>
        ) : (
          <div className="grid gap-2">
            {orders.map(po => (
              <Card key={po.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{po.po_number}</p>
                        <Badge variant="outline">{po.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {po.supplier_name || "—"} · {new Date(po.ordered_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">{Number(po.total_amount).toLocaleString()}</p>
                      {canEdit && po.status === "approved" && (
                        <Button size="sm" variant="outline" asChild>
                          <Link to={`/grn?po=${po.id}`}>
                            Receive goods <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Purchase Order</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Supplier *</Label>
              <Select
                value={form.supplier_id}
                onValueChange={v => setForm({ ...form, supplier_id: v, items: [] })}
              >
                <SelectTrigger><SelectValue placeholder="Choose supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No active suppliers. <Link to="/suppliers" className="text-primary">Add one</Link>
                    </div>
                  ) : suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {form.supplier_id && (
              <div className="rounded border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Products supplied by {selectedSupplier?.name}
                  </p>
                  {supplierItems.length > 0 && (
                    <Button size="sm" variant="outline" onClick={addAllSupplierProducts}>
                      Add all
                    </Button>
                  )}
                </div>
                {supplierItems.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This supplier has no products listed. Edit the supplier and add the
                    products they supply (with unit & price), or add a custom item below.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {supplierItems.map(si => {
                      const already = form.items.some(i => i.product_name.trim().toLowerCase() === si.name.toLowerCase());
                      const inInventory = products.some(p => p.name.trim().toLowerCase() === si.name.toLowerCase());
                      return (
                        <button
                          key={si.name}
                          type="button"
                          disabled={already}
                          onClick={() => addItem(si)}
                          className={`text-xs px-2 py-1 rounded border transition ${
                            already
                              ? "opacity-50 cursor-not-allowed bg-background"
                              : "bg-background hover:bg-primary hover:text-primary-foreground"
                          }`}
                          title={`${si.price > 0 ? si.price.toLocaleString() + " / " + si.unit : "no default price"}${inInventory ? " · in inventory" : " · new product"}`}
                        >
                          + {si.name}
                          {si.price > 0 && <span className="opacity-70"> · {si.price.toLocaleString()}/{si.unit}</span>}
                          {!inInventory && " ✨"}
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Prices come from this supplier's profile. ✨ = not yet in your inventory; it will be created when goods are received.
                </p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Items</Label>
                <Button size="sm" variant="outline" onClick={() => addItem("")}>
                  <Plus className="h-3 w-3 mr-1" />Custom item
                </Button>
              </div>
              {form.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 border rounded">
                  {form.supplier_id ? "Pick from supplier products above or add a custom item." : "Select a supplier to begin."}
                </p>
              ) : (
                <div className="space-y-2">
                  {form.items.map((it, i) => {
                    const isNew = !it.product_id && it.product_name.trim().length > 0;
                    return (
                      <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border rounded">
                        <div className="col-span-12 sm:col-span-4">
                          <Label className="text-[10px] flex items-center gap-1">
                            Product
                            {isNew && <Badge variant="outline" className="text-[9px] py-0">new</Badge>}
                            {it.product_id && <Badge variant="secondary" className="text-[9px] py-0">in stock</Badge>}
                          </Label>
                          <Input
                            list={`supplier-products-${form.supplier_id}`}
                            placeholder="Product name"
                            value={it.product_name}
                            onChange={e => updateItem(i, { product_name: e.target.value })}
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-[10px]">Unit</Label>
                          <Input value={it.unit} onChange={e => updateItem(i, { unit: e.target.value })} placeholder="piece" />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-[10px]">Qty</Label>
                          <Input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, { quantity: Number(e.target.value) })} />
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <Label className="text-[10px]">Unit Cost</Label>
                          <Input type="number" min={0} value={it.unit_cost} readOnly className="bg-muted/40 cursor-not-allowed" title="Set from the supplier's profile" />
                        </div>
                        <div className="col-span-10 sm:col-span-1 text-right text-sm font-semibold">
                          {(it.quantity * it.unit_cost).toLocaleString()}
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                    );
                  })}
                  <datalist id={`supplier-products-${form.supplier_id}`}>
                    {supplierItems.map(si => <option key={si.name} value={si.name} />)}
                  </datalist>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold">{totalAmount.toLocaleString()}</span>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>Save draft</Button>
            <Button onClick={() => save("approved")} disabled={saving}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default PurchaseOrders;
