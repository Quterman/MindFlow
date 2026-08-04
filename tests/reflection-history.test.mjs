import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalendarDates,
  buildDaySummary,
  buildImportantEntryInsights,
  buildOverviewSnapshot,
  buildPrimaryInsights,
  groupDayActions,
  shiftMonth,
} from "../src/app/reflection-history.ts";

test("builds a day summary from all entries without another AI call", () => {
  const summary = buildDaySummary([
    {
      summary: "Размышления о подготовке запуска.",
      themes: ["Запуск", "Неопределённость"],
      insights: ["Первый маленький шаг снижает ощущение неопределённости."],
      todos: ["Составить план"],
      completedTodos: ["Составить план"],
    },
    {
      summary: "Возвращение к срокам проекта.",
      themes: ["Запуск", "Сроки"],
      insights: ["Сроки пока не зафиксированы."],
      todos: ["Назначить дату", "Написать коллеге"],
      completedTodos: [],
    },
  ]);

  assert.match(summary, /Запуск, Неопределённость и Сроки/);
  assert.match(summary, /Ключевой вывод/);
  assert.match(summary, /Из 3 намеченных действий выполнено 1/);
});

test("keeps a single-entry day summary direct", () => {
  const summary = buildDaySummary([
    {
      summary: "День был посвящён подготовке презентации.",
      themes: ["Презентация"],
      insights: ["План уже понятен."],
      todos: [],
      completedTodos: [],
    },
  ]);

  assert.equal(summary, "День был посвящён подготовке презентации.");
});

test("selects useful primary insights instead of generic recap", () => {
  const insights = buildPrimaryInsights([
    {
      insights: [
        "Запись помогает зафиксировать текущий фокус. Если тема появится снова, дневник подсветит её как повтор.",
        "Усталость влияет на решения — важно отделить нехватку ресурса от избегания неопределённости.",
      ],
    },
    {
      insights: [
        "Повторяется откладывание первого шага: похожий стопор уже появлялся раньше.",
        "Повторяется откладывание первого шага: похожий стопор уже появлялся раньше.",
      ],
    },
  ]);

  assert.deepEqual(insights, [
    "Повторяется откладывание первого шага: похожий стопор уже появлялся раньше.",
    "Усталость влияет на решения — важно отделить нехватку ресурса от избегания неопределённости.",
  ]);
});

test("keeps every distinct day insight when no explicit limit is requested", () => {
  const insights = buildPrimaryInsights([
    {
      insights: [
        "Параллельная работа помогает использовать паузы между задачами.",
        "Самостоятельный режим требует больше энергии, чем внешние рамки.",
        "Реалистичный кейс облегчает переход к первому шагу.",
        "Поездка позволяет проверить устойчивость рабочего ритма.",
      ],
    },
  ]);

  assert.equal(insights.length, 4);
});

test("keeps only one insight per confirmed pattern without a fixed total", () => {
  const insights = buildImportantEntryInsights({
    insights: [
      "Повторяется тема откладывания первого шага — она уже появлялась раньше.",
      "В записи заметен стопор перед первым шагом: старт снова переносится.",
      "Усталость влияет на решения — важно отделить нехватку ресурса.",
    ],
    repeats: [
      {
        title: "Откладывание первого шага",
        description: "Повторяется стопор перед стартом.",
        previousDate: "2026-07-20",
      },
    ],
  });

  assert.deepEqual(insights, [
    "Повторяется тема откладывания первого шага — она уже появлялась раньше.",
    "Усталость влияет на решения — важно отделить нехватку ресурса.",
  ]);
});

test("groups the same action across entries and preserves source state", () => {
  const actions = groupDayActions([
    {
      id: "first",
      entryDate: "2026-07-11",
      createdAt: "2026-07-11T12:00:00.000Z",
      todos: ["Определить первый шаг"],
      completedTodos: ["Определить первый шаг"],
    },
    {
      id: "second",
      entryDate: "2026-07-11",
      createdAt: "2026-07-11T13:00:00.000Z",
      todos: ["  определить   первый шаг  "],
      completedTodos: [],
    },
  ]);

  assert.equal(actions.length, 1);
  assert.equal(actions[0].sources.length, 2);
  assert.deepEqual(
    actions[0].sources.map((source) => source.completed),
    [true, false],
  );
});

test("builds an actionable overview from recent reflections", () => {
  const overview = buildOverviewSnapshot(
    [
      {
        id: "today",
        entryDate: "2026-07-24",
        createdAt: "2026-07-24T12:00:00.000Z",
        summary: "Сегодня автор вернулся к подготовке запуска.",
        themes: ["Запуск"],
        insights: [
          "Неясность первого шага снова мешает перейти от планирования к запуску.",
          "В записи заметен стопор перед первым шагом: старт снова переносится.",
          "Усталость влияет на решения — важно отделить нехватку ресурса.",
        ],
        todos: ["Составить план экранов"],
        completedTodos: [],
        repeats: [
          {
            title: "Стопор перед запуском",
            description: "Тема запуска снова не переходит в первый шаг.",
            previousDate: "2026-07-20",
          },
        ],
      },
      {
        id: "previous",
        entryDate: "2026-07-20",
        createdAt: "2026-07-20T12:00:00.000Z",
        summary: "Подготовка запуска откладывается.",
        themes: ["Запуск"],
        insights: ["Широкая формулировка задачи усложняет начало работы."],
        todos: ["Составить план экранов", "Написать коллеге"],
        completedTodos: ["Написать коллеге"],
        repeats: [],
      },
    ],
    "2026-07-24",
  );

  assert.equal(overview.latestEntryDate, "2026-07-24");
  assert.equal(overview.daysSinceLatestEntry, 0);
  assert.equal(overview.isStale, false);
  assert.equal(overview.leadStory.pattern.dates.length, 2);
  assert.equal(overview.leadStory.action.sources.length, 2);
  assert.deepEqual(
    overview.primaryInsights.map((insight) => insight.text),
    ["Усталость влияет на решения — важно отделить нехватку ресурса."],
  );
  assert.equal(overview.openActions.length, 0);
  assert.equal(overview.patterns.length, 0);
  assert.deepEqual(overview.week, {
    entries: 2,
    activeDays: 2,
    actions: 2,
    completedActions: 1,
  });
});

test("uses the latest useful insight when today has no reflection", () => {
  const overview = buildOverviewSnapshot(
    [
      {
        id: "previous",
        entryDate: "2026-07-23",
        createdAt: "2026-07-23T12:00:00.000Z",
        summary: "Вчерашний итог.",
        themes: ["Работа"],
        insights: ["Первый маленький шаг снижает неопределённость."],
        todos: [],
        completedTodos: [],
        repeats: [],
      },
    ],
    "2026-07-24",
  );

  assert.equal(overview.primaryInsights[0].entryDate, "2026-07-23");
  assert.equal(overview.latestEntryDate, "2026-07-23");
  assert.equal(overview.daysSinceLatestEntry, 1);
  assert.equal(overview.isStale, false);
  assert.equal(overview.leadStory, null);
});

test("marks an overview stale after seven quiet days", () => {
  const overview = buildOverviewSnapshot(
    [
      {
        id: "previous",
        entryDate: "2026-07-17",
        createdAt: "2026-07-17T12:00:00.000Z",
        summary: "Последний итог.",
        themes: ["Работа"],
        insights: ["Первый маленький шаг снижает неопределённость."],
        todos: [],
        completedTodos: [],
        repeats: [],
      },
    ],
    "2026-07-24",
  );

  assert.equal(overview.latestEntryDate, "2026-07-17");
  assert.equal(overview.daysSinceLatestEntry, 7);
  assert.equal(overview.isStale, true);
  assert.deepEqual(overview.week, {
    entries: 0,
    activeDays: 0,
    actions: 0,
    completedActions: 0,
  });
});

test("keeps today's unrelated insight separate from an earlier pattern", () => {
  const overview = buildOverviewSnapshot(
    [
      {
        id: "today",
        entryDate: "2026-07-24",
        createdAt: "2026-07-24T12:00:00.000Z",
        summary: "Сегодня внимание было на отдыхе.",
        themes: ["Отдых"],
        insights: ["Отдых помог восстановить внимание после сложной недели."],
        todos: [],
        completedTodos: [],
        repeats: [],
      },
      {
        id: "pattern",
        entryDate: "2026-07-20",
        createdAt: "2026-07-20T12:00:00.000Z",
        summary: "Запуск снова откладывается.",
        themes: ["Запуск"],
        insights: ["Неопределённость снова мешает сделать первый шаг."],
        todos: ["Описать первый шаг"],
        completedTodos: [],
        repeats: [
          {
            title: "Стопор перед запуском",
            description: "Запуск снова останавливается до первого шага.",
            previousDate: "2026-07-18",
          },
        ],
      },
    ],
    "2026-07-24",
  );

  assert.equal(overview.leadStory.pattern.latestDate, "2026-07-20");
  assert.deepEqual(
    overview.primaryInsights.map((insight) => insight.text),
    ["Отдых помог восстановить внимание после сложной недели."],
  );
});

test("keeps future-dated reflections out of the current overview", () => {
  const overview = buildOverviewSnapshot(
    [
      {
        id: "future",
        entryDate: "2026-07-25",
        createdAt: "2026-07-24T12:00:00.000Z",
        summary: "Запись на будущую дату.",
        themes: ["Планы"],
        insights: ["Будущая запись не должна менять текущий обзор."],
        todos: ["Сделать что-то завтра"],
        completedTodos: [],
        repeats: [],
      },
    ],
    "2026-07-24",
  );

  assert.deepEqual(overview.primaryInsights, []);
  assert.deepEqual(overview.openActions, []);
  assert.equal(overview.latestEntryDate, null);
  assert.equal(overview.daysSinceLatestEntry, null);
  assert.equal(overview.isStale, false);
  assert.equal(overview.week.entries, 0);
});

test("builds a stable monday-first calendar grid", () => {
  const dates = buildCalendarDates("2026-07");

  assert.equal(dates.length, 42);
  assert.equal(dates[2], "2026-07-01");
  assert.equal(dates[32], "2026-07-31");
});

test("moves between calendar months across year boundaries", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});
