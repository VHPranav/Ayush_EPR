"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { errMsg } from "./format";

/**
 * GETs `path` (skips while null). Keeps the previous data while a reload is in flight and ignores
 * results that belong to a different path. Because Next's Activity re-creates effects when a cached
 * route is shown again, pages refetch automatically on navigation back.
 */
export function useFetch<T>(path: string | null) {
  const [state, setState] = useState<{ path: string; data?: T; error?: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>(path)
      .then(data => { if (alive) setState({ path, data }); })
      .catch(e => { if (alive) setState({ path, error: errMsg(e) }); });
    return () => { alive = false; };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce(n => n + 1), []);
  const current = path && state?.path === path ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? "", loading: !current, reload };
}
