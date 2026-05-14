import prisma from "@/lib/prisma";
import { jsonResponse } from "@/lib/helpers";

type StatsPayload = {
  users: number;
  threads: number;
  polls: number;
  posts: number;
};

let cache: StatsPayload | null = null;
let cacheTime = 0;
const SIX_HOURS = 6 * 60 * 60 * 1000;

/**
 * GET /api/stats
 * Public endpoint returning aggregate site stats, cached for 24 hours.
 */
export async function GET() {
  const now = Date.now();

  if (cache && now - cacheTime < SIX_HOURS) {
    return jsonResponse(cache);
  }

  const [users, threads, polls, posts] = await Promise.all([
    prisma.user.count(),
    prisma.thread.count(),
    prisma.poll.count(),
    prisma.post.count(),
  ]);

  cache = { users, threads, polls, posts };
  cacheTime = now;

  return jsonResponse(cache);
}
