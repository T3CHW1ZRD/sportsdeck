"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { ACTIVITY_CHANGED_EVENT } from "@/lib/activityEvents";
import ActivityChart from "@/components/ActivityChart";

interface UserProfile {
  id: number;
  username: string;
  avatar: string | null;
  role: string;
  isBanned: boolean;
  favoriteTeamId: number | null;
  createdAt: string;
  favoriteTeam?: { id: number; name: string; crest: string } | null;
  likesReceived?: number;
  _count: { threads: number; posts: number; following: number; followers: number };
}

interface UserThread {
  id: number;
  title: string;
  type: string;
  createdAt: string;
  _count: { posts: number };
}

interface UserPost {
  id: number;
  content: string;
  createdAt: string;
  thread: { id: number; title: string; type: string };
}

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAuthenticated } = useAuth();
  const { addToast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [banLoading, setBanLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"threads" | "posts" | "replies">("threads");
  const [threads, setThreads] = useState<UserThread[]>([]);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [replies, setReplies] = useState<UserPost[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [activityDays, setActivityDays] = useState(7);
  const [activity, setActivity] = useState<
    { date: string; threads: number; posts: number; total: number }[] | null
  >(null);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await api.get<{ user: UserProfile }>(`/users/${id}`);
      if (err) setError(err);
      else if (data) setProfile(data.user);
      setLoading(false);
    }
    load();
  }, [id]);

  useEffect(() => {
    async function loadActivity() {
      const { data } = await api.get<{
        activity: { date: string; threads: number; posts: number; total: number }[];
        days: number;
      }>(`/users/${id}/activity?days=${activityDays}`, { skipAuth: true });
      if (data?.activity) setActivity(data.activity);
    }
    loadActivity();
    const onActivityChanged = () => {
      void loadActivity();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void loadActivity();
    };
    window.addEventListener(ACTIVITY_CHANGED_EVENT, onActivityChanged);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener(ACTIVITY_CHANGED_EVENT, onActivityChanged);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [
    id,
    activityDays,
    user?.id === Number(id) ? user?._count?.posts : undefined,
    user?.id === Number(id) ? user?._count?.threads : undefined,
  ]);

  // Check follow status by attempting to detect from followers list
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    // We don't have a direct endpoint, so we'll try to follow and handle the 409
    // Actually, let's just check by trying the followers list
    async function checkFollowStatus() {
      const { data } = await api.get<{ data: Array<{ followerId: number }> }>(
        `/users/${id}/followers?limit=100`
      );
      if (data?.data) {
        const isFollowing = data.data.some(
          (f: Record<string, unknown>) => f.followerId === user?.id || (f as Record<string, unknown>).id === user?.id
        );
        setFollowing(isFollowing);
      }
    }
    checkFollowStatus();
  }, [id, isAuthenticated, user]);

  useEffect(() => {
    async function loadTab() {
      setTabLoading(true);
      if (activeTab === "threads") {
        const { data } = await api.get<{ data: UserThread[] }>(`/threads?authorId=${id}&limit=10`, {
          skipAuth: true,
        });
        if (data?.data) setThreads(data.data);
      } else if (activeTab === "posts") {
        const { data } = await api.get<{ data: UserPost[] }>(`/users/${id}/posts?limit=10`, {
          skipAuth: true,
        });
        if (data?.data) setPosts(data.data);
      } else {
        const { data } = await api.get<{ data: UserPost[] }>(
          `/users/${id}/posts?repliesOnly=true&limit=10`,
          { skipAuth: true }
        );
        if (data?.data) setReplies(data.data);
      }
      setTabLoading(false);
    }
    if (profile) loadTab();
  }, [activeTab, id, profile]);

  const handleFollow = async () => {
    setFollowLoading(true);
    if (following) {
      const { error: err } = await api.delete(`/users/${id}/follow`);
      if (err) {
        addToast(err, "error");
      } else {
        setFollowing(false);
        setProfile((prev) =>
          prev ? { ...prev, _count: { ...prev._count, followers: prev._count.followers - 1 } } : prev
        );
        addToast("Unfollowed", "info");
      }
    } else {
      const { error: err, status } = await api.post(`/users/${id}/follow`);
      if (err) {
        if (status === 409) {
          setFollowing(true);
        } else {
          addToast(err, "error");
        }
      } else {
        setFollowing(true);
        setProfile((prev) =>
          prev ? { ...prev, _count: { ...prev._count, followers: prev._count.followers + 1 } } : prev
        );
        addToast("Following!", "success");
      }
    }
    setFollowLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <ErrorMessage message={error || "User not found"} />
      </div>
    );
  }

  const isOwnProfile = user?.id === profile.id;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
        <div className="p-6">
          {/* Avatar + Name + Actions */}
          <div className="flex items-center gap-4 mb-4">
            {profile.avatar && profile.avatar.length > 1 ? (
              <img src={profile.avatar} alt="" className="h-16 w-16 rounded-full object-cover flex-shrink-0 ring-2 ring-indigo-200 dark:ring-indigo-800" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
                {profile.username.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 break-words">
                  {profile.username}
                </h1>
                {profile.isBanned && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/40 rounded">Banned</span>
                )}
              </div>
              <p className="text-sm text-zinc-500">
                Joined {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isAuthenticated && !isOwnProfile && (
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    following
                      ? "text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600"
                      : "text-white bg-indigo-600 hover:bg-indigo-700"
                  }`}
                >
                  {followLoading ? "..." : following ? "Unfollow" : "Follow"}
                </button>
              )}
              {isAuthenticated && user?.role === "ADMIN" && !isOwnProfile && (
                <button
                  onClick={async () => {
                    const isBanned = profile?.isBanned;
                    const action = isBanned ? "unban" : "ban";
                    if (!confirm(`${isBanned ? "Unban" : "Ban"} ${profile?.username}?`)) return;
                    setBanLoading(true);
                    const { error: err } = await api.post(`/admin/users/${id}/${action}`);
                    setBanLoading(false);
                    if (err) {
                      addToast(err, "error");
                    } else {
                      addToast(`${profile?.username} has been ${isBanned ? "unbanned" : "banned"}`, "success");
                      setProfile((p) => p ? { ...p, isBanned: !isBanned } : p);
                    }
                  }}
                  disabled={banLoading}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                    profile?.isBanned
                      ? "text-green-600 bg-green-50 hover:bg-green-100 dark:text-green-400 dark:bg-green-950/30 dark:hover:bg-green-950/50"
                      : "text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {profile?.isBanned ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    )}
                  </svg>
                  {banLoading ? "..." : profile?.isBanned ? "Unban" : "Ban"}
                </button>
              )}
            </div>
          </div>

          {/* Team badge */}
          {profile.favoriteTeam && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-700/50 w-fit">
              {profile.favoriteTeam.crest && (
                <img src={profile.favoriteTeam.crest} alt="" className="h-5 w-5 object-contain" />
              )}
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {profile.favoriteTeam.name}
              </span>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-5 gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-700">
            {[
              { label: "Threads", value: profile._count.threads },
              { label: "Posts", value: profile._count.posts },
              { label: "Likes", value: profile.likesReceived ?? 0 },
              { label: "Following", value: profile._count.following },
              { label: "Followers", value: profile._count.followers },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{stat.value}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {activity && activity.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-end gap-2 mb-2">
            <span className="text-xs text-zinc-500">Range</span>
            <select
              value={activityDays}
              onChange={(e) => setActivityDays(Number(e.target.value))}
              className="text-xs px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800"
            >
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
          <ActivityChart activity={activity} days={activityDays} />
        </div>
      )}

      {/* Tabs */}
      <div className="mt-6">
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab("threads")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "threads"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            Threads
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("posts")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "posts"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            Posts
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("replies")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === "replies"
                ? "bg-indigo-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            }`}
          >
            Replies
          </button>
        </div>

        {tabLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : activeTab === "threads" ? (
          threads.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">No threads yet.</p>
          ) : (
            <div className="space-y-3">
              {threads.map((thread) => (
                <Link
                  key={thread.id}
                  href={`/threads/${thread.id}`}
                  className="block p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                >
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                    {thread.title}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <span>{thread.type}</span>
                    <span>{thread._count.posts} posts</span>
                    <span>
                      {new Date(thread.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : activeTab === "posts" ? (
          posts.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4">No top-level posts yet.</p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/threads/${post.thread.id}`}
                  className="block p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                >
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2 mb-1 break-words">
                    {post.content}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>in {post.thread.title}</span>
                    <span>
                      {new Date(post.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )
        ) : replies.length === 0 ? (
          <p className="text-sm text-zinc-500 py-4">No replies yet.</p>
        ) : (
          <div className="space-y-3">
            {replies.map((post) => (
              <Link
                key={post.id}
                href={`/threads/${post.thread.id}`}
                className="block p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
              >
                <span className="text-[10px] font-semibold uppercase text-indigo-600 dark:text-indigo-400 mb-1 block">
                  Reply
                </span>
                <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2 mb-1 break-words">
                  {post.content}
                </p>
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span>in {post.thread.title}</span>
                  <span>
                    {new Date(post.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
