import DiaryApp from "../DiaryApp";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/supabase/server";
import { listReflections } from "../reflection-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AppPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login");
  }

  const reflections = await listReflections(user.supabase, user.userId);

  return (
    <DiaryApp
      initialReflections={reflections}
      userEmail={user.email || "Личный аккаунт"}
    />
  );
}
