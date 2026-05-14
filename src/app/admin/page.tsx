"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";

interface Report {
  id: number;
  reason: string;
  status: string;
  aiScore: number | null;
  aiVerdict: string | null;
  createdAt: string;
  reportCount: number;
  reporter: { id: number; username: string };
  thread?: { id: number; title: string; content: string; author: { id: number; username: string } } | null;
  post?: { id: number; content: string; author: { id: number; username: string } } | null;
  poll?: { id: number; question: string; author: { id: number; username: string } } | null;
}

interface Appeal {
  id: number;
  reason: string;
  status: string;
  createdAt: string;
  user: { id: number; username: string; email: string; isBanned: boolean };
}

interface ManagedUser {
  id: number;
  username: string;
  email: string;
  role: string;
  isBanned: boolean;
  createdAt: string;
}

type Tab = "reports" | "appeals" | "users";

export default function AdminPage() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("reports");

  // Reports state
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [status, setStatus] = useState("PENDING");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Appeals state
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [appealsLoading, setAppealsLoading] = useState(true);
  const [appealActionLoading, setAppealActionLoading] = useState<number | null>(null);

  // Users state
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [showBannedOnly, setShowBannedOnly] = useState(true);
  const [userActionLoading, setUserActionLoading] = useState<number | null>(null);

  // Ban confirm dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [banTarget, setBanTarget] = useState<{ id: number; username: string } | null>(null);
  const [reportSortBy, setReportSortBy] = useState<"aiScore" | "reportCount">("aiScore");
  const [reportSortOrder, setReportSortOrder] = useState<"desc" | "asc">("desc");

  useEffect(() => {
    if (activeTab === "reports") loadReports();
    else if (activeTab === "appeals") loadAppeals();
    else if (activeTab === "users") loadUsers();
  }, [activeTab, status, showBannedOnly, reportSortBy, reportSortOrder]);

  async function loadReports() {
    setReportsLoading(true);
    const qs = new URLSearchParams({
      status,
      sortBy: reportSortBy,
      sortOrder: reportSortOrder,
    });
    const { data } = await api.get<{ data: Report[] }>(`/admin/reports?${qs.toString()}`);
    if (data?.data) setReports(data.data);
    setReportsLoading(false);
  }

  async function loadAppeals() {
    setAppealsLoading(true);
    const { data } = await api.get<{ data: Appeal[] }>("/appeals?status=PENDING");
    if (data?.data) setAppeals(data.data);
    setAppealsLoading(false);
  }

  async function handleReportAction(reportId: number, action: "approve" | "dismiss" | "reopen") {
    setActionLoading(reportId);
    await api.put(`/admin/reports/${reportId}`, { action });
    setActionLoading(null);
    loadReports();
  }

  async function handleBanUser(userId: number) {
    const { error } = await api.post(`/admin/users/${userId}/ban`);
    if (error) {
      addToast(error, "error");
    } else {
      addToast("User banned successfully", "success");
      loadReports();
    }
  }

  async function handleAppealAction(appealId: number, action: "approve" | "reject") {
    setAppealActionLoading(appealId);
    const { error } = await api.put(`/admin/appeals/${appealId}`, { action });
    setAppealActionLoading(null);
    if (error) {
      addToast(error, "error");
    } else {
      addToast(
        action === "approve" ? "Appeal approved, user unbanned" : "Appeal rejected",
        action === "approve" ? "success" : "info"
      );
      loadAppeals();
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    // We don't have a dedicated admin users endpoint, so fetch from teams page users
    // Actually, let's just search all users. We need a backend route for this.
    // For now, use the appeals endpoint to get users, or fetch known users
    // Let's fetch all users by searching with an empty query - we need to check what endpoints exist
    const { data } = await api.get<{ data: ManagedUser[] }>(
      `/admin/users?banned=${showBannedOnly}`,
    );
    if (data?.data) {
      setUsers(data.data);
    } else {
      setUsers([]);
    }
    setUsersLoading(false);
  }

  async function handleUnbanUser(userId: number) {
    setUserActionLoading(userId);
    const { error } = await api.post(`/admin/users/${userId}/unban`);
    setUserActionLoading(null);
    if (error) {
      addToast(error, "error");
    } else {
      addToast("User unbanned", "success");
      loadUsers();
    }
  }

  async function handleBanUserFromList(userId: number) {
    setUserActionLoading(userId);
    const { error } = await api.post(`/admin/users/${userId}/ban`);
    setUserActionLoading(null);
    if (error) {
      addToast(error, "error");
    } else {
      addToast("User banned", "success");
      loadUsers();
    }
  }

  const getContentAuthor = (report: Report) => {
    return report.post?.author || report.thread?.author || report.poll?.author || null;
  };

  return (
    <ProtectedRoute adminOnly>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">Admin Dashboard</h1>

        {/* Main tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("reports")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "reports"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            Reports
          </button>
          <button
            onClick={() => setActiveTab("appeals")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "appeals"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            Appeals
          </button>
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "users"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            Users
          </button>
        </div>

        {activeTab === "reports" && (
          <>
            {/* Status tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {["PENDING", "APPROVED", "DISMISSED", "ALL"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    status === s
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-6 text-sm">
              <span className="text-zinc-500 dark:text-zinc-400">Sort by</span>
              <select
                value={reportSortBy}
                onChange={(e) => setReportSortBy(e.target.value as "aiScore" | "reportCount")}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="aiScore">AI toxicity / score</option>
                <option value="reportCount">Number of reports</option>
              </select>
              <select
                value={reportSortOrder}
                onChange={(e) => setReportSortOrder(e.target.value as "desc" | "asc")}
                className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
              >
                <option value="desc">High → low</option>
                <option value="asc">Low → high</option>
              </select>
            </div>

            {reportsLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : reports.length === 0 ? (
              <p className="text-center py-12 text-zinc-500">No reports found.</p>
            ) : (
              <div className="space-y-4">
                {reports.map((report) => {
                  const targetType = report.post ? "Post" : report.thread ? "Thread" : "Poll";
                  const targetContent =
                    report.post?.content || report.thread?.title || report.poll?.question || "";
                  const contentAuthor = getContentAuthor(report);

                  return (
                    <div
                      key={report.id}
                      className="p-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                              {targetType}
                            </span>
                            <span className="text-xs text-zinc-400">
                              reported by{" "}
                              <Link
                                href={`/users/${report.reporter.id}`}
                                className="text-indigo-600 hover:text-indigo-700"
                              >
                                {report.reporter.username}
                              </Link>
                            </span>
                            {contentAuthor && (
                              <span className="text-xs text-zinc-400">
                                author:{" "}
                                <Link
                                  href={`/users/${contentAuthor.id}`}
                                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                  {contentAuthor.username}
                                </Link>
                              </span>
                            )}
                            {report.aiScore !== null && (
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  report.aiScore > 0.5
                                    ? "bg-red-100 text-red-700"
                                    : "bg-green-100 text-green-700"
                                }`}
                              >
                                AI: {(report.aiScore * 100).toFixed(0)}%
                              </span>
                            )}
                            {report.reportCount > 1 && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                {report.reportCount} reports
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-1 line-clamp-2">
                            &ldquo;{targetContent}&rdquo;
                          </p>
                          <p className="text-xs text-zinc-500">Reason: {report.reason}</p>
                          {report.aiVerdict && (() => {
                            const jsonMatch = report.aiVerdict.match(/\[[\s\S]*\]/);
                            let labels: { label: string; score: number }[] = [];
                            try { if (jsonMatch) labels = JSON.parse(jsonMatch[0]); } catch {}

                            return (
                              <div className="mt-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-600 overflow-hidden max-w-full">
                                <p className="text-[10px] font-semibold uppercase text-zinc-500 mb-2">AI Verdict</p>
                                {labels.length > 0 ? (
                                  <div className="space-y-1.5">
                                    {labels.map((item) => {
                                      const pct = Math.round(item.score * 100);
                                      const isHigh = item.score > 0.5;
                                      return (
                                        <div key={item.label}>
                                          <div className="flex items-center justify-between mb-0.5">
                                            <span className={`text-xs font-medium capitalize ${isHigh ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"}`}>
                                              {item.label.replace(/_/g, " ")}
                                            </span>
                                            <span className={`text-[10px] font-semibold ${isHigh ? "text-red-600 dark:text-red-400" : "text-zinc-400"}`}>
                                              {pct}%
                                            </span>
                                          </div>
                                          <div className="h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                                            <div
                                              className={`h-full rounded-full transition-all ${isHigh ? "bg-red-500" : "bg-zinc-400"}`}
                                              style={{ width: `${pct}%` }}
                                            />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-xs text-zinc-700 dark:text-zinc-300 break-words">{report.aiVerdict}</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        <div className="flex gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
                          {contentAuthor && (
                            <button
                              onClick={() => {
                                setBanTarget(contentAuthor);
                                setConfirmOpen(true);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg"
                            >
                              Ban User
                            </button>
                          )}
                          {report.status === "PENDING" && (
                            <>
                              <button
                                onClick={() => handleReportAction(report.id, "approve")}
                                disabled={actionLoading === report.id}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-lg disabled:opacity-50"
                              >
                                Hide
                              </button>
                              <button
                                onClick={() => handleReportAction(report.id, "dismiss")}
                                disabled={actionLoading === report.id}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                              >
                                Dismiss
                              </button>
                            </>
                          )}
                          {(report.status === "DISMISSED" || report.status === "APPROVED") && (
                            <button
                              onClick={() => handleReportAction(report.id, "reopen")}
                              disabled={actionLoading === report.id}
                              className="px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-100 hover:bg-indigo-200 rounded-lg disabled:opacity-50"
                            >
                              Reopen
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === "appeals" && (
          <>
            {appealsLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : appeals.length === 0 ? (
              <p className="text-center py-12 text-zinc-500">No pending appeals.</p>
            ) : (
              <div className="space-y-4">
                {appeals.map((appeal) => (
                  <div
                    key={appeal.id}
                    className="p-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Link
                            href={`/users/${appeal.user.id}`}
                            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            {appeal.user.username}
                          </Link>
                          <span className="text-xs text-zinc-400">{appeal.user.email}</span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              appeal.user.isBanned
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {appeal.user.isBanned ? "Banned" : "Active"}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-1">
                          {appeal.reason}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {new Date(appeal.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>

                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleAppealAction(appeal.id, "approve")}
                          disabled={appealActionLoading === appeal.id}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleAppealAction(appeal.id, "reject")}
                          disabled={appealActionLoading === appeal.id}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "users" && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setShowBannedOnly(true)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  showBannedOnly
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                Banned
              </button>
              <button
                onClick={() => setShowBannedOnly(false)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  !showBannedOnly
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                All Users
              </button>
            </div>

            {usersLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : users.length === 0 ? (
              <p className="text-center py-12 text-zinc-500">
                {showBannedOnly ? "No banned users." : "No users found."}
              </p>
            ) : (
              <div className="space-y-2">
                {users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-300 flex-shrink-0">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/users/${u.id}`}
                            className="text-sm font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 transition-colors"
                          >
                            {u.username}
                          </Link>
                          {u.role === "ADMIN" && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded">
                              ADMIN
                            </span>
                          )}
                          {u.isBanned && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 rounded">
                              BANNED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 truncate">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex-shrink-0 ml-3">
                      {u.role !== "ADMIN" && (
                        u.isBanned ? (
                          <button
                            onClick={() => handleUnbanUser(u.id)}
                            disabled={userActionLoading === u.id}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {userActionLoading === u.id ? "..." : "Unban"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBanUserFromList(u.id)}
                            disabled={userActionLoading === u.id}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
                          >
                            {userActionLoading === u.id ? "..." : "Ban"}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Ban confirm dialog */}
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => {
            setConfirmOpen(false);
            setBanTarget(null);
          }}
          onConfirm={() => {
            if (banTarget) handleBanUser(banTarget.id);
          }}
          title={`Ban ${banTarget?.username}?`}
          description="This will suspend the user's account. They will not be able to post, vote, or interact until unbanned."
          confirmText="Ban User"
          confirmColor="red"
        />
      </div>
    </ProtectedRoute>
  );
}
