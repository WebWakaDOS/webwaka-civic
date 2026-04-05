/**
 * WebWaka AI Platform Client — Civic
 * Blueprint Reference: Part 6 (AI-Driven Features)
 *
 * ALL AI calls route through webwaka-ai-platform — vendor-neutral gateway.
 * Env vars required:
 *   AI_PLATFORM_URL   — https://webwaka-ai-platform.workers.dev
 *   AI_PLATFORM_TOKEN — service-to-service bearer token
 *
 * Resolution order (inside the AI platform, not here):
 *   1. Cloudflare Workers AI
 *   2. OpenAI-compatible HTTP API
 *   3. Graceful fallback (empty result)
 *
 * DO NOT call CF AI bindings, OpenAI, or OpenRouter directly from verticals.
 */

import { createLogger } from "./logger";

const logger = createLogger("ai-platform-client");

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AIPlatformEnv {
  AI_PLATFORM_URL?: string;
  AI_PLATFORM_TOKEN?: string;
}

export interface AICompletionRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export type AIProvider = "ai-platform" | "fallback";

export interface AICompletionResult {
  text: string;
  provider: AIProvider;
  model: string;
  isFallback: boolean;
}

// ─── Implementation ─────────────────────────────────────────────────────────

export async function getAICompletion(
  env: AIPlatformEnv,
  request: AICompletionRequest
): Promise<AICompletionResult> {
  const { prompt, maxTokens = 512, temperature = 0.2 } = request;

  if (env.AI_PLATFORM_URL && env.AI_PLATFORM_TOKEN) {
    try {
      const res = await fetch(`${env.AI_PLATFORM_URL}/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AI_PLATFORM_TOKEN}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        logger.warn("AI platform non-2xx response", { status: res.status });
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const text = data.choices?.[0]?.message?.content ?? "";
      const model = data.model ?? "unknown";
      logger.info("AI completion via webwaka-ai-platform", { model, chars: text.length });
      return { text: text.trim(), provider: "ai-platform", model, isFallback: false };
    } catch (err) {
      logger.warn("AI platform request failed, using fallback", { error: String(err) });
    }
  }

  // Fallback — no AI platform configured
  logger.info("AI_PLATFORM_URL/TOKEN not set — returning empty fallback");
  return { text: "", provider: "fallback", model: "none", isFallback: true };
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

