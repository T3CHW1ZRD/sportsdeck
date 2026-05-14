import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";
import { detectToxicity } from "@/lib/ai";

/**
 * POST /api/reports
 * Report a post or thread as inappropriate. Requires authentication.
 */
export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const body = await request.json();
    const { reason, threadId, postId, pollId } = body;

    if (!reason || reason.trim().length === 0) {
      return errorResponse("Reason is required", 400);
    }
    if (reason.length > 1000) {
      return errorResponse("Report reason must be 1000 characters or less", 400);
    }

    if (!threadId && !postId && !pollId) {
      return errorResponse("Either threadId, postId, or pollId is required", 400);
    }

    // Validate referenced item exists and prevent self-reporting
    if (threadId) {
      const thread = await prisma.thread.findUnique({ where: { id: parseInt(threadId) } });
      if (!thread) return errorResponse("Thread not found", 404);
      if (thread.authorId === authUser.userId) {
        return errorResponse("You cannot report your own content", 400);
      }
    }

    if (postId) {
      const post = await prisma.post.findUnique({ where: { id: parseInt(postId) } });
      if (!post) return errorResponse("Post not found", 404);
      if (post.authorId === authUser.userId) {
        return errorResponse("You cannot report your own content", 400);
      }
    }

    if (pollId) {
      const poll = await prisma.poll.findUnique({ where: { id: parseInt(pollId) } });
      if (!poll) return errorResponse("Poll not found", 404);
      if (poll.authorId === authUser.userId) {
        return errorResponse("You cannot report your own content", 400);
      }
    }

    // Check for duplicate report (one report per user per item, regardless of status)
    const existingReport = await prisma.report.findFirst({
      where: {
        reporterId: authUser.userId,
        threadId: threadId ? parseInt(threadId) : null,
        postId: postId ? parseInt(postId) : null,
        pollId: pollId ? parseInt(pollId) : null,
      },
    });

    if (existingReport) {
      return errorResponse("You have already reported this item", 409);
    }

    // Get the content for AI analysis
    let contentToAnalyze = reason;
    if (postId) {
      const post = await prisma.post.findUnique({ where: { id: parseInt(postId) } });
      if (post) contentToAnalyze = post.content;
    } else if (threadId) {
      const thread = await prisma.thread.findUnique({ where: { id: parseInt(threadId) } });
      if (thread) contentToAnalyze = thread.content;
    } else if (pollId) {
      const poll = await prisma.poll.findUnique({ where: { id: parseInt(pollId) } });
      if (poll) contentToAnalyze = poll.question;
    }

    // Get AI verdict
    let aiVerdict = null;
    let aiScore = null;
    try {
      const toxicity: any = await detectToxicity(contentToAnalyze);
      aiVerdict = toxicity.isToxic
        ? `Likely inappropriate. ${JSON.stringify(toxicity.details)}`
        : `Likely appropriate. ${JSON.stringify(toxicity.details)}`;
      aiScore = toxicity.score;
    } catch (e) {
      console.error("AI verdict error:", e);
      aiVerdict = "AI analysis unavailable";
    }

    const report = await prisma.report.create({
      data: {
        reason,
        reporterId: authUser.userId,
        threadId: threadId ? parseInt(threadId) : null,
        postId: postId ? parseInt(postId) : null,
        pollId: pollId ? parseInt(pollId) : null,
        aiVerdict,
        aiScore,
      },
      include: {
        reporter: { select: { id: true, username: true } },
      },
    });

    return jsonResponse({ report }, 201);
  } catch (error) {
    console.error("Create report error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * GET /api/reports
 * List the current user's reports. Requires authentication.
 */
export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const reports = await prisma.report.findMany({
      where: { reporterId: authUser.userId },
      orderBy: { createdAt: "desc" },
      include: {
        thread: { select: { id: true, title: true } },
        post: { select: { id: true, content: true } },
        poll: { select: { id: true, question: true } },
      },
    });

    return jsonResponse({ reports });
  } catch (error) {
    console.error("Get reports error:", error);
    return errorResponse("Internal server error", 500);
  }
}
