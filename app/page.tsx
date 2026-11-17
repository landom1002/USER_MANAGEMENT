import { redirect } from "next/navigation";

export default function Home() {
  redirect("/c/admin/org-units");
}
