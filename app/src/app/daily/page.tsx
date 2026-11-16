import { redirect } from "next/navigation";

/** Today's case lives on the home page. Dated pages (/daily/2026-11-16) stay, so shared links keep their own card. */
export default function DailyToday() {
  redirect("/");
}
