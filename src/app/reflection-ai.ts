import "server-only";

import { createStructuredCompletion } from "../lib/openrouter";
import {
  analyzeReflectionWithRules,
  type Reflection,
  type ReflectionAnalysis,
} from "./reflection-analysis";
import { buildReflectionAnalysisMessages } from "./reflection-ai-prompt";
import {
  parseReflectionAnalysis,
  REFLECTION_ANALYSIS_VERSION,
  reflectionAnalysisSchema,
} from "./reflection-ai-schema";

export type GeneratedReflectionAnalysis = ReflectionAnalysis & {
  analysisSource: "ai" | "fallback";
  analysisModel: string | null;
  analysisVersion: string;
  analysisGeneratedAt: string;
};

export async function analyzeReflection(
  rawText: string,
  previous: Reflection[],
  entryDate: string,
): Promise<GeneratedReflectionAnalysis> {
  const generatedAt = new Date().toISOString();

  try {
    const { messages, allowedPreviousDates } =
      buildReflectionAnalysisMessages({
        rawText,
        entryDate,
        previous,
      });
    const completion = await createStructuredCompletion({
      messages,
      schema: reflectionAnalysisSchema,
      schemaName: "mindflow_reflection_analysis",
    });
    const analysis = parseReflectionAnalysis(
      completion.content,
      allowedPreviousDates,
    );

    return {
      ...analysis,
      analysisSource: "ai",
      analysisModel: completion.model,
      analysisVersion: REFLECTION_ANALYSIS_VERSION,
      analysisGeneratedAt: generatedAt,
    };
  } catch {
    return {
      ...analyzeReflectionWithRules(rawText, previous, entryDate),
      analysisSource: "fallback",
      analysisModel: null,
      analysisVersion: "mindflow-rules-v1",
      analysisGeneratedAt: generatedAt,
    };
  }
}
