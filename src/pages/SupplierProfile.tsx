import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, Plus, Download, Upload, FileText,
  Star, Trash2, Package, DollarSign,
} from "lucide-react";

type Supplier = any;
type PO = { id: string; po_number: string; status: string; total_amount: number; amount_paid: number; ordered_at: string; received_at: string | null };
type Payment = { id: string; amount: number; payment_method: string | null; reference_number: string | null; paid_at: string; notes: string | null };
type Doc = { id: string; doc_type: string | null; file_name: string; file_path: string; created_at: string };

const SupplierProfile = () => {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const { canManageProducts, isAdmin } = useUserRole();
  const canEdit = canManageProducts || isAdmin;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [pos, setPos] = useState<PO[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState<any>({ amount: "", payment_method: "Cash", reference_number: "", notes: "" });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: s }, { data: p }, { data: pay }, { data: d }, { data: prods }] = await Promise.all([
      (supabase as any).from("suppliers").select("*").eq("id", id).maybeSingle(),
      (supabase as any).from("purchase_orders").select("*").eq("supplier_id", id).order("ordered_at", { ascending: false }),
      (supabase as any).from("supplier_payments").select("*").eq("supplier_id", id).order("paid_at", { ascending: false }),
      (supabase as any).from("supplier_documents").select("*").eq("supplier_id", id).order("created_at", { ascending: false }),
      (supabase as any).from("products").select("id,name,stock,last_purchase_price").eq("preferred_supplier_id", id),
    ]);
    setSupplier(s);
    setPos((p || []) as PO[]);
    setPayments((pay || []) as Payment[]);
    setDocs((d || []) as Doc[]);
    setProducts(prods || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const totalPurchases = pos.reduce((a, b) => a + Number(b.total_amount || 0), 0);
  const totalPaid = payments.reduce((a, b) => a + Number(b.amount || 0), 0)
    + pos.reduce((a, b) => a + Number(b.amount_paid || 0), 0);
  const outstanding = totalPurchases - totalPaid;
  const lastPurchase = pos[0]?.ordered_at;

  // Reliability: % of POs received
  const received = pos.filter(p => p.status === "received").length;
  const reliability = pos.length > 0 ? Math.round((received / pos.length) * 100) : 0;
  const rating = reliability >= 90 ? 5 : reliability >= 75 ? 4 : reliability >= 50 ? 3 : reliability >= 25 ? 2 : pos.length === 0 ? 0 : 1;

  const recordPayment = async () => {
    if (!payForm.amount || Number(payForm.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
    const { error } = await (supabase as any).from("supplier_payments").insert({
      tenant_id: profile?.tenant_id,
      supplier_id: id,
      amount: Number(payForm.amount),
      payment_method: payForm.payment_method,
      reference_number: payForm.reference_number || null,
      notes: payForm.notes || null,
      created_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Payment recorded");
    setPayOpen(false);
    setPayForm({ amount: "", payment_method: "Cash", reference_number: "", notes: "" });
    load();
  };

  const uploadDoc = async (file: File) => {
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user!.id).maybeSingle();
    if (!profile?.tenant_id) return;
    const path = `${profile.tenant_id}/${id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("supplier-documents").upload(path, file);
    if (upErr) { toast.error(upErr.message); return; }
    const { error } = await (supabase as any).from("supplier_documents").insert({
      tenant_id: profile.tenant_id,
      supplier_id: id,
      doc_type: file.type.includes("pdf") ? "PDF" : "File",
      file_name: file.name,
      file_path: path,
      uploaded_by: user!.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Document uploaded");
    load();
  };

  const downloadDoc = async (doc: Doc) => {
    const { data, error } = await supabase.storage.from("supplier-documents").createSignedUrl(doc.file_path, 60);
    if (error) { toast.error(error.message); return; }
    window.open(data.signedUrl, "_blank");
  };

  const deleteDoc = async (doc: Doc) => {
    await supabase.storage.from("supplier-documents").remove([doc.file_path]);
    await (supabase as any).from("supplier_documents").delete().eq("id", doc.id);
    toast.success("Deleted");
    load();
  };

  if (loading) {
    return <DashboardLayout><div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div></DashboardLayout>;
  }
  if (!supplier) {
    return <DashboardLayout><Card><CardContent className="p-10 text-center">Supplier not found.</CardContent></Card></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => nav("/suppliers")}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        </div>

        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 className="h-5 w-5 text-primary" />
                  <h1 className="text-2xl font-bold truncate">{supplier.name}</h1>
                  <Badge variant={supplier.status === "active" ? "default" : "secondary"}>{supplier.status}</Badge>
                </div>
                {supplier.company_name && <p className="text-sm text-muted-foreground mt-1">{supplier.company_name}</p>}
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mt-3 text-sm">
                  {supplier.contact_person && <p>👤 {supplier.contact_person}</p>}
                  {supplier.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{supplier.phone}</p>}
                  {supplier.alt_phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{supplier.alt_phone}</p>}
                  {supplier.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{supplier.email}</p>}
                  {(supplier.address || supplier.city || supplier.country) && (
                    <p className="flex items-center gap-1 sm:col-span-2"><MapPin className="h-3 w-3" />{[supplier.address, supplier.city, supplier.country].filter(Boolean).join(", ")}</p>
                  )}
                  {supplier.products_supplied && <p className="sm:col-span-2">📦 {supplier.products_supplied}</p>}
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center justify-end gap-0.5">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={`h-4 w-4 ${i <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`} />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{reliability}% reliability</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Purchase Orders" value={pos.length} icon={FileText} />
          <StatCard label="Total Purchased" value={totalPurchases.toLocaleString(undefined,{maximumFractionDigits:0})} icon={DollarSign} />
          <StatCard label="Outstanding" value={outstanding.toLocaleString(undefined,{maximumFractionDigits:0})} icon={DollarSign} tone={outstanding > 0 ? "warn" : undefined} />
          <StatCard label="Last Purchase" value={lastPurchase ? new Date(lastPurchase).toLocaleDateString() : "—"} icon={Package} />
        </div>

        <Tabs defaultValue="orders">
          <TabsList className="grid grid-cols-4 w-full sm:w-auto">
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="documents">Docs</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row justify-between items-center pb-3">
                <CardTitle className="text-base">Purchase History</CardTitle>
                {canEdit && (
                  <Button size="sm" asChild>
                    <Link to={`/purchase-orders?supplier=${id}`}><Plus className="h-4 w-4 mr-1" />New PO</Link>
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {pos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No purchase orders yet.</p>
                ) : (
                  <div className="space-y-2">
                    {pos.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-3 rounded-md border">
                        <div>
                          <p className="font-medium text-sm">{p.po_number}</p>
                          <p className="text-xs text-muted-foreground">{new Date(p.ordered_at).toLocaleDateString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-sm">{Number(p.total_amount).toLocaleString()}</p>
                          <Badge variant="outline" className="text-xs">{p.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row justify-between items-center pb-3">
                <CardTitle className="text-base">Payments</CardTitle>
                {canEdit && <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="h-4 w-4 mr-1" />Record</Button>}
              </CardHeader>
              <CardContent>
                {payments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No payments recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {payments.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-3 rounded-md border">
                        <div>
                          <p className="font-medium text-sm">{Number(p.amount).toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.payment_method} {p.reference_number && `· ${p.reference_number}`}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Products from this Supplier</CardTitle></CardHeader>
              <CardContent>
                {products.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No products linked. Set this supplier as preferred from a product.</p>
                ) : (
                  <div className="space-y-2">
                    {products.map(p => (
                      <div key={p.id} className="flex justify-between items-center p-3 rounded-md border">
                        <p className="text-sm font-medium">{p.name}</p>
                        <div className="text-right text-xs text-muted-foreground">
                          <p>Stock: <span className="font-semibold text-foreground">{p.stock}</span></p>
                          {p.last_purchase_price && <p>Last: {Number(p.last_purchase_price).toLocaleString()}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row justify-between items-center pb-3">
                <CardTitle className="text-base">Documents</CardTitle>
                {canEdit && (
                  <label className="cursor-pointer">
                    <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(f); e.target.value = ""; }} />
                    <span className="inline-flex items-center gap-1 text-sm font-medium bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:opacity-90">
                      <Upload className="h-4 w-4" />Upload
                    </span>
                  </label>
                )}
              </CardHeader>
              <CardContent>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No documents uploaded.</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map(d => (
                      <div key={d.id} className="flex justify-between items-center p-3 rounded-md border">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{d.file_name}</p>
                            <p className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => downloadDoc(d)}><Download className="h-4 w-4" /></Button>
                          {canEdit && <Button variant="ghost" size="icon" onClick={() => deleteDoc(d)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label className="text-xs">Amount *</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
            <div>
              <Label className="text-xs">Method</Label>
              <Select value={payForm.payment_method} onValueChange={v => setPayForm({ ...payForm, payment_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Cash","Bank Transfer","Mobile Money","Cheque","Card"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Reference</Label><Input value={payForm.reference_number} onChange={e => setPayForm({ ...payForm, reference_number: e.target.value })} /></div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={recordPayment}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const StatCard = ({ label, value, icon: Icon, tone }: any) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className={`text-lg font-bold mt-0.5 truncate ${tone === "warn" ? "text-orange-600" : ""}`}>{value}</p>
        </div>
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </CardContent>
  </Card>
);

export default SupplierProfile;
