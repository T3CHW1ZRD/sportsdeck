import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/admin/users
 * List users. Optionally filter by banned status.
 * Requires admin role.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return errorResponse("Forbidden: Admin access required", 403);
  }

  try {
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = paginationParams(searchParams);
    const banned = searchParams.get("banned");
    const search = searchParams.get("search");

    const where: any = {};

    if (banned === "true") {
      where.isBanned = true;
    } else if (banned === "false") {
      where.isBanned = false;
    }

    if (search) {
      where.OR = [
        { username: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          isBanned: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return jsonResponse(paginatedResponse(users, total, page, limit));
  } catch (error) {
    console.error("Get admin users error:", error);
    return errorResponse("Internal server error", 500);
  }
}
