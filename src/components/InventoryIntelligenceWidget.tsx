import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, ArrowRight, AlertTriangle, Package } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchStockPredictions, ProductPrediction, riskBadgeClass, riskLabel, formatDays } from "@/lib/stockPredictions";
import { Skeleton } from "@/components/ui/skeleton";

export const InventoryIntelligenceWidget = () => {
  const [loading, setLoading] = useState(true);
  const [atRisk, setAtRisk] = useState<ProductPrediction[]>([]);
  const [criticalCount, setCriticalCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);

  useEffect(() => {
    fetchStockPredictions()
      .then(({ predictions, summary }) => {
        setCriticalCount(summary.critical);
        setWarningCount(summary.warning);
        const risky = predictions
          .filter(p => p.risk === "critical" || p.risk === "warning")
          .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
          .slice(0, 4);
        setAtRisk(risky);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" /> Inventory Intelligence
          </CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/stock-predictions">View all <ArrowRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </div>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/30">
            <AlertTriangle className="h-3 w-3 mr-1" />{criticalCount} critical
          </Badge>
          <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-600 border-orange-500/30">
            {warningCount} warning
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : atRisk.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Package className="h-6 w-6 opacity-50" />
            All inventory looks healthy.
          </div>
        ) : (
          <div className="space-y-2">
            {atRisk.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.stock} left · {formatDays(p.daysUntilStockout)} left
                  </p>
                </div>
                <Badge variant="outline" className={`text-xs ${riskBadgeClass(p.risk)}`}>{riskLabel(p.risk)}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
