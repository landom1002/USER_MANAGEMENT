import Link from "next/link";
import { Network } from "lucide-react";

const NAV = [
  { href: "/c/admin/org-units", label: "ผังห้อง (Org Units)" },
];

// header สูง 48px (h-12) ให้ตรงกับหน้า canvas ที่วางไว้ที่ md:top-12
export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-50 hidden h-12 items-center gap-4 border-b bg-background px-4 md:flex">
        <Link href="/c/admin/org-units" className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Network className="size-4" />
          </span>
          <span className="text-sm">OPS Hierarchy</span>
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
