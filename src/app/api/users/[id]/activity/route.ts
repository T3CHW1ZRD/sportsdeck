import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/users/[id]/activity
 * Get a user's activity chart data over a time period.
 * Query params: days (default 30)
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return errorResponse("Invalid user ID", 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return errorResponse("User not found", 404);
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get("days") || "30")));

    // Use UTC calendar days only. Mixing local setDate() with toISOString() (UTC) drops events
    // whose UTC date falls outside the bucket list (common near midnight / non-UTC servers).
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rangeStartUTC = new Date(todayUTC);
    rangeStartUTC.setUTCDate(rangeStartUTC.getUTCDate() - (days - 1));

    // Get posts and threads created by user in the period
    const [threads, posts] = await Promise.all([
      prisma.thread.findMany({
        where: {
          authorId: userId,
          createdAt: { gte: rangeStartUTC },
        },
        select: { createdAt: true },
      }),
      prisma.post.findMany({
        where: {
          authorId: userId,
          createdAt: { gte: rangeStartUTC },
        },
        select: { createdAt: true },
      }),
    ]);

    // One bucket per UTC calendar day from rangeStartUTC through todayUTC (inclusive)
    const activityMap: Record<string, { date: string; threads: number; posts: number; total: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(rangeStartUTC);
      d.setUTCDate(rangeStartUTC.getUTCDate() + i);
      const key = d.toISOString().split("T")[0];
      activityMap[key] = { date: key, threads: 0, posts: 0, total: 0 };
    }

    threads.forEach((t) => {
      const key = t.createdAt.toISOString().split("T")[0];
      if (activityMap[key]) {
        activityMap[key].threads++;
        activityMap[key].total++;
      }
    });

    posts.forEach((p) => {
      const key = p.createdAt.toISOString().split("T")[0];
      if (activityMap[key]) {
        activityMap[key].posts++;
        activityMap[key].total++;
      }
    });

    const activity = Object.values(activityMap);

    return jsonResponse({
      userId,
      days,
      totalThreads: threads.length,
      totalPosts: posts.length,
      activity,
    });
  } catch (error) {
    console.error("Get activity error:", error);
    return errorResponse("Internal server error", 500);
  }
}
