import { supabase } from "@/integrations/supabase/client";

/** Built-in units offered everywhere a unit can be chosen. */
export const BASE_UNITS = [
  "piece",
  "pair",
  "set",
  "box",
  "carton",
  "packet",
  "bag",
  "sack",
  "bale",
  "bundle",
  "roll",
  "coil",
  "drum",
  "tube",
  "rod",
  "bottle",
  "litre",
  "kg",
  "metre",
  "square metre",
  "cubic metre",
  "device",
];

export const OTHER_UNIT = "__other__";

/** Custom units previously saved by this shop, so they can be reused. */
export async function fetchCustomUnits(): Promise<string[]> {
  const { data, error } = await (supabase as any)
    .from("custom_units")
    .select("name")
    .order("name");
  if (error) return [];
  return (data || []).map((r: any) => String(r.name));
}

/** Persists a custom unit for reuse. Silently ignores duplicates. */
export async function saveCustomUnit(tenantId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean || !tenantId) return;
  if (BASE_UNITS.includes(clean.toLowerCase())) return;
  await (supabase as any)
    .from("custom_units")
    .upsert({ tenant_id: tenantId, name: clean }, { onConflict: "tenant_id,name" });
}
