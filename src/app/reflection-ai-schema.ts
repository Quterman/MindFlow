import type { ReflectionAnalysis } from "./reflection-analysis";

export const REFLECTION_ANALYSIS_VERSION = "mindflow-reflection-v1";

export const reflectionAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: {
      type: "string",
      minLength: 8,
      maxLength: 700,
      description:
        "Нейтральный краткий итог текущей записи на русском языке, 1–3 предложения.",
    },
    themes: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 2,
        maxLength: 80,
      },
      description: "От одной до пяти конкретных тем текущей записи.",
    },
    insights: {
      type: "array",
      minItems: 1,
      maxItems: 3,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 8,
        maxLength: 400,
      },
      description:
        "Наблюдения, которые прямо следуют из текущей записи, без диагнозов и домыслов.",
    },
    todos: {
      type: "array",
      maxItems: 4,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 6,
        maxLength: 160,
      },
      description:
        "Только действия, явно названные или однозначно задуманные автором текущей записи.",
    },
    repeats: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: {
            type: "string",
            minLength: 3,
            maxLength: 100,
          },
          description: {
            type: "string",
            minLength: 8,
            maxLength: 300,
          },
          previousDate: {
            type: "string",
            pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          },
        },
        required: ["title", "description", "previousDate"],
      },
      description:
        "Только смысловые повторы, подтверждённые одной из переданных предыдущих записей.",
    },
  },
  required: ["summary", "themes", "insights", "todos", "repeats"],
} as const;

export function parseReflectionAnalysis(
  content: string,
  allowedPreviousDates: Set<string>,
): ReflectionAnalysis {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("AI analysis is not valid JSON.");
  }

  if (!isRecord(value)) {
    throw new Error("AI analysis must be an object.");
  }

  const summary = requiredString(value.summary, 8, 700, "summary");
  const themes = requiredStringArray(value.themes, 1, 5, 2, 80, "themes");
  const insights = requiredStringArray(
    value.insights,
    1,
    3,
    8,
    400,
    "insights",
  );
  const todos = requiredStringArray(value.todos, 0, 4, 6, 160, "todos");

  if (!Array.isArray(value.repeats) || value.repeats.length > 3) {
    throw new Error("AI analysis contains invalid repeats.");
  }

  const repeats = value.repeats.map((repeat) => {
    if (!isRecord(repeat)) {
      throw new Error("AI analysis contains an invalid repeat.");
    }

    const previousDate = requiredString(
      repeat.previousDate,
      10,
      10,
      "previousDate",
    );
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(previousDate) ||
      !allowedPreviousDates.has(previousDate)
    ) {
      throw new Error("AI analysis referenced an unknown previous date.");
    }

    return {
      title: requiredString(repeat.title, 3, 100, "repeat.title"),
      description: requiredString(
        repeat.description,
        8,
        300,
        "repeat.description",
      ),
      previousDate,
    };
  });

  return { summary, themes, insights, todos, repeats };
}

function requiredStringArray(
  value: unknown,
  minimumItems: number,
  maximumItems: number,
  minimumLength: number,
  maximumLength: number,
  field: string,
) {
  if (
    !Array.isArray(value) ||
    value.length < minimumItems ||
    value.length > maximumItems
  ) {
    throw new Error(`AI analysis contains invalid ${field}.`);
  }

  const items = value.map((item) =>
    requiredString(item, minimumLength, maximumLength, field),
  );
  if (new Set(items).size !== items.length) {
    throw new Error(`AI analysis contains duplicate ${field}.`);
  }

  return items;
}

function requiredString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  field: string,
) {
  if (typeof value !== "string") {
    throw new Error(`AI analysis contains invalid ${field}.`);
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength
  ) {
    throw new Error(`AI analysis contains invalid ${field}.`);
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
