import { Suspense } from "react";
import { connection } from "next/server";
import { Loader2, TriangleAlert } from "lucide-react";
import { AppAlert } from "@/components/common/app-alert";
import { OrgUnitsCanvas } from "@/components/org-units/org-units-canvas";
import { getCurrentUser } from "@/lib/auth";
import { getLookups, getUnitPositions, getUnits } from "@/lib/org/queries";
import type { UnitPositions } from "@/lib/org/types";

export default function OrgUnitsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100svh-3rem)] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> กำลังโหลดผังองค์กร...
        </div>
      }
    >
      <OrgUnitsData />
    </Suspense>
  );
}

async function OrgUnitsData() {
  await connection(); // ข้อมูลจาก DB ต้องสดทุก request — ไม่ prerender
  const user = await getCurrentUser();
  const data = await Promise.all([getUnits(), getLookups(), getUnitPositions(user?.UserID ?? null)]).catch((err) => {
    console.error("[org-units] load failed", err);
    return null;
  });
  if (data) {
    const positions: UnitPositions = { loggedIn: user != null, ...data[2] };
    return <OrgUnitsCanvas initialUnits={data[0]} lookups={data[1]} initialPositions={positions} />;
  }
  {
    return (
      <div className="mx-auto max-w-lg p-6">
        <AppAlert
          tone="destructive"
          icon={<TriangleAlert />}
          title="โหลดข้อมูลจากฐานข้อมูลไม่ได้"
          description="ตรวจสอบการเชื่อมต่อ DB (ค่าใน .env) แล้วรีเฟรชหน้าอีกครั้ง"
        />
      </div>
    );
  }
}
