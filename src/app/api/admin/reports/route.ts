import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonResponse, errorResponse, paginationParams, paginatedResponse } from "@/lib/helpers";

/**
 * GET /api/admin/reports
 * List all reports for admin review. Sorted by AI score and number of reports.
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
    const status = searchParams.get("status") || "PENDING";

    const sortByParam = searchParams.get("sortBy");
    const sortOrderParam = searchParams.get("sortOrder");
    const allowedSortFields = ["aiScore", "createdAt", "status", "reportCount"];
    const allowedSortOrders = ["asc", "desc"];
    const sortBy = allowedSortFields.includes(sortByParam ?? "") ? sortByParam ?? "aiScore" : "aiScore";
    const sortOrder = allowedSortOrders.includes(sortOrderParam ?? "")
      ? sortOrderParam ?? "desc"
      : "desc";

    const where: any = {};
    if (status !== "ALL") {
      where.status = status;
    }

    const total = await prisma.report.count({ where });

    const reports = await prisma.report.findMany({
      where,
      orderBy: (
        sortBy === "reportCount"
          ? [{ createdAt: "desc" }]
          : [
              { [sortBy]: sortOrder as "asc" | "desc" },
              ...(sortBy !== "createdAt" ? [{ createdAt: "desc" }] : []),
            ]
      ) as any,
      include: {
        reporter: { select: { id: true, username: true } },
        thread: {
          select: {
            id: true,
            title: true,
            content: true,
            author: { select: { id: true, username: true } },
          },
        },
        post: {
          select: {
            id: true,
            content: true,
            author: { select: { id: true, username: true } },
          },
        },
        poll: {
          select: {
            id: true,
            question: true,
            author: { select: { id: true, username: true } },
          },
        },
      },
    });

    // Add report count for each item
    const enrichedReports = await Promise.all(
      reports.map(async (report) => {
        let reportCount = 0;
        if (report.postId) {
          reportCount = await prisma.report.count({
            where: { postId: report.postId, status: "PENDING" },
          });
        } else if (report.threadId) {
          reportCount = await prisma.report.count({
            where: { threadId: report.threadId, status: "PENDING" },
          });
        } else if (report.pollId) {
          reportCount = await prisma.report.count({
            where: { pollId: report.pollId, status: "PENDING" },
          });
        }
        return { ...report, reportCount };
      })
    );

    if (sortBy === "reportCount") {
      enrichedReports.sort((a, b) => {
        const dir = sortOrder === "asc" ? 1 : -1;
        const cmp = dir * (a.reportCount - b.reportCount);
        if (cmp !== 0) return cmp;
        const aiA = a.aiScore ?? -1;
        const aiB = b.aiScore ?? -1;
        const aiCmp = dir * (aiA - aiB);
        if (aiCmp !== 0) return aiCmp;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    const paginated = enrichedReports.slice(skip, skip + limit);

    return jsonResponse(paginatedResponse(paginated, total, page, limit));
  } catch (error) {
    console.error("Get admin reports error:", error);
    return errorResponse("Internal server error", 500);
  }
}
