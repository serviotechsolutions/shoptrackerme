import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, AlertTriangle, Upload, Download, Image as ImageIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
interface Product {
  id: string;
  name: string;
  description: string | null;
  buying_price: number;
  selling_price: number;
  stock: number;
  low_stock_threshold: number;
  tenant_id: string;
  image_url: string | null;
  barcode: string | null;
  category: string;
}

const CATEGORIES = [
  "Groceries",
  "Beverages",
  "Electronics",
  "Cosmetics & Beauty",
  "Household Items",
  "Stationery",
  "Snacks",
  "Hardware Tools",
  "Others"
];
const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [tenantId, setTenantId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("Others");
  const {
    toast
  } = useToast();
  useEffect(() => {
    fetchTenantId();
  }, []);
  useEffect(() => {
    if (tenantId) {
      fetchProducts();
    }
  }, [tenantId]);
  const fetchTenantId = async () => {
    const {
      data: {
        user
      }
    } = await supabase.auth.getUser();
    if (user) {
      const {
        data: profile
      } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (profile) {
        setTenantId(profile.tenant_id);
      }
    }
  };
  const fetchProducts = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('products').select('*').order('created_at', {
        ascending: false
      });
      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  const handleImageUpload = async (file: File): Promise<string | null> => {
    try {
      setUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${tenantId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to upload image: ' + error.message,
        variant: 'destructive'
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    let imageUrl = editingProduct?.image_url || null;
    
    // Upload new image if selected
    if (imageFile) {
      const uploadedUrl = await handleImageUpload(imageFile);
      if (uploadedUrl) imageUrl = uploadedUrl;
    }

    const productData = {
      name: formData.get('name') as string,
      description: formData.get('description') as string || null,
      buying_price: parseFloat(formData.get('buying_price') as string),
      selling_price: parseFloat(formData.get('selling_price') as string),
      stock: parseInt(formData.get('stock') as string),
      low_stock_threshold: parseInt(formData.get('low_stock_threshold') as string),
      tenant_id: tenantId,
      image_url: imageUrl,
      barcode: formData.get('barcode') as string || null,
      category: selectedCategory
    };
    
    try {
      if (editingProduct) {
        const {
          error
        } = await supabase.from('products').update(productData).eq('id', editingProduct.id);
        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Product updated successfully'
        });
      } else {
        const {
          error
        } = await supabase.from('products').insert([productData]);
        if (error) throw error;
        toast({
          title: 'Success',
          description: 'Product added successfully'
        });
      }
      setDialogOpen(false);
      setEditingProduct(null);
      setImageFile(null);
      fetchProducts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const {
        error
      } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;
      toast({
        title: 'Success',
        description: 'Product deleted successfully'
      });
      fetchProducts();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    }
  };
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0
    }).format(amount);
  };
  const handleExportCSV = () => {
    const headers = ["Name", "Description", "Buying Price", "Selling Price", "Stock", "Low Stock Threshold"];
    const rows = products.map(p => [p.name, p.description || "", p.buying_price, p.selling_price, p.stock, p.low_stock_threshold]);
    const csvContent = [headers.join(","), ...rows.map(row => row.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], {
      type: "text/csv"
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `products-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast({
      title: "Success",
      description: `Exported ${products.length} products to CSV`
    });
  };
  const handleImportCSV = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !tenantId) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n");
        const productsToImport = [];
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
          const product = {
            name: values[0],
            description: values[1] || null,
            buying_price: parseFloat(values[2]) || 0,
            selling_price: parseFloat(values[3]) || 0,
            stock: parseInt(values[4]) || 0,
            low_stock_threshold: parseInt(values[5]) || 10,
            tenant_id: tenantId
          };
          productsToImport.push(product);
        }
        if (productsToImport.length > 0) {
          const {
            error
          } = await supabase.from("products").insert(productsToImport);
          if (error) throw error;
          toast({
            title: "Success",
            description: `Imported ${productsToImport.length} products successfully`
          });
          fetchProducts();
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to import CSV",
          variant: "destructive"
        });
      } finally {
        setImporting(false);
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  };
  if (loading) {
    return <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>;
  }
  return <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="font-bold tracking-tight text-xl text-left">Products</h1>
            <p className="text-muted-foreground">Manage your inventory</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCSV} disabled={products.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" disabled={importing} asChild>
              <label className="cursor-pointer flex items-center">
                <Upload className="h-4 w-4 mr-2" />
                {importing ? "Importing..." : "Import CSV"}
                <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} disabled={importing} />
              </label>
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              setDialogOpen(open);
              if (open) {
                setSelectedCategory(editingProduct?.category || "Others");
              } else {
                setEditingProduct(null);
                setImageFile(null);
                setSelectedCategory("Others");
              }
            }}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingProduct(null);
                  setSelectedCategory("Others");
                }} className="mx-0 px-0 py-0 my-0">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Edit Product' : 'Add New Product'}
                </DialogTitle>
                <DialogDescription>
                  Fill in the product details below
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name</Label>
                  <Input id="name" name="name" defaultValue={editingProduct?.name} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" defaultValue={editingProduct?.description || ''} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input id="barcode" name="barcode" defaultValue={editingProduct?.barcode || ''} placeholder="Enter or scan barcode" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="image">Product Image</Label>
                  {editingProduct?.image_url && !imageFile && (
                    <div className="mb-2">
                      <img 
                        src={editingProduct.image_url} 
                        alt={editingProduct.name}
                        className="h-24 w-24 object-cover rounded-lg border"
                      />
                    </div>
                  )}
                  {imageFile && (
                    <div className="mb-2">
                      <img 
                        src={URL.createObjectURL(imageFile)} 
                        alt="Preview"
                        className="h-24 w-24 object-cover rounded-lg border"
                      />
                    </div>
                  )}
                  <Input 
                    id="image" 
                    type="file" 
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="buying_price">Buying Price</Label>
                    <Input id="buying_price" name="buying_price" type="number" step="0.01" defaultValue={editingProduct?.buying_price} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selling_price">Selling Price</Label>
                    <Input id="selling_price" name="selling_price" type="number" step="0.01" defaultValue={editingProduct?.selling_price} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="stock">Stock Quantity</Label>
                    <Input id="stock" name="stock" type="number" defaultValue={editingProduct?.stock} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="low_stock_threshold">Low Stock Alert</Label>
                    <Input id="low_stock_threshold" name="low_stock_threshold" type="number" defaultValue={editingProduct?.low_stock_threshold || 10} required />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={uploading}>
                    {uploading ? 'Uploading...' : editingProduct ? 'Update' : 'Add'} Product
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Image</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Buying Price</TableHead>
                <TableHead>Selling Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No products found. Add your first product to get started!
                  </TableCell>
                </TableRow> : products.map(product => <TableRow key={product.id}>
                    <TableCell>
                      {product.image_url ? (
                        <img 
                          src={product.image_url} 
                          alt={product.name}
                          className="h-12 w-12 object-cover rounded-lg border"
                        />
                      ) : (
                        <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{formatCurrency(product.buying_price)}</TableCell>
                    <TableCell>{formatCurrency(product.selling_price)}</TableCell>
                    <TableCell>{product.stock}</TableCell>
                    <TableCell>
                      {product.stock <= product.low_stock_threshold ? <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Low Stock
                        </Badge> : <Badge variant="default">In Stock</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="ghost" size="icon" onClick={() => {
                  setEditingProduct(product);
                  setDialogOpen(true);
                }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>)}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>;
};
export default Products;