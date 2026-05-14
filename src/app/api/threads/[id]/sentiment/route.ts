import prisma from "@/lib/prisma";
import { analyzeSentiment } from "@/lib/ai";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * GET /api/threads/[id]/sentiment
 * Get the overall sentiment of a match thread based on AI analysis of comments.
 * Also calculates per-team sentiment based on fans' comments.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const threadId = parseInt(id);

    if (isNaN(threadId)) {
      return errorResponse("Invalid thread ID", 400);
    }

    const thread = await prisma.thread.findUnique({
      where: { id: threadId },
      include: {
        match: {
          include: {
            homeTeam: true,
            awayTeam: true,
          },
        },
        posts: {
          where: { isHidden: false },
          include: {
            author: {
              select: { id: true, favoriteTeamId: true},
            },
          },
          orderBy: { createdAt: "desc" },
          take: 50, // Analyze last 50 posts to save API calls
        },
      },
    });

    if (!thread || thread.isHidden) {
      return errorResponse("Thread not found", 404);
    }

    if (thread.posts.length === 0) {
      return jsonResponse({
        threadId,
        overall: { label: "neutral", score: 0.5 },
        homeTeam: null,
        awayTeam: null,
        postCount: 0,
      });
    }

    // Combine all post content for overall sentiment
    const allContent = thread.posts.map((p) => p.content).join(". ");
    const overallSentiment = await analyzeSentiment(allContent.substring(0, 500));

    // Per-team sentiment (if match thread)
    let homeTeamSentiment: any = null;
    let awayTeamSentiment: any = null;

    if (thread.match) {
      const homeTeamId = thread.match.homeTeam.id;
      const awayTeamId = thread.match.awayTeam.id;

      const homeFanPosts = thread.posts.filter(
        (p) => p.author.favoriteTeamId === homeTeamId
      );
      const awayFanPosts = thread.posts.filter(
        (p) => p.author.favoriteTeamId === awayTeamId
      );

      if (homeFanPosts.length > 0) {
        const homeContent = homeFanPosts.map((p) => p.content).join(". ");
        homeTeamSentiment = await analyzeSentiment(homeContent.substring(0, 500));
        homeTeamSentiment.teamName = thread.match.homeTeam.name;
        homeTeamSentiment.fanCount = homeFanPosts.length;
      }

      if (awayFanPosts.length > 0) {
        const awayContent = awayFanPosts.map((p) => p.content).join(". ");
        awayTeamSentiment = await analyzeSentiment(awayContent.substring(0, 500));
        awayTeamSentiment.teamName = thread.match.awayTeam.name;
        awayTeamSentiment.fanCount = awayFanPosts.length;
      }
    }

    return jsonResponse({
      threadId,
      overall: overallSentiment,
      homeTeam: homeTeamSentiment,
      awayTeam: awayTeamSentiment,
      postCount: thread.posts.length,
    });
  } catch (error) {
    console.error("Sentiment analysis error:", error);
    return errorResponse("Internal server error", 500);
  }
}
