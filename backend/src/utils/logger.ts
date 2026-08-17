import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Tiny structured request logger. Every line carries a request id (also echoed
 * in the X-Request-Id response header), the authenticated user when known, and
 * the latency — so slow requests are greppable without extra deps.
 */
export function requestLogger(request: Request, response: Response, next: NextFunction) {
  const started = Date.now();
  const incoming = request.headers["x-request-id"];
  const requestId = (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
  response.setHeader("X-Request-Id", requestId);

  response.on("finish", () => {
    const duration = Date.now() - started;
    const userId = (request as Request & { user?: { id?: string } }).user?.id;
    const userPart = userId ? ` user=${userId}` : "";
    const line = `req=${requestId} ${request.method} ${request.originalUrl} status=${response.statusCode} duration=${duration}ms${userPart}`;
    if (response.statusCode >= 500) {
      console.error(line);
    } else if (response.statusCode >= 400) {
      console.warn(line);
    } else {
      console.info(line);
    }
  });
  next();
}
