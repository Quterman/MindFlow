import assert from "node:assert/strict";
import test from "node:test";
import {
  createTodoAppSignature,
  getTodoAppImportEndpoint,
  serializeTodoAppSignedRequest,
} from "../src/lib/todo-app-protocol.ts";

test("selects only the local and production TodoApp import endpoints", () => {
  assert.equal(
    getTodoAppImportEndpoint({
      nodeEnv: "development",
      vercelEnv: undefined,
    }),
    "http://127.0.0.1:4173/api/integrations/mindflow/tasks",
  );
  assert.equal(
    getTodoAppImportEndpoint({
      nodeEnv: "production",
      vercelEnv: "production",
    }),
    "https://quiet-todo-test.vercel.app/api/integrations/mindflow/tasks",
  );
  assert.equal(
    getTodoAppImportEndpoint({
      nodeEnv: "production",
      vercelEnv: "preview",
    }),
    null,
  );
});

test("signs the exact timestamp and canonical request body", () => {
  assert.equal(
    createTodoAppSignature(
      "12345678901234567890123456789012",
      "1722772800000",
      '{"version":1}',
    ),
    "sha256=975e5221eb905729a140d7afe1c8c7db72b528e850aed799703c932e91567455",
  );
});

test("serializes every signed field in a stable order", () => {
  assert.equal(
    serializeTodoAppSignedRequest({
      version: 2,
      source: "mindflow",
      sourceEmail: "demo@example.com",
      sourceUserId: "mindflow-owner",
      targetDate: "2026-08-04",
      tasks: [
        {
          sourceId: "mindflow:reflection:task",
          title: "Сделать следующий шаг",
          sourceDate: "2026-08-03",
          suggestedView: "later",
        },
      ],
    }),
    '{"version":2,"source":"mindflow","sourceUserId":"mindflow-owner","sourceEmail":"demo@example.com","targetDate":"2026-08-04","tasks":[{"sourceId":"mindflow:reflection:task","title":"Сделать следующий шаг","sourceDate":"2026-08-03","suggestedView":"later"}]}',
  );
});
