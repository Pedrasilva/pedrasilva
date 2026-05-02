/**
 * Lightweight PT VAT preset picker.
 *
 * Sets `vat_rate` (number) and `vat_code` (string|null) in one click.
 * No schema change — uses existing fields.
 *
 * Codes follow common SAF-T-PT short codes:
 *   - NOR  → 23 / 13 / 6 (standard / intermediate / reduced)
 *   - ISE  → 0 (exempt)
 *   - reverse charge → rate 0, code "AUTO"
 */
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type VatPreset = {
  id: string;
  rate: number;
  code: string | null;
  labelKey: string;
};

export const PT_VAT_PRESETS: VatPreset[] = [
  { id: "std23", rate: 23, code: "NOR", labelKey: "finance:vatPresets.standard" },
  { id: "int13", rate: 13, code: "NOR", labelKey: "finance:vatPresets.intermediate" },
  { id: "red6", rate: 6, code: "NOR", labelKey: "finance:vatPresets.reduced" },
  { id: "exempt0", rate: 0, code: "ISE", labelKey: "finance:vatPresets.exempt" },
  { id: "reverse", rate: 0, code: "AUTO", labelKey: "finance:vatPresets.reverseCharge" },
];

type Props = {
  onPick: (rate: number, code: string | null) => void;
  disabled?: boolean;
  size?: "sm" | "default";
};

export function VatPresetPicker({ onPick, disabled, size = "sm" }: Props) {
  const { t } = useTranslation(["finance"]);
  return (
    <Select
      disabled={disabled}
      onValueChange={(id) => {
        const p = PT_VAT_PRESETS.find((x) => x.id === id);
        if (p) onPick(p.rate, p.code);
      }}
    >
      <SelectTrigger
        className={size === "sm" ? "h-8 text-xs w-[180px]" : "w-[200px]"}
        aria-label={t("finance:vatPresets.label") as string}
      >
        <SelectValue placeholder={t("finance:vatPresets.placeholder") as string} />
      </SelectTrigger>
      <SelectContent>
        {PT_VAT_PRESETS.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {t(p.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
