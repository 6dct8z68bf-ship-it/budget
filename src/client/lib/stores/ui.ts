// Shared transient UI status messages that cross component boundaries (e.g. the import
// status line is owned by ImportPanel but also written by Entry's clear-period action;
// the workspace switch status lives in the Topbar but is written by Settings actions).
import { writable } from "svelte/store";

export const importStatus = writable("");
let importTimer: ReturnType<typeof setTimeout> | undefined;
export function setImportStatus(message: string, ms = 2600): void {
  importStatus.set(message);
  clearTimeout(importTimer);
  importTimer = setTimeout(() => importStatus.set(""), ms);
}

export const workspaceSwitchStatus = writable("");
export function setWorkspaceSwitchStatus(message: string): void {
  workspaceSwitchStatus.set(message);
}
