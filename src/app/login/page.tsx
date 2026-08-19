import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/supabase/server";
import { login } from "./actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const user = await getAuthenticatedUser();
  if (user) {
    redirect("/app");
  }

  const { error, reset } = await searchParams;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6efe3] px-4 py-10 text-[#231b14]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(214,139,35,0.18),transparent_25rem),radial-gradient(circle_at_90%_10%,rgba(88,105,88,0.16),transparent_28rem)]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/90 p-6 shadow-[0_24px_70px_rgba(57,37,20,0.12)] sm:p-8">
        <Link
          className="text-sm font-black text-[#8b5a22] hover:text-[#654019]"
          href="/"
        >
          ← На главную
        </Link>
        <p className="mt-8 text-sm font-black uppercase tracking-[0.14em] text-[#8b5a22]">
          MindFlow
        </p>
        <h1 className="mt-2 font-serif-display text-4xl font-black leading-none tracking-[-0.06em]">
          Вернуться к своим мыслям
        </h1>
        <p className="mt-4 leading-7 text-[#6c5b4d]">
          Временно регистрация новых пользователей закрыта.
        </p>

        <form action={login} className="mt-7 grid gap-4">
          {reset === "success" && (
            <p
              className="rounded-2xl bg-[#e1eadb] p-3 text-sm font-bold text-[#365234]"
              role="status"
            >
              Пароль изменён. Теперь можно войти.
            </p>
          )}
          <div className="grid gap-2">
            <label className="text-sm font-bold text-[#6c5b4d]" htmlFor="email">
              Email
            </label>
            <input
              autoComplete="email"
              autoFocus
              className="rounded-2xl border border-[#3a2a1d]/12 bg-white/76 px-4 py-3 outline-none transition focus:border-[#a96214] focus:ring-2 focus:ring-[#a96214]/15"
              id="email"
              name="email"
              required
              type="email"
            />
          </div>
          <div className="grid gap-2">
            <label
              className="text-sm font-bold text-[#6c5b4d]"
              htmlFor="password"
            >
              Пароль
            </label>
            <input
              autoComplete="current-password"
              className="rounded-2xl border border-[#3a2a1d]/12 bg-white/76 px-4 py-3 outline-none transition focus:border-[#a96214] focus:ring-2 focus:ring-[#a96214]/15"
              id="password"
              minLength={6}
              name="password"
              required
              type="password"
            />
          </div>

          {error === "invalid" && (
            <p
              className="rounded-2xl bg-[#f5d8cc] p-3 text-sm font-bold text-[#7f291d]"
              role="alert"
            >
              Не получилось войти. Проверьте email и пароль.
            </p>
          )}

          <button
            className="mt-2 rounded-full bg-[#221a13] px-5 py-3 font-black text-[#fff4df] transition hover:-translate-y-0.5"
            type="submit"
          >
            Войти
          </button>
        </form>
      </section>
    </main>
  );
}
