import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

type Target = "body" | "query" | "params";

/**
 * Middleware factory that validates req[target] against a Zod schema.
 * On success, replaces req[target] with the parsed (typed) value.
 * On failure, throws — caught by the global errorHandler.
 *
 * Usage:
 *   router.post("/characters", validate("body", CreateCharacterSchema), controller)
 */
export function validate<T>(target: Target, schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req[target] = schema.parse(req[target]) as never;
    next();
  };
}
