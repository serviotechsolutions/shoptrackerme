import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { Plus, Search, Users, Phone, Mail, Download, Pencil, Building2, Trash2 } from "lucide-react";

type SuppliedItem = { name: string; unit: string; price: number };

type Supplier = {
  id: string;
  tenant_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  company_name: string | null;
  tax_number: string | null;
  business_reg_number: string | null;
  products_supplied: string | null;
  supplied_items: SuppliedItem[] | null;
  notes: string | null;
  status: "active" | "inactive";
};

const emptyForm: Partial<Supplier> = { status: "active", supplied_items: [] };

const Suppliers = () => {
  const { user } = useAuth();
  const { canManageProducts, isAdmin } = useUserRole();
  const canEdit = canManageProducts || isAdmin;

  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [stats, setStats] = useState<Record<string, { total: number; outstanding: number }>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("suppliers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load suppliers", { description: error.message });
      setLoading(false);
      return;
    }
    const list = (data || []) as Supplier[];
    setSuppliers(list);

    // Load purchase + payment stats
    const ids = list.map(s => s.id);
    if (ids.length) {
      const [{ data: pos }, { data: pays }] = await Promise.all([
        (supabase as any).from("purchase_orders").select("supplier_id,total_amount,amount_paid").in("supplier_id", ids),
        (supabase as any).from("supplier_payments").select("supplier_id,amount").in("supplier_id", ids),
      ]);
      const map: Record<string, { total: number; outstanding: number }> = {};
      ids.forEach(id => (map[id] = { total: 0, outstanding: 0 }));
      (pos || []).forEach((p: any) => {
        if (!map[p.supplier_id]) return;
        map[p.supplier_id].total += Number(p.total_amount) || 0;
        map[p.supplier_id].outstanding += (Number(p.total_amount) || 0) - (Number(p.amount_paid) || 0);
      });
      (pays || []).forEach((p: any) => {
        if (!map[p.supplier_id]) return;
        map[p.supplier_id].outstanding -= Number(p.amount) || 0;
      });
      setStats(map);
    } else {
      setStats({});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter(s => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return [s.name, s.contact_person, s.phone, s.email, s.company_name]
        .some(v => (v || "").toLowerCase().includes(q));
    });
  }, [suppliers, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const startCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const startEdit = (s: Supplier) => {
    setEditing(s);
    // Migrate legacy comma-separated string into structured rows if needed
    let items: SuppliedItem[] = Array.isArray(s.supplied_items) ? s.supplied_items : [];
    if ((!items || items.length === 0) && s.products_supplied) {
      items = s.products_supplied
        .split(/[\n,;|]+/).map(x => x.trim()).filter(Boolean)
        .map(name => ({ name, unit: "piece", price: 0 }));
    }
    setForm({ ...s, supplied_items: items });
    setOpen(true);
  };

  const addSupplied = () => setForm(f => ({ ...f, supplied_items: [...(f.supplied_items || []), { name: "", unit: "piece", price: 0 }] }));
  const updateSupplied = (i: number, patch: Partial<SuppliedItem>) => setForm(f => ({
    ...f,
    supplied_items: (f.supplied_items || []).map((it, idx) => idx === i ? { ...it, ...patch } : it),
  }));
  const removeSupplied = (i: number) => setForm(f => ({ ...f, supplied_items: (f.supplied_items || []).filter((_, idx) => idx !== i) }));

  const save = async () => {
    if (!form.name?.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    setSaving(true);
    try {
      // Get tenant id
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
      if (!profile?.tenant_id) throw new Error("No tenant");

      const payload: any = {
        tenant_id: profile.tenant_id,
        name: form.name?.trim(),
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        alt_phone: form.alt_phone || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        country: form.country || null,
        company_name: form.company_name || null,
        tax_number: form.tax_number || null,
        business_reg_number: form.business_reg_number || null,
        products_supplied: form.products_supplied || null,
        notes: form.notes || null,
        status: form.status || "active",
      };
      if (editing) {
        const { error } = await (supabase as any).from("suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Supplier updated");
      } else {
        const { error } = await (supabase as any).from("suppliers").insert(payload);
        if (error) throw error;
        toast.success("Supplier added");
      }
      setOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const exportCSV = () => {
    const rows = [
      ["Name", "Contact Person", "Phone", "Email", "City", "Country", "Status", "Total Purchases", "Outstanding"],
      ...filtered.map(s => [
        s.name, s.contact_person || "", s.phone || "", s.email || "",
        s.city || "", s.country || "", s.status,
        (stats[s.id]?.total || 0).toFixed(2),
        (stats[s.id]?.outstanding || 0).toFixed(2),
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `suppliers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Suppliers
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your suppliers, purchases, and balances.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="h-4 w-4 mr-2" />Export</Button>
            {canEdit && <Button size="sm" onClick={startCreate}><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search name, phone, email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
        ) : paginated.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
            No suppliers yet. {canEdit && "Click \"Add Supplier\" to get started."}
          </CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {paginated.map(s => {
              const st = stats[s.id] || { total: 0, outstanding: 0 };
              return (
                <Card key={s.id} className="hover:shadow-md transition">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link to={`/suppliers/${s.id}`} className="font-semibold text-base hover:underline truncate">
                            {s.name}
                          </Link>
                          <Badge variant={s.status === "active" ? "default" : "secondary"} className="text-xs">
                            {s.status}
                          </Badge>
                        </div>
                        {s.contact_person && <p className="text-sm text-muted-foreground mt-0.5">{s.contact_person}</p>}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                          {s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}
                          {s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>}
                          {s.products_supplied && <span className="truncate max-w-[200px]">📦 {s.products_supplied}</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:flex sm:flex-col sm:items-end gap-2 sm:gap-1 text-sm">
                        <div className="sm:text-right">
                          <p className="text-xs text-muted-foreground">Total purchases</p>
                          <p className="font-semibold">{st.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-xs text-muted-foreground">Outstanding</p>
                          <p className={`font-semibold ${st.outstanding > 0 ? "text-orange-600" : ""}`}>
                            {st.outstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </p>
                        </div>
                      </div>
                      {canEdit && (
                        <Button variant="ghost" size="icon" onClick={() => startEdit(s)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 pt-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
            <span className="text-sm">Page {page} of {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Supplier Name *" value={form.name} onChange={v => setForm({ ...form, name: v })} />
            <Field label="Contact Person" value={form.contact_person} onChange={v => setForm({ ...form, contact_person: v })} />
            <Field label="Phone" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
            <Field label="Alternative Phone" value={form.alt_phone} onChange={v => setForm({ ...form, alt_phone: v })} />
            <Field label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} type="email" />
            <Field label="City / District" value={form.city} onChange={v => setForm({ ...form, city: v })} />
            <Field label="Country" value={form.country} onChange={v => setForm({ ...form, country: v })} />
            <Field label="Company Name" value={form.company_name} onChange={v => setForm({ ...form, company_name: v })} />
            <Field label="Tax ID" value={form.tax_number} onChange={v => setForm({ ...form, tax_number: v })} />
            <Field label="Business Reg. Number" value={form.business_reg_number} onChange={v => setForm({ ...form, business_reg_number: v })} />
            <div className="sm:col-span-2">
              <Label className="text-xs">Address</Label>
              <Textarea rows={2} value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Products Supplied</Label>
              <Textarea rows={2} placeholder="e.g. Rice, Sugar, Soap" value={form.products_supplied || ""} onChange={e => setForm({ ...form, products_supplied: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} />
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
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const Field = ({
  label, value, onChange, type = "text",
}: { label: string; value: any; onChange: (v: string) => void; type?: string }) => (
  <div>
    <Label className="text-xs">{label}</Label>
    <Input type={type} value={value || ""} onChange={e => onChange(e.target.value)} />
  </div>
);

export default Suppliers;
