import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * POST /api/threads/[id]/polls
 * Create a new poll in a thread. Requires authentication.
 */
export async function POST(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { id } = await params;
    const threadId = parseInt(id);

    if (isNaN(threadId)) {
      return errorResponse("Invalid thread ID", 400);
    }

    // Check if user is banned
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (user?.isBanned) {
      return errorResponse("You are banned and cannot create polls", 403);
    }

    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread || thread.isHidden) {
      return errorResponse("Thread not found", 404);
    }

    const body = await request.json();
    const { question, options, deadline } = body;

    if (!question || !question.trim()) {
      return errorResponse("Question is required", 400);
    }
    if (question.length > 200) {
      return errorResponse("Question must be 200 characters or less", 400);
    }

    if (!options || !Array.isArray(options) || options.length < 2) {
      return errorResponse("At least 2 options are required", 400);
    }
    if (options.some((o) => typeof o === "string" && o.length > 100)) {
      return errorResponse("Poll options must be 100 characters or less", 400);
    }

    if (!deadline) {
      return errorResponse("Deadline is required", 400);
    }

    const deadlineDate = new Date(deadline);
    if (deadlineDate <= new Date()) {
      return errorResponse("Deadline must be in the future", 400);
    }

    const poll = await prisma.poll.create({
      data: {
        question,
        threadId,
        authorId: authUser.userId,
        deadline: deadlineDate,
        options: {
          create: options.map((text) => ({ text })),
        },
      },
      include: {
        author: { select: { id: true, username: true } },
        options: {
          include: {
            _count: { select: { votes: true } },
          },
        },
        _count: { select: { votes: true } },
      },
    });

    return jsonResponse({ poll }, 201);
  } catch (error) {
    console.error("Create poll error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * GET /api/threads/[id]/polls
 * List all polls in a thread.
 */
export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const threadId = parseInt(id);

    if (isNaN(threadId)) {
      return errorResponse("Invalid thread ID", 400);
    }

    const polls = await prisma.poll.findMany({
      where: { threadId, isHidden: false },
      include: {
        author: { select: { id: true, username: true } },
        options: {
          include: {
            _count: { select: { votes: true } },
          },
        },
        _count: { select: { votes: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return jsonResponse({ polls });
  } catch (error) {
    console.error("Get polls error:", error);
    return errorResponse("Internal server error", 500);
  }
}
