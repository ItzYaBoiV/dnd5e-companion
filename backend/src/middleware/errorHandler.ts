import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { appendLogFile } from "../util/fileLogger";

// Typed error response — every error from this API has this shape.
interface ApiError {
  error: string;
  details?: unknown;
  code?: string;
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, "VALIDATION_ERROR");
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ApiError>,
  _next: NextFunction
): void {
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // Our own typed errors
  if (err instanceof AppError) {
    if (!(err.statusCode === 400 && err.code === "VALIDATION_ERROR")) {
      appendLogFile(
        "errors.log",
        `AppError ${err.statusCode} [${err.code ?? "-"}] ${err.message}`
      );
    }
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  // Unknown errors — log and return 500
  console.error("[UnhandledError]", err);
  const detail =
    err instanceof Error
      ? `${err.name}: ${err.message}\n${err.stack ?? ""}`
      : String(err);
  appendLogFile("errors.log", `[${(err as Error)?.name ?? "Error"}] ${detail}`);
  res.status(500).json({
    error: "An unexpected server error occurred",
    code: "INTERNAL_ERROR",
  });
}
