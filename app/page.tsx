import { redirect } from "next/navigation";
import { SITE } from "@/lib/nav-config";

export default function Home() {
  redirect(SITE.home);
}
