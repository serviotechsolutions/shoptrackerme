import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Package } from "lucide-react";

export type SupplierProduct = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  product_id: string | null;
  name: string;
  sku: string | null;
  unit: string;
  unit_cost: number;
  min_order_qty: number | null;
  available_qty: number | null;
  brand: string | null;
  description: string | null;
  status: "active" | "inactive";
};

const UNITS = ["piece", "box", "carton", "bottle", "kg", "litre", "packet", "bag", "pair", "set"];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplierId: string;
  supplierName: string;
  canEdit: boolean;
};

const emptyForm: Partial<SupplierProduct> = {
  name: "", sku: "", unit: "piece", unit_cost: 0,
  min_order_qty: null, available_qty: null, brand: "", description: "",
  status: "active",
};

export default function SupplierCatalogueDialog({ open, onOpenChange, supplierId, supplierName, canEdit }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<SupplierProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierProduct | null>(null);
  const [form, setForm] = useState<Partial<SupplierProduct>>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!supplierId) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("supplier_products")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("name");
    if (error) toast.error(error.message);
    setRows((data || []) as SupplierProduct[]);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, supplierId]);

  const startCreate = () => { setEditing(null); setForm(emptyForm); setEditorOpen(true); };
  const startEdit = (r: SupplierProduct) => { setEditing(r); setForm(r); setEditorOpen(true); };

  const save = async () => {
    const name = (form.name || "").trim();
    if (!name) { toast.error("Product name is required"); return; }
    const price = Number(form.unit_cost);
    if (!price || price <= 0) { toast.error("Unit cost must be greater than 0"); return; }
    if (form.min_order_qty != null && Number(form.min_order_qty) < 0) { toast.error("Min order qty cannot be negative"); return; }
    if (form.available_qty != null && Number(form.available_qty) < 0) { toast.error("Available qty cannot be negative"); return; }

    setSaving(true);
    try {
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
      if (!profile?.tenant_id) throw new Error("No tenant");
      const payload: any = {
        tenant_id: profile.tenant_id,
        supplier_id: supplierId,
        name,
        sku: form.sku?.toString().trim() || null,
        unit: (form.unit || "piece").trim() || "piece",
        unit_cost: price,
        min_order_qty: form.min_order_qty === null || form.min_order_qty === undefined || form.min_order_qty === ("" as any)
          ? null : Number(form.min_order_qty),
        available_qty: form.available_qty === null || form.available_qty === undefined || form.available_qty === ("" as any)
          ? null : Number(form.available_qty),
        brand: form.brand?.toString().trim() || null,
        description: form.description?.toString().trim() || null,
        status: form.status || "active",
      };
      if (editing) {
        const { error } = await (supabase as any).from("supplier_products").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Catalogue item updated");
      } else {
        const { error } = await (supabase as any).from("supplier_products").insert(payload);
        if (error) throw error;
        toast.success("Catalogue item added");
      }
      setEditorOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: SupplierProduct) => {
    if (!confirm(`Remove "${r.name}" from ${supplierName}'s catalogue?`)) return;
    const { error } = await (supabase as any).from("supplier_products").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed");
    load();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Catalogue · {supplierName}
            </DialogTitle>
            <DialogDescription>
              Products this supplier sells you. Prices here pre-fill new Purchase Orders — existing orders keep their original snapshot price.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end">
            {canEdit && (
              <Button size="sm" onClick={startCreate}>
                <Plus className="h-4 w-4 mr-1" /> Add product
              </Button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8 border rounded">
              No catalogue items yet. Add the products this supplier delivers, with their unit and agreed price.
            </p>
          ) : (
            <div className="overflow-x-auto border rounded">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Product</th>
                    <th className="text-left p-2">Unit</th>
                    <th className="text-right p-2">Unit Cost</th>
                    <th className="text-right p-2">Available</th>
                    <th className="text-right p-2">Min Order</th>
                    <th className="text-center p-2">Status</th>
                    {canEdit && <th className="text-right p-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        <p className="font-medium">{r.name}</p>
                        <div className="flex gap-2 text-[10px] text-muted-foreground">
                          {r.sku && <span>SKU: {r.sku}</span>}
                          {r.brand && <span>· {r.brand}</span>}
                        </div>
                      </td>
                      <td className="p-2">{r.unit}</td>
                      <td className="p-2 text-right font-semibold">{Number(r.unit_cost).toLocaleString()}</td>
                      <td className="p-2 text-right">{r.available_qty ?? "—"}</td>
                      <td className="p-2 text-right">{r.min_order_qty ?? "—"}</td>
                      <td className="p-2 text-center">
                        <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-[10px]">{r.status}</Badge>
                      </td>
                      {canEdit && (
                        <td className="p-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit catalogue item" : "Add catalogue item"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Product name *</Label>
              <Input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">SKU / Code</Label>
              <Input value={form.sku || ""} onChange={e => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Unit *</Label>
              <Select value={form.unit || "piece"} onValueChange={v => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Supplier unit cost *</Label>
              <Input
                type="number" min={0.01} step="0.01"
                value={form.unit_cost ?? 0}
                onChange={e => setForm({ ...form, unit_cost: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Min order qty</Label>
              <Input
                type="number" min={0}
                value={form.min_order_qty ?? ""}
                onChange={e => setForm({ ...form, min_order_qty: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Available qty (supplier)</Label>
              <Input
                type="number" min={0}
                value={form.available_qty ?? ""}
                onChange={e => setForm({ ...form, available_qty: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </div>
            <div>
              <Label className="text-xs">Brand</Label>
              <Input value={form.brand || ""} onChange={e => setForm({ ...form, brand: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Description / notes</Label>
              <Textarea rows={2} value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status || "active"} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
