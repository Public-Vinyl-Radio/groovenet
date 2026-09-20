import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
    });

    redis.on("error", (error) => {
      console.error("Redis connection error:", error);
    });

    redis.on("connect", () => {
      console.log("Connected to Redis");
    });
  }

  return redis;
}

export function disconnectRedis(): void {
  if (redis) {
    redis.disconnect();
    redis = null;
  }
}
