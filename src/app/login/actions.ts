"use server";

import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export async function login(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.includes("@") ||
    password.length < 6
  ) {
    redirect("/login?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    redirect("/login?error=invalid");
  }

  redirect("/app");
}
