import prisma from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * POST /api/appeals
 * Submit an appeal to unban yourself. Requires authentication.
 */
export async function POST(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: authUser.userId } });
    if (!user?.isBanned) {
      return errorResponse("You are not banned", 400);
    }

    // Check for existing pending appeal
    const existingAppeal = await prisma.appeal.findFirst({
      where: { userId: authUser.userId, status: "PENDING" },
    });

    if (existingAppeal) {
      return errorResponse("You already have a pending appeal", 409);
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return errorResponse("Reason is required", 400);
    }
    if (reason.length > 2000) {
      return errorResponse("Appeal reason must be 2000 characters or less", 400);
    }

    const appeal = await prisma.appeal.create({
      data: {
        userId: authUser.userId,
        reason,
      },
    });

    return jsonResponse({ appeal }, 201);
  } catch (error) {
    console.error("Create appeal error:", error);
    return errorResponse("Internal server error", 500);
  }
}

/**
 * GET /api/appeals
 * List appeals. Admins see all, users see their own.
 */
export async function GET(request: Request) {
  const authUser = await requireAuth(request);
  if (!authUser) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);

    const where: any = authUser.role === "ADMIN" ? {} : { userId: authUser.userId };
    const status = searchParams.get("status");
    if (status) where.status = status;

    const [appeals, total] = await Promise.all([
      prisma.appeal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, username: true, email: true, isBanned: true } },
        },
      }),
      prisma.appeal.count({ where }),
    ]);

    return jsonResponse(paginatedResponse(appeals, total, page, limit));
  } catch (error) {
    console.error("Get appeals error:", error);
    return errorResponse("Internal server error", 500);
  }
}
