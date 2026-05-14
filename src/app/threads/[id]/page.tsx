"use client";

import { useState, useEffect, useMemo, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import ConfirmDialog from "@/components/ConfirmDialog";
import ReportModal from "@/components/ReportModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/api";
import { notifyActivityChanged } from "@/lib/activityEvents";

interface Post {
  id: number;
  content: string;
  createdAt: string;
  author: { id: number; username: string; avatar: string | null };
  replies?: Post[];
  liked?: boolean;
  _count?: { replies: number; versions?: number; likes?: number };
}

interface PollOption {
  id: number;
  text: string;
  _count: { votes: number };
}

interface Poll {
  id: number;
  question: string;
  deadline: string;
  author: { id: number; username: string };
  options: PollOption[];
  _count: { votes: number };
}

interface MatchInfo {
  id: number;
  utcDate: string;
  homeTeam: { id: number; name: string; shortName: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; crest: string };
}

interface SentimentPayload {
  overall: { label: string; score: number };
  homeTeam: { label: string; teamName?: string; fanCount?: number } | null;
  awayTeam: { label: string; teamName?: string; fanCount?: number } | null;
  postCount: number;
}

interface ThreadDetail {
  id: number;
  title: string;
  content: string;
  type: string;
  createdAt: string;
  isHidden: boolean;
  author: { id: number; username: string; avatar: string | null };
  team?: { id: number; name: string; shortName?: string; crest?: string } | null;
  match?: MatchInfo | null;
  tags?: { id: number; name: string }[];
  polls?: Poll[];
  _count: { posts: number };
}

interface PostVersion {
  id: number;
  content: string;
  createdAt: string;
}

function PollDeadline({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(new Date());
  const deadlineDate = new Date(deadline);
  const diff = deadlineDate.getTime() - now.getTime();
  const isExpired = diff <= 0;
  const isLastHour = !isExpired && diff <= 60 * 60 * 1000;

  useEffect(() => {
    if (isExpired) return;
    const interval = setInterval(() => setNow(new Date()), isLastHour ? 1000 : 60000);
    return () => clearInterval(interval);
  }, [isExpired, isLastHour]);

  if (isExpired) {
    return <span className="text-red-500 font-medium">Poll closed</span>;
  }

  if (isLastHour) {
    const mins = Math.floor(diff / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    return (
      <span className="text-amber-500 font-medium animate-pulse">
        Closes in {mins}:{String(secs).padStart(2, "0")}
      </span>
    );
  }

  const hours = Math.floor(diff / 3600000);
  if (hours < 24) {
    return <span className="text-zinc-500">Closes in {hours}h {Math.floor((diff % 3600000) / 60000)}m</span>;
  }

  return (
    <span className="text-zinc-500">
      Closes {deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
    </span>
  );
}

function renderMentions(text: string, userMap: Map<string, number>, onPollClick?: (pollId: number) => void, pollMap?: Map<number, string>) {
  const parts = text.split(/(@\w+|\[Poll#\d+\]|\[Poll(?:#\d+)?: "[^"]*"\])/g);
  return parts.map((part, i) => {
    const mentionMatch = part.match(/^@(\w+)$/);
    if (mentionMatch) {
      const userId = userMap.get(mentionMatch[1]);
      if (userId) {
        return (
          <Link key={i} href={`/users/${userId}`} className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
            {part}
          </Link>
        );
      }
      return <span key={i} className="text-indigo-600 dark:text-indigo-400 font-semibold">{part}</span>;
    }
    // New format: [Poll#123]
    const shortPollMatch = part.match(/^\[Poll#(\d+)\]$/);
    if (shortPollMatch && onPollClick) {
      const pollId = parseInt(shortPollMatch[1]);
      const question = pollMap?.get(pollId) || `Poll #${pollId}`;
      return (
        <button key={i} onClick={() => onPollClick(pollId)} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900 text-xs">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          {question}
        </button>
      );
    }
    // Legacy format: [Poll: "question"] or [Poll#123: "question"]
    const legacyPollMatch = part.match(/^\[Poll(?:#(\d+))?: "(.*)"\]$/);
    if (legacyPollMatch && onPollClick) {
      const pollId = legacyPollMatch[1] ? parseInt(legacyPollMatch[1]) : 0;
      const question = legacyPollMatch[2];
      return (
        <button key={i} onClick={() => onPollClick(pollId)} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900 text-xs">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          {question}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ThreadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPost, setNewPost] = useState("");
  const [replyText, setReplyText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadMorePosts = useCallback(async () => {
    if (loadingMore || !hasMorePosts) return;
    setLoadingMore(true);
    const nextPage = postsPage + 1;
    const { data } = await api.get<{ data: Post[]; pagination: { totalPages: number } }>(`/threads/${id}/posts?limit=10&page=${nextPage}`);
    if (data?.data) {
      setPosts((prev) => [...prev, ...data.data]);
      setPostsPage(nextPage);
      setHasMorePosts(nextPage < (data.pagination?.totalPages ?? 1));
    }
    setLoadingMore(false);
  }, [id, postsPage, loadingMore, hasMorePosts]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) loadMorePosts(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMorePosts]);
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: number; username: string; showUnder: number } | null>(null);
  const [discussingPoll, setDiscussingPoll] = useState<{ id: number; question: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<number, number>>({});

  // Edit states
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editingThread, setEditingThread] = useState(false);
  const [editThreadTitle, setEditThreadTitle] = useState("");
  const [editThreadContent, setEditThreadContent] = useState("");
  const [editThreadTags, setEditThreadTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState("");

  // Confirm dialog states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmDescription, setConfirmDescription] = useState("");

  // Report modal states
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ threadId?: number; postId?: number; pollId?: number }>({});

  // Poll voted state
  const [votedPolls, setVotedPolls] = useState<Record<number, number>>({});

  // Translate states
  const [threadTranslation, setThreadTranslation] = useState<string | null>(null);
  const [threadTranslating, setThreadTranslating] = useState(false);
  const [postTranslations, setPostTranslations] = useState<Record<number, string>>({});
  const [postTranslating, setPostTranslating] = useState<Record<number, boolean>>({});
  const [likeLoading, setLikeLoading] = useState<Record<number, boolean>>({});
  const [threadLiked, setThreadLiked] = useState(false);
  const [threadLikeCount, setThreadLikeCount] = useState(0);
  const [threadLikeLoading, setThreadLikeLoading] = useState(false);

  // Post edit history states
  const [historyPostId, setHistoryPostId] = useState<number | null>(null);
  const [historyVersions, setHistoryVersions] = useState<PostVersion[]>([]);
  const [historyLimit, setHistoryLimit] = useState(5);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Poll creation states
  const [showPollForm, setShowPollForm] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDeadline, setPollDeadline] = useState("");
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"replies" | "polls">("replies");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "likes" | "replies">("newest");
  const [pollRepliesOnly, setPollRepliesOnly] = useState(false);
  const [filterPollId, setFilterPollId] = useState<number | null>(null);
  const [postSearch, setPostSearch] = useState("");

  const [sentiment, setSentiment] = useState<SentimentPayload | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);

  const [editingPollId, setEditingPollId] = useState<number | null>(null);
  const [editPollQuestion, setEditPollQuestion] = useState("");
  const [editPollDeadlineStr, setEditPollDeadlineStr] = useState("");
  const [pollActionLoading, setPollActionLoading] = useState<number | null>(null);

  const userMap = useMemo(() => {
    const map = new Map<string, number>();
    if (thread) map.set(thread.author.username, thread.author.id);
    for (const post of posts) {
      map.set(post.author.username, post.author.id);
      for (const reply of post.replies || []) {
        map.set(reply.author.username, reply.author.id);
      }
    }
    return map;
  }, [posts, thread]);

  const pollMap = useMemo(() => {
    const map = new Map<number, string>();
    if (thread?.polls) {
      for (const poll of thread.polls) {
        map.set(poll.id, poll.question);
      }
    }
    return map;
  }, [thread]);

  const sortedPosts = useMemo(() => {
    let filtered = [...posts];

    // Poll-specific filter
    if (filterPollId) {
      const pollQuestion = pollMap.get(filterPollId);
      filtered = filtered.filter((p) =>
        p.content.includes(`[Poll#${filterPollId}]`) ||
        (pollQuestion && p.content.includes(`[Poll: "${pollQuestion}"]`)) ||
        p.content.includes(`[Poll#${filterPollId}:`)
      );
    } else if (pollRepliesOnly) {
      filtered = filtered.filter((p) => /\[Poll(#\d+)?(: "[^"]*")?\]/.test(p.content));
    }

    // Search
    if (postSearch.trim()) {
      const q = postSearch.toLowerCase();
      filtered = filtered.filter((p) => {
        if (p.content.toLowerCase().includes(q)) return true;
        if (p.author.username.toLowerCase().includes(q)) return true;
        // Check replies
        if (p.replies?.some((r) => r.content.toLowerCase().includes(q) || r.author.username.toLowerCase().includes(q))) return true;
        // Check if post references a poll whose question matches
        const pollIdMatch = p.content.match(/\[Poll#(\d+)\]/);
        if (pollIdMatch) {
          const question = pollMap.get(parseInt(pollIdMatch[1]));
          if (question && question.toLowerCase().includes(q)) return true;
        }
        return false;
      });
    }
    switch (sortBy) {
      case "oldest":
        filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "newest":
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "likes":
        filtered.sort((a, b) => (b._count?.likes ?? 0) - (a._count?.likes ?? 0));
        break;
      case "replies":
        filtered.sort((a, b) => (b._count?.replies ?? 0) - (a._count?.replies ?? 0));
        break;
    }
    return filtered;
  }, [posts, sortBy, pollRepliesOnly, filterPollId, postSearch]);

  useEffect(() => {
    async function load() {
      const [threadRes, postsRes] = await Promise.all([
        api.get<{ thread: ThreadDetail }>(`/threads/${id}`),
        api.get<{ data: Post[]; pagination: { totalPages: number } }>(`/threads/${id}/posts?limit=10&page=1`),
      ]);

      if (threadRes.error) {
        setError(threadRes.error);
      } else if (threadRes.data) {
        setThread(threadRes.data.thread);
        // Restore user's poll votes
        const votes: Record<number, number> = {};
        threadRes.data.thread.polls?.forEach((poll: { id: number; userVote?: number | null }) => {
          if (poll.userVote) votes[poll.id] = poll.userVote;
        });
        if (Object.keys(votes).length > 0) setVotedPolls(votes);
      }

      if (postsRes.data?.data) {
        setPosts(postsRes.data.data);
        setHasMorePosts((postsRes.data.pagination?.totalPages ?? 1) > 1);
      }
      setLoading(false);

      // Fetch thread like status
      const likeRes = await api.get<{ liked: boolean; likeCount: number }>(`/threads/${id}/like`);
      if (likeRes.data) {
        setThreadLiked(likeRes.data.liked);
        setThreadLikeCount(likeRes.data.likeCount);
      }
    }
    if (!authLoading) load();
  }, [id, authLoading]);

  useEffect(() => {
    if (!thread || thread.type !== "MATCH" || !thread.match) {
      setSentiment(null);
      return;
    }
    let cancelled = false;
    async function loadSentiment() {
      setSentimentLoading(true);
      const { data, error: err } = await api.get<SentimentPayload>(`/threads/${id}/sentiment`, {
        skipAuth: true,
      });
      if (!cancelled) {
        setSentimentLoading(false);
        if (!err && data) setSentiment(data);
      }
    }
    loadSentiment();
    return () => {
      cancelled = true;
    };
  }, [id, thread?.type, thread?.match?.id]);

  const isMatchThreadClosed = () => {
    if (!thread?.match) return false;
    const matchDate = new Date(thread.match.utcDate);
    const now = new Date();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    return Math.abs(now.getTime() - matchDate.getTime()) > twoWeeks;
  };

  const handlePost = async () => {
    const text = replyingTo ? replyText : newPost;
    if (!text.trim()) return;
    setPosting(true);
    const content = discussingPoll ? `[Poll#${discussingPoll.id}] ${text}` : text;
    const body: { content: string; parentId?: number } = { content };
    if (replyingTo) body.parentId = replyingTo.id;
    const { data, error: err } = await api.post<{ post: Post }>(`/threads/${id}/posts`, body);
    setPosting(false);

    if (err) {
      setError(err);
    } else if (data) {
      if (replyingTo) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === replyingTo.id
              ? { ...p, replies: [...(p.replies || []), data.post], _count: { ...p._count, replies: (p._count?.replies ?? 0) + 1 } }
              : p
          )
        );
      } else {
        setPosts((prev) => [...prev, data.post]);
      }
      if (replyingTo) {
        setReplyText("");
      } else {
        setNewPost("");
      }
      setReplyingTo(null);
      setDiscussingPoll(null);
      void refreshUser().finally(() => {
        notifyActivityChanged();
      });
    }
  };

  const handleEditPost = async (postId: number) => {
    if (!editContent.trim()) return;
    // Preserve poll tag if original post had one
    const originalPost = posts.find((p) => p.id === postId) || posts.flatMap((p) => p.replies || []).find((r) => r.id === postId);
    const pollTag = originalPost?.content.match(/^(\[Poll#\d+\]\s*)/)?.[1] || "";
    const { data, error: err } = await api.put<{ post: Post }>(`/posts/${postId}`, {
      content: pollTag + editContent,
    });

    if (err) {
      addToast(err, "error");
    } else if (data?.post) {
      const content = data.post.content;
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id === postId) return { ...p, content };
          if (p.replies?.some((r) => r.id === postId)) {
            return {
              ...p,
              replies: p.replies.map((r) => (r.id === postId ? { ...r, content } : r)),
            };
          }
          return p;
        })
      );
      setEditingPostId(null);
      addToast("Post updated", "success");
    }
  };

  const handleDeletePost = async (postId: number) => {
    const { error: err } = await api.delete(`/posts/${postId}`);
    if (err) {
      addToast(err, "error");
    } else {
      setPosts((prev) =>
        prev
          .filter((p) => p.id !== postId)
          .map((p) => {
            const hadReply = p.replies?.some((r) => r.id === postId);
            return {
              ...p,
              replies: p.replies?.filter((r) => r.id !== postId),
              _count: hadReply ? { ...p._count, replies: Math.max(0, (p._count?.replies ?? 0) - 1) } : p._count,
            };
          })
      );
      addToast("Post deleted", "success");
    }
  };

  const handleSavePoll = async (pollId: number) => {
    if (!editPollQuestion.trim()) {
      addToast("Question is required", "error");
      return;
    }
    if (!editPollDeadlineStr) {
      addToast("Deadline is required", "error");
      return;
    }
    setPollActionLoading(pollId);
    const { data, error: err } = await api.put<{ poll: Poll }>(`/polls/${pollId}`, {
      question: editPollQuestion.trim(),
      deadline: new Date(editPollDeadlineStr).toISOString(),
    });
    setPollActionLoading(null);
    if (err) {
      addToast(err, "error");
    } else if (data?.poll) {
      setThread((prev) =>
        prev
          ? {
              ...prev,
              polls: (prev.polls || []).map((p) =>
                p.id === pollId
                  ? {
                      ...p,
                      question: data.poll.question,
                      deadline: data.poll.deadline,
                    }
                  : p
              ),
            }
          : prev
      );
      setEditingPollId(null);
      addToast("Poll updated", "success");
    }
  };

  const handleDeletePoll = async (pollId: number) => {
    setPollActionLoading(pollId);
    const { error: err } = await api.delete(`/polls/${pollId}`);
    setPollActionLoading(null);
    if (err) {
      addToast(err, "error");
    } else {
      setThread((prev) =>
        prev ? { ...prev, polls: (prev.polls || []).filter((p) => p.id !== pollId) } : prev
      );
      addToast("Poll deleted", "success");
    }
  };

  const handleEditThread = async () => {
    if (!editThreadTitle.trim() || !editThreadContent.trim()) return;
    const { data, error: err } = await api.put<{ thread: ThreadDetail }>(`/threads/${id}`, {
      title: editThreadTitle,
      content: editThreadContent,
      tags: [...new Set(editThreadTags)],
    });

    if (err) {
      addToast(err, "error");
    } else if (data?.thread) {
      setThread((prev) => prev ? { ...prev, title: data.thread.title, content: data.thread.content, tags: data.thread.tags } : prev);
      setEditingThread(false);
      addToast("Thread updated", "success");
    }
  };

  const handleDeleteThread = async () => {
    const { error: err } = await api.delete(`/threads/${id}`);
    if (err) {
      addToast(err, "error");
    } else {
      addToast("Thread deleted", "success");
      router.push("/threads");
    }
  };

  const handleVote = async (pollId: number, optionId: number) => {
    const { error: err } = await api.post(`/polls/${pollId}/vote`, { optionId });
    if (err) {
      addToast(err, "error");
    } else {
      setVotedPolls((prev) => ({ ...prev, [pollId]: optionId }));
      // Refresh thread to get updated vote counts
      const { data } = await api.get<{ thread: ThreadDetail }>(`/threads/${id}`, { skipAuth: true });
      if (data?.thread) setThread(data.thread);
      addToast("Vote recorded", "success");
    }
  };

  const openConfirm = (description: string, action: () => void) => {
    setConfirmDescription(description);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const openReport = (target: { threadId?: number; postId?: number; pollId?: number }) => {
    setReportTarget(target);
    setReportOpen(true);
  };

  // Translate thread content
  const handleTranslateThread = async () => {
    if (threadTranslation !== null) {
      setThreadTranslation(null);
      return;
    }
    setThreadTranslating(true);
    const { data, error: err } = await api.post<{ original: string; translated: string; cached: boolean }>(
      "/ai/translate",
      { text: thread?.content }
    );
    setThreadTranslating(false);
    if (err) {
      addToast(err, "error");
    } else if (data) {
      setThreadTranslation(data.translated);
    }
  };

  // Like/unlike a post
  const handleThreadLike = async () => {
    setThreadLikeLoading(true);
    const { data } = await api.post<{ liked: boolean; likeCount: number }>(`/threads/${id}/like`);
    if (data) {
      setThreadLiked(data.liked);
      setThreadLikeCount(data.likeCount);
    }
    setThreadLikeLoading(false);
  };

  const handleLike = async (postId: number) => {
    setLikeLoading((prev) => ({ ...prev, [postId]: true }));
    const { data, error: err } = await api.post<{ liked: boolean; likeCount: number }>(`/posts/${postId}/like`);
    if (err) {
      addToast(err, "error");
    } else if (data) {
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id === postId) {
            return { ...p, liked: data.liked, _count: { ...p._count, likes: data.likeCount } } as Post;
          }
          if (p.replies) {
            return {
              ...p,
              replies: p.replies.map((r) =>
                r.id === postId ? { ...r, liked: data.liked, _count: { ...r._count, likes: data.likeCount } } as Post : r
              ),
            };
          }
          return p;
        })
      );
    }
    setLikeLoading((prev) => ({ ...prev, [postId]: false }));
  };

  // Translate a post
  const handleTranslatePost = async (postId: number, content: string) => {
    if (postTranslations[postId] !== undefined) {
      setPostTranslations((prev) => {
        const next = { ...prev };
        delete next[postId];
        return next;
      });
      return;
    }
    setPostTranslating((prev) => ({ ...prev, [postId]: true }));
    const { data, error: err } = await api.post<{ original: string; translated: string; cached: boolean }>(
      "/ai/translate",
      { text: content }
    );
    setPostTranslating((prev) => ({ ...prev, [postId]: false }));
    if (err) {
      addToast(err, "error");
    } else if (data) {
      setPostTranslations((prev) => ({ ...prev, [postId]: data.translated }));
    }
  };

  // Load post edit history
  const handleShowHistory = async (postId: number) => {
    if (historyPostId === postId) {
      setHistoryPostId(null);
      return;
    }
    setHistoryPostId(postId);
    setHistoryLimit(5);
    setHistoryLoading(true);
    const { data, error: err } = await api.get<{ versions: PostVersion[] }>(`/posts/${postId}/versions`);
    setHistoryLoading(false);
    if (err) {
      addToast(err, "error");
      setHistoryPostId(null);
    } else if (data) {
      setHistoryVersions(data.versions);
    }
  };

  // Create poll
  const handleCreatePoll = async () => {
    const filledOptions = pollOptions.filter((o) => o.trim());
    if (!pollQuestion.trim()) {
      addToast("Question is required", "error");
      return;
    }
    if (filledOptions.length < 2) {
      addToast("At least 2 options are required", "error");
      return;
    }
    if (!pollDeadline) {
      addToast("Deadline is required", "error");
      return;
    }
    if (new Date(pollDeadline) <= new Date()) {
      addToast("Deadline must be in the future", "error");
      return;
    }

    setPollSubmitting(true);
    const { data, error: err } = await api.post<{ poll: Poll }>(`/threads/${id}/polls`, {
      question: pollQuestion,
      options: filledOptions,
      deadline: pollDeadline,
    });
    setPollSubmitting(false);

    if (err) {
      addToast(err, "error");
    } else if (data?.poll) {
      setThread((prev) =>
        prev ? { ...prev, polls: [...(prev.polls || []), data.poll] } : prev
      );
      setShowPollForm(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollDeadline("");
      addToast("Poll created", "success");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <ErrorMessage message={error || "Thread not found"} />
        <button
          onClick={() => router.push("/threads")}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-700"
        >
          Back to threads
        </button>
      </div>
    );
  }

  const isBanned = user?.isBanned;
  const isOwner = user && thread.author.id === user.id;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Thread header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/threads")}
          className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-3 inline-block"
        >
          &larr; Back to threads
        </button>

        {editingThread ? (
          <div className="space-y-3">
            <input
              type="text"
              value={editThreadTitle}
              onChange={(e) => setEditThreadTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg font-bold"
            />
            <textarea
              value={editThreadContent}
              onChange={(e) => setEditThreadContent(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
            />
            {/* Tags */}
            <div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editThreadTags.map((tag, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded-full">
                    {tag}
                    <button onClick={() => setEditThreadTags((prev) => prev.filter((_, j) => j !== i))} className="text-indigo-400 hover:text-indigo-600">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editTagInput}
                  onChange={(e) => setEditTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const tag = editTagInput.trim().toLowerCase();
                      if (tag && !editThreadTags.includes(tag)) setEditThreadTags((prev) => [...prev, tag]);
                      setEditTagInput("");
                    }
                  }}
                  placeholder="Add tag + Enter"
                  className="flex-1 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleEditThread}
                className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
              >
                Save
              </button>
              <button
                onClick={() => setEditingThread(false)}
                className="px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
            {/* Team badge */}
            {thread.team && (
              <div className="flex items-center gap-2.5 mb-4 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-700/50 w-fit">
                {thread.team.crest && (
                  <img src={thread.team.crest} alt="" className="h-6 w-6 object-contain" />
                )}
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{thread.team.shortName || thread.team.name}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 font-medium">Team</span>
              </div>
            )}

            {/* Title */}
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-3 break-words">
              {thread.title}
            </h1>

            {/* Author row */}
            <div className="flex items-center gap-2 mb-4">
              {thread.author.avatar ? (
                <img src={thread.author.avatar} alt="" className="h-7 w-7 rounded-full object-cover" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-300">
                  {thread.author.username.charAt(0).toUpperCase()}
                </div>
              )}
              <Link href={`/users/${thread.author.id}`} className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 transition-colors">
                {thread.author.username}
              </Link>
              <span className="text-xs text-zinc-400">
                {new Date(thread.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">{thread.type}</span>
            </div>

            {/* Content */}
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">{thread.content}</p>
            {threadTranslation !== null && (
              <div className="mt-3 p-3 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                <p className="text-sm text-indigo-900 dark:text-indigo-200">{threadTranslation}</p>
              </div>
            )}

            {/* Tags */}
            {thread.tags && thread.tags.length > 0 && (
              <div className="flex gap-2 mt-4">
                {thread.tags.map((tag) => (
                  <span key={tag.id} className="px-2 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-full">
                    {tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Match fixture */}
            {thread.match && (
              <Link href={`/matches/${thread.match.id}`} className="mt-4 flex items-center gap-3 px-3 py-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-700/50 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors w-fit">
                <div className="flex items-center gap-2">
                  {thread.match.homeTeam.crest && <img src={thread.match.homeTeam.crest} alt="" className="h-5 w-5 object-contain" />}
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{thread.match.homeTeam.shortName}</span>
                </div>
                <span className="text-xs text-zinc-400">vs</span>
                <div className="flex items-center gap-2">
                  {thread.match.awayTeam.crest && <img src={thread.match.awayTeam.crest} alt="" className="h-5 w-5 object-contain" />}
                  <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{thread.match.awayTeam.shortName}</span>
                </div>
                <span className="text-[10px] text-zinc-400 ml-1">
                  {new Date(thread.match.utcDate).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </Link>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-1 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-700/50">
              {/* Like */}
              <button
                onClick={isAuthenticated && !isBanned ? handleThreadLike : undefined}
                disabled={threadLikeLoading || !isAuthenticated}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  threadLiked
                    ? "text-red-500 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50"
                    : "text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill={threadLiked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                {threadLikeCount > 0 && <span>{threadLikeCount}</span>}
              </button>

              <button
                onClick={handleTranslateThread}
                disabled={threadTranslating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                </svg>
                {threadTranslation !== null ? "Original" : "Translate"}
              </button>
              <div className="flex-1" />
              {isAuthenticated && !isBanned && (
                <>
                  {isOwner && (
                    <>
                      <button
                        onClick={() => { setEditingThread(true); setEditThreadTitle(thread.title); setEditThreadContent(thread.content); setEditThreadTags(thread.tags?.map(t => t.name) || []); }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                        title="Edit thread"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openConfirm("This will permanently delete this thread and all its posts.", handleDeleteThread)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                        title="Delete thread"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => openReport({ threadId: thread.id })}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                    title="Report thread"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {thread.type === "MATCH" && thread.match && (
        <div className="mb-6 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-gradient-to-r from-indigo-50/80 to-purple-50/50 dark:from-indigo-950/40 dark:to-zinc-900/60">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
            Fan sentiment (AI)
          </h3>
          {sentimentLoading ? (
            <div className="flex justify-center py-4">
              <LoadingSpinner size="sm" />
            </div>
          ) : sentiment ? (
            <div className="space-y-3">
              {/* Overall */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                  sentiment.overall.label === "positive" ? "bg-green-100 dark:bg-green-900/40" :
                  sentiment.overall.label === "negative" ? "bg-red-100 dark:bg-red-900/40" :
                  "bg-amber-100 dark:bg-amber-900/40"
                }`}>
                  {sentiment.overall.label === "positive" ? "😊" : sentiment.overall.label === "negative" ? "😠" : "😐"}
                </div>
                <div>
                  <span className={`text-sm font-semibold capitalize ${
                    sentiment.overall.label === "positive" ? "text-green-700 dark:text-green-400" :
                    sentiment.overall.label === "negative" ? "text-red-700 dark:text-red-400" :
                    "text-amber-700 dark:text-amber-400"
                  }`}>
                    {sentiment.overall.label}
                  </span>
                  <span className="text-xs text-zinc-400 ml-2">{sentiment.postCount} comment{sentiment.postCount !== 1 ? "s" : ""} analyzed</span>
                </div>
              </div>

              {/* Per-team sentiment */}
              {(sentiment.homeTeam || sentiment.awayTeam) && (
                <div className="grid grid-cols-2 gap-2">
                  {[sentiment.homeTeam, sentiment.awayTeam].filter(Boolean).map((team) => {
                    const crest = team!.teamName === thread.match?.homeTeam.shortName ? thread.match?.homeTeam.crest :
                                  team!.teamName === thread.match?.awayTeam.shortName ? thread.match?.awayTeam.crest : null;
                    const sentimentColor = team!.label === "positive" ? "border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20" :
                                           team!.label === "negative" ? "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" :
                                           "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20";
                    const textColor = team!.label === "positive" ? "text-green-700 dark:text-green-400" :
                                      team!.label === "negative" ? "text-red-700 dark:text-red-400" :
                                      "text-amber-700 dark:text-amber-400";
                    return (
                      <div key={team!.teamName} className={`rounded-lg border p-3 ${sentimentColor}`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          {crest && <img src={crest} alt="" className="h-5 w-5 object-contain" />}
                          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">{team!.teamName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold capitalize ${textColor}`}>{team!.label}</span>
                          {team!.fanCount != null && (
                            <span className="text-[10px] text-zinc-400">{team!.fanCount} fan{team!.fanCount !== 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Could not load sentiment.</p>
          )}
        </div>
      )}

      {/* New post form */}
      {isMatchThreadClosed() ? (
        <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">This match thread is closed.</p>
        </div>
      ) : isAuthenticated && !isBanned && (
        <div className="mb-6">
          {error && <ErrorMessage message={error} />}
          {discussingPoll && (
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 text-sm text-indigo-700 dark:text-indigo-300">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                {discussingPoll.question}
                <button onClick={() => setDiscussingPoll(null)} className="ml-1 text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            </div>
          )}
          <textarea
            value={newPost}
            onChange={(e) => { if (e.target.value.length <= 5000) setNewPost(e.target.value); }}
            placeholder={discussingPoll ? "Discuss this poll..." : "Write a comment..."}
            rows={2}
            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
          />
          {newPost.length > 4500 && (
            <p className={`text-[10px] text-right mt-0.5 ${newPost.length > 4900 ? "text-red-500" : "text-zinc-400"}`}>
              {newPost.length}/5000
            </p>
          )}
          <div className="flex items-center justify-between mt-2">
            <div className="flex gap-2">
              {!showPollForm && (
                <button
                  onClick={() => {
                    setShowPollForm(true);
                    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
                    const p = (n: number) => String(n).padStart(2, "0");
                    setPollDeadline(`${tomorrow.getFullYear()}-${p(tomorrow.getMonth() + 1)}-${p(tomorrow.getDate())}T${p(tomorrow.getHours())}:${p(tomorrow.getMinutes())}`);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Create Poll
                </button>
              )}
            </div>
            <button
              onClick={handlePost}
              disabled={posting || !newPost.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
            >
              {posting ? <LoadingSpinner size="sm" /> : "Post"}
            </button>
          </div>
          {showPollForm && (
            <div className="mt-3 p-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create a Poll</h3>
              <input type="text" value={pollQuestion} onChange={(e) => { if (e.target.value.length <= 200) setPollQuestion(e.target.value); }} placeholder="Poll question" maxLength={200} className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              {pollQuestion.length > 150 && <p className={`text-[10px] text-right ${pollQuestion.length > 190 ? "text-red-500" : "text-zinc-400"}`}>{pollQuestion.length}/200</p>}
              <div className="space-y-2">
                {pollOptions.map((opt, idx) => (
                  <input key={idx} type="text" value={opt} onChange={(e) => { if (e.target.value.length <= 100) { const next = [...pollOptions]; next[idx] = e.target.value; setPollOptions(next); } }} placeholder={`Option ${idx + 1}`} maxLength={100} className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
                ))}
                {pollOptions.length < 6 && (
                  <button onClick={() => setPollOptions((prev) => [...prev, ""])} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">+ Add Option</button>
                )}
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Deadline</label>
                <input type="datetime-local" value={pollDeadline} onChange={(e) => setPollDeadline(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" />
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreatePoll} disabled={pollSubmitting} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2">
                  {pollSubmitting ? <LoadingSpinner size="sm" /> : "Create Poll"}
                </button>
                <button onClick={() => { setShowPollForm(false); setPollQuestion(""); setPollOptions(["", ""]); setPollDeadline(""); }} className="px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-zinc-100/80 dark:bg-zinc-800/80 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("replies")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "replies"
              ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          Replies ({posts.length})
          {(filterPollId || pollRepliesOnly || postSearch) && activeTab === "replies" && (
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          )}
        </button>
        {thread.polls && thread.polls.length > 0 && (
          <button
            onClick={() => { setActiveTab("polls"); setFilterPollId(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === "polls"
                ? "bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
            Polls ({thread.polls.length})
          </button>
        )}
      </div>

      {/* Polls Section */}
      {activeTab === "polls" && thread.polls && thread.polls.length > 0 && (
        <div className="mb-6 space-y-4">
          {thread.polls.map((poll) => {
            const totalVotes = poll.options.reduce((sum, o) => sum + o._count.votes, 0);
            const hasVoted = votedPolls[poll.id] !== undefined;
            const isExpired = new Date() > new Date(poll.deadline);
            const pollOwner = user && poll.author.id === user.id;
            const toLocalDatetime = (iso: string) => {
              const d = new Date(iso);
              const p = (n: number) => String(n).padStart(2, "0");
              return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
            };

            return (
              <div
                key={poll.id}
                id={`poll-${poll.id}`}
                className="p-4 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 scroll-mt-24 overflow-hidden"
              >
                <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
                  {editingPollId === poll.id ? (
                    <div className="space-y-2 w-full">
                      <input
                        type="text"
                        value={editPollQuestion}
                        onChange={(e) => setEditPollQuestion(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm"
                      />
                      <input
                        type="datetime-local"
                        value={editPollDeadlineStr}
                        onChange={(e) => setEditPollDeadlineStr(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSavePoll(poll.id)}
                          disabled={pollActionLoading === poll.id}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg disabled:opacity-50"
                        >
                          {pollActionLoading === poll.id ? <LoadingSpinner size="sm" /> : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPollId(null)}
                          className="px-3 py-1.5 text-xs font-medium bg-zinc-100 dark:bg-zinc-700 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1 min-w-0 break-words">
                        {poll.question}
                      </h3>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {pollOwner && isAuthenticated && !isBanned && (
                          <>
                            <button
                              type="button"
                              onClick={() => { setEditingPollId(poll.id); setEditPollQuestion(poll.question); setEditPollDeadlineStr(toLocalDatetime(poll.deadline)); }}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                              title="Edit poll"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => openConfirm("Delete this poll permanently?", () => handleDeletePoll(poll.id))}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                              title="Delete poll"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </>
                        )}
                        {isAuthenticated && !isBanned && (
                          <button
                            type="button"
                            onClick={() => openReport({ pollId: poll.id })}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                            title="Report poll"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {editingPollId !== poll.id && (
                  <>
                    <div className="space-y-2">
                      {(() => {
                        const maxVotes = Math.max(...poll.options.map((o) => o._count.votes));
                        return poll.options.map((option) => {
                          const pct = totalVotes > 0 ? Math.round((option._count.votes / totalVotes) * 100) : 0;
                          const isSelected = votedPolls[poll.id] === option.id;
                          const isWinning = isExpired && totalVotes > 0 && option._count.votes === maxVotes;

                          return (
                            <div key={option.id}>
                              {hasVoted || isExpired || !isAuthenticated || isBanned ? (
                                <div className="relative">
                                  <p className={`text-sm mb-1 break-words ${isWinning ? "text-green-700 dark:text-green-400" : "text-zinc-700 dark:text-zinc-300"} ${isSelected ? "font-semibold" : ""}`}>
                                    {option.text} {isWinning && totalVotes > 0 && "✓"}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full transition-all ${isWinning ? "bg-green-500" : "bg-indigo-500"}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className={`text-xs flex-shrink-0 w-8 text-right ${isWinning ? "text-green-600 dark:text-green-400 font-semibold" : "text-zinc-500"}`}>{pct}%</span>
                                  </div>
                                </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleVote(poll.id, option.id)}
                                className="w-full text-left px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-600 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors text-zinc-700 dark:text-zinc-300 break-words"
                              >
                                {option.text}
                              </button>
                            )}
                          </div>
                          );
                        });
                      })()}
                    </div>

                    <div className="flex items-center justify-between text-xs mt-3">
                      <span className="text-zinc-400">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</span>
                      <div className="flex items-center gap-3">
                        <PollDeadline deadline={poll.deadline} />
                        <button
                          onClick={() => {
                            setActiveTab("replies");
                            setFilterPollId(poll.id);
                            setPollRepliesOnly(false);
                            if (isAuthenticated && !isBanned) {
                              setDiscussingPoll({ id: poll.id, question: poll.question });
                              setTimeout(() => document.querySelector<HTMLTextAreaElement>("textarea[placeholder]")?.focus(), 100);
                            }
                          }}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                          </svg>
                          Discuss ({posts.filter((p) => p.content.includes(`[Poll#${poll.id}]`) || p.content.includes(`[Poll: "${poll.question}"]`)).length})
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Replies Section */}
      {activeTab === "replies" && (
      <div className="mb-6">

      {/* Active filter chips */}
      {(filterPollId || pollRepliesOnly) && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {filterPollId && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
              Showing: {pollMap.get(filterPollId) || `Poll #${filterPollId}`}
              <button onClick={() => setFilterPollId(null)} className="ml-1 text-indigo-400 hover:text-indigo-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          )}
          {pollRepliesOnly && !filterPollId && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-700 dark:text-indigo-300">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
              All poll discussions
              <button onClick={() => setPollRepliesOnly(false)} className="ml-1 text-indigo-400 hover:text-indigo-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          )}
        </div>
      )}

      {/* Sort & Filter controls */}
      {posts.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[150px]">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={postSearch}
              onChange={(e) => setPostSearch(e.target.value)}
              placeholder="Search posts..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="likes">Most liked</option>
            <option value="replies">Most replies</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={pollRepliesOnly}
              onChange={(e) => setPollRepliesOnly(e.target.checked)}
              className="rounded border-zinc-300 dark:border-zinc-600 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
            />
            Poll discussions only
          </label>
        </div>
      )}

      {sortedPosts.length === 0 ? (
        <p className="text-sm text-zinc-500 mb-6">{postSearch || filterPollId || pollRepliesOnly ? "No results match your filters." : "No posts yet. Be the first to reply!"}</p>
      ) : (
        <div className="space-y-4 mb-6">
          {sortedPosts.map((post) => {
            const isPollPost = /\[Poll(#\d+)?(: "[^"]*")?\]/.test(post.content);
            return (
            <div
              key={post.id}
              className={`p-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 ${isPollPost ? "border-l-3 border-l-indigo-400 dark:border-l-indigo-600" : ""}`}
            >
              <div className="flex items-center gap-2 mb-2">
                {post.author.avatar ? (
                  <img src={post.author.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-300">
                    {post.author.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <Link
                  href={`/users/${post.author.id}`}
                  className="text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:text-indigo-600 transition-colors"
                >
                  {post.author.username}
                </Link>
                <span className="text-xs text-zinc-400">
                  {new Date(post.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {editingPostId === post.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditPost(post.id)}
                      className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingPostId(null)}
                      className="px-3 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 break-words">{renderMentions(post.content, userMap, (pollId) => {
                    setActiveTab("polls");
                    setTimeout(() => {
                      const el = document.getElementById(`poll-${pollId}`);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("ring-2", "ring-indigo-500", "transition-shadow");
                        setTimeout(() => el.classList.remove("ring-2", "ring-indigo-500"), 2000);
                      }
                    }, 150);
                  }, pollMap)}</p>
                  {postTranslations[post.id] !== undefined && (
                    <div className="mt-2 p-3 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                      <p className="text-sm text-indigo-900 dark:text-indigo-200">{postTranslations[post.id]}</p>
                    </div>
                  )}
                </>
              )}

              {/* Post action bar */}
              {editingPostId !== post.id && (
                <div className="mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-700/50 flex flex-wrap items-center gap-1">
                  {/* Like */}
                  <button
                    onClick={isAuthenticated && !isBanned ? () => handleLike(post.id) : undefined}
                    disabled={likeLoading[post.id] || !isAuthenticated}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      post.liked
                        ? "text-red-500 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50"
                        : "text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={post.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                    {(post._count?.likes ?? 0) > 0 && <span>{post._count?.likes}</span>}
                  </button>

                  {/* Reply */}
                  {isAuthenticated && !isBanned && !isMatchThreadClosed() && (
                    <button
                      onClick={() => {
                        setReplyingTo({ id: post.id, username: post.author.username, showUnder: post.id }); setDiscussingPoll(null);
                        setReplyText(`@${post.author.username} `);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                      </svg>
                      Reply {(post._count?.replies ?? 0) > 0 && <span className="text-zinc-300 dark:text-zinc-600">{post._count?.replies}</span>}
                    </button>
                  )}

                  {/* Translate */}
                  <button
                    onClick={() => handleTranslatePost(post.id, post.content)}
                    disabled={postTranslating[post.id]}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802" />
                    </svg>
                    {postTranslations[post.id] !== undefined ? "Original" : "Translate"}
                  </button>

                  <div className="flex-1 basis-full xs:basis-0 min-[480px]:basis-0" />

                  {/* Owner actions */}
                  {isAuthenticated && !isBanned && user && post.author.id === user.id && (
                    <>
                      <button
                        onClick={() => { setEditingPostId(post.id); setEditContent(post.content.replace(/^\[Poll#\d+\]\s*/, "")); }}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                      <button
                        onClick={() => openConfirm("This will permanently delete this post.", () => handleDeletePost(post.id))}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  )}

                  {/* Report flag */}
                  {isAuthenticated && !isBanned && (
                    <button
                      onClick={() => openReport({ postId: post.id })}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                      title="Report"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                      </svg>
                    </button>
                  )}

                  {/* History */}
                  <button
                    onClick={() => handleShowHistory(post.id)}
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                    title="Edit history"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                </div>
              )}

              {/* Post edit history */}
              {historyPostId === post.id && (
                <div className="mt-3 p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Edit History</h4>
                    <button
                      onClick={() => setHistoryPostId(null)}
                      className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      Close
                    </button>
                  </div>
                  {historyLoading ? (
                    <div className="flex justify-center py-2">
                      <LoadingSpinner size="sm" />
                    </div>
                  ) : historyVersions.length === 0 ? (
                    <p className="text-xs text-zinc-500">No previous versions.</p>
                  ) : (() => {
                    const sorted = [...historyVersions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    return (
                      <div className="space-y-2">
                        {sorted.slice(0, historyLimit).map((version) => (
                          <div key={version.id} className="p-2 bg-white dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700">
                            <p className="text-xs text-zinc-400 mb-1">
                              {new Date(version.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">{version.content}</p>
                          </div>
                        ))}
                        {sorted.length > historyLimit && (
                          <button onClick={() => setHistoryLimit((l) => l + 5)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">
                            Show more ({sorted.length - historyLimit} older)
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Inline reply box — under top-level post */}
              {replyingTo?.showUnder === post.id && (
                <div className="mt-3 ml-6 pl-4 border-l-2 border-indigo-300 dark:border-indigo-700">
                  <div className="flex items-center gap-2 mb-2 text-xs text-indigo-600 dark:text-indigo-400">
                    <span>Replying to <strong>@{replyingTo.username}</strong></span>
                  </div>
                  <textarea ref={(el) => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; } }} value={replyText} onChange={(e) => { if (e.target.value.length <= 5000) setReplyText(e.target.value); }} placeholder={`Reply to @${replyingTo.username}...`} rows={2} className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none" />
                  <div className="flex justify-end gap-2 mt-1.5">
                    <button onClick={() => { setReplyingTo(null); setReplyText(""); }} className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg">Cancel</button>
                    <button onClick={handlePost} disabled={posting || !replyText.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5">
                      {posting ? <LoadingSpinner size="sm" /> : "Reply"}
                    </button>
                  </div>
                </div>
              )}

              {/* Nested replies */}
              {post.replies && post.replies.length > 0 && (
                <div className="mt-3 ml-6 space-y-3 border-l-2 border-zinc-200 dark:border-zinc-700 pl-4">
                  {post.replies.slice(0, expandedReplies[post.id] || 5).map((reply) => (
                    <div key={reply.id}>
                      <div className="flex items-center gap-2 mb-1">
                        {reply.author.avatar ? (
                          <img src={reply.author.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-500 dark:text-zinc-400">
                            {reply.author.username.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <Link
                          href={`/users/${reply.author.id}`}
                          className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-indigo-600 transition-colors"
                        >
                          {reply.author.username}
                        </Link>
                        <span className="text-xs text-zinc-400">
                          {new Date(reply.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleTranslatePost(reply.id, reply.content)}
                          disabled={postTranslating[reply.id]}
                          className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 font-medium flex items-center gap-1"
                        >
                          {postTranslating[reply.id] && <LoadingSpinner size="sm" />}
                          {postTranslations[reply.id] !== undefined ? "Original" : "Translate"}
                        </button>
                      </div>
                      {editingPostId === reply.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-sm resize-none"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditPost(reply.id)}
                              className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded-lg"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPostId(null)}
                              className="px-3 py-1 text-xs font-medium bg-zinc-100 dark:bg-zinc-700 rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">{renderMentions(reply.content, userMap, (pollId) => {
                            setActiveTab("polls");
                            setTimeout(() => {
                              const el = document.getElementById(`poll-${pollId}`);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                                el.classList.add("ring-2", "ring-indigo-500", "transition-shadow");
                                setTimeout(() => el.classList.remove("ring-2", "ring-indigo-500"), 2000);
                              }
                            }, 150);
                          }, pollMap)}</p>
                          {postTranslations[reply.id] !== undefined && (
                            <div className="mt-1 p-2 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-lg">
                              <p className="text-xs text-indigo-900 dark:text-indigo-200">{postTranslations[reply.id]}</p>
                            </div>
                          )}
                        </>
                      )}
                      {editingPostId !== reply.id && (
                        <div className="mt-2 flex flex-wrap items-center gap-0.5">
                          {/* Like */}
                          <button
                            onClick={isAuthenticated && !isBanned ? () => handleLike(reply.id) : undefined}
                            disabled={likeLoading[reply.id] || !isAuthenticated}
                            className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                              reply.liked ? "text-red-500 bg-red-50 dark:bg-red-950/30" : "text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                            }`}
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={reply.liked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                            </svg>
                            {(reply._count?.likes ?? 0) > 0 && <span>{reply._count?.likes}</span>}
                          </button>
                          {/* Reply */}
                          {isAuthenticated && !isBanned && !isMatchThreadClosed() && (
                            <button
                              onClick={() => { setReplyingTo({ id: post.id, username: reply.author.username, showUnder: reply.id }); setReplyText(`@${reply.author.username} `); setDiscussingPoll(null); }}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
                              </svg>
                              Reply
                            </button>
                          )}

                          <div className="flex-1 basis-full xs:basis-0 min-[480px]:basis-0" />

                          {/* Edit/Delete */}
                          {isAuthenticated && !isBanned && user && reply.author.id === user.id && (
                            <>
                              <button onClick={() => { setEditingPostId(reply.id); setEditContent(reply.content.replace(/^\[Poll#\d+\]\s*/, "")); }} className="p-1 rounded text-zinc-400 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors" title="Edit">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                                </svg>
                              </button>
                              <button onClick={() => openConfirm("This will permanently delete this reply.", () => handleDeletePost(reply.id))} className="p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors" title="Delete">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                </svg>
                              </button>
                            </>
                          )}
                          {/* Report */}
                          {isAuthenticated && !isBanned && (
                            <button onClick={() => openReport({ postId: reply.id })} className="p-1 rounded text-zinc-400 hover:text-amber-500 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors" title="Report">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
                              </svg>
                            </button>
                          )}
                          {/* History */}
                          <button onClick={() => handleShowHistory(reply.id)} className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors" title="Edit history">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {historyPostId === reply.id && (
                        <div className="mt-2 p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Edit History</h4>
                            <button
                              type="button"
                              onClick={() => setHistoryPostId(null)}
                              className="text-xs text-zinc-400 hover:text-zinc-600"
                            >
                              Close
                            </button>
                          </div>
                          {historyLoading ? (
                            <LoadingSpinner size="sm" />
                          ) : historyVersions.length === 0 ? (
                            <p className="text-xs text-zinc-500">No previous versions.</p>
                          ) : (
                            (() => {
                              const sorted = [...historyVersions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                              return (
                                <div className="space-y-2">
                                  {sorted.slice(0, historyLimit).map((version) => (
                                    <div key={version.id} className="p-2 bg-white dark:bg-zinc-800 rounded border text-xs">
                                      <p className="text-zinc-400 mb-1">
                                        {new Date(version.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                      </p>
                                      <p className="text-zinc-600 dark:text-zinc-400">{version.content}</p>
                                    </div>
                                  ))}
                                  {sorted.length > historyLimit && (
                                    <button onClick={() => setHistoryLimit((l) => l + 5)} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700">
                                      Show more ({sorted.length - historyLimit} older)
                                    </button>
                                  )}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      )}
                      {/* Inline reply box — under specific reply */}
                      {replyingTo?.showUnder === reply.id && (
                        <div className="mt-2 pl-4 border-l-2 border-indigo-300 dark:border-indigo-700">
                          <div className="flex items-center gap-2 mb-1.5 text-xs text-indigo-600 dark:text-indigo-400">
                            <span>Replying to <strong>@{replyingTo.username}</strong></span>
                          </div>
                          <textarea ref={(el) => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = el.value.length; } }} value={replyText} onChange={(e) => { if (e.target.value.length <= 5000) setReplyText(e.target.value); }} placeholder={`Reply to @${replyingTo.username}...`} rows={2} className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none" />
                          <div className="flex justify-end gap-2 mt-1.5">
                            <button onClick={() => { setReplyingTo(null); setReplyText(""); }} className="px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg">Cancel</button>
                            <button onClick={handlePost} disabled={posting || !replyText.trim()} className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5">
                              {posting ? <LoadingSpinner size="sm" /> : "Reply"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {post.replies.length > (expandedReplies[post.id] || 5) && (
                    <button
                      onClick={() => setExpandedReplies((prev) => ({ ...prev, [post.id]: (prev[post.id] || 5) + 5 }))}
                      className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 mt-2"
                    >
                      Show more replies ({post.replies.length - (expandedReplies[post.id] || 5)} remaining)
                    </button>
                  )}
                </div>
              )}
            </div>
          );})}
          {hasMorePosts && (
            <div ref={loadMoreRef} className="flex justify-center py-6">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>
      )}

      </div>
      )}


      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (confirmAction) confirmAction();
        }}
        description={confirmDescription}
        confirmText="Delete"
        confirmColor="red"
      />

      {/* Report Modal */}
      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        threadId={reportTarget.threadId}
        postId={reportTarget.postId}
        pollId={reportTarget.pollId}
      />
    </div>
  );
}
