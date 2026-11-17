"use client";

import { useEffect, useState } from "react";
import { CalendarRange, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { POLICIES } from "@/lib/mock-data";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface PeriodPickerProps {
  value: string;
  onChange: (value: string) => void;
  showIcon?: boolean;
  className?: string;
}

// เวอร์ชันย่อของ components/policy/period-picker.tsx ใน WEB_KPIs — อ่านรอบประเมินจาก mock data
export function PeriodPicker({ value, onChange, showIcon = true, className }: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const policies = POLICIES;

  // auto-select รอบล่าสุด เหมือนของจริง
  useEffect(() => {
    if (!value && policies.length) onChange(String(policies[0].evaluation_policy_id));
  }, [value, policies, onChange]);

  const current = policies.find((p) => String(p.evaluation_policy_id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-8 items-center justify-between gap-2 rounded-md border bg-card px-2.5 shadow-sm transition-colors hover:bg-accent/50",
            className,
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {showIcon && (
              <div className="flex size-6 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/10 text-primary">
                <CalendarRange className="size-3.5" />
              </div>
            )}
            <span className={cn("truncate text-xs", current ? "font-medium" : "text-muted-foreground")}>
              {current?.title ?? "เลือกรอบประเมิน"}
            </span>
          </div>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-75 p-0" align="start">
        <Command
          filter={(val, search, keywords) =>
            [val, ...(keywords ?? [])].join(" ").toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="ค้นหารอบประเมิน..." />
          <CommandList>
            <CommandEmpty>ไม่พบรอบประเมิน</CommandEmpty>
            <CommandGroup>
              {policies.map((p) => {
                const isSelected = String(p.evaluation_policy_id) === value;
                return (
                  <CommandItem
                    key={p.evaluation_policy_id}
                    value={String(p.evaluation_policy_id)}
                    keywords={[p.title]}
                    onSelect={() => {
                      onChange(String(p.evaluation_policy_id));
                      setOpen(false);
                    }}
                    className="flex items-start gap-2 py-2.5"
                  >
                    <Check className={cn("mt-0.5 size-4 shrink-0 text-primary", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="text-sm font-medium">{p.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
