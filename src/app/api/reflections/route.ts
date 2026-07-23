import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/supabase/server";
import { createReflection, listReflections } from "../../reflection-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  try {
    const reflections = await listReflections(user.supabase, user.userId);
    return NextResponse.json({ reflections });
  } catch {
    return NextResponse.json(
      { error: "Не получилось загрузить записи." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  let body: {
    rawText?: string;
    entryDate?: string;
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
    typeof body.rawText !== "string" ||
    body.rawText.trim().length < 8
  ) {
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

  try {
    const reflection = await createReflection(user.supabase, user.userId, {
      rawText: body.rawText.trim(),
      entryDate: body.entryDate,
    });

    return NextResponse.json({ reflection }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Не получилось сохранить запись." },
      { status: 500 },
    );
  }
}
