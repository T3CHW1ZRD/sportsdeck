import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { jsonResponse, errorResponse } from "@/lib/helpers";

/**
 * PUT /api/admin/reports/[id]
 * Review a report: dismiss or approve (hide content).
 * Requires admin role.
 */
export async function PUT(request: Request, { params }: { params: Promise<Record<string, string>> }) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return errorResponse("Forbidden: Admin access required", 403);
  }

  try {
    const { id } = await params;
    const reportId = parseInt(id);

    if (isNaN(reportId)) {
      return errorResponse("Invalid report ID", 400);
    }

    const report = await prisma.report.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return errorResponse("Report not found", 404);
    }

    const body = await request.json();
    const { action } = body; // "dismiss" or "approve"

    if (!action || !["dismiss", "approve", "reopen"].includes(action)) {
      return errorResponse("Action must be 'dismiss', 'approve', or 'reopen'", 400);
    }

    if (action === "dismiss") {
      await prisma.report.update({
        where: { id: reportId },
        data: { status: "DISMISSED" },
      });

      return jsonResponse({ message: "Report dismissed" });
    }

    if (action === "reopen") {
      if (report.status === "PENDING") {
        return errorResponse("Report is already pending", 400);
      }

      // If the report was previously approved, unhide the content
      if (report.status === "APPROVED") {
        if (report.postId) {
          await prisma.post.update({
            where: { id: report.postId },
            data: { isHidden: false },
          });
        }
        if (report.threadId) {
          await prisma.thread.update({
            where: { id: report.threadId },
            data: { isHidden: false },
          });
        }
        if (report.pollId) {
          await prisma.poll.update({
            where: { id: report.pollId },
            data: { isHidden: false },
          });
        }
      }

      await prisma.report.update({
        where: { id: reportId },
        data: { status: "PENDING" },
      });

      return jsonResponse({ message: "Report reopened for review" });
    }

    // Approve: hide the content
    if (action === "approve") {
      if (report.postId) {
        await prisma.post.update({
          where: { id: report.postId },
          data: { isHidden: true },
        });
      }

      if (report.threadId) {
        await prisma.thread.update({
          where: { id: report.threadId },
          data: { isHidden: true },
        });
      }

      if (report.pollId) {
        await prisma.poll.update({
          where: { id: report.pollId },
          data: { isHidden: true },
        });
      }

      // Update all related pending reports to APPROVED
      const whereClause: any = {};
      if (report.postId) whereClause.postId = report.postId;
      if (report.threadId) whereClause.threadId = report.threadId;
      if (report.pollId) whereClause.pollId = report.pollId;
      whereClause.status = "PENDING";

      await prisma.report.updateMany({
        where: whereClause,
        data: { status: "APPROVED" },
      });

      return jsonResponse({ message: "Report approved, content hidden" });
    }
  } catch (error) {
    console.error("Review report error:", error);
    return errorResponse("Internal server error", 500);
  }
}
