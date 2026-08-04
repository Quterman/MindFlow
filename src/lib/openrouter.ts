import "server-only";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 28_000;
const RETRY_DELAY_MS = 400;

type OpenRouterMessage = {
  role: "system" | "user";
  content: string;
};

type StructuredCompletionInput = {
  maxTokens?: number;
  messages: OpenRouterMessage[];
  schema: Record<string, unknown>;
  schemaName: string;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
  temperature?: number | null;
};

type OpenRouterResponse = {
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    total_tokens?: unknown;
    cost?: unknown;
    cost_details?: {
      upstream_inference_cost?: unknown;
    };
    completion_tokens_details?: {
      reasoning_tokens?: unknown;
    };
  };
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

export async function createStructuredCompletion(
  input: StructuredCompletionInput,
) {
  const { apiKey, model } = getOpenRouterConfig();
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_SITE_URL ||
            "https://mind-flow-zeta-pearl.vercel.app",
          "X-OpenRouter-Title": "MindFlow",
        },
        body: JSON.stringify({
          model: input.model || model,
          messages: input.messages,
          max_tokens: input.maxTokens ?? 1_400,
          provider: {
            require_parameters: true,
            zdr: true,
          },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.schema,
            },
          },
          ...(input.reasoningEffort
            ? { reasoning: { effort: input.reasoningEffort } }
            : {}),
          stream: false,
          ...(input.temperature === null
            ? {}
            : { temperature: input.temperature ?? 0.2 }),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = new Error(`OpenRouter request failed: ${response.status}`);
        if (attempt === 0 && isRetryableStatus(response.status)) {
          lastError = error;
          await wait(RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }

      const payload = (await response.json()) as OpenRouterResponse;
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("OpenRouter returned an empty structured response.");
      }

      return {
        content,
        model:
          typeof payload.model === "string" && payload.model
            ? payload.model
            : input.model || model,
        usage: parseUsage(payload.usage),
      };
    } catch (error) {
      lastError = error;
      if (
        attempt === 0 &&
        error instanceof TypeError &&
        !controller.signal.aborted
      ) {
        await wait(RETRY_DELAY_MS);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OpenRouter request failed.");
}

function parseUsage(usage: OpenRouterResponse["usage"]) {
  if (!usage) {
    return null;
  }

  return {
    promptTokens: nonNegativeNumber(usage.prompt_tokens),
    completionTokens: nonNegativeNumber(usage.completion_tokens),
    reasoningTokens: nonNegativeNumber(
      usage.completion_tokens_details?.reasoning_tokens,
    ),
    totalTokens: nonNegativeNumber(usage.total_tokens),
    costUsd: nonNegativeNumber(usage.cost),
    upstreamCostUsd: nonNegativeNumber(
      usage.cost_details?.upstream_inference_cost,
    ),
  };
}

function nonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) {
    throw new Error(
      "OpenRouter is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL.",
    );
  }

  return { apiKey, model };
}

function isRetryableStatus(status: number) {
  return status === 502 || status === 503 || status === 504;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
