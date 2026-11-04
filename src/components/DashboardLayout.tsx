import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { Link, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from './NotificationBell';
import { GlobalSearch } from './GlobalSearch';
import { useSmartNotifications } from '@/hooks/useSmartNotifications';
import { useUserRole } from '@/hooks/useUserRole';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Store,
  LogOut,
  Moon,
  Sun,
  Menu,
  Settings,
  Users,
  Brain,
  User,
  Sparkles,
  Truck,
  PackageCheck,
  MessageCircle,
  PanelLeft,
  Monitor,
  TrendingUp,
  ClipboardList,
  Megaphone,
  Ticket,
  Wallet,
  ChevronRight
} from 'lucide-react';


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from './ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { supabase } from '@/integrations/supabase/client';

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    return saved === null ? window.matchMedia('(max-width: 1279px)').matches : saved === 'true';
  });

  const toggleSidebar = () => setSidebarCollapsed(current => {
    localStorage.setItem('sidebarCollapsed', String(!current));
    return !current;
  });
  const { isAdmin, canMakeSales, canManageProducts, canViewReports, canManageTeam, canManageSettings, canManagePromotions } = useUserRole();
  const [profile, setProfile] = useState<{ avatar_url: string | null; full_name: string | null } | null>(null);

  // Initialize smart notifications monitoring
  useSmartNotifications();

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('avatar_url, full_name')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfile(data);
      });
  }, [user?.id]);

  const initial = (profile?.full_name || user?.email || 'U').charAt(0).toUpperCase();

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' || 'light';
    setTheme(savedTheme);
    document.documentElement.classList.toggle('dark', savedTheme === 'dark');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const allNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: true },
    { path: '/pos', label: 'POS', icon: Monitor, show: canMakeSales },
    { path: '/sales', label: 'Sales', icon: ShoppingCart, show: canMakeSales },
    { path: '/customers', label: 'Customers', icon: Users, show: true },
    { path: '/products', label: 'Products', icon: Package, show: canManageProducts },
    { path: '/stock-predictions', label: 'Stock Forecast', icon: TrendingUp, show: canManageProducts },
    { path: '/suppliers', label: 'Suppliers', icon: Truck, show: true },
    { path: '/purchase-orders', label: 'Purchase Orders', icon: ClipboardList, show: canManageProducts },
    { path: '/grn', label: 'Goods Received (GRN)', icon: PackageCheck, show: true },
    { path: '/promotions', label: 'Promotions', icon: Megaphone, show: canManagePromotions },
    { path: '/promo-codes', label: 'Promo Codes', icon: Ticket, show: canManagePromotions },
    { path: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, show: true },
    { path: '/payments', label: 'Payments', icon: Wallet, show: canMakeSales },
    { path: '/reports', label: 'Reports', icon: BarChart3, show: canViewReports },
    { path: '/ai-insights', label: 'AI Insights', icon: Sparkles, show: canViewReports },
    { path: '/users', label: 'Team', icon: Users, show: canManageTeam },
    { path: '/settings', label: 'Settings', icon: Settings, show: canManageSettings },
  ];

  const navItems = allNavItems.filter(item => item.show);

  const navGroups: { label: string; paths: string[] }[] = [
    { label: 'Sales & Customers', paths: ['/pos', '/sales', '/customers'] },
    { label: 'Inventory Management', paths: ['/products', '/stock-predictions', '/suppliers', '/purchase-orders', '/grn'] },
    { label: 'Marketing & Engagement', paths: ['/promotions', '/promo-codes', '/whatsapp'] },
    { label: 'Finance', paths: ['/payments'] },
    { label: 'Analytics & Intelligence', paths: ['/reports', '/ai-insights'] },
    { label: 'Administration', paths: ['/users', '/settings'] },
  ];

  const itemsByPath = new Map(navItems.map(item => [item.path, item]));

  const NavItem = ({ item, compact }: { item: typeof allNavItems[number]; compact?: boolean }) => (
    <Link
      to={item.path}
      title={compact ? item.label : undefined}
      aria-label={item.label}
      aria-current={location.pathname === item.path ? 'page' : undefined}
      onClick={() => setMobileOpen(false)}
      className={`flex min-h-11 items-center gap-3 ${compact ? 'justify-center px-2' : 'px-4'} py-3 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        location.pathname === item.path
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-primary/10'
      }`}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {compact ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <>
          <span className="text-sm flex-1 min-w-0 truncate">{item.label}</span>
          <ChevronRight className={`h-4 w-4 shrink-0 ${location.pathname === item.path ? 'text-primary-foreground/70' : 'text-muted-foreground/60'}`} />
        </>
      )}
    </Link>
  );

  const NavContent = ({ compact = false }: { compact?: boolean }) => (
    <>
      {itemsByPath.get('/dashboard') && <NavItem item={itemsByPath.get('/dashboard')!} compact={compact} />}
      {compact ? (
        navItems.filter(item => item.path !== '/dashboard').map(item => <NavItem key={item.path} item={item} compact={compact} />)
      ) : (
        navGroups.map(group => {
          const items = group.paths.map(p => itemsByPath.get(p)).filter(Boolean) as typeof allNavItems;
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{group.label}</span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                {items.map(item => <NavItem key={item.path} item={item} />)}
              </div>
            </div>
          );
        })
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
        <div className="flex h-16 min-w-0 items-center justify-between gap-2 px-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 max-w-[90vw] p-0 flex flex-col">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex flex-col h-full max-h-[100dvh] bg-card min-h-0">
                  <div className="p-6 border-b shrink-0">
                    <div className="flex items-center gap-2">
                      <Store className="h-5 w-5 text-primary" />
                      <span className="text-base font-bold">
                        Shop<span className="text-primary">Tracker</span>
                      </span>
                    </div>
                  </div>
                  <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2 [-webkit-overflow-scrolling:touch]">
                    <NavContent />
                    <div className="h-6" />
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={toggleSidebar} aria-controls="desktop-sidebar" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              <PanelLeft className="h-5 w-5" />
            </Button>
            
            <Link to="/dashboard" className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <span className="text-base font-bold hidden sm:inline">
                Shop<span className="text-primary">Tracker</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:block">
              <GlobalSearch />
            </div>
            <NotificationBell />
            
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
              className="rounded-full"
            >
              {theme === 'light' ? (
                <Moon className="h-5 w-5" />
              ) : (
                <Sun className="h-5 w-5" />
              )}
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full p-0" aria-label="Profile menu">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} alt="Profile" />
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex min-w-0">
        {/* Desktop Sidebar */}
        <aside id="desktop-sidebar" className={`hidden md:flex shrink-0 sticky top-16 h-[calc(100dvh-4rem)] border-r bg-card flex-col ${sidebarCollapsed ? 'w-16' : 'w-64'}`}>
          {!sidebarCollapsed && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-4 border-b">
              <Store className="h-5 w-5 text-primary shrink-0" />
              <span className="text-base font-bold truncate">
                Shop<span className="text-primary">Tracker</span>
              </span>
            </div>
          )}
          <nav aria-label="Main navigation" className={`flex-1 min-w-0 overflow-y-auto overscroll-contain space-y-1 ${sidebarCollapsed ? 'p-2' : 'p-2 sm:p-3'}`}>
            <NavContent compact={sidebarCollapsed} />
            <div className="h-2" />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="app-content flex-1 p-3 pb-24 sm:p-4 sm:pb-24 lg:p-6 lg:pb-6">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
};

export default DashboardLayout;
