import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";
import {
  deleteReflection,
  updateCompletedTodos,
  updateReflection,
} from "../../../reflection-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  const { id } = await context.params;
  let body: {
    rawText?: string;
    entryDate?: string;
    summary?: string;
    completedTodos?: unknown;
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
    Array.isArray(body)
  ) {
    return NextResponse.json(
      { error: "Некорректное тело запроса." },
      { status: 400 },
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, "completedTodos")) {
    if (
      !Array.isArray(body.completedTodos) ||
      body.completedTodos.length > 100 ||
      body.completedTodos.some(
        (todo) => typeof todo !== "string" || todo.length > 160,
      )
    ) {
      return NextResponse.json(
        { error: "Передайте корректный список выполненных действий." },
        { status: 400 },
      );
    }

    const result = await updateCompletedTodos(
      user.supabase,
      user.userId,
      id,
      body.completedTodos,
    );
    if (result.status === "not-found") {
      return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
    }
    if (result.status === "invalid-todo") {
      return NextResponse.json(
        { error: "Одно из действий не относится к этой записи." },
        { status: 400 },
      );
    }

    return NextResponse.json({ reflection: result.reflection });
  }

  if (body.summary !== undefined) {
    if (typeof body.summary !== "string" || body.summary.trim().length < 8) {
      return NextResponse.json(
        { error: "Summary слишком короткое." },
        { status: 400 },
      );
    }

    const reflection = await updateReflection(user.supabase, user.userId, {
      id,
      rawText: "",
      summary: body.summary.trim(),
    });

    if (!reflection) {
      return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
    }

    return NextResponse.json({ reflection });
  }

  if (typeof body.rawText !== "string" || body.rawText.trim().length < 8) {
    return NextResponse.json(
      { error: "Добавьте хотя бы одно осмысленное предложение." },
      { status: 400 },
    );
  }

  if (
    body.entryDate !== undefined &&
    !/^\d{4}-\d{2}-\d{2}$/.test(body.entryDate)
  ) {
    return NextResponse.json(
      { error: "Передайте корректную дату записи." },
      { status: 400 },
    );
  }

  const reflection = await updateReflection(user.supabase, user.userId, {
    id,
    rawText: body.rawText.trim(),
    entryDate: body.entryDate,
  });

  if (!reflection) {
    return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
  }

  return NextResponse.json({ reflection });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  const { id } = await context.params;
  await deleteReflection(user.supabase, user.userId, id);

  return NextResponse.json({ ok: true });
}
