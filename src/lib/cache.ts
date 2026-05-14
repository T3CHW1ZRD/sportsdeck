import { getRedisClient } from "./redis";

const CACHE_KEYS = {
  STANDINGS: "standings",
  MATCHES: "matches",
  MATCHES_MATCHDAY: (md: number | string) => `matches_matchday_${md}`,
  TEAMS: "teams",
  TEAM: (id: number | string) => `team_${id}`,
  MATCH: (id: number | string) => `match_${id}`,
  TOXICITY: (hash: string) => `toxicity_${hash}`,
  BLACKLIST_RT: (token: string) => `bl_rt_${token}`,
  BLACKLIST_AT: (token: string) => `bl_at_${token}`,
};

// Static data that won't change - cache for 24 hours
const STATIC_TTL = 86400;
// Dynamic data (standings, new scores) - cache for 10 minutes
const DYNAMIC_TTL = 600;

async function getCached<T = unknown>(key: string): Promise<T | null> {
  const redisClient = await getRedisClient();
  const value = await redisClient.get(key);
  if (value === null) {
    console.log("Cache miss for key:", key);
    return null;
  }
  try {
    console.log("Cache hit for key:", key);
    return JSON.parse(value) as T;
  } catch (error) {
    console.error("Error parsing cached value:", error);
    return value as T;
  }
}

async function setCached(key: string, value: unknown, ttl?: number): Promise<unknown> {
  const redisClient = await getRedisClient();
  const serialized = JSON.stringify(value);
  const result = await redisClient.set(key, serialized, { EX: ttl || DYNAMIC_TTL });
  console.log("Cache set for key:", key);
  return result;
}

async function invalidate(key: string): Promise<number> {
  const redisClient = await getRedisClient();
  const result = await redisClient.del(key);
  console.log("Cache invalidated for key:", key);
  return result;
}

async function invalidateAll(): Promise<string> {
  const redisClient = await getRedisClient();
  const result = await redisClient.flushAll();
  console.log("Cache invalidated for all keys");
  return result;
}

export {
  CACHE_KEYS,
  STATIC_TTL,
  DYNAMIC_TTL,
  getCached,
  setCached,
  invalidate,
  invalidateAll,
};
