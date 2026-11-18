import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { template: "%s", default: "OPS Hierarchy" },
  description: "OPS Hierarchy — plan maps (mock data)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            // ปุ่ม action (เช่น "เลิกทำ") ใช้สีเดียวกับ toast แต่ละประเภท — แบบขอบ แทนปุ่มดำค่าเริ่มต้น
            classNames: {
              actionButton:
                "border! border-current/40! bg-transparent! text-current! font-medium! hover:bg-current/10! transition-colors",
            },
          }}
        />
      </body>
    </html>
  );
}
