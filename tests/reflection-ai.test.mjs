import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReflectionAnalysisMessages,
  buildReflectionOverviewMessages,
  buildReflectionVerificationMessages,
} from "../src/app/reflection-ai-prompt.ts";
import {
  parseReflectionAnalysis,
  parseReflectionOverview,
  parseReflectionVerification,
  selectVerifiedActionSupport,
  selectVerifiedInsightTexts,
  selectVerifiedTodos,
} from "../src/app/reflection-ai-schema.ts";

test("accepts a valid day analysis and keeps its primary action separate", () => {
  const rawText =
    "Я снова откладываю презентацию. Нужно составить план из пяти слайдов.";
  const analysis = parseReflectionAnalysis(
    JSON.stringify({
      summary: "Автор снова откладывает презентацию и называет следующий шаг.",
      themes: ["Подготовка презентации"],
      insightCandidates: [
        {
          text: "Откладывание происходит до перехода к первому слайду.",
          evidence: ["снова откладываю презентацию"],
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
    rawText,
  );

  assert.equal(analysis.repeats[0].previousDate, "2026-07-20");
  assert.equal(analysis.insightCandidates.length, 1);
  assert.equal(analysis.insightCandidates[0].id, "insight-1");
  assert.equal(
    analysis.overview.actionSupport.action,
    "Составить план из пяти слайдов",
  );
  assert.equal(analysis.overview.signals, null);
  assert.equal(analysis.overview.signalsSource, null);
});

test("rejects a day action that was not present in todos", () => {
  assert.throws(
    () =>
      parseReflectionAnalysis(
        JSON.stringify({
          summary: "Запись содержит достаточно материала для краткого итога.",
          themes: ["Работа"],
          insightCandidates: [],
          todos: ["Уточнить критерии у работодателя"],
          repeats: [],
          actionSupport: {
            action: "Придумать новый проект",
            rationale: "Этот шаг не был назван автором записи.",
          },
        }),
        new Set(),
        "Нужно уточнить критерии у работодателя.",
      ),
    /unknown action/,
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
          actionSupport: { action: "", rationale: "" },
        }),
        new Set(["2026-07-20"]),
        "Рабочая трудность снова появилась.",
      ),
    /unknown previous date/,
  );
});

test("limits day context to fifteen records and includes same-day entries", () => {
  const previous = Array.from({ length: 18 }, (_, index) =>
    makeReflection({
      id: String(index),
      entryDate: index === 0 ? "2026-07-24" : `2026-07-${String(24 - index).padStart(2, "0")}`,
      rawText: "Длинная прошлая запись. ".repeat(150),
    }),
  );
  previous.unshift(
    makeReflection({ id: "future", entryDate: "2026-07-25" }),
  );

  const { messages, allowedPreviousDates } = buildReflectionAnalysisMessages({
    rawText: "Текущая запись содержит достаточно текста.",
    entryDate: "2026-07-24",
    previous,
  });
  const payload = JSON.parse(messages[1].content);

  assert.equal(payload.previousEntries.length, 15);
  assert.equal(allowedPreviousDates.has("2026-07-25"), false);
  assert.equal(allowedPreviousDates.has("2026-07-24"), true);
  assert.ok(payload.previousEntries.every((entry) => entry.text.length <= 2_000));
});

test("keeps the day prompt focused on one reflection", () => {
  const { messages } = buildReflectionAnalysisMessages({
    rawText: "Сегодня заметил, что откладываю старт, когда задача неясна.",
    entryDate: "2026-07-24",
    previous: [],
  });

  assert.match(messages[0].content, /InsightCandidates — это не пересказ/);
  assert.match(messages[0].content, /Не стремись к определённому количеству/);
  assert.match(messages[0].content, /Не останавливайся после первых двух или трёх/);
  assert.match(messages[0].content, /«меньше» не превращай в «нет»/);
  assert.match(messages[0].content, /не означает противоречие, конфликт/);
  assert.match(messages[0].content, /ActionSupport используется только внутри/);
  assert.match(messages[1].content, /Не формируй долгосрочный Обзор/);
  assert.doesNotMatch(messages[0].content, /Сейчас в фокусе/);
});

test("allows zero or more than two grounded insight candidates", () => {
  const rawText = [
    "Выбрал продолжить работу по трекеру.",
    "Сохранил режим во время паузы.",
    "Параллельно изучал кодинг.",
    "Переключался между двумя проектами.",
  ].join(" ");
  const candidates = [
    [
      "Работа по трекеру стала осознанным выбором.",
      "продолжить работу по трекеру",
    ],
    ["Режим сохранился во время паузы.", "Сохранил режим во время паузы"],
    [
      "Во время паузы продолжилось изучение кодинга.",
      "Параллельно изучал кодинг",
    ],
    ["Два проекта использовались параллельно.", "между двумя проектами"],
  ];

  const analysis = parseReflectionAnalysis(
    JSON.stringify({
      summary: "Пауза стала периодом самостоятельной дисциплины.",
      themes: ["Самодисциплина"],
      insightCandidates: candidates.map(([text, evidence]) => ({
        text,
        evidence: [evidence],
      })),
      todos: [],
      repeats: [],
      actionSupport: { action: "", rationale: "" },
    }),
    new Set(),
    rawText,
  );

  assert.equal(analysis.insightCandidates.length, 4);

  const empty = parseReflectionAnalysis(
    JSON.stringify({
      summary: "Запись описывает текущий день без отдельного нового вывода.",
      themes: ["Текущий день"],
      insightCandidates: [],
      todos: [],
      repeats: [],
      actionSupport: { action: "", rationale: "" },
    }),
    new Set(),
    "Сегодня был обычный день без новых наблюдений.",
  );

  assert.deepEqual(empty.insightCandidates, []);
});

test("drops only the candidate whose evidence is absent", () => {
  const analysis = parseReflectionAnalysis(
    JSON.stringify({
      summary: "Автор продолжил самостоятельную работу во время паузы.",
      themes: ["Самодисциплина"],
      insightCandidates: [
        {
          text: "Пауза превратилась в период самостоятельной дисциплины.",
          evidence: ["внутреннее давление заставило работать"],
        },
        {
          text: "Работа по трекеру продолжилась в июле.",
          evidence: ["продолжил работать по своему трекеру"],
        },
      ],
      todos: [],
      repeats: [],
      actionSupport: { action: "", rationale: "" },
    }),
    new Set(),
    "В июле я продолжил работать по своему трекеру.",
  );

  assert.deepEqual(
    analysis.insightCandidates.map((candidate) => candidate.text),
    ["Работа по трекеру продолжилась в июле."],
  );
});

test("verifier reviews every insight and may reject an invented conflict", () => {
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
  const { insightReviews } = parseReflectionVerification(
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
      actionReviews: [],
    }),
    candidates,
    [],
  );

  assert.deepEqual(
    insightReviews.map((review) => review.verdict),
    ["supported", "rejected"],
  );
  assert.deepEqual(selectVerifiedInsightTexts(candidates, insightReviews), [
    "Пауза стала периодом самостоятельной дисциплины.",
  ]);

  const messages = buildReflectionVerificationMessages({
    rawText: "Планировал отдохнуть, но продолжил работать по трекеру.",
    insightCandidates: candidates,
    actionCandidates: [],
  });
  assert.match(messages[0].content, /контраст не доказывают конфликт/);
  assert.match(messages[0].content, /Если запись говорит «меньше»/);
  assert.match(messages[0].content, /При сомнении выбирай rejected/);
});

test("rejects incomplete insight verification", () => {
  assert.throws(
    () =>
      parseReflectionVerification(
        JSON.stringify({
          reviews: [
            {
              candidateId: "insight-1",
              verdict: "supported",
              reason: "Первый вывод подтверждён записью.",
            },
          ],
          actionReviews: [],
        }),
        [
          { id: "insight-1", text: "Первый вывод.", evidence: ["первый"] },
          { id: "insight-2", text: "Второй вывод.", evidence: ["второй"] },
        ],
        [],
      ),
    /did not review every candidate/,
  );
});

test("verifier normalizes explicit actions and rejects transcript fragments", () => {
  const candidates = [
    "написать Стасу",
    "накидать какую-нибудь шаблон",
    "сегодня ещё надо хотя бы 3,5 04:00 грязного времени потратить",
  ];
  const { actionReviews } = parseReflectionVerification(
    JSON.stringify({
      reviews: [],
      actionReviews: [
        {
          candidateId: "action-1",
          verdict: "supported",
          normalizedAction: "Написать Стасу",
          reason: "Автор прямо называет это следующим действием.",
        },
        {
          candidateId: "action-2",
          verdict: "rejected",
          normalizedAction: "",
          reason: "Фраза является неграмматичным обрывком расшифровки.",
        },
        {
          candidateId: "action-3",
          verdict: "rejected",
          normalizedAction: "",
          reason: "Это оценка длительности работы, а не самостоятельная задача.",
        },
      ],
    }),
    [],
    candidates,
  );

  assert.deepEqual(selectVerifiedTodos(candidates, actionReviews), [
    "Написать Стасу",
  ]);

  const messages = buildReflectionVerificationMessages({
    rawText:
      "Надо написать Стасу. Потом накидать какую-нибудь шаблон. Сегодня ещё надо хотя бы 3,5 часа грязного времени потратить.",
    insightCandidates: [],
    actionCandidates: candidates,
  });
  assert.match(messages[0].content, /оценку длительности работы/);
  assert.match(messages[0].content, /поддержи только одну наиболее полную/);
  assert.match(messages[0].content, /в инфинитиве/);
});

test("maps the primary action to its verified wording", () => {
  const actionSupport = {
    action: "написать Стасу",
    rationale: "Разговор прояснит дальнейшую совместную работу.",
  };
  const reviews = [
    {
      candidateId: "action-1",
      verdict: "supported",
      normalizedAction: "Написать Стасу",
      reason: "Намерение прямо названо автором.",
    },
  ];

  assert.deepEqual(
    selectVerifiedActionSupport(actionSupport, ["написать Стасу"], reviews),
    {
      action: "Написать Стасу",
      rationale: "Разговор прояснит дальнейшую совместную работу.",
    },
  );
});

test("rejects incomplete action verification", () => {
  assert.throws(
    () =>
      parseReflectionVerification(
        JSON.stringify({ reviews: [], actionReviews: [] }),
        [],
        ["Написать Стасу"],
      ),
    /did not review every candidate/,
  );
});

test("builds an evidence overview from separate entries, including one day", () => {
  const reflection = makeReflection({ id: "current", entryDate: "2026-07-24" });
  const previous = [
    makeReflection({ id: "same-day", entryDate: "2026-07-24" }),
    makeReflection({ id: "earlier", entryDate: "2026-07-20" }),
  ];

  const { allowedReflectionIds, messages } = buildReflectionOverviewMessages({
    reflection,
    previous,
  });
  const payload = JSON.parse(messages[1].content);

  assert.equal(payload.entries.length, 3);
  assert.equal(payload.maturity, "early_3_to_7_entries");
  assert.equal(allowedReflectionIds.has("same-day"), true);
  assert.match(messages[0].content, /минимум тремя разными reflection id/);
  assert.match(messages[0].content, /Частота темы сама по себе не является/);
  assert.match(messages[0].content, /Если все подтверждения сделаны в один день/);
  assert.match(messages[0].content, /верни signals: \[\]/);
});

test("limits an established overview to the thirty latest entries", () => {
  const reflection = makeReflection({ id: "current", entryDate: "2026-08-01" });
  const previous = Array.from({ length: 35 }, (_, index) =>
    makeReflection({
      id: `previous-${index}`,
      entryDate: `2026-07-${String(31 - Math.min(index, 30)).padStart(2, "0")}`,
      createdAt: `2026-07-31T${String(index % 24).padStart(2, "0")}:00:00.000Z`,
    }),
  );

  const { messages } = buildReflectionOverviewMessages({ reflection, previous });
  const payload = JSON.parse(messages[1].content);

  assert.equal(payload.entries.length, 30);
  assert.equal(payload.maturity, "established_8_plus_entries");
});

test("accepts an empty evidence overview", () => {
  const signals = parseReflectionOverview(
    JSON.stringify({ signals: [] }),
    new Set(["one", "two", "three"]),
  );

  assert.deepEqual(signals, []);
});

test("accepts a grounded signal and optional recommendation", () => {
  const signals = parseReflectionOverview(
    JSON.stringify({
      signals: [
        {
          kind: "unfinished_intention",
          title: "Запрос критериев остаётся незакрытым",
          finding:
            "В трёх записях сформулировано намерение запросить критерии, но подтверждения выполнения пока нет.",
          evidenceReflectionIds: ["one", "two", "three"],
          recommendation:
            "Отправить один конкретный вопрос и проверить, появилась ли после ответа новая информация для решения.",
        },
      ],
    }),
    new Set(["one", "two", "three"]),
  );

  assert.equal(signals[0].kind, "unfinished_intention");
  assert.equal(signals[0].evidenceReflectionIds.length, 3);
  assert.match(signals[0].recommendation, /Отправить один конкретный вопрос/);
});

test("rejects a signal supported by fewer than three entries", () => {
  assert.throws(
    () =>
      parseReflectionOverview(
        JSON.stringify({
          signals: [
            {
              kind: "recurring_blocker",
              title: "Старт снова переносится",
              finding:
                "Две записи описывают одинаковый стопор перед началом работы.",
              evidenceReflectionIds: ["one", "two"],
              recommendation: "",
            },
          ],
        }),
        new Set(["one", "two"]),
      ),
    /evidenceReflectionIds/,
  );
});

test("rejects evidence that references an unknown reflection", () => {
  assert.throws(
    () =>
      parseReflectionOverview(
        JSON.stringify({
          signals: [
            {
              kind: "untested_hypothesis",
              title: "Гипотеза пока не проверена",
              finding:
                "В трёх записях предложена одна проверка, но её результат не зафиксирован.",
              evidenceReflectionIds: ["one", "two", "unknown"],
              recommendation: "",
            },
          ],
        }),
        new Set(["one", "two", "three"]),
      ),
    /unknown reflection/,
  );
});

function makeReflection(overrides = {}) {
  return {
    id: "entry",
    entryDate: "2026-07-24",
    rawText: "Текст записи с намерением сделать следующий шаг.",
    transcript: "",
    summary: "Краткий итог записи.",
    themes: ["Работа"],
    insights: ["Ясный критерий поможет оценить следующий шаг."],
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
    ...overrides,
  };
}
