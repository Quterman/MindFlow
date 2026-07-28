import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/supabase/server";
import { generateAndStoreReflectionOverview } from "../../../../reflection-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 35;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const reflection = await generateAndStoreReflectionOverview(
      user.supabase,
      user.userId,
      id,
    );
    if (!reflection) {
      return NextResponse.json({ error: "Запись не найдена." }, { status: 404 });
    }

    return NextResponse.json({ reflection });
  } catch {
    return NextResponse.json(
      { error: "Не получилось сформировать взгляд на запись." },
      { status: 500 },
    );
  }
}
