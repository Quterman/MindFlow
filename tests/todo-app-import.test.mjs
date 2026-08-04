import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTodoAppImportPayload,
  buildTodoAppImportUrl,
  getTodoAppUrlForEnvironment,
} from "../src/app/todo-app-import.ts";

test("uses the local TodoApp while MindFlow runs in development", () => {
  assert.equal(
    getTodoAppUrlForEnvironment("development"),
    "http://127.0.0.1:4173/",
  );
  assert.equal(
    getTodoAppUrlForEnvironment("production"),
    "https://quiet-todo-test.vercel.app/",
  );
});

test("builds a private TodoApp handoff for one MindFlow action", () => {
  const input = {
    title: "  Подготовить план запуска  ",
    sources: [
      {
        reflectionId: "reflection-later",
        entryDate: "2026-08-04",
        createdAt: "2026-08-04T12:00:00.000Z",
        todo: "Подготовить план запуска",
      },
      {
        reflectionId: "reflection-first",
        entryDate: "2026-08-04",
        createdAt: "2026-08-04T09:00:00.000Z",
        todo: "  подготовить   план запуска ",
      },
    ],
  };
  const importUrl = buildTodoAppImportUrl(input);
  const url = new URL(importUrl);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const payload = JSON.parse(fragment.get("mindflow-import"));

  assert.equal(url.origin, "https://quiet-todo-test.vercel.app");
  assert.equal(url.search, "");
  assert.equal(payload.version, 1);
  assert.equal(payload.source, "mindflow");
  assert.deepEqual(payload, buildTodoAppImportPayload(input));
  assert.deepEqual(payload.tasks, [
    {
      sourceId:
        "mindflow:reflection-first:подготовить план запуска",
      title: "Подготовить план запуска",
      sourceDate: "2026-08-04",
      suggestedView: "later",
    },
  ]);
  assert.equal("rawText" in payload, false);
});

test("rejects an import without a task source", () => {
  assert.throws(
    () => buildTodoAppImportUrl({ title: "Подготовить план", sources: [] }),
    /requires a task and its reflection source/,
  );
});
