import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { ArrowLeft, Edit, Phone, Mail, MapPin, Calendar, Download, AlertTriangle, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import WhatsAppSendDialog from "@/components/WhatsAppSendDialog";

const CustomerProfile = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waMessages, setWaMessages] = useState<any[]>([]);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const { data: c } = await supabase.from("customers").select("*").eq("id", id).single();
    setCustomer(c);
    if (!c) { setLoading(false); return; }
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("sales").select("*").eq("customer_id", id).order("created_at", { ascending: false }),
      supabase.from("payments").select("*").eq("customer_id", id).order("payment_date", { ascending: false }),
    ]);
    setSales(s || []);
    setPayments(p || []);
    const saleIds = (s || []).map((x: any) => x.id);
    if (saleIds.length) {
      const { data: t } = await supabase.from("transactions").select("*").in("sale_id", saleIds);
      setTransactions(t || []);
    } else setTransactions([]);
    const { data: wa } = await supabase.from("whatsapp_messages").select("*").eq("customer_id", id).order("created_at", { ascending: false }).limit(50);
    setWaMessages(wa || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const stats = useMemo(() => {
    const total = sales.reduce((s, x) => s + Number(x.total_amount || 0), 0);
    const count = sales.length;
    const avg = count > 0 ? total / count : 0;
    const outstanding = payments
      .filter(p => ["pending", "pending_customer", "credit"].includes(p.payment_status))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const paid = payments.filter(p => p.payment_status === "completed").reduce((s, p) => s + Number(p.amount || 0), 0);
    const last = sales[0]?.created_at || null;
    return { total, count, avg, outstanding, paid, last };
  }, [sales, payments]);

  const ledger = useMemo(() => {
    type Entry = { date: string; type: string; desc: string; debit: number; credit: number };
    const entries: Entry[] = [];
    sales.forEach(s => entries.push({
      date: s.created_at, type: "Sale", desc: `Sale ${s.id.slice(0, 8)}`,
      debit: Number(s.total_amount || 0), credit: 0,
    }));
    payments.filter(p => p.payment_status === "completed").forEach(p => entries.push({
      date: p.payment_date || p.created_at, type: "Payment", desc: `${p.payment_method} ${p.reference_number || ""}`.trim(),
      debit: 0, credit: Number(p.amount || 0),
    }));
    entries.sort((a, b) => a.date.localeCompare(b.date));
    let running = 0;
    return entries.map(e => { running += e.debit - e.credit; return { ...e, balance: running }; });
  }, [sales, payments]);

  const exportCsv = () => {
    const rows = [["Date", "Type", "Description", "Debit", "Credit", "Balance"]];
    ledger.forEach(e => rows.push([format(new Date(e.date), "yyyy-MM-dd HH:mm"), e.type, e.desc, e.debit.toString(), e.credit.toString(), e.balance.toString()]));
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${customer?.name || "customer"}-ledger.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const creditUsed = stats.outstanding;
  const creditLimit = Number(customer?.credit_limit || 0);
  const creditAvail = Math.max(0, creditLimit - creditUsed);

  if (loading) return <DashboardLayout><div className="py-12 text-center">Loading…</div></DashboardLayout>;
  if (!customer) return <DashboardLayout><div className="py-12 text-center">Customer not found.</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link to="/customers"><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button></Link>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setWaOpen(true)} disabled={!customer?.phone} className="text-green-700 border-green-300"><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</Button>
            <Button onClick={() => setEditOpen(true)}><Edit className="h-4 w-4 mr-1" /> Edit</Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4 flex-wrap">
              {customer.photo_url
                ? <img src={customer.photo_url} alt="" className="h-20 w-20 rounded-full object-cover border" />
                : <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold">{customer.name?.charAt(0).toUpperCase() || "?"}</div>}
              <div className="flex-1">
                <h1 className="text-2xl font-bold">{customer.name}</h1>
                <div className="text-sm text-muted-foreground flex flex-wrap gap-3 mt-1">
                  {customer.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {customer.phone}</span>}
                  {customer.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {customer.email}</span>}
                  {(customer.city || customer.district) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {[customer.city, customer.district, customer.country].filter(Boolean).join(", ")}</span>}
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {format(new Date(customer.created_at), "MMM d, yyyy")}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant={customer.status === "active" ? "outline" : customer.status === "blocked" ? "destructive" : "secondary"}>{customer.status}</Badge>
                  <Badge variant="secondary">{customer.loyalty_tier || "bronze"} tier</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Revenue</div><div className="text-xl font-bold">UGX {stats.total.toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Transactions</div><div className="text-xl font-bold">{stats.count}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Avg. Purchase</div><div className="text-xl font-bold">UGX {Math.round(stats.avg).toLocaleString()}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className={`text-xl font-bold ${stats.outstanding > 0 ? "text-destructive" : ""}`}>UGX {stats.outstanding.toLocaleString()}</div></CardContent></Card>
        </div>

        {creditLimit > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Credit Account</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4 text-sm">
              <div><div className="text-xs text-muted-foreground">Credit Limit</div><div className="font-medium">UGX {creditLimit.toLocaleString()}</div></div>
              <div><div className="text-xs text-muted-foreground">Used</div><div className="font-medium">UGX {creditUsed.toLocaleString()}</div></div>
              <div><div className="text-xs text-muted-foreground">Available</div><div className="font-medium text-primary">UGX {creditAvail.toLocaleString()}</div></div>
              {creditUsed > creditLimit && (
                <div className="col-span-3 flex items-center gap-2 text-destructive text-xs"><AlertTriangle className="h-4 w-4" /> Customer is over their credit limit.</div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="purchases">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
            <TabsTrigger value="payments">Payments</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          </TabsList>

          <TabsContent value="purchases">
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b"><tr>
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Receipt</th>
                    <th className="text-left py-2 px-3">Items</th>
                    <th className="text-left py-2 px-3">Payment</th>
                    <th className="text-right py-2 px-3">Total</th>
                  </tr></thead>
                  <tbody>
                    {sales.length === 0 ? <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No purchases yet.</td></tr>
                      : sales.map(s => {
                        const items = transactions.filter(t => t.sale_id === s.id);
                        return (
                          <tr key={s.id} className="border-b">
                            <td className="py-2 px-3">{format(new Date(s.created_at), "MMM d, yyyy HH:mm")}</td>
                            <td className="py-2 px-3 font-mono text-xs">{s.id.slice(0, 8)}</td>
                            <td className="py-2 px-3">{items.length > 0 ? items.map(i => `${i.product_name} ×${i.quantity}`).join(", ") : "—"}</td>
                            <td className="py-2 px-3"><Badge variant="outline">{s.payment_method}</Badge></td>
                            <td className="py-2 px-3 text-right font-medium">UGX {Number(s.total_amount).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="payments">
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b"><tr>
                    <th className="text-left py-2 px-3">Date</th>
                    <th className="text-left py-2 px-3">Method</th>
                    <th className="text-left py-2 px-3">Reference</th>
                    <th className="text-left py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Amount</th>
                  </tr></thead>
                  <tbody>
                    {payments.length === 0 ? <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No payments yet.</td></tr>
                      : payments.map(p => (
                        <tr key={p.id} className="border-b">
                          <td className="py-2 px-3">{format(new Date(p.payment_date || p.created_at), "MMM d, yyyy HH:mm")}</td>
                          <td className="py-2 px-3">{p.payment_method}</td>
                          <td className="py-2 px-3 font-mono text-xs">{p.reference_number || "—"}</td>
                          <td className="py-2 px-3"><Badge variant={p.payment_status === "completed" ? "outline" : "secondary"}>{p.payment_status}</Badge></td>
                          <td className="py-2 px-3 text-right font-medium">UGX {Number(p.amount).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="ledger">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Account Statement</CardTitle>
                <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b"><tr>
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-left py-2 px-3">Type</th>
                      <th className="text-left py-2 px-3">Description</th>
                      <th className="text-right py-2 px-3">Debit</th>
                      <th className="text-right py-2 px-3">Credit</th>
                      <th className="text-right py-2 px-3">Balance</th>
                    </tr></thead>
                    <tbody>
                      {ledger.length === 0 ? <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">No activity yet.</td></tr>
                        : ledger.map((e, i) => (
                          <tr key={i} className="border-b">
                            <td className="py-2 px-3">{format(new Date(e.date), "MMM d, yyyy")}</td>
                            <td className="py-2 px-3"><Badge variant="outline">{e.type}</Badge></td>
                            <td className="py-2 px-3">{e.desc}</td>
                            <td className="py-2 px-3 text-right">{e.debit > 0 ? e.debit.toLocaleString() : "-"}</td>
                            <td className="py-2 px-3 text-right">{e.credit > 0 ? e.credit.toLocaleString() : "-"}</td>
                            <td className={`py-2 px-3 text-right font-medium ${e.balance > 0 ? "text-destructive" : ""}`}>{e.balance.toLocaleString()}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details">
            <Card><CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><div className="text-xs text-muted-foreground">First Name</div><div>{customer.first_name || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Last Name</div><div>{customer.last_name || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Alt Phone</div><div>{customer.alt_phone || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Gender</div><div>{customer.gender || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Date of Birth</div><div>{customer.date_of_birth || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Country</div><div>{customer.country || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">District</div><div>{customer.district || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">City</div><div>{customer.city || "—"}</div></div>
              <div className="md:col-span-2"><div className="text-xs text-muted-foreground">Address</div><div>{customer.address || "—"}</div></div>
              <div className="md:col-span-2"><div className="text-xs text-muted-foreground">Notes</div><div className="whitespace-pre-wrap">{customer.notes || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Loyalty Points</div><div>{customer.loyalty_points || 0}</div></div>
              <div><div className="text-xs text-muted-foreground">Lifetime Value</div><div>UGX {Number(customer.lifetime_value || stats.total).toLocaleString()}</div></div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} tenantId={customer.tenant_id} customer={customer} onSaved={load} />
      <WhatsAppSendDialog
        open={waOpen}
        onOpenChange={setWaOpen}
        defaultPhone={customer.phone || ""}
        customerId={customer.id}
        customerName={customer.name}
        messageType="custom"
        onSent={load}
      />
    </DashboardLayout>
  );
};

export default CustomerProfile;
