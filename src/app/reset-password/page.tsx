"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function checkRecoverySession() {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) {
        return;
      }

      setIsReady(Boolean(data.session));
      setIsChecking(false);
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || session) {
        setIsReady(true);
        setIsChecking(false);
      }
    });

    void checkRecoverySession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Новый пароль должен содержать не менее 8 символов.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Пароли не совпадают.");
      return;
    }

    setIsSaving(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(
        "Не получилось изменить пароль. Возможно, ссылка устарела — запросите новое письмо.",
      );
      setIsSaving(false);
      return;
    }

    await supabase.auth.signOut();
    window.location.assign("/login?reset=success");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f6efe3] px-4 py-10 text-[#231b14]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(214,139,35,0.18),transparent_25rem),radial-gradient(circle_at_90%_10%,rgba(88,105,88,0.16),transparent_28rem)]" />
      <section className="relative w-full max-w-md rounded-[2rem] border border-[#3a2a1d]/10 bg-[#fffaf1]/90 p-6 shadow-[0_24px_70px_rgba(57,37,20,0.12)] sm:p-8">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-[#8b5a22]">
          MindFlow
        </p>
        <h1 className="mt-2 font-serif-display text-4xl font-black leading-none tracking-[-0.06em]">
          Новый пароль
        </h1>

        {isChecking && (
          <p className="mt-5 leading-7 text-[#6c5b4d]">
            Проверяем ссылку восстановления…
          </p>
        )}

        {!isChecking && !isReady && (
          <div className="mt-5">
            <p className="rounded-2xl bg-[#f5d8cc] p-3 text-sm font-bold leading-6 text-[#7f291d]">
              Ссылка восстановления отсутствует или уже устарела.
            </p>
            <Link
              className="mt-5 inline-flex font-black text-[#8b5a22] hover:text-[#654019]"
              href="/login"
            >
              Вернуться ко входу
            </Link>
          </div>
        )}

        {!isChecking && isReady && (
          <form className="mt-7 grid gap-4" onSubmit={updatePassword}>
            <div className="grid gap-2">
              <label
                className="text-sm font-bold text-[#6c5b4d]"
                htmlFor="new-password"
              >
                Новый пароль
              </label>
              <input
                autoComplete="new-password"
                autoFocus
                className="rounded-2xl border border-[#3a2a1d]/12 bg-white/76 px-4 py-3 outline-none transition focus:border-[#a96214] focus:ring-2 focus:ring-[#a96214]/15"
                disabled={isSaving}
                id="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            <div className="grid gap-2">
              <label
                className="text-sm font-bold text-[#6c5b4d]"
                htmlFor="confirm-password"
              >
                Повторите пароль
              </label>
              <input
                autoComplete="new-password"
                className="rounded-2xl border border-[#3a2a1d]/12 bg-white/76 px-4 py-3 outline-none transition focus:border-[#a96214] focus:ring-2 focus:ring-[#a96214]/15"
                disabled={isSaving}
                id="confirm-password"
                minLength={8}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
            </div>

            {message && (
              <p
                className="rounded-2xl bg-[#f5d8cc] p-3 text-sm font-bold leading-6 text-[#7f291d]"
                role="alert"
              >
                {message}
              </p>
            )}

            <button
              className="mt-2 rounded-full bg-[#221a13] px-5 py-3 font-black text-[#fff4df] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Сохраняю…" : "Сохранить новый пароль"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
