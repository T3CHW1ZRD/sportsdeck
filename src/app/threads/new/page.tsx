"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorMessage from "@/components/ErrorMessage";
import LoadingSpinner from "@/components/LoadingSpinner";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { notifyActivityChanged } from "@/lib/activityEvents";

interface Team {
  id: number;
  name: string;
  shortName: string;
  crest: string;
}

interface Match {
  id: number;
  matchday: number;
  utcDate: string;
  status: string;
  homeTeam: { id: number; name: string; shortName: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; crest: string };
  homeScore: number | null;
  awayScore: number | null;
}

export default function NewThreadPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><LoadingSpinner /></div>}>
      <NewThreadContent />
    </Suspense>
  );
}

function NewThreadContent() {
  const router = useRouter();
  const urlParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("GENERAL");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [tagsInput, setTagsInput] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadData() {
      const [teamsRes, matchesRes] = await Promise.all([
        api.get<{ data: Team[] }>("/teams?limit=50", { skipAuth: true }),
        api.get<{ data: Match[] }>("/matches?limit=400", { skipAuth: true }),
      ]);
      if (teamsRes.data?.data) setTeams(teamsRes.data.data);
      if (matchesRes.data?.data) {
        const sorted = matchesRes.data.data.sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime());
        setMatches(sorted);
        // Auto-select current matchday
        const now = new Date();
        const upcoming = sorted.find((m) => new Date(m.utcDate) >= now);
        if (upcoming?.matchday) setSelectedMatchday(upcoming.matchday);
        else if (sorted[0]?.matchday) setSelectedMatchday(sorted[0].matchday);
      }

      // Auto-fill from URL params
      const paramType = urlParams.get("type");
      const paramTeamId = urlParams.get("teamId");
      const paramMatchId = urlParams.get("matchId");
      if (paramType) setType(paramType);
      if (paramTeamId) setTeamId(parseInt(paramTeamId));
      if (paramMatchId) {
        const mid = parseInt(paramMatchId);
        setMatchId(mid);
        if (matchesRes.data?.data) {
          const m = matchesRes.data.data.find((match) => match.id === mid);
          if (m?.matchday) setSelectedMatchday(m.matchday);
        }
      }
    }
    loadData();
  }, []);

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!title.trim() || title.trim().length < 3) {
      errors.title = "Title must be at least 3 characters.";
    }
    if (!content.trim() || content.trim().length < 10) {
      errors.content = "Content must be at least 10 characters.";
    }
    if (type === "TEAM" && !teamId) {
      errors.teamId = "Please select a team.";
    }
    if (type === "MATCH" && !matchId) {
      errors.matchId = "Please select a match.";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setSubmitting(true);
    setError("");

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const body: Record<string, unknown> = { title, content, type };
    if (type === "TEAM" && teamId) body.teamId = teamId;
    if (type === "MATCH" && matchId) {
      body.matchId = matchId;
      const match = matches.find((m) => m.id === matchId);
      if (match) body.teamId = match.homeTeam.id;
    }
    if (tags.length > 0) body.tags = [...new Set(tags)];

    const { data, error: err } = await api.post<{ thread: { id: number } }>("/threads", body);

    setSubmitting(false);

    if (err) {
      setError(err);
    } else if (data?.thread) {
      await refreshUser();
      notifyActivityChanged();
      router.push(`/threads/${data.thread.id}`);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-6">
          New Thread
        </h1>

        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => { if (e.target.value.length <= 200) setTitle(e.target.value); }}
              placeholder="What's on your mind?"
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <div className="flex justify-between mt-1">
              {validationErrors.title ? <p className="text-xs text-red-600">{validationErrors.title}</p> : <span />}
              <span className={`text-[10px] ${title.length > 180 ? "text-red-500" : "text-zinc-400"}`}>{title.length}/200</span>
            </div>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => { if (e.target.value.length <= 10000) setContent(e.target.value); }}
              placeholder="Share your thoughts..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
            />
            <div className="flex justify-between mt-1">
              {validationErrors.content ? <p className="text-xs text-red-600">{validationErrors.content}</p> : <span />}
              {content.length > 9000 && <span className={`text-[10px] ${content.length > 9800 ? "text-red-500" : "text-zinc-400"}`}>{content.length}/10000</span>}
            </div>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                if (e.target.value !== "TEAM") setTeamId(null);
                if (e.target.value !== "MATCH") setMatchId(null);
              }}
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            >
              <option value="GENERAL">General</option>
              <option value="TEAM">Team</option>
              <option value="MATCH">Match</option>
            </select>
          </div>

          {/* Team selector (only if TEAM type) */}
          {type === "TEAM" && (
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Select a team
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setTeamId(team.id)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                      teamId === team.id
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
              {validationErrors.teamId && (
                <p className="mt-1 text-xs text-red-600">{validationErrors.teamId}</p>
              )}
            </div>
          )}

          {/* Match selector (only if MATCH type) */}
          {type === "MATCH" && (
            <div className="space-y-3">
              {/* Step 1: Pick matchday */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  1. Select a matchday
                </label>
                <select
                  value={selectedMatchday ?? ""}
                  onChange={(e) => { setSelectedMatchday(e.target.value ? parseInt(e.target.value) : null); setMatchId(null); }}
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                >
                  <option value="">Choose matchday...</option>
                  {[...new Set(matches.map((m) => m.matchday).filter(Boolean))].sort((a, b) => b - a).map((md) => {
                    const mdMatches = matches.filter((m) => m.matchday === md);
                    const firstDate = new Date(Math.min(...mdMatches.map((m) => new Date(m.utcDate).getTime())));
                    const hasFinished = mdMatches.some((m) => m.status === "FINISHED");
                    return (
                      <option key={md} value={md}>
                        Matchday {md} — {firstDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} {hasFinished ? "(played)" : "(upcoming)"}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Step 2: Pick match from that matchday */}
              {selectedMatchday && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                    2. Select a match from Matchday {selectedMatchday}
                  </label>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto p-1">
                    {matches
                      .filter((m) => m.matchday === selectedMatchday)
                      .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
                      .map((match) => (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setMatchId(match.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-left ${
                          matchId === match.id
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/30"
                            : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{match.homeTeam.shortName}</span>
                          {match.homeTeam.crest && <img src={match.homeTeam.crest} alt="" className="h-5 w-5 object-contain flex-shrink-0" />}
                        </div>
                        <div className="flex-shrink-0 text-center w-20">
                          {match.status === "FINISHED" ? (
                            <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100">{match.homeScore}–{match.awayScore}</span>
                          ) : (
                            <span className="text-[10px] font-medium text-zinc-500">
                              {new Date(match.utcDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          {match.awayTeam.crest && <img src={match.awayTeam.crest} alt="" className="h-5 w-5 object-contain flex-shrink-0" />}
                          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{match.awayTeam.shortName}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {validationErrors.matchId && (
                <p className="mt-1 text-xs text-red-600">{validationErrors.matchId}</p>
              )}
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. tactics, transfers, matchday"
              className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            {tagsInput.trim() && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {tagsInput
                  .split(",")
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0)
                  .map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            )}
          </div>

          {error && <ErrorMessage message={error} />}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => router.push("/threads")}
              className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors flex items-center gap-2"
            >
              {submitting ? <LoadingSpinner size="sm" /> : "Create Thread"}
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
