import { createHmac } from "node:crypto";
import type { TodoAppImportPayload } from "../app/todo-app-import";

const TODO_APP_LOCAL_ENDPOINT =
  "http://127.0.0.1:4173/api/integrations/mindflow/tasks";
const TODO_APP_PRODUCTION_ENDPOINT =
  "https://quiet-todo-test.vercel.app/api/integrations/mindflow/tasks";

export type TodoAppSignedImportRequest = TodoAppImportPayload & {
  sourceUserId: string;
  targetDate: string;
};

export function getTodoAppImportEndpoint(input: {
  nodeEnv: string | undefined;
  vercelEnv: string | undefined;
}) {
  if (input.nodeEnv === "development") {
    return TODO_APP_LOCAL_ENDPOINT;
  }

  if (input.nodeEnv === "production" && input.vercelEnv === "production") {
    return TODO_APP_PRODUCTION_ENDPOINT;
  }

  return null;
}

export function createTodoAppSignature(
  secret: string,
  timestamp: string,
  requestBody: string,
) {
  return `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${requestBody}`)
    .digest("hex")}`;
}

export function serializeTodoAppSignedRequest(
  input: TodoAppSignedImportRequest,
) {
  return JSON.stringify({
    version: input.version,
    source: input.source,
    sourceUserId: input.sourceUserId,
    targetDate: input.targetDate,
    tasks: input.tasks.map((task) => ({
      sourceId: task.sourceId,
      title: task.title,
      sourceDate: task.sourceDate,
      suggestedView: task.suggestedView,
    })),
  });
}
