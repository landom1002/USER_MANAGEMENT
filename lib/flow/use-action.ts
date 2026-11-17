"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/** ห่อ async function ให้มี { mutate, mutateAsync, isPending } และ toast เมื่อ error */
export function useAction<V>(fn: (vars: V) => Promise<void>, opts: { onSuccess?: () => void } = {}) {
  const [isPending, setPending] = useState(false);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });
  const mutateAsync = useCallback(
    async (vars: V) => {
      setPending(true);
      try {
        await fn(vars);
        optsRef.current.onSuccess?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        throw err;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );
  const mutate = useCallback((vars: V) => void mutateAsync(vars).catch(() => {}), [mutateAsync]);
  return { mutate, mutateAsync, isPending };
}
