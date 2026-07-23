import DiaryApp from "../DiaryApp";
import { listReflections } from "../db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function AppPage() {
  const reflections = listReflections();

  return <DiaryApp initialReflections={reflections} />;
}
