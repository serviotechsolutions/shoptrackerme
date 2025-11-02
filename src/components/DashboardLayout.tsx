import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from './ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationBell } from './NotificationBell';
import { useSmartNotifications } from '@/hooks/useSmartNotifications';
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
  CreditCard,
  Brain
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetTrigger } from './ui/sheet';

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [mobileOpen, setMobileOpen] = useState(false);
  
  // Initialize smart notifications monitoring
  useSmartNotifications();

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

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/pos', label: 'POS', icon: CreditCard },
    { path: '/products', label: 'Products', icon: Package },
    { path: '/sales', label: 'Sales', icon: ShoppingCart },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/ai-insights', label: 'AI Insights', icon: Brain },
    { path: '/payments', label: 'Payments', icon: CreditCard },
    { path: '/users', label: 'Team', icon: Users },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const NavContent = () => (
    <>
      {navItems.map((item) => (
        <Link
          key={item.path}
          to={item.path}
          onClick={() => setMobileOpen(false)}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
            location.pathname === item.path
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-primary/10'
          }`}
        >
          <item.icon className="h-4 w-4" />
          <span className="text-sm">{item.label}</span>
        </Link>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
        <div className="flex h-16 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild className="md:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="flex flex-col h-full bg-card">
                  <div className="p-6 border-b">
                    <div className="flex items-center gap-2">
                      <Store className="h-5 w-5 text-primary" />
                      <span className="text-base font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                        Shop Tracker
                      </span>
                    </div>
                  </div>
                  <nav className="flex-1 p-4 space-y-2">
                    <NavContent />
                  </nav>
                </div>
              </SheetContent>
            </Sheet>
            
            <Link to="/dashboard" className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <span className="text-base font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent hidden sm:inline">
                Shop Tracker
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell />
            
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
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
                <Button variant="ghost" size="icon" className="rounded-full">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-sm font-medium text-primary-foreground">
                      {user?.email?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex w-64 min-h-[calc(100vh-4rem)] border-r bg-card">
          <nav className="flex-1 p-4 space-y-2">
            <NavContent />
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
