import { useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Trash2, FileText, ShoppingBag, ArrowRight } from "lucide-react";

type Supplier = { id: string; name: string };
type Product = { id: string; name: string; buying_price: number | null; last_purchase_price: number | null };
type Item = { product_id: string | null; product_name: string; quantity: number; unit_cost: number };
type PO = { id: string; po_number: string; supplier_id: string | null; status: string; total_amount: number; amount_paid: number; ordered_at: string; received_at: string | null };

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
      (supabase as any).from("suppliers").select("id,name").eq("status", "active").order("name"),
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

  const totalAmount = useMemo(
    () => form.items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0), 0),
    [form.items]
  );

  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { product_id: null, product_name: "", quantity: 1, unit_cost: 0 }] }));
  const removeItem = (i: number) => setForm(f => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }));
  const updateItem = (i: number, patch: Partial<Item>) => setForm(f => ({
    ...f,
    items: f.items.map((it, idx) => idx === i ? { ...it, ...patch } : it),
  }));
  const pickProduct = (i: number, productId: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    updateItem(i, {
      product_id: p.id,
      product_name: p.name,
      unit_cost: Number(p.last_purchase_price || p.buying_price || 0),
    });
  };

  const save = async (status: "draft" | "approved") => {
    if (!form.supplier_id) { toast.error("Select a supplier"); return; }
    if (form.items.length === 0) { toast.error("Add at least one item"); return; }
    if (form.items.some(i => !i.product_name || !i.quantity || i.quantity <= 0)) {
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
        product_name: i.product_name,
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

  const markReceived = async (po: PO) => {
    const { error } = await (supabase as any)
      .from("purchase_orders")
      .update({ status: "received", received_at: new Date().toISOString() })
      .eq("id", po.id);
    if (error) { toast.error(error.message); return; }

    // Bump stock from PO items
    const { data: items } = await (supabase as any).from("purchase_order_items").select("*").eq("purchase_order_id", po.id);
    for (const it of (items || []) as any[]) {
      if (!it.product_id) continue;
      const { data: prod } = await supabase.from("products").select("stock").eq("id", it.product_id).maybeSingle();
      const newStock = Number(prod?.stock || 0) + Number(it.quantity);
      await supabase.from("products").update({
        stock: newStock,
        last_purchase_price: Number(it.unit_cost),
      }).eq("id", it.product_id);
    }
    toast.success("Stock updated from received PO");
    load();
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
                      {canEdit && po.status !== "received" && po.status !== "cancelled" && (
                        <Button size="sm" variant="outline" onClick={() => markReceived(po)}>
                          Mark received <ArrowRight className="h-3 w-3 ml-1" />
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
              <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
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

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Items</Label>
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add item</Button>
              </div>
              {form.items.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3 border rounded">No items yet</p>
              ) : (
                <div className="space-y-2">
                  {form.items.map((it, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end p-2 border rounded">
                      <div className="col-span-12 sm:col-span-5">
                        <Label className="text-[10px]">Product</Label>
                        <Select value={it.product_id || ""} onValueChange={v => pickProduct(i, v)}>
                          <SelectTrigger><SelectValue placeholder="Pick product" /></SelectTrigger>
                          <SelectContent>
                            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Label className="text-[10px]">Qty</Label>
                        <Input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, { quantity: Number(e.target.value) })} />
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <Label className="text-[10px]">Unit Cost</Label>
                        <Input type="number" min={0} value={it.unit_cost} onChange={e => updateItem(i, { unit_cost: Number(e.target.value) })} />
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right text-sm font-semibold">
                        {(it.quantity * it.unit_cost).toLocaleString()}
                      </div>
                      <div className="col-span-1">
                        <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
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
