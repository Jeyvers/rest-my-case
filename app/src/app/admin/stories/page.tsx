import type { Metadata } from "next";
import { AdminStories } from "./AdminStories";

export const metadata: Metadata = { title: "Ex Stories admin · Rest My Case", robots: { index: false, follow: false } };

export default function AdminStoriesPage() {
  return <AdminStories />;
}
