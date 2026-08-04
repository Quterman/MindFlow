import "server-only";

import { createStructuredCompletion } from "../lib/openrouter";
import {
  analyzeReflectionWithRules,
  type InsightVerificationReview,
  type Reflection,
  type ReflectionAnalysis,
  type ReflectionInsightCandidate,
  type ReflectionOverview,
} from "./reflection-analysis";
import {
  buildInsightVerificationMessages,
  buildReflectionAnalysisMessages,
  buildReflectionOverviewMessages,
} from "./reflection-ai-prompt";
import {
  insightVerificationSchema,
  parseInsightVerification,
  parseReflectionAnalysis,
  parseReflectionOverview,
  REFLECTION_ANALYSIS_VERSION,
  reflectionAnalysisSchema,
  reflectionOverviewSchema,
  selectVerifiedInsightTexts,
} from "./reflection-ai-schema";

export type GeneratedReflectionAnalysis = ReflectionAnalysis & {
  analysisSource: "ai" | "fallback";
  analysisModel: string | null;
  analysisVersion: string;
  analysisGeneratedAt: string;
  analysisUsage: ReflectionAnalysisUsage | null;
  analysisDiagnostics: {
    candidates: ReflectionInsightCandidate[];
    reviews: InsightVerificationReview[];
    verificationModel: string | null;
  } | null;
};

const DEFAULT_VERIFICATION_MODEL = "google/gemini-3.1-pro-preview";

export type ReflectionAnalysisUsage = {
  calls: number;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  upstreamCostUsd: number | null;
};

type CompletionUsage = NonNullable<
  Awaited<ReturnType<typeof createStructuredCompletion>>["usage"]
>;

export async function analyzeReflection(
  rawText: string,
  previous: Reflection[],
  entryDate: string,
): Promise<GeneratedReflectionAnalysis> {
  const generatedAt = new Date().toISOString();
  const usages: CompletionUsage[] = [];

  try {
    const { messages, allowedPreviousDates } =
      buildReflectionAnalysisMessages({
        rawText,
        entryDate,
        previous,
      });
    const completion = await createStructuredCompletion({
      maxTokens: 2_400,
      messages,
      schema: reflectionAnalysisSchema,
      schemaName: "mindflow_reflection_analysis",
    });
    if (completion.usage) {
      usages.push(completion.usage);
    }
    const draft = parseReflectionAnalysis(
      completion.content,
      allowedPreviousDates,
      rawText,
    );
    let reviews: InsightVerificationReview[] = [];
    let insights: string[] = [];
    let verificationModel: string | null = null;

    if (draft.insightCandidates.length > 0) {
      try {
        const verification = await createStructuredCompletion({
          messages: buildInsightVerificationMessages({
            rawText,
            candidates: draft.insightCandidates,
          }),
          schema: insightVerificationSchema,
          schemaName: "mindflow_insight_verification",
          maxTokens: 3_000,
          model:
            process.env.OPENROUTER_VERIFICATION_MODEL ||
            DEFAULT_VERIFICATION_MODEL,
          reasoningEffort: "low",
          temperature: 0,
        });
        verificationModel = verification.model;
        if (verification.usage) {
          usages.push(verification.usage);
        }
        reviews = parseInsightVerification(
          verification.content,
          draft.insightCandidates,
        );
        insights = selectVerifiedInsightTexts(
          draft.insightCandidates,
          reviews,
        );
      } catch (error) {
        console.error(
          `Reflection insight verification failed: ${errorMessage(error)}`,
        );
      }
    }

    const analysisUsage = aggregateUsage(usages);
    console.info(
      "MindFlow reflection analysis usage",
      JSON.stringify({ version: REFLECTION_ANALYSIS_VERSION, analysisUsage }),
    );

    return {
      summary: draft.summary,
      themes: draft.themes,
      insights,
      todos: draft.todos,
      repeats: draft.repeats,
      overview: draft.overview,
      analysisSource: "ai",
      analysisModel: completion.model,
      analysisVersion: REFLECTION_ANALYSIS_VERSION,
      analysisGeneratedAt: generatedAt,
      analysisUsage,
      analysisDiagnostics: {
        candidates: draft.insightCandidates,
        reviews,
        verificationModel,
      },
    };
  } catch (error) {
    console.error(`Reflection AI analysis failed: ${errorMessage(error)}`);
    return {
      ...analyzeReflectionWithRules(rawText, previous, entryDate),
      analysisSource: "fallback",
      analysisModel: null,
      analysisVersion: "mindflow-rules-v1",
      analysisGeneratedAt: generatedAt,
      analysisUsage: aggregateUsage(usages),
      analysisDiagnostics: null,
    };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : "UnknownError";
}

function aggregateUsage(
  usages: CompletionUsage[],
): ReflectionAnalysisUsage | null {
  if (usages.length === 0) {
    return null;
  }

  return {
    calls: usages.length,
    promptTokens: sumKnown(usages, "promptTokens"),
    completionTokens: sumKnown(usages, "completionTokens"),
    reasoningTokens: sumKnown(usages, "reasoningTokens"),
    totalTokens: sumKnown(usages, "totalTokens"),
    costUsd: sumKnown(usages, "costUsd"),
    upstreamCostUsd: sumKnown(usages, "upstreamCostUsd"),
  };
}

function sumKnown(usages: CompletionUsage[], key: keyof CompletionUsage) {
  const values = usages.map((usage) => usage[key]);
  if (values.some((value) => value === null)) {
    return null;
  }

  return values.reduce<number>((total, value) => total + (value || 0), 0);
}

export async function generateReflectionOverview(
  reflection: Reflection,
  previous: Reflection[],
): Promise<ReflectionOverview> {
  const { messages } = buildReflectionOverviewMessages({
    reflection,
    previous,
  });
  const completion = await createStructuredCompletion({
    messages,
    schema: reflectionOverviewSchema,
    schemaName: "mindflow_reflection_overview",
  });

  return parseReflectionOverview(
    completion.content,
    new Set(reflection.todos),
  );
}
