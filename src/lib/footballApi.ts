/**
 * Football-data.org API client
 * Proxies all requests through the backend to protect the API key.
 */

import { getCached, setCached, CACHE_KEYS, STATIC_TTL, DYNAMIC_TTL } from "./cache";

const BASE_URL = "https://api.football-data.org/v4";
const API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const COMPETITION = process.env.COMPETITION_CODE || "PL";

type MatchFilters = {
  matchday?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
};

async function fetchFromAPI(endpoint: string): Promise<any> {
  if (!API_KEY) {
    throw new Error("FOOTBALL_DATA_API_KEY is not configured");
  }
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      "X-Auth-Token": API_KEY,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Football API error ${response.status}: ${text}`);
  }
  return response.json();
}

async function getTeams(): Promise<any> {
  const cached = await getCached(CACHE_KEYS.TEAMS);
  if (cached) return cached;

  const data = await fetchFromAPI(`/competitions/${COMPETITION}/teams`);
  await setCached(CACHE_KEYS.TEAMS, data, STATIC_TTL);
  return data;
}

async function getStandings(): Promise<any> {
  const cached = await getCached(CACHE_KEYS.STANDINGS);
  if (cached) return cached;

  const data = await fetchFromAPI(`/competitions/${COMPETITION}/standings`);
  await setCached(CACHE_KEYS.STANDINGS, data, DYNAMIC_TTL);
  return data;
}

async function getMatches(filters: MatchFilters = {}): Promise<any> {
  const params = new URLSearchParams();
  if (filters.matchday) params.set("matchday", filters.matchday);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const queryString = params.toString();
  const cacheKey = `matches_${queryString}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const endpoint = `/competitions/${COMPETITION}/matches${queryString ? "?" + queryString : ""}`;
  const data = await fetchFromAPI(endpoint);
  await setCached(cacheKey, data, DYNAMIC_TTL);
  return data;
}

async function getMatch(matchId: number | string): Promise<any> {
  const cacheKey = CACHE_KEYS.MATCH(matchId);
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await fetchFromAPI(`/matches/${matchId}`);
  await setCached(cacheKey, data, DYNAMIC_TTL);
  return data;
}

async function getCompetition(): Promise<any> {
  const cacheKey = "competition_info";
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const data = await fetchFromAPI(`/competitions/${COMPETITION}`);
  await setCached(cacheKey, data, STATIC_TTL);
  return data;
}

export {
  fetchFromAPI,
  getTeams,
  getStandings,
  getMatches,
  getMatch,
  getCompetition,
  COMPETITION,
};
