import dagre from "@dagrejs/dagre";

export type XY = { x: number; y: number };

export type TreeItem = {
  id: string;
  /** id ห้องแม่ — null / ไม่อยู่ในชุด = เป็นราก */
  parent: string | null;
  /** กลุ่มที่จัดแยกกันแล้ววางเรียงซ้าย -> ขวาตามค่านี้ (เช่น ComID) */
  group: number;
  /** ลำดับประเภทห้อง — พี่น้องเรียงซ้าย -> ขวาตามค่านี้ก่อน */
  typeOrder: number;
  /** ชื่อห้อง — เรียงต่อจาก typeOrder */
  title: string;
};

export type TreeLayoutOpts = {
  nodeW: number;
  nodeH: number;
  ranksep?: number;
  nodesep?: number;
  /** ระยะห่างระหว่างกลุ่ม */
  groupGap?: number;
};

export const rowHeight = (o: TreeLayoutOpts) => o.nodeH + (o.ranksep ?? 60);

const bySortKey = (a: TreeItem, b: TreeItem) =>
  a.typeOrder - b.typeOrder || a.title.localeCompare(b.title, "th", { numeric: true }) || a.id.localeCompare(b.id);

/** เรียงห้องแบบ DFS: ห้องแม่ก่อน แล้วลูกตาม typeOrder -> title (ห้องที่วนกันจนไม่มีราก ต่อท้าย) */
function preorder(members: TreeItem[], byId: Map<string, TreeItem>): TreeItem[] {
  const kids = new Map<string, TreeItem[]>();
  const roots: TreeItem[] = [];
  members.forEach((i) => {
    const p = i.parent != null ? byId.get(i.parent) : undefined;
    if (!p || p.group !== i.group) roots.push(i);
    else (kids.get(p.id) ?? kids.set(p.id, []).get(p.id)!).push(i);
  });
  const out: TreeItem[] = [];
  const seen = new Set<string>();
  const visit = (i: TreeItem) => {
    if (seen.has(i.id)) return;
    seen.add(i.id);
    out.push(i);
    (kids.get(i.id) ?? []).sort(bySortKey).forEach(visit);
  };
  roots.sort(bySortKey).forEach(visit);
  [...members].sort(bySortKey).forEach(visit);
  return out;
}

/**
 * จัดผังตามลำดับชั้นของต้นไม้: รากอยู่แถว 0 (บนสุด) ห้องลูกอยู่ต่ำกว่าห้องแม่ 1 แถวเสมอ (ไม่ดูประเภท / ระดับ)
 * dagre กระจาย x ไม่ให้ทับ ส่วน y = แถว × ความสูงแถว
 * ใส่โหนด / เส้นเข้า dagre ตามลำดับ typeOrder -> title — ต้นไม้ไม่มีเส้นตัดกัน dagre จึงคงลำดับนี้ (พี่น้องซ้าย -> ขวา)
 * คืนตำแหน่งมุมซ้ายบนของแต่ละโหนด (ตามที่ React Flow ใช้)
 */
export function layoutTree(items: TreeItem[], opts: TreeLayoutOpts): Map<string, XY> {
  const { nodeW, nodeH, ranksep = 60, nodesep = 16, groupGap = 120 } = opts;
  const byId = new Map(items.map((i) => [i.id, i]));

  const rows = new Map<string, number>();
  const rowOf = (id: string, depth = 0): number => {
    const known = rows.get(id);
    if (known != null) return known;
    const it = byId.get(id)!;
    const p = it.parent != null ? byId.get(it.parent) : undefined;
    const r = !p || depth > 100 ? 0 : rowOf(p.id, depth + 1) + 1; // depth > 100 = ข้อมูลวน — กันไว้
    rows.set(id, r);
    return r;
  };
  items.forEach((i) => rowOf(i.id));

  const out = new Map<string, XY>();
  const groups = [...new Set(items.map((i) => i.group))].sort((a, b) => a - b);
  let cursor = 0;
  for (const grp of groups) {
    // dagre วางพี่น้องกลับด้านกับลำดับที่ใส่ -> ใส่กลับด้าน จะได้ซ้าย -> ขวาตามลำดับที่ต้องการ
    const members = preorder(items.filter((i) => i.group === grp), byId).reverse();
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "TB", ranksep, nodesep });
    // key ใน dagre ต้องไม่ใช่ตัวเลขล้วน — object ของ JS เรียง key ตัวเลขจากน้อยไปมากเอง ลำดับที่ใส่จะหาย
    const k = (id: string) => `n${id}`;
    // รากเสมือนรวมทุกต้นไม้ในกลุ่มเป็นกราฟเดียว
    const ROOT = "__root__";
    g.setNode(ROOT, { width: 1, height: nodeH });
    members.forEach((i) => g.setNode(k(i.id), { width: nodeW, height: nodeH }));
    members.forEach((i) => {
      const p = i.parent != null ? byId.get(i.parent) : undefined;
      if (p && p.group === grp) g.setEdge(k(p.id), k(i.id), { minlen: rows.get(i.id)! - rows.get(p.id)! });
      else g.setEdge(ROOT, k(i.id), { minlen: rows.get(i.id)! + 1 });
    });
    dagre.layout(g);

    let minX = Infinity, maxX = -Infinity;
    members.forEach((i) => {
      const x = g.node(k(i.id)).x - nodeW / 2;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + nodeW);
    });
    const shift = cursor - minX;
    members.forEach((i) => {
      out.set(i.id, { x: g.node(k(i.id)).x - nodeW / 2 + shift, y: rows.get(i.id)! * (nodeH + ranksep) });
    });
    cursor += maxX - minX + groupGap;
  }
  return out;
}

/**
 * ตำแหน่งของห้องใหม่: แถวถัดไปใต้ห้องแม่ ต่อขวาจากพี่น้องคนขวาสุด (ไม่มีพี่น้อง = ตรงห้องแม่)
 */
export function placeUnder(parent: XY, siblings: XY[], opts: TreeLayoutOpts): XY {
  const y = parent.y + rowHeight(opts);
  if (!siblings.length) return { x: parent.x, y };
  return { x: Math.max(...siblings.map((s) => s.x)) + opts.nodeW + (opts.nodesep ?? 16), y };
}
