import assert from "node:assert/strict";
import test from "node:test";
import { buildReflectionAnalysisMessages } from "../src/app/reflection-ai-prompt.ts";
import { parseReflectionAnalysis } from "../src/app/reflection-ai-schema.ts";

test("accepts a valid structured analysis grounded in history", () => {
  const analysis = parseReflectionAnalysis(
    JSON.stringify({
      summary: "Автор снова откладывает презентацию и называет следующий шаг.",
      themes: ["Подготовка презентации"],
      insights: [
        "Трудность повторяется в момент перехода от намерения к первому слайду.",
      ],
      todos: ["Составить план из пяти слайдов"],
      repeats: [
        {
          title: "Откладывание начала презентации",
          description: "Похожая трудность уже появлялась в предыдущей записи.",
          previousDate: "2026-07-20",
        },
      ],
    }),
    new Set(["2026-07-20"]),
  );

  assert.equal(analysis.repeats[0].previousDate, "2026-07-20");
  assert.deepEqual(analysis.todos, ["Составить план из пяти слайдов"]);
});

test("rejects a repeat that references a date outside the supplied history", () => {
  assert.throws(
    () =>
      parseReflectionAnalysis(
        JSON.stringify({
          summary: "Запись содержит достаточно материала для краткого итога.",
          themes: ["Работа"],
          insights: ["Автор описывает конкретную рабочую трудность."],
          todos: [],
          repeats: [
            {
              title: "Рабочая трудность",
              description: "Модель сослалась на отсутствующую запись.",
              previousDate: "2026-07-19",
            },
          ],
        }),
        new Set(["2026-07-20"]),
      ),
    /unknown previous date/,
  );
});

test("limits historical context to earlier entries and fifteen records", () => {
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

test("asks the model for insights instead of a summary retelling", () => {
  const { messages } = buildReflectionAnalysisMessages({
    rawText: "Сегодня заметил, что откладываю старт, когда задача неясна.",
    entryDate: "2026-07-24",
    previous: [],
  });

  assert.match(messages[0].content, /Инсайты — это не пересказ/);
  assert.match(messages[0].content, /полезную для автора связь/);
});
