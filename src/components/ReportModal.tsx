"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "./Toast";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  threadId?: number;
  postId?: number;
  pollId?: number;
}

export default function ReportModal({ open, onClose, threadId, postId, pollId }: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { addToast } = useToast();

  if (!open) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for your report.");
      return;
    }

    setSubmitting(true);
    setError("");

    const body: Record<string, unknown> = { reason };
    if (threadId) body.threadId = threadId;
    if (postId) body.postId = postId;
    if (pollId) body.pollId = pollId;

    const { error: err } = await api.post("/reports", body);

    setSubmitting(false);

    if (err) {
      setError(err);
    } else {
      addToast("Report submitted successfully", "success");
      setReason("");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          Report Content
        </h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">
          Help us keep the community safe by reporting inappropriate content.
        </p>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you reporting this?"
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
        />

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reason.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {submitting ? "Submitting..." : "Submit Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
