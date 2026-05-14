import { createClient } from "redis";

const redisUrl =
  process.env.NODE_ENV === "production"
    ? process.env.REDIS_URL_PROD
    : process.env.REDIS_URL_DEV;

let client: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {

  if (!client) {
    client = createClient({ url: redisUrl });
    client.on("error", (error) => {
      console.error("Redis error:", error);
    });
  }

  if (!client.isOpen) {
    await client.connect();
  }
  console.log("Redis client connected");
  return client;
}
