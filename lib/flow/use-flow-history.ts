"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Node } from "@xyflow/react";

type PosMap = Map<string, { x: number; y: number }>;

/**
 * undo / redo ตำแหน่งโหนด (ไม่เกี่ยวกับข้อมูล) + คีย์ลัด Ctrl+Z / Ctrl+Shift+Z
 * เรียก `checkpoint()` ก่อนเปลี่ยนตำแหน่ง (ตอนเริ่มลาก / ก่อนจัดเรียงใหม่)
 * `onApply` ถูกเรียกหลัง undo / redo (ทั้งจากปุ่มและคีย์ลัด) — เช่นใช้สั่งบันทึกตำแหน่ง
 */
export function useFlowHistory(
  nodesRef: RefObject<Node[]>,
  setNodes: Dispatch<SetStateAction<Node[]>>,
  onApply?: () => void,
) {
  const onApplyRef = useRef(onApply);
  useEffect(() => {
    onApplyRef.current = onApply;
  }, [onApply]);
  const pastRef = useRef<PosMap[]>([]);
  const futureRef = useRef<PosMap[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const sync = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const snap = useCallback(
    (): PosMap => new Map(nodesRef.current.map((n) => [n.id, { ...n.position }])),
    [nodesRef],
  );

  const apply = useCallback(
    (s: PosMap) => setNodes((nds) => nds.map((n) => ({ ...n, position: s.get(n.id) ?? n.position }))),
    [setNodes],
  );

  const checkpoint = useCallback(() => {
    pastRef.current.push(snap());
    futureRef.current = [];
    sync();
  }, [snap, sync]);

  const reset = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    sync();
  }, [sync]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(snap());
    apply(prev);
    sync();
    onApplyRef.current?.();
  }, [snap, apply, sync]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(snap());
    apply(next);
    sync();
    onApplyRef.current?.();
  }, [snap, apply, sync]);

  // capture phase เพื่อให้ทำงานก่อน handler ภายในของ React Flow
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.code !== "KeyZ") return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [undo, redo]);

  return { canUndo, canRedo, undo, redo, checkpoint, reset };
}
