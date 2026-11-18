import { STORIES_PER_DAY, STORY_TAGS, storyProblem, type StoryTag } from "@/lib/stories";
import { hasAgreed } from "@/lib/server/agreement";
import { bad } from "@/lib/server/http";
import { authenticate } from "@/lib/server/privy";
import { createStory, listStories, postedToday } from "@/lib/server/stories";

/** The Ex Stories feed: ?sort=new|top&tag=Cheating&before=<cursor>. Public. */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const sort = u.searchParams.get("sort") === "top" ? "top" : "new";
  const tagRaw = u.searchParams.get("tag");
  const tag = (STORY_TAGS as readonly string[]).includes(tagRaw ?? "") ? (tagRaw as StoryTag) : null;
  const before = u.searchParams.get("before");
  try {
    const page = await listStories({ sort, tag, before: before && !Number.isNaN(Date.parse(before)) ? before : null });
    return Response.json(page, { headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=120" } });
  } catch {
    return bad("Couldn't load stories. Has migration 0014 been run?", 500);
  }
}

/** Post a story: { title, tags, parts }. Signed in, agreed to the terms, max 3 a day. Always anonymous in public. */
export async function POST(request: Request) {
  const user = await authenticate(request);
  if (!user) return bad("Sign in to post a story.", 401);
  if (!(await hasAgreed(user.userId))) return bad("Accept the terms first (shown after sign-in).", 403);
  const b = ((await request.json().catch(() => null)) ?? {}) as { title?: unknown; tags?: unknown; parts?: unknown };
  const title = typeof b.title === "string" ? b.title : "";
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.filter((t): t is string => typeof t === "string"))] : [];
  const parts = Array.isArray(b.parts) ? b.parts.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean) : [];
  const problem = storyProblem(title, tags, parts);
  if (problem) return bad(problem);
  if ((await postedToday(user.userId)) >= STORIES_PER_DAY) return bad(`You can post ${STORIES_PER_DAY} stories a day. Come back tomorrow.`, 429);
  try {
    const id = await createStory(user.userId, title, tags, parts);
    return Response.json({ id });
  } catch {
    return bad("Couldn't post your story. Try again.", 500);
  }
}
