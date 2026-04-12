import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Users as UsersIcon, UserPlus, Mail, Shield, User, Trash2, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  user_roles: { role: string }[];
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  token: string;
  created_at: string;
  accepted_at: string | null;
}

const Users = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', full_name: '', role: 'staff' as 'admin' | 'user' | 'staff' | 'viewer' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: profile } = await supabase.from('profiles').select('tenant_id').single();
      if (!profile) return;

      const [usersRes, invitationsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, user_roles(role)').eq('tenant_id', profile.tenant_id),
        supabase.from('team_invitations').select('*').eq('tenant_id', profile.tenant_id).order('created_at', { ascending: false })
      ]);

      if (usersRes.data) setUsers(usersRes.data as any);
      if (invitationsRes.data) setInvitations(invitationsRes.data as any);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!newUser.email || !newUser.full_name) {
      toast({ title: 'Validation Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    setInviting(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name, tenant_id, tenants(name)').single();
      if (!profile) throw new Error('Could not fetch profile');

      const shopName = (profile.tenants as any)?.name || 'Our Shop';
      const inviterName = profile.full_name || 'Your colleague';

      // Create invitation record
      const { data: invitation, error: invError } = await supabase.from('team_invitations').insert({
        tenant_id: profile.tenant_id,
        email: newUser.email,
        role: newUser.role,
        invited_by: user?.id,
      }).select().single();

      if (invError) {
        if (invError.code === '23505') {
          toast({ title: 'Already Invited', description: 'This email has already been invited', variant: 'destructive' });
          return;
        }
        throw invError;
      }

      // Send invitation email
      const joinUrl = `${window.location.origin}/auth?invite=${invitation.token}`;
      
      await supabase.functions.invoke('send-user-invitation', {
        body: {
          email: newUser.email,
          full_name: newUser.full_name,
          role: newUser.role,
          shop_name: shopName,
          inviter_name: inviterName,
          join_url: joinUrl,
        }
      });

      toast({ title: 'Invitation Sent', description: `Invitation sent to ${newUser.email}` });
      setDialogOpen(false);
      setNewUser({ email: '', full_name: '', role: 'staff' });
      fetchData();
    } catch (error: any) {
      console.error('Error inviting user:', error);
      toast({ title: 'Error', description: error.message || 'Failed to send invitation', variant: 'destructive' });
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      // Remove their role (effectively removing access)
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId);
      if (error) throw error;
      toast({ title: 'Member Removed', description: 'Team member has been removed' });
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to remove member', variant: 'destructive' });
    }
  };

  const handleDeleteInvitation = async (invId: string) => {
    try {
      const { error } = await supabase.from('team_invitations').delete().eq('id', invId);
      if (error) throw error;
      toast({ title: 'Invitation Deleted' });
      fetchData();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete invitation', variant: 'destructive' });
    }
  };

  const getRoleBadge = (roles: { role: string }[]) => {
    const role = roles?.[0]?.role;
    if (role === 'admin') return <Badge variant="default"><Shield className="mr-1 h-3 w-3" />Admin</Badge>;
    if (role === 'staff') return <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><User className="mr-1 h-3 w-3" />Staff</Badge>;
    if (role === 'viewer') return <Badge variant="outline"><User className="mr-1 h-3 w-3" />Viewer</Badge>;
    return <Badge variant="secondary"><User className="mr-1 h-3 w-3" />User</Badge>;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'accepted') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><CheckCircle2 className="mr-1 h-3 w-3" />Accepted</Badge>;
    if (status === 'expired') return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Expired</Badge>;
    return <Badge variant="outline" className="bg-yellow-50 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
  };

  if (loading) {
    return <DashboardLayout>
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    </DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Team Management</h1>
            <p className="text-muted-foreground text-sm">Manage team members and invitations</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="mr-2 h-4 w-4" />Invite User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite Team Member</DialogTitle>
                <DialogDescription>Send an email invitation to join your shop</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} placeholder="user@example.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name *</Label>
                  <Input id="full_name" value={newUser.full_name} onChange={e => setNewUser({ ...newUser, full_name: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newUser.role} onValueChange={(v: any) => setNewUser({ ...newUser, role: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin — Full access</SelectItem>
                      <SelectItem value="staff">Staff — POS, products, sales</SelectItem>
                      <SelectItem value="viewer">Viewer — Read-only access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleInviteUser} disabled={inviting} className="w-full">
                  <Mail className="mr-2 h-4 w-4" />
                  {inviting ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5" />
              Team Members ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || 'N/A'}</TableCell>
                    <TableCell>{u.email}</TableCell>
                    <TableCell>{getRoleBadge(u.user_roles)}</TableCell>
                    <TableCell>
                      {u.id !== user?.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Member?</AlertDialogTitle>
                              <AlertDialogDescription>This will remove {u.full_name || u.email} from the team.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRemoveMember(u.id)}>Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No team members</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Invitations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Invitations ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{inv.role}</Badge></TableCell>
                    <TableCell>{getStatusBadge(inv.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(inv.created_at), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      {inv.status === 'pending' && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDeleteInvitation(inv.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {invitations.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No invitations sent yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Users;
