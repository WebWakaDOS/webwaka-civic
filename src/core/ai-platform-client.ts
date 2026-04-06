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


// ─── Civic-specific AI types and triageReport ─────────────────────────────────

/** Minimal type for the Cloudflare Workers AI binding */
export interface WorkersAIBinding {
  run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}

/** Environment expected by triageReport */
export interface AIEnv {
  AI?: WorkersAIBinding;
  AI_PLATFORM_URL?: string;
  AI_PLATFORM_TOKEN?: string;
}

/** Categories the AI triage can assign */
export const REPORT_CATEGORIES = [
  "Infrastructure",
  "Security",
  "Health",
  "Environment",
  "Governance",
  "Education",
  "Social",
  "Sanitation",
  "Other",
] as const;

export type ReportCategory = typeof REPORT_CATEGORIES[number];

export interface TriageResult {
  category: ReportCategory;
  confidence: number;
  notes: string;
  isFallback: boolean;
  provider?: "cloudflare" | "ai-platform" | "fallback";
}

const TRIAGE_PROMPT_PREFIX = `You are a civic issue classification assistant. Given a citizen's report description, classify it into exactly one of these categories: Infrastructure, Security, Health, Environment, Governance, Education, Social, Other.

Respond ONLY with valid JSON in this exact format:
{"category": "Infrastructure", "confidence": 0.95, "notes": "Brief reason"}

Report description: `;

/**
 * Classify a citizen report description using AI.
 * Tries CF Workers AI binding first (via env.AI), then falls back to AI platform HTTP, then returns a safe fallback.
 * Never throws — failure is non-blocking.
 */
export async function triageReport(
  env: AIEnv,
  description: string
): Promise<TriageResult> {
  const prompt = `${TRIAGE_PROMPT_PREFIX}${description}`;

  // 1. Try Cloudflare Workers AI binding
  if (env.AI) {
    try {
      const rawResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
        messages: [{ role: "user", content: prompt }],
        max_tokens: 128,
        temperature: 0.1,
      }) as { response?: string } | undefined;

      const text = (rawResponse as { response?: string })?.response ?? "";
      const parsed = parseTriageResponse(text);
      if (parsed) {
        logger.info("AI triage via CF Workers AI", { category: parsed.category });
        return { ...parsed, isFallback: false, provider: "cloudflare" as const };
      }
    } catch (err) {
      logger.warn("CF Workers AI triage failed", { error: String(err) });
    }
  }

  // 2. Try webwaka-ai-platform HTTP
  if (env.AI_PLATFORM_URL && env.AI_PLATFORM_TOKEN) {
    try {
      const completion = await getAICompletion(env, { prompt, maxTokens: 128, temperature: 0.1 });
      if (!completion.isFallback) {
        const parsed = parseTriageResponse(completion.text);
        if (parsed) {
          logger.info("AI triage via AI platform", { category: parsed.category });
          return { ...parsed, isFallback: false, provider: "ai-platform" as const };
        }
      }
    } catch (err) {
      logger.warn("AI platform triage failed", { error: String(err) });
    }
  }

  // 3. Fallback — no AI available
  logger.info("AI triage fallback — no AI provider configured");
  return {
    category: "Other",
    confidence: 0.0,
    notes: "AI triage unavailable — manual review required.",
    isFallback: true,
    provider: "fallback" as const,
  };
}

function parseTriageResponse(text: string): Omit<TriageResult, "isFallback"> | null {
  try {
    // Extract JSON from text (may have surrounding whitespace/markdown)
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { category?: string; confidence?: number; notes?: string };
    const category = REPORT_CATEGORIES.find((c) => c === parsed.category) ?? "Other";
    const confidence = Math.min(1, Math.max(0, Number(parsed.confidence ?? 0)));
    const notes = String(parsed.notes ?? "");
    return { category, confidence, notes };
  } catch {
    return null;
  }
}
