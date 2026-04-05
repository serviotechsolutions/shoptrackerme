import { useState, useEffect, useRef } from 'react';
import { Search, Package, ShoppingCart, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  type: 'product' | 'transaction' | 'customer';
  link: string;
}

export const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setQuery('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => searchAll(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const searchAll = async (q: string) => {
    setLoading(true);
    try {
      const searchTerm = `%${q}%`;
      const [products, transactions, customers] = await Promise.all([
        supabase.from('products').select('id, name, category, stock, selling_price').ilike('name', searchTerm).limit(5),
        supabase.from('transactions').select('id, product_name, total_amount, created_at').ilike('product_name', searchTerm).order('created_at', { ascending: false }).limit(5),
        supabase.from('customers').select('id, name, phone, email').ilike('name', searchTerm).limit(5),
      ]);

      const mapped: SearchResult[] = [
        ...(products.data || []).map(p => ({
          id: p.id,
          title: p.name,
          subtitle: `${p.category || 'No category'} · Stock: ${p.stock} · UGX ${p.selling_price?.toLocaleString() || 0}`,
          type: 'product' as const,
          link: '/products',
        })),
        ...(transactions.data || []).map(t => ({
          id: t.id,
          title: t.product_name,
          subtitle: `UGX ${Number(t.total_amount).toLocaleString()} · ${new Date(t.created_at).toLocaleDateString()}`,
          type: 'transaction' as const,
          link: '/sales',
        })),
        ...(customers.data || []).map(c => ({
          id: c.id,
          title: c.name,
          subtitle: c.phone || c.email || 'No contact',
          type: 'customer' as const,
          link: '/products',
        })),
      ];
      setResults(mapped);
    } catch (e) {
      console.error('Search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case 'product': return <Package className="h-4 w-4 text-primary" />;
      case 'transaction': return <ShoppingCart className="h-4 w-4 text-primary" />;
      case 'customer': return <Users className="h-4 w-4 text-primary" />;
      default: return null;
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case 'product': return 'Product';
      case 'transaction': return 'Sale';
      case 'customer': return 'Customer';
      default: return type;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search... (⌘K)"
          className="pl-9 pr-8 h-9 bg-muted/50 border-none text-sm"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }} className="absolute right-2 top-1/2 -translate-y-1/2">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {isOpen && query.trim() && (
        <div className="absolute top-full mt-1 w-full bg-popover border rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No results found</div>
          ) : (
            results.map((r) => (
              <button
                key={`${r.type}-${r.id}`}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 text-left transition-colors"
                onClick={() => {
                  navigate(r.link);
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                {typeIcon(r.type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">{typeLabel(r.type)}</Badge>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
