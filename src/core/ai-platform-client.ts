/**
 * WebWaka Civic — AI Platform Client
 * Blueprint Reference: Part 6 (AI-Driven Features), Phase 1 Citizen Engagement
 *
 * Provides `getAICompletion()` — the single entrypoint for all LLM text
 * generation across the platform.
 *
 * Provider resolution order:
 *   1. Cloudflare Workers AI binding  (env.AI)
 *   2. OpenAI-compatible HTTP API     (env.AI_API_KEY + env.AI_API_URL)
 *   3. Graceful fallback              (returns structured empty result)
 *
 * The fallback ensures the reporting flow degrades gracefully when no AI
 * provider is configured (e.g., local dev, CI, staging without AI billing).
 *
 * Usage:
 *   import { getAICompletion } from "../../../core/ai-platform-client";
 *   const result = await getAICompletion(env, {
 *     prompt: "Classify this report: ...",
 *     maxTokens: 256,
 *   });
 */

import { createLogger } from "./logger";

const logger = createLogger("ai-platform-client");

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Cloudflare Workers AI binding shape.
 * Using a structural interface so we don't depend on @cloudflare/workers-types.
 */
export interface WorkersAIBinding {
  run(
    model: string,
    inputs: { prompt: string; max_tokens?: number; temperature?: number }
  ): Promise<{ response?: string } | ReadableStream>;
}

export interface AIEnv {
  /** Cloudflare Workers AI binding (set via wrangler.toml ai = { binding = "AI" }) */
  AI?: WorkersAIBinding;
  /** API key for an OpenAI-compatible endpoint */
  AI_API_KEY?: string;
  /** Base URL of OpenAI-compatible endpoint (default: https://api.openai.com/v1) */
  AI_API_URL?: string;
}

export interface AICompletionRequest {
  /** The full prompt to send to the model. */
  prompt: string;
  /** Maximum tokens to generate (default: 512). */
  maxTokens?: number;
  /** Sampling temperature 0–1 (default: 0.2 for deterministic classification). */
  temperature?: number;
}

export type AIProvider = "cloudflare" | "openai-compatible" | "fallback";

export interface AICompletionResult {
  /** Generated text from the model. */
  text: string;
  /** Which provider fulfilled the request. */
  provider: AIProvider;
  /** Model name used. */
  model: string;
  /** True if the result is a no-op fallback (no AI provider configured). */
  isFallback: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CF_DEFAULT_MODEL = "@cf/mistral/mistral-7b-instruct-v0.1";
const OPENAI_DEFAULT_MODEL = "gpt-3.5-turbo-instruct";
const OPENAI_DEFAULT_URL = "https://api.openai.com/v1";

// ─── Implementation ───────────────────────────────────────────────────────────

/**
 * Call the AI platform for a text completion.
 *
 * Resolution order: Cloudflare Workers AI → OpenAI-compatible HTTP → fallback.
 * Never throws — on error returns a fallback result with `isFallback: true`.
 */
export async function getAICompletion(
  env: AIEnv,
  request: AICompletionRequest
): Promise<AICompletionResult> {
  const { prompt, maxTokens = 512, temperature = 0.2 } = request;

  // ── 1. Cloudflare Workers AI ──────────────────────────────────────────────
  if (env.AI) {
    try {
      const response = await env.AI.run(CF_DEFAULT_MODEL, {
        prompt,
        max_tokens: maxTokens,
        temperature,
      });

      if (response instanceof ReadableStream) {
        const text = await streamToText(response);
        return { text: text.trim(), provider: "cloudflare", model: CF_DEFAULT_MODEL, isFallback: false };
      }

      const text = (response as { response?: string }).response ?? "";
      logger.info("AI completion via Cloudflare Workers AI", { model: CF_DEFAULT_MODEL, chars: text.length });
      return { text: text.trim(), provider: "cloudflare", model: CF_DEFAULT_MODEL, isFallback: false };
    } catch (err) {
      logger.warn("Cloudflare Workers AI failed, trying next provider", { error: String(err) });
    }
  }

  // ── 2. OpenAI-Compatible HTTP API ─────────────────────────────────────────
  if (env.AI_API_KEY) {
    try {
      const baseUrl = (env.AI_API_URL ?? OPENAI_DEFAULT_URL).replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_DEFAULT_MODEL,
          prompt,
          max_tokens: maxTokens,
          temperature,
        }),
      });

      if (!res.ok) {
        logger.warn("OpenAI-compatible API non-2xx response", { status: res.status });
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ text?: string }>;
      };
      const text = data.choices?.[0]?.text ?? "";
      logger.info("AI completion via OpenAI-compatible API", { model: OPENAI_DEFAULT_MODEL, chars: text.length });
      return { text: text.trim(), provider: "openai-compatible", model: OPENAI_DEFAULT_MODEL, isFallback: false };
    } catch (err) {
      logger.warn("OpenAI-compatible API failed, using fallback", { error: String(err) });
    }
  }

  // ── 3. Fallback ───────────────────────────────────────────────────────────
  logger.info("No AI provider configured — returning fallback empty completion");
  return { text: "", provider: "fallback", model: "none", isFallback: true };
}

// ─── Triage Helper ────────────────────────────────────────────────────────────

export const REPORT_CATEGORIES = [
  "Infrastructure",
  "Sanitation",
  "Security",
  "Utilities",
  "Environment",
  "Health",
  "Education",
  "Transportation",
  "Other",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface TriageResult {
  category: ReportCategory;
  confidence: number;
  notes: string;
  provider: AIProvider;
  isFallback: boolean;
}

/**
 * Classify a citizen report description into a canonical category.
 *
 * Instructs the model to respond with a JSON object and parses the result.
 * Falls back to `"Other"` with confidence 0 if parsing fails.
 */
export async function triageReport(
  env: AIEnv,
  description: string,
  userCategory?: string
): Promise<TriageResult> {
  const categoryList = REPORT_CATEGORIES.join(" | ");
  const userHint = userCategory ? `\nUser-supplied hint: "${userCategory}"` : "";

  const prompt =
    `You are a civic issue classification assistant for Nigeria. ` +
    `Classify the following citizen report into exactly ONE of these categories:\n` +
    `${categoryList}\n\n` +
    `Guidelines:\n` +
    `- Infrastructure: roads, bridges, streetlights, potholes, public buildings\n` +
    `- Sanitation: waste collection, sewage, drainage, flooding, dirty water\n` +
    `- Security: crime, vandalism, suspicious activity, public safety threats\n` +
    `- Utilities: electricity outages, water supply failures, gas leaks\n` +
    `- Environment: pollution, tree falls, erosion, deforestation, noise\n` +
    `- Health: hospital/clinic issues, public health hazards, disease outbreaks\n` +
    `- Education: school facility problems, access to education\n` +
    `- Transportation: public transit, traffic congestion, parking, road signs\n` +
    `- Other: anything that does not fit the categories above\n` +
    `${userHint}\n\n` +
    `Citizen Report:\n"${description}"\n\n` +
    `Respond with ONLY valid JSON, no explanation:\n` +
    `{"category":"<one of the categories above>","confidence":<0.0 to 1.0>,"notes":"<one-line summary>"}`;

  const completion = await getAICompletion(env, { prompt, maxTokens: 256, temperature: 0.1 });

  if (completion.isFallback || !completion.text) {
    return {
      category: "Other",
      confidence: 0,
      notes: "AI triage unavailable — manually review required",
      provider: completion.provider,
      isFallback: true,
    };
  }

  try {
    const jsonMatch = completion.text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]) as {
      category?: string;
      confidence?: number;
      notes?: string;
    };

    const rawCat = parsed.category ?? "";
    const category = (REPORT_CATEGORIES as readonly string[]).includes(rawCat)
      ? (rawCat as ReportCategory)
      : "Other";

    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0.5;

    const notes = typeof parsed.notes === "string" ? parsed.notes : "";

    return { category, confidence, notes, provider: completion.provider, isFallback: false };
  } catch (err) {
    logger.warn("Failed to parse AI triage JSON", { error: String(err), raw: completion.text });
    return {
      category: "Other",
      confidence: 0,
      notes: "AI response could not be parsed — manually review required",
      provider: completion.provider,
      isFallback: true,
    };
  }
}

// ─── Stream Helper ────────────────────────────────────────────────────────────

async function streamToText(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}
