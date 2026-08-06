import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReflectionAnalysisMessages,
  buildReflectionInsightFinalizationMessages,
  buildReflectionOverviewMessages,
  buildReflectionVerificationMessages,
} from "../src/app/reflection-ai-prompt.ts";
import { mergeReflectionInsights } from "../src/app/reflection-analysis.ts";
import {
  parseReflectionAnalysis,
  parseReflectionInsightFinalization,
  parseReflectionOverview,
  parseReflectionVerification,
  REFLECTION_ANALYSIS_VERSION,
  retainSuggestedActionForFinalInsights,
  selectVerifiedActionSupport,
  selectVerifiedInsightTexts,
  selectVerifiedSuggestedAction,
  selectVerifiedTodos,
} from "../src/app/reflection-ai-schema.ts";

test("reanalyzing the same text keeps existing insights and adds new ones", () => {
  assert.deepEqual(
    mergeReflectionInsights(
      [
        "Соблюдение режима и отказ от цифровых отвлечений в течение четырёх дней подряд привели к росту уровня энергии и улучшению концентрации.",
      ],
      [
        "Сроки отчётного проекта пока непонятны — нужно сосредоточиться на нём и сократить время на другие задачи.",
        "Месяц без работы подходит к концу — со следующей недели пора обновить резюме и начинать поиск.",
        "Медленные решения и трудности выбора могут снова стать проблемой на новой работе — этому стоит уделить время уже сейчас.",
      ],
    ),
    [
      "Соблюдение режима и отказ от цифровых отвлечений в течение четырёх дней подряд привели к росту уровня энергии и улучшению концентрации.",
      "Сроки отчётного проекта пока непонятны — нужно сосредоточиться на нём и сократить время на другие задачи.",
      "Месяц без работы подходит к концу — со следующей недели пора обновить резюме и начинать поиск.",
      "Медленные решения и трудности выбора могут снова стать проблемой на новой работе — этому стоит уделить время уже сейчас.",
    ],
  );
});

test("reanalyzing does not duplicate an unchanged insight", () => {
  assert.deepEqual(
    mergeReflectionInsights(
      ["Сроки проекта пока непонятны."],
      ["  сроки проекта пока непонятны.  ", "Нужно уточнить объём работы."],
    ),
    ["Сроки проекта пока непонятны.", "Нужно уточнить объём работы."],
  );
});

test("accepts a valid day analysis and keeps its primary action separate", () => {
  const rawText =
    "Я снова откладываю презентацию. Нужно составить план из пяти слайдов.";
  const analysis = parseReflectionAnalysis(
    JSON.stringify({
      summary: "Откладывание презентации повторяется; следующий шаг уже назван.",
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
            rationale: "Этот шаг не был назван в исходной записи.",
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
  assert.match(messages[0].content, /самодостаточную задачу/);
  assert.match(messages[0].content, /не открывая исходную расшифровку/);
  assert.match(messages[0].content, /нельзя превратить.*без догадки/);
  assert.match(messages[0].content, /никогда не называй человека/);
  assert.match(messages[0].content, /Факты формулируй обезличенно/);
  assert.match(messages[1].content, /Не формируй долгосрочный Обзор/);
  assert.doesNotMatch(messages[0].content, /Сейчас в фокусе/);
  assert.equal(REFLECTION_ANALYSIS_VERSION, "mindflow-reflection-v11");
});

test("rejects external observer voice in generated day copy", () => {
  assert.throws(
    () =>
      parseReflectionAnalysis(
        JSON.stringify({
          summary: "Автор снова возвращается к подготовке презентации.",
          themes: ["Подготовка презентации"],
          insightCandidates: [],
          todos: [],
          repeats: [],
          actionSupport: { action: "", rationale: "" },
        }),
        new Set(),
        "Снова возвращаюсь к подготовке презентации.",
      ),
    /external observer voice in summary/,
  );
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
      summary: "Самостоятельная работа продолжилась во время паузы.",
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
      text: "Внутренний конфликт между отдыхом и успехом не подтверждён.",
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
      suggestedAction: { insightCandidateId: "", action: "", rationale: "" },
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

test("drops a causal insight when its own evidence does not state causality", () => {
  const candidates = [
    {
      id: "insight-1",
      text: "Отказ от Instagram привёл к росту энергии и концентрации.",
      evidence: [
        "четвёртый день подряд хороший подъём и энергия",
        "меньше отвлекаюсь и исключил Instagram",
      ],
    },
    {
      id: "insight-2",
      text: "Работа по таймеру помогает меньше отвлекаться.",
      evidence: ["работа по таймеру помогает меньше отвлекаться"],
    },
  ];
  const reviews = candidates.map((candidate) => ({
    candidateId: candidate.id,
    verdict: "supported",
    reason: "Формулировка отмечена моделью как подтверждённая.",
  }));

  assert.deepEqual(selectVerifiedInsightTexts(candidates, reviews), [
    "Работа по таймеру помогает меньше отвлекаться.",
  ]);
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
          suggestedAction: {
            insightCandidateId: "",
            action: "",
            rationale: "",
          },
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

test("final insight pass covers and preserves distinct grounded lines from a long entry", () => {
  const rawText = [
    "Возможно, отчётный проект займёт не два-три дня, поэтому надо вложить сюда больше фокуса в ущерб другим проектам.",
    "Месяц без работы подходит к концу: на следующей неделе нужно обсудить со Стасом свою роль, доработать резюме и выйти на рынок.",
    "Четвёртый день подряд держатся хороший режим и энергия, а работа по таймеру помогает меньше отвлекаться.",
    "Трудности выбора и скорость принятия решений могут снова стать тяжёлым испытанием на новом месте, поэтому этому нужно уделить отдельное время.",
  ].join(" ");
  const insightTexts = [
    "Сроки отчётного проекта пока непонятны — нужно сосредоточиться на нём и сократить время на другие проекты.",
    "Месяц без работы подходит к концу — со следующей недели пора обновить резюме и начинать поиск.",
    "Четыре дня подряд сохраняются хороший режим и энергия, а работа по таймеру помогает меньше отвлекаться.",
    "Медленные решения могут снова стать проблемой на новой работе — этому стоит уделить отдельное время.",
  ];
  const finalized = parseReflectionInsightFinalization(
    JSON.stringify({
      coverage: [
        {
          topic: "Объём отчётного проекта и сужение фокуса",
          disposition: "insight",
          insightText: insightTexts[0],
          reason: "Зафиксировано решение направить больше фокуса на проект.",
        },
        {
          topic: "Переход от подготовки к выходу на рынок",
          disposition: "insight",
          insightText: insightTexts[1],
          reason: "Срок и условия перехода прямо названы в записи.",
        },
        {
          topic: "Режим, энергия и рабочая дисциплина",
          disposition: "insight",
          insightText: insightTexts[2],
          reason: "Изменение удерживается четыре дня и связано с практикой таймера.",
        },
        {
          topic: "Принятие решений как риск новой работы",
          disposition: "insight",
          insightText: insightTexts[3],
          reason: "Риск и область отдельной работы названы прямо.",
        },
      ],
      insights: [
        {
          text: insightTexts[0],
          evidence: [
            "Возможно, отчётный проект займёт не два-три дня",
            "вложить сюда больше фокуса в ущерб другим проектам",
          ],
        },
        {
          text: insightTexts[1],
          evidence: [
            "Месяц без работы подходит к концу",
            "обсудить со Стасом свою роль, доработать резюме и выйти на рынок",
          ],
        },
        {
          text: insightTexts[2],
          evidence: [
            "Четвёртый день подряд держатся хороший режим и энергия",
            "работа по таймеру помогает меньше отвлекаться",
          ],
        },
        {
          text: insightTexts[3],
          evidence: [
            "Трудности выбора и скорость принятия решений могут снова стать тяжёлым испытанием на новом месте",
          ],
        },
      ],
    }),
    rawText,
  );

  assert.deepEqual(
    finalized.insights.map((insight) => insight.text),
    insightTexts,
  );
  assert.equal(finalized.coverage.length, 4);
});

test("final insight pass rejects coverage that points to an absent insight", () => {
  assert.throws(
    () =>
      parseReflectionInsightFinalization(
        JSON.stringify({
          coverage: [
            {
              topic: "Решение сузить фокус",
              disposition: "insight",
              insightText: "Нужно временно сузить фокус до одного проекта.",
              reason: "Линия содержит самостоятельное решение.",
            },
          ],
          insights: [],
        }),
        "Нужно временно сузить фокус до одного проекта.",
      ),
    /unknown insight/,
  );
});

test("final insight pass removes unsupported causal wording after model review", () => {
  const text =
    "Четыре дня держатся хороший режим и энергия. Я меньше отвлекаюсь и исключил Instagram.";
  const insight =
    "Отказ от Instagram привёл к росту энергии и концентрации.";
  const finalized = parseReflectionInsightFinalization(
    JSON.stringify({
      coverage: [
        {
          topic: "Режим, энергия и цифровые отвлечения",
          disposition: "insight",
          insightText: insight,
          reason: "Модель связала одновременно описанные изменения.",
        },
      ],
      insights: [
        {
          text: insight,
          evidence: [
            "Четыре дня держатся хороший режим и энергия",
            "меньше отвлекаюсь и исключил Instagram",
          ],
        },
      ],
    }),
    text,
  );

  assert.deepEqual(finalized.insights, []);
  assert.equal(finalized.coverage[0].disposition, "context");
  assert.match(finalized.coverage[0].reason, /причинная связь не подтверждена/);
});

test("final insight pass rejects bureaucratic user-facing wording", () => {
  const rawText =
    "Сроки отчётного проекта пока непонятны, поэтому нужно уделить ему больше времени и меньше заниматься другими проектами.";
  const insight =
    "Неопределённость сроков отчётного проекта требует увеличения фокуса на нём в ущерб другим задачам.";

  assert.throws(
    () =>
      parseReflectionInsightFinalization(
        JSON.stringify({
          coverage: [
            {
              topic: "Сроки и фокус на отчётном проекте",
              disposition: "insight",
              insightText: insight,
              reason: "Решение уделить проекту больше времени названо прямо.",
            },
          ],
          insights: [
            {
              text: insight,
              evidence: [
                "Сроки отчётного проекта пока непонятны",
                "уделить ему больше времени и меньше заниматься другими проектами",
              ],
            },
          ],
        }),
        rawText,
      ),
    /bureaucratic wording/,
  );
});

test("final insight prompt audits every line and may repair accepted wording", () => {
  const messages = buildReflectionInsightFinalizationMessages({
    rawText:
      "Четыре дня держатся хороший режим и энергия. Я меньше отвлекаюсь на Instagram.",
    summary: "Режим и рабочая дисциплина стали устойчивее.",
    themes: ["Режим", "Рабочая дисциплина"],
    todos: [],
    repeats: [],
    insightCandidates: [
      {
        id: "insight-1",
        text: "Отказ от Instagram привёл к росту энергии и концентрации.",
        evidence: ["хороший режим и энергия", "меньше отвлекаюсь"],
      },
    ],
    reviews: [
      {
        candidateId: "insight-1",
        verdict: "supported",
        reason: "Изменения описаны в одной записи.",
      },
    ],
    acceptedInsights: [
      "Отказ от Instagram привёл к росту энергии и концентрации.",
    ],
  });

  assert.match(messages[0].content, /полный итоговый набор insights/);
  assert.match(messages[0].content, /Поля не являются взаимоисключающими/);
  assert.match(messages[0].content, /При конфликте классификаций выбирай insight/);
  assert.match(messages[0].content, /граница между двумя этапами/);
  assert.match(messages[0].content, /Перепиши его осторожнее/);
  assert.match(messages[0].content, /Соседство событий не доказывает причинность/);
  assert.match(messages[0].content, /каждая сильная линия должна быть покрыта/);
  assert.match(messages[0].content, /короткая заметка для себя/);
  assert.match(messages[0].content, /Сроки отчётного проекта пока непонятны/);
  assert.match(messages[0].content, /если так обычно не говорят по-русски/);
  assert.match(messages[1].content, /привёл к росту энергии/);
});

test("drops a suggested action when finalization rewrites its source insight", () => {
  const suggestion = {
    action: "Зафиксировать один критерий выбора",
    rationale: "Так можно проверить, что помогает принять решение.",
    sourceInsight: "Отсутствие цели полностью блокирует выбор.",
    status: "pending",
  };

  assert.equal(
    retainSuggestedActionForFinalInsights(suggestion, [
      "Неясный критерий цели усложняет выбор ежедневного фокуса.",
    ]),
    null,
  );
  assert.equal(
    retainSuggestedActionForFinalInsights(suggestion, [
      "  отсутствие цели полностью блокирует выбор.  ",
    ]),
    suggestion,
  );
});

test("verifier preserves useful context in self-contained actions", () => {
  const candidates = [
    "написать Стасу чтобы получить конкретику по работе",
    "пообщаться с ИИ на тему компетенций входящего продакт-менеджера",
    "сравнить свои навыки с требованиями к роли продакта",
    "накидать какую-нибудь шаблон",
  ];
  const { actionReviews } = parseReflectionVerification(
    JSON.stringify({
      reviews: [],
      actionReviews: [
        {
          candidateIds: ["action-1"],
          verdict: "supported",
          normalizedAction: "Написать Стасу для получения конкретики по работе",
          reason: "Это прямо названо следующим действием.",
        },
        {
          candidateIds: ["action-2"],
          verdict: "supported",
          normalizedAction:
            "Пообщаться с ИИ о компетенциях входящего продакт-менеджера",
          reason: "Действие, тема и контекст прямо названы в записи.",
        },
        {
          candidateIds: ["action-3"],
          verdict: "supported",
          normalizedAction:
            "Сравнить свои навыки с требованиями к роли продакта",
          reason: "Самостоятельное будущее действие сформулировано полностью.",
        },
        {
          candidateIds: ["action-4"],
          verdict: "rejected",
          normalizedAction: "",
          reason: "Фраза является неграмматичным обрывком расшифровки.",
        },
      ],
      suggestedAction: { insightCandidateId: "", action: "", rationale: "" },
    }),
    [],
    candidates,
  );

  assert.deepEqual(selectVerifiedTodos(candidates, actionReviews), [
    "Написать Стасу для получения конкретики по работе",
    "Пообщаться с ИИ о компетенциях входящего продакт-менеджера",
    "Сравнить свои навыки с требованиями к роли продакта",
  ]);
});

test("verifier rejects transcript fragments it cannot safely repair", () => {
  const candidates = [
    "сегодня ещё надо хотя бы 3,5 04:00 грязного времени потратить",
    "поехав в родителям да больше времени заниматься ну вот этим всем изучением работы",
  ];
  const { actionReviews } = parseReflectionVerification(
    JSON.stringify({
      reviews: [],
      actionReviews: [
        {
          candidateIds: ["action-1"],
          verdict: "rejected",
          normalizedAction: "",
          reason: "Это оценка длительности работы, а не самостоятельная задача.",
        },
        {
          candidateIds: ["action-2"],
          verdict: "rejected",
          normalizedAction: "",
          reason: "Без догадки нельзя восстановить конкретное будущее действие.",
        },
      ],
      suggestedAction: { insightCandidateId: "", action: "", rationale: "" },
    }),
    [],
    candidates,
  );

  assert.deepEqual(selectVerifiedTodos(candidates, actionReviews), []);

  const messages = buildReflectionVerificationMessages({
    rawText:
      "Сегодня ещё надо хотя бы 3,5 часа грязного времени потратить. Поехав в родителям да больше времени заниматься ну вот этим всем изучением работы.",
    insightCandidates: [],
    actionCandidates: candidates,
  });
  assert.match(messages[0].content, /оценку длительности работы/);
  assert.match(messages[0].content, /объедини их candidateIds/);
  assert.match(messages[0].content, /в инфинитиве/);
  assert.match(messages[0].content, /Не урезай полезный смысл ради краткости/);
  assert.match(messages[0].content, /пришлось бы угадывать смысл обрывка/);
  assert.match(messages[0].content, /Написать коллеге для получения конкретики/);
  assert.match(messages[0].content, /Сравнить свои навыки с требованиями/);
});

test("maps the primary action to its verified wording", () => {
  const actionSupport = {
    action: "написать Стасу",
    rationale: "Разговор прояснит дальнейшую совместную работу.",
  };
  const reviews = [
    {
      candidateIds: ["action-1"],
      verdict: "supported",
      normalizedAction: "Написать Стасу",
      reason: "Намерение прямо названо в записи.",
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

test("groups overlapping action candidates into one verified intention", () => {
  const candidates = [
    "Выделить два часа на сфокусированный поиск проекта",
    "Определиться с практическим проектом для проверки навыков",
    "Написать Стасу для получения конкретики по работе",
  ];
  const { actionReviews } = parseReflectionVerification(
    JSON.stringify({
      reviews: [],
      actionReviews: [
        {
          candidateIds: ["action-1", "action-2"],
          verdict: "supported",
          normalizedAction:
            "Выделить два часа на выбор практического проекта для проверки навыков",
          reason: "Два кандидата описывают процесс и результат одного намерения.",
        },
        {
          candidateIds: ["action-3"],
          verdict: "supported",
          normalizedAction:
            "Написать Стасу для получения конкретики по работе",
          reason: "Это отдельное явно названное намерение.",
        },
      ],
      suggestedAction: { insightCandidateId: "", action: "", rationale: "" },
    }),
    [],
    candidates,
  );

  assert.deepEqual(selectVerifiedTodos(candidates, actionReviews), [
    "Выделить два часа на выбор практического проекта для проверки навыков",
    "Написать Стасу для получения конкретики по работе",
  ]);
});

test("keeps one MindFlow suggestion linked to a supported uncovered insight", () => {
  const insightCandidates = [
    {
      id: "insight-1",
      text: "Отсутствие глобальной цели усложняет выбор ежедневного фокуса.",
      evidence: ["отсутствии глобальной цели"],
    },
  ];
  const verification = parseReflectionVerification(
    JSON.stringify({
      reviews: [
        {
          candidateId: "insight-1",
          verdict: "supported",
          reason: "Связь прямо сформулирована в записи.",
        },
      ],
      actionReviews: [],
      suggestedAction: {
        insightCandidateId: "insight-1",
        action: "Сформулировать один критерий выбора глобальной цели",
        rationale: "Так ты проверишь, что действительно помогает выбрать фокус.",
      },
    }),
    insightCandidates,
    [],
  );

  assert.deepEqual(
    selectVerifiedSuggestedAction(
      verification.suggestedAction,
      insightCandidates,
      [],
    ),
    {
      action: "Сформулировать один критерий выбора глобальной цели",
      rationale: "Так ты проверишь, что действительно помогает выбрать фокус.",
      sourceInsight:
        "Отсутствие глобальной цели усложняет выбор ежедневного фокуса.",
      status: "pending",
    },
  );
  assert.equal(
    selectVerifiedSuggestedAction(
      verification.suggestedAction,
      insightCandidates,
      ["Сформулировать один критерий выбора глобальной цели"],
    ),
    null,
  );
});

test("rejects action groups that reuse a candidate id", () => {
  assert.throws(
    () =>
      parseReflectionVerification(
        JSON.stringify({
          reviews: [],
          actionReviews: [
            {
              candidateIds: ["action-1"],
              verdict: "supported",
              normalizedAction: "Выбрать практический проект",
              reason: "Намерение прямо названо в записи.",
            },
            {
              candidateIds: ["action-1", "action-2"],
              verdict: "supported",
              normalizedAction: "Написать Стасу о проекте",
              reason: "Намерение прямо названо в записи.",
            },
          ],
          suggestedAction: {
            insightCandidateId: "",
            action: "",
            rationale: "",
          },
        }),
        [],
        ["Выбрать практический проект", "Написать Стасу о проекте"],
      ),
    /did not group every candidate once/,
  );
});

test("rejects incomplete action verification", () => {
  assert.throws(
    () =>
      parseReflectionVerification(
        JSON.stringify({
          reviews: [],
          actionReviews: [],
          suggestedAction: {
            insightCandidateId: "",
            action: "",
            rationale: "",
          },
        }),
        [],
        ["Написать Стасу"],
      ),
    /did not group every candidate once/,
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
  assert.match(messages[0].content, /конкретный следующий шаг на «ты»/);
  assert.match(messages[0].content, /по практической ценности/);
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
            "Отправь один конкретный вопрос и проверь, появилась ли после ответа новая информация для решения.",
        },
      ],
    }),
    new Set(["one", "two", "three"]),
  );

  assert.equal(signals[0].kind, "unfinished_intention");
  assert.equal(signals[0].evidenceReflectionIds.length, 3);
  assert.match(signals[0].recommendation, /Отправь один конкретный вопрос/);
});

test("rejects external observer voice in an overview signal", () => {
  assert.throws(
    () =>
      parseReflectionOverview(
        JSON.stringify({
          signals: [
            {
              kind: "unfinished_intention",
              title: "Запрос критериев остаётся незакрытым",
              finding:
                "Автор в трёх записях планирует запросить критерии, но подтверждения выполнения пока нет.",
              evidenceReflectionIds: ["one", "two", "three"],
              recommendation: "Отправь один конкретный вопрос.",
            },
          ],
        }),
        new Set(["one", "two", "three"]),
      ),
    /external observer voice in overview.signal.finding/,
  );
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
