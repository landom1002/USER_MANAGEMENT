import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "org-units",
};

export default function OrgUnitsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
