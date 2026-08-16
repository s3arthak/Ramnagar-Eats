import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "../models/User.js";
import { fail } from "../utils/errors.js";

export type AuthRequest = Request & { user?: { id: string; role: UserRole } };

const secret = () => process.env.JWT_SECRET ?? "local-development-secret-change-me";

export function signAccessToken(id: string, role: UserRole) {
  return jwt.sign({ sub: id, role }, secret(), { expiresIn: "7d" });
}

/** Verify the bearer token and attach the authenticated user to the request. */
export function authenticate(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(response, 401, "Authentication required", "UNAUTHORIZED");
  try {
    const payload = jwt.verify(token, secret()) as jwt.JwtPayload;
    if (!payload.sub || !["CUSTOMER", "RESTAURANT", "ADMIN"].includes(payload.role)) {
      throw new Error("Invalid token");
    }
    request.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return fail(response, 401, "Invalid or expired session", "UNAUTHORIZED");
  }
}

/** Require one of the given roles on top of authentication. */
export function authorize(...roles: UserRole[]) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.user) return fail(response, 401, "Authentication required", "UNAUTHORIZED");
    if (!roles.includes(request.user.role)) {
      return fail(response, 403, "Insufficient permissions", "FORBIDDEN");
    }
    next();
  };
}
