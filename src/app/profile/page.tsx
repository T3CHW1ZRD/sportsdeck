"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { ACTIVITY_CHANGED_EVENT } from "@/lib/activityEvents";
import AvatarCropModal from "@/components/AvatarCropModal";
import ActivityChart from "@/components/ActivityChart";

interface Team {
  id: number;
  name: string;
  shortName: string;
  crest: string;
}

interface FollowUser {
  id: number;
  username: string;
  avatar: string | null;
  favoriteTeamId: number | null;
  followedAt: string;
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
  thread: { id: number; title: string };
}

type Tab = "threads" | "posts" | "replies" | "polls" | "following" | "followers" | "settings";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { addToast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("threads");

  // Tab data
  const [threads, setThreads] = useState<UserThread[]>([]);
  const [posts, setPosts] = useState<UserPost[]>([]);
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [replies, setReplies] = useState<UserPost[]>([]);
  const [polls, setPolls] = useState<{ id: number; question: string; deadline: string; thread: { id: number; title: string }; _count: { votes: number }; createdAt: string }[]>([]);
  const [repliesCount, setRepliesCount] = useState<number | undefined>(undefined);
  const [postsCount, setPostsCount] = useState<number | undefined>(undefined);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabPage, setTabPage] = useState<Record<string, number>>({});
  const [tabHasMore, setTabHasMore] = useState<Record<string, boolean>>({});
  const [tabLoadingMore, setTabLoadingMore] = useState(false);
  const [activityDays, setActivityDays] = useState(7);
  const [activity, setActivity] = useState<
    { date: string; threads: number; posts: number; total: number }[] | null
  >(null);

  // Edit form state
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("");
  const [favoriteTeamId, setFavoriteTeamId] = useState<number | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  // Refresh user data on mount so counts are always fresh
  useEffect(() => {
    refreshUser();
    const hash = window.location.hash.replace("#", "") as Tab;
    if (["threads", "posts", "replies", "polls", "following", "followers", "settings"].includes(hash)) {
      setActiveTab(hash);
    }
  }, [refreshUser]);

  useEffect(() => {
    if (user?.id) {
      api.get<{ user: { repliesCount?: number; _count?: { posts: number } } }>(`/users/${user.id}`, { skipAuth: true }).then(({ data }) => {
        if (data?.user?.repliesCount !== undefined) setRepliesCount(data.user.repliesCount);
        if (data?.user?._count?.posts !== undefined) setPostsCount(data.user._count.posts);
      });
    }
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setAvatar(user.avatar || "");
      setFavoriteTeamId(user.favoriteTeamId);
    }
  }, [user]);

  useEffect(() => {
    async function loadTeams() {
      const { data } = await api.get<{ data: Team[] }>("/teams?limit=50", { skipAuth: true });
      if (data?.data) setTeams(data.data);
    }
    loadTeams();
  }, []);

  useEffect(() => {
    if (!user) return;
    loadTabData();
  }, [activeTab, user]);

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    async function loadActivity() {
      const { data } = await api.get<{
        activity: { date: string; threads: number; posts: number; total: number }[];
      }>(`/users/${uid}/activity?days=${activityDays}`);
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
  }, [user?.id, activityDays, user?._count?.posts, user?._count?.threads]);

  async function loadTabData() {
    if (!user) return;
    setTabLoading(true);
    const PAGE_SIZE = 10;

    const fetchAndSet = async <T,>(url: string, setter: (d: T[]) => void) => {
      const sep = url.includes("?") ? "&" : "?";
      const { data } = await api.get<{ data: T[]; pagination?: { totalPages: number } }>(`${url}${sep}limit=${PAGE_SIZE}&page=1`);
      if (data?.data) {
        setter(data.data);
        setTabPage((p) => ({ ...p, [activeTab]: 1 }));
        setTabHasMore((p) => ({ ...p, [activeTab]: (data.pagination?.totalPages ?? 1) > 1 }));
      }
    };

    if (activeTab === "threads") await fetchAndSet<UserThread>(`/users/${user.id}/threads`, setThreads);
    else if (activeTab === "posts") await fetchAndSet<UserPost>(`/users/${user.id}/posts`, setPosts);
    else if (activeTab === "replies") await fetchAndSet<UserPost>(`/users/${user.id}/posts?repliesOnly=true`, setReplies);
    else if (activeTab === "polls") await fetchAndSet(`/users/${user.id}/polls`, setPolls);
    else if (activeTab === "following") await fetchAndSet<FollowUser>(`/users/${user.id}/following`, setFollowing);
    else if (activeTab === "followers") await fetchAndSet<FollowUser>(`/users/${user.id}/followers`, setFollowers);

    setTabLoading(false);
  }

  async function loadMoreTabData() {
    if (!user || tabLoadingMore) return;
    setTabLoadingMore(true);
    const PAGE_SIZE = 10;
    const nextPage = (tabPage[activeTab] || 1) + 1;

    const fetchMore = async <T,>(url: string, setter: React.Dispatch<React.SetStateAction<T[]>>) => {
      const sep = url.includes("?") ? "&" : "?";
      const { data } = await api.get<{ data: T[]; pagination?: { totalPages: number } }>(`${url}${sep}limit=${PAGE_SIZE}&page=${nextPage}`);
      if (data?.data) {
        setter((prev) => [...prev, ...data.data]);
        setTabPage((p) => ({ ...p, [activeTab]: nextPage }));
        setTabHasMore((p) => ({ ...p, [activeTab]: nextPage < (data.pagination?.totalPages ?? 1) }));
      }
    };

    if (activeTab === "threads") await fetchMore<UserThread>(`/users/${user.id}/threads`, setThreads);
    else if (activeTab === "posts") await fetchMore<UserPost>(`/users/${user.id}/posts`, setPosts);
    else if (activeTab === "replies") await fetchMore<UserPost>(`/users/${user.id}/posts?repliesOnly=true`, setReplies);
    else if (activeTab === "following") await fetchMore<FollowUser>(`/users/${user.id}/following`, setFollowing);
    else if (activeTab === "polls") await fetchMore(`/users/${user.id}/polls`, setPolls);
    else if (activeTab === "followers") await fetchMore<FollowUser>(`/users/${user.id}/followers`, setFollowers);

    setTabLoadingMore(false);
  }

  const handleUnfollow = async (targetId: number) => {
    const { error: err } = await api.delete(`/users/${targetId}/follow`);
    if (err) {
      addToast(err, "error");
    } else {
      addToast("Unfollowed", "info");
      setFollowing((prev) => prev.filter((f) => f.id !== targetId));
      await refreshUser();
    }
  };

  const handleRemoveFollower = async (followerId: number) => {
    const { error: err } = await api.delete(`/users/${user!.id}/followers`, { followerId });
    if (err) {
      addToast(err, "error");
    } else {
      addToast("Follower removed", "info");
      setFollowers((prev) => prev.filter((f) => f.id !== followerId));
      await refreshUser();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {};
    if (username !== user?.username) body.username = username;
    if (avatar !== (user?.avatar || "")) body.avatar = avatar || null;
    if (favoriteTeamId !== user?.favoriteTeamId) body.favoriteTeamId = favoriteTeamId;
    if (newPassword) {
      body.currentPassword = currentPassword;
      body.newPassword = newPassword;
    }

    if (Object.keys(body).length === 0) {
      setSaving(false);
      addToast("No changes to save", "info");
      return;
    }

    const { error: err } = await api.put("/auth/me", body);
    setSaving(false);

    if (err) {
      setError(err);
    } else {
      addToast("Profile updated successfully", "success");
      setCurrentPassword("");
      setNewPassword("");
      await refreshUser();
    }
  };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "threads", label: "Threads", count: user?._count?.threads },
    { key: "posts", label: "Posts", count: postsCount ?? user?._count?.posts },
    { key: "replies", label: "Replies", count: repliesCount },
    { key: "polls", label: "Polls" },
    { key: "following", label: "Following", count: user?._count?.following },
    { key: "followers", label: "Followers", count: user?._count?.followers },
    { key: "settings", label: "Settings" },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const likesReceived = (user as any)?.likesReceived ?? 0;

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {user && (
          <>
            {/* Profile card */}
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 mb-6">
              <div className="flex items-center gap-4">
                {user.avatar && user.avatar.length > 1 ? (
                  <img src={user.avatar} alt="" className="h-16 w-16 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-2xl font-bold text-indigo-600 dark:text-indigo-300 flex-shrink-0">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{user.username}</h1>
                  <p className="text-sm text-zinc-500">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded-full">
                      {user.role}
                    </span>
                    {user.isBanned && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                        Banned
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {user.favoriteTeam && (
                <div className="flex items-center gap-2 mt-4">
                  {user.favoriteTeam.crest && (
                    <img src={user.favoriteTeam.crest} alt="" className="h-5 w-5 object-contain" />
                  )}
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Supports {user.favoriteTeam.name}
                  </span>
                </div>
              )}
            </div>

            {/* Likes stat */}
            <div className="flex items-center gap-1 mb-4 text-sm text-zinc-500">
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
              <span>{likesReceived} like{likesReceived !== 1 ? "s" : ""} received</span>
            </div>

            {activity && activity.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-end gap-2 mb-2">
                  <span className="text-xs text-zinc-500">Activity range</span>
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
            <div className="flex gap-1 mb-6 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? "bg-indigo-600 text-white"
                      : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className={`ml-1.5 text-xs ${activeTab === tab.key ? "text-indigo-200" : "text-zinc-400"}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === "settings" ? (
              <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6">
                {user?.isBanned && (
                  <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-red-700 dark:text-red-400">Your account is suspended</p>
                        <p className="text-xs text-red-600 dark:text-red-400/80 mt-0.5">You cannot post, reply, vote, or follow users.</p>
                      </div>
                      <Link href="/appeals" className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex-shrink-0">
                        Submit Appeal
                      </Link>
                    </div>
                  </div>
                )}
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Edit Profile</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Profile Picture</label>
                    <div className="flex items-center gap-4">
                      {(avatar && avatar.length > 1) || (user.avatar && user.avatar.length > 1) ? (
                        <img src={avatar || user.avatar || ""} alt="" className="h-12 w-12 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-lg font-bold text-indigo-600 dark:text-indigo-300 flex-shrink-0">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 5 * 1024 * 1024) {
                              addToast("File too large. Maximum 5MB", "error");
                              return;
                            }
                            setCropFile(file);
                            const reader = new FileReader();
                            reader.onload = () => setCropImageSrc(reader.result as string);
                            reader.readAsDataURL(file);
                            e.target.value = "";
                          }}
                          className="block w-full text-sm text-zinc-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 dark:file:bg-indigo-950 dark:file:text-indigo-400 cursor-pointer"
                        />
                        <p className="mt-1 text-xs text-zinc-400">JPEG, PNG, GIF, or WebP. Max 5MB.</p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Favorite Team</label>
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                      <button
                        type="button"
                        onClick={() => setFavoriteTeamId(null)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                          favoriteTeamId === null
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30"
                            : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                        }`}
                      >
                        <div className="h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-zinc-400 text-xs">—</div>
                        <span className="text-[10px] font-medium text-zinc-500 text-center">None</span>
                      </button>
                      {teams.map((team) => (
                        <button
                          key={team.id}
                          type="button"
                          onClick={() => setFavoriteTeamId(team.id)}
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                            favoriteTeamId === team.id
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30"
                              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                          }`}
                        >
                          {team.crest && <img src={team.crest} alt="" className="h-7 w-7 object-contain" />}
                          <span className="text-[10px] font-medium text-zinc-700 dark:text-zinc-300 text-center leading-tight truncate w-full">
                            {team.shortName || team.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <hr className="border-zinc-200 dark:border-zinc-700" />
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Required to change password"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                  {error && <ErrorMessage message={error} />}
                  <div className="flex justify-end">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      {saving ? <LoadingSpinner size="sm" /> : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            ) : tabLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : activeTab === "threads" ? (
              threads.length === 0 ? (
                <p className="text-center py-12 text-zinc-500">You haven&apos;t created any threads yet.</p>
              ) : (
                <div className="space-y-2">
                  {threads.map((thread) => (
                    <Link
                      key={thread.id}
                      href={`/threads/${thread.id}`}
                      className="block p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                    >
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1 break-words">{thread.title}</h3>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400 font-medium">{thread.type}</span>
                        <span>{thread._count.posts} posts</span>
                        <span>{new Date(thread.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : activeTab === "posts" ? (
              posts.length === 0 ? (
                <p className="text-center py-12 text-zinc-500">You haven&apos;t posted anything yet.</p>
              ) : (
                <div className="space-y-2">
                  {posts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/threads/${post.thread.id}`}
                      className="block p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                    >
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2 mb-1 break-words">{post.content}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>in {post.thread.title}</span>
                        <span>{new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : activeTab === "replies" ? (
              replies.length === 0 ? (
                <p className="text-center py-12 text-zinc-500">No replies yet.</p>
              ) : (
                <div className="space-y-2">
                  {replies.map((post) => (
                    <Link
                      key={post.id}
                      href={`/threads/${post.thread.id}`}
                      className="block p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                    >
                      <span className="text-[10px] font-semibold uppercase text-indigo-600 dark:text-indigo-400 mb-1 block">
                        Reply
                      </span>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 line-clamp-2 mb-1 break-words">{post.content}</p>
                      <div className="flex items-center gap-2 text-xs text-zinc-400">
                        <span>in {post.thread.title}</span>
                        <span>{new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : activeTab === "polls" ? (
              polls.length === 0 ? (
                <p className="text-center py-12 text-zinc-500">No polls created yet.</p>
              ) : (
                <div className="space-y-2">
                  {polls.map((poll) => (
                    <Link
                      key={poll.id}
                      href={`/threads/${poll.thread.id}`}
                      className="block p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors overflow-hidden"
                    >
                      <div className="flex items-start gap-2 mb-1">
                        <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                        </svg>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 break-words">{poll.question}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-zinc-400">
                        <span>in {poll.thread.title}</span>
                        <span>{poll._count.votes} vote{poll._count.votes !== 1 ? "s" : ""}</span>
                        <span>{new Date(poll.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                        {new Date() > new Date(poll.deadline) && <span className="text-red-500 font-medium">Closed</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              )
            ) : activeTab === "following" ? (
              following.length === 0 ? (
                <p className="text-center py-12 text-zinc-500">You&apos;re not following anyone yet.</p>
              ) : (
                <div className="space-y-2">
                  {following.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700"
                    >
                      <Link href={`/users/${f.id}`} className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-300 flex-shrink-0">
                          {f.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{f.username}</p>
                          <p className="text-xs text-zinc-400">
                            Following since {new Date(f.followedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      </Link>
                      <button
                        onClick={() => handleUnfollow(f.id)}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 dark:text-zinc-400 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded-lg transition-colors flex-shrink-0 ml-3"
                      >
                        Unfollow
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : activeTab === "followers" ? (
              followers.length === 0 ? (
                <p className="text-center py-12 text-zinc-500">No followers yet.</p>
              ) : (
                <div className="space-y-2">
                  {followers.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700"
                    >
                      <Link href={`/users/${f.id}`} className="flex items-center gap-3 min-w-0">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-300 flex-shrink-0">
                          {f.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{f.username}</p>
                          <p className="text-xs text-zinc-400">
                            Followed you {new Date(f.followedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </p>
                        </div>
                      </Link>
                      <button
                        onClick={() => handleRemoveFollower(f.id)}
                        className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:hover:bg-red-900 rounded-lg transition-colors flex-shrink-0 ml-3"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : null}

            {/* Load more button */}
            {activeTab !== "settings" && tabHasMore[activeTab] && (
              <button
                onClick={loadMoreTabData}
                disabled={tabLoadingMore}
                className="w-full mt-4 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {tabLoadingMore ? <LoadingSpinner size="sm" /> : "Load more"}
              </button>
            )}
          </>
        )}
      </div>

      {cropImageSrc && (
        <AvatarCropModal
          imageSrc={cropImageSrc}
          onClose={() => { setCropImageSrc(null); setCropFile(null); }}
          onCropDone={async (blob) => {
            const ext = cropFile?.name.split(".").pop() || "jpg";
            const formData = new FormData();
            formData.append("file", blob, `avatar.${ext}`);
            const token = localStorage.getItem("accessToken");
            const res = await fetch("/api/auth/avatar", {
              method: "POST",
              headers: token ? { Authorization: `Bearer ${token}` } : {},
              body: formData,
            });
            const data = await res.json();
            if (res.ok && data.avatar) {
              setAvatar(data.avatar);
              addToast("Profile picture updated", "success");
              await refreshUser();
            } else {
              addToast(data.error || "Upload failed", "error");
            }
            setCropImageSrc(null);
            setCropFile(null);
          }}
        />
      )}
    </ProtectedRoute>
  );
}
