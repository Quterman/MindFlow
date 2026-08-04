import "server-only";

import { createStructuredCompletion } from "../lib/openrouter";
import {
  analyzeReflectionWithRules,
  type ActionVerificationReview,
  type InsightVerificationReview,
  type Reflection,
  type ReflectionAnalysis,
  type ReflectionInsightCandidate,
  type OverviewSignal,
} from "./reflection-analysis";
import {
  buildReflectionVerificationMessages,
  buildReflectionAnalysisMessages,
  buildReflectionOverviewMessages,
} from "./reflection-ai-prompt";
import {
  parseReflectionVerification,
  parseReflectionAnalysis,
  parseReflectionOverview,
  REFLECTION_ANALYSIS_VERSION,
  reflectionAnalysisSchema,
  reflectionOverviewSchema,
  reflectionVerificationSchema,
  selectVerifiedActionSupport,
  selectVerifiedInsightTexts,
  selectVerifiedTodos,
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
    actionCandidates: string[];
    actionReviews: ActionVerificationReview[];
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
    let actionReviews: ActionVerificationReview[] = [];
    let insights: string[] = [];
    let todos: string[] = [];
    let verificationModel: string | null = null;

    if (draft.insightCandidates.length > 0 || draft.todos.length > 0) {
      try {
        const verification = await createStructuredCompletion({
          messages: buildReflectionVerificationMessages({
            rawText,
            insightCandidates: draft.insightCandidates,
            actionCandidates: draft.todos,
          }),
          schema: reflectionVerificationSchema,
          schemaName: "mindflow_reflection_verification",
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
        const parsedVerification = parseReflectionVerification(
          verification.content,
          draft.insightCandidates,
          draft.todos,
        );
        reviews = parsedVerification.insightReviews;
        actionReviews = parsedVerification.actionReviews;
        insights = selectVerifiedInsightTexts(
          draft.insightCandidates,
          reviews,
        );
        todos = selectVerifiedTodos(draft.todos, actionReviews);
      } catch (error) {
        console.error(
          `Reflection verification failed: ${errorMessage(error)}`,
        );
      }
    }

    return {
      summary: draft.summary,
      themes: draft.themes,
      insights,
      todos,
      repeats: draft.repeats,
      overview: {
        ...draft.overview,
        actionSupport: selectVerifiedActionSupport(
          draft.overview.actionSupport,
          draft.todos,
          actionReviews,
        ),
      },
      analysisSource: "ai",
      analysisModel: completion.model,
      analysisVersion: REFLECTION_ANALYSIS_VERSION,
      analysisGeneratedAt: generatedAt,
      analysisUsage: aggregateUsage(usages),
      analysisDiagnostics: {
        candidates: draft.insightCandidates,
        reviews,
        actionCandidates: draft.todos,
        actionReviews,
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

function sumKnown(
  usages: CompletionUsage[],
  key: keyof CompletionUsage,
) {
  const values = usages.map((usage) => usage[key]);
  if (values.some((value) => value === null)) {
    return null;
  }

  return values.reduce<number>((total, value) => total + (value || 0), 0);
}

export async function generateReflectionOverview(
  reflection: Reflection,
  previous: Reflection[],
): Promise<OverviewSignal[]> {
  const { allowedReflectionIds, messages } = buildReflectionOverviewMessages({
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
    allowedReflectionIds,
  );
}
