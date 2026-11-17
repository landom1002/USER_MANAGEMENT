"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Combobox } from "@/components/ui/cbo-liveserch";
import { COMPANIES, DEPARTMENTS, POSITIONS, SECTIONS } from "@/lib/mock-data";
import type { OrgItem, OrgValues } from "@/lib/types";

export type { OrgValues };

interface Props {
  comname?: string | null;
  depname?: string | null;
  secname?: string | null;
  positionname?: string | null;
  currentIds?: OrgValues;
  onSave?: (values: OrgValues) => Promise<void> | void;
  readOnly?: boolean;
}

const toOptions = (list: OrgItem[]) => list.map((x) => ({ value: String(x.id), label: `${x.name} · ${x.code}` }));

const FIELDS: { key: keyof OrgValues; label: string; options: { value: string; label: string }[] }[] = [
  { key: "comId", label: "บริษัท", options: toOptions(COMPANIES) },
  { key: "depId", label: "ฝ่าย", options: toOptions(DEPARTMENTS) },
  { key: "secId", label: "แผนก", options: toOptions(SECTIONS) },
  { key: "positionId", label: "ตำแหน่ง", options: toOptions(POSITIONS) },
];

export function OrgGroupPopover({ comname, depname, secname, positionname, currentIds = {}, onSave, readOnly = false }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<OrgValues>({});
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave?.(pending);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const displayFields = [
    { label: "บริษัท", value: comname },
    { label: "ฝ่าย", value: depname },
    { label: "แผนก", value: secname },
    { label: "ตำแหน่ง", value: positionname },
  ];

  return (
    <div className="group col-span-full flex flex-col gap-0.5">
      {displayFields.map(({ label, value }) => (
        <div key={label} className="flex min-w-0 items-baseline gap-1">
          {!value && <span className="shrink-0 text-xs text-muted-foreground/70">{label}:</span>}
          <span className="truncate text-xs text-muted-foreground">{value ?? "ไม่ระบุ"}</span>
        </div>
      ))}

      {!readOnly && (
        <Popover
          open={open}
          onOpenChange={(v) => {
            if (v) setPending({ ...currentIds });
            setOpen(v);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-5 shrink-0 text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100 md:hover:text-foreground"
            >
              <Pencil className="size-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start">
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-foreground">แก้ไขข้อมูลองค์กร</p>
              {FIELDS.map((f) => (
                <div key={f.key} className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{f.label}</span>
                  <Combobox
                    options={f.options}
                    value={pending[f.key] ?? ""}
                    onValueChange={(v) => setPending((p) => ({ ...p, [f.key]: v }))}
                    placeholder={`เลือก${f.label}`}
                    className="h-8 text-xs"
                  />
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  ยกเลิก
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
