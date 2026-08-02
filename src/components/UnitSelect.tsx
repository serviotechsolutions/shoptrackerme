import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BASE_UNITS, OTHER_UNIT, fetchCustomUnits } from "@/lib/units";

type Props = {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  /** Extra units to show (e.g. units already used by this record). */
  extraUnits?: string[];
};

/**
 * Unit dropdown with an "Other…" escape hatch that reveals a free-text field
 * so any business-specific unit can be entered and later reused.
 */
export default function UnitSelect({ value, onChange, className, extraUnits = [] }: Props) {
  const [custom, setCustom] = useState<string[]>([]);
  const [showCustom, setShowCustom] = useState(false);

  useEffect(() => {
    fetchCustomUnits().then(setCustom);
  }, []);

  const known = Array.from(
    new Set([...BASE_UNITS, ...custom, ...extraUnits.filter(Boolean)])
  );

  const isKnown = !value || known.includes(value);
  const selectValue = showCustom || !isKnown ? OTHER_UNIT : (value || "piece");

  return (
    <div className={className}>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === OTHER_UNIT) {
            setShowCustom(true);
            onChange("");
          } else {
            setShowCustom(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger className="h-9"><SelectValue placeholder="Unit" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {known.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
          <SelectItem value={OTHER_UNIT}>Other…</SelectItem>
        </SelectContent>
      </Select>

      {(showCustom || !isKnown) && (
        <Input
          className="mt-1 h-9"
          placeholder="Custom unit name (e.g. Coil)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
