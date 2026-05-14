import prisma from "@/lib/prisma";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

export async function GET(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  try {
    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId)) return errorResponse("Invalid user ID", 400);

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const where = { authorId: userId, isHidden: false };
    const [polls, total] = await Promise.all([
      prisma.poll.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          thread: { select: { id: true, title: true } },
          _count: { select: { votes: true, options: true } },
        },
      }),
      prisma.poll.count({ where }),
    ]);

    return jsonResponse(paginatedResponse(polls, total, page, limit));
  } catch (error) {
    console.error("Get user polls error:", error);
    return errorResponse("Internal server error", 500);
  }
}
