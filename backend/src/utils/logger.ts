import type { NextFunction, Request, Response } from "express";

/** Tiny structured request logger. Keeps production logs greppable without extra deps. */
export function requestLogger(request: Request, response: Response, next: NextFunction) {
  const started = Date.now();
  response.on("finish", () => {
    const duration = Date.now() - started;
    const line = `${request.method} ${request.originalUrl} ${response.statusCode} ${duration}ms`;
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
