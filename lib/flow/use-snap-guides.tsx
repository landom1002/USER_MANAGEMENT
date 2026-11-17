"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ViewportPortal, useStore, type Node, type NodeChange } from "@xyflow/react";

type Guide =
  | { dir: "v"; x: number; y1: number; y2: number }
  | { dir: "h"; y: number; x1: number; x2: number };

type Candidate = { value: number; node?: Node; priority: number };

type Opts = {
  nodesRef: RefObject<Node[]>;
  getZoom: () => number;
  nodeW: number;
  nodeH: number;
  parentOf: (id: string) => string | null;
  childrenOf: (id: string) => string[];
  /** y ของแถวตามระดับของห้องนี้ เทียบกับตำแหน่งห้องแม่ตอนนี้ — null = ไม่มีห้องแม่บนจอ */
  levelRowY: (id: string, parentPos: { x: number; y: number }) => number | null;
  /** ระยะดูด (px บนจอ — ไม่เปลี่ยนตาม zoom) */
  threshold?: number;
};

/** เลือกค่าที่ใกล้สุดในระยะดูด — priority น้อยชนะเมื่อระยะเท่ากัน */
function nearest(value: number, cands: Candidate[], thr: number): Candidate | null {
  let best: Candidate | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    const d = Math.abs(c.value - value);
    if (d > thr) continue;
    if (d < bestD - 0.01 || (Math.abs(d - bestD) <= 0.01 && best && c.priority < best.priority)) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * Smart guides ตอนลาก node แบบ PowerPoint / Canva
 * - x: กึ่งกลางตรงห้องแม่ (ชนะเมื่อเท่ากัน) / ห้องลูก / พี่น้อง
 * - y: ตรงกับ node อื่น หรือแถวของระดับตัวเอง
 * คิดจาก node ที่จับลาก แล้วเลื่อน node ที่เลือกร่วมไปเท่ากัน · กด Alt ค้าง = ปิดชั่วคราว
 * ใช้: ส่ง changes ผ่าน `snapChanges` ก่อน onNodesChange · เรียก startDrag / endDrag จาก onNodeDragStart / Stop
 */
export function useSnapGuides({ nodesRef, getZoom, nodeW, nodeH, parentOf, childrenOf, levelRowY, threshold = 8 }: Opts) {
  const [guides, setGuides] = useState<Guide[]>([]);
  const dragIdRef = useRef<string | null>(null);
  const altRef = useRef(false);
  /** ระยะที่ดูดไปล่าสุด — ใช้กับ change ตอนปล่อย (dragging: false) ที่ React Flow ส่งตำแหน่งดิบมา */
  const lastDeltaRef = useRef({ dx: 0, dy: 0 });

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      altRef.current = e.altKey;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Alt") return;
      altRef.current = e.type === "keydown";
      // กัน Windows โฟกัสแถบเมนูตอนปล่อย Alt ระหว่างลาก
      if (dragIdRef.current) e.preventDefault();
    };
    window.addEventListener("pointermove", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    return () => {
      window.removeEventListener("pointermove", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("keyup", onKey, true);
    };
  }, []);

  const startDrag = useCallback((id: string) => {
    dragIdRef.current = id;
    lastDeltaRef.current = { dx: 0, dy: 0 };
  }, []);

  const endDrag = useCallback(() => {
    dragIdRef.current = null;
    setGuides([]);
  }, []);

  const snapChanges = useCallback(
    (changes: NodeChange[]): NodeChange[] => {
      const id = dragIdRef.current;
      if (!id) return changes;
      const shift = (pred: (c: NodeChange) => boolean, dx: number, dy: number) =>
        !dx && !dy
          ? changes
          : changes.map((c) =>
              c.type === "position" && c.position && pred(c)
                ? {
                    ...c,
                    position: { x: c.position.x + dx, y: c.position.y + dy },
                    positionAbsolute: c.positionAbsolute && { x: c.positionAbsolute.x + dx, y: c.positionAbsolute.y + dy },
                  }
                : c,
            );

      // ตอนปล่อย: React Flow ส่งตำแหน่งดิบ (ไม่ได้ดูด) มาอีกรอบ -> เลื่อนด้วยระยะดูดล่าสุด ไม่ให้เด้งกลับ
      const drop = changes.find((c) => c.type === "position" && c.id === id && !c.dragging && c.position);
      if (drop) {
        const { dx, dy } = lastDeltaRef.current;
        lastDeltaRef.current = { dx: 0, dy: 0 };
        return shift((c) => c.type === "position" && !c.dragging, dx, dy);
      }

      const main = changes.find((c) => c.type === "position" && c.id === id && c.dragging && c.position);
      if (!main || main.type !== "position" || !main.position) return changes;
      if (altRef.current) {
        lastDeltaRef.current = { dx: 0, dy: 0 };
        setGuides((g) => (g.length ? [] : g));
        return changes;
      }

      const moving = new Set(changes.filter((c) => c.type === "position" && c.dragging).map((c) => (c as { id: string }).id));
      const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
      const still = (nid: string | null | undefined) => (nid && !moving.has(nid) ? byId.get(nid) : undefined);
      const p = main.position;
      const thr = threshold / Math.max(getZoom(), 0.05);

      // ----- x: ห้องแม่ > ห้องลูก > พี่น้อง
      const parentId = parentOf(id);
      const parent = still(parentId);
      const xs: Candidate[] = [];
      if (parent) xs.push({ value: parent.position.x, node: parent, priority: 0 });
      childrenOf(id).forEach((c) => {
        const n = still(c);
        if (n) xs.push({ value: n.position.x, node: n, priority: 1 });
      });
      if (parentId) {
        childrenOf(parentId).forEach((c) => {
          const n = c !== id ? still(c) : undefined;
          if (n) xs.push({ value: n.position.x, node: n, priority: 2 });
        });
      }
      const bx = nearest(p.x, xs, thr);

      // ----- y: แถวของระดับตัวเอง > node อื่นทุกตัว (ใกล้ในแนวนอนก่อน)
      const ys: Candidate[] = [];
      const rowY = parent ? levelRowY(id, parent.position) : null;
      if (rowY != null) ys.push({ value: rowY, priority: 0 });
      nodesRef.current.forEach((n) => {
        if (!moving.has(n.id) && !n.hidden) ys.push({ value: n.position.y, node: n, priority: 1 + Math.abs(n.position.x - p.x) / 1e6 });
      });
      const by = nearest(p.y, ys, thr);

      const x = bx ? bx.value : p.x;
      const y = by ? by.value : p.y;
      const next: Guide[] = [];
      if (bx?.node) {
        const ny = bx.node.position.y;
        next.push({ dir: "v", x: x + nodeW / 2, y1: Math.min(y, ny), y2: Math.max(y, ny) + nodeH });
      }
      if (by) {
        const nx = by.node?.position.x ?? x;
        next.push({ dir: "h", y: y + nodeH / 2, x1: Math.min(x, nx) - (by.node ? 0 : 40), x2: Math.max(x, nx) + nodeW + (by.node ? 0 : 40) });
      }
      setGuides(next);

      const dx = x - p.x;
      const dy = y - p.y;
      lastDeltaRef.current = { dx, dy };
      return shift((c) => c.type === "position" && !!c.dragging, dx, dy);
    },
    [nodesRef, getZoom, nodeW, nodeH, parentOf, childrenOf, levelRowY, threshold],
  );

  return { guides, snapChanges, startDrag, endDrag };
}

/** เส้นประนำสายตา — วางไว้ใน <ReactFlow> */
export function SnapGuides({ guides }: { guides: Guide[] }) {
  const zoom = useStore((s) => s.transform[2]);
  if (!guides.length) return null;
  const w = 1 / zoom;
  return (
    <ViewportPortal>
      {guides.map((g, i) =>
        g.dir === "v" ? (
          <div
            key={i}
            className="pointer-events-none absolute border-l border-dashed border-pink-500"
            style={{ left: g.x, top: g.y1, height: g.y2 - g.y1, borderLeftWidth: w, transform: `translateX(${-w / 2}px)` }}
          />
        ) : (
          <div
            key={i}
            className="pointer-events-none absolute border-t border-dashed border-pink-500"
            style={{ top: g.y, left: g.x1, width: g.x2 - g.x1, borderTopWidth: w, transform: `translateY(${-w / 2}px)` }}
          />
        ),
      )}
    </ViewportPortal>
  );
}
