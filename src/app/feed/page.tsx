"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import { SkeletonCard } from "@/components/Skeleton";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";

interface FeedItem {
  type: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}

type FilterType = "all" | "replies" | "following" | "team" | "social";

const FILTER_TYPES: Record<FilterType, Set<string>> = {
  all: new Set(),
  replies: new Set(["REPLY_TO_YOUR_POST"]),
  following: new Set(["FOLLOWED_USER_ACTIVITY", "FOLLOWED_USER_THREAD"]),
  team: new Set(["TEAM_MATCH_RESULT", "TEAM_NEW_THREAD"]),
  social: new Set(["NEW_FOLLOWER"]),
};

const FILTERS: { key: FilterType; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" },
  { key: "replies", label: "Replies", icon: "M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" },
  { key: "following", label: "Following", icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
  { key: "team", label: "Your Club", icon: "M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" },
  { key: "social", label: "Followers", icon: "M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" },
];

const typeLabel: Record<string, string> = {
  NEW_FOLLOWER: "New Follower",
  REPLY_TO_YOUR_POST: "Reply",
  FOLLOWED_USER_ACTIVITY: "Thread activity",
  FOLLOWED_USER_THREAD: "New Thread",
  TEAM_MATCH_RESULT: "Match Result",
  TEAM_NEW_THREAD: "Team Thread",
};

const typeIcon: Record<string, string> = {
  REPLY_TO_YOUR_POST: "M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z",
  FOLLOWED_USER_ACTIVITY: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25",
  FOLLOWED_USER_THREAD: "M12 4.5v15m7.5-7.5h-15",
  TEAM_MATCH_RESULT: "M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-4.77 0",
  TEAM_NEW_THREAD: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  NEW_FOLLOWER: "M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z",
};

const typeColor: Record<string, string> = {
  NEW_FOLLOWER: "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400",
  REPLY_TO_YOUR_POST: "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400",
  FOLLOWED_USER_ACTIVITY: "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
  FOLLOWED_USER_THREAD: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
  TEAM_MATCH_RESULT: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
  TEAM_NEW_THREAD: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
};

function buildFeedUrl(filterKey: FilterType, page: number): string {
  const types = FILTER_TYPES[filterKey];
  const params = new URLSearchParams({ limit: "15", page: String(page) });
  if (filterKey !== "all" && types.size > 0) {
    params.set("types", [...types].join(","));
  }
  return `/feed?${params.toString()}`;
}

function getFeedItemLink(item: FeedItem): string | null {
  const d = item.data;
  if (d.threadId) return `/threads/${d.threadId}`;
  if (d.id && (item.type === "FOLLOWED_USER_THREAD" || item.type === "TEAM_NEW_THREAD")) return `/threads/${d.id}`;
  if (item.type === "NEW_FOLLOWER" && (d.userId || d.id)) return `/users/${d.userId || d.id}`;
  if (item.type === "TEAM_MATCH_RESULT" && d.id) return `/matches/${d.id}`;
  return null;
}

function groupItems(items: FeedItem[]): FeedItem[] {
  const grouped: FeedItem[] = [];
  const seenThreads = new Set<number>();

  for (const item of items) {
    // Deduplicate by thread — prefer FOLLOWED_USER_ACTIVITY over FOLLOWED_USER_THREAD
    const threadId = (item.data.threadId as number) || (item.type === "FOLLOWED_USER_THREAD" || item.type === "TEAM_NEW_THREAD" ? item.data.id as number : null);

    if (threadId && (item.type === "FOLLOWED_USER_THREAD" || item.type === "FOLLOWED_USER_ACTIVITY" || item.type === "TEAM_NEW_THREAD")) {
      if (seenThreads.has(threadId)) continue;
      seenThreads.add(threadId);
    }

    grouped.push(item);
  }
  return grouped;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { user } = useAuth();
  const { addToast } = useToast();
  const isAdmin = user?.role === "ADMIN";

  const handleBan = async (userId: number, username: string) => {
    if (!confirm(`Ban ${username}?`)) return;
    const { error } = await api.post(`/admin/users/${userId}/ban`);
    if (error) addToast(error, "error");
    else addToast(`${username} has been banned`, "success");
  };

  useEffect(() => {
    async function loadFeed() {
      setLoading(true);
      setItems([]);
      setPage(1);
      const { data } = await api.get<{ data: FeedItem[]; pagination?: { totalPages: number } }>(buildFeedUrl(filter, 1));
      if (data?.data) setItems(data.data);
      setHasMore((data?.pagination?.totalPages ?? 1) > 1);
      setLoading(false);
    }
    loadFeed();
  }, [filter]);

  const filtered = useMemo(() => groupItems(items), [items]);


  return (
    <ProtectedRoute>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Your Feed</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {items.length} update{items.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => { setLoading(true); setPage(1); api.get<{ data: FeedItem[]; pagination?: { totalPages: number } }>(buildFeedUrl(filter, 1)).then(({ data }) => { if (data?.data) { setItems(data.data); setHasMore((data.pagination?.totalPages ?? 1) > 1); } setLoading(false); }); }}
            className="p-2 rounded-lg text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            title="Refresh"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-6 bg-zinc-100/80 dark:bg-zinc-800/80 rounded-xl p-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                filter === f.key
                  ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
              </svg>
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 dark:text-zinc-400">
            <svg className="w-12 h-12 mx-auto mb-3 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <p className="text-lg font-medium mb-1">Nothing here yet</p>
            <p className="text-sm">Follow users, join discussions, and set a favorite team to see activity.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {filtered.map((item, i) => {
                const link = getFeedItemLink(item);
                const iconPath = typeIcon[item.type] || FILTERS[0].icon;

                const card = (
                  <div className="flex gap-3 p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-600/50 hover:shadow-md hover:shadow-indigo-500/5 transition-all overflow-hidden">
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${typeColor[item.type] || "bg-zinc-100 text-zinc-500"}`}>
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                      </svg>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                          {typeLabel[item.type] || item.type}
                        </span>
                        <span className="text-[10px] text-zinc-400">{timeAgo(item.createdAt)}</span>
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {item.message}
                      </p>
                      {item.type === "REPLY_TO_YOUR_POST" && typeof item.data.content === "string" ? (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 italic">
                          &ldquo;{item.data.content}&rdquo;
                        </p>
                      ) : null}
                      {item.type === "FOLLOWED_USER_ACTIVITY" && typeof item.data.postCount === "number" && item.data.postCount > 1 ? (
                        <p className="text-xs text-zinc-400 mt-1">
                          +{(item.data.postCount as number) - 1} more post{(item.data.postCount as number) > 2 ? "s" : ""} in this thread
                        </p>
                      ) : null}
                    </div>

                    {/* Admin ban + Arrow */}
                    <div className="flex items-center gap-1 flex-shrink-0 self-center">
                      {(() => {
                        const author = item.data.author as { id: number; username: string } | undefined;
                        if (!isAdmin || !author || author.id === user?.id) return null;
                        return (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBan(author.id, author.username); }}
                            className="p-1.5 rounded-lg text-zinc-300 dark:text-zinc-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Ban user"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                        );
                      })()}
                      {link && (
                        <div className="text-zinc-300 dark:text-zinc-600">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                );

                return link ? (
                  <Link key={`${item.type}-${i}`} href={link} className="block">
                    {card}
                  </Link>
                ) : (
                  <div key={`${item.type}-${i}`}>{card}</div>
                );
              })}
            </div>

            {hasMore && (
              <button
                onClick={async () => {
                  setLoadingMore(true);
                  const nextPage = page + 1;
                  const { data } = await api.get<{ data: FeedItem[]; pagination?: { totalPages: number } }>(buildFeedUrl(filter, nextPage));
                  if (data?.data) {
                    setItems((prev) => [...prev, ...data.data]);
                    setPage(nextPage);
                    setHasMore(nextPage < (data.pagination?.totalPages ?? 1));
                  }
                  setLoadingMore(false);
                }}
                disabled={loadingMore}
                className="w-full mt-4 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {loadingMore ? <LoadingSpinner size="sm" /> : "Load more"}
              </button>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
