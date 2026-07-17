"use client";

import { createDemoData, type DemoData } from "./demo-data";

const STORAGE_KEY = "mywitness-demo-data";
const DEMO_FLAG_KEY = "mywitness-demo-mode";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_FLAG_KEY) === "true";
}

export function setDemoMode(enabled: boolean) {
  localStorage.setItem(DEMO_FLAG_KEY, enabled ? "true" : "false");
  document.cookie = enabled
    ? "mywitness-demo=1; path=/; max-age=31536000; SameSite=Lax"
    : "mywitness-demo=; path=/; max-age=0; SameSite=Lax";
  if (enabled && !localStorage.getItem(STORAGE_KEY)) {
    saveDemoData(createDemoData());
  }
  if (!enabled) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function loadDemoData(): DemoData {
  if (typeof window === "undefined") return createDemoData();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const data = createDemoData();
    saveDemoData(data);
    return data;
  }
  try {
    return JSON.parse(raw) as DemoData;
  } catch {
    const data = createDemoData();
    saveDemoData(data);
    return data;
  }
}

export function saveDemoData(data: DemoData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function resetDemoData() {
  const data = createDemoData();
  saveDemoData(data);
  return data;
}
