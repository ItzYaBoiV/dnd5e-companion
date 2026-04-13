import fs from "fs";
import path from "path";

/**
 * Host-visible logs when running in Docker: mount ./logs/backend -> /app/logs (see docker-compose).
 * Override with FILE_LOG_DIR. Safe no-op if the directory is not writable.
 */
function logDir(): string {
  if (process.env.FILE_LOG_DIR) return process.env.FILE_LOG_DIR;
  if (process.env.NODE_ENV === "production") return "/app/logs";
  return path.join(process.cwd(), "logs");
}

export function ensureLogDir(): void {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
  } catch {
    /* ignore */
  }
}

export function appendLogFile(name: string, message: string): void {
  try {
    ensureLogDir();
    const line = `[${new Date().toISOString()}] ${message}\n`;
    fs.appendFileSync(path.join(logDir(), name), line, "utf8");
  } catch {
    /* never throw from logging */
  }
}

/** Morgan stream → logs/access.log */
export function createAccessLogStream(): fs.WriteStream | null {
  try {
    ensureLogDir();
    return fs.createWriteStream(path.join(logDir(), "access.log"), { flags: "a" });
  } catch {
    return null;
  }
}
