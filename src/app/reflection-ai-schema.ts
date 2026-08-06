import type {
  ActionVerificationReview,
  InsightFinalizationCoverage,
  InsightVerificationReview,
  OverviewSignal,
  ReflectionAnalysisDraft,
  ReflectionInsightCandidate,
  SuggestedActionVerificationReview,
} from "./reflection-analysis";

export const REFLECTION_ANALYSIS_VERSION = "mindflow-reflection-v11";

const MAX_INSIGHT_CANDIDATES = 8;
const MAX_INSIGHT_COVERAGE_LINES = 10;

export const reflectionOverviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    signals: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: [
              "unfinished_intention",
              "recurring_blocker",
              "untested_hypothesis",
            ],
          },
          title: {
            type: "string",
            minLength: 4,
            maxLength: 100,
            description:
              "Обезличенный заголовок наблюдаемого сигнала без внешнего описания владельца дневника.",
          },
          finding: {
            type: "string",
            minLength: 20,
            maxLength: 420,
            description:
              "Обезличенный факт и практическое следствие без слов автор или пользователь.",
          },
          evidenceReflectionIds: {
            type: "array",
            minItems: 3,
            maxItems: 8,
            uniqueItems: true,
            items: {
              type: "string",
              minLength: 1,
              maxLength: 80,
            },
          },
          recommendation: {
            type: "string",
            minLength: 0,
            maxLength: 320,
            description:
              "Один мягкий конкретный следующий шаг на ты. Пустая строка, если совет не следует из сигнала.",
          },
        },
        required: [
          "kind",
          "title",
          "finding",
          "evidenceReflectionIds",
          "recommendation",
        ],
      },
      description:
        "До трёх доказательных сигналов. Пустой массив обязателен, если подтверждённого полезного сигнала нет.",
    },
  },
  required: ["signals"],
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
        "Нейтральный обезличенный итог текущей записи на русском языке, 1–3 предложения, без внешнего описания владельца дневника.",
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
        "Только действия, намерение выполнить которые явно названо или однозначно сформулировано в текущей записи.",
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
        "Самое полезное действие из todos текущей записи и объяснение его эффекта. Оба поля пустые, если выделить главный шаг нельзя.",
    },
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

export const reflectionVerificationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reviews: {
      type: "array",
      minItems: 0,
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
    actionReviews: {
      type: "array",
      minItems: 0,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          candidateIds: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            uniqueItems: true,
            items: {
              type: "string",
              minLength: 1,
              maxLength: 40,
            },
          },
          verdict: {
            type: "string",
            enum: ["supported", "rejected"],
          },
          normalizedAction: {
            type: "string",
            minLength: 0,
            maxLength: 160,
            description:
              "Естественная самодостаточная задача с сохранением необходимого контекста из записи. Пустая строка для rejected.",
          },
          reason: {
            type: "string",
            minLength: 8,
            maxLength: 280,
          },
        },
        required: [
          "candidateIds",
          "verdict",
          "normalizedAction",
          "reason",
        ],
      },
    },
    suggestedAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        insightCandidateId: {
          type: "string",
          minLength: 0,
          maxLength: 40,
        },
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
      required: ["insightCandidateId", "action", "rationale"],
    },
  },
  required: ["reviews", "actionReviews", "suggestedAction"],
} as const;

export const reflectionInsightFinalizationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    coverage: {
      type: "array",
      minItems: 1,
      maxItems: MAX_INSIGHT_COVERAGE_LINES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: {
            type: "string",
            minLength: 4,
            maxLength: 120,
          },
          disposition: {
            type: "string",
            enum: ["insight", "summary", "action", "repeat", "context"],
          },
          insightText: {
            type: "string",
            minLength: 0,
            maxLength: 240,
          },
          reason: {
            type: "string",
            minLength: 8,
            maxLength: 280,
          },
        },
        required: ["topic", "disposition", "insightText", "reason"],
      },
      description:
        "Проверка покрытия всех крупных смысловых линий текущей записи.",
    },
    insights: {
      type: "array",
      maxItems: MAX_INSIGHT_CANDIDATES,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: {
            type: "string",
            minLength: 8,
            maxLength: 240,
            description:
              "Одна короткая мысль обычным русским языком: конкретный факт и понятное следствие, без канцелярита и аналитического жаргона.",
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
        "Полный итоговый набор доказательных инсайтов после исправления и проверки покрытия.",
    },
  },
  required: ["coverage", "insights"],
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

  const summary = requiredNeutralString(value.summary, 8, 700, "summary");
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
      title: requiredNeutralString(repeat.title, 3, 100, "repeat.title"),
      description: requiredNeutralString(
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
      signals: null,
      signalsSource: null,
      actionSupport,
      suggestedAction: null,
    },
  };
}

export function parseReflectionVerification(
  content: string,
  insightCandidates: ReflectionInsightCandidate[],
  actionCandidates: string[],
): {
  insightReviews: InsightVerificationReview[];
  actionReviews: ActionVerificationReview[];
  suggestedAction: SuggestedActionVerificationReview | null;
} {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("AI reflection verification is not valid JSON.");
  }

  if (
    !isRecord(value) ||
    !Array.isArray(value.reviews) ||
    !Array.isArray(value.actionReviews) ||
    !isRecord(value.suggestedAction)
  ) {
    throw new Error("AI reflection verification must contain all reviews.");
  }

  const allowedCandidateIds = new Set(
    insightCandidates.map((candidate) => candidate.id),
  );
  if (value.reviews.length !== allowedCandidateIds.size) {
    throw new Error("AI insight verification did not review every candidate.");
  }

  const insightReviews = value.reviews.map((review) => {
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
    const normalizedVerdict =
      verdict === "supported" ? ("supported" as const) : ("rejected" as const);

    return {
      candidateId,
      verdict: normalizedVerdict,
      reason: requiredString(
        review.reason,
        8,
        280,
        "verification.reason",
      ),
    };
  });

  if (
    new Set(insightReviews.map((review) => review.candidateId)).size !==
    insightReviews.length
  ) {
    throw new Error("AI insight verification contains duplicate reviews.");
  }

  const allowedActionIds = new Set(
    actionCandidates.map((_, index) => `action-${index + 1}`),
  );

  const actionReviews = value.actionReviews.map((review) => {
    if (!isRecord(review)) {
      throw new Error("AI action verification contains an invalid review.");
    }

    const candidateIds = requiredStringArray(
      review.candidateIds,
      1,
      4,
      1,
      40,
      "actionVerification.candidateIds",
    );
    if (candidateIds.some((candidateId) => !allowedActionIds.has(candidateId))) {
      throw new Error("AI action verification referenced an unknown candidate.");
    }

    const verdict = requiredString(
      review.verdict,
      1,
      20,
      "actionVerification.verdict",
    );
    if (verdict !== "supported" && verdict !== "rejected") {
      throw new Error("AI action verification contains an unknown verdict.");
    }

    const normalizedAction = requiredString(
      review.normalizedAction,
      verdict === "supported" ? 6 : 0,
      verdict === "supported" ? 160 : 0,
      "actionVerification.normalizedAction",
    );

    return {
      candidateIds,
      verdict:
        verdict === "supported"
          ? ("supported" as const)
          : ("rejected" as const),
      normalizedAction,
      reason: requiredString(
        review.reason,
        8,
        280,
        "actionVerification.reason",
      ),
    };
  });

  const reviewedActionIds = actionReviews.flatMap(
    (review) => review.candidateIds,
  );
  if (
    reviewedActionIds.length !== allowedActionIds.size ||
    new Set(reviewedActionIds).size !== allowedActionIds.size ||
    reviewedActionIds.some((candidateId) => !allowedActionIds.has(candidateId))
  ) {
    throw new Error("AI action verification did not group every candidate once.");
  }

  const suggestedAction = parseSuggestedActionVerification(
    value.suggestedAction,
    insightCandidates,
    insightReviews,
  );

  return { insightReviews, actionReviews, suggestedAction };
}

export function parseReflectionInsightFinalization(
  content: string,
  rawText: string,
): {
  insights: ReflectionInsightCandidate[];
  coverage: InsightFinalizationCoverage[];
} {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("AI insight finalization is not valid JSON.");
  }

  if (
    !isRecord(value) ||
    !Array.isArray(value.coverage) ||
    value.coverage.length < 1 ||
    value.coverage.length > MAX_INSIGHT_COVERAGE_LINES
  ) {
    throw new Error("AI insight finalization must contain coverage.");
  }

  const insights = parseInsightCandidates(value.insights, rawText);
  if (insights.some(hasBureaucraticInsightLanguage)) {
    throw new Error("AI insight finalization contains bureaucratic wording.");
  }
  const insightByText = new Map(
    insights.map((insight) => [normalizeEvidence(insight.text), insight.text]),
  );
  const coverage = value.coverage.map((item) => {
    if (!isRecord(item)) {
      throw new Error("AI insight finalization contains invalid coverage.");
    }

    const disposition = requiredString(
      item.disposition,
      1,
      20,
      "insightFinalization.coverage.disposition",
    );
    if (
      disposition !== "insight" &&
      disposition !== "summary" &&
      disposition !== "action" &&
      disposition !== "repeat" &&
      disposition !== "context"
    ) {
      throw new Error("AI insight finalization contains unknown disposition.");
    }

    const insightText = requiredNeutralString(
      item.insightText,
      disposition === "insight" ? 8 : 0,
      disposition === "insight" ? 400 : 0,
      "insightFinalization.coverage.insightText",
    );
    if (
      disposition === "insight" &&
      !insightByText.has(normalizeEvidence(insightText))
    ) {
      throw new Error("AI insight coverage referenced an unknown insight.");
    }

    return {
      topic: requiredString(
        item.topic,
        4,
        120,
        "insightFinalization.coverage.topic",
      ),
      disposition: disposition as InsightFinalizationCoverage["disposition"],
      insightText:
        disposition === "insight"
          ? insightByText.get(normalizeEvidence(insightText)) || insightText
          : "",
      reason: requiredString(
        item.reason,
        8,
        280,
        "insightFinalization.coverage.reason",
      ),
    };
  });

  const coveredInsightKeys = coverage
    .filter((item) => item.disposition === "insight")
    .map((item) => normalizeEvidence(item.insightText));
  if (
    new Set(coveredInsightKeys).size !== coveredInsightKeys.length ||
    coveredInsightKeys.length !== insightByText.size ||
    [...insightByText.keys()].some((key) => !coveredInsightKeys.includes(key))
  ) {
    throw new Error("AI insight finalization did not cover every insight once.");
  }

  const safeInsights = insights.filter(hasExplicitlySupportedCausality);
  const safeInsightKeys = new Set(
    safeInsights.map((insight) => normalizeEvidence(insight.text)),
  );
  const safeCoverage = coverage.map((item) =>
    item.disposition === "insight" &&
    !safeInsightKeys.has(normalizeEvidence(item.insightText))
      ? {
          ...item,
          disposition: "context" as const,
          insightText: "",
          reason:
            "Заявленная причинная связь не подтверждена выбранными evidence.",
        }
      : item,
  );

  return { insights: safeInsights, coverage: safeCoverage };
}

function parseSuggestedActionVerification(
  value: unknown,
  insightCandidates: ReflectionInsightCandidate[],
  insightReviews: InsightVerificationReview[],
): SuggestedActionVerificationReview | null {
  if (!isRecord(value)) {
    return null;
  }

  try {
    const insightCandidateId = requiredString(
      value.insightCandidateId,
      0,
      40,
      "suggestedAction.insightCandidateId",
    );
    const action = requiredNeutralString(
      value.action,
      0,
      160,
      "suggestedAction.action",
    );
    const rationale = requiredNeutralString(
      value.rationale,
      0,
      320,
      "suggestedAction.rationale",
    );
    if (!insightCandidateId && !action && !rationale) {
      return null;
    }
    if (!insightCandidateId || !action || !rationale) {
      return null;
    }
    if (
      !insightCandidates.some(
        (candidate) => candidate.id === insightCandidateId,
      ) ||
      !insightReviews.some(
        (review) =>
          review.candidateId === insightCandidateId &&
          review.verdict === "supported",
      )
    ) {
      return null;
    }

    return { insightCandidateId, action, rationale };
  } catch {
    return null;
  }
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
    .filter(
      (candidate) =>
        acceptedCandidateIds.has(candidate.id) &&
        hasExplicitlySupportedCausality(candidate),
    )
    .map((candidate) => candidate.text);
}

export function selectVerifiedTodos(
  candidates: string[],
  reviews: ActionVerificationReview[],
) {
  const candidateOrder = new Map(
    candidates.map((_, index) => [`action-${index + 1}`, index]),
  );
  const supportedGroups = reviews
    .filter((review) => review.verdict === "supported")
    .sort(
      (left, right) =>
        Math.min(
          ...left.candidateIds.map(
            (candidateId) => candidateOrder.get(candidateId) ?? Infinity,
          ),
        ) -
        Math.min(
          ...right.candidateIds.map(
            (candidateId) => candidateOrder.get(candidateId) ?? Infinity,
          ),
        ),
    );

  return Array.from(
    new Set(
      supportedGroups.map((review) => review.normalizedAction),
    ),
  );
}

export function selectVerifiedActionSupport(
  actionSupport: ReflectionAnalysisDraft["overview"]["actionSupport"],
  candidates: string[],
  reviews: ActionVerificationReview[],
) {
  if (!actionSupport) {
    return null;
  }

  const candidateIndex = candidates.indexOf(actionSupport.action);
  if (candidateIndex < 0) {
    return null;
  }

  const review = reviews.find(
    (item) =>
      item.candidateIds.includes(`action-${candidateIndex + 1}`) &&
      item.verdict === "supported",
  );

  return review
    ? {
        action: review.normalizedAction,
        rationale: actionSupport.rationale,
      }
    : null;
}

export function selectVerifiedSuggestedAction(
  suggestion: SuggestedActionVerificationReview | null,
  insightCandidates: ReflectionInsightCandidate[],
  todos: string[],
) {
  if (!suggestion) {
    return null;
  }
  if (
    todos.some(
      (todo) => normalizeEvidence(todo) === normalizeEvidence(suggestion.action),
    )
  ) {
    return null;
  }

  const sourceInsight = insightCandidates.find(
    (candidate) => candidate.id === suggestion.insightCandidateId,
  );
  if (!sourceInsight) {
    return null;
  }

  return {
    action: suggestion.action,
    rationale: suggestion.rationale,
    sourceInsight: sourceInsight.text,
    status: "pending" as const,
  };
}

export function retainSuggestedActionForFinalInsights<
  T extends { sourceInsight: string },
>(suggestion: T | null, finalInsights: string[]) {
  if (!suggestion) {
    return null;
  }

  return finalInsights.some(
    (insight) =>
      normalizeEvidence(insight) === normalizeEvidence(suggestion.sourceInsight),
  )
    ? suggestion
    : null;
}

function parseInsightCandidates(
  value: unknown,
  rawText: string,
): ReflectionInsightCandidate[] {
  if (!Array.isArray(value) || value.length > MAX_INSIGHT_CANDIDATES) {
    throw new Error("AI analysis contains invalid insightCandidates.");
  }

  const normalizedRawText = normalizeEvidence(rawText);
  const candidates = value.flatMap((candidate, index) => {
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
      id: `insight-${index + 1}`,
      text: requiredNeutralString(
        candidate.text,
        8,
        400,
        "insightCandidates.text",
      ),
      evidence,
    }];
  });

  if (new Set(candidates.map((candidate) => candidate.text)).size !== candidates.length) {
    throw new Error("AI analysis contains duplicate insightCandidates.");
  }

  return candidates;
}

const EXPLICIT_CAUSAL_LANGUAGE =
  /(?:прив(?:од|ёл|ел|ела|ели|ело)|помога|помог|меша|влия|зависи|позволя|благодаря|из-за|поэтому)/iu;

const BUREAUCRATIC_INSIGHT_LANGUAGE =
  /(?:неопредел[её]нност[ьи] сроков|увеличени[ея] фокуса|в ущерб|переход(?:а|у|ом)? к выходу|переводит подготовку в выход|обусловлен(?:а|о|ы)?|определен(?:а|о|ы)? как|определён(?:а|о|ы)? как|осозна(?:е|ю)тся как|критическ(?:ий|ие|ими) (?:фактор|риск)|приоритизаци[яи]|реализаци[яи] решения|перераспределени[ея] времени)/iu;

function hasBureaucraticInsightLanguage(
  candidate: ReflectionInsightCandidate,
) {
  return BUREAUCRATIC_INSIGHT_LANGUAGE.test(candidate.text);
}

function hasExplicitlySupportedCausality(
  candidate: ReflectionInsightCandidate,
) {
  if (!EXPLICIT_CAUSAL_LANGUAGE.test(candidate.text)) {
    return true;
  }

  return candidate.evidence.some((evidence) =>
    EXPLICIT_CAUSAL_LANGUAGE.test(evidence),
  );
}

function normalizeEvidence(value: string) {
  return value.toLocaleLowerCase("ru").replace(/\s+/g, " ").trim();
}

export function parseReflectionOverview(
  content: string,
  allowedReflectionIds: Set<string>,
): OverviewSignal[] {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("AI overview is not valid JSON.");
  }

  if (!isRecord(value) || !Array.isArray(value.signals)) {
    throw new Error("AI overview must contain signals.");
  }
  if (value.signals.length > 3) {
    throw new Error("AI overview contains too many signals.");
  }

  return value.signals.map((signal) =>
    parseOverviewSignal(signal, allowedReflectionIds),
  );
}

function parseOverviewSignal(
  value: unknown,
  allowedReflectionIds: Set<string>,
): OverviewSignal {
  if (!isRecord(value)) {
    throw new Error("AI overview contains an invalid signal.");
  }

  const kind = requiredString(value.kind, 1, 40, "overview.signal.kind");
  if (
    kind !== "unfinished_intention" &&
    kind !== "recurring_blocker" &&
    kind !== "untested_hypothesis"
  ) {
    throw new Error("AI overview contains an unknown signal kind.");
  }
  const evidenceReflectionIds = requiredStringArray(
    value.evidenceReflectionIds,
    3,
    8,
    1,
    80,
    "overview.signal.evidenceReflectionIds",
  );
  if (
    evidenceReflectionIds.some(
      (reflectionId) => !allowedReflectionIds.has(reflectionId),
    )
  ) {
    throw new Error("AI overview referenced an unknown reflection.");
  }

  const recommendation = requiredString(
    value.recommendation,
    0,
    320,
    "overview.signal.recommendation",
  );

  const title = requiredNeutralString(
    value.title,
    4,
    100,
    "overview.signal.title",
  );
  const finding = requiredNeutralString(
    value.finding,
    20,
    420,
    "overview.signal.finding",
  );
  const neutralRecommendation = recommendation
    ? requiredNeutralString(
        recommendation,
        1,
        320,
        "overview.signal.recommendation",
      )
    : "";

  return {
    kind,
    title,
    finding,
    evidenceReflectionIds,
    recommendation: neutralRecommendation || null,
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
  const rationale = requiredNeutralString(
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

function requiredNeutralString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  field: string,
) {
  const normalized = requiredString(
    value,
    minimumLength,
    maximumLength,
    field,
  );
  if (
    /(?:^|[^\p{L}\p{N}_])(?:автор(?:а|у|ом|е)?|пользовател(?:ь|я|ю|ем|е))(?![\p{L}\p{N}_])/iu.test(
      normalized,
    )
  ) {
    throw new Error(`AI analysis contains external observer voice in ${field}.`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
