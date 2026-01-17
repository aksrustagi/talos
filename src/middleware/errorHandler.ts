import { createMiddleware } from "hono/factory";
import type { AppContext } from "../types/context";

// Custom error class
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Common errors
export const Errors = {
  NotFound: (resource: string) =>
    new ApiError(404, "NOT_FOUND", `${resource} not found`),

  BadRequest: (message: string, details?: unknown) =>
    new ApiError(400, "BAD_REQUEST", message, details),

  Unauthorized: (message = "Authentication required") =>
    new ApiError(401, "UNAUTHORIZED", message),

  Forbidden: (message = "Access denied") =>
    new ApiError(403, "FORBIDDEN", message),

  Conflict: (message: string) =>
    new ApiError(409, "CONFLICT", message),

  ValidationError: (details: unknown) =>
    new ApiError(422, "VALIDATION_ERROR", "Validation failed", details),

  InternalError: (message = "Internal server error") =>
    new ApiError(500, "INTERNAL_ERROR", message),

  ServiceUnavailable: (service: string) =>
    new ApiError(503, "SERVICE_UNAVAILABLE", `${service} is currently unavailable`),
};

// Error handler middleware
export const errorHandler = createMiddleware<AppContext>(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const requestId = c.get("requestId") || "unknown";
    const startTime = c.get("startTime") || Date.now();
    const duration = Date.now() - startTime;

    // Log error
    console.error(`[${requestId}] Error after ${duration}ms:`, error);

    // Handle ApiError
    if (error instanceof ApiError) {
      return c.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        },
        error.statusCode as any
      );
    }

    // Handle Zod validation errors
    if (error instanceof Error && error.name === "ZodError") {
      const zodError = error as any;
      return c.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: zodError.errors || zodError.issues,
          },
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        },
        422
      );
    }

    // Handle Convex errors
    if (error instanceof Error && error.message.includes("Convex")) {
      return c.json(
        {
          success: false,
          error: {
            code: "DATABASE_ERROR",
            message: "Database operation failed",
            details: process.env.NODE_ENV === "development" ? error.message : undefined,
          },
          meta: {
            requestId,
            timestamp: new Date().toISOString(),
          },
        },
        500
      );
    }

    // Handle unknown errors
    const message = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;

    return c.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: process.env.NODE_ENV === "development" ? message : "Internal server error",
          details: process.env.NODE_ENV === "development" ? { stack } : undefined,
        },
        meta: {
          requestId,
          timestamp: new Date().toISOString(),
        },
      },
      500
    );
  }
});

// Async handler wrapper for route handlers
export function asyncHandler<T>(
  handler: (c: any) => Promise<T>
): (c: any) => Promise<T> {
  return async (c) => {
    try {
      return await handler(c);
    } catch (error) {
      throw error;
    }
  };
}

// Validate request body against schema
export function validateBody<T>(schema: { parse: (data: unknown) => T }) {
  return createMiddleware<AppContext>(async (c, next) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set("validatedBody" as any, validated);
      await next();
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        throw error;
      }
      throw Errors.BadRequest("Invalid request body");
    }
  });
}
