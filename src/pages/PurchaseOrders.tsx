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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Plus, Trash2, FileText, ShoppingBag, ArrowRight, Package, AlertTriangle } from "lucide-react";

type Supplier = { id: string; name: string };
type CatalogueItem = {
  id: string; supplier_id: string; product_id: string | null;
  name: string; unit: string; unit_cost: number;
  min_order_qty: number | null; available_qty: number | null;
  status: string;
};
type Product = { id: string; name: string; buying_price: number | null; last_purchase_price: number | null };

type Line = {
  is_custom_item: boolean;
  supplier_product_id: string | null;
  product_id: string | null;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  min_order_qty: number | null;
  available_qty: number | null;
};

type PO = { id: string; po_number: string; supplier_id: string | null; status: string; total_amount: number; amount_paid: number; ordered_at: string; received_at: string | null };

const UNITS = ["piece", "box", "carton", "bottle", "kg", "litre", "packet", "bag", "pair", "set"];

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
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogueLoading, setCatalogueLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([]);
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

  const loadCatalogue = async (sid: string) => {
    if (!sid) { setCatalogue([]); return; }
    setCatalogueLoading(true);
    const { data } = await (supabase as any)
      .from("supplier_products")
      .select("*")
      .eq("supplier_id", sid)
      .eq("status", "active")
      .order("name");
    setCatalogue((data || []) as CatalogueItem[]);
    setCatalogueLoading(false);
  };

  const onSupplierChange = (sid: string) => {
    setSupplierId(sid);
    setLines([]);
    loadCatalogue(sid);
  };

  // Auto-open from Stock Forecast presets
  useEffect(() => {
    if (!loading && (presetSupplier || presetProduct) && !open) {
      setOpen(true);
      if (presetSupplier) onSupplierChange(presetSupplier);
      if (presetProduct) {
        const prod = products.find(p => p.id === presetProduct);
        if (prod) {
          setLines([{
            is_custom_item: true,
            supplier_product_id: null,
            product_id: prod.id,
            product_name: prod.name,
            unit: "piece",
            quantity: presetQty ? Math.max(1, Number(presetQty)) : 1,
            unit_cost: Number(prod.last_purchase_price || prod.buying_price || 0),
            min_order_qty: null,
            available_qty: null,
          }]);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products.length]);

  const totalAmount = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0),
    [lines]
  );

  const addCatalogueLine = () => {
    setLines(ls => [...ls, {
      is_custom_item: false,
      supplier_product_id: null,
      product_id: null,
      product_name: "",
      unit: "",
      quantity: 1,
      unit_cost: 0,
      min_order_qty: null,
      available_qty: null,
    }]);
  };

  const addCustomLine = () => {
    setLines(ls => [...ls, {
      is_custom_item: true,
      supplier_product_id: null,
      product_id: null,
      product_name: "",
      unit: "piece",
      quantity: 1,
      unit_cost: 0,
      min_order_qty: null,
      available_qty: null,
    }]);
  };

  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));

  const pickCatalogueItem = (i: number, spId: string) => {
    const item = catalogue.find(c => c.id === spId);
    if (!item) return;
    setLines(ls => ls.map((l, idx) => idx === i ? {
      ...l,
      supplier_product_id: item.id,
      product_id: item.product_id,
      product_name: item.name,
      unit: item.unit,
      unit_cost: Number(item.unit_cost),
      min_order_qty: item.min_order_qty,
      available_qty: item.available_qty,
    } : l));
  };

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const save = async (status: "draft" | "approved") => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    if (lines.length === 0) { toast.error("Add at least one item"); return; }

    for (const l of lines) {
      if (!l.product_name.trim()) { toast.error("Every item needs a product name"); return; }
      if (!l.quantity || l.quantity <= 0) { toast.error(`Quantity for "${l.product_name}" must be greater than 0`); return; }
      if (!l.unit_cost || l.unit_cost <= 0) { toast.error(`Unit cost for "${l.product_name}" must be greater than 0`); return; }
      if (!l.is_custom_item && !l.supplier_product_id) {
        toast.error(`Choose a catalogue product for line "${l.product_name || "(empty)"}", or use Custom Item`);
        return;
      }
    }

    // Warn about below-min-order quantities (non-blocking)
    const belowMin = lines.filter(l => l.min_order_qty && l.quantity < Number(l.min_order_qty));
    if (belowMin.length) {
      const list = belowMin.map(l => `${l.product_name} (min ${l.min_order_qty})`).join(", ");
      if (!confirm(`Some items are below the supplier's minimum order qty:\n\n${list}\n\nContinue anyway?`)) return;
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
          supplier_id: supplierId,
          po_number,
          status,
          total_amount: totalAmount,
          notes: notes || null,
          created_by: user!.id,
        })
        .select().single();
      if (error) throw error;

      const itemsRows = lines.map(l => ({
        purchase_order_id: po.id,
        product_id: l.product_id,
        product_name: l.product_name.trim(),
        unit: l.unit || "piece",
        quantity: Number(l.quantity),
        unit_cost: Number(l.unit_cost),
        total_cost: Number(l.quantity) * Number(l.unit_cost),
        supplier_product_id: l.supplier_product_id,
        is_custom_item: l.is_custom_item,
      }));
      const { error: itErr } = await (supabase as any).from("purchase_order_items").insert(itemsRows);
      if (itErr) throw itErr;

      toast.success(`Purchase order ${status === "draft" ? "saved as draft" : "approved"}`);
      setOpen(false);
      setSupplierId(""); setNotes(""); setLines([]); setCatalogue([]);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setSupplierId(""); setNotes(""); setLines([]); setCatalogue([]);
    setOpen(true);
  };

  const selectedSupplierName = suppliers.find(s => s.id === supplierId)?.name || "";

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
          {canEdit && <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New PO</Button>}
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Purchase Order</DialogTitle>
            <DialogDescription>
              Prices come from the supplier's catalogue. Snapshot is saved with the order — future price changes never touch existing orders.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <Label className="text-xs">Supplier *</Label>
              <Select value={supplierId} onValueChange={onSupplierChange}>
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

            {supplierId && (
              <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Package className="h-3 w-3 text-primary" />
                  {catalogueLoading
                    ? "Loading catalogue…"
                    : `${catalogue.length} catalogue product${catalogue.length === 1 ? "" : "s"} for ${selectedSupplierName}`}
                </span>
                <Link to="/suppliers" className="text-primary hover:underline">Manage catalogue</Link>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Order Lines</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addCatalogueLine} disabled={!supplierId}>
                    <Plus className="h-3 w-3 mr-1" /> Catalogue item
                  </Button>
                  <Button size="sm" variant="secondary" onClick={addCustomLine} disabled={!supplierId}>
                    <Plus className="h-3 w-3 mr-1" /> Custom item
                  </Button>
                </div>
              </div>

              {lines.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4 border rounded">
                  {supplierId ? "Add a catalogue item or a custom item." : "Select a supplier first."}
                </p>
              ) : (
                <div className="space-y-2">
                  {lines.map((l, i) => {
                    const belowMin = l.min_order_qty != null && l.quantity < Number(l.min_order_qty);
                    return (
                      <div key={i} className={`p-3 border rounded space-y-2 ${l.is_custom_item ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`}>
                        <div className="flex items-center justify-between">
                          <Badge variant={l.is_custom_item ? "secondary" : "outline"} className="text-[10px]">
                            {l.is_custom_item ? "Custom Item" : "Catalogue"}
                          </Badge>
                          <Button size="icon" variant="ghost" onClick={() => removeLine(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        {l.is_custom_item ? (
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-12 sm:col-span-5">
                              <Label className="text-[10px]">Product name *</Label>
                              <Input value={l.product_name} onChange={e => updateLine(i, { product_name: e.target.value })} />
                            </div>
                            <div className="col-span-6 sm:col-span-2">
                              <Label className="text-[10px]">Unit *</Label>
                              <Select value={l.unit || "piece"} onValueChange={v => updateLine(i, { unit: v })}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-6 sm:col-span-2">
                              <Label className="text-[10px]">Qty *</Label>
                              <Input type="number" min={1} value={l.quantity}
                                onChange={e => updateLine(i, { quantity: Math.max(0, Number(e.target.value)) })} />
                            </div>
                            <div className="col-span-8 sm:col-span-2">
                              <Label className="text-[10px]">Unit cost *</Label>
                              <Input type="number" min={0.01} step="0.01" value={l.unit_cost}
                                onChange={e => updateLine(i, { unit_cost: Math.max(0, Number(e.target.value)) })} />
                            </div>
                            <div className="col-span-4 sm:col-span-1 text-right font-semibold text-sm self-end">
                              {(l.quantity * l.unit_cost).toLocaleString()}
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-12 gap-2">
                            <div className="col-span-12 sm:col-span-5">
                              <Label className="text-[10px]">Product *</Label>
                              <Select value={l.supplier_product_id || ""} onValueChange={v => pickCatalogueItem(i, v)}>
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder={catalogue.length ? "Choose product" : "No catalogue items"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {catalogue.length === 0 ? (
                                    <div className="p-2 text-xs text-muted-foreground">
                                      This supplier has no catalogue yet.{" "}
                                      <Link to="/suppliers" className="text-primary">Add products</Link>
                                    </div>
                                  ) : catalogue.filter(c => !lines.some((ll, idx) => idx !== i && ll.supplier_product_id === c.id)).map(c => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name} — {Number(c.unit_cost).toLocaleString()}/{c.unit}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-4 sm:col-span-1">
                              <Label className="text-[10px]">Unit</Label>
                              <Input value={l.unit} readOnly className="bg-muted/50 cursor-not-allowed h-9" />
                            </div>
                            <div className="col-span-8 sm:col-span-2">
                              <Label className="text-[10px]">Supplier cost</Label>
                              <Input value={l.unit_cost ? l.unit_cost.toLocaleString() : ""} readOnly className="bg-muted/50 cursor-not-allowed h-9" />
                            </div>
                            <div className="col-span-6 sm:col-span-2">
                              <Label className="text-[10px]">
                                Order qty *
                                {l.min_order_qty != null && (
                                  <span className="text-muted-foreground"> (min {l.min_order_qty})</span>
                                )}
                              </Label>
                              <Input
                                type="number" min={1} value={l.quantity}
                                onChange={e => updateLine(i, { quantity: Math.max(0, Number(e.target.value)) })}
                                className={belowMin ? "border-orange-500" : ""}
                              />
                            </div>
                            <div className="col-span-6 sm:col-span-2 text-right self-end">
                              <p className="text-[10px] text-muted-foreground">Line total</p>
                              <p className="font-semibold">{(l.quantity * l.unit_cost).toLocaleString()}</p>
                            </div>
                            {l.supplier_product_id && (
                              <div className="col-span-12 flex gap-4 text-[10px] text-muted-foreground">
                                {l.available_qty != null && <span>Available from supplier: {l.available_qty} {l.unit}</span>}
                                {belowMin && (
                                  <span className="text-orange-600 flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3" /> Below supplier minimum
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center py-2 border-t">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-xl font-bold">{totalAmount.toLocaleString()}</span>
            </div>

            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
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
