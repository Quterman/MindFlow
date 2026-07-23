import { NextResponse } from "next/server";
import { createReflection, listReflections } from "../../db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ reflections: listReflections() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    rawText?: string;
    entryDate?: string;
  };

  if (!body.rawText || body.rawText.trim().length < 8) {
    return NextResponse.json(
      { error: "Добавьте хотя бы одно осмысленное предложение." },
      { status: 400 },
    );
  }

  const reflection = createReflection({
    rawText: body.rawText.trim(),
    entryDate: body.entryDate,
  });

  return NextResponse.json({ reflection }, { status: 201 });
}
