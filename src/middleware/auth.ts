import { createMiddleware } from "hono/factory";
import type { AppContext, UserInfo } from "../types/context";
import { v4 as uuidv4 } from "uuid";

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  "/api/v1/webhooks",
  "/api/v1/pricing",
  "/health",
];

// Simple JWT-like token validation (in production, use proper JWT library)
function parseToken(token: string): UserInfo | null {
  try {
    // For demo purposes, parse a simple base64 encoded JSON
    // In production, use proper JWT verification
    const payload = JSON.parse(Buffer.from(token, "base64").toString());

    if (!payload.userId || !payload.universityId || !payload.email || !payload.role) {
      return null;
    }

    return {
      userId: payload.userId,
      universityId: payload.universityId,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions || [],
    };
  } catch {
    return null;
  }
}

// Generate permissions based on role
function getRolePermissions(role: UserInfo["role"]): string[] {
  const permissions: Record<string, string[]> = {
    admin: [
      "read:all",
      "write:all",
      "delete:all",
      "manage:users",
      "manage:agents",
      "manage:contracts",
      "approve:all",
    ],
    procurement_manager: [
      "read:all",
      "write:requisitions",
      "write:orders",
      "write:vendors",
      "approve:requisitions",
      "manage:contracts",
    ],
    approver: [
      "read:requisitions",
      "read:budgets",
      "approve:requisitions",
    ],
    requester: [
      "read:products",
      "read:vendors",
      "write:requisitions",
      "read:own_requisitions",
    ],
    viewer: [
      "read:products",
      "read:reports",
    ],
  };

  return permissions[role] || [];
}

// Check if user has required permission
export function hasPermission(user: UserInfo, permission: string): boolean {
  // Admin has all permissions
  if (user.role === "admin") return true;

  // Check specific permission
  if (user.permissions.includes(permission)) return true;

  // Check for wildcard permissions
  const [action, resource] = permission.split(":");
  if (user.permissions.includes(`${action}:all`)) return true;

  return false;
}

// Require specific permission middleware
export function requirePermission(permission: string) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        401
      );
    }

    if (!hasPermission(user, permission)) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: `Missing required permission: ${permission}`,
          },
        },
        403
      );
    }

    await next();
  });
}

// Main auth middleware
export const authMiddleware = createMiddleware<AppContext>(async (c, next) => {
  // Set request ID and start time
  c.set("requestId", uuidv4());
  c.set("startTime", Date.now());

  // Check if route is public
  const path = c.req.path;
  const isPublic = PUBLIC_ROUTES.some((route) => path.startsWith(route));

  if (isPublic) {
    await next();
    return;
  }

  // Get authorization header
  const authHeader = c.req.header("Authorization");

  // Also check for API key
  const apiKey = c.req.header("X-API-Key");

  // Allow development mode without auth
  if (process.env.NODE_ENV === "development" && !authHeader && !apiKey) {
    // Set a default dev user
    c.set("user", {
      userId: "dev-user-001",
      universityId: "dev-university-001",
      email: "dev@example.com",
      role: "admin",
      permissions: getRolePermissions("admin"),
    });
    await next();
    return;
  }

  // Validate Bearer token
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const user = parseToken(token);

    if (user) {
      // Add role permissions
      user.permissions = [
        ...user.permissions,
        ...getRolePermissions(user.role),
      ];
      c.set("user", user);
      await next();
      return;
    }
  }

  // Validate API key
  if (apiKey) {
    // In production, validate against database
    // For now, accept any API key that matches pattern
    if (apiKey.startsWith("talos_")) {
      c.set("user", {
        userId: "api-user",
        universityId: "api-university",
        email: "api@system.talos",
        role: "admin",
        permissions: getRolePermissions("admin"),
      });
      await next();
      return;
    }
  }

  return c.json(
    {
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or missing authentication",
        details: "Provide a valid Bearer token or X-API-Key header",
      },
    },
    401
  );
});

// Get current user helper
export function getCurrentUser(c: any): UserInfo | undefined {
  return c.get("user");
}

// Ensure user is from specific university
export function requireUniversity(universityId: string) {
  return createMiddleware<AppContext>(async (c, next) => {
    const user = c.get("user");

    if (!user) {
      return c.json({ success: false, error: { code: "UNAUTHORIZED" } }, 401);
    }

    // Admin can access any university
    if (user.role === "admin") {
      await next();
      return;
    }

    if (user.universityId !== universityId) {
      return c.json(
        {
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Access denied to this university's data",
          },
        },
        403
      );
    }

    await next();
  });
}
