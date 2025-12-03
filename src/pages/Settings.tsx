import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Store, Save, FileText, Trash2, Upload, X, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
interface TenantSettings {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  logo_url: string;
}
const Settings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<TenantSettings>({
    id: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    logo_url: ''
  });
  useEffect(() => {
    fetchSettings();
  }, []);
  const fetchSettings = async () => {
    try {
      const {
        data: profile
      } = await supabase.from('profiles').select('tenant_id').single();
      if (profile) {
        const {
          data: tenant
        } = await supabase.from('tenants').select('*').eq('id', profile.tenant_id).single();
        if (tenant) {
          setSettings(tenant);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load settings',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('tenants').update({
        name: settings.name,
        email: settings.email,
        phone: settings.phone,
        address: settings.address,
        logo_url: settings.logo_url
      }).eq('id', settings.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Settings saved successfully' });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${settings.id}-logo-${Date.now()}.${fileExt}`;
      const filePath = `shop-logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      setSettings({ ...settings, logo_url: publicUrl });

      // Auto-save the logo URL
      const { error: updateError } = await supabase.from('tenants')
        .update({ logo_url: publicUrl })
        .eq('id', settings.id);

      if (updateError) throw updateError;
      toast({ title: 'Success', description: 'Logo uploaded successfully' });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast({ title: 'Error', description: 'Failed to upload logo', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    setSettings({ ...settings, logo_url: '' });
    try {
      await supabase.from('tenants').update({ logo_url: null }).eq('id', settings.id);
      toast({ title: 'Success', description: 'Logo removed' });
    } catch (error) {
      console.error('Error removing logo:', error);
    }
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
        <div>
          <h1 className="text-xl font-bold tracking-tight text-center">Settings</h1>
          <p className="text-muted-foreground text-center">
            Manage your shop information and preferences
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              Shop Information
            </CardTitle>
            <CardDescription>
              Update your shop details that will appear on receipts and reports
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Shop Name</Label>
              <Input id="name" value={settings.name} onChange={e => setSettings({
              ...settings,
              name: e.target.value
            })} placeholder="Enter shop name" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={settings.email || ''} onChange={e => setSettings({
              ...settings,
              email: e.target.value
            })} placeholder="shop@example.com" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={settings.phone || ''} onChange={e => setSettings({
              ...settings,
              phone: e.target.value
            })} placeholder="+256 XXX XXX XXX" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" value={settings.address || ''} onChange={e => setSettings({
              ...settings,
              address: e.target.value
            })} placeholder="Enter shop address" rows={3} />
            </div>

            <div className="space-y-2">
              <Label>Shop Logo</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              {settings.logo_url ? (
                <div className="flex items-center gap-4">
                  <img
                    src={settings.logo_url}
                    alt="Shop logo"
                    className="h-16 w-16 rounded-md object-cover border"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                      Change
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={removeLogo}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full sm:w-auto"
                >
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {uploading ? 'Uploading...' : 'Upload Logo'}
                </Button>
              )}
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Legal & Privacy
            </CardTitle>
            <CardDescription>
              Review our privacy practices and policies
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Button 
              variant="outline" 
              onClick={() => navigate('/privacy-policy')}
              className="w-full sm:w-auto"
            >
              <FileText className="mr-2 h-4 w-4" />
              View Privacy Policy
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/terms')}
              className="w-full sm:w-auto"
            >
              <FileText className="mr-2 h-4 w-4" />
              View Terms & Conditions
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate('/delete-account')}
              className="w-full sm:w-auto"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>;
};
export default Settings;