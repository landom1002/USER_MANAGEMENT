"use client";

import { useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useFocusShortcut } from "@/hooks/use-focus-shortcut";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  shortcutCode?: string;
  /** ปิดทั้ง hint และ shortcut — ใช้เมื่อหน้าเดียวมีช่องค้นหาสองช่อง จะได้ไม่แย่ง Ctrl+K กัน */
  showShortcut?: boolean;
  "aria-label"?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "ค้นหา...",
  className,
  inputClassName,
  shortcutCode = "KeyK",
  showShortcut = true,
  "aria-label": ariaLabel,
}: SearchInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // code ว่าง = ไม่มีปุ่มไหน match — ปิด shortcut โดยไม่ต้องเรียก hook แบบมีเงื่อนไข
  useFocusShortcut(ref, showShortcut ? shortcutCode : "");

  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn("pl-8", value ? "pr-8" : showShortcut ? "pr-20" : "pr-3", inputClassName)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="ล้างคำค้นหา"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <X className="size-3.5" />
        </button>
      ) : showShortcut ? (
        <KbdGroup className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Kbd>Ctrl + K</Kbd>
        </KbdGroup>
      ) : null}
    </div>
  );
}
