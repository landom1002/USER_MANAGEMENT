import dagre from "@dagrejs/dagre";

export type XY = { x: number; y: number };

export type LevelItem = {
  id: string;
  /** id ห้องแม่ — null / ไม่อยู่ในชุด = เป็นราก */
  parent: string | null;
  /** ระดับ (สูง = อยู่บน) · null = ไม่ทราบ */
  level: number | null;
  /** กลุ่มที่จัดแยกกันแล้ววางเรียงซ้าย -> ขวาตามค่านี้ (เช่น ComID) */
  group: number;
};

export type LevelLayoutOpts = {
  nodeW: number;
  nodeH: number;
  ranksep?: number;
  nodesep?: number;
  /** ระยะห่างระหว่างกลุ่ม */
  groupGap?: number;
};

/** ห้องลูกอยู่ต่ำกว่าห้องแม่กี่แถว: ต่างระดับกันเท่าไรก็เว้นเท่านั้น · ไม่ทราบระดับ / ลูกไม่ต่ำกว่าแม่ = 1 แถว */
export function rowStep(parentLevel: number | null, childLevel: number | null): number {
  return parentLevel != null && childLevel != null && parentLevel > childLevel ? parentLevel - childLevel : 1;
}

export const rowHeight = (o: LevelLayoutOpts) => o.nodeH + (o.ranksep ?? 60);

/**
 * จัดผังแบบแถวตามระดับ: ระดับสูงสุดอยู่แถว 0 (บนสุด) ลงมาทีละระดับ — ห้องระดับเดียวกันอยู่แถวเดียวกันทั้งผัง
 * dagre ใช้แค่กระจาย x ไม่ให้ทับ (minlen ของเส้น = จำนวนแถวที่ห่าง) ส่วน y คำนวณจากแถวเอง
 * คืนตำแหน่งมุมซ้ายบนของแต่ละโหนด (ตามที่ React Flow ใช้)
 */
export function layoutByLevel(items: LevelItem[], opts: LevelLayoutOpts): Map<string, XY> {
  const { nodeW, nodeH, ranksep = 60, nodesep = 16, groupGap = 120 } = opts;
  const byId = new Map(items.map((i) => [i.id, i]));
  const maxLevel = Math.max(0, ...items.map((i) => i.level ?? 0));

  const rows = new Map<string, number>();
  const rowOf = (id: string, depth = 0): number => {
    const known = rows.get(id);
    if (known != null) return known;
    const it = byId.get(id)!;
    const p = it.parent != null ? byId.get(it.parent) : undefined;
    const r =
      !p || depth > 100 // ราก (หรือข้อมูลวน — กันไว้)
        ? Math.max(0, maxLevel - (it.level ?? maxLevel))
        : rowOf(p.id, depth + 1) + rowStep(p.level, it.level);
    rows.set(id, r);
    return r;
  };
  items.forEach((i) => rowOf(i.id));

  const out = new Map<string, XY>();
  const groups = [...new Set(items.map((i) => i.group))].sort((a, b) => a - b);
  let cursor = 0;
  for (const grp of groups) {
    const members = items.filter((i) => i.group === grp);
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", ranksep, nodesep });
    // รากเสมือนรวมทุกต้นไม้ในกลุ่มเป็นกราฟเดียว — รากที่ไม่ได้อยู่แถว 0 จะถูกดันลงไปแถวของตัวเอง
    const ROOT = "__root__";
    g.setNode(ROOT, { width: 1, height: nodeH });
    members.forEach((i) => g.setNode(i.id, { width: nodeW, height: nodeH }));
    members.forEach((i) => {
      const p = i.parent != null ? byId.get(i.parent) : undefined;
      if (p && p.group === grp) g.setEdge(p.id, i.id, { minlen: rows.get(i.id)! - rows.get(p.id)! });
      else g.setEdge(ROOT, i.id, { minlen: rows.get(i.id)! + 1 });
    });
    dagre.layout(g);

    let minX = Infinity, maxX = -Infinity;
    members.forEach((i) => {
      const x = g.node(i.id).x - nodeW / 2;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + nodeW);
    });
    const shift = cursor - minX;
    members.forEach((i) => {
      out.set(i.id, { x: g.node(i.id).x - nodeW / 2 + shift, y: rows.get(i.id)! * (nodeH + ranksep) });
    });
    cursor += maxX - minX + groupGap;
  }
  return out;
}

/**
 * ตำแหน่งของห้องใหม่: แถวของระดับตัวเองใต้ห้องแม่ ต่อขวาจากพี่น้องคนขวาสุด (ไม่มีพี่น้อง = ตรงห้องแม่)
 */
export function placeUnder(parent: XY, step: number, siblings: XY[], opts: LevelLayoutOpts): XY {
  const y = parent.y + step * rowHeight(opts);
  if (!siblings.length) return { x: parent.x, y };
  return { x: Math.max(...siblings.map((s) => s.x)) + opts.nodeW + (opts.nodesep ?? 16), y };
}
