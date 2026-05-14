"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { SkeletonCard } from "@/components/Skeleton";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import { api } from "@/lib/api";

interface StandingEntry {
  position: number;
  team: {
    id: number;
    name: string;
    shortName: string;
    crest: string;
  };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string | null;
}

interface TeamMatch {
  id: number;
  utcDate: string;
  matchday: number;
  status: string;
  homeTeam: { id: number; name: string; shortName: string; crest: string };
  awayTeam: { id: number; name: string; shortName: string; crest: string };
  homeScore: number | null;
  awayScore: number | null;
  venue: string | null;
}

interface InternalTeam {
  id: number;
  externalId: number;
  name: string;
}

export default function StandingsPage() {
  const [table, setTable] = useState<StandingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teamMap, setTeamMap] = useState<Record<number, number>>({});

  // Team matches modal
  const [selectedTeam, setSelectedTeam] = useState<StandingEntry | null>(null);
  const [teamMatches, setTeamMatches] = useState<TeamMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [standingsRes, teamsRes] = await Promise.all([
        api.get<{ standings: Array<{ table: StandingEntry[] }> }>("/standings", { skipAuth: true }),
        api.get<{ data: InternalTeam[] }>("/teams?limit=50", { skipAuth: true }),
      ]);

      if (standingsRes.error) {
        setError(standingsRes.error);
      } else if (standingsRes.data?.standings) {
        const arr = standingsRes.data.standings;
        if (Array.isArray(arr) && arr.length > 0 && arr[0].table) {
          setTable(arr[0].table);
        }
      }

      if (teamsRes.data?.data) {
        const map: Record<number, number> = {};
        for (const t of teamsRes.data.data) {
          map[t.externalId] = t.id;
        }
        setTeamMap(map);
      }

      setLoading(false);
    }
    load();
  }, []);

  const handleTeamClick = async (entry: StandingEntry) => {
    setSelectedTeam(entry);
    setMatchesLoading(true);
    setTeamMatches([]);

    const internalId = teamMap[entry.team.id];
    if (internalId) {
      const { data } = await api.get<{ data: TeamMatch[] }>(
        `/matches?teamId=${internalId}&limit=38`,
        { skipAuth: true }
      );
      if (data?.data) setTeamMatches([...data.data].reverse());
    }
    setMatchesLoading(false);
  };

  const isTeamInMatch = (match: TeamMatch, externalTeamId: number): "home" | "away" | null => {
    const internalId = teamMap[externalTeamId];
    if (match.homeTeam.id === internalId) return "home";
    if (match.awayTeam.id === internalId) return "away";
    return null;
  };

  const getMatchResult = (match: TeamMatch, externalTeamId: number): "W" | "D" | "L" | null => {
    if (match.status !== "FINISHED") return null;
    const side = isTeamInMatch(match, externalTeamId);
    if (!side) return null;
    const teamScore = side === "home" ? match.homeScore! : match.awayScore!;
    const oppScore = side === "home" ? match.awayScore! : match.homeScore!;
    if (teamScore > oppScore) return "W";
    if (teamScore === oppScore) return "D";
    return "L";
  };

  const resultBadge: Record<string, string> = {
    W: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
    D: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
    L: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
  };

  const positionBorder = (pos: number): string => {
    if (pos <= 4) return "border-l-4 border-l-blue-500 dark:border-l-blue-500";
    if (pos === 5) return "border-l-4 border-l-orange-400 dark:border-l-orange-400";
    if (pos >= 18) return "border-l-4 border-l-red-500 dark:border-l-red-500";
    return "border-l-4 border-l-transparent";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <img src="https://crests.football-data.org/PL.png" alt="Premier League" className="h-8 w-8 object-contain" />
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 leading-tight">Standings</h1>
          <p className="text-xs text-zinc-400">Premier League · 2025/26</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Champions League</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-orange-400" /> Europa League</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" /> Relegation</span>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (<SkeletonCard key={i} />))}
        </div>
      ) : error ? (
        <ErrorMessage message={error} />
      ) : table.length === 0 ? (
        <p className="text-center py-12 text-zinc-500">No standings data available.</p>
      ) : (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50">
                  <th className="text-left pl-4 pr-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 w-10" title="Position">#</th>
                  <th className="text-left px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Team</th>
                  <th className="text-center px-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Played">P</th>
                  <th className="text-center px-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Wins">W</th>
                  <th className="text-center px-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Draws">D</th>
                  <th className="text-center px-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Losses">L</th>
                  <th className="text-center px-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Goals For">GF</th>
                  <th className="text-center px-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Goals Against">GA</th>
                  <th className="text-center px-2 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Goal Difference">GD</th>
                  <th className="text-center px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400 cursor-help" title="Points">Pts</th>
                </tr>
              </thead>
              <tbody>
                {table.map((entry, i) => (
                  <tr
                    key={entry.position}
                    onClick={() => handleTeamClick(entry)}
                    className={`border-b border-zinc-100 dark:border-zinc-700/50 cursor-pointer transition-colors hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 ${positionBorder(entry.position)} ${
                      i % 2 === 0 ? "bg-white dark:bg-zinc-800" : "bg-zinc-50/50 dark:bg-zinc-800/50"
                    }`}
                  >
                    <td className="pl-4 pr-2 py-3 text-zinc-400 font-bold text-xs">{entry.position}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {entry.team.crest && (
                          <img src={entry.team.crest} alt="" className="h-5 w-5 object-contain" />
                        )}
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {entry.team.shortName || entry.team.name}
                        </span>
                      </div>
                    </td>
                    <td className="text-center px-2 py-3 text-zinc-600 dark:text-zinc-400">{entry.playedGames}</td>
                    <td className="text-center px-2 py-3 text-green-600 dark:text-green-400 font-semibold">{entry.won}</td>
                    <td className="text-center px-2 py-3 text-amber-500 font-semibold">{entry.draw}</td>
                    <td className="text-center px-2 py-3 text-red-500 font-semibold">{entry.lost}</td>
                    <td className="text-center px-2 py-3 text-zinc-600 dark:text-zinc-400">{entry.goalsFor}</td>
                    <td className="text-center px-2 py-3 text-zinc-600 dark:text-zinc-400">{entry.goalsAgainst}</td>
                    <td className={`text-center px-2 py-3 font-semibold ${entry.goalDifference > 0 ? "text-green-600" : entry.goalDifference < 0 ? "text-red-500" : "text-zinc-500"}`}>
                      {entry.goalDifference > 0 ? `+${entry.goalDifference}` : entry.goalDifference}
                    </td>
                    <td className="text-center px-3 py-3 font-bold text-zinc-900 dark:text-zinc-100">{entry.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Team detail modal */}
      {selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedTeam(null)} />
          <div className="relative bg-white dark:bg-zinc-800 rounded-t-2xl sm:rounded-2xl border border-zinc-200 dark:border-zinc-700 shadow-2xl w-full sm:max-w-xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden">
            {/* Header with gradient */}
            <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 dark:from-zinc-800 dark:via-zinc-800 dark:to-indigo-950/30 border-b border-zinc-200 dark:border-zinc-700">
              <button
                onClick={() => setSelectedTeam(null)}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100/80 dark:hover:text-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div className="flex items-center gap-4">
                {selectedTeam.team.crest && (
                  <img src={selectedTeam.team.crest} alt="" className="h-14 w-14 object-contain" />
                )}
                <div>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                    {selectedTeam.team.name}
                  </h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {selectedTeam.position}{selectedTeam.position === 1 ? "st" : selectedTeam.position === 2 ? "nd" : selectedTeam.position === 3 ? "rd" : "th"} place · {selectedTeam.points} pts
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-5 gap-2 mt-4">
                {[
                  { label: "Played", value: selectedTeam.playedGames, color: "text-zinc-900 dark:text-zinc-100" },
                  { label: "Won", value: selectedTeam.won, color: "text-green-600 dark:text-green-400" },
                  { label: "Drawn", value: selectedTeam.draw, color: "text-amber-500 dark:text-amber-400" },
                  { label: "Lost", value: selectedTeam.lost, color: "text-red-500 dark:text-red-400" },
                  { label: "GD", value: selectedTeam.goalDifference > 0 ? `+${selectedTeam.goalDifference}` : String(selectedTeam.goalDifference), color: selectedTeam.goalDifference > 0 ? "text-green-600 dark:text-green-400" : selectedTeam.goalDifference < 0 ? "text-red-500 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100" },
                ].map((stat) => (
                  <div key={stat.label} className="text-center">
                    <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wide">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Action button */}
              <Link
                href={`/threads/new?type=TEAM&teamId=${teamMap[selectedTeam.team.id] || ""}`}
                className="mt-4 flex items-center justify-center gap-1.5 w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Start a Thread about {selectedTeam.team.shortName}
              </Link>
            </div>

            {/* Match list */}
            <div className="overflow-y-auto max-h-[calc(90vh-280px)] sm:max-h-[calc(85vh-280px)] p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Recent & Upcoming</h3>
              {matchesLoading ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner />
                </div>
              ) : teamMatches.length === 0 ? (
                <p className="text-sm text-zinc-400 text-center py-8">No matches found.</p>
              ) : (
                <div className="space-y-1.5">
                  {teamMatches.map((match) => {
                    const result = getMatchResult(match, selectedTeam.team.id);
                    const side = isTeamInMatch(match, selectedTeam.team.id);
                    const isHome = side === "home";
                    const opponent = isHome ? match.awayTeam : match.homeTeam;

                    return (
                      <div
                        key={match.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
                      >
                        {/* Result */}
                        <div className="w-7 flex-shrink-0">
                          {result ? (
                            <span className={`inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-bold ${resultBadge[result]}`}>
                              {result}
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center h-6 w-6 rounded text-[10px] font-medium bg-blue-50 text-blue-500 dark:bg-blue-950 dark:text-blue-400">
                              —
                            </span>
                          )}
                        </div>

                        {/* H/A */}
                        <span className="text-[10px] font-semibold text-zinc-400 w-3 flex-shrink-0">
                          {isHome ? "H" : "A"}
                        </span>

                        {/* Opponent + Venue */}
                        <div className="flex flex-col flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {opponent.crest && (
                              <img src={opponent.crest} alt="" className="h-4 w-4 object-contain flex-shrink-0" />
                            )}
                            <span className="text-sm text-zinc-700 dark:text-zinc-300 truncate">
                              {opponent.shortName || opponent.name}
                            </span>
                          </div>
                          {match.venue && (
                            <div className="flex items-center gap-0.5 ml-6">
                              <svg className="w-2.5 h-2.5 text-zinc-400 dark:text-zinc-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                              </svg>
                              <span className="text-[9px] text-zinc-400 dark:text-zinc-500 truncate">{match.venue}</span>
                            </div>
                          )}
                        </div>

                        {/* Score or date */}
                        <span className="text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 w-12 text-center flex-shrink-0">
                          {match.status === "FINISHED"
                            ? `${match.homeScore}–${match.awayScore}`
                            : new Date(match.utcDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>

                        {/* Matchday */}
                        <span className="text-[10px] text-zinc-400 w-7 text-right flex-shrink-0">
                          {match.matchday}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
