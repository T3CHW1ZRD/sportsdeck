"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SkeletonCard } from "@/components/Skeleton";
import { api } from "@/lib/api";

interface Team {
  id: number;
  name: string;
  shortName: string;
  crest: string;
  venue?: string | null;
}

interface Match {
  id: number;
  matchday: number;
  utcDate: string;
  status: string;
  homeTeam: Team;
  awayTeam: Team;
  homeScore: number | null;
  awayScore: number | null;
  venue?: string | null;
}

interface Matchday {
  matchday: number;
  matchCount: number;
}

function groupByDate(matches: Match[]): Record<string, Match[]> {
  const groups: Record<string, Match[]> = {};
  for (const m of matches) {
    const date = new Date(m.utcDate).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(m);
  }
  return groups;
}

function formatKickoff(utcDate: string): string {
  return new Date(utcDate).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const statusStyle: Record<string, string> = {
  FINISHED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400",
  TIMED: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  SCHEDULED: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
  IN_PLAY: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
  PAUSED: "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400",
  POSTPONED: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
  CANCELLED: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
};

const statusLabel: Record<string, string> = {
  FINISHED: "FT",
  TIMED: "Upcoming",
  SCHEDULED: "Scheduled",
  IN_PLAY: "LIVE",
  PAUSED: "HT",
  POSTPONED: "PPD",
  CANCELLED: "OFF",
};

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchdays, setMatchdays] = useState<Matchday[]>([]);
  const [selectedMd, setSelectedMd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await api.get<{ matchdays: Matchday[] }>("/matches/matchday", { skipAuth: true });
      if (data?.matchdays && data.matchdays.length > 0) {
        setMatchdays(data.matchdays);

        // Find current matchday: first one with upcoming matches, else latest
        const upcoming = await api.get<{ data: Match[] }>("/matches?status=TIMED&limit=1", { skipAuth: true });
        let currentMd: number;
        if (upcoming.data?.data?.[0]?.matchday) {
          currentMd = upcoming.data.data[0].matchday;
        } else {
          // All finished — go to the latest matchday
          currentMd = data.matchdays[data.matchdays.length - 1].matchday;
        }
        setSelectedMd(currentMd);
      }
      setInitialLoad(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (selectedMd === null) return;
    setLoading(true);
    async function loadMatches() {
      const { data } = await api.get<{ matchday: number; matches: Match[] }>(
        `/matches/matchday/${selectedMd}`,
        { skipAuth: true }
      );
      if (data?.matches) setMatches(data.matches);
      setLoading(false);
    }
    loadMatches();
  }, [selectedMd]);

  const mdIndex = matchdays.findIndex(m => m.matchday === selectedMd);
  const hasPrev = mdIndex > 0;
  const hasNext = mdIndex < matchdays.length - 1;

  const grouped = groupByDate(matches);
  const dateKeys = Object.keys(grouped);

  // Date range for the matchday
  const mdDateRange = matches.length > 0
    ? (() => {
        const dates = matches.map(m => new Date(m.utcDate));
        const min = new Date(Math.min(...dates.map(d => d.getTime())));
        const max = new Date(Math.max(...dates.map(d => d.getTime())));
        const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        return min.toDateString() === max.toDateString() ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
      })()
    : "";

  if (initialLoad) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="relative overflow-hidden rounded-2xl mb-8 border border-zinc-200 dark:border-zinc-700 shadow-lg">
        <img
          src="/assets/PremierLeague.webp"
          alt="Premier League action"
          className="w-full h-36 sm:h-44 object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
          <p className="text-white/90 text-xs font-medium uppercase tracking-wider mb-1">Match center</p>
          <p className="text-white text-lg sm:text-xl font-bold drop-shadow-md">
            Fixtures, kickoffs &amp; results — tap a row for full match details
          </p>
        </div>
      </div>

      {/* League header */}
      <div className="flex items-center gap-3 mb-6">
        <img
          src="https://crests.football-data.org/PL.png"
          alt="Premier League"
          className="h-8 w-8 object-contain"
        />
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">Premier League</h1>
          <p className="text-xs text-zinc-400">England · 2025/26</p>
        </div>
      </div>

      {/* Matchday navigator */}
      {matchdays.length > 0 && selectedMd !== null && (
        <div className="flex items-center justify-between bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 px-4 py-3 mb-6">
          <button
            onClick={() => hasPrev && setSelectedMd(matchdays[mdIndex - 1].matchday)}
            disabled={!hasPrev}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <p className="text-base font-bold text-zinc-900 dark:text-zinc-50">
              Matchday {selectedMd}
            </p>
            {mdDateRange && !loading && (
              <p className="text-xs text-zinc-400 mt-0.5">{mdDateRange}</p>
            )}
          </div>

          <button
            onClick={() => hasNext && setSelectedMd(matchdays[mdIndex + 1].matchday)}
            disabled={!hasNext}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-zinc-400 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Matches grouped by date */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <p>No matches found for this matchday.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {dateKeys.map((dateLabel) => (
            <div key={dateLabel}>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 px-1">
                {dateLabel}
              </h3>
              <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                {grouped[dateLabel].map((match) => (
                  <Link
                    key={match.id}
                    href={`/matches/${match.id}`}
                    className="flex flex-col sm:flex-row sm:items-center px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-700/40 transition-colors border-b border-zinc-100 dark:border-zinc-700/80 last:border-0"
                  >
                    <div className="flex items-center w-full sm:flex-1 min-w-0">
                    {/* Home */}
                    <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5 flex-1 min-w-0 justify-end">
                      <span className="text-[10px] sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 text-center sm:text-right leading-tight order-2 sm:order-1">
                        {match.homeTeam.shortName || match.homeTeam.name}
                      </span>
                      {match.homeTeam.crest && (
                        <img src={match.homeTeam.crest} alt="" className="h-6 w-6 object-contain flex-shrink-0 order-1 sm:order-2" />
                      )}
                    </div>

                    {/* Center */}
                    <div className="w-32 text-center flex-shrink-0 mx-3">
                      {match.status === "FINISHED" ? (
                        <div>
                          <span className="text-base font-bold font-mono text-zinc-900 dark:text-zinc-100">
                            {match.homeScore} – {match.awayScore}
                          </span>
                        </div>
                      ) : match.status === "IN_PLAY" || match.status === "PAUSED" ? (
                        <div>
                          <span className="text-base font-bold font-mono text-green-600">
                            {match.homeScore ?? 0} – {match.awayScore ?? 0}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          {formatKickoff(match.utcDate)}
                        </span>
                      )}
                      {match.venue && (
                        <div className="flex items-center justify-center gap-0.5 mt-0.5">
                          <svg className="w-3 h-3 text-zinc-700 dark:text-zinc-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          <span className="text-[10px] text-zinc-700 dark:text-zinc-300 truncate">{match.venue}</span>
                        </div>
                      )}
                    </div>

                    {/* Away */}
                    <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2.5 flex-1 min-w-0">
                      {match.awayTeam.crest && (
                        <img src={match.awayTeam.crest} alt="" className="h-6 w-6 object-contain flex-shrink-0" />
                      )}
                      <span className="text-[10px] sm:text-sm font-medium text-zinc-900 dark:text-zinc-100 text-center sm:text-left leading-tight">
                        {match.awayTeam.shortName || match.awayTeam.name}
                      </span>
                    </div>

                    {/* Status badge — only for non-standard states */}
                    <div className="w-16 flex-shrink-0 text-right">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${statusStyle[match.status] || statusStyle.TIMED}`}>
                        {statusLabel[match.status] || match.status}
                      </span>
                    </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
