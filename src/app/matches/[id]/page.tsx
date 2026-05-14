"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

interface Team {
  id: number;
  name: string;
  shortName: string | null;
  crest: string | null;
  venue: string | null;
}

interface MatchThread {
  id: number;
  title: string;
  type: string;
  isAutoCreated: boolean;
  createdAt: string;
  _count: { posts: number };
}

interface MatchDetail {
  id: number;
  matchday: number | null;
  utcDate: string;
  status: string;
  venue: string | null;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  threads: MatchThread[];
}

function formatDateTime(utcDate: string): string {
  return new Date(utcDate).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusLabel: Record<string, string> = {
  FINISHED: "Full time",
  TIMED: "Scheduled",
  SCHEDULED: "Scheduled",
  IN_PLAY: "Live",
  PAUSED: "Half time",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
};

export default function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await api.get<{ match: MatchDetail }>(`/matches/${id}`, {
        skipAuth: true,
      });
      if (err) setError(err);
      else if (data?.match) setMatch(data.match);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorMessage message={error || "Match not found"} />
        <button
          type="button"
          onClick={() => router.push("/matches")}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-700"
        >
          &larr; Back to matches
        </button>
      </div>
    );
  }

  const venueDisplay =
    match.venue ||
    match.homeTeam.venue ||
    null;

  const discussionThread =
    match.threads.find((t) => t.type === "MATCH" || t.isAutoCreated) || match.threads[0];

  const isFinished = match.status === "FINISHED";
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <button
        type="button"
        onClick={() => router.push("/matches")}
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4 inline-block"
      >
        &larr; Back to matches
      </button>

      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/60 dark:from-zinc-900 dark:via-zinc-800 dark:to-indigo-950/40 p-6 sm:p-8 mb-6">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-indigo-400/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <img
              src="https://crests.football-data.org/PL.png"
              alt=""
              className="h-7 w-7 object-contain"
            />
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Premier League
              {match.matchday != null && ` · Matchday ${match.matchday}`}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
            <div className="flex flex-col items-center text-center flex-1 min-w-0">
              {match.homeTeam.crest && (
                <img
                  src={match.homeTeam.crest}
                  alt=""
                  className="h-16 w-16 sm:h-20 sm:w-20 object-contain mb-2"
                />
              )}
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {match.homeTeam.shortName || match.homeTeam.name}
              </h2>
            </div>

            <div className="text-center px-4">
              {isFinished || isLive ? (
                <div className="text-3xl sm:text-4xl font-black font-mono text-zinc-900 dark:text-zinc-50 tabular-nums">
                  {match.homeScore ?? 0} – {match.awayScore ?? 0}
                </div>
              ) : (
                <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                  {new Date(match.utcDate).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </div>
              )}
              <p
                className={`mt-2 text-xs font-semibold uppercase tracking-wide ${
                  isLive ? "text-green-600 dark:text-green-400" : "text-zinc-500"
                }`}
              >
                {statusLabel[match.status] || match.status}
              </p>
            </div>

            <div className="flex flex-col items-center text-center flex-1 min-w-0">
              {match.awayTeam.crest && (
                <img
                  src={match.awayTeam.crest}
                  alt=""
                  className="h-16 w-16 sm:h-20 sm:w-20 object-contain mb-2"
                />
              )}
              <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {match.awayTeam.shortName || match.awayTeam.name}
              </h2>
            </div>
          </div>

          <p className="text-center text-sm text-zinc-600 dark:text-zinc-400 mt-6">
            {formatDateTime(match.utcDate)}
          </p>
          {venueDisplay && (
            <p className="text-center text-sm text-zinc-500 dark:text-zinc-500 mt-2 flex items-center justify-center gap-1.5">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>{venueDisplay}</span>
            </p>
          )}
        </div>
      </div>

      {discussionThread ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 mb-6">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Match Discussion</h3>
            <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
              </svg>
              {discussionThread._count.posts} post{discussionThread._count.posts !== 1 ? "s" : ""}
            </p>
            <div className="flex gap-2 mt-3">
              <Link
                href={`/threads/${discussionThread.id}`}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                </svg>
                View Discussion
              </Link>
              {isAuthenticated && (
                <Link
                  href={`/threads/new?type=MATCH&matchId=${match.id}`}
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Thread
                </Link>
              )}
            </div>
          </div>

          {/* Quick post */}
          {isAuthenticated && !user?.isBanned && (
            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-700/50">
              <div className="flex gap-2">
                <div className="flex-shrink-0 pt-1">
                  {user?.avatar ? (
                    <img src={user.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
                      {user?.username?.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <textarea
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    placeholder="Share your thoughts on this match..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-zinc-800 text-sm resize-none transition-colors"
                  />
                  <div className="flex justify-end mt-1.5">
                    <button
                      onClick={async () => {
                        if (!newPost.trim()) return;
                        setPosting(true);
                        const { data } = await api.post(`/threads/${discussionThread.id}/posts`, { content: newPost });
                        setPosting(false);
                        if (data) {
                          setNewPost("");
                          setMatch((prev) => prev ? {
                            ...prev,
                            threads: prev.threads.map((t) =>
                              t.id === discussionThread.id ? { ...t, _count: { posts: t._count.posts + 1 } } : t
                            ),
                          } : prev);
                        }
                      }}
                      disabled={posting || !newPost.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {posting ? <LoadingSpinner size="sm" /> : "Post"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 mb-6 text-center">
          <p className="text-sm text-zinc-500 mb-3">No discussion thread for this match yet.</p>
          {isAuthenticated && (
            <Link
              href={`/threads/new?type=MATCH&matchId=${match.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Start Discussion Thread
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
