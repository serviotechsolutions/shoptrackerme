import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function WhatsAppActivityWidget() {
  const [stats, setStats] = useState({ today: 0, delivered: 0, failed: 0, pending: 0 });

  useEffect(() => {
    (async () => {
      const start = new Date(); start.setHours(0,0,0,0);
      const { data } = await supabase.from("whatsapp_messages")
        .select("status").gte("created_at", start.toISOString());
      const list = data || [];
      setStats({
        today: list.length,
        delivered: list.filter((m: any) => ["delivered","read"].includes(m.status)).length,
        failed: list.filter((m: any) => m.status === "failed").length,
        pending: list.filter((m: any) => m.status === "pending").length,
      });
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-green-600" />
          <Link to="/whatsapp" className="hover:underline">WhatsApp today</Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div><div className="text-xl font-bold">{stats.today}</div><div className="text-[10px] text-muted-foreground">Sent</div></div>
          <div><div className="text-xl font-bold text-green-600">{stats.delivered}</div><div className="text-[10px] text-muted-foreground">Delivered</div></div>
          <div><div className="text-xl font-bold text-red-600">{stats.failed}</div><div className="text-[10px] text-muted-foreground">Failed</div></div>
          <div><div className="text-xl font-bold text-amber-600">{stats.pending}</div><div className="text-[10px] text-muted-foreground">Pending</div></div>
        </div>
      </CardContent>
    </Card>
  );
}
