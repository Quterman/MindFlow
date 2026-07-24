import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCalendarDates,
  buildDaySummary,
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

test("groups the same action across entries and preserves source state", () => {
  const actions = groupDayActions([
    {
      id: "first",
      createdAt: "2026-07-11T12:00:00.000Z",
      todos: ["Определить первый шаг"],
      completedTodos: ["Определить первый шаг"],
    },
    {
      id: "second",
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
