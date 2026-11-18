"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  SelectionMode,
  ConnectionLineType,
  useNodesState,
  useEdgesState,
  type Connection,
  type NodeChange,
  type Edge,
  type FinalConnectionState,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BookmarkCheck, Building2, CloudOff, Crown, Filter, LayoutGrid, LocateFixed, Plus, PowerOff, Redo2, TriangleAlert, Undo2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { layoutTree, placeUnder, rowHeight, type TreeLayoutOpts, type XY } from "@/lib/flow/layout";
import { useFlowHistory } from "@/lib/flow/use-flow-history";
import { SnapGuides, useSnapGuides } from "@/lib/flow/use-snap-guides";
import type { OrgRules } from "@/lib/org/rules";
import type { OrgLookups, OrgUnitRow, UnitPositions } from "@/lib/org/types";
import { tint, useOrgRules } from "./shared";
import { useOrgApi } from "./api";
import { MembersDialog } from "./members-dialog";
import { usePositionSave } from "./use-position-save";
import {
  CompanyUnitDialog, ConfirmParentDialog, DeactivateUnitDialog, PublishLayoutDialog, UnitFormDialog, type UnitFormState,
} from "./unit-dialogs";

type UnitNodeData = {
  unit: OrgUnitRow;
  color: string;
  levelLabel: string;
  warnings: string[];
  highlighted: boolean;
  dimmed: boolean;
};

const NODE_W = 160;
const NODE_H = 78;
const LAYOUT: TreeLayoutOpts = { nodeW: NODE_W, nodeH: NODE_H, ranksep: 50, nodesep: 14, groupGap: 160 };

/** ปุ่ม + ใต้ node เรียกเปิดฟอร์มเพิ่มห้องลูก — ส่งผ่าน context เพราะ node component สร้างโดย React Flow */
const AddChildContext = createContext<(u: OrgUnitRow) => void>(() => {});

function UnitNode({ data, isConnectable, selected }: NodeProps) {
  const { unit: u, color, levelLabel, warnings, highlighted, dimmed } = data as unknown as UnitNodeData;
  const onAddChild = useContext(AddChildContext);
  return (
    <div
      // nopan: ดับเบิลคลิกที่ห้อง = เปิดรายชื่อ ไม่ใช่ซูม (ปุ่มกลาง / ขวายังเลื่อนผังได้ · ลากห้องยังได้)
      className={cn(
        "nopan group relative flex w-40 cursor-pointer flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 shadow-sm transition-all duration-150",
        // เลือกอยู่: แสงรอบโหนด (outline สีเดียวกันแบบโปร่ง) + พื้นเข้มขึ้น — เส้นประวาดเป็นชั้นซ้อนด้านล่าง
        // ไม่เปลี่ยนความหนาขอบ / padding จริง -> node ไม่ขยับ · outline ไม่ชนกับ ring ของผลค้นหา (ring ใช้ box-shadow)
        selected && "shadow-lg outline-4 outline-offset-3",
        highlighted && "shadow-md ring-2 ring-primary",
        dimmed && "opacity-25",
      )}
      style={
        selected
          ? {
              borderColor: "transparent",
              background: `color-mix(in srgb, ${color} 22%, var(--card))`,
              outlineColor: `color-mix(in srgb, ${color} 35%, transparent)`,
            }
          : tint(color)
      }
    >
      {/* เส้นประหนา 3px สีเดิม — ทับขอบ 1px เดิมพอดี (-inset-px) แล้วหนาเข้าด้านใน ไม่กระทบ layout */}
      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-lg border-3 border-dashed"
          style={{ borderColor: color }}
        />
      )}
      {u.unit_type !== "COMPANY" && (
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={isConnectable}
          onClick={(e) => e.stopPropagation()}
          style={{ background: color, borderColor: color }}
        />
      )}
      {warnings.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow">
              <TriangleAlert className="size-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-72">
            <ul className="list-disc pl-4">
              {warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </TooltipContent>
        </Tooltip>
      )}
      <div className="flex items-center justify-between gap-1">
        <span className="truncate font-mono text-sm font-semibold" style={{ color }}>
          {u.unit_code}
        </span>
        <span className="shrink-0 rounded px-1 text-[9px] font-medium text-white" style={{ background: color }}>
          {levelLabel}
        </span>
      </div>
      <p className="truncate text-[10px] text-muted-foreground" title={u.unit_name ?? ""}>
        {u.unit_name || "-"}
      </p>
      <div className="flex items-center justify-between gap-1 text-[10px]">
        <span className="flex min-w-0 items-center gap-0.5 text-muted-foreground" title={u.manager ? "หัวหน้า" : "ไม่มีหัวหน้า"}>
          <Crown className="size-3 shrink-0" style={{ color }} />
          <span className="truncate">
            {u.manager ? (
              <>
                <span className="font-medium text-foreground">{u.manager}</span>
                {u.manager_position && ` · ${u.manager_position}`}
              </>
            ) : (
              "_"
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-0.5 font-semibold text-foreground">
          <Users className="size-3" />
          {u.members.toLocaleString("th-TH")}
        </span>
      </div>
      {/* แถบกว้างเท่า node ติดขอบล่าง = สะพาน hover (เมาส์ออกจาก node ตรงไหนก็ยังอยู่ใน group)
          + ซ่อนช้า 300ms กันเมาส์หลุดชั่วขณะ · invisible ไม่รับคลิก จึงไม่บังพื้นที่ตอนซ่อน
          อยู่ก่อน Handle ใน DOM เพื่อให้จุดเชื่อมทับด้านบน — ยังลากเส้นจากจุดได้ตามเดิม */}
      <div className="nodrag nopan invisible absolute inset-x-0 top-full flex justify-center pt-2.5 pb-1 opacity-0 transition-[opacity,visibility] delay-300 duration-150 group-hover:visible group-hover:opacity-100 group-hover:delay-0">
        <button
          type="button"
          title="เพิ่มห้องลูก"
          aria-label={`เพิ่มห้องลูกใต้ ${u.unit_code}`}
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(u);
          }}
          className="flex size-5 shrink-0 items-center justify-center rounded-full p-0 text-white shadow-md transition-[filter,box-shadow] hover:shadow-lg hover:brightness-110"
          style={{ background: color }}
        >
          <Plus className="size-3.5" strokeWidth={3} />
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        onClick={(e) => e.stopPropagation()}
        style={{ background: color, borderColor: color }}
      />
    </div>
  );
}

const nodeTypes = { unitNode: UnitNode };

function ToolButton({ tip, onClick, disabled, children }: {
  tip: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" className="size-8 bg-background shadow-sm" onClick={onClick} disabled={disabled}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function nodeData(u: OrgUnitRow, rules: OrgRules, byId: Map<number, OrgUnitRow>): UnitNodeData {
  return {
    unit: u,
    color: rules.type(u.unit_type).color,
    levelLabel: rules.levelLabel(u),
    warnings: rules.unitWarnings(u, u.parent_unit_id != null ? byId.get(u.parent_unit_id) : undefined),
    highlighted: false,
    dimmed: false,
  };
}

/**
 * จัดเรียงทุกห้อง (ทุกบริษัท แม้ที่ซ่อนอยู่) เป็นแถวตามลำดับชั้นของต้นไม้ — บริษัทเรียงซ้าย -> ขวาตาม ComID
 * พี่น้องเรียงซ้าย -> ขวาตามประเภท (sort_no) แล้วชื่อห้อง
 */
function layoutAll(units: OrgUnitRow[], rules: OrgRules): Map<string, XY> {
  return layoutTree(
    units.map((u) => ({
      id: String(u.Unit_ID),
      parent: u.parent_unit_id != null ? String(u.parent_unit_id) : null,
      group: u.ComID,
      typeOrder: rules.type(u.unit_type).sort_no,
      title: u.unit_name || u.unit_code,
    })),
    LAYOUT,
  );
}

/**
 * ห้องที่ยังไม่มีตำแหน่ง (สร้างใหม่ / ผังที่บันทึกไว้ไม่มี) -> แถวถัดไปใต้ห้องแม่ ต่อขวาจากพี่น้องคนขวาสุด
 * ห้องแม่ก็ยังไม่มีตำแหน่ง -> วางห้องแม่ก่อน · ไม่มีห้องแม่เลย -> ขวาสุดของผัง แถวบนสุด
 * แก้ `pos` ตรง ๆ · คืน true ถ้ามีการวางใหม่
 */
function placeMissing(units: OrgUnitRow[], byId: Map<number, OrgUnitRow>, pos: Map<string, XY>): boolean {
  const missing = units.filter((u) => !pos.has(String(u.Unit_ID)));
  if (!missing.length) return false;
  const place = (u: OrgUnitRow, depth = 0): XY => {
    const id = String(u.Unit_ID);
    const known = pos.get(id);
    if (known) return known;
    const parent = u.parent_unit_id != null ? byId.get(u.parent_unit_id) : undefined;
    let p: XY;
    if (parent && depth < 50) {
      const pp = place(parent, depth + 1);
      const siblings = units
        .filter((s) => s.parent_unit_id === parent.Unit_ID && s.Unit_ID !== u.Unit_ID)
        .map((s) => pos.get(String(s.Unit_ID)))
        .filter((s): s is XY => !!s);
      p = placeUnder(pp, siblings, LAYOUT);
    } else {
      const all = [...pos.values()];
      const right = all.length ? Math.max(...all.map((q) => q.x)) + NODE_W + (LAYOUT.groupGap ?? 120) : 0;
      const top = all.length ? Math.min(...all.map((q) => q.y)) : 0;
      p = { x: right, y: top };
    }
    pos.set(id, p);
    return p;
  };
  missing.forEach((u) => place(u));
  return true;
}

function buildFlow(
  units: OrgUnitRow[], rules: OrgRules, byId: Map<number, OrgUnitRow>, pos: Map<string, XY>,
): { nodes: Node[]; edges: Edge[] } {
  const ids = new Set(units.map((u) => u.Unit_ID));
  const edgeDefs = units
    .filter((u) => u.parent_unit_id != null && ids.has(u.parent_unit_id))
    .map((u) => ({ source: String(u.parent_unit_id), target: String(u.Unit_ID) }));
  return {
    nodes: units.map((u) => ({
      id: String(u.Unit_ID),
      type: "unitNode",
      position: { ...(pos.get(String(u.Unit_ID)) ?? { x: 0, y: 0 }) },
      data: nodeData(u, rules, byId) as unknown as Record<string, unknown>,
    })),
    edges: edgeDefs.map((e) => ({
      id: `e-${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: "step",
      style: { strokeWidth: 1.5 },
    })),
  };
}

const matchUnit = (u: OrgUnitRow, q: string) =>
  u.unit_code.toLowerCase().includes(q) ||
  (u.unit_name ?? "").toLowerCase().includes(q) ||
  (u.manager ?? "").toLowerCase().includes(q) ||
  (u.member_codes ?? "").toLowerCase().includes(q) ||
  u.ComCode.toLowerCase().includes(q);

export function OrgUnitsCanvas({ initialUnits, lookups, initialPositions }: {
  initialUnits: OrgUnitRow[]; lookups: OrgLookups; initialPositions: UnitPositions;
}) {
  const rules = useOrgRules(lookups);
  const [units, setUnits] = useState(initialUnits);
  const [hiddenComs, setHiddenComs] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const rfRef = useRef<ReactFlowInstance | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const lastFilterRef = useRef<string | null>(null);
  const warnIdxRef = useRef(0);

  // ตำแหน่งทุกห้อง (รวมบริษัทที่ซ่อน) + บันทึกอัตโนมัติ
  const {
    collect: collectPositions, getAll: allPositions, replaceAll: replacePositions,
    schedule: scheduleSave, flush: flushSave, loggedIn,
  } = usePositionSave(initialPositions, nodesRef);
  const { publishDefaultLayout } = useOrgApi();
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const { canUndo, canRedo, undo, redo, checkpoint, reset: resetHistory } = useFlowHistory(nodesRef, setRfNodes, scheduleSave);

  // dialogs
  const [membersUnitId, setMembersUnitId] = useState<number | null>(null);
  const [pendingParent, setPendingParent] = useState<{ child: OrgUnitRow; parent: OrgUnitRow } | null>(null);
  const [unitForm, setUnitForm] = useState<UnitFormState | null>(null);
  const [deactivating, setDeactivating] = useState<OrgUnitRow | null>(null);
  const [companyDialog, setCompanyDialog] = useState(false);

  const byId = useMemo(() => new Map(units.map((u) => [u.Unit_ID, u])), [units]);
  const childrenOf = useMemo(() => {
    const m = new Map<number, number[]>();
    units.forEach((u) => {
      if (u.parent_unit_id == null) return;
      const list = m.get(u.parent_unit_id);
      if (list) list.push(u.Unit_ID);
      else m.set(u.parent_unit_id, [u.Unit_ID]);
    });
    return m;
  }, [units]);

  const visibleUnits = useMemo(() => units.filter((u) => !hiddenComs.has(u.ComID)), [units, hiddenComs]);
  const filterKey = [...hiddenComs].sort().join(",");
  const warned = useMemo(
    () => visibleUnits.filter((u) => rules.unitWarnings(u, u.parent_unit_id != null ? byId.get(u.parent_unit_id) : undefined).length),
    [visibleUnits, rules, byId],
  );

  useEffect(() => {
    nodesRef.current = rfNodes;
  }, [rfNodes]);

  const fitAll = useCallback(() => {
    rfRef.current?.fitView({ padding: 0.15, duration: 600 });
  }, []);

  // เลื่อน / ซูมจนไม่เห็นห้องไหนในจอเลย -> แสดงปุ่ม "กลับมาที่ผัง"
  const wrapRef = useRef<HTMLDivElement>(null);
  const [offView, setOffView] = useState(false);
  const checkInView = useCallback(() => {
    const inst = rfRef.current;
    const el = wrapRef.current;
    if (!inst || !el) return;
    const nodes = inst.getNodes();
    if (nodes.length === 0) return setOffView(false);
    const { x, y, zoom } = inst.getViewport();
    const left = -x / zoom;
    const top = -y / zoom;
    const right = left + el.clientWidth / zoom;
    const bottom = top + el.clientHeight / zoom;
    const anyVisible = nodes.some((n) => {
      const pos = inst.getInternalNode(n.id)?.internals.positionAbsolute ?? n.position;
      const w = n.measured?.width ?? n.width ?? 0;
      const h = n.measured?.height ?? n.height ?? 0;
      return pos.x < right && pos.x + w > left && pos.y < bottom && pos.y + h > top;
    });
    setOffView(!anyVisible);
  }, []);
  // ระหว่างลาก / ซูม เช็กไม่เกินเฟรมละครั้ง
  const inViewFrame = useRef(0);
  const scheduleInViewCheck = useCallback(() => {
    if (inViewFrame.current) return;
    inViewFrame.current = requestAnimationFrame(() => {
      inViewFrame.current = 0;
      checkInView();
    });
  }, [checkInView]);
  useEffect(() => () => cancelAnimationFrame(inViewFrame.current), []);

  // ข้อมูล / ตัวกรองเปลี่ยน -> สร้าง node ใหม่จากตำแหน่งที่จำไว้ (ตัวกรองแค่ซ่อน / แสดง ไม่จัดเรียงใหม่)
  // ยังไม่มีตำแหน่งเลย -> จัดเรียงตามลำดับชั้นทั้งผัง · ห้องใหม่ -> วางใต้ห้องแม่ · แล้วบันทึก
  useEffect(() => {
    const isNewFilter = lastFilterRef.current !== filterKey;
    lastFilterRef.current = filterKey;
    collectPositions();
    const firstLayout = allPositions().size === 0 && units.length > 0;
    if (firstLayout) replacePositions(layoutAll(units, rules));
    const placed = placeMissing(units, byId, allPositions()) || firstLayout;
    const { nodes, edges } = buildFlow(visibleUnits, rules, byId, allPositions());
    setRfNodes(nodes);
    setRfEdges(edges);
    if (placed) scheduleSave();
    if (isNewFilter) {
      queueMicrotask(resetHistory);
      setTimeout(fitAll, 150);
    }
  }, [units, visibleUnits, rules, byId, filterKey, setRfNodes, setRfEdges, resetHistory, fitAll, collectPositions, allPositions, replacePositions, scheduleSave]);

  // ไฮไลต์ผลค้นหา
  useEffect(() => {
    const q = search.trim().toLowerCase();
    setRfNodes((nds) =>
      nds.map((n) => {
        const d = n.data as unknown as UnitNodeData;
        const hit = q ? matchUnit(d.unit, q) : false;
        return { ...n, data: { ...(n.data as object), highlighted: hit, dimmed: q ? !hit : false } };
      }),
    );
  }, [search, rfEdges, setRfNodes]);

  const matchCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? visibleUnits.filter((u) => matchUnit(u, q)).length : 0;
  }, [search, visibleUnits]);

  const focusUnit = useCallback((id: number) => {
    const n = nodesRef.current.find((x) => x.id === String(id));
    if (n) rfRef.current?.setCenter(n.position.x + NODE_W / 2, n.position.y + NODE_H / 2, { zoom: 1.1, duration: 500 });
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) return;
    const t = window.setTimeout(() => {
      const hit = nodesRef.current.find((n) => matchUnit((n.data as unknown as UnitNodeData).unit, q));
      if (hit) focusUnit(Number(hit.id));
    }, 250);
    return () => window.clearTimeout(t);
  }, [search, focusUnit]);

  const nextWarning = useCallback(() => {
    if (!warned.length) return;
    const u = warned[warnIdxRef.current % warned.length];
    warnIdxRef.current++;
    focusUnit(u.Unit_ID);
  }, [warned, focusUnit]);

  /** จัดเรียงใหม่ตามลำดับชั้น — ทุกบริษัท (รวมที่ซ่อน) แล้วบันทึก · undo ได้ (เฉพาะห้องที่เห็นบนจอ) */
  const relayout = useCallback(() => {
    checkpoint();
    const pos = layoutAll(units, rules);
    replacePositions(pos);
    setRfNodes((nds) => nds.map((n) => ({ ...n, position: { ...(pos.get(n.id) ?? n.position) } })));
    scheduleSave();
    setTimeout(fitAll, 150);
  }, [checkpoint, replacePositions, units, rules, setRfNodes, scheduleSave, fitAll]);

  const publishLayout = useCallback(async () => {
    setPublishing(true);
    try {
      await flushSave();
      const res = await publishDefaultLayout();
      if (res.ok) {
        toast.success("ตั้งผังนี้เป็นผังกลางแล้ว");
        setPublishOpen(false);
      } else toast.error(res.error);
    } finally {
      setPublishing(false);
    }
  }, [flushSave, publishDefaultLayout]);

  // ----- snap ตอนลาก -----
  const levelRowY = useCallback(
    (id: string, parentPos: XY) => {
      const u = byId.get(Number(id));
      const p = u?.parent_unit_id != null ? byId.get(u.parent_unit_id) : undefined;
      return u && p ? parentPos.y + rowHeight(LAYOUT) : null;
    },
    [byId],
  );
  const getZoom = useCallback(() => rfRef.current?.getZoom() ?? 1, []);
  const parentIdOf = useCallback((id: string) => {
    const pid = byId.get(Number(id))?.parent_unit_id;
    return pid != null ? String(pid) : null;
  }, [byId]);
  const childIdsOf = useCallback((id: string) => (childrenOf.get(Number(id)) ?? []).map(String), [childrenOf]);
  const { guides, snapChanges, startDrag, endDrag } = useSnapGuides({
    nodesRef, getZoom, nodeW: NODE_W, nodeH: NODE_H, parentOf: parentIdOf, childrenOf: childIdsOf, levelRowY,
  });
  const handleNodesChange = useCallback((changes: NodeChange[]) => onNodesChange(snapChanges(changes)), [onNodesChange, snapChanges]);
  const handleDragStart = useCallback((_: unknown, node: Node) => {
    checkpoint();
    startDrag(node.id);
  }, [checkpoint, startDrag]);
  const handleDragStop = useCallback(() => {
    endDrag();
    scheduleSave();
  }, [endDrag, scheduleSave]);

  // ----- ลากเส้นเปลี่ยนห้องแม่ -----
  const isAncestor = useCallback(
    (maybeAncestor: number, unitId: number) => {
      let cur = byId.get(unitId)?.parent_unit_id ?? null;
      for (let i = 0; cur != null && i < 50; i++) {
        if (cur === maybeAncestor) return true;
        cur = byId.get(cur)?.parent_unit_id ?? null;
      }
      return false;
    },
    [byId],
  );

  /** เหตุผลที่เชื่อมไม่ได้ (บล็อก) — null = เชื่อมได้ · เรื่องระดับเป็นแค่คำเตือนใน dialog ยืนยัน */
  const connectError = useCallback(
    (sourceId: string | null | undefined, targetId: string | null | undefined): string | null => {
      const parent = byId.get(Number(sourceId));
      const child = byId.get(Number(targetId));
      if (!parent || !child) return "ไม่พบห้อง";
      if (parent.Unit_ID === child.Unit_ID) return "ห้องแม่เป็นตัวเองไม่ได้";
      if (child.unit_type === "COMPANY") return "ห้องระดับบริษัทไม่มีห้องแม่";
      if (parent.ComID !== child.ComID) return "ห้องแม่ต้องอยู่บริษัทเดียวกัน";
      if (child.parent_unit_id === parent.Unit_ID) return `${parent.unit_code} เป็นห้องแม่ของ ${child.unit_code} อยู่แล้ว`;
      if (isAncestor(child.Unit_ID, parent.Unit_ID)) return `${parent.unit_code} อยู่ใต้ ${child.unit_code} — จะทำให้ผังวนกลับ`;
      return null;
    },
    [byId, isAncestor],
  );

  const isValidConnection = useCallback(
    (c: Edge | Connection) => connectError(c.source, c.target) === null,
    [connectError],
  );

  const handleConnect = useCallback(
    (c: Connection) => {
      const parent = byId.get(Number(c.source));
      const child = byId.get(Number(c.target));
      if (parent && child) setPendingParent({ child, parent });
    },
    [byId],
  );

  const handleConnectEnd = useCallback(
    (_e: globalThis.MouseEvent | globalThis.TouchEvent, state: FinalConnectionState) => {
      if (state.isValid !== false || !state.fromNode || !state.toNode) return;
      // ลากจาก handle บน (target) ไปล่าง ก็ถือว่าเป็นทิศกลับ
      const [src, dst] = state.fromHandle?.type === "target" ? [state.toNode.id, state.fromNode.id] : [state.fromNode.id, state.toNode.id];
      toast.error(connectError(src, dst) ?? "ไม่สามารถเชื่อมต่อได้");
    },
    [connectError],
  );

  /** ห้องลูกทั้งหมด (ทุกชั้น) + จำนวนคนรวม — แสดงใน dialog ยืนยัน */
  const subtreeStats = useCallback(
    (unitId: number) => {
      let count = 0;
      let people = byId.get(unitId)?.members ?? 0;
      const stack = [...(childrenOf.get(unitId) ?? [])];
      while (stack.length) {
        const id = stack.pop()!;
        count++;
        people += byId.get(id)?.members ?? 0;
        stack.push(...(childrenOf.get(id) ?? []));
      }
      return { units: count, people };
    },
    [byId, childrenOf],
  );

  // คลิกเดียว = เลือก (React Flow จัดการเอง) · ดับเบิลคลิก = เปิดรายชื่อสมาชิก
  const handleNodeDoubleClick = useCallback((_: MouseEvent, node: Node) => setMembersUnitId(Number(node.id)), []);

  // Delete / Backspace = ปิดห้องที่เลือก (ทีละห้อง) · Esc = ยกเลิกการเลือก
  // ไม่ทำงานตอนพิมพ์ในช่องกรอก หรือมี dialog / เมนูเปิดอยู่
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace" && e.key !== "Escape") return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;
      const picked = nodesRef.current.filter((n) => n.selected);
      if (!picked.length) return;
      if (e.key === "Escape") {
        setRfNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
        return;
      }
      e.preventDefault();
      if (picked.length > 1) return void toast.info("เลือกทีละห้องเพื่อปิด");
      const u = byId.get(Number(picked[0].id));
      if (u) setDeactivating(u);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [byId, setRfNodes]);

  const companies = lookups.companies;
  const companiesInUse = companies.filter((c) => units.some((u) => u.ComID === c.ComID));
  const companiesWithoutRoot = companies.filter((c) => !units.some((u) => u.ComID === c.ComID && u.unit_type === "COMPANY"));
  const membersUnit = membersUnitId != null ? byId.get(membersUnitId) ?? null : null;
  const totalPeople = visibleUnits.reduce((s, u) => s + u.members, 0);
  const openAddChild = useCallback((u: OrgUnitRow) => setUnitForm({ mode: "create", parent: u }), []);

  // ----- คลิกขวา (shadcn ContextMenu) -----
  // คลิกขวาที่ห้อง -> เลือกห้องนั้น + เมนูของห้อง · ที่ว่าง -> เฉพาะเมนูผัง (ปุ่มเดียวกับแถบเครื่องมือด้านบน)
  // ลากด้วยปุ่มขวา = เลื่อนผัง -> ปล่อยแล้วไม่เปิดเมนู
  // React Flow (panOnDrag มีปุ่มขวา) preventDefault ทุก contextmenu ใน pane -> Radix ไม่เปิดเมนู
  // จึงดักตอน capture ที่ wrapper แล้วยิง contextmenu ใหม่ใส่ตัว trigger เอง (target = wrapper ไม่ผ่าน pane)
  const [menuUnitId, setMenuUnitId] = useState<number | null>(null);
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);
  const menuUnit = menuUnitId != null ? byId.get(menuUnitId) ?? null : null;
  const handleCanvasContextMenuCapture = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) return; // event ที่ยิงซ้ำด้านล่าง -> ปล่อยให้ Radix เปิดเมนู
    const target = e.target as HTMLElement;
    // ช่องกรอก -> เมนูของเบราว์เซอร์ (วาง / คัดลอก)
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    e.preventDefault();
    e.stopPropagation();
    const down = rightDownRef.current;
    rightDownRef.current = null;
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const id = target.closest(".react-flow__node")?.getAttribute("data-id");
    setMenuUnitId(id ? Number(id) : null);
    if (id) setRfNodes((nds) => nds.map((n) => (!!n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })));
    const el = e.currentTarget;
    const { clientX, clientY, screenX, screenY } = e;
    queueMicrotask(() =>
      el.dispatchEvent(new globalThis.MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX, clientY, screenX, screenY })),
    );
  }, [setRfNodes]);

  return (
    <div ref={wrapRef} className="relative h-[calc(100svh-var(--header-height))] w-full">
      <AddChildContext.Provider value={openAddChild}>
      <ContextMenu>
      <ContextMenuTrigger asChild>
      <div
        className="h-full w-full"
        onContextMenuCapture={handleCanvasContextMenuCapture}
        onMouseDownCapture={(e) => {
          if (e.button === 2) rightDownRef.current = { x: e.clientX, y: e.clientY };
        }}
      >
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={handleDragStart}
        onNodeDragStop={handleDragStop}
        onNodeDoubleClick={handleNodeDoubleClick}
        deleteKeyCode={null}
        onConnect={handleConnect}
        onConnectEnd={handleConnectEnd}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        onInit={(inst) => {
          rfRef.current = inst;
          setTimeout(fitAll, 100);
        }}
        onMove={scheduleInViewCheck}
        onMoveEnd={checkInView}
        minZoom={0.05}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={[1, 2]}
        connectionLineType={ConnectionLineType.Step}
        connectionLineStyle={{ strokeWidth: 1.5 }}
        proOptions={{ hideAttribution: true }}
      >
        <Panel position="top-left" className="m-3">
          <div className="flex w-[calc(100vw-1.5rem)] max-w-200 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 shrink-0 bg-background shadow-sm">
                  <Filter className="size-3.5" />
                  บริษัท
                  <span className="text-xs text-muted-foreground">
                    {hiddenComs.size ? `${companiesInUse.length - hiddenComs.size}/${companiesInUse.length}` : "ทั้งหมด"}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel>แสดงบริษัท</DropdownMenuLabel>
                {companiesInUse.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.ComID}
                    checked={!hiddenComs.has(c.ComID)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(on) =>
                      setHiddenComs((prev) => {
                        const next = new Set(prev);
                        if (on) next.delete(c.ComID);
                        else next.add(c.ComID);
                        return next;
                      })
                    }
                  >
                    <span className="font-mono text-xs">{c.ComCode}</span>
                    <span className="truncate text-xs text-muted-foreground">{c.ComName}</span>
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setHiddenComs(new Set())}>แสดงทั้งหมด</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="ค้นหารหัสห้อง / ชื่อห้อง / รหัสพนักงาน..."
              className="min-w-0 flex-1"
              inputClassName="h-8 bg-background text-sm shadow-sm"
            />
            <div className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs shadow-sm">
              <Building2 className="size-3.5 text-muted-foreground" />
              <span className="font-semibold">
                {search ? `${matchCount}/${visibleUnits.length}` : visibleUnits.length.toLocaleString("th-TH")}
              </span>
              <span className="text-muted-foreground">ห้อง</span>
              <Users className="ml-1 size-3.5 text-muted-foreground" />
              <span className="font-semibold">{totalPeople.toLocaleString("th-TH")}</span>
              <span className="text-muted-foreground">คน</span>
            </div>
            {warned.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 shrink-0 border-amber-400 bg-background text-amber-600 shadow-sm hover:text-amber-700"
                    onClick={nextWarning}
                  >
                    <TriangleAlert className="size-3.5" />
                    {warned.length}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>ห้องที่ผิดกฎ (กดเพื่อไปทีละห้อง)</TooltipContent>
              </Tooltip>
            )}
          </div>
        </Panel>

        <Panel position="top-right" className="m-3">
          <div className="flex items-center gap-1">
            {!loggedIn && (
              <span className="flex h-8 items-center gap-1.5 rounded-md border border-dashed bg-background px-2.5 text-xs text-muted-foreground shadow-sm">
                <CloudOff className="size-3.5" /> ไม่ได้บันทึกตำแหน่ง (ยังไม่ login)
              </span>
            )}
            {companiesWithoutRoot.length > 0 && (
              <Button variant="outline" className="h-8 bg-background shadow-sm" onClick={() => setCompanyDialog(true)}>
                <Plus className="size-3.5" /> ห้องบริษัท
              </Button>
            )}
            <ToolButton tip="Undo (Ctrl+Z)" onClick={undo} disabled={!canUndo}>
              <Undo2 size={14} />
            </ToolButton>
            <ToolButton tip="Redo (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo}>
              <Redo2 size={14} />
            </ToolButton>
            <ToolButton tip="จัดเรียงใหม่ตามลำดับชั้น (บนลงล่าง)" onClick={relayout}>
              <LayoutGrid size={14} />
            </ToolButton>
            <ToolButton
              tip={loggedIn ? "ตั้งผังนี้เป็นผังกลาง (ค่าเริ่มต้นของคนที่ยังไม่มีผังตัวเอง)" : "ต้อง login ก่อน"}
              onClick={() => setPublishOpen(true)}
              disabled={!loggedIn}
            >
              <BookmarkCheck size={14} />
            </ToolButton>
          </div>
        </Panel>

        {/* มีตัวกรอง (ซ่อนบริษัท / ค้นหา) -> ปุ่มล้างลอยกลางด้านบน ใต้แถบเครื่องมือ */}
        {(hiddenComs.size > 0 || search.trim() !== "") && (
          <Panel position="top-center" className="mt-14">
            <Button
              variant="destructive"
              className="h-8 animate-in rounded-full shadow-md duration-200 fade-in slide-in-from-top-2"
              onClick={() => {
                setHiddenComs(new Set());
                setSearch("");
              }}
            >
              <X className="size-3.5" />
              ล้างตัวกรอง
              <span className="text-xs text-white/80">
                {[
                  hiddenComs.size > 0 && `ซ่อน ${hiddenComs.size} บริษัท`,
                  search.trim() && `ค้นหา "${search.trim()}"`,
                ].filter(Boolean).join(" · ")}
              </span>
            </Button>
          </Panel>
        )}

        {units.length === 0 && (
          <Panel position="top-center" className="mt-24">
            <div className="flex flex-col items-center gap-3 rounded-lg border bg-background p-6 text-center shadow-sm">
              <Building2 className="size-8 text-muted-foreground" />
              <div>
                <p className="font-medium">ยังไม่มีห้องในผัง</p>
                <p className="text-sm text-muted-foreground">เริ่มจากสร้างห้องระดับบริษัท แล้วเพิ่มห้องลูกจากเมนูในห้องนั้น</p>
              </div>
              <Button onClick={() => setCompanyDialog(true)}>
                <Plus /> สร้างห้องบริษัท
              </Button>
            </div>
          </Panel>
        )}

        {offView && (
          <Panel position="bottom-center" className="mb-3">
            <Button className="shadow-md" onClick={fitAll}>
              <LocateFixed className="size-3.5" /> กลับมาที่ผัง
            </Button>
          </Panel>
        )}

        <SnapGuides guides={guides} />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <MiniMap
          position="bottom-left"
          nodeColor={(n) => (n.data as unknown as UnitNodeData).color ?? "#999"}
          bgColor="var(--background)"
          maskColor="color-mix(in oklch, var(--muted-foreground) 18%, transparent)"
        />
        {/* ปุ่มควบคุมแนวนอน ซ้อนอยู่มุมบนซ้ายภายใน minimap (minimap 200×150, margin 15)
            render หลัง MiniMap เพื่อให้อยู่ชั้นบน */}
        <Controls
          position="bottom-left"
          orientation="horizontal"
          style={{ marginLeft: 19, marginBottom: 15 + 150 - 4 - 26 }}
        />
      </ReactFlow>
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {menuUnit && (
          <>
            <ContextMenuLabel className="flex items-center gap-1.5">
              <span className="font-mono text-foreground">{menuUnit.unit_code}</span>
              <span className="truncate font-normal">{menuUnit.unit_name}</span>
            </ContextMenuLabel>
            <ContextMenuItem onSelect={() => setMembersUnitId(menuUnit.Unit_ID)}>
              <Users /> รายชื่อสมาชิก
              <ContextMenuShortcut>ดับเบิลคลิก</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => openAddChild(menuUnit)}>
              <Plus /> เพิ่มห้องลูก
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => focusUnit(menuUnit.Unit_ID)}>
              <LocateFixed /> ซูมไปที่ห้องนี้
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={() => setDeactivating(menuUnit)}>
              <PowerOff /> ปิดห้อง
              <ContextMenuShortcut>Del</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        {companiesWithoutRoot.length > 0 && (
          <ContextMenuItem onSelect={() => setCompanyDialog(true)}>
            <Building2 /> เพิ่มห้องบริษัท
          </ContextMenuItem>
        )}
        <ContextMenuItem onSelect={undo} disabled={!canUndo}>
          <Undo2 /> Undo
          <ContextMenuShortcut>Ctrl+Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={redo} disabled={!canRedo}>
          <Redo2 /> Redo
          <ContextMenuShortcut>Ctrl+Shift+Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={relayout}>
          <LayoutGrid /> จัดเรียงใหม่ตามลำดับชั้น
        </ContextMenuItem>
        <ContextMenuItem onSelect={fitAll}>
          <LocateFixed /> แสดงทั้งผัง
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => setPublishOpen(true)} disabled={!loggedIn}>
          <BookmarkCheck /> {loggedIn ? "ตั้งผังนี้เป็นผังกลาง" : "ตั้งเป็นผังกลาง (ต้อง login)"}
        </ContextMenuItem>
        {warned.length > 0 && (
          <ContextMenuItem onSelect={nextWarning} className="text-amber-600 focus:text-amber-700">
            <TriangleAlert className="text-amber-600" /> ไปห้องที่ผิดกฎ ({warned.length})
          </ContextMenuItem>
        )}
        {(hiddenComs.size > 0 || search.trim() !== "") && (
          <ContextMenuItem
            onSelect={() => {
              setHiddenComs(new Set());
              setSearch("");
            }}
          >
            <X /> ล้างตัวกรอง
          </ContextMenuItem>
        )}
      </ContextMenuContent>
      </ContextMenu>
      </AddChildContext.Provider>

      <MembersDialog
        unit={membersUnit}
        units={units}
        lookups={lookups}
        onOpenChange={(open) => !open && setMembersUnitId(null)}
        onUnits={setUnits}
        onAddChild={openAddChild}
        onDeactivate={(u) => setDeactivating(u)}
      />

      <ConfirmParentDialog
        pending={pendingParent}
        stats={pendingParent ? subtreeStats(pendingParent.child.Unit_ID) : null}
        levelWarning={pendingParent ? rules.parentWarning(pendingParent.child, pendingParent.parent) : null}
        currentParent={pendingParent?.child.parent_unit_id != null ? byId.get(pendingParent.child.parent_unit_id) ?? null : null}
        onClose={() => setPendingParent(null)}
        onUnits={setUnits}
      />

      <UnitFormDialog state={unitForm} lookups={lookups} onClose={() => setUnitForm(null)} onUnits={setUnits} />

      <CompanyUnitDialog
        open={companyDialog}
        companies={companiesWithoutRoot}
        onClose={() => setCompanyDialog(false)}
        onUnits={setUnits}
      />

      <PublishLayoutDialog open={publishOpen} pending={publishing} onClose={() => setPublishOpen(false)} onOk={publishLayout} />

      <DeactivateUnitDialog
        unit={deactivating}
        childCount={deactivating ? childrenOf.get(deactivating.Unit_ID)?.length ?? 0 : 0}
        onClose={() => setDeactivating(null)}
        onDone={(next) => {
          setUnits(next);
          setMembersUnitId(null);
        }}
        onUnits={setUnits}
        onOpenMembers={(u) => {
          setDeactivating(null);
          setMembersUnitId(u.Unit_ID);
        }}
      />
    </div>
  );
}
