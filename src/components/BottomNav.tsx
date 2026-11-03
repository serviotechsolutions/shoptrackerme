import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Package, Wallet, CircleDollarSign, BarChart3, Users, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';

const actions = [
  { to: '/pos', icon: ShoppingCart, label: 'Record Sale' },
  { to: '/products', icon: Package, label: 'Add Product' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/payments', icon: Wallet, label: 'Add Expense' },
  { to: '/products', icon: CircleDollarSign, label: 'Manage Products' },
];

const item = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors active:scale-95';

export const BottomNav = () => {
  const { pathname } = useLocation();
  const cls = (to: string) => `${item} ${pathname === to ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`;
  const main = actions.slice(0, 4);
  const more = actions.slice(4);

  return (
    <nav aria-label="Quick actions" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-3xl">
        {/* Phones: 4 + More */}
        {main.map(a => (
          <Link key={a.label} to={a.to} className={cls(a.to)}>
            <a.icon className="h-5 w-5" /><span className="truncate">{a.label}</span>
          </Link>
        ))}
        {more.map(a => (
          <Link key={a.label} to={a.to} className={`${cls(a.to)} hidden sm:flex`}>
            <a.icon className="h-5 w-5" /><span className="truncate">{a.label}</span>
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger className={`${item} text-muted-foreground sm:hidden`} aria-label="More actions">
            <MoreHorizontal className="h-5 w-5" /><span>More</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            {more.map(a => (
              <DropdownMenuItem key={a.label} asChild>
                <Link to={a.to} className="flex items-center gap-2"><a.icon className="h-4 w-4" />{a.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
};
