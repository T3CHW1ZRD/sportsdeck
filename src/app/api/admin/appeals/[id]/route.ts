import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * PUT /api/admin/appeals/[id]
 * Review an appeal: approve or reject. Requires admin role.
 */
export async function PUT(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return errorResponse("Forbidden: Admin access required", 403);
  }

  try {
    const { id } = await params;
    const appealId = parseInt(id);

    if (isNaN(appealId)) {
      return errorResponse("Invalid appeal ID", 400);
    }

    const appeal = await prisma.appeal.findUnique({
      where: { id: appealId },
    });

    if (!appeal) {
      return errorResponse("Appeal not found", 404);
    }

    if (appeal.status !== "PENDING") {
      return errorResponse("This appeal has already been reviewed", 400);
    }

    const body = await request.json();
    const { action } = body; // "approve" or "reject"

    if (!action || !["approve", "reject"].includes(action)) {
      return errorResponse("Action must be 'approve' or 'reject'", 400);
    }

    if (action === "approve") {
      await prisma.$transaction([
        prisma.appeal.update({
          where: { id: appealId },
          data: { status: "APPROVED" },
        }),
        prisma.user.update({
          where: { id: appeal.userId },
          data: { isBanned: false },
        }),
      ]);

      return jsonResponse({ message: "Appeal approved, user unbanned" });
    }

    await prisma.appeal.update({
      where: { id: appealId },
      data: { status: "REJECTED" },
    });

    return jsonResponse({ message: "Appeal rejected" });
  } catch (error) {
    console.error("Review appeal error:", error);
    return errorResponse("Internal server error", 500);
  }
}
