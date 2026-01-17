import { createMiddleware } from "hono/factory";
import type { AppContext } from "../types/context";

// Simple in-memory rate limiter
// In production, use Redis or similar for distributed rate limiting
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations by plan
const RATE_LIMITS = {
  trial: {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    requestsPerDay: 10000,
  },
  flat: {
    requestsPerMinute: 300,
    requestsPerHour: 10000,
    requestsPerDay: 100000,
  },
  performance: {
    requestsPerMinute: 300,
    requestsPerHour: 10000,
    requestsPerDay: 100000,
  },
  hybrid: {
    requestsPerMinute: 200,
    requestsPerHour: 5000,
    requestsPerDay: 50000,
  },
};

// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // Clean every minute

function getClientKey(c: any): string {
  // Use user ID if authenticated, otherwise use IP
  const user = c.get("user");
  if (user?.userId) {
    return `user:${user.userId}`;
  }

  // Get IP from various headers
  const forwarded = c.req.header("x-forwarded-for");
  const realIp = c.req.header("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || "unknown";

  return `ip:${ip}`;
}

function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const fullKey = `${key}:${windowMs}`;

  let entry = rateLimitStore.get(fullKey);

  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + windowMs,
    };
  }

  entry.count++;
  rateLimitStore.set(fullKey, entry);

  const remaining = Math.max(0, limit - entry.count);
  const allowed = entry.count <= limit;

  return { allowed, remaining, resetTime: entry.resetTime };
}

export const rateLimiter = createMiddleware<AppContext>(async (c, next) => {
  const clientKey = getClientKey(c);

  // Get plan from user context (default to trial)
  const plan = "trial"; // Would normally get from user's subscription

  const limits = RATE_LIMITS[plan as keyof typeof RATE_LIMITS] || RATE_LIMITS.trial;

  // Check per-minute limit
  const minuteCheck = checkRateLimit(
    clientKey,
    limits.requestsPerMinute,
    60 * 1000
  );

  if (!minuteCheck.allowed) {
    c.header("X-RateLimit-Limit", String(limits.requestsPerMinute));
    c.header("X-RateLimit-Remaining", "0");
    c.header("X-RateLimit-Reset", String(Math.ceil(minuteCheck.resetTime / 1000)));
    c.header("Retry-After", String(Math.ceil((minuteCheck.resetTime - Date.now()) / 1000)));

    return c.json(
      {
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please slow down.",
          details: {
            limit: limits.requestsPerMinute,
            window: "1 minute",
            retryAfter: Math.ceil((minuteCheck.resetTime - Date.now()) / 1000),
          },
        },
      },
      429
    );
  }

  // Set rate limit headers
  c.header("X-RateLimit-Limit", String(limits.requestsPerMinute));
  c.header("X-RateLimit-Remaining", String(minuteCheck.remaining));
  c.header("X-RateLimit-Reset", String(Math.ceil(minuteCheck.resetTime / 1000)));

  await next();
});

// Specific rate limiter for expensive operations
export const agentRateLimiter = createMiddleware<AppContext>(async (c, next) => {
  const clientKey = getClientKey(c);

  // More restrictive limits for AI agent calls
  const agentLimits = {
    requestsPerMinute: 10,
    requestsPerHour: 100,
  };

  const minuteCheck = checkRateLimit(
    `${clientKey}:agent`,
    agentLimits.requestsPerMinute,
    60 * 1000
  );

  if (!minuteCheck.allowed) {
    return c.json(
      {
        success: false,
        error: {
          code: "AGENT_RATE_LIMIT_EXCEEDED",
          message: "AI agent rate limit exceeded. Please wait before making more requests.",
          details: {
            limit: agentLimits.requestsPerMinute,
            window: "1 minute",
            retryAfter: Math.ceil((minuteCheck.resetTime - Date.now()) / 1000),
          },
        },
      },
      429
    );
  }

  await next();
});
