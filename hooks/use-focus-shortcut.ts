import { useEffect } from "react";

export function useFocusShortcut(
  ref: React.RefObject<HTMLInputElement | null>,
  code: string  // e.g. "KeyK", "Period" — layout-independent physical key
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === code) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ref, code]);
}
