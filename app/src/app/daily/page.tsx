import { redirect } from "next/navigation";
import { connection } from "next/server";
import { utcDay } from "@/lib/daily";

/** /daily always means today. Links people share are dated (/daily/2026-11-16), so their preview never goes stale. */
export default async function DailyToday() {
  await connection();
  redirect(`/daily/${utcDay()}`);
}
