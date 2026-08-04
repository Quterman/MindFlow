import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalysisSource,
  Reflection,
  ReflectionOverview,
} from "./reflection-analysis";
import {
  analyzeReflection,
  generateReflectionOverview,
} from "./reflection-ai";
import { buildOverviewSourceSignature } from "./reflection-history";

type ReflectionRow = {
  id: string;
  entry_date: string;
  raw_text: string;
  transcript: string;
  summary: string;
  themes: unknown;
  insights: unknown;
  todos: unknown;
  completed_todos: unknown;
  repeats: unknown;
  overview?: unknown;
  analysis_source?: unknown;
  analysis_model?: unknown;
  analysis_version?: unknown;
  analysis_generated_at?: unknown;
  created_at: string;
  updated_at: string;
};

export async function listReflections(
  supabase: SupabaseClient,
  userId: string,
): Promise<Reflection[]> {
  const { data, error } = await supabase
    .from("mindflow_entries")
    .select("*")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as ReflectionRow[]).map(rowToReflection);
}

export async function createReflection(
  supabase: SupabaseClient,
  userId: string,
  input: { rawText: string; entryDate?: string },
) {
  const entryDate = input.entryDate || today();
  const previous = (await listReflections(supabase, userId)).filter(
    (item) => item.entryDate <= entryDate,
  );
  const analysis = await analyzeReflection(input.rawText, previous, entryDate);
  const { data, error } = await supabase
    .from("mindflow_entries")
    .insert({
      analysis_generated_at: analysis.analysisGeneratedAt,
      analysis_model: analysis.analysisModel,
      analysis_source: analysis.analysisSource,
      analysis_version: analysis.analysisVersion,
      completed_todos: [],
      entry_date: entryDate,
      insights: analysis.insights,
      overview: analysis.overview,
      raw_text: input.rawText,
      repeats: analysis.repeats,
      summary: analysis.summary,
      themes: analysis.themes,
      todos: analysis.todos,
      transcript: input.rawText,
      user_id: userId,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return rowToReflection(data as ReflectionRow);
}

export async function updateReflection(
  supabase: SupabaseClient,
  userId: string,
  input: {
    id: string;
    rawText: string;
    entryDate?: string;
    summary?: string;
  },
) {
  const existing = await findReflection(supabase, userId, input.id);
  if (!existing) {
    return null;
  }

  if (input.summary !== undefined) {
    const { data, error } = await supabase
      .from("mindflow_entries")
      .update({
        summary: input.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? rowToReflection(data as ReflectionRow) : null;
  }

  const nextDate = input.entryDate || existing.entryDate;
  const previous = (await listReflections(supabase, userId)).filter(
    (item) => item.id !== input.id && item.entryDate <= nextDate,
  );
  const analysis = await analyzeReflection(input.rawText, previous, nextDate);
  const completedTodos = existing.completedTodos.filter((todo) =>
    analysis.todos.includes(todo),
  );
  const { data, error } = await supabase
    .from("mindflow_entries")
    .update({
      analysis_generated_at: analysis.analysisGeneratedAt,
      analysis_model: analysis.analysisModel,
      analysis_source: analysis.analysisSource,
      analysis_version: analysis.analysisVersion,
      completed_todos: completedTodos,
      entry_date: nextDate,
      insights: analysis.insights,
      overview: analysis.overview,
      raw_text: input.rawText,
      repeats: analysis.repeats,
      summary: analysis.summary,
      themes: analysis.themes,
      todos: analysis.todos,
      transcript: input.rawText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? rowToReflection(data as ReflectionRow) : null;
}

export async function deleteReflection(
  supabase: SupabaseClient,
  userId: string,
  id: string,
) {
  const { error } = await supabase
    .from("mindflow_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
}

export async function updateCompletedTodos(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  completedTodos: string[],
) {
  const existing = await findReflection(supabase, userId, id);
  if (!existing) {
    return { status: "not-found" as const };
  }

  if (completedTodos.some((todo) => !existing.todos.includes(todo))) {
    return { status: "invalid-todo" as const };
  }

  const normalizedCompletedTodos = existing.todos.filter((todo) =>
    completedTodos.includes(todo),
  );

  if (
    normalizedCompletedTodos.length === existing.completedTodos.length &&
    normalizedCompletedTodos.every(
      (todo, index) => todo === existing.completedTodos[index],
    )
  ) {
    return { status: "updated" as const, reflection: existing };
  }

  const { data, error } = await supabase
    .from("mindflow_entries")
    .update({
      completed_todos: normalizedCompletedTodos,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return { status: "not-found" as const };
  }

  return {
    status: "updated" as const,
    reflection: rowToReflection(data as ReflectionRow),
  };
}

export async function generateAndStoreReflectionOverview(
  supabase: SupabaseClient,
  userId: string,
  id: string,
) {
  const existing = await findReflection(supabase, userId, id);
  if (!existing) {
    return null;
  }
  const eligibleEntries = (await listReflections(supabase, userId)).filter(
    (item) => item.entryDate <= existing.entryDate,
  );
  if (eligibleEntries.length < 3) {
    return existing;
  }

  const signalsSource = buildOverviewSourceSignature(eligibleEntries);
  if (
    existing.overview?.signals !== null &&
    existing.overview?.signalsSource === signalsSource
  ) {
    return existing;
  }

  const previous = eligibleEntries.filter((item) => item.id !== id);
  const signals = await generateReflectionOverview(existing, previous);
  const overview: ReflectionOverview = {
    signals,
    signalsSource,
    actionSupport: existing.overview?.actionSupport || null,
  };
  const { data, error } = await supabase
    .from("mindflow_entries")
    .update({
      overview,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? rowToReflection(data as ReflectionRow) : null;
}

export async function reanalyzeStoredReflection(
  supabase: SupabaseClient,
  userId: string,
  id: string,
) {
  const existing = await findReflection(supabase, userId, id);
  if (!existing) {
    return null;
  }

  const previous = (await listReflections(supabase, userId)).filter(
    (item) => item.id !== id && item.entryDate <= existing.entryDate,
  );
  const analysis = await analyzeReflection(
    existing.rawText,
    previous,
    existing.entryDate,
  );
  const completedTodos = existing.completedTodos.filter((todo) =>
    analysis.todos.includes(todo),
  );
  const { data, error } = await supabase
    .from("mindflow_entries")
    .update({
      analysis_generated_at: analysis.analysisGeneratedAt,
      analysis_model: analysis.analysisModel,
      analysis_source: analysis.analysisSource,
      analysis_version: analysis.analysisVersion,
      completed_todos: completedTodos,
      insights: analysis.insights,
      overview: analysis.overview,
      repeats: analysis.repeats,
      summary: analysis.summary,
      themes: analysis.themes,
      todos: analysis.todos,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? rowToReflection(data as ReflectionRow) : null;
}

export async function findReflection(
  supabase: SupabaseClient,
  userId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from("mindflow_entries")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? rowToReflection(data as ReflectionRow) : null;
}

function rowToReflection(row: ReflectionRow): Reflection {
  const todos = stringArray(row.todos);
  const storedCompletedTodos = new Set(stringArray(row.completed_todos));

  return {
    id: row.id,
    entryDate: row.entry_date,
    rawText: row.raw_text,
    transcript: row.transcript,
    summary: row.summary,
    themes: stringArray(row.themes),
    insights: stringArray(row.insights),
    todos,
    completedTodos: todos.filter((todo) => storedCompletedTodos.has(todo)),
    repeats: repeatArray(row.repeats),
    overview: overviewValue(row.overview, new Set(todos)),
    analysisSource: analysisSource(row.analysis_source),
    analysisModel: nullableString(row.analysis_model),
    analysisVersion: nullableString(row.analysis_version),
    analysisGeneratedAt: nullableString(row.analysis_generated_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function overviewValue(
  value: unknown,
  allowedActions: Set<string>,
): ReflectionOverview | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const signals =
    "signals" in value && Array.isArray(value.signals)
      ? overviewSignalArray(value.signals)
      : null;
  const signalsSource =
    "signalsSource" in value &&
    typeof value.signalsSource === "string" &&
    value.signalsSource.length > 0
      ? value.signalsSource
      : null;

  const actionSupport =
    "actionSupport" in value &&
    typeof value.actionSupport === "object" &&
    value.actionSupport !== null &&
    !Array.isArray(value.actionSupport) &&
    "action" in value.actionSupport &&
    typeof value.actionSupport.action === "string" &&
    "rationale" in value.actionSupport &&
    typeof value.actionSupport.rationale === "string" &&
    value.actionSupport.action.trim().length > 0 &&
    value.actionSupport.rationale.trim().length > 0 &&
    allowedActions.has(value.actionSupport.action)
      ? {
          action: value.actionSupport.action.trim(),
          rationale: value.actionSupport.rationale.trim(),
        }
      : null;

  return { signals, signalsSource, actionSupport };
}

function overviewSignalArray(
  value: unknown[],
): NonNullable<ReflectionOverview["signals"]> {
  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      !("kind" in item) ||
      (item.kind !== "unfinished_intention" &&
        item.kind !== "recurring_blocker" &&
        item.kind !== "untested_hypothesis") ||
      !("title" in item) ||
      typeof item.title !== "string" ||
      !("finding" in item) ||
      typeof item.finding !== "string" ||
      !("evidenceReflectionIds" in item) ||
      !Array.isArray(item.evidenceReflectionIds)
    ) {
      return [];
    }

    const evidenceReflectionIds = item.evidenceReflectionIds.filter(
      (reflectionId): reflectionId is string => typeof reflectionId === "string",
    );
    if (evidenceReflectionIds.length < 3) {
      return [];
    }

    return [
      {
        kind: item.kind,
        title: item.title.trim(),
        finding: item.finding.trim(),
        evidenceReflectionIds,
        recommendation:
          "recommendation" in item &&
          typeof item.recommendation === "string" &&
          item.recommendation.trim().length > 0
            ? item.recommendation.trim()
            : null,
      },
    ];
  });
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function repeatArray(value: unknown): Reflection["repeats"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Reflection["repeats"][number] =>
      typeof item === "object" &&
      item !== null &&
      "title" in item &&
      typeof item.title === "string" &&
      "description" in item &&
      typeof item.description === "string" &&
      "previousDate" in item &&
      typeof item.previousDate === "string",
  );
}

function analysisSource(value: unknown): AnalysisSource {
  return value === "ai" || value === "fallback" ? value : "legacy";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
