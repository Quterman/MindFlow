import "server-only";

import type { TodoAppImportPayload } from "../app/todo-app-import";
import {
  createTodoAppSignature,
  getTodoAppImportEndpoint,
  serializeTodoAppSignedRequest,
} from "./todo-app-protocol";

export type TodoAppImportResult = {
  status: "created" | "duplicate";
  taskId: string;
};

export class TodoAppIntegrationError extends Error {
  constructor(
    message: string,
    readonly kind: "configuration" | "unavailable" | "rejected",
    readonly remoteCode: string | null = null,
  ) {
    super(message);
    this.name = "TodoAppIntegrationError";
  }
}

export async function sendTodoAppImport(
  payload: TodoAppImportPayload,
  sourceUserId: string,
  sourceEmail: string,
  targetDate: string,
): Promise<TodoAppImportResult> {
  const endpoint = getTodoAppImportEndpoint({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  });
  const secret = process.env.TODO_APP_INTEGRATION_SECRET?.trim();

  if (!endpoint || !secret || secret.length < 32) {
    throw new TodoAppIntegrationError(
      "TodoApp integration is not configured.",
      "configuration",
    );
  }

  const requestBody = serializeTodoAppSignedRequest({
    ...payload,
    version: 2,
    sourceEmail,
    sourceUserId,
    targetDate,
  });
  const timestamp = Date.now().toString();
  const signature = createTodoAppSignature(secret, timestamp, requestBody);
  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
        "X-MindFlow-Signature": signature,
        "X-MindFlow-Timestamp": timestamp,
      },
      body: requestBody,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TodoAppIntegrationError(
      "TodoApp did not respond.",
      "unavailable",
    );
  }

  const responseBody = (await response.json().catch(() => null)) as {
    code?: unknown;
    status?: unknown;
    taskId?: unknown;
  } | null;

  if (
    !response.ok ||
    (responseBody?.status !== "created" &&
      responseBody?.status !== "duplicate") ||
    typeof responseBody.taskId !== "string"
  ) {
    throw new TodoAppIntegrationError(
      "TodoApp rejected the task.",
      response.ok ? "unavailable" : "rejected",
      typeof responseBody?.code === "string" ? responseBody.code : null,
    );
  }

  return {
    status: responseBody.status,
    taskId: responseBody.taskId,
  };
}
