import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingUp,
  Package,
  ShoppingBag,
  Users,
  AlertTriangle,
  Brain,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

const AIInsights = () => {
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<any>(null);
  const [reorderAlerts, setReorderAlerts] = useState<any>(null);
  const [customerInsights, setCustomerInsights] = useState<any>(null);
  const [fraudAlerts, setFraudAlerts] = useState<any>(null);

  const fetchSalesForecast = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-sales-forecast', {
        body: {},
      });

      if (error) throw error;
      setForecast(data);
      toast.success('Sales forecast updated');
    } catch (error: any) {
      console.error('Forecast error:', error);
      toast.error('Failed to load sales forecast');
    } finally {
      setLoading(false);
    }
  };

  const fetchReorderAlerts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-reorder-alerts', {
        body: {},
      });

      if (error) throw error;
      setReorderAlerts(data);
      toast.success('Reorder alerts updated');
    } catch (error: any) {
      console.error('Reorder error:', error);
      toast.error('Failed to load reorder alerts');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomerInsights = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-customer-insights', {
        body: {},
      });

      if (error) throw error;
      setCustomerInsights(data);
      toast.success('Customer insights updated');
    } catch (error: any) {
      console.error('Insights error:', error);
      toast.error('Failed to load customer insights');
    } finally {
      setLoading(false);
    }
  };

  const fetchFraudAlerts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-fraud-detection', {
        body: {},
      });

      if (error) throw error;
      setFraudAlerts(data);
      toast.success('Fraud detection updated');
    } catch (error: any) {
      console.error('Fraud error:', error);
      toast.error('Failed to load fraud alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesForecast();
    fetchReorderAlerts();
    fetchCustomerInsights();
    fetchFraudAlerts();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              AI Insights
            </h1>
            <p className="text-muted-foreground">
              AI-powered analytics and recommendations for your business
            </p>
          </div>
          <Button
            onClick={() => {
              fetchSalesForecast();
              fetchReorderAlerts();
              fetchCustomerInsights();
              fetchFraudAlerts();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh All
          </Button>
        </div>

        <Tabs defaultValue="forecast" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="forecast">
              <TrendingUp className="h-4 w-4 mr-2" />
              Sales Forecast
            </TabsTrigger>
            <TabsTrigger value="reorder">
              <Package className="h-4 w-4 mr-2" />
              Reorder Alerts
            </TabsTrigger>
            <TabsTrigger value="customers">
              <Users className="h-4 w-4 mr-2" />
              Customer Insights
            </TabsTrigger>
            <TabsTrigger value="fraud">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Fraud Detection
            </TabsTrigger>
          </TabsList>

          {/* Sales Forecast Tab */}
          <TabsContent value="forecast" className="space-y-4">
            {forecast && (
              <>
                {forecast.forecast && typeof forecast.forecast === 'string' ? (
                  <Alert>
                    <TrendingUp className="h-4 w-4" />
                    <AlertDescription>{forecast.forecast}</AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      {forecast.nextWeekDaily && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Next Week Forecast</CardTitle>
                            <CardDescription>Predicted daily average</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold">
                              {formatCurrency(Number(forecast.nextWeekDaily))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                      {forecast.nextMonthTotal && (
                        <Card>
                          <CardHeader>
                            <CardTitle>Next Month Forecast</CardTitle>
                            <CardDescription>Predicted monthly total</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="text-3xl font-bold">
                              {formatCurrency(Number(forecast.nextMonthTotal))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>

                    {forecast.trends && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Key Trends</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground">
                            {typeof forecast.trends === 'string' 
                              ? forecast.trends 
                              : JSON.stringify(forecast.trends, null, 2)}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {forecast.recommendations && (
                      <Card>
                        <CardHeader>
                          <CardTitle>AI Recommendations</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-muted-foreground whitespace-pre-wrap">
                            {typeof forecast.recommendations === 'string' 
                              ? forecast.recommendations 
                              : JSON.stringify(forecast.recommendations, null, 2)}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                )}
              </>
            )}
          </TabsContent>

          {/* Reorder Alerts Tab */}
          <TabsContent value="reorder" className="space-y-4">
            {reorderAlerts?.alerts && reorderAlerts.alerts.length > 0 ? (
              <div className="grid gap-4">
                {reorderAlerts.alerts.map((alert: any, index: number) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{alert.productName}</CardTitle>
                        <Badge
                          variant={
                            alert.urgency === 'Critical'
                              ? 'destructive'
                              : alert.urgency === 'High'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {alert.urgency}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Recommended Quantity:</span>
                        <span className="font-semibold">{alert.reorderQuantity} units</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.reason}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>
                  No reorder alerts. All products have sufficient stock levels.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Customer Insights Tab */}
          <TabsContent value="customers" className="space-y-4">
            {customerInsights && (
              <>
                {customerInsights.topClerks && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Performing Staff</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {customerInsights.topClerks.map((clerk: any, index: number) => (
                          <div key={index} className="flex items-center justify-between border-b pb-2">
                            <div>
                              <p className="font-medium">{clerk.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {clerk.transactions} transactions
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatCurrency(clerk.totalSales)}</p>
                              <p className="text-sm text-success">
                                Profit: {formatCurrency(clerk.totalProfit)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {customerInsights.insights && (
                  <Card>
                    <CardHeader>
                      <CardTitle>AI Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {typeof customerInsights.insights === 'string'
                          ? customerInsights.insights
                          : JSON.stringify(customerInsights.insights, null, 2)}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {customerInsights.topClerk && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Performer Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {typeof customerInsights.topClerk === 'string'
                          ? customerInsights.topClerk
                          : JSON.stringify(customerInsights.topClerk, null, 2)}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {customerInsights.recommendations && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Recommendations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {typeof customerInsights.recommendations === 'string'
                          ? customerInsights.recommendations
                          : JSON.stringify(customerInsights.recommendations, null, 2)}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* Fraud Detection Tab */}
          <TabsContent value="fraud" className="space-y-4">
            {fraudAlerts?.suspiciousTransactions &&
            fraudAlerts.suspiciousTransactions.length > 0 ? (
              <div className="grid gap-4">
                {fraudAlerts.suspiciousTransactions.map((alert: any, index: number) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">
                          Transaction {alert.transactionId}
                        </CardTitle>
                        <Badge
                          variant={
                            alert.riskLevel === 'High'
                              ? 'destructive'
                              : alert.riskLevel === 'Medium'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {alert.riskLevel} Risk
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm">
                        <span className="font-semibold">Reason:</span> {alert.reason}
                      </p>
                      <p className="text-sm">
                        <span className="font-semibold">Action:</span> {alert.action}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert>
                <ShoppingBag className="h-4 w-4" />
                <AlertDescription>
                  No suspicious transactions detected. All transactions appear normal.
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AIInsights;
