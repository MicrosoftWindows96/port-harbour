import type { WebviewMessage } from "./types";

interface VsCodeApi {
  postMessage(msg: WebviewMessage): void;
  setState(state: unknown): void;
  getState(): unknown;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

let cached: VsCodeApi | undefined;

export function vscode(): VsCodeApi {
  if (cached) return cached;
  if (typeof window !== "undefined" && window.acquireVsCodeApi) {
    cached = window.acquireVsCodeApi();
  } else {
    cached = {
      postMessage: (m: WebviewMessage) => console.log("[mock postMessage]", m),
      setState: () => {},
      getState: () => undefined
    };
  }
  return cached;
}

export function loadPersistedState<T>(key: string, fallback: T): T {
  try {
    const s = vscode().getState() as Record<string, unknown> | undefined;
    if (s && key in s) return s[key] as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function savePersistedState(key: string, value: unknown) {
  try {
    const prev = (vscode().getState() as Record<string, unknown> | undefined) ?? {};
    vscode().setState({ ...prev, [key]: value });
  } catch {
    /* ignore */
  }
}
