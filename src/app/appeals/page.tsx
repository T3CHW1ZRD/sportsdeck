"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";

interface Appeal {
  id: number;
  reason: string;
  status: string;
  createdAt: string;
  user?: { id: number; username: string };
}

export default function AppealsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAppeals();
  }, []);

  async function loadAppeals() {
    const { data } = await api.get<{ data: Appeal[] }>("/appeals");
    if (data?.data) setAppeals(data.data);
    setLoading(false);
  }

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for your appeal.");
      return;
    }

    setSubmitting(true);
    setError("");

    const { error: err } = await api.post("/appeals", { reason });

    setSubmitting(false);

    if (err) {
      setError(err);
    } else {
      addToast("Appeal submitted successfully", "success");
      setReason("");
      loadAppeals();
    }
  };

  const statusColor: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
    APPROVED: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">Appeals</h1>

        {!user?.isBanned ? (
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-8 text-center">
            <p className="text-zinc-500 dark:text-zinc-400 text-lg mb-2">
              You don&apos;t need to be here
            </p>
            <p className="text-zinc-400 dark:text-zinc-500 text-sm">
              Your account is in good standing.
            </p>
          </div>
        ) : (
          <>
            {/* Submit appeal form */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 mb-6">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
                Submit an Appeal
              </h2>
              <textarea
                value={reason}
                onChange={(e) => { if (e.target.value.length <= 2000) setReason(e.target.value); }}
                placeholder="Explain why you believe your ban should be lifted..."
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
              />
              {reason.length > 1500 && (
                <p className={`text-[10px] text-right mt-0.5 ${reason.length > 1900 ? "text-red-500" : "text-zinc-400"}`}>
                  {reason.length}/2000
                </p>
              )}
              {error && <ErrorMessage message={error} />}
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !reason.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
                >
                  {submitting ? <LoadingSpinner size="sm" /> : "Submit Appeal"}
                </button>
              </div>
            </div>

            {/* Existing appeals */}
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
              Your Appeals
            </h2>

            {loading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : appeals.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                You haven&apos;t submitted any appeals yet.
              </p>
            ) : (
              <div className="space-y-3">
                {appeals.map((appeal) => (
                  <div
                    key={appeal.id}
                    className="p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          statusColor[appeal.status] || "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {appeal.status}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {new Date(appeal.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">{appeal.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
