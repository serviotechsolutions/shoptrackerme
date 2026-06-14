import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserRole } from "@/hooks/useUserRole";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Users, Star, AlertTriangle, TrendingUp } from "lucide-react";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { format } from "date-fns";

interface Row {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  photo_url: string | null;
  totalSpent: number;
  totalPurchases: number;
  outstanding: number;
  lastPurchase: string | null;
  segment: "VIP" | "High Value" | "Regular" | "New" | "At Risk" | "Inactive";
}

const PAGE_SIZE = 20;

const Customers = () => {
  const { user } = useAuth();
  const { canManageProducts } = useUserRole();
  const [tenantId, setTenantId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "spent" | "recent">("recent");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).single();
    if (!profile?.tenant_id) { setLoading(false); return; }
    setTenantId(profile.tenant_id);

    const { data: customers } = await supabase.from("customers")
      .select("*").eq("tenant_id", profile.tenant_id).order("created_at", { ascending: false });

    const { data: sales } = await supabase.from("sales")
      .select("customer_id, total_amount, created_at").eq("tenant_id", profile.tenant_id);

    const { data: payments } = await supabase.from("payments")
      .select("customer_id, amount, payment_status").eq("tenant_id", profile.tenant_id);

    const salesByCustomer: Record<string, { total: number; count: number; last: string | null }> = {};
    (sales || []).forEach((s: any) => {
      if (!s.customer_id) return;
      const r = salesByCustomer[s.customer_id] ||= { total: 0, count: 0, last: null };
      r.total += Number(s.total_amount || 0);
      r.count += 1;
      if (!r.last || s.created_at > r.last) r.last = s.created_at;
    });

    const owedByCustomer: Record<string, number> = {};
    (payments || []).forEach((p: any) => {
      if (!p.customer_id) return;
      if (p.payment_status === "pending" || p.payment_status === "pending_customer" || p.payment_status === "credit") {
        owedByCustomer[p.customer_id] = (owedByCustomer[p.customer_id] || 0) + Number(p.amount || 0);
      }
    });

    const now = Date.now();
    const computed: Row[] = (customers || []).map((c: any) => {
      const s = salesByCustomer[c.id] || { total: 0, count: 0, last: null };
      let segment: Row["segment"] = "New";
      const daysSinceCreate = (now - new Date(c.created_at).getTime()) / 86400000;
      const daysSinceLast = s.last ? (now - new Date(s.last).getTime()) / 86400000 : 999;
      if (s.total >= 1_000_000) segment = "VIP";
      else if (s.total >= 250_000) segment = "High Value";
      else if (s.count >= 3) segment = "Regular";
      else if (daysSinceCreate < 30) segment = "New";
      if (daysSinceLast > 90) segment = "Inactive";
      else if (daysSinceLast > 45 && s.count > 0) segment = "At Risk";
      return {
        id: c.id, name: c.name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "Unnamed",
        first_name: c.first_name, last_name: c.last_name, phone: c.phone, email: c.email,
        status: c.status || "active", created_at: c.created_at, photo_url: c.photo_url,
        totalSpent: s.total, totalPurchases: s.count, outstanding: owedByCustomer[c.id] || 0,
        lastPurchase: s.last, segment,
      };
    });
    setRows(computed);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const filtered = useMemo(() => {
    let r = rows;
    const q = search.trim().toLowerCase();
    if (q) r = r.filter(x =>
      x.name.toLowerCase().includes(q) || (x.phone || "").includes(q) || (x.email || "").toLowerCase().includes(q));
    if (statusFilter !== "all") r = r.filter(x => x.status === statusFilter);
    if (segmentFilter !== "all") r = r.filter(x => x.segment === segmentFilter);
    if (sortBy === "name") r = [...r].sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "spent") r = [...r].sort((a, b) => b.totalSpent - a.totalSpent);
    else r = [...r].sort((a, b) => (b.lastPurchase || b.created_at).localeCompare(a.lastPurchase || a.created_at));
    return r;
  }, [rows, search, statusFilter, segmentFilter, sortBy]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const stats = useMemo(() => ({
    total: rows.length,
    vip: rows.filter(r => r.segment === "VIP" || r.segment === "High Value").length,
    atRisk: rows.filter(r => r.segment === "At Risk" || r.segment === "Inactive").length,
    revenue: rows.reduce((s, r) => s + r.totalSpent, 0),
  }), [rows]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" /> Customers</h1>
            <p className="text-sm text-muted-foreground">Manage your customer base and relationships</p>
          </div>
          <Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4 mr-1" /> Add Customer</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Customers</div><div className="text-2xl font-bold">{stats.total}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" /> VIP / High Value</div><div className="text-2xl font-bold">{stats.vip}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> At Risk / Inactive</div><div className="text-2xl font-bold">{stats.atRisk}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Revenue</div><div className="text-2xl font-bold">UGX {stats.revenue.toLocaleString()}</div></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search name, phone, email…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={segmentFilter} onValueChange={v => { setSegmentFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Segments</SelectItem>
                  <SelectItem value="VIP">VIP</SelectItem>
                  <SelectItem value="High Value">High Value</SelectItem>
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="New">New</SelectItem>
                  <SelectItem value="At Risk">At Risk</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Recent Activity</SelectItem>
                  <SelectItem value="spent">Top Spenders</SelectItem>
                  <SelectItem value="name">Name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? <div className="py-8 text-center text-muted-foreground">Loading…</div>
              : pageRows.length === 0 ? <div className="py-8 text-center text-muted-foreground">No customers found.</div>
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground border-b">
                        <tr>
                          <th className="py-2 px-2">Customer</th>
                          <th className="py-2 px-2 hidden md:table-cell">Phone</th>
                          <th className="py-2 px-2 hidden lg:table-cell">Purchases</th>
                          <th className="py-2 px-2">Total Spent</th>
                          <th className="py-2 px-2 hidden md:table-cell">Outstanding</th>
                          <th className="py-2 px-2 hidden lg:table-cell">Last Visit</th>
                          <th className="py-2 px-2">Segment</th>
                          <th className="py-2 px-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map(r => (
                          <tr key={r.id} className="border-b hover:bg-muted/40">
                            <td className="py-2 px-2">
                              <Link to={`/customers/${r.id}`} className="flex items-center gap-2 font-medium hover:underline">
                                {r.photo_url
                                  ? <img src={r.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                                  : <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">{r.name.charAt(0).toUpperCase()}</div>}
                                <div>
                                  <div>{r.name}</div>
                                  <div className="md:hidden text-xs text-muted-foreground">{r.phone}</div>
                                </div>
                              </Link>
                            </td>
                            <td className="py-2 px-2 hidden md:table-cell">{r.phone || "-"}</td>
                            <td className="py-2 px-2 hidden lg:table-cell">{r.totalPurchases}</td>
                            <td className="py-2 px-2 font-medium">UGX {r.totalSpent.toLocaleString()}</td>
                            <td className="py-2 px-2 hidden md:table-cell">
                              {r.outstanding > 0 ? <span className="text-destructive font-medium">UGX {r.outstanding.toLocaleString()}</span> : "-"}
                            </td>
                            <td className="py-2 px-2 hidden lg:table-cell text-xs">
                              {r.lastPurchase ? format(new Date(r.lastPurchase), "MMM d, yyyy") : "Never"}
                            </td>
                            <td className="py-2 px-2"><Badge variant={r.segment === "VIP" ? "default" : r.segment === "Inactive" || r.segment === "At Risk" ? "destructive" : "secondary"}>{r.segment}</Badge></td>
                            <td className="py-2 px-2"><Badge variant={r.status === "active" ? "outline" : r.status === "blocked" ? "destructive" : "secondary"}>{r.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-xs text-muted-foreground">Page {page} of {totalPages} · {filtered.length} customers</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {tenantId && (
        <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} tenantId={tenantId} onSaved={() => load()} />
      )}
    </DashboardLayout>
  );
};

export default Customers;
