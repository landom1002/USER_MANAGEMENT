"use client";

// In-memory mock "API" — แทน fetchTeamMembers / updatePlanApprover / updatePlanOwner / updatePlanOrg
// ของ WEB_KPIs ข้อมูลจะรีเซ็ตเมื่อรีเฟรชหน้า

import { useSyncExternalStore } from "react";
import { buildTeamMember, createInitialPlans, USERS } from "./mock-data";
import type { OrgValues, TeamMember } from "./types";
import { sleep } from "./utils";

const LATENCY = 450;

let plans: Record<string, TeamMember[]> = createInitialPlans();
const listeners = new Set<() => void>();
const EMPTY: TeamMember[] = [];

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function patchPlan(planCode: string, fn: (row: TeamMember) => TeamMember) {
  const next: Record<string, TeamMember[]> = {};
  let found = false;
  for (const [policy, rows] of Object.entries(plans)) {
    next[policy] = rows.map((r) => {
      if (r.kpi_plan_code !== planCode) return r;
      found = true;
      return fn(r);
    });
  }
  if (!found) throw new Error(`ไม่พบแผน ${planCode}`);
  plans = next;
  emit();
}

const num = (v?: string) => (v ? Number(v) : null);

export function useTeamMembers(policy: string): TeamMember[] {
  return useSyncExternalStore(
    subscribe,
    () => (policy ? plans[policy] ?? EMPTY : EMPTY),
    () => EMPTY,
  );
}

export function fetchUsers() {
  return USERS;
}

export async function updatePlanApprover(planCode: string, approverId: number) {
  await sleep(LATENCY);
  patchPlan(planCode, (r) =>
    buildTeamMember(r.kpi_plan_code, r.kpi_plan_id, USERS.find((u) => u.UserID === r.UserID)!, approverId, r.com_id, r.SecID, r.PositionID, r.DepID),
  );
}

export async function updatePlanOwner(planCode: string, ownerId: number) {
  await sleep(LATENCY);
  const owner = USERS.find((u) => u.UserID === ownerId);
  if (!owner) throw new Error("ไม่พบผู้ใช้");
  patchPlan(planCode, (r) =>
    buildTeamMember(r.kpi_plan_code, r.kpi_plan_id, owner, r.empUserID, r.com_id, r.SecID, r.PositionID, r.DepID),
  );
}

export async function updatePlanOrg(planCode: string, vals: OrgValues) {
  await sleep(LATENCY);
  patchPlan(planCode, (r) =>
    buildTeamMember(
      r.kpi_plan_code,
      r.kpi_plan_id,
      USERS.find((u) => u.UserID === r.UserID)!,
      r.empUserID,
      num(vals.comId),
      num(vals.secId),
      num(vals.positionId),
      num(vals.depId),
    ),
  );
}

export function resetMockData() {
  plans = createInitialPlans();
  emit();
}
