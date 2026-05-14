import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams } from "@/lib/helpers";

/**
 * GET /api/feed
 * Personalized activity feed for the authenticated user.
 * Shows:
 * - Recent posts and comments on user's own posts
 * - Posts/threads from followed users
 * - New match scores for favorite team
 * - New threads in favorite team's forum
 * Grouped to avoid overwhelming data.
 */
export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const user = await prisma.user.findUnique({
      where: { id: authUser.userId },
      include: {
        following: { select: { followingId: true } },
      },
    });
    if (!user) {
      return errorResponse("User not found", 404);
    }

    const followedUserIds = user.following.map((f) => f.followingId);
    const feedItems: any[] = [];

    // 0. New followers
    const newFollowers = await prisma.follow.findMany({
      where: { followingId: authUser.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        follower: { select: { id: true, username: true, avatar: true } },
      },
    });

    newFollowers.forEach((follow) => {
      feedItems.push({
        type: "NEW_FOLLOWER",
        message: `${follow.follower.username} started following you`,
        data: follow.follower,
        createdAt: follow.createdAt,
      });
    });

    // 1. Replies to user's posts
    const repliesToMyPosts = await prisma.post.findMany({
      where: {
        parent: { authorId: authUser.userId },
        authorId: { not: authUser.userId },
        isHidden: false,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        author: { select: { id: true, username: true, avatar: true } },
        thread: { select: { id: true, title: true } },
        parent: { select: { id: true, content: true } },
      },
    });

    repliesToMyPosts.forEach((post) => {
      feedItems.push({
        type: "REPLY_TO_YOUR_POST",
        message: `${post.author.username} replied to your post in "${post.thread.title}"`,
        data: post,
        createdAt: post.createdAt,
      });
    });

    // 2. Posts from followed users
    if (followedUserIds.length > 0) {
      const followedPosts = await prisma.post.findMany({
        where: {
          authorId: { in: followedUserIds },
          isHidden: false,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          author: { select: { id: true, username: true, avatar: true } },
          thread: { select: { id: true, title: true } },
        },
      });

      // Group by thread to avoid overwhelming
      const threadGroups: any = {};
      followedPosts.forEach((post) => {
        const key = `thread_${post.threadId}`;
        if (!threadGroups[key]) {
          threadGroups[key] = {
            type: "FOLLOWED_USER_ACTIVITY",
            threadId: post.threadId,
            threadTitle: post.thread.title,
            posts: [],
            latestAt: post.createdAt,
          };
        }
        threadGroups[key].posts.push(post);
        if (post.createdAt > threadGroups[key].latestAt) {
          threadGroups[key].latestAt = post.createdAt;
        }
      });

      (Object.values(threadGroups) as any[]).forEach((group: any) => {
        const authors = [...new Set(group.posts.map((p: any) => p.author.username))];
        feedItems.push({
          type: "FOLLOWED_USER_ACTIVITY",
          message: `${authors.join(", ")} posted in "${group.threadTitle}" (${group.posts.length} new posts)`,
          data: { threadId: group.threadId, threadTitle: group.threadTitle, postCount: group.posts.length, authors },
          createdAt: group.latestAt,
        });
      });

      // Threads from followed users
      const followedThreads = await prisma.thread.findMany({
        where: {
          authorId: { in: followedUserIds },
          isHidden: false,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          author: { select: { id: true, username: true, avatar: true } },
          team: { select: { id: true, name: true } },
        },
      });

      followedThreads.forEach((thread) => {
        feedItems.push({
          type: "FOLLOWED_USER_THREAD",
          message: `${thread.author.username} created a new thread: "${thread.title}"`,
          data: thread,
          createdAt: thread.createdAt,
        });
      });
    }

    // 3. Favorite team updates
    if (user.favoriteTeamId) {
      // Recent match scores
      const teamMatches = await prisma.match.findMany({
        where: {
          OR: [{ homeTeamId: user.favoriteTeamId }, { awayTeamId: user.favoriteTeamId }],
          status: "FINISHED",
        },
        orderBy: { utcDate: "desc" },
        take: 5,
        include: {
          homeTeam: { select: { id: true, name: true, shortName: true, crest: true } },
          awayTeam: { select: { id: true, name: true, shortName: true, crest: true } },
        },
      });

      teamMatches.forEach((match) => {
        feedItems.push({
          type: "TEAM_MATCH_RESULT",
          message: `${match.homeTeam.name} ${match.homeScore}-${match.awayScore} ${match.awayTeam.name}`,
          data: match,
          createdAt: match.updatedAt,
        });
      });

      // New threads in team forum
      const teamThreads = await prisma.thread.findMany({
        where: { teamId: user.favoriteTeamId, isHidden: false },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          author: { select: { id: true, username: true } },
          _count: { select: { posts: true } },
        },
      });

      teamThreads.forEach((thread) => {
        feedItems.push({
          type: "TEAM_NEW_THREAD",
          message: `New discussion in your team's forum: "${thread.title}"`,
          data: thread,
          createdAt: thread.createdAt,
        });
      });
    }

    // Sort all feed items by date (newest first)
    feedItems.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Filter by type if requested
    const typeFilter = searchParams.get("types");
    const filtered = typeFilter
      ? feedItems.filter((item) => typeFilter.split(",").includes(item.type))
      : feedItems;

    const total = filtered.length;
    const paginatedItems = filtered.slice(skip, skip + limit);

    return jsonResponse({
      data: paginatedItems,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Feed error:", error);
    return errorResponse("Internal server error", 500);
  }
}
