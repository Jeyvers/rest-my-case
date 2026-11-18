import { isAdmin } from "@/lib/server/daily";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { reportedStories } from "@/lib/server/stories";

/** Admin: reported and hidden Ex Stories, with the reasons. */
export async function GET(request: Request) {
  if (!(await isAdmin(await authenticate(request)))) return bad("Admins only.", 403);
  try {
    return Response.json({ stories: await reportedStories() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return bad("Couldn't load stories. Has migration 0014 been run?", 500);
  }
}
