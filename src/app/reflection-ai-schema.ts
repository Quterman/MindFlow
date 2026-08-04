import type {
  InsightVerificationReview,
  ReflectionAnalysisDraft,
  ReflectionInsightCandidate,
  ReflectionOverview,
} from "./reflection-analysis";

export const REFLECTION_ANALYSIS_VERSION = "mindflow-reflection-v5";

const MAX_INSIGHT_CANDIDATES = 8;

export const reflectionOverviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    observations: {
      type: "array",
      minItems: 0,
      maxItems: 2,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 20,
        maxLength: 320,
      },
      description:
        "До двух коротких наблюдений только об изменении, повторе или незавершённой линии между текущей и предыдущими записями. Пустой массив, если подтверждённой динамики нет.",
    },
    actionSupport: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          minLength: 0,
          maxLength: 160,
        },
        rationale: {
          type: "string",
          minLength: 0,
          maxLength: 320,
        },
      },
      required: ["action", "rationale"],
      description:
        "Самое полезное действие из todos текущей записи и объяснение его рычага. Оба поля пустые, если выделить главный шаг нельзя.",
    },
  },
  required: ["observations", "actionSupport"],
} as const;

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
    insightCandidates: {
      type: "array",
      maxItems: MAX_INSIGHT_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            minLength: 8,
            maxLength: 400,
          },
          evidence: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            uniqueItems: true,
            items: {
              type: "string",
              minLength: 6,
              maxLength: 240,
            },
          },
        },
        required: ["text", "evidence"],
      },
      description:
        "Любое количество сильных кандидатов в пределах технического лимита. Пустой массив обязателен, если доказательного инсайта нет.",
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
    actionSupport: reflectionOverviewSchema.properties.actionSupport,
  },
  required: [
    "summary",
    "themes",
    "insightCandidates",
    "todos",
    "repeats",
    "actionSupport",
  ],
} as const;

export const insightVerificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reviews: {
      type: "array",
      minItems: 1,
      maxItems: MAX_INSIGHT_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateId: {
            type: "string",
            minLength: 1,
            maxLength: 40,
          },
          verdict: {
            type: "string",
            enum: ["supported", "rejected"],
          },
          reason: {
            type: "string",
            minLength: 8,
            maxLength: 280,
          },
        },
        required: ["candidateId", "verdict", "reason"],
      },
    },
  },
  required: ["reviews"],
} as const;

export function parseReflectionAnalysis(
  content: string,
  allowedPreviousDates: Set<string>,
  rawText: string,
): ReflectionAnalysisDraft {
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
  const insightCandidates = parseInsightCandidates(
    value.insightCandidates,
    rawText,
  );
  const todos = requiredStringArray(value.todos, 0, 4, 6, 160, "todos");
  const actionSupport = parseActionSupport(value.actionSupport, new Set(todos));

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

  return {
    summary,
    themes,
    insightCandidates,
    todos,
    repeats,
    overview: {
      observations: [],
      actionSupport,
    },
  };
}

export function parseInsightVerification(
  content: string,
  candidates: ReflectionInsightCandidate[],
): InsightVerificationReview[] {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("AI insight verification is not valid JSON.");
  }

  if (!isRecord(value) || !Array.isArray(value.reviews)) {
    throw new Error("AI insight verification must contain reviews.");
  }

  const allowedCandidateIds = new Set(
    candidates.map((candidate) => candidate.id),
  );
  if (value.reviews.length !== allowedCandidateIds.size) {
    throw new Error("AI insight verification did not review every candidate.");
  }

  const reviews = value.reviews.map((review) => {
    if (!isRecord(review)) {
      throw new Error("AI insight verification contains an invalid review.");
    }

    const candidateId = requiredString(
      review.candidateId,
      1,
      40,
      "verification.candidateId",
    );
    if (!allowedCandidateIds.has(candidateId)) {
      throw new Error("AI insight verification referenced an unknown candidate.");
    }

    const verdict = requiredString(
      review.verdict,
      1,
      20,
      "verification.verdict",
    );
    if (verdict !== "supported" && verdict !== "rejected") {
      throw new Error("AI insight verification contains an unknown verdict.");
    }

    return {
      candidateId,
      verdict: verdict === "supported" ? ("supported" as const) : ("rejected" as const),
      reason: requiredString(review.reason, 8, 280, "verification.reason"),
    };
  });

  if (new Set(reviews.map((review) => review.candidateId)).size !== reviews.length) {
    throw new Error("AI insight verification contains duplicate reviews.");
  }

  return reviews;
}

export function selectVerifiedInsightTexts(
  candidates: ReflectionInsightCandidate[],
  reviews: InsightVerificationReview[],
) {
  const acceptedCandidateIds = new Set(
    reviews
      .filter((review) => review.verdict === "supported")
      .map((review) => review.candidateId),
  );

  return candidates
    .filter((candidate) => acceptedCandidateIds.has(candidate.id))
    .map((candidate) => candidate.text);
}

function parseInsightCandidates(
  value: unknown,
  rawText: string,
): ReflectionInsightCandidate[] {
  if (!Array.isArray(value) || value.length > MAX_INSIGHT_CANDIDATES) {
    throw new Error("AI analysis contains invalid insightCandidates.");
  }

  const normalizedRawText = normalizeEvidence(rawText);
  const candidates = value.flatMap((candidate) => {
    if (!isRecord(candidate)) {
      throw new Error("AI analysis contains an invalid insight candidate.");
    }

    const evidence = requiredStringArray(
      candidate.evidence,
      1,
      3,
      6,
      240,
      "insightCandidates.evidence",
    );
    if (
      evidence.some(
        (excerpt) => !normalizedRawText.includes(normalizeEvidence(excerpt)),
      )
    ) {
      return [];
    }

    return [{
      id: "",
      text: requiredString(candidate.text, 8, 400, "insightCandidates.text"),
      evidence,
    }];
  });

  if (new Set(candidates.map((candidate) => candidate.text)).size !== candidates.length) {
    throw new Error("AI analysis contains duplicate insightCandidates.");
  }

  return candidates.map((candidate, index) => ({
    ...candidate,
    id: `insight-${index + 1}`,
  }));
}

function normalizeEvidence(value: string) {
  return value.toLocaleLowerCase("ru").replace(/\s+/g, " ").trim();
}

export function parseReflectionOverview(
  content: string,
  allowedActions: Set<string>,
): ReflectionOverview {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("AI overview is not valid JSON.");
  }

  return parseReflectionOverviewValue(value, allowedActions);
}

function parseReflectionOverviewValue(
  value: unknown,
  allowedActions: Set<string>,
): ReflectionOverview {
  if (!isRecord(value)) {
    throw new Error("AI overview must be an object.");
  }

  const observations = requiredStringArray(
    value.observations,
    0,
    2,
    20,
    320,
    "overview.observations",
  );
  if (!isRecord(value.actionSupport)) {
    throw new Error("AI overview contains invalid action support.");
  }

  const action = requiredString(
    value.actionSupport.action,
    0,
    160,
    "overview.actionSupport.action",
  );
  const rationale = requiredString(
    value.actionSupport.rationale,
    0,
    320,
    "overview.actionSupport.rationale",
  );
  if ((action.length === 0) !== (rationale.length === 0)) {
    throw new Error("AI overview contains incomplete action support.");
  }
  if (action && !allowedActions.has(action)) {
    throw new Error("AI overview referenced an unknown action.");
  }
  return {
    observations,
    actionSupport: action ? { action, rationale } : null,
  };
}

function parseActionSupport(value: unknown, allowedActions: Set<string>) {
  if (!isRecord(value)) {
    throw new Error("AI analysis contains invalid action support.");
  }

  const action = requiredString(
    value.action,
    0,
    160,
    "actionSupport.action",
  );
  const rationale = requiredString(
    value.rationale,
    0,
    320,
    "actionSupport.rationale",
  );
  if ((action.length === 0) !== (rationale.length === 0)) {
    throw new Error("AI analysis contains incomplete action support.");
  }
  if (action && !allowedActions.has(action)) {
    throw new Error("AI analysis referenced an unknown action.");
  }

  return action ? { action, rationale } : null;
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
