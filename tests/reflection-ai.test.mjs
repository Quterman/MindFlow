import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInsightVerificationMessages,
  buildReflectionAnalysisMessages,
  buildReflectionOverviewMessages,
} from "../src/app/reflection-ai-prompt.ts";
import {
  parseInsightVerification,
  parseReflectionAnalysis,
  parseReflectionOverview,
  selectVerifiedInsightTexts,
} from "../src/app/reflection-ai-schema.ts";

test("accepts a valid structured analysis grounded in history", () => {
  const analysis = parseReflectionAnalysis(
    JSON.stringify({
      summary: "Автор снова откладывает презентацию и называет следующий шаг.",
      themes: ["Подготовка презентации"],
      insightCandidates: [
        {
          text: "Трудность возникает при переходе к первому слайду.",
          evidence: ["откладываю переход к первому слайду"],
        },
      ],
      todos: ["Составить план из пяти слайдов"],
      repeats: [
        {
          title: "Откладывание начала презентации",
          description: "Похожая трудность уже появлялась в предыдущей записи.",
          previousDate: "2026-07-20",
        },
      ],
      actionSupport: {
        action: "Составить план из пяти слайдов",
        rationale:
          "План создаст ограниченную рамку и позволит проверить структуру до работы над деталями.",
      },
    }),
    new Set(["2026-07-20"]),
    "Я откладываю переход к первому слайду и хочу составить план из пяти слайдов.",
  );

  assert.equal(analysis.repeats[0].previousDate, "2026-07-20");
  assert.deepEqual(analysis.todos, ["Составить план из пяти слайдов"]);
  assert.equal(
    analysis.overview.actionSupport.action,
    "Составить план из пяти слайдов",
  );
});

test("rejects a repeat that references a date outside the supplied history", () => {
  assert.throws(
    () =>
      parseReflectionAnalysis(
        JSON.stringify({
          summary: "Запись содержит достаточно материала для краткого итога.",
          themes: ["Работа"],
          insightCandidates: [],
          todos: [],
          repeats: [
            {
              title: "Рабочая трудность",
              description: "Модель сослалась на отсутствующую запись.",
              previousDate: "2026-07-19",
            },
          ],
          actionSupport: {
            action: "",
            rationale: "",
          },
        }),
        new Set(["2026-07-20"]),
        "Запись содержит достаточно материала для краткого итога.",
      ),
    /unknown previous date/,
  );
});

test("limits historical context to current-or-earlier entries and fifteen records", () => {
  const previous = Array.from({ length: 18 }, (_, index) => {
    const day = String(23 - index).padStart(2, "0");
    return {
      id: String(index),
      entryDate: `2026-07-${day}`,
      rawText: "Длинная прошлая запись. ".repeat(150),
      transcript: "",
      summary: `Итог ${index}`,
      themes: ["Работа"],
      insights: [],
      todos: [],
      completedTodos: [],
      repeats: [],
      analysisSource: "legacy",
      analysisModel: null,
      analysisVersion: null,
      analysisGeneratedAt: null,
      overview: null,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    };
  });
  previous.unshift({
    ...previous[0],
    id: "future",
    entryDate: "2026-07-25",
  });

  const { messages, allowedPreviousDates } =
    buildReflectionAnalysisMessages({
      rawText: "Текущая запись содержит достаточно текста.",
      entryDate: "2026-07-24",
      previous,
    });
  const payload = JSON.parse(messages[1].content);

  assert.equal(payload.previousEntries.length, 15);
  assert.equal(allowedPreviousDates.has("2026-07-25"), false);
  assert.ok(
    payload.previousEntries.every((entry) => entry.text.length <= 2_000),
  );
});

test("asks the model for evidence-backed candidates without forced conflict", () => {
  const { messages } = buildReflectionAnalysisMessages({
    rawText: "Сегодня заметил, что откладываю старт, когда задача неясна.",
    entryDate: "2026-07-24",
    previous: [],
  });

  assert.match(messages[0].content, /InsightCandidates — это не пересказ/);
  assert.match(messages[0].content, /Не стремись к определённому количеству/);
  assert.match(messages[0].content, /не означает противоречие, конфликт/);
  assert.match(messages[0].content, /«меньше» не превращай в «нет»/);
  assert.match(messages[1].content, /Не формируй долгосрочный Обзор/);
});

test("verifier may reject an invented conflict", () => {
  const candidates = [
    {
      id: "insight-1",
      text: "Пауза стала периодом самостоятельной дисциплины.",
      evidence: ["продолжил работать по трекеру"],
    },
    {
      id: "insight-2",
      text: "Автор испытывает внутренний конфликт между отдыхом и успехом.",
      evidence: ["планировал отдохнуть"],
    },
  ];
  const reviews = parseInsightVerification(
    JSON.stringify({
      reviews: [
        {
          candidateId: "insight-1",
          verdict: "supported",
          reason: "Выбор дисциплины прямо описан в записи.",
        },
        {
          candidateId: "insight-2",
          verdict: "rejected",
          reason: "Текст не называет это внутренним конфликтом.",
        },
      ],
    }),
    candidates,
  );

  assert.deepEqual(selectVerifiedInsightTexts(candidates, reviews), [
    "Пауза стала периодом самостоятельной дисциплины.",
  ]);
  const messages = buildInsightVerificationMessages({
    rawText: "Планировал отдохнуть, но продолжил работать по трекеру.",
    candidates,
  });
  assert.match(messages[0].content, /контраст не доказывают конфликт/);
  assert.match(messages[0].content, /При сомнении выбирай rejected/);
});

test("builds a dedicated overview prompt only for cross-entry dynamics", () => {
  const reflection = {
    id: "current",
    entryDate: "2026-07-24",
    rawText:
      "Не понимаю критерии готовности к работе. Ещё переживаю из-за поездки без партнёра.",
    transcript: "",
    summary: "В записи есть рабочая тема и переживания из-за поездки.",
    themes: ["Работа", "Отношения"],
    insights: [
      "Отсутствие критериев мешает оценить прогресс.",
      "Рациональное решение о поездке не убирает чувство вины.",
    ],
    todos: ["Уточнить критерии у работодателя"],
    completedTodos: [],
    repeats: [],
    overview: null,
    analysisSource: "ai",
    analysisModel: "test",
    analysisVersion: "test",
    analysisGeneratedAt: "2026-07-24T12:00:00.000Z",
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T12:00:00.000Z",
  };

  const { messages } = buildReflectionOverviewMessages({
    reflection,
    previous: [],
  });
  const payload = JSON.parse(messages[1].content);

  assert.equal(payload.currentReflection.todos[0], reflection.todos[0]);
  assert.match(messages[0].content, /Не объединяй независимые темы/);
  assert.match(messages[0].content, /сопоставлять currentReflection/);
  assert.match(messages[0].content, /previousEntries пуст/);
  assert.match(messages[0].content, /Не приписывай скрытые мотивы/);
  assert.match(messages[0].content, /Не начинай rationale/);
});

test("accepts an empty overview when there is no confirmed dynamic", () => {
  const overview = parseReflectionOverview(
    JSON.stringify({
      observations: [],
      actionSupport: {
        action: "",
        rationale: "",
      },
    }),
    new Set(),
  );

  assert.deepEqual(overview, {
    observations: [],
    actionSupport: null,
  });
});

test("accepts a primary day action even without cross-entry dynamics", () => {
  const overview = parseReflectionOverview(
    JSON.stringify({
      observations: [],
      actionSupport: {
        action: "Уточнить критерии у работодателя",
        rationale:
          "Ответ покажет, какие навыки действительно нужны для следующего шага.",
      },
    }),
    new Set(["Уточнить критерии у работодателя"]),
  );

  assert.equal(
    overview.actionSupport.action,
    "Уточнить критерии у работодателя",
  );
});

test("accepts action support only for an action from the reflection", () => {
  const overview = parseReflectionOverview(
    JSON.stringify({
      observations: [
        "Похоже, отсутствие внешнего критерия превращает обучение в процесс без точки завершения.",
      ],
      actionSupport: {
        action: "Уточнить критерии у работодателя",
        rationale:
          "Ответ даст проверяемую рамку и покажет, какие пробелы действительно мешают следующему шагу.",
      },
    }),
    new Set(["Уточнить критерии у работодателя"]),
  );

  assert.equal(
    overview.actionSupport.action,
    "Уточнить критерии у работодателя",
  );

  assert.throws(
    () =>
      parseReflectionOverview(
        JSON.stringify({
          observations: [
            "Похоже, отсутствие внешнего критерия превращает обучение в процесс без точки завершения.",
          ],
          actionSupport: {
            action: "Придумать новый проект",
            rationale:
              "Это действие не было названо автором и не должно появиться в обзоре.",
          },
        }),
        new Set(["Уточнить критерии у работодателя"]),
      ),
    /unknown action/,
  );
});

test("limits the overview to two concise observations", () => {
  assert.throws(
    () =>
      parseReflectionOverview(
        JSON.stringify({
          observations: [
            "Похоже, отсутствие критерия мешает заметить уже достигнутый профессиональный прогресс.",
            "Вторая независимая линия помогает иначе посмотреть на решение о поездке.",
            "Третье наблюдение уже превращает короткий обзор в полный повтор разбора.",
          ],
          actionSupport: {
            action: "",
            rationale: "",
          },
        }),
        new Set(),
      ),
    /invalid overview.observations/,
  );
});
