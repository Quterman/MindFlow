import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";
import {
  sendTodoAppImport,
  TodoAppIntegrationError,
} from "../../../../lib/todo-app-server";
import {
  buildTodoAppImportPayload,
  type TodoSource,
} from "../../../todo-app-import";
import { findReflection } from "../../../reflection-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  const sourceEmail = user.email?.trim().toLowerCase();
  if (!sourceEmail || !user.emailConfirmedAt) {
    return NextResponse.json(
      { error: "Подтвердите почту MindFlow, чтобы отправлять задачи в TodoApp." },
      { status: 403 },
    );
  }

  let body: {
    reflectionId?: unknown;
    targetDate?: unknown;
    todo?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Некорректное тело запроса." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    typeof body.reflectionId !== "string" ||
    body.reflectionId.length > 100 ||
    typeof body.targetDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.targetDate) ||
    typeof body.todo !== "string" ||
    body.todo.length > 160
  ) {
    return NextResponse.json(
      { error: "Передайте корректное действие из рефлексии." },
      { status: 400 },
    );
  }

  const reflection = await findReflection(
    user.supabase,
    user.userId,
    body.reflectionId,
  );
  if (!reflection) {
    return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  }

  const storedTodo = reflection.todos.find((todo) => todo === body.todo);
  if (!storedTodo) {
    return NextResponse.json(
      { error: "Действие не относится к этой записи." },
      { status: 400 },
    );
  }

  const source: TodoSource = {
    reflectionId: reflection.id,
    entryDate: reflection.entryDate,
    createdAt: reflection.createdAt,
    todo: storedTodo,
  };
  const payload = buildTodoAppImportPayload({
    title: storedTodo,
    sources: [source],
  });

  try {
    const result = await sendTodoAppImport(
      payload,
      user.userId,
      sourceEmail,
      body.targetDate,
    );
    return NextResponse.json(result, {
      status: result.status === "created" ? 201 : 200,
    });
  } catch (error) {
    if (error instanceof TodoAppIntegrationError) {
      const accountNotFound = error.remoteCode === "account_not_found";
      return NextResponse.json(
        {
          error:
            error.kind === "configuration"
              ? "Интеграция TodoApp ещё не настроена."
              : accountNotFound
                ? "В TodoApp нет подтверждённого аккаунта с этой почтой."
              : "Не получилось добавить задачу в TodoApp.",
        },
        {
          status:
            error.kind === "configuration" ? 503 : accountNotFound ? 409 : 502,
        },
      );
    }

    return NextResponse.json(
      { error: "Не получилось добавить задачу в TodoApp." },
      { status: 500 },
    );
  }
}
