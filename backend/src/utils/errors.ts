import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";

/** Error carrying an HTTP status and a stable machine-readable code. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code?: string) => new ApiError(400, message, code);
export const unauthorized = (message = "Authentication required", code = "UNAUTHORIZED") => new ApiError(401, message, code);
export const forbidden = (message = "Insufficient permissions", code = "FORBIDDEN") => new ApiError(403, message, code);
export const notFound = (message = "Resource not found", code = "NOT_FOUND") => new ApiError(404, message, code);
export const conflict = (message: string, code?: string) => new ApiError(409, message, code);

/** Send a success payload. */
export function ok(response: Response, data: Record<string, unknown> = {}, status = 200) {
  return response.status(status).json({ success: true, ...data });
}

/** Send the standard failure shape: { success: false, message, code }. */
export function fail(response: Response, status: number, message: string, code?: string) {
  return response.status(status).json({ success: false, message, code });
}

function isMongooseError(error: unknown): error is { name: string; code?: number; message: string } {
  return typeof error === "object" && error !== null && "name" in error;
}

/** Central error handler: every API failure leaves the API with the same shape. */
export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof ApiError) {
    return fail(response, error.status, error.message, error.code);
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return fail(response, 400, issue?.message ?? "Invalid input", "VALIDATION_ERROR");
  }
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "Image must be under 5 MB" : "Could not read the uploaded file";
    return fail(response, 400, message, "UPLOAD_ERROR");
  }
  if (isMongooseError(error)) {
    if (error.name === "CastError") return fail(response, 404, "Resource not found", "NOT_FOUND");
    if (error.name === "ValidationError") return fail(response, 400, error.message, "VALIDATION_ERROR");
    if (error.code === 11000) return fail(response, 409, "That value is already in use", "DUPLICATE");
  }
  console.error("[api-error]", error);
  return fail(response, 500, "Something went wrong", "INTERNAL_ERROR");
}

/** Express async wrapper so thrown errors reach the error handler. */
export function asyncHandler(handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}
