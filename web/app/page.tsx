"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DEMO } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, ready, login } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (user) router.replace("/dashboard");
    else if (DEMO) login("admin", "").catch(() => router.replace("/login")); // demo: no credentials, straight in
    else router.replace("/login");
  }, [ready, user, router, login]);
  return null;
}
