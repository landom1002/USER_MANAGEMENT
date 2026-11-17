import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// โครงตาม shadcn sidebar-16 — header สูง --header-height (3.5rem)
// หน้า canvas ใช้ค่านี้คำนวณความสูงตัวเอง
export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="[--header-height:calc(--spacing(14))]">
      {/* defaultOpen={false} = เปิดหน้ามา sidebar ยุบไว้ กดปุ่ม ☰ ใน header เพื่อเปิด */}
      <SidebarProvider defaultOpen={false} className="flex flex-col">
        <SiteHeader />
        <div className="flex flex-1">
          <AppSidebar />
          <SidebarInset className="min-w-0">{children}</SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
