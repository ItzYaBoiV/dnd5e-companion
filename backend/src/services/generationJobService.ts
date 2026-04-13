import { prisma } from "../config/database";
import { AppError } from "../middleware/errorHandler";
import * as dungeonService from "./dungeonService";
import { appendLogFile } from "../util/fileLogger";

const JOB_LOG = "ai-jobs.log";

function jobLog(line: string): void {
  appendLogFile(JOB_LOG, line);
  console.log(`[ai-job] ${line}`);
}

function formatJobError(e: unknown): string {
  if (e instanceof AppError) {
    return e.code ? `${e.message} [${e.code}]` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}

export async function createGenerationJob(kind: "dungeon" | "story", payload: unknown) {
  return prisma.aiGenerationJob.create({
    data: {
      kind,
      status: "pending",
      payload: payload as object,
    },
  });
}

export async function getGenerationJob(id: string) {
  const job = await prisma.aiGenerationJob.findUnique({ where: { id } });
  if (!job) return null;
  return {
    id:        job.id,
    kind:      job.kind,
    status:    job.status,
    result:    job.result,
    error:     job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/** Fire-and-forget: runs AI + DB write, then updates job row. */
export function startDungeonJob(jobId: string): void {
  void runDungeonJob(jobId);
}

export function startStoryJob(jobId: string): void {
  void runStoryJob(jobId);
}

async function runDungeonJob(jobId: string) {
  const job = await prisma.aiGenerationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") return;

  const t0 = Date.now();
  jobLog(`dungeon job ${jobId} pending → running payload=${JSON.stringify(job.payload)}`);

  await prisma.aiGenerationJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  try {
    const payload = { ...(job.payload as object), jobId } as Parameters<typeof dungeonService.createAiDungeon>[0];
    const dungeon = await dungeonService.createAiDungeon(payload);
    const ms = Date.now() - t0;
    jobLog(`dungeon job ${jobId} completed dungeonId=${dungeon.id} rooms=${dungeon.rooms?.length ?? 0} ms=${ms}`);
    await prisma.aiGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        result: { kind: "dungeon", id: dungeon.id },
      },
    });
  } catch (e) {
    const ms = Date.now() - t0;
    const err = formatJobError(e);
    jobLog(`dungeon job ${jobId} FAILED ms=${ms} error=${err}`);
    await prisma.aiGenerationJob.update({
      where: { id: jobId },
      data: { status: "failed", error: err },
    });
  }
}

async function runStoryJob(jobId: string) {
  const job = await prisma.aiGenerationJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "pending") return;

  const t0 = Date.now();
  jobLog(`story job ${jobId} pending → running payload=${JSON.stringify(job.payload)}`);

  await prisma.aiGenerationJob.update({
    where: { id: jobId },
    data: { status: "running" },
  });

  try {
    const payload = { ...(job.payload as object), jobId } as Parameters<typeof dungeonService.createAiStory>[0];
    const story = await dungeonService.createAiStory(payload);
    const ms = Date.now() - t0;
    jobLog(`story job ${jobId} completed storyId=${story.id} ms=${ms}`);
    await prisma.aiGenerationJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        result: { kind: "story", id: story.id },
      },
    });
  } catch (e) {
    const ms = Date.now() - t0;
    const err = formatJobError(e);
    jobLog(`story job ${jobId} FAILED ms=${ms} error=${err}`);
    await prisma.aiGenerationJob.update({
      where: { id: jobId },
      data: { status: "failed", error: err },
    });
  }
}
