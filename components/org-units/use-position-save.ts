"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Node } from "@xyflow/react";
import { toast } from "sonner";
import type { XY } from "@/lib/flow/layout";
import type { UnitPositions } from "@/lib/org/types";
import { useOrgApi } from "./api";

const DEBOUNCE_MS = 500;
const toMap = (rows: UnitPositions["rows"]) => new Map(rows.map((r) => [String(r.Unit_ID), { x: r.x, y: r.y }]));
const same = (a: XY | undefined, b: XY) => !!a && Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;

/**
 * ตำแหน่ง node ทุกห้อง (รวมบริษัทที่ซ่อน) + บันทึกอัตโนมัติแบบหน่วงเวลา
 * - `getAll()` = ตำแหน่งล่าสุดทั้งหมด (Map แก้ได้) · `replaceAll()` แทนทั้งชุด (จัดเรียงใหม่)
 * - `collect()` ดึงตำแหน่งจากจอ (nodesRef) เข้ามา — เรียกเองก่อนบันทึกทุกครั้ง
 * - `schedule()` หลังเปลี่ยนตำแหน่ง · `flush()` บันทึกทันที
 * - ยังไม่มีผังของตัวเอง (ใช้ผังกลาง / คำนวณ) -> บันทึกครั้งแรกส่งทั้งชุด = copy เป็นของตัวเอง
 * - ไม่ login -> ไม่บันทึก
 */
export function usePositionSave(initial: UnitPositions, nodesRef: RefObject<Node[]>) {
  const { saveUnitPositions } = useOrgApi();
  const positionsRef = useRef<Map<string, XY>>(toMap(initial.rows));
  const savedRef = useRef<Map<string, XY>>(initial.source === "mine" ? toMap(initial.rows) : new Map());
  const ownedRef = useRef(initial.source === "mine");
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef<Promise<void> | null>(null);

  const collect = useCallback(() => {
    nodesRef.current.forEach((n) => positionsRef.current.set(n.id, { ...n.position }));
  }, [nodesRef]);
  const getAll = useCallback(() => positionsRef.current, []);
  const replaceAll = useCallback((m: Map<string, XY>) => {
    positionsRef.current = m;
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!initial.loggedIn) return;
    while (runningRef.current) await runningRef.current;
    collect();
    const changed = [...positionsRef.current].filter(([id, p]) => !ownedRef.current || !same(savedRef.current.get(id), p));
    if (!changed.length) return;
    const job = (async () => {
      const res = await saveUnitPositions({ rows: changed.map(([id, p]) => ({ Unit_ID: Number(id), x: p.x, y: p.y })) });
      if (!res.ok) {
        toast.error(`บันทึกตำแหน่งไม่สำเร็จ: ${res.error}`, { id: "save-pos" });
        return;
      }
      changed.forEach(([id, p]) => savedRef.current.set(id, { ...p }));
      ownedRef.current = true;
    })();
    runningRef.current = job;
    try {
      await job;
    } finally {
      runningRef.current = null;
    }
  }, [initial.loggedIn, saveUnitPositions, collect]);

  const schedule = useCallback(() => {
    if (!initial.loggedIn) return;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [initial.loggedIn, flush]);

  // ปิดแท็บ / ออกจากหน้า ระหว่างรอ -> บันทึกที่ค้างไว้
  useEffect(() => {
    const onHide = () => {
      if (timerRef.current != null) void flush();
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, [flush]);

  return { collect, getAll, replaceAll, schedule, flush, loggedIn: initial.loggedIn };
}
