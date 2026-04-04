import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  TrendingUp, Package, ShoppingBag, Users, AlertTriangle, Brain, RefreshCw,
  MessageCircle, Send, Zap, BarChart3, ShoppingCart, Plus, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AIInsights = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [forecast, setForecast] = useState<any>(null);
  const [reorderAlerts, setReorderAlerts] = useState<any>(null);
  const [customerInsights, setCustomerInsights] = useState<any>(null);
  const [fraudAlerts, setFraudAlerts] = useState<any>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Quick stats
  const [quickStats, setQuickStats] = useState({
    todaySales: 0,
    todayProfit: 0,
    lowStockCount: 0,
    totalProducts: 0,
    weeklyChange: 'N/A',
  });

  useEffect(() => {
    fetchQuickStats();
    fetchSalesForecast();
    fetchReorderAlerts();
    fetchCustomerInsights();
    fetchFraudAlerts();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchQuickStats = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const [todayRes, weekRes, prevWeekRes, productsRes] = await Promise.all([
        supabase.from('transactions').select('total_amount, profit').gte('created_at', today.toISOString()),
        supabase.from('transactions').select('total_amount').gte('created_at', sevenDaysAgo.toISOString()),
        supabase.from('transactions').select('total_amount')
          .gte('created_at', fourteenDaysAgo.toISOString())
          .lt('created_at', sevenDaysAgo.toISOString()),
        supabase.from('products').select('stock, low_stock_threshold'),
      ]);

      const todaySales = todayRes.data?.reduce((s, t) => s + Number(t.total_amount), 0) || 0;
      const todayProfit = todayRes.data?.reduce((s, t) => s + Number(t.profit), 0) || 0;
      const thisWeek = weekRes.data?.reduce((s, t) => s + Number(t.total_amount), 0) || 0;
      const lastWeek = prevWeekRes.data?.reduce((s, t) => s + Number(t.total_amount), 0) || 0;
      const lowStock = productsRes.data?.filter(p => p.stock <= p.low_stock_threshold).length || 0;

      setQuickStats({
        todaySales,
        todayProfit,
        lowStockCount: lowStock,
        totalProducts: productsRes.data?.length || 0,
        weeklyChange: lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek * 100).toFixed(1) : 'N/A',
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchSalesForecast = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-sales-forecast', { body: {} });
      if (error) throw error;
      setForecast(data);
    } catch (error: any) {
      console.error('Forecast error:', error);
    }
  };

  const fetchReorderAlerts = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-reorder-alerts', { body: {} });
      if (error) throw error;
      setReorderAlerts(data);
    } catch (error: any) {
      console.error('Reorder error:', error);
    }
  };

  const fetchCustomerInsights = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-customer-insights', { body: {} });
      if (error) throw error;
      setCustomerInsights(data);
    } catch (error: any) {
      console.error('Insights error:', error);
    }
  };

  const fetchFraudAlerts = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('ai-fraud-detection', { body: {} });
      if (error) throw error;
      setFraudAlerts(data);
    } catch (error: any) {
      console.error('Fraud error:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(amount);
  };

  // AI Chat
  const sendChatMessage = async (messageText?: string) => {
    const msg = messageText || chatInput.trim();
    if (!msg || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: msg };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error('Not authenticated');

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-decision-engine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            message: msg,
            conversationHistory: chatMessages.slice(-10),
          }),
        }
      );

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || 'AI service error');
      }

      // Stream response
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let textBuffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith('\r')) line = line.slice(0, -1);
            if (line.startsWith(':') || line.trim() === '') continue;
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') break;
            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                assistantContent += content;
                setChatMessages(prev => {
                  const last = prev[prev.length - 1];
                  if (last?.role === 'assistant') {
                    return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                  }
                  return [...prev, { role: 'assistant', content: assistantContent }];
                });
              }
            } catch { /* partial json, skip */ }
          }
        }
      }

      if (!assistantContent) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'I couldn\'t generate a response. Please try again.' }]);
      }
    } catch (error: any) {
      console.error('Chat error:', error);
      toast.error(error.message || 'Failed to get AI response');
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const quickQuestions = [
    "Why are my sales low?",
    "What should I restock?",
    "How can I increase profit?",
    "What are my best products?",
    "Give me a business summary",
  ];

  const renderTextContent = (content: any): React.ReactNode => {
    if (!content) return null;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return (
        <ul className="list-disc list-inside space-y-1">
          {content.map((item, index) => (
            <li key={index}>{typeof item === 'string' ? item : renderTextContent(item)}</li>
          ))}
        </ul>
      );
    }
    if (typeof content === 'object') {
      return (
        <div className="space-y-2">
          {Object.entries(content).map(([key, value]) => (
            <div key={key}>
              <span className="font-medium capitalize">{key.replace(/_/g, ' ')}: </span>
              <span>{typeof value === 'string' || typeof value === 'number' ? String(value) : renderTextContent(value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return String(content);
  };

  const weeklyChangeNum = parseFloat(quickStats.weeklyChange);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold tracking-tight flex items-center gap-2 text-xl">
              <Brain className="h-8 w-8 text-primary" />
              AI Decision Engine
            </h1>
            <p className="text-muted-foreground">
              Smart analytics, predictions & AI assistant for your business
            </p>
          </div>
          <Button onClick={() => {
            fetchQuickStats();
            fetchSalesForecast();
            fetchReorderAlerts();
            fetchCustomerInsights();
            fetchFraudAlerts();
          }} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Quick Stats Overview */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <ShoppingCart className="h-3.5 w-3.5" />Today's Sales
              </div>
              <p className="text-lg font-bold">{formatCurrency(quickStats.todaySales)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <TrendingUp className="h-3.5 w-3.5" />Today's Profit
              </div>
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(quickStats.todayProfit)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <BarChart3 className="h-3.5 w-3.5" />Weekly Change
              </div>
              <p className={`text-lg font-bold ${!isNaN(weeklyChangeNum) && weeklyChangeNum >= 0 ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {quickStats.weeklyChange !== 'N/A' ? `${weeklyChangeNum >= 0 ? '+' : ''}${quickStats.weeklyChange}%` : 'N/A'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <AlertTriangle className="h-3.5 w-3.5" />Low Stock
              </div>
              <p className={`text-lg font-bold ${quickStats.lowStockCount > 0 ? 'text-destructive' : ''}`}>
                {quickStats.lowStockCount} items
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate('/products')} variant="outline">
            <Package className="h-4 w-4 mr-1" /> Restock Now
          </Button>
          <Button size="sm" onClick={() => navigate('/products')} variant="outline">
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>
          <Button size="sm" onClick={() => navigate('/reports')} variant="outline">
            <BarChart3 className="h-4 w-4 mr-1" /> View Trends
          </Button>
          <Button size="sm" onClick={() => navigate('/pos')} variant="outline">
            <ShoppingCart className="h-4 w-4 mr-1" /> Open POS
          </Button>
        </div>

        <Tabs defaultValue="chat" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="chat">
              <MessageCircle className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">AI Chat</span>
            </TabsTrigger>
            <TabsTrigger value="forecast">
              <TrendingUp className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Forecast</span>
            </TabsTrigger>
            <TabsTrigger value="reorder">
              <Package className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Reorder</span>
            </TabsTrigger>
            <TabsTrigger value="customers">
              <Users className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Staff</span>
            </TabsTrigger>
            <TabsTrigger value="fraud">
              <AlertTriangle className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Fraud</span>
            </TabsTrigger>
          </TabsList>

          {/* AI Chat Tab */}
          <TabsContent value="chat" className="space-y-4">
            <Card className="flex flex-col" style={{ height: '500px' }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  AI Business Assistant
                </CardTitle>
                <CardDescription>Ask anything about your business — I analyze your real data</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden p-4 pt-0">
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-4">
                    {chatMessages.length === 0 && (
                      <div className="text-center py-8">
                        <Brain className="h-12 w-12 mx-auto mb-4 text-primary/30" />
                        <p className="text-muted-foreground text-sm mb-4">Hi! I'm your AI business advisor. Ask me anything about your shop.</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {quickQuestions.map((q) => (
                            <Button
                              key={q}
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => sendChatMessage(q)}
                            >
                              {q}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg px-3 py-2">
                          <div className="flex gap-1">
                            <span className="animate-bounce text-muted-foreground">●</span>
                            <span className="animate-bounce text-muted-foreground" style={{ animationDelay: '0.1s' }}>●</span>
                            <span className="animate-bounce text-muted-foreground" style={{ animationDelay: '0.2s' }}>●</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                </ScrollArea>
                <div className="flex gap-2 pt-3 border-t mt-2">
                  <Input
                    placeholder="Ask about your business..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                    disabled={chatLoading}
                  />
                  <Button onClick={() => sendChatMessage()} disabled={chatLoading || !chatInput.trim()} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Sales Forecast Tab */}
          <TabsContent value="forecast" className="space-y-4">
            {forecast && <>
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
                          <div className="text-3xl font-bold">{formatCurrency(Number(forecast.nextWeekDaily))}</div>
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
                          <div className="text-3xl font-bold">{formatCurrency(Number(forecast.nextMonthTotal))}</div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                  {forecast.trends && (
                    <Card>
                      <CardHeader><CardTitle>Key Trends</CardTitle></CardHeader>
                      <CardContent className="text-muted-foreground">{renderTextContent(forecast.trends)}</CardContent>
                    </Card>
                  )}
                  {forecast.recommendations && (
                    <Card>
                      <CardHeader><CardTitle>AI Recommendations</CardTitle></CardHeader>
                      <CardContent className="text-muted-foreground">{renderTextContent(forecast.recommendations)}</CardContent>
                    </Card>
                  )}
                </>
              )}
            </>}
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
                        <Badge variant={alert.urgency === 'Critical' ? 'destructive' : alert.urgency === 'High' ? 'default' : 'secondary'}>
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
                      <Button size="sm" variant="outline" onClick={() => navigate('/products')}>
                        <Package className="h-3 w-3 mr-1" /> Restock Now <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert>
                <Package className="h-4 w-4" />
                <AlertDescription>No reorder alerts. All products have sufficient stock levels.</AlertDescription>
              </Alert>
            )}
          </TabsContent>

          {/* Customer Insights Tab */}
          <TabsContent value="customers" className="space-y-4">
            {customerInsights && <>
              {customerInsights.topClerks && (
                <Card>
                  <CardHeader><CardTitle>Top Performing Staff</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {customerInsights.topClerks.map((clerk: any, index: number) => (
                        <div key={index} className="flex items-center justify-between border-b pb-2">
                          <div>
                            <p className="font-medium">{clerk.name}</p>
                            <p className="text-sm text-muted-foreground">{clerk.transactions} transactions</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(clerk.totalSales)}</p>
                            <p className="text-sm text-green-600 dark:text-green-400">Profit: {formatCurrency(clerk.totalProfit)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {customerInsights.recommendations && (
                <Card>
                  <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
                  <CardContent className="text-muted-foreground">{renderTextContent(customerInsights.recommendations)}</CardContent>
                </Card>
              )}
            </>}
          </TabsContent>

          {/* Fraud Detection Tab */}
          <TabsContent value="fraud" className="space-y-4">
            {fraudAlerts?.suspiciousTransactions && fraudAlerts.suspiciousTransactions.length > 0 ? (
              <div className="grid gap-4">
                {fraudAlerts.suspiciousTransactions.map((alert: any, index: number) => (
                  <Card key={index}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Transaction {alert.transactionId}</CardTitle>
                        <Badge variant={alert.riskLevel === 'High' ? 'destructive' : alert.riskLevel === 'Medium' ? 'default' : 'secondary'}>
                          {alert.riskLevel} Risk
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm"><span className="font-semibold">Reason:</span> {alert.reason}</p>
                      <p className="text-sm"><span className="font-semibold">Action:</span> {alert.action}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Alert>
                <ShoppingBag className="h-4 w-4" />
                <AlertDescription>No suspicious transactions detected. All transactions appear normal.</AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default AIInsights;
