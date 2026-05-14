"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

interface Thread {
  id: number;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  author: { id: number; username: string; avatar: string | null };
  team?: { id: number; name: string } | null;
  _count: { posts: number; polls: number };
  tags?: { id: number; name: string }[];
}

const THREAD_TYPES = ["All", "General", "Team", "Match"] as const;

function buildSearchParams(
  page: number,
  typeFilter: string,
  q: string,
  filterTitle: string,
  filterAuthor: string,
  filterTeam: string,
  filterTag: string,
  posts?: boolean,
  replies?: boolean,
  polls?: boolean
): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "15");
  if (q.trim()) params.set("q", q.trim());
  if (filterTitle.trim()) params.set("title", filterTitle.trim());
  if (filterAuthor.trim()) params.set("author", filterAuthor.trim());
  if (filterTeam.trim()) params.set("team", filterTeam.trim());
  if (filterTag.trim()) params.set("tag", filterTag.trim());
  if (typeFilter !== "All") params.set("type", typeFilter.toUpperCase());
  if (posts) params.set("posts", "true");
  if (replies) params.set("replies", "true");
  if (polls) params.set("polls", "true");
  return params.toString();
}

export default function ThreadsPage() {
  const { isAuthenticated } = useAuth();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [filterTitle, setFilterTitle] = useState("");
  const [filterAuthor, setFilterAuthor] = useState("");
  const [filterTeam, setFilterTeam] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [isFiltering, setIsFiltering] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sortBy, setSortBy] = useState<string>("newest");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSearchOrFilters =
    search.trim() ||
    filterTitle.trim() ||
    filterAuthor.trim() ||
    filterTeam.trim() ||
    filterTag.trim();

  const loadThreads = useCallback(async (p: number, type: string) => {
    setLoading(true);
    let url = `/threads?page=${p}&limit=15`;
    if (type !== "All") {
      url += `&type=${type.toUpperCase()}`;
    }
    const { data } = await api.get<{
      data: Thread[];
      pagination: { page: number; totalPages: number };
    }>(url, { skipAuth: true });
    if (data) {
      setThreads(data.data);
      setTotalPages(data.pagination.totalPages);
    }
    setLoading(false);
  }, []);

  const runSearch = useCallback(
    async (p: number) => {
      setLoading(true);
      setIsFiltering(true);
      const qs = buildSearchParams(p, typeFilter, search, filterTitle, filterAuthor, filterTeam, filterTag);
      const { data } = await api.get<{
        data: Thread[];
        pagination: { page: number; totalPages: number };
      }>(`/threads/search?${qs}`, { skipAuth: true });
      if (data) {
        setThreads(data.data);
        setTotalPages(data.pagination.totalPages);
      }

      setLoading(false);
    },
    [search, filterTitle, filterAuthor, filterTeam, filterTag, typeFilter]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!hasSearchOrFilters) {
      setIsFiltering(false);
      loadThreads(page, typeFilter);
      return;
    }
    debounceRef.current = setTimeout(() => {
      runSearch(page);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [page, typeFilter, search, filterTitle, filterAuthor, filterTeam, filterTag, hasSearchOrFilters, loadThreads, runSearch]);

  const handleSearchChange = (query: string) => {
    setSearch(query);
    setPage(1);
  };

  const handleTypeFilter = (type: string) => {
    setTypeFilter(type);
    setPage(1);
  };

  const sortedThreads = useMemo(() => {
    const sorted = [...threads];
    switch (sortBy) {
      case "oldest":
        sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "newest":
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "replies":
        sorted.sort((a, b) => b._count.posts - a._count.posts);
        break;
    }
    return sorted;
  }, [threads, sortBy]);

  const typeColor: Record<string, string> = {
    GENERAL: "bg-zinc-100 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
    TEAM: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    MATCH: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Threads</h1>
        <Link
          href={isAuthenticated ? "/threads/new" : "/login"}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Thread
        </Link>
      </div>

      {/* Search + Sort row */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search threads..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="replies">Most replies</option>
        </select>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
            showAdvanced || filterTitle || filterAuthor || filterTeam || filterTag
              ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400"
              : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      {/* Type filter pills */}
      <div className="flex items-center gap-1 mb-4 bg-zinc-100/80 dark:bg-zinc-800/80 rounded-xl p-1 w-fit">
        {THREAD_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => handleTypeFilter(type)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              typeFilter === type
                ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Advanced filters (collapsible) */}
      {showAdvanced && (
        <div className="grid sm:grid-cols-2 gap-3 mb-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/80 dark:bg-zinc-900/40">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Title</label>
            <input type="text" value={filterTitle} onChange={(e) => { setFilterTitle(e.target.value); setPage(1); }} placeholder="Title contains..." className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Author</label>
            <input type="text" value={filterAuthor} onChange={(e) => { setFilterAuthor(e.target.value); setPage(1); }} placeholder="Username..." className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Team</label>
            <input type="text" value={filterTeam} onChange={(e) => { setFilterTeam(e.target.value); setPage(1); }} placeholder="e.g. Arsenal..." className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tag</label>
            <input type="text" value={filterTag} onChange={(e) => { setFilterTag(e.target.value); setPage(1); }} placeholder="Tag name..." className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm" />
          </div>
          {(filterTitle || filterAuthor || filterTeam || filterTag) && (
            <button onClick={() => { setFilterTitle(""); setFilterAuthor(""); setFilterTeam(""); setFilterTag(""); setPage(1); }} className="sm:col-span-2 text-xs text-red-500 hover:text-red-600 font-medium">
              Clear all filters
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : threads.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p>
            {hasSearchOrFilters || isFiltering
              ? "No threads match your search or filters."
              : "No threads yet. Start the conversation!"}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {sortedThreads.map((thread) => (
              <Link
                key={thread.id}
                href={`/threads/${thread.id}`}
                className="block group"
              >
                <div className="flex gap-3 p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-600/50 hover:shadow-md hover:shadow-indigo-500/5 transition-all">
                  {/* Avatar */}
                  <div className="flex-shrink-0 pt-0.5">
                    {thread.author.avatar ? (
                      <img src={thread.author.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                        {thread.author.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Top row: type + team + date */}
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${typeColor[thread.type] || "bg-zinc-100 text-zinc-600"}`}>
                        {thread.type}
                      </span>
                      {thread.team && (
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">{thread.team.name}</span>
                      )}
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-auto">
                        {new Date(thread.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>

                    {/* Title */}
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1 mb-0.5 break-words">
                      {thread.title}
                    </h2>

                    {/* Preview */}
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mb-2 break-words">
                      {thread.content}
                    </p>

                    {/* Bottom row: author + tags + reply count */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {thread.author.username}
                      </span>
                      {thread.tags && thread.tags.length > 0 && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-600">·</span>
                          {thread.tags.slice(0, 3).map((tag) => (
                            <span key={tag.id} className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                              {tag.name}
                            </span>
                          ))}
                        </>
                      )}
                      <div className="ml-auto flex items-center gap-3 text-[11px] text-zinc-400">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                          </svg>
                          {thread._count.posts}
                        </span>
                        {thread._count.polls > 0 && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                            </svg>
                            {thread._count.polls}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 text-sm text-zinc-500">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
