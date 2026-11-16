import type { Metadata } from "next";
import { AdminHome } from "./AdminHome";

export const metadata: Metadata = { title: "Admin · Rest My Case", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <AdminHome />;
}
