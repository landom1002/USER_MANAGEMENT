"use client";

import { createContext, useContext } from "react";
import {
  addMember, cancelMember, createCompanyUnit, createUnit, deactivateUnit, editMember, endMember,
  loadUnitHistory, loadUserUnits, moveMember, publishDefaultLayout, reactivateUnit, replaceManager, saveUnitPositions, setManager,
  setParent, setPrimary, updateUnit,
} from "@/app/c/admin/org-units/actions";

/** ทุกอย่างที่ UI เรียก (Server Actions) — ผ่าน context เพื่อสลับตัวอื่นแทนได้ (เช่นตอนทดสอบ) */
export type OrgApi = {
  loadUnitHistory: typeof loadUnitHistory;
  loadUserUnits: typeof loadUserUnits;
  setParent: typeof setParent;
  createUnit: typeof createUnit;
  createCompanyUnit: typeof createCompanyUnit;
  updateUnit: typeof updateUnit;
  deactivateUnit: typeof deactivateUnit;
  reactivateUnit: typeof reactivateUnit;
  addMember: typeof addMember;
  moveMember: typeof moveMember;
  setPrimary: typeof setPrimary;
  setManager: typeof setManager;
  replaceManager: typeof replaceManager;
  endMember: typeof endMember;
  editMember: typeof editMember;
  cancelMember: typeof cancelMember;
  saveUnitPositions: typeof saveUnitPositions;
  publishDefaultLayout: typeof publishDefaultLayout;
};

export const serverApi: OrgApi = {
  loadUnitHistory, loadUserUnits, setParent, createUnit, createCompanyUnit, updateUnit, deactivateUnit, reactivateUnit,
  addMember, moveMember, setPrimary, setManager, replaceManager, endMember, editMember, cancelMember,
  saveUnitPositions, publishDefaultLayout,
};

const OrgApiContext = createContext<OrgApi>(serverApi);

export const OrgApiProvider = OrgApiContext.Provider;
export const useOrgApi = () => useContext(OrgApiContext);
