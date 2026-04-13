/**
 * Single source of truth for long-running AI calls (dungeon JSON, etc.).
 * Keep LiteLLM YAML (seconds) and Node fetch (ms) aligned.
 */
export const AI_CHAT_TIMEOUT_MS_DEFAULT = 1_800_000; // 30 min — slow local 14B + large JSON
export const LITELLM_UPSTREAM_TIMEOUT_SEC = 1800;
