import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CustomerRecord {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  phone?: string | null;
  alt_phone?: string | null;
  email?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  country?: string | null;
  district?: string | null;
  city?: string | null;
  address?: string | null;
  notes?: string | null;
  status?: string | null;
  credit_limit?: number | null;
  photo_url?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  customer?: CustomerRecord | null;
  onSaved?: (c: CustomerRecord) => void;
}

const empty: CustomerRecord = {
  first_name: "", last_name: "", phone: "", alt_phone: "", email: "",
  gender: "", date_of_birth: "", country: "", district: "", city: "",
  address: "", notes: "", status: "active", credit_limit: 0, photo_url: "",
};

export const CustomerFormDialog = ({ open, onOpenChange, tenantId, customer, onSaved }: Props) => {
  const [form, setForm] = useState<CustomerRecord>(empty);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setForm(customer ? { ...empty, ...customer } : empty);
  }, [open, customer]);

  const update = (k: keyof CustomerRecord, v: any) => setForm(p => ({ ...p, [k]: v }));

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${tenantId}/customers/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("profile-images").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("profile-images").getPublicUrl(path);
      update("photo_url", data.publicUrl);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  const save = async () => {
    if (!form.first_name?.trim() || !form.phone?.trim()) {
      toast({ title: "First name and phone are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const fullName = [form.first_name, form.last_name].filter(Boolean).join(" ").trim();
      const payload: any = {
        tenant_id: tenantId,
        name: fullName || form.first_name,
        first_name: form.first_name?.trim() || null,
        last_name: form.last_name?.trim() || null,
        phone: form.phone?.trim() || null,
        alt_phone: form.alt_phone?.trim() || null,
        email: form.email?.trim() || null,
        gender: form.gender || null,
        date_of_birth: form.date_of_birth || null,
        country: form.country?.trim() || null,
        district: form.district?.trim() || null,
        city: form.city?.trim() || null,
        address: form.address?.trim() || null,
        notes: form.notes?.trim() || null,
        status: form.status || "active",
        credit_limit: Number(form.credit_limit) || 0,
        photo_url: form.photo_url || null,
      };
      let result;
      if (customer?.id) {
        const { data, error } = await supabase.from("customers").update(payload).eq("id", customer.id).select().single();
        if (error) throw error;
        result = data;
      } else {
        const { data, error } = await supabase.from("customers").insert(payload).select().single();
        if (error) throw error;
        result = data;
      }
      toast({ title: customer?.id ? "Customer updated" : "Customer created" });
      onSaved?.(result as any);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer?.id ? "Edit Customer" : "Add Customer"}</DialogTitle>
          <DialogDescription>Phone number is the primary identifier.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="flex items-center gap-3">
            {form.photo_url ? (
              <img src={form.photo_url} alt="Customer" className="h-16 w-16 rounded-full object-cover border" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold">
                {(form.first_name?.[0] || "?").toUpperCase()}
              </div>
            )}
            <div>
              <Label htmlFor="photo" className="cursor-pointer text-sm text-primary underline">
                {uploading ? "Uploading…" : "Upload photo"}
              </Label>
              <input id="photo" type="file" accept="image/*" className="hidden"
                onChange={e => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>First Name *</Label><Input value={form.first_name || ""} onChange={e => update("first_name", e.target.value)} /></div>
            <div><Label>Last Name</Label><Input value={form.last_name || ""} onChange={e => update("last_name", e.target.value)} /></div>
            <div><Label>Phone *</Label><Input value={form.phone || ""} onChange={e => update("phone", e.target.value)} /></div>
            <div><Label>Alternative Phone</Label><Input value={form.alt_phone || ""} onChange={e => update("alt_phone", e.target.value)} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={e => update("email", e.target.value)} /></div>
            <div>
              <Label>Gender</Label>
              <Select value={form.gender || ""} onValueChange={v => update("gender", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Date of Birth</Label><Input type="date" value={form.date_of_birth || ""} onChange={e => update("date_of_birth", e.target.value)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status || "active"} onValueChange={v => update("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Country</Label><Input value={form.country || ""} onChange={e => update("country", e.target.value)} /></div>
            <div><Label>District/Region</Label><Input value={form.district || ""} onChange={e => update("district", e.target.value)} /></div>
            <div><Label>City/Town</Label><Input value={form.city || ""} onChange={e => update("city", e.target.value)} /></div>
            <div><Label>Credit Limit</Label><Input type="number" min="0" step="0.01" value={form.credit_limit ?? 0} onChange={e => update("credit_limit", e.target.value)} /></div>
          </div>

          <div><Label>Physical Address</Label><Textarea rows={2} value={form.address || ""} onChange={e => update("address", e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes || ""} onChange={e => update("notes", e.target.value)} /></div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Customer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CustomerFormDialog;
