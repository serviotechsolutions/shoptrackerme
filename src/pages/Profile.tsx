import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User, Save, Upload, Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
}

const Profile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<UserProfile>({
    id: '',
    full_name: '',
    email: '',
    avatar_url: null
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      
      if (data) {
        setProfile(data);
        setPreviewUrl(data.avatar_url);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to load profile',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile || !user) return null;

    setUploading(true);
    try {
      const fileExt = imageFile.name.split('.').pop();
      const fileName = `${user.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(fileName, imageFile, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profile-images')
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: 'Error',
        description: 'Failed to upload image',
        variant: 'destructive'
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let avatarUrl = profile.avatar_url;

      if (imageFile) {
        const uploadedUrl = await uploadImage();
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        }
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          email: profile.email,
          avatar_url: avatarUrl
        })
        .eq('id', user!.id);

      if (error) throw error;

      setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
      setImageFile(null);
      
      toast({
        title: 'Success',
        description: 'Profile updated successfully'
      });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-center">My Profile</h1>
          <p className="text-muted-foreground text-center">
            Manage your personal information and avatar
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              Update your profile details and profile picture
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar Section */}
            <div className="flex flex-col items-center gap-4">
              <Avatar className="h-32 w-32">
                <AvatarImage src={previewUrl || undefined} alt="Profile picture" />
                <AvatarFallback className="text-2xl">
                  {profile.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex flex-col items-center gap-2">
                <Label htmlFor="avatar" className="cursor-pointer">
                  <div className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">
                    <Camera className="h-4 w-4" />
                    <span className="text-sm">Change Photo</span>
                  </div>
                  <Input
                    id="avatar"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </Label>
                {imageFile && (
                  <p className="text-xs text-muted-foreground">
                    New image selected: {imageFile.name}
                  </p>
                )}
              </div>
            </div>

            {/* Profile Fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={profile.full_name || ''}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  placeholder="Enter your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profile.email || ''}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  placeholder="your@email.com"
                />
              </div>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving || uploading} 
              className="w-full sm:w-auto"
            >
              <Save className="mr-2 h-4 w-4" />
              {uploading ? 'Uploading...' : saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
