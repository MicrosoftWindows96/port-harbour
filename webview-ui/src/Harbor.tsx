import { useEffect, useMemo, useRef, useState } from "react";
import { connKey } from "./App";
import type {
  Conn,
  DockerContainer,
  DockerEvent,
  DockerImage,
  DockerSnapshot,
  SceneSettings,
  Snapshot
} from "./types";

interface Props {
  snapshot: Snapshot | null;
  docker: DockerSnapshot | null;
  recentEvents: DockerEvent[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  sceneSettings: SceneSettings;
  onKillPid?: (pid: number) => void;
}

const PIXEL_W = 640;
const PIXEL_H = 360;

type TimeOfDay = "dawn" | "day" | "goldenHour" | "dusk" | "night";

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours();
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 17) return "day";
  if (h >= 17 && h < 19) return "goldenHour";
  if (h >= 19 && h < 21) return "dusk";
  return "night";
}

// Smooth palette interpolation between current and next TOD.
function getSmoothSky(): SkyPalette {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  const tod = getTimeOfDay();
  // Determine fractional progress to next TOD (last hour of each window = blend phase)
  const boundaryHour =
    tod === "dawn" ? 7 :
    tod === "day" ? 17 :
    tod === "goldenHour" ? 19 :
    tod === "dusk" ? 21 :
    5; // night → dawn
  const hoursTo = boundaryHour > h ? boundaryHour - h : 24 - h + boundaryHour;
  // Only blend in the last hour before transition
  if (hoursTo > 1) return skyForTime(tod);
  const next: TimeOfDay =
    tod === "dawn" ? "day" :
    tod === "day" ? "goldenHour" :
    tod === "goldenHour" ? "dusk" :
    tod === "dusk" ? "night" :
    "dawn";
  const frac = (60 - m) / 60; // 1 at start of last hour, 0 at end
  const t = 1 - frac; // 0..1 toward next
  const a = skyForTime(tod);
  const b = skyForTime(next);
  return blendSky(a, b, t);
}

function blendSky(a: SkyPalette, b: SkyPalette, t: number): SkyPalette {
  return {
    skyHigh: mixColor(a.skyHigh, b.skyHigh, t),
    skyLow: mixColor(a.skyLow, b.skyLow, t),
    hillFar: mixColor(a.hillFar, b.hillFar, t),
    hillMid: mixColor(a.hillMid, b.hillMid, t),
    cloudTint: a.cloudTint * (1 - t) + b.cloudTint * t,
    sunX: a.sunX * (1 - t) + b.sunX * t,
    sunY: a.sunY * (1 - t) + b.sunY * t,
    sunColor: mixColor(a.sunColor, b.sunColor, t),
    sunGlow: mixColor(a.sunGlow, b.sunGlow, t),
    waterShallow: mixColor(a.waterShallow, b.waterShallow, t),
    waterMid: mixColor(a.waterMid, b.waterMid, t),
    waterDeep: mixColor(a.waterDeep, b.waterDeep, t),
    starsAlpha: a.starsAlpha * (1 - t) + b.starsAlpha * t,
    windowGlowChance: a.windowGlowChance * (1 - t) + b.windowGlowChance * t,
    ambient: a.ambient * (1 - t) + b.ambient * t
  };
}

interface SkyPalette {
  skyHigh: string;
  skyLow: string;
  hillFar: string;
  hillMid: string;
  cloudTint: number;
  sunX: number;
  sunY: number;
  sunColor: string;
  sunGlow: string;
  waterShallow: string;
  waterMid: string;
  waterDeep: string;
  starsAlpha: number;
  windowGlowChance: number;
  ambient: number; // 1 = full sun, 0.3 = dim
}

function skyForTime(t: TimeOfDay): SkyPalette {
  switch (t) {
    case "dawn":
      return {
        skyHigh: "#5a4a8a", skyLow: "#ffb6a3",
        hillFar: "#7a8a8c", hillMid: "#5a6a64",
        cloudTint: 0.3,
        sunX: PIXEL_W - 70, sunY: 95,
        sunColor: "#ffd8a8", sunGlow: "#ff9a7a",
        waterShallow: "#5b8caf", waterMid: "#3a6088", waterDeep: "#1a3a5c",
        starsAlpha: 0.15, windowGlowChance: 0.5, ambient: 0.75
      };
    case "day":
      return {
        skyHigh: "#9bd9ff", skyLow: "#cdeaff",
        hillFar: "#7a9a8c", hillMid: "#4f7064",
        cloudTint: 0,
        sunX: PIXEL_W - 70, sunY: 56,
        sunColor: "#ffe9a8", sunGlow: "#ffd884",
        waterShallow: "#5b9caf", waterMid: "#3a7088", waterDeep: "#214a5c",
        starsAlpha: 0, windowGlowChance: 0.2, ambient: 1.0
      };
    case "goldenHour":
      return {
        skyHigh: "#5a3a78", skyLow: "#ffa66b",
        hillFar: "#6a7a7a", hillMid: "#4a5a54",
        cloudTint: 0.4,
        sunX: PIXEL_W - 80, sunY: 130,
        sunColor: "#ffcd5a", sunGlow: "#ff7a3a",
        waterShallow: "#a07a8c", waterMid: "#5a4a78", waterDeep: "#2a2a4c",
        starsAlpha: 0.05, windowGlowChance: 0.55, ambient: 0.85
      };
    case "dusk":
      return {
        skyHigh: "#2a1a4c", skyLow: "#7a4a8a",
        hillFar: "#3a4a4c", hillMid: "#1f3034",
        cloudTint: 0.55,
        sunX: PIXEL_W - 60, sunY: 160,
        sunColor: "#ff6a3a", sunGlow: "#aa3a4a",
        waterShallow: "#3a4a6c", waterMid: "#2a3a5c", waterDeep: "#0a1a3c",
        starsAlpha: 0.5, windowGlowChance: 0.8, ambient: 0.55
      };
    case "night":
      return {
        skyHigh: "#0a0a2a", skyLow: "#1a2a5c",
        hillFar: "#1a2a34", hillMid: "#0f1a24",
        cloudTint: 0.7,
        sunX: PIXEL_W - 100, sunY: 60,
        sunColor: "#dcdcff", sunGlow: "#8a8aff",
        waterShallow: "#1a2a4c", waterMid: "#0a1a3c", waterDeep: "#02061a",
        starsAlpha: 0.95, windowGlowChance: 0.95, ambient: 0.35
      };
  }
}

const ZONE = {
  skyTop: 0,
  skyHeight: 140,
  hillTop: 70,
  buildingsTop: 90,
  seawallTop: 230,
  seawallHeight: 16,
  waterTop: 246,
  waterHeight: 114
};

const PALETTE = {
  // Sky
  skyHigh: "#9bd9ff",
  skyLow: "#cdeaff",
  cloud: "#ffffff",
  sun: "#ffe9a8",
  // Hills behind buildings
  hillFar: "#7a9a8c",
  hillMid: "#4f7064",
  // Building walls (sampled from reference)
  wallPalette: [
    "#ead2b3", // cream
    "#e2a8aa", // pink
    "#c9d4cc", // pale teal
    "#9fc2bc", // teal
    "#d8a888", // peach
    "#bfa6d4", // lavender
    "#dccfa5", // sand
    "#aebccd", // dusty blue
    "#c97a72", // terracotta red
    "#e5b8c4", // rose
    "#9ab2a3"  // sage
  ],
  roof: "#a64a36",
  roofDark: "#7d3527",
  roofTrim: "#5a2418",
  window: "#314a5e",
  windowGlow: "#ffd884",
  windowShutter: "#3e6276",
  windowShutterRed: "#9a443a",
  doorDark: "#3a2516",
  flower: "#e25c66",
  flowerLeaf: "#5fa371",
  laundry: ["#ffb6c1", "#86c7ff", "#ffd884", "#c3f0a8", "#ff9ec1"],
  // Tower / cathedral
  towerWall: "#f3ecd4",
  towerRoof: "#3c5c4f",
  // Palazzo (docker bay)
  palazzoWall: "#b34a3c",
  palazzoTrim: "#7d2f24",
  palazzoBalc: "#3a1a14",
  palazzoRoof: "#5a2418",
  // Seawall
  seawallStone: "#2c3434",
  seawallTop: "#444c4c",
  seawallShadow: "#1a1f1f",
  seawallMortar: "#4a544c",
  // Water
  waterDeep: "#214a5c",
  waterMid: "#3a7088",
  waterShallow: "#5b9caf",
  waterReflect: "#7ec5d8",
  // Boats
  hullBlue: "#2e4a6b",
  hullRed: "#a64a36",
  hullGreen: "#4a7048",
  hullCabin: "#cfd4d4",
  hullDeck: "#3a2c1c",
  ropeColor: "#241a10",
  mast: "#241a10",
  smoke: "#d3d3d3",
  workerSkin: "#e2b692",
  workerShirt: "#3a5a78",
  workerRed: "#a64a36",
  workerYellow: "#e8c25a",
  bubbleBg: "#fffbe6",
  bubbleBorder: "#241a10",
  bubbleText: "#241a10"
};

interface ShipHit {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  conn: Conn;
}

interface ScenicHit {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  lines: string[];
}

let scenicHits: ScenicHit[] = [];
let currentSky: SkyPalette | null = null;
let currentTod: TimeOfDay = "day";
let crtMode = false;
let lastClickWasBoat = false;
let currentTheme: import("./types").ThemeKind = "mediterranean";

// Bitmap pixel font (3 wide × 5 tall). Each char = 5 row-bit-patterns.
// MSB-first within 3 bits. Renders crisp at any scale.
const FONT5: Record<string, number[]> = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b010],
  K: [0b101, 0b110, 0b100, 0b110, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b111, 0b101, 0b101],
  N: [0b101, 0b111, 0b111, 0b111, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  Q: [0b010, 0b101, 0b101, 0b011, 0b001],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b011],
  V: [0b101, 0b101, 0b101, 0b010, 0b010],
  W: [0b101, 0b101, 0b111, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  "0": [0b010, 0b101, 0b101, 0b101, 0b010],
  "1": [0b010, 0b110, 0b010, 0b010, 0b111],
  "2": [0b110, 0b001, 0b010, 0b100, 0b111],
  "3": [0b110, 0b001, 0b010, 0b001, 0b110],
  "4": [0b101, 0b101, 0b111, 0b001, 0b001],
  "5": [0b111, 0b100, 0b110, 0b001, 0b110],
  "6": [0b011, 0b100, 0b110, 0b101, 0b010],
  "7": [0b111, 0b001, 0b010, 0b100, 0b100],
  "8": [0b010, 0b101, 0b010, 0b101, 0b010],
  "9": [0b010, 0b101, 0b011, 0b001, 0b110],
  " ": [0, 0, 0, 0, 0],
  "/": [0b001, 0b001, 0b010, 0b100, 0b100],
  "-": [0b000, 0b000, 0b111, 0b000, 0b000],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  ":": [0b000, 0b010, 0b000, 0b010, 0b000]
};

const FONT_W = 3;
const FONT_H = 5;
const FONT_GAP = 1;

function pixelTextWidth(text: string): number {
  return text.length * (FONT_W + FONT_GAP) - FONT_GAP;
}

function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
) {
  ctx.fillStyle = color;
  const upper = text.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    const glyph = FONT5[ch];
    const cx = x + i * (FONT_W + FONT_GAP);
    if (!glyph) continue;
    for (let r = 0; r < FONT_H; r++) {
      const row = glyph[r];
      if (!row) continue;
      for (let c = 0; c < FONT_W; c++) {
        if (row & (1 << (FONT_W - 1 - c))) {
          ctx.fillRect(cx + c, y + r, 1, 1);
        }
      }
    }
  }
}
const foundEasterEggs = new Set<string>();
const portHistory = new Map<number, number[]>();
const HISTORY_LEN = 30;
const seenProcs = new Set<string>();
const constructionEffects: { proc: string; startT: number }[] = [];

type MasterPhase =
  | "idle"
  | "to_door"
  | "in_door"
  | "from_door"
  | "to_path"
  | "throw"
  | "kiss"
  | "fainted"
  | "rising"
  | "returning";

const portMaster: { phase: MasterPhase; phaseStart: number } = {
  phase: "idle",
  phaseStart: 0
};

export function triggerPortMasterRomance() {
  if (portMaster.phase !== "idle") return;
  portMaster.phase = "to_door";
  portMaster.phaseStart = performance.now();
}

export function recordPortTraffic(port: number, count: number) {
  let arr = portHistory.get(port);
  if (!arr) {
    arr = [];
    portHistory.set(port, arr);
  }
  arr.push(count);
  if (arr.length > HISTORY_LEN) arr.shift();
}

if (typeof window !== "undefined") {
  (window as any).__harborEggs = foundEasterEggs;
}

if (typeof window !== "undefined") {
  let buf: string[] = [];
  const SEQ = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];
  window.addEventListener("keydown", (e) => {
    buf.push(e.key);
    if (buf.length > SEQ.length) buf = buf.slice(-SEQ.length);
    if (buf.length === SEQ.length && buf.every((k, i) => k === SEQ[i])) {
      crtMode = !crtMode;
      buf = [];
    }
  });
}

interface SailAnim {
  id: string;
  kind: "in" | "out";
  startT: number;
  duration: number;
  startX: number;
  endX: number;
  y: number;
  hull: string;
  label: string;
}

const sailAnims: SailAnim[] = [];

export function queueSailAnim(a: SailAnim) {
  sailAnims.push(a);
}

interface ActiveBubble {
  text: string;
  expires: number;
  x: number;
  y: number;
  color: string;
}

export function Harbor({
  snapshot,
  docker,
  recentEvents,
  selectedKey,
  onSelect,
  sceneSettings
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const hitsRef = useRef<ShipHit[]>([]);
  const frameRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const bubblesRef = useRef<ActiveBubble[]>([]);
  const bgCacheRef = useRef<HTMLCanvasElement | null>(null);
  const bgKeyRef = useRef<string>("");
  const buildingsCacheRef = useRef<HTMLCanvasElement | null>(null);
  const buildingsKeyRef = useRef<string>("");
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startPanX: 0,
    startPanY: 0,
    moved: false
  });

  const listenConns = useMemo<Conn[]>(() => {
    if (!snapshot) return [];
    return snapshot.conns.filter((c) => c.state === "LISTEN");
  }, [snapshot]);

  const establishedByPort = useMemo<Map<number, number>>(() => {
    const m = new Map<number, number>();
    if (!snapshot) return m;
    for (const c of snapshot.conns) {
      if (c.state !== "ESTABLISHED") continue;
      m.set(c.port, (m.get(c.port) ?? 0) + 1);
    }
    // Record traffic into history map for sparklines.
    for (const [port, count] of m) recordPortTraffic(port, count);
    return m;
  }, [snapshot]);

  const buildings = useMemo<Building[]>(
    () => buildSkyline(listenConns, establishedByPort),
    [listenConns, establishedByPort]
  );

  // Detect new processes → spawn construction crane effect (skip first mount).
  const firstMountRef = useRef(true);
  useEffect(() => {
    for (const b of buildings) {
      if (b.back) continue;
      if (!seenProcs.has(b.process)) {
        seenProcs.add(b.process);
        if (!firstMountRef.current) {
          constructionEffects.push({ proc: b.process, startT: performance.now() });
        }
      }
    }
    firstMountRef.current = false;
  }, [buildings]);

  const runningContainers = useMemo<DockerContainer[]>(
    () => docker?.containers.filter((c) => c.state === "running") ?? [],
    [docker]
  );
  const stoppedContainers = useMemo<DockerContainer[]>(
    () => docker?.containers.filter((c) => c.state !== "running") ?? [],
    [docker]
  );
  const images = useMemo<DockerImage[]>(
    () => docker?.images.slice(0, 12) ?? [],
    [docker]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const ro = new ResizeObserver(() => fit(canvas, wrapper));
    ro.observe(wrapper);
    fit(canvas, wrapper);
    return () => ro.disconnect();
  }, [zoom]);

  useEffect(() => {
    const latest = recentEvents[0];
    if (!latest) return;
    bubblesRef.current = [
      {
        text: `${latest.action.toUpperCase()} ${truncate(latest.name || latest.image || latest.id, 36)}`,
        expires: performance.now() + 2400,
        x: 0,
        y: 0,
        color: actionColor(latest.action)
      }
    ];
    // Sail-in / sail-out animation per docker event.
    if (latest.action === "start" || latest.action === "create") {
      queueSailAnim({
        id: latest.id || String(performance.now()),
        kind: "in",
        startT: performance.now(),
        duration: 5500,
        startX: -20,
        endX: PIXEL_W - 100,
        y: ZONE.waterTop + 30,
        hull: "#00f5ff",
        label: latest.name || latest.image || latest.id
      });
    } else if (
      latest.action === "die" ||
      latest.action === "stop" ||
      latest.action === "kill"
    ) {
      queueSailAnim({
        id: latest.id || String(performance.now()),
        kind: "out",
        startT: performance.now(),
        duration: 5500,
        startX: PIXEL_W - 100,
        endX: PIXEL_W + 30,
        y: ZONE.waterTop + 30,
        hull: "#5a3a78",
        label: latest.name || latest.image || latest.id
      });
    }
  }, [recentEvents]);

  const hoverRef = useRef<{ px: number; py: number; hit: ShipHit | null }>({
    px: -1,
    py: -1,
    hit: null
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let lastFrameTime = 0;
    const targetMs = 1000 / 30; // 30 FPS cap

    const loop = () => {
      const nowFrame = performance.now();
      // Skip frame if too soon OR tab hidden (saves battery + thermals).
      if (
        document.hidden ||
        nowFrame - lastFrameTime < targetMs
      ) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastFrameTime = nowFrame;
      if (!sceneSettings.paused) frameRef.current += 1;
      const now = nowFrame;
      bubblesRef.current = bubblesRef.current.filter((b) => b.expires > now);
      const tod = getTimeOfDay();
      const sky = getSmoothSky();
      applyTheme(sceneSettings.theme);
      const themeKey = sceneSettings.theme;
      const bgKey = `${tod}|${themeKey}`;
      if (bgKey !== bgKeyRef.current) {
        ensureBgCache(bgCacheRef, sky, tod);
        bgKeyRef.current = bgKey;
      }
      const bldKey = `${tod}|${themeKey}|${buildings.length}|${buildings
        .map((b) => `${b.x}:${b.width}:${b.height}:${b.process}`)
        .join(",")}`;
      if (bldKey !== buildingsKeyRef.current) {
        ensureBuildingsCache(buildingsCacheRef, buildings, sky, tod);
        buildingsKeyRef.current = bldKey;
      }
      hitsRef.current = drawScene(ctx, canvas, {
        buildings,
        listenConns,
        establishedByPort,
        runningContainers,
        stoppedContainers,
        images,
        bubbles: bubblesRef.current,
        selectedKey,
        frame: frameRef.current,
        sky,
        tod,
        tickerEvents: recentEvents,
        weather: sceneSettings.weather,
        heatMap: sceneSettings.heatMap,
        networkGraph: sceneSettings.networkGraph,
        bgCache: bgCacheRef.current,
        buildingsCache: buildingsCacheRef.current
      });
      // Update hover hit + draw tooltip on top.
      const h = hoverRef.current;
      if (h.px >= 0) {
        const shipHit = hitsRef.current.find(
          (hit) =>
            h.px >= hit.x &&
            h.px <= hit.x + hit.w &&
            h.py >= hit.y &&
            h.py <= hit.y + hit.h
        );
        // Scan scenicHits in reverse so items registered LATER (smaller specific
        // sprites like jukebox, mailman) win over earlier large hits (buildings).
        let scenic: ScenicHit | undefined;
        if (!shipHit) {
          for (let i = scenicHits.length - 1; i >= 0; i--) {
            const hit = scenicHits[i];
            if (
              h.px >= hit.x &&
              h.px <= hit.x + hit.w &&
              h.py >= hit.y &&
              h.py <= hit.y + hit.h
            ) {
              scenic = hit;
              break;
            }
          }
        }
        h.hit = shipHit ?? null;
        if (shipHit || scenic) {
          const sx = canvas.width / PIXEL_W;
          const sy = canvas.height / PIXEL_H;
          ctx.save();
          ctx.scale(sx, sy);
          if (shipHit) drawTooltip(ctx, h.px, h.py, shipHit.conn);
          else if (scenic) {
            drawScenicTooltip(ctx, h.px, h.py, scenic);
            // Record easter-egg discoveries for achievements.
            foundEasterEggs.add(scenic.key);
          }
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [
    buildings,
    listenConns,
    establishedByPort,
    runningContainers,
    stoppedContainers,
    images,
    selectedKey,
    sceneSettings
  ]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Prime audio on every canvas click (browsers gate Web Audio until user gesture).
    try {
      (window as any).__harborPrimeAudio?.();
    } catch {
      /* ignore */
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = PIXEL_W / rect.width;
    const scaleY = PIXEL_H / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    // First check boats (highest priority).
    const hit = hitsRef.current.find(
      (h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h
    );
    if (hit) {
      lastClickWasBoat = true;
      onSelect(hit.key);
      try {
        (window as any).__harborHorn?.();
      } catch {
        /* ignore */
      }
      return;
    }
    // Scenic hit click? Search in reverse (smaller late-registered items win)
    let scenic: ScenicHit | undefined;
    for (let i = scenicHits.length - 1; i >= 0; i--) {
      const hit = scenicHits[i];
      if (px >= hit.x && px <= hit.x + hit.w && py >= hit.y && py <= hit.y + hit.h) {
        scenic = hit;
        break;
      }
    }
    if (scenic && scenic.key === "princess") {
      triggerPortMasterRomance();
      return;
    }
    if (scenic && scenic.key === "jukebox") {
      try {
        (window as any).__harborToggleMusic?.();
      } catch {
        /* ignore */
      }
      return;
    }
    // Then check building click → select that process's first conn (no spotlight).
    for (const b of buildings) {
      if (b.back) continue;
      if (px >= b.x && px <= b.x + b.width && py >= b.topY && py <= b.baseY) {
        const conn = b.ports[0];
        if (conn) {
          lastClickWasBoat = false;
          onSelect(connKey(conn));
          return;
        }
      }
    }
    lastClickWasBoat = false;
    onSelect(null);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = PIXEL_W / rect.width;
    const scaleY = PIXEL_H / rect.height;
    hoverRef.current.px = (e.clientX - rect.left) * scaleX;
    hoverRef.current.py = (e.clientY - rect.top) * scaleY;
  };

  const onMouseLeave = () => {
    hoverRef.current.px = -1;
    hoverRef.current.py = -1;
    hoverRef.current.hit = null;
  };

  function fit(canvas: HTMLCanvasElement, wrapper: HTMLDivElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const ratio = PIXEL_W / PIXEL_H;
    const wrapH = wrapper.clientHeight;
    // Uniform zoom: scale BOTH axes from base "fills wrapper vertically"
    const baseH = wrapH;
    const dispH = baseH * zoom;
    const dispW = dispH * ratio;
    canvas.style.width = `${dispW}px`;
    canvas.style.height = `${dispH}px`;
    canvas.width = Math.floor(dispW * dpr);
    canvas.height = Math.floor(dispH * dpr);
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "linear-gradient(to bottom, #0a0a2a 0%, #1a2a5c 38%, #214a5c 60%, #0a1a3c 100%)",
        imageRendering: "pixelated"
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        dragRef.current = {
          active: true,
          startX: e.clientX,
          startY: e.clientY,
          startPanX: panX,
          startPanY: panY,
          moved: false
        };
      }}
      onMouseUp={() => {
        dragRef.current.active = false;
      }}
      onMouseMoveCapture={(e: React.MouseEvent<HTMLDivElement>) => {
        if (dragRef.current.active) {
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragRef.current.moved = true;
          if (dragRef.current.moved) {
            const wrap = wrapperRef.current;
            const c = canvasRef.current;
            if (wrap && c) {
              const wrapW = wrap.clientWidth;
              const wrapH = wrap.clientHeight;
              const cw = c.clientWidth;
              const ch = c.clientHeight;
              const minPanX = Math.min(0, wrapW - cw);
              const minPanY = Math.min(0, wrapH - ch);
              // Center when canvas smaller than wrapper
              const targetPanX =
                cw <= wrapW
                  ? Math.floor((wrapW - cw) / 2)
                  : Math.max(minPanX, Math.min(0, dragRef.current.startPanX + dx));
              const targetPanY =
                ch <= wrapH
                  ? Math.floor((wrapH - ch) / 2)
                  : Math.max(minPanY, Math.min(0, dragRef.current.startPanY + dy));
              setPanX(targetPanX);
              setPanY(targetPanY);
            }
          }
        }
        onMouseMove(e as unknown as React.MouseEvent<HTMLCanvasElement>);
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={(e) => {
          if (dragRef.current.moved) {
            dragRef.current.moved = false;
            return;
          }
          onClick(e);
        }}
        onMouseLeave={onMouseLeave}
        style={{
          imageRendering: "pixelated",
          cursor: dragRef.current.active ? "grabbing" : "crosshair",
          display: "block",
          position: "absolute",
          left: `${panX}px`,
          top: `${panY}px`
        }}
      />
      {/* Zoom controls */}
      <div
        style={{
          position: "absolute",
          right: 8,
          top: 8,
          display: "flex",
          gap: 4,
          background: "rgba(20,12,40,0.7)",
          border: "1px solid #2a1452",
          padding: 4,
          borderRadius: 2,
          zIndex: 5
        }}
      >
        <button
          onClick={() => setZoom((z: number) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
          style={zoomBtn}
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPanX(0);
          }}
          style={zoomBtn}
        >
          ⟲
        </button>
        <button
          onClick={() => setZoom((z: number) => Math.min(3, +(z + 0.25).toFixed(2)))}
          style={zoomBtn}
        >
          +
        </button>
      </div>
    </div>
  );
}

type RoofKind = "flat" | "peaked" | "hipped";

const THEMES: Record<import("./types").ThemeKind, { wallPalette: string[]; roof: string; roofDark: string; roofTrim: string }> = {
  mediterranean: {
    wallPalette: [
      "#ead2b3", "#e2a8aa", "#c9d4cc", "#9fc2bc", "#d8a888",
      "#bfa6d4", "#dccfa5", "#aebccd", "#c97a72", "#e5b8c4", "#9ab2a3"
    ],
    roof: "#a64a36", roofDark: "#7d3527", roofTrim: "#5a2418"
  },
  tokyo: {
    wallPalette: [
      "#1a2a4c", "#2a1a4c", "#3a3a5c", "#1a1a3c", "#3a2a5c",
      "#4a3a6c", "#2a3a5c", "#5a4a8c", "#3a4a6c", "#1a2a3c", "#0a0a2c"
    ],
    roof: "#ff00aa", roofDark: "#a4257a", roofTrim: "#5a0e4c"
  },
  caribbean: {
    wallPalette: [
      "#ffd884", "#ff8c28", "#5fa371", "#ff4a8d", "#ffde3c",
      "#3acdb5", "#ff7a3a", "#9ab2a3", "#e25c66", "#86c7ff", "#bff0ff"
    ],
    roof: "#e25c66", roofDark: "#a4253a", roofTrim: "#5a141a"
  },
  scandinavian: {
    wallPalette: [
      "#e0d8c4", "#c9d4cc", "#cdcacd", "#a8b2c0", "#dccdc0",
      "#8a9aa8", "#cdc4b8", "#aebccd", "#b8a098", "#d4c8b8", "#a8b8c4"
    ],
    roof: "#3a3a3a", roofDark: "#1a1a1a", roofTrim: "#0a0a0a"
  }
};

function applyTheme(t: import("./types").ThemeKind) {
  currentTheme = t;
  const T = THEMES[t];
  PALETTE.wallPalette = T.wallPalette;
  PALETTE.roof = T.roof;
  PALETTE.roofDark = T.roofDark;
  PALETTE.roofTrim = T.roofTrim;
}

interface Building {
  x: number;
  width: number;
  height: number;
  topY: number;
  baseY: number;
  wallColor: string;
  roofColor: string;
  windowCols: number;
  windowRows: number;
  hasShutters: boolean;
  hasLaundry: boolean;
  hasFlowers: boolean;
  hasBalcony: boolean;
  hasArchedWindow: boolean;
  roof: RoofKind;
  process: string;
  port: number;
  ports: Conn[];
  selectedKey?: string;
  isCathedralAnchor?: boolean;
  back?: boolean;
}

function buildSkyline(
  listen: Conn[],
  estab: Map<number, number>
): Building[] {
  const groups = new Map<string, Conn[]>();
  for (const c of listen) {
    const k = c.process || "?";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  let entries = Array.from(groups.entries())
    .map(([process, ports]) => ({
      process,
      ports,
      traffic: ports.reduce((acc, p) => acc + (estab.get(p.port) ?? 0), 0)
    }))
    .sort((a, b) => b.ports.length - a.ports.length);

  const maxBuildings = 18;
  if (entries.length > maxBuildings) entries = entries.slice(0, maxBuildings);

  const startX = 0;
  const endX = PIXEL_W - 96;
  const baseY = ZONE.seawallTop - 1;
  const palette = PALETTE.wallPalette;

  const out: Building[] = [];
  const anchorProcess = entries[0]?.process;

  // First pass: foreground row with varied widths, guaranteed to fill startX→endX.
  // Compute raw widths first, then scale so sum equals endX-startX.
  const rawW: number[] = [];
  for (const e of entries) {
    const hash = strHash(e.process);
    const portWeight = Math.log2(e.ports.length + 1);
    const w = 32 + portWeight * 8 + (hash % 18);
    rawW.push(Math.min(82, Math.max(24, Math.floor(w))));
  }
  const totalRaw = rawW.reduce((a, b) => a + b, 0) || 1;
  const target = endX - startX;
  const scale = target / totalRaw;
  let cursor = startX;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const hash = strHash(e.process);
    const portWeight = Math.log2(e.ports.length + 1);
    const width = Math.max(22, Math.round(rawW[i] * scale));
    const stories = Math.min(7, Math.max(3, Math.floor(portWeight) + 2 + ((hash >> 1) % 2)));
    const storyH = 13;
    const totalH = stories * storyH + 6;
    const wall = palette[hash % palette.length];
    const roofKind: RoofKind = pickRoof(hash);
    const x = cursor;
    const topY = baseY - totalH;
    const isCathedral = e.process === anchorProcess && e.ports.length >= 2;
    out.push({
      x,
      width: width + 1, // +1 overlap to prevent hairline gap
      height: totalH,
      topY,
      baseY,
      wallColor: wall,
      roofColor: ((hash >> 2) % 3) === 0 ? PALETTE.roofDark : PALETTE.roof,
      windowCols: width < 36 ? 2 : width < 56 ? 3 : 4,
      windowRows: stories,
      hasShutters: (hash >> 3) % 2 === 0,
      hasLaundry: (hash >> 4) % 3 === 0,
      hasFlowers: (hash >> 5) % 3 === 0,
      hasBalcony: (hash >> 6) % 4 === 0,
      hasArchedWindow: (hash >> 7) % 3 === 0,
      roof: roofKind,
      process: e.process,
      port: e.ports[0]?.port ?? 0,
      ports: e.ports,
      isCathedralAnchor: isCathedral
    });
    cursor += width;
  }

  // Second pass: back row of dimmer simpler buildings for depth.
  const backRow: Building[] = [];
  const backCount = Math.min(12, Math.max(3, Math.floor(out.length / 2)));
  for (let i = 0; i < backCount; i++) {
    const sample = out[(i * 3) % Math.max(out.length, 1)];
    if (!sample) break;
    const hash = strHash(`back:${sample.process}:${i}`);
    const width = 26 + (hash % 24);
    const stories = 3 + (hash % 3);
    const totalH = stories * 12 + 4;
    const wall = palette[(hash + 3) % palette.length];
    const x = (i * (PIXEL_W - 100) / backCount) + ((hash % 8) - 4);
    backRow.push({
      x,
      width,
      height: totalH,
      topY: baseY - totalH + 8, // peek above foreground
      baseY: baseY - 4,
      wallColor: wall,
      roofColor: PALETTE.roofDark,
      windowCols: 2,
      windowRows: stories,
      hasShutters: false,
      hasLaundry: false,
      hasFlowers: false,
      hasBalcony: false,
      hasArchedWindow: false,
      roof: pickRoof(hash),
      process: `__back_${i}`,
      port: 0,
      ports: [],
      back: true
    });
  }

  return [...backRow, ...out];
}

function pickRoof(hash: number): RoofKind {
  const r = hash % 9;
  if (r < 4) return "peaked";
  if (r < 7) return "flat";
  return "hipped";
}

function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface SceneState {
  buildings: Building[];
  listenConns: Conn[];
  establishedByPort: Map<number, number>;
  runningContainers: DockerContainer[];
  stoppedContainers: DockerContainer[];
  images: DockerImage[];
  bubbles: ActiveBubble[];
  selectedKey: string | null;
  frame: number;
  sky: SkyPalette;
  tod: TimeOfDay;
  tickerEvents: DockerEvent[];
  weather: import("./types").WeatherKind;
  heatMap: boolean;
  networkGraph: boolean;
  bgCache?: HTMLCanvasElement | null;
  buildingsCache?: HTMLCanvasElement | null;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  s: SceneState
): ShipHit[] {
  const w = canvas.width;
  const h = canvas.height;
  const sx = w / PIXEL_W;
  const sy = h / PIXEL_H;

  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.scale(sx, sy);

  scenicHits = [];
  currentSky = s.sky;
  currentTod = s.tod;
  const front = s.buildings.filter((b) => !b.back);
  // Blit cached background (sky + hills + fog + distant skyline)
  if (s.bgCache) {
    ctx.drawImage(s.bgCache, 0, 0, PIXEL_W, PIXEL_H);
  } else {
    drawSky(ctx, s.frame, s.sky, s.tod);
    drawHills(ctx, s.sky);
    drawAtmosphericFog(ctx, s.sky);
    drawDistantSkyline(ctx, s.sky);
  }
  // Animated stars overlay (cheap, but cache doesn't have twinkle)
  drawStarsOverlay(ctx, s.frame, s.sky);
  drawClouds(ctx, s.frame, s.sky);
  // Blit cached buildings
  if (s.buildingsCache) {
    ctx.drawImage(s.buildingsCache, 0, 0, PIXEL_W, PIXEL_H);
  } else {
    const back = s.buildings.filter((b) => b.back);
    for (const b of back) drawBuilding(ctx, b, s.sky);
    for (const b of front) drawBuilding(ctx, b, s.sky);
  }
  drawBackChimneySmoke(ctx, s.buildings.filter((b) => b.back), s.frame);
  drawBridge(ctx, front);
  drawChimneySmoke(ctx, front, s.frame);
  registerMikaelaHit(front);
  registerBuildingHits(front, s.establishedByPort);
  drawConstructionCranes(ctx, front);
  drawPortMaster(ctx, front, s.frame);
  drawKurdishFlag(ctx, s.frame);
  drawMailman(ctx, s.frame);
  drawSeaSerpent(ctx, s.frame);
  drawSpottyTheCat(ctx, front, s.frame);
  drawPalazzo(ctx, s.runningContainers, s.stoppedContainers, s.frame, s.sky);
  drawSeawall(ctx, s.tod);
  drawArchesInSeawall(ctx, s.sky);
  drawStoneSteps(ctx, front);
  drawLampPosts(ctx, s.tod, s.frame);
  drawWaterAndReflection(ctx, front, s.frame, s.sky, s.tod);
  drawLighthouse(ctx, s.frame, s.tod);
  drawImagesOnHorizon(ctx, s.images, s.frame);

  drawMessageInBottle(ctx, s.frame);
  drawSailAnims(ctx);
  const hits = drawBoats(ctx, front, s.listenConns, s.establishedByPort, s.selectedKey, s.frame);
  drawWorkersOnSeawall(ctx, s.frame, front.length);
  drawDollyTheDog(ctx, s.frame);
  drawSeagulls(ctx, s.frame);
  drawBuoys(ctx, s.frame);
  drawDebris(ctx, s.frame);
  drawJellyfish(ctx, s.frame, s.tod);
  drawFishJumps(ctx, s.frame);
  drawDolphinPod(ctx, s.frame);
  drawTreasureChest(ctx, s.frame);
  drawCrabs(ctx, s.frame);
  drawMoonShimmer(ctx, s.sky, s.frame);
  drawRainPuddles(ctx, s.weather, s.frame);
  drawUmbrellas(ctx, s.weather, s.frame);
  drawSailorsUnloading(ctx, front, s.frame);
  drawTigger(ctx, front, s.frame);
  drawOwlInBelfry(ctx, front, s.frame, s.tod);
  drawBatAtNight(ctx, s.frame, s.tod);
  drawJukebox(ctx, s.frame);
  drawSmudgeTheCat(ctx, front, s.frame);
  drawSubmarinePeriscope(ctx, s.frame);
  drawBuntingOnBridge(ctx, front);
  drawOldManAndPigeons(ctx, s.frame);
  drawLoversOnBridge(ctx, front, s.frame, s.tod);
  drawChildren(ctx, s.frame);
  drawWhaleSpout(ctx, s.frame);
  drawMermaid(ctx, s.frame, s.tod);
  drawShootingStars(ctx, s.frame, s.tod);
  drawAurora(ctx, s.frame, s.tod);
  drawUFO(ctx, s.frame);
  drawHolidayDecor(ctx, s.frame);
  drawWeather(ctx, s.frame, s.weather, s.sky);
  drawHeatShimmerOnPalazzo(ctx, s.runningContainers.length, s.frame);
  drawHeatMap(ctx, s.heatMap, s.establishedByPort, s.buildings, s.frame);
  drawNetworkGraph(ctx, s.networkGraph, hits, s.establishedByPort, s.frame);
  drawSparklineAboveSelected(ctx, s.selectedKey, hits);
  drawPirateFlagDay13(ctx, front);
  drawFireworksNYE(ctx, s.frame);
  drawSelectedSpotlight(ctx, s.selectedKey, hits);
  drawVignette(ctx);
  drawCRTOverlay(ctx);
  drawMiniMap(ctx, s.buildings, hits, s.runningContainers.length);
  drawTicker(ctx, s.tickerEvents);
  drawBubbles(ctx, s.bubbles);
  drawHud(ctx, s.listenConns.length, totalEstab(s.establishedByPort), s.runningContainers.length);

  ctx.restore();
  return hits;
}

function drawDistantSkyline(ctx: CanvasRenderingContext2D, _sky: SkyPalette) {
  // Four layers. stripH = gap-to-layer-above so each layer's flat baseline
  // bridges to the next, no sky-bleed, no giant flat plate.
  drawSkylineLayer(ctx, {
    baseY: 150, minH: 10, maxH: 22, minW: 6, maxW: 14,
    desatAmt: 0.7, roofAmt: 0.6, roofChance: 0.5,
    seed: 2027, towerChance: 0.04, stripH: 6
  });
  drawSkylineLayer(ctx, {
    baseY: 172, minH: 16, maxH: 32, minW: 9, maxW: 18,
    desatAmt: 0.5, roofAmt: 0.42, roofChance: 0.7,
    seed: 5101, towerChance: 0.05, stripH: 24
  });
  drawSkylineLayer(ctx, {
    baseY: 198, minH: 24, maxH: 46, minW: 12, maxW: 24,
    desatAmt: 0.3, roofAmt: 0.24, roofChance: 0.85,
    seed: 9103, towerChance: 0.06, stripH: 28
  });
  drawSkylineLayer(ctx, {
    baseY: 222, minH: 38, maxH: 68, minW: 16, maxW: 30,
    desatAmt: 0.15, roofAmt: 0.1, roofChance: 0.95,
    seed: 13507, towerChance: 0.05, stripH: 26
  });
}

interface SkylineLayer {
  baseY: number;
  minH: number;
  maxH: number;
  minW: number;
  maxW: number;
  desatAmt: number;
  roofAmt: number;
  roofChance: number;
  seed: number;
  towerChance: number;
  stripH: number;
}

function drawSkylineLayer(ctx: CanvasRenderingContext2D, L: SkylineLayer) {
  // Solid baseline strip sized to bridge gap between this layer and the one
  // above. Tuned per layer (see SKYLINE_LAYERS).
  const baselineColor = desat(PALETTE.wallPalette[2], L.desatAmt);
  ctx.fillStyle = baselineColor;
  ctx.fillRect(0, L.baseY - L.stripH, PIXEL_W, L.stripH);

  let x = -4;
  let s = L.seed;
  while (x < PIXEL_W + 4) {
    s = (s * 9301 + 49297) % 233280;
    const r = s / 233280;
    const w = L.minW + Math.floor(r * (L.maxW - L.minW + 1));
    const hVar = (s >> 3) % (L.maxH - L.minH + 1);
    const h = L.minH + hVar;
    const wallIdx = (s >> 1) % PALETTE.wallPalette.length;
    const wall = desat(PALETTE.wallPalette[wallIdx], L.desatAmt);
    const top = L.baseY - h;
    // Body
    ctx.fillStyle = wall;
    ctx.fillRect(x, top, w, h);
    // Side shading
    ctx.fillStyle = darken(wall, 0.06);
    ctx.fillRect(x, top, 1, h);
    // Roof variation: peaked / flat / hipped
    const roofPick = (s >> 5) % 3;
    const roofColor = desat(PALETTE.roof, L.roofAmt);
    if ((s >> 4) % 100 < L.roofChance * 100) {
      ctx.fillStyle = roofColor;
      if (roofPick === 0 && w >= 10) {
        // peaked
        const peakH = Math.min(6, Math.floor(w / 3));
        const cx = x + Math.floor(w / 2);
        for (let dy = 1; dy <= peakH; dy++) {
          const span = w - dy * 2;
          if (span <= 0) break;
          ctx.fillRect(cx - Math.floor(span / 2), top - dy, span, 1);
        }
        ctx.fillRect(x - 1, top, w + 2, 1);
      } else if (roofPick === 1) {
        // flat with cornice
        ctx.fillRect(x - 1, top - 1, w + 2, 2);
      } else {
        // hipped
        const peakH = 3;
        for (let dy = 1; dy <= peakH; dy++) {
          const span = w - dy * 2;
          if (span <= 0) break;
          ctx.fillRect(x + dy, top - dy, span, 1);
        }
        ctx.fillRect(x - 1, top, w + 2, 1);
      }
    }
    // Tiny window dots
    const winRows = Math.max(1, Math.floor(h / 7));
    const winCols = Math.max(1, Math.floor(w / 4));
    for (let wr = 0; wr < winRows; wr++) {
      for (let wc = 0; wc < winCols; wc++) {
        if ((wr * 7 + wc * 3 + (s >> 7)) % 3 !== 0) continue;
        const wx = x + 1 + wc * 4;
        const wy = top + 2 + wr * 7;
        if (wx + 1 >= x + w - 1) continue;
        if (wy + 1 >= L.baseY) continue;
        ctx.fillStyle = darken(wall, 0.3);
        ctx.fillRect(wx, wy, 1, 1);
      }
    }
    // Occasional tower (church spire) in middle/back layers
    if (r < L.towerChance && h > 18) {
      const tw = 4;
      const tx = x + Math.floor(w / 2) - 2;
      const tHeight = 12;
      ctx.fillStyle = desat(PALETTE.towerWall, L.desatAmt);
      ctx.fillRect(tx, top - tHeight, tw, tHeight);
      ctx.fillStyle = desat(PALETTE.towerRoof, L.roofAmt);
      ctx.fillRect(tx - 1, top - tHeight - 2, tw + 2, 2);
      ctx.fillRect(tx, top - tHeight - 4, tw, 2);
      ctx.fillStyle = "rgba(36,26,16,0.8)";
      ctx.fillRect(tx + 1, top - tHeight - 7, 2, 3);
    }
    x += w - 2;
  }
}

function totalEstab(m: Map<number, number>): number {
  let t = 0;
  for (const v of m.values()) t += v;
  return t;
}

function ensureBgCache(
  ref: React.MutableRefObject<HTMLCanvasElement | null>,
  sky: SkyPalette,
  tod: TimeOfDay
) {
  if (!ref.current) {
    ref.current = document.createElement("canvas");
    ref.current.width = PIXEL_W;
    ref.current.height = PIXEL_H;
  }
  const c = ref.current.getContext("2d");
  if (!c) return;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, PIXEL_W, PIXEL_H);
  // Sky gradient only (no twinkling stars - those overlay at runtime)
  const grad = c.createLinearGradient(0, 0, 0, ZONE.skyHeight);
  grad.addColorStop(0, sky.skyHigh);
  grad.addColorStop(1, sky.skyLow);
  c.fillStyle = grad;
  c.fillRect(0, 0, PIXEL_W, ZONE.skyHeight);
  // Sun / moon
  drawSun(c, sky);
  // Hills + fog + skyline
  drawHills(c, sky);
  drawAtmosphericFog(c, sky);
  drawDistantSkyline(c, sky);
  void tod;
}

function ensureBuildingsCache(
  ref: React.MutableRefObject<HTMLCanvasElement | null>,
  buildings: Building[],
  sky: SkyPalette,
  tod: TimeOfDay
) {
  if (!ref.current) {
    ref.current = document.createElement("canvas");
    ref.current.width = PIXEL_W;
    ref.current.height = PIXEL_H;
  }
  const c = ref.current.getContext("2d");
  if (!c) return;
  c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, PIXEL_W, PIXEL_H);
  // Set module globals so drawBuilding uses correct night tint / window glow
  const prevSky = currentSky;
  const prevTod = currentTod;
  currentSky = sky;
  currentTod = tod;
  const back = buildings.filter((b) => b.back);
  const front = buildings.filter((b) => !b.back);
  for (const b of back) drawBuilding(c, b, sky);
  for (const b of front) drawBuilding(c, b, sky);
  currentSky = prevSky;
  currentTod = prevTod;
}

function drawStarsOverlay(ctx: CanvasRenderingContext2D, frame: number, sky: SkyPalette) {
  if (sky.starsAlpha < 0.02) return;
  // Only above hill line (y < 85) so stars never paint on mountains.
  for (let i = 0; i < 60; i++) {
    const x = (i * 47) % PIXEL_W;
    const y = (i * 17) % 80;
    const tw = ((frame + i * 9) % 90) / 90;
    if (tw < 0.5) continue;
    ctx.fillStyle = `rgba(255,255,230,${sky.starsAlpha.toFixed(2)})`;
    ctx.fillRect(x, y, 1, 1);
  }
}

const zoomBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #ff00aa",
  color: "#ff00aa",
  width: 22,
  height: 22,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  padding: 0
};

function drawSky(ctx: CanvasRenderingContext2D, frame: number, sky: SkyPalette, _tod: TimeOfDay) {
  const grad = ctx.createLinearGradient(0, 0, 0, ZONE.skyHeight);
  grad.addColorStop(0, sky.skyHigh);
  grad.addColorStop(1, sky.skyLow);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, PIXEL_W, ZONE.skyHeight);

  if (sky.starsAlpha > 0.02) {
    for (let i = 0; i < 80; i++) {
      const x = (i * 47) % PIXEL_W;
      const y = (i * 17) % (ZONE.skyHeight - 30);
      const tw = ((frame + i * 9) % 90) / 90;
      const a = sky.starsAlpha * (tw > 0.5 ? 1 : 0.4);
      ctx.fillStyle = `rgba(255,255,230,${a.toFixed(2)})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }

  // Draw sun in sky
  drawSun(ctx, sky);
}

function drawSun(ctx: CanvasRenderingContext2D, sky: SkyPalette) {
  const cx = sky.sunX;
  const cy = sky.sunY;
  // Only render glow if visible above horizon
  if (cy < 140) {
    for (let r = 22; r > 14; r--) {
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = sky.sunGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = sky.sunColor;
    for (let yy = -12; yy <= 12; yy++) {
      const span = Math.floor(Math.sqrt(144 - yy * yy));
      ctx.fillRect(cx - span, cy + yy, span * 2, 1);
    }
  } else {
    // Moon: crescent w/ craters at upper sky
    const mx = sky.sunX;
    const my = 60;
    // Halo
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = "#dcdcff";
    ctx.beginPath();
    ctx.arc(mx, my, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Body
    ctx.fillStyle = "#f4f4ff";
    for (let yy = -9; yy <= 9; yy++) {
      const span = Math.floor(Math.sqrt(81 - yy * yy));
      ctx.fillRect(mx - span, my + yy, span * 2, 1);
    }
    // Shadow side (crescent effect)
    ctx.fillStyle = sky.skyHigh;
    for (let yy = -8; yy <= 8; yy++) {
      const span = Math.floor(Math.sqrt(64 - yy * yy));
      ctx.fillRect(mx - span - 3, my + yy, span * 2, 1);
    }
    // Craters
    ctx.fillStyle = "#c8c8e0";
    ctx.fillRect(mx + 2, my - 2, 2, 2);
    ctx.fillRect(mx + 4, my + 2, 1, 1);
    ctx.fillRect(mx - 1, my + 4, 2, 1);
  }
}

function drawClouds(ctx: CanvasRenderingContext2D, frame: number, sky: SkyPalette) {
  // Tint clouds darker at night
  const tint = sky.cloudTint;
  const t = frame * 0.15;
  const clouds = [
    { x: 30, y: 26, w: 50, puffs: 4 },
    { x: 180, y: 18, w: 38, puffs: 3 },
    { x: 310, y: 34, w: 60, puffs: 5 },
    { x: 470, y: 22, w: 44, puffs: 4 },
    { x: 580, y: 14, w: 30, puffs: 3 }
  ];
  for (const c of clouds) {
    const dx = ((c.x + t) % (PIXEL_W + 120)) - 60;
    cloudShape(ctx, dx, c.y, c.w, c.puffs, tint);
  }
}

function cloudShape(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  puffs: number,
  tint: number = 0
) {
  // Tint > 0 darkens cloud (night/sunset).
  const baseColor = tint > 0 ? mixColor("#ffffff", "#1a2040", tint) : "#ffffff";
  const shadowColor = tint > 0 ? mixColor("rgb(150,180,205)", "#0a1020", tint) : "rgb(150,180,205)";
  const baseY = y + 6;
  const puffW = Math.floor(w / puffs) + 4;
  // Shadow layer
  ctx.fillStyle = shadowColor;
  for (let i = 0; i < puffs; i++) {
    const px = x + Math.floor(i * (w / puffs));
    const r = 4 + (i % 2);
    fillEllipse(ctx, px + puffW / 2, baseY + 2, puffW / 2, r);
  }
  // Body
  ctx.fillStyle = baseColor;
  for (let i = 0; i < puffs; i++) {
    const px = x + Math.floor(i * (w / puffs));
    const r = 5 + ((i * 7) % 3);
    const cy = baseY - (i % 2) * 2;
    fillEllipse(ctx, px + puffW / 2, cy, puffW / 2, r);
  }
  // Highlight (skip when very dark)
  if (tint < 0.6) {
    ctx.fillStyle = baseColor;
    for (let i = 0; i < puffs; i++) {
      const px = x + Math.floor(i * (w / puffs));
      fillEllipse(ctx, px + puffW / 2, baseY - 4, puffW / 3, 2);
    }
  }
}

function fillEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number
) {
  // Pixel-grid ellipse via per-row spans.
  const rxi = Math.max(1, Math.floor(rx));
  const ryi = Math.max(1, Math.floor(ry));
  for (let dy = -ryi; dy <= ryi; dy++) {
    const k = Math.sqrt(1 - (dy * dy) / (ryi * ryi));
    const span = Math.floor(rxi * k);
    ctx.fillRect(Math.floor(cx) - span, Math.floor(cy) + dy, span * 2, 1);
  }
}

function drawHills(ctx: CanvasRenderingContext2D, sky: SkyPalette) {
  ctx.fillStyle = sky.hillFar;
  drawHillBand(ctx, 96, 18, 0.012, 0);
  ctx.fillStyle = sky.hillMid;
  drawHillBand(ctx, 112, 14, 0.018, 130);
}

function drawHillBand(
  ctx: CanvasRenderingContext2D,
  baseY: number,
  amp: number,
  freq: number,
  phase: number
) {
  ctx.beginPath();
  ctx.moveTo(0, ZONE.skyHeight + 20);
  for (let x = 0; x <= PIXEL_W; x += 2) {
    const y =
      baseY -
      Math.sin(x * freq + phase) * amp * 0.6 -
      Math.sin(x * freq * 2.7 + phase * 0.5) * amp * 0.3 -
      Math.sin(x * freq * 5.1 + phase) * amp * 0.1;
    ctx.lineTo(x, Math.round(y));
  }
  ctx.lineTo(PIXEL_W, ZONE.skyHeight + 20);
  ctx.closePath();
  ctx.fill();
}

function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, _sky?: SkyPalette) {
  const ambient = currentSky?.ambient ?? 1;
  const nightDarken = (1 - ambient) * 0.45;
  const rawWall = b.back ? desat(b.wallColor, 0.45) : b.wallColor;
  const wall = nightDarken > 0 ? darken(rawWall, nightDarken) : rawWall;
  ctx.fillStyle = wall;
  ctx.fillRect(b.x, b.topY, b.width, b.height);
  // Side shading
  ctx.fillStyle = darken(wall, 0.1);
  ctx.fillRect(b.x, b.topY, 1, b.height);
  ctx.fillStyle = lighten(wall, 0.07);
  ctx.fillRect(b.x + b.width - 1, b.topY, 1, b.height);

  // Stepped facade: random shallow setback near top for some buildings
  if (!b.back && b.height > 50 && (strHash(b.process) >> 8) % 3 === 0) {
    const setbackH = 8;
    const setbackInset = 4;
    ctx.fillStyle = darken(wall, 0.05);
    ctx.fillRect(b.x + setbackInset, b.topY, b.width - setbackInset * 2, setbackH);
  }

  drawRoof(ctx, b);

  if (b.isCathedralAnchor) drawCathedral(ctx, b);

  if (!b.back) {
    drawWindows(ctx, b);
    drawDoor(ctx, b);
    if (b.hasBalcony) drawBalcony(ctx, b);
    if (b.hasFlowers) drawFlowers(ctx, b);
    if (b.hasLaundry) drawLaundry(ctx, b);
  } else {
    drawWindowsBack(ctx, b);
  }
}

function drawBuildingNameVertical(ctx: CanvasRenderingContext2D, b: Building) {
  if (b.height < 36 || b.width < 22) return;
  // Truncate name to fit width
  const maxChars = Math.floor((b.width - 8) / (FONT_W + FONT_GAP));
  const name = b.process.slice(0, Math.min(12, maxChars));
  if (name.length === 0) return;
  const textW = pixelTextWidth(name);
  const tw = textW + 6;
  const ph = 9;
  const px = b.x + Math.floor((b.width - tw) / 2);
  const py = b.topY - 8;
  // Border
  ctx.fillStyle = "#241a10";
  ctx.fillRect(px - 1, py - 1, tw + 2, ph + 2);
  // Plaque
  ctx.fillStyle = "#e6c97a";
  ctx.fillRect(px, py, tw, ph);
  ctx.fillStyle = "#a37a2e";
  ctx.fillRect(px, py + ph - 1, tw, 1);
  ctx.fillStyle = "#fff0bc";
  ctx.fillRect(px, py, tw, 1);
  // Pixel text crisp at any scale
  drawPixelText(ctx, name, px + Math.floor((tw - textW) / 2), py + 2, "#241a10");
}

function drawRoof(ctx: CanvasRenderingContext2D, b: Building) {
  const eaveY = b.topY - 2;
  const wall = b.back ? desat(b.wallColor, 0.45) : b.wallColor;
  const roofColor = b.back ? desat(b.roofColor, 0.35) : b.roofColor;
  ctx.fillStyle = roofColor;
  ctx.fillRect(b.x - 1, eaveY, b.width + 2, 2);

  if (b.roof === "flat") {
    // Cornice line + roof terrace fence
    ctx.fillStyle = PALETTE.roofTrim;
    ctx.fillRect(b.x - 1, eaveY + 2, b.width + 2, 1);
    ctx.fillStyle = darken(wall, 0.18);
    ctx.fillRect(b.x + 1, eaveY - 2, b.width - 2, 2);
    // Tiny rooftop railing dots
    for (let i = 2; i < b.width - 2; i += 3) {
      ctx.fillRect(b.x + i, eaveY - 3, 1, 1);
    }
  } else if (b.roof === "peaked") {
    // Triangle peak from eave up
    const peakH = Math.min(10, Math.max(5, b.width / 6));
    const cx = b.x + Math.floor(b.width / 2);
    for (let dy = 1; dy <= peakH; dy++) {
      const span = b.width - dy * 2;
      if (span <= 0) break;
      ctx.fillStyle = roofColor;
      ctx.fillRect(cx - Math.floor(span / 2), eaveY - dy, span, 1);
    }
    ctx.fillStyle = PALETTE.roofTrim;
    ctx.fillRect(b.x - 1, eaveY + 2, b.width + 2, 1);
  } else {
    // Hipped: trapezoidal
    const peakH = 5;
    for (let dy = 1; dy <= peakH; dy++) {
      const inset = dy;
      const span = b.width - inset * 2;
      if (span <= 0) break;
      ctx.fillStyle = roofColor;
      ctx.fillRect(b.x + inset, eaveY - dy, span, 1);
    }
    ctx.fillStyle = PALETTE.roofTrim;
    ctx.fillRect(b.x - 1, eaveY + 2, b.width + 2, 1);
  }

  // Chimney
  if (!b.back && (strHash(b.process) >> 6) % 2 === 0) {
    const cx = b.x + Math.floor(b.width * 0.7);
    const cyTop = eaveY - 6;
    ctx.fillStyle = wall;
    ctx.fillRect(cx, cyTop, 3, 5);
    ctx.fillStyle = PALETTE.roofTrim;
    ctx.fillRect(cx, cyTop - 1, 3, 1);
  }
  // Scandinavian: dusting of snow on top of every roof
  if (currentTheme === "scandinavian" && !b.back) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(b.x - 1, eaveY - 1, b.width + 2, 1);
    if (b.roof === "peaked" && b.width >= 10) {
      const peakH = Math.min(6, Math.floor(b.width / 3));
      const cx = b.x + Math.floor(b.width / 2);
      for (let dy = 1; dy <= peakH; dy++) {
        const span = b.width - dy * 2;
        if (span <= 0) break;
        ctx.fillRect(cx - Math.floor(span / 2), eaveY - dy - 1, span, 1);
      }
    }
  }
  // Tokyo: neon vertical sign strip on building side
  if (currentTheme === "tokyo" && !b.back && b.height > 50) {
    const hash = strHash(b.process);
    const sx = b.x + b.width - 3;
    const colors = ["#ff00aa", "#00f5ff", "#ffde3c", "#39ff14"];
    const sc = colors[hash % colors.length];
    const segments = 4;
    const segH = Math.floor((b.height - 20) / segments);
    for (let s = 0; s < segments; s++) {
      ctx.fillStyle = sc;
      ctx.fillRect(sx, b.topY + 8 + s * segH, 2, segH - 2);
      // Bracket
      ctx.fillStyle = "#1a1a3c";
      ctx.fillRect(sx, b.topY + 8 + s * segH + segH - 3, 2, 1);
    }
  }
}

function drawKurdishFlag(ctx: CanvasRenderingContext2D, frame: number) {
  // Kurdish flag pole behind buildings
  drawPoleFlag(ctx, frame, 200, [
    { color: "#e25c66", h: 2 },
    { color: "#f0f0f0", h: 3 },
    { color: "#5fa371", h: 2 }
  ], "kurd");
  // Bulgarian flag pole, also behind buildings, different position
  drawPoleFlag(ctx, frame + 47, 380, [
    { color: "#f0f0f0", h: 2 },
    { color: "#5fa371", h: 3 },
    { color: "#e25c66", h: 2 }
  ], "bg");
}

function drawPoleFlag(
  ctx: CanvasRenderingContext2D,
  frame: number,
  px: number,
  stripes: { color: string; h: number }[],
  kind: "kurd" | "bg"
) {
  const baseY = ZONE.seawallTop - 2;
  const topY = baseY - 60;
  // Pole
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(px, topY, 1, baseY - topY);
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(px, topY - 1, 1, 1);
  // Flag
  const flap = Math.sin(frame * 0.1) * 0.5 + 0.5;
  const fw = 10 + Math.round(flap * 2);
  const fx = px + 1;
  let fy = topY;
  for (const stripe of stripes) {
    ctx.fillStyle = stripe.color;
    ctx.fillRect(fx, fy, fw, stripe.h);
    fy += stripe.h;
  }
  // Kurdish: sun in middle stripe
  if (kind === "kurd") {
    const sx = fx + Math.floor(fw / 2) - 1;
    const sy = topY + 3;
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(sx, sy - 1, 2, 1);
    ctx.fillRect(sx - 1, sy, 4, 1);
    ctx.fillRect(sx, sy + 1, 2, 1);
  }
}

function drawPortMaster(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number
) {
  const cathedral = front.find((b) => b.isCathedralAnchor);
  if (!cathedral) return;
  // Stop short of directly under cathedral so bouquet visibly arcs across.
  const pathX = cathedral.x + Math.floor(cathedral.width / 2) + 40;
  // Pick a building to enter (3rd front, not cathedral, not too far)
  const doorBldg = front.find((b) => !b.isCathedralAnchor) ?? front[0];
  const doorX = doorBldg.x + Math.floor(doorBldg.width / 2);
  const postX = 90; // his usual post (near lighthouse area)
  const y = ZONE.seawallTop;
  const now = performance.now();
  const t = now - portMaster.phaseStart;

  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  const advance = (next: MasterPhase) => {
    portMaster.phase = next;
    portMaster.phaseStart = now;
  };

  let x = postX;
  let bouquet = false;
  let fainted = false;
  let facingRight = true;
  let hidden = false;

  switch (portMaster.phase) {
    case "idle":
      x = postX;
      break;
    case "to_door": {
      const d = 2800;
      const f = Math.min(1, t / d);
      x = lerp(postX, doorX, f);
      facingRight = doorX > postX;
      if (f >= 1) advance("in_door");
      break;
    }
    case "in_door":
      x = doorX;
      hidden = true;
      if (t > 1400) advance("from_door");
      break;
    case "from_door":
      x = doorX;
      bouquet = true;
      facingRight = pathX > doorX;
      if (t > 600) advance("to_path");
      break;
    case "to_path": {
      const d = 2800;
      const f = Math.min(1, t / d);
      x = lerp(doorX, pathX, f);
      bouquet = true;
      facingRight = pathX > doorX;
      if (f >= 1) advance("throw");
      break;
    }
    case "throw": {
      x = pathX;
      bouquet = false; // released
      drawBouquetArc(ctx, pathX, y, cathedral, t);
      if (t > 1400) advance("kiss");
      break;
    }
    case "kiss":
      x = pathX;
      drawHeartFall(ctx, pathX, y, cathedral, t);
      if (t > 2200) advance("fainted");
      break;
    case "fainted":
      x = pathX;
      fainted = true;
      // Floating "♥" above fainted master
      if ((frame >> 3) % 2 === 0) {
        ctx.fillStyle = "#e25c66";
        ctx.fillRect(x - 1, y - 8, 1, 1);
        ctx.fillRect(x + 2, y - 8, 1, 1);
        ctx.fillRect(x, y - 9, 3, 1);
        ctx.fillRect(x, y - 7, 1, 1);
        ctx.fillRect(x + 2, y - 7, 1, 1);
        ctx.fillRect(x + 1, y - 6, 1, 1);
      }
      if (t > 2200) advance("rising");
      break;
    case "rising":
      x = pathX;
      // partial stand
      fainted = t < 400;
      if (t > 900) advance("returning");
      break;
    case "returning": {
      const d = 3600;
      const f = Math.min(1, t / d);
      x = lerp(pathX, postX, f);
      facingRight = postX > pathX;
      if (f >= 1) advance("idle");
      break;
    }
  }

  if (!hidden) drawMasterSprite(ctx, Math.floor(x), y, frame, bouquet, fainted, facingRight);
}

function drawMasterSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
  bouquet: boolean,
  fainted: boolean,
  facingRight: boolean
) {
  if (fainted) {
    // Lying down (horizontal)
    ctx.fillStyle = "#1a3a78"; // coat
    ctx.fillRect(x - 2, y - 1, 5, 1);
    ctx.fillStyle = "#e2b692"; // skin (head)
    ctx.fillRect(facingRight ? x + 3 : x - 3, y - 1, 1, 1);
    // Hat fell off
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(x - 1, y, 2, 1);
    // Stars (dazed)
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(x, y - 4, 1, 1);
    ctx.fillRect(x + 2, y - 5, 1, 1);
    return;
  }
  const bob = Math.floor(frame / 5) % 2;
  // Legs
  ctx.fillStyle = "#241a10";
  if (bob === 0) {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  } else {
    ctx.fillRect(x, y - 1, 1, 1);
    ctx.fillRect(x + 1, y, 1, 1);
  }
  // Coat (navy blue, gold-trimmed = master uniform)
  ctx.fillStyle = "#1a3a78";
  ctx.fillRect(x, y - 5 - bob, 2, 3);
  // Gold trim
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(x, y - 4 - bob, 1, 1);
  ctx.fillRect(x + 1, y - 3 - bob, 1, 1);
  // Head
  ctx.fillStyle = "#e2b692";
  ctx.fillRect(x, y - 7 - bob, 2, 2);
  // Captain's hat (bicorne style)
  ctx.fillStyle = "#1a1a3c";
  ctx.fillRect(x - 1, y - 8 - bob, 4, 1);
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(x, y - 9 - bob, 2, 1);
  // Bouquet held forward
  if (bouquet) {
    const bx = facingRight ? x + 2 : x - 2;
    ctx.fillStyle = "#5fa371";
    ctx.fillRect(bx, y - 4 - bob, 1, 2);
    // Flowers
    ctx.fillStyle = "#e25c66";
    ctx.fillRect(bx - 1, y - 6 - bob, 1, 1);
    ctx.fillRect(bx + 1, y - 6 - bob, 1, 1);
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(bx, y - 7 - bob, 1, 1);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(bx + 1, y - 5 - bob, 1, 1);
  }
}

function drawBouquetArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cathedral: Building,
  t: number
) {
  const targetX = cathedral.x + Math.floor(cathedral.width / 2);
  const targetY = cathedral.topY - 4 - 40 + 25;
  const T = 1400;
  const k = Math.min(1, t / T);
  const arcX = x + (targetX - x) * k;
  const arcY = (y - 7) + (targetY - (y - 7)) * k - Math.sin(k * Math.PI) * 16;
  // Spinning bouquet: rotate flower colors via phase
  const spin = Math.floor(t / 60) % 4;
  const ax = Math.floor(arcX);
  const ay = Math.floor(arcY);
  ctx.fillStyle = "#5fa371";
  ctx.fillRect(ax, ay, 1, 2);
  const colors = ["#e25c66", "#ffde3c", "#ffffff", "#b464ff"];
  // Petals positioned by spin phase
  const positions = [
    [-1, -2], [1, -2], [0, -3], [-1, -1], [1, -1], [0, -4]
  ];
  for (let i = 0; i < positions.length; i++) {
    const [dx, dy] = positions[(i + spin) % positions.length];
    ctx.fillStyle = colors[(i + spin) % colors.length];
    ctx.fillRect(ax + dx, ay + dy, 1, 1);
  }
}

function drawHeartFall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cathedral: Building,
  t: number
) {
  const startX = cathedral.x + Math.floor(cathedral.width / 2);
  const startY = cathedral.topY - 4 - 40 + 28;
  const T = 2200;
  const k = Math.min(1, t / T);
  const easeK = k * k;
  const hx = startX + (x - startX) * easeK;
  const hy = startY + (y - 8 - startY) * easeK + Math.sin(k * Math.PI * 2) * 2;
  // Pixel heart
  ctx.fillStyle = "#e25c66";
  ctx.fillRect(Math.floor(hx) - 1, Math.floor(hy), 1, 1);
  ctx.fillRect(Math.floor(hx) + 1, Math.floor(hy), 1, 1);
  ctx.fillRect(Math.floor(hx), Math.floor(hy) + 1, 3, 1);
  ctx.fillRect(Math.floor(hx) + 1, Math.floor(hy) + 2, 1, 1);
  // Sparkle trail
  if (k < 0.9) {
    ctx.fillStyle = "rgba(255,222,60,0.6)";
    ctx.fillRect(Math.floor(hx) + 2, Math.floor(hy) - 1, 1, 1);
  }
}

function drawLighthouse(
  ctx: CanvasRenderingContext2D,
  frame: number,
  tod: TimeOfDay
) {
  // Lighthouse on a small rocky island in the water, far left of harbour.
  const cx = 30;
  const waterLine = ZONE.waterTop + 4;
  // Rocky island base (dark grey pile)
  ctx.fillStyle = "#3a3030";
  ctx.fillRect(cx - 10, waterLine, 20, 3);
  ctx.fillRect(cx - 8, waterLine - 2, 16, 2);
  ctx.fillRect(cx - 6, waterLine - 4, 12, 2);
  ctx.fillStyle = "#5a4a4a";
  ctx.fillRect(cx - 6, waterLine - 4, 12, 1);
  ctx.fillRect(cx - 8, waterLine - 2, 16, 1);
  // Rock details
  ctx.fillStyle = "#1a1414";
  ctx.fillRect(cx - 9, waterLine + 1, 2, 1);
  ctx.fillRect(cx + 5, waterLine + 1, 3, 1);
  // Water lapping at rock base
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = -10; i <= 10; i += 2) {
    if ((i + Math.floor(frame / 6)) % 4 === 0) ctx.fillRect(cx + i, waterLine + 2, 1, 1);
  }
  // Lighthouse tower on top of rocks
  const baseY = waterLine - 4;
  const towerH = 32;
  const topY = baseY - towerH;
  const tx = cx - 3;
  // Stone foundation
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(tx - 1, baseY - 2, 8, 2);
  // Tower red/white stripes
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(tx, topY, 6, towerH);
  ctx.fillStyle = "#c44";
  ctx.fillRect(tx, topY + 8, 6, 5);
  ctx.fillRect(tx, topY + 20, 6, 5);
  // Top cap (gallery)
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(tx - 1, topY - 2, 8, 2);
  // Light room (lantern house)
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(tx + 1, topY - 5, 4, 3);
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(tx, topY - 6, 6, 1);
  // Dome roof
  ctx.fillStyle = "#c44";
  ctx.fillRect(tx + 1, topY - 8, 4, 2);
  ctx.fillRect(tx + 2, topY - 10, 2, 2);
  // Lightning rod
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(tx + 2, topY - 12, 1, 2);
  // Beam: sweep only upper hemisphere so it never shines into ground/water.
  const sweep = Math.sin(frame * 0.024);
  const ang = -Math.PI / 2 + sweep * 1.05;
  const beamLen = 90;
  const beamAlpha =
    tod === "night" || tod === "dusk" || tod === "dawn" ? 0.6 : 0.18;
  ctx.save();
  ctx.translate(tx + 3, topY - 3);
  ctx.rotate(ang);
  const grad = ctx.createLinearGradient(0, 0, beamLen, 0);
  grad.addColorStop(0, `rgba(255,239,200,${beamAlpha.toFixed(2)})`);
  grad.addColorStop(1, "rgba(255,239,200,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(beamLen, -7);
  ctx.lineTo(beamLen, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Bright glow at lantern
  ctx.fillStyle = `rgba(255,255,200,${beamAlpha.toFixed(2)})`;
  ctx.fillRect(tx + 2, topY - 4, 2, 1);
  // Lighthouse keeper at base on rocks, waving slowly
  const wave = Math.floor(frame / 24) % 2;
  const kx = cx + 6;
  const ky = baseY - 2;
  // Body
  ctx.fillStyle = "#1a3a78";
  ctx.fillRect(kx, ky - 3, 2, 3);
  // Head
  ctx.fillStyle = "#e2b692";
  ctx.fillRect(kx, ky - 5, 2, 2);
  // Cap (yellow rain hat)
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(kx - 1, ky - 6, 4, 1);
  // Legs
  ctx.fillStyle = "#241a10";
  ctx.fillRect(kx, ky, 1, 1);
  ctx.fillRect(kx + 1, ky, 1, 1);
  // Waving arm
  if (wave === 0) {
    ctx.fillStyle = "#e2b692";
    ctx.fillRect(kx + 2, ky - 4, 1, 1);
    ctx.fillRect(kx + 3, ky - 5, 1, 1);
  } else {
    ctx.fillStyle = "#e2b692";
    ctx.fillRect(kx + 2, ky - 3, 1, 1);
  }
  // Pirate parrot on shoulder (sometimes)
  if (new Date().getDate() % 5 === 0) {
    ctx.fillStyle = "#39ff14";
    ctx.fillRect(kx - 1, ky - 7, 1, 2);
    ctx.fillStyle = "#ff4060";
    ctx.fillRect(kx - 1, ky - 6, 1, 1);
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(kx - 2, ky - 6, 1, 1);
    scenicHits.push({
      key: "parrot",
      x: kx - 3,
      y: ky - 8,
      w: 4,
      h: 4,
      label: "Parrot",
      lines: ["the keeper's parrot", "squawks at gulls"]
    });
  }
  scenicHits.push({
    key: "keeper",
    x: kx - 2,
    y: ky - 7,
    w: 7,
    h: 9,
    label: "Lighthouse keeper",
    lines: ["faithful keeper of the lamp", "waves to passing ships"]
  });
  scenicHits.push({
    key: "lighthouse",
    x: cx - 5,
    y: topY - 12,
    w: 12,
    h: towerH + 14,
    label: "Lighthouse",
    lines: ["beacon on rocky isle", "beam sweeps the harbour"]
  });
}

function drawMailman(ctx: CanvasRenderingContext2D, frame: number) {
  // Mailman walking the seawall, blue suit + sack
  const span = PIXEL_W - 100;
  const phase = (frame * 0.12) % (span * 2);
  const dx = phase < span ? phase : span * 2 - phase;
  const x = 50 + Math.floor(dx);
  const y = ZONE.seawallTop;
  const bob = Math.floor(frame / 6) % 2;
  // Body (navy blue uniform)
  ctx.fillStyle = "#1a3a78";
  ctx.fillRect(x, y - 5 - bob, 2, 3);
  // Head + cap
  ctx.fillStyle = "#e2b692";
  ctx.fillRect(x, y - 7 - bob, 2, 2);
  ctx.fillStyle = "#1a3a78";
  ctx.fillRect(x - 1, y - 8 - bob, 4, 1);
  // Legs
  ctx.fillStyle = "#241a10";
  if (bob === 0) {
    ctx.fillRect(x, y - 1, 1, 1);
    ctx.fillRect(x + 1, y, 1, 1);
  } else {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 1);
  }
  // Mail sack
  ctx.fillStyle = "#8a5a2c";
  ctx.fillRect(x + 2, y - 4 - bob, 3, 3);
  ctx.fillStyle = "#fffbe6";
  ctx.fillRect(x + 3, y - 3 - bob, 1, 1);
  scenicHits.push({
    key: "mailman",
    x: x - 2,
    y: y - 9,
    w: 8,
    h: 10,
    label: "Mailman",
    lines: ["delivering mail", "to every dock"]
  });
}

function drawSeaSerpent(ctx: CanvasRenderingContext2D, frame: number) {
  // Rare sea serpent: humps surface every ~30s for ~2s
  const cycle = 1800;
  const phase = frame % cycle;
  if (phase > 120) return;
  const seed = Math.floor(frame / cycle);
  if (seed % 3 !== 0) return;
  const baseX = 220 + (seed * 53) % 200;
  const baseY = ZONE.waterTop + 60;
  ctx.fillStyle = "#2a4a3a";
  // 3 humps
  for (let i = 0; i < 3; i++) {
    const hx = baseX + i * 14;
    const hy = baseY - Math.sin(phase * 0.06 + i) * 2;
    for (let dx = 0; dx < 8; dx++) {
      const h = Math.floor(Math.sin((dx / 8) * Math.PI) * 4);
      ctx.fillRect(hx + dx, hy - h, 1, h + 1);
    }
  }
  // Head (rears up at start)
  if (phase < 60) {
    const headT = phase / 60;
    const hx = baseX - 6;
    const hy = baseY - 8 - headT * 6;
    ctx.fillStyle = "#2a4a3a";
    ctx.fillRect(hx, hy, 5, 3);
    ctx.fillRect(hx + 1, hy - 1, 3, 1);
    // Eye
    ctx.fillStyle = "#ff4060";
    ctx.fillRect(hx + 1, hy + 1, 1, 1);
  }
  scenicHits.push({
    key: "serpent",
    x: baseX - 8,
    y: baseY - 12,
    w: 50,
    h: 16,
    label: "Sea serpent",
    lines: ["ancient leviathan", "rises from deep"]
  });
}

function drawConstructionCranes(ctx: CanvasRenderingContext2D, front: Building[]) {
  const now = performance.now();
  const DURATION = 8000;
  for (let i = constructionEffects.length - 1; i >= 0; i--) {
    if (now - constructionEffects[i].startT > DURATION) constructionEffects.splice(i, 1);
  }
  for (const eff of constructionEffects) {
    const b = front.find((bb) => bb.process === eff.proc);
    if (!b) continue;
    const t = (now - eff.startT) / DURATION;
    const fade = t > 0.85 ? (1 - (t - 0.85) / 0.15) : 1;
    const cx = b.x + Math.floor(b.width / 2);
    // Crane sits at seawall edge, towering up into sky
    const baseY = ZONE.seawallTop;
    const mastH = 36;
    const armSwing = Math.sin(t * Math.PI * 4) * 6;
    // Base footing
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(cx - 2, baseY - 2, 5, 2);
    // Mast (vertical, lattice pattern)
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(cx, baseY - mastH, 1, mastH);
    ctx.fillRect(cx + 2, baseY - mastH, 1, mastH);
    // Lattice X bars every 4px
    ctx.fillStyle = "#a37a2e";
    for (let y = baseY - mastH + 4; y < baseY - 2; y += 4) {
      ctx.fillRect(cx, y, 3, 1);
    }
    // Counterweight at top
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(cx - 1, baseY - mastH, 5, 2);
    // Operator cab
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(cx - 2, baseY - mastH + 2, 7, 3);
    ctx.fillStyle = PALETTE.window;
    ctx.fillRect(cx, baseY - mastH + 3, 2, 1);
    // Arm
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(cx + 2 + Math.round(armSwing), baseY - mastH + 6, 16, 1);
    ctx.fillRect(cx + 2 + Math.round(armSwing), baseY - mastH + 7, 16, 1);
    // Hook line + hook
    ctx.fillStyle = "#241a10";
    const hookX = cx + Math.round(armSwing) + 14;
    const hookDrop = 10 + Math.floor((t * 60) % 10);
    ctx.fillRect(hookX, baseY - mastH + 8, 1, hookDrop);
    ctx.fillRect(hookX - 1, baseY - mastH + 8 + hookDrop, 3, 1);
    // Flash label
    if (fade > 0.4) {
      ctx.font = "5px monospace";
      ctx.fillStyle = `rgba(255,222,60,${fade.toFixed(2)})`;
      ctx.textBaseline = "top";
      ctx.fillText("NEW", cx - 8, baseY - mastH - 8);
    }
  }
}

function registerBuildingHits(front: Building[], estab: Map<number, number>) {
  for (const b of front) {
    const traffic = b.ports.reduce(
      (acc, p) => acc + (estab.get(p.port) ?? 0),
      0
    );
    scenicHits.push({
      key: `bldg:${b.process}`,
      x: b.x,
      y: b.topY,
      w: b.width,
      h: b.height,
      label: b.process,
      lines: [
        b.process,
        `${b.ports.length} listening port${b.ports.length === 1 ? "" : "s"}`,
        traffic > 0 ? `${traffic} active conn${traffic === 1 ? "" : "s"}` : "no active conns",
        `ports: ${b.ports.slice(0, 4).map((p) => p.port).join(" ")}${b.ports.length > 4 ? " …" : ""}`
      ]
    });
  }
}

function registerMikaelaHit(front: Building[]) {
  for (const b of front) {
    if (!b.isCathedralAnchor) continue;
    const tx = b.x + Math.floor(b.width / 2) - 6;
    const towerBottom = b.topY - 4;
    const towerH = 40;
    const towerTop = towerBottom - towerH;
    scenicHits.push({
      key: "princess",
      x: tx + 1,
      y: towerTop + 24,
      w: 10,
      h: 8,
      label: "Mikaela",
      lines: ["princess Mikaela", "of the tower", "waving hello"]
    });
    return;
  }
}

function drawCathedral(ctx: CanvasRenderingContext2D, b: Building) {
  // Big bell tower rising from this building's roof.
  const tx = b.x + Math.floor(b.width / 2) - 6;
  const towerBottom = b.topY - 4;
  const towerH = 40;
  const towerTop = towerBottom - towerH;
  // Body
  ctx.fillStyle = PALETTE.towerWall;
  ctx.fillRect(tx, towerTop, 12, towerH);
  ctx.fillStyle = darken(PALETTE.towerWall, 0.08);
  ctx.fillRect(tx, towerTop, 1, towerH);
  ctx.fillStyle = lighten(PALETTE.towerWall, 0.06);
  ctx.fillRect(tx + 11, towerTop, 1, towerH);
  // Belfry arches
  ctx.fillStyle = PALETTE.window;
  ctx.fillRect(tx + 2, towerTop + 6, 3, 6);
  ctx.fillRect(tx + 7, towerTop + 6, 3, 6);
  ctx.fillRect(tx + 3, towerTop + 5, 1, 1);
  ctx.fillRect(tx + 8, towerTop + 5, 1, 1);
  // Bell visible swinging in first 30s of hour
  const nowDate = new Date();
  if (nowDate.getMinutes() === 0 && nowDate.getSeconds() < 30) {
    const swing = Math.sin(performance.now() * 0.012) * 1.5;
    ctx.fillStyle = "#a08038";
    ctx.fillRect(tx + 3 + Math.round(swing), towerTop + 7, 2, 3);
    ctx.fillRect(tx + 8 + Math.round(swing * -1), towerTop + 7, 2, 3);
  } else {
    ctx.fillStyle = "#a08038";
    ctx.fillRect(tx + 3, towerTop + 8, 2, 2);
    ctx.fillRect(tx + 8, towerTop + 8, 2, 2);
  }
  // Clock face — hands point at real current time.
  ctx.fillStyle = "#fdf6e3";
  ctx.fillRect(tx + 3, towerTop + 16, 6, 6);
  const now = new Date();
  const hour = now.getHours() % 12;
  const minute = now.getMinutes();
  const hourAng = ((hour + minute / 60) / 12) * Math.PI * 2 - Math.PI / 2;
  const minAng = (minute / 60) * Math.PI * 2 - Math.PI / 2;
  const ccx = tx + 6;
  const ccy = towerTop + 19;
  ctx.fillStyle = "#241a10";
  // Hour hand (short)
  for (let r = 0; r <= 2; r++) {
    ctx.fillRect(
      Math.round(ccx + Math.cos(hourAng) * r),
      Math.round(ccy + Math.sin(hourAng) * r),
      1,
      1
    );
  }
  // Minute hand (long)
  for (let r = 0; r <= 3; r++) {
    ctx.fillRect(
      Math.round(ccx + Math.cos(minAng) * r),
      Math.round(ccy + Math.sin(minAng) * r),
      1,
      1
    );
  }
  // Center dot
  ctx.fillRect(ccx, ccy, 1, 1);
  // Slim window above clock (Mikaela's window)
  ctx.fillStyle = PALETTE.window;
  ctx.fillRect(tx + 4, towerTop + 25, 4, 6);
  // Princess sprite inside window, waving
  drawPrincess(ctx, tx + 4, towerTop + 25);
  // Stained glass rose window at bottom of tower
  const sgx = tx + 1;
  const sgy = towerTop + towerH - 8;
  // Outer dark frame
  ctx.fillStyle = "#241a10";
  ctx.fillRect(sgx, sgy, 10, 6);
  // Colored petals (radial layout)
  const sg: [number, number, string][] = [
    [4, 0, "#ff4060"],
    [5, 0, "#ff4060"],
    [3, 1, "#ffde3c"],
    [4, 1, "#ffde3c"],
    [5, 1, "#ffde3c"],
    [6, 1, "#ffde3c"],
    [2, 2, "#39ff14"],
    [3, 2, "#39ff14"],
    [4, 2, "#ffffff"],
    [5, 2, "#ffffff"],
    [6, 2, "#39ff14"],
    [7, 2, "#39ff14"],
    [2, 3, "#00f5ff"],
    [3, 3, "#00f5ff"],
    [4, 3, "#b464ff"],
    [5, 3, "#b464ff"],
    [6, 3, "#00f5ff"],
    [7, 3, "#00f5ff"],
    [3, 4, "#ff8c28"],
    [4, 4, "#ff8c28"],
    [5, 4, "#ff8c28"],
    [6, 4, "#ff8c28"],
    [4, 5, "#a64a36"],
    [5, 5, "#a64a36"]
  ];
  for (const [dx, dy, c] of sg) {
    ctx.fillStyle = c;
    ctx.fillRect(sgx + dx, sgy + dy, 1, 1);
  }
  // Cornice
  ctx.fillStyle = PALETTE.towerRoof;
  ctx.fillRect(tx - 2, towerTop - 2, 16, 2);
  // Dome
  for (let dy = 1; dy <= 6; dy++) {
    const span = 14 - dy * 2;
    ctx.fillStyle = PALETTE.towerRoof;
    ctx.fillRect(tx - 1 + dy, towerTop - 2 - dy, span, 1);
  }
  // Cross / spire
  ctx.fillStyle = "#241a10";
  ctx.fillRect(tx + 5, towerTop - 13, 2, 4);
  ctx.fillRect(tx + 4, towerTop - 12, 4, 1);
}

function drawPrincess(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Mikaela: long dark-brown wavy hair, brown eyes, brown blazer.
  const t = Math.floor(performance.now() / 320) % 4;
  // Long hair top + sides (flowing)
  ctx.fillStyle = "#2a1810";
  ctx.fillRect(x, y, 4, 1);
  ctx.fillRect(x - 1, y + 1, 1, 4);
  ctx.fillRect(x, y + 1, 1, 5);
  ctx.fillRect(x + 3, y + 1, 1, 5);
  ctx.fillRect(x + 4, y + 1, 1, 4);
  // Hair highlights (darker brown wave)
  ctx.fillStyle = "#3a2218";
  ctx.fillRect(x, y + 3, 1, 2);
  ctx.fillRect(x + 3, y + 3, 1, 2);
  // Tiara (still a princess)
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(x + 1, y - 1, 2, 1);
  ctx.fillRect(x + 1, y - 2, 1, 1);
  // Face
  ctx.fillStyle = "#e6c4a8";
  ctx.fillRect(x + 1, y + 1, 2, 2);
  // Brown eyes
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(x + 1, y + 2, 1, 1);
  ctx.fillRect(x + 2, y + 2, 1, 1);
  // Smile
  ctx.fillStyle = "#7a3a2c";
  ctx.fillRect(x + 1, y + 3, 2, 1);
  // Brown blazer
  ctx.fillStyle = "#5a3a28";
  ctx.fillRect(x, y + 4, 4, 2);
  // Lapel hint
  ctx.fillStyle = "#3a2218";
  ctx.fillRect(x + 1, y + 4, 1, 2);
  ctx.fillRect(x + 2, y + 4, 1, 2);
  // Waving hand
  ctx.fillStyle = "#e6c4a8";
  if (t < 2) {
    ctx.fillRect(x + 5, y + 1, 1, 1);
  } else {
    ctx.fillRect(x + 5, y + 2, 1, 1);
  }
}

function drawWindowsBack(ctx: CanvasRenderingContext2D, b: Building) {
  // Simpler dimmer windows for background row
  const rows = b.windowRows - 1;
  if (rows < 1) return;
  const cellH = (b.height - 14) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < b.windowCols; c++) {
      const wx = Math.floor(b.x + 3 + c * ((b.width - 6) / b.windowCols));
      const wy = Math.floor(b.topY + 4 + r * cellH);
      ctx.fillStyle = darken(PALETTE.window, 0.2);
      ctx.fillRect(wx, wy, 3, 3);
    }
  }
}

function drawBalcony(ctx: CanvasRenderingContext2D, b: Building) {
  // Anchor balcony floor JUST BELOW one of the window rows, varied per building.
  const rows = Math.max(2, b.windowRows - 1);
  const hash = strHash(b.process);
  const floor = 1 + (hash % Math.max(1, rows - 1));
  const cellH = (b.height - 14) / rows;
  const winY = Math.floor(b.topY + 4 + floor * cellH);
  const by = winY + 5; // just under window
  const inset = Math.max(3, Math.floor(b.width * 0.1));
  const startX = b.x + inset;
  const endX = b.x + b.width - inset - 1;
  if (endX <= startX) return;
  const w = endX - startX;
  // Floor slab
  ctx.fillStyle = PALETTE.palazzoBalc;
  ctx.fillRect(startX, by, w, 2);
  // Cap stones at edges so balcony reads as bounded to this building
  ctx.fillStyle = darken(PALETTE.palazzoBalc, 0.3);
  ctx.fillRect(startX, by, 1, 2);
  ctx.fillRect(endX - 1, by, 1, 2);
  // Railing posts (every 2 px)
  for (let x = startX + 1; x < endX; x += 2) {
    ctx.fillRect(x, by - 3, 1, 3);
  }
  // Flower pot at one end (alternates side by hash)
  const potRight = (hash >> 8) % 2 === 0;
  const potX = potRight ? endX - 4 : startX + 1;
  ctx.fillStyle = PALETTE.flowerLeaf;
  ctx.fillRect(potX, by - 5, 2, 1);
  ctx.fillStyle = PALETTE.flower;
  ctx.fillRect(potX, by - 6, 2, 1);
}

function drawWindows(ctx: CanvasRenderingContext2D, b: Building) {
  const cols = b.windowCols;
  const rows = b.windowRows - 1; // leave ground floor for door
  if (rows < 1) return;
  const padX = 3;
  const padY = 4;
  const innerW = b.width - padX * 2;
  const innerH = b.height - padY - 18;
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = Math.floor(b.x + padX + c * cellW + cellW / 2 - 2);
      const wy = Math.floor(b.topY + padY + r * cellH + cellH / 2 - 3);
      // Frame
      ctx.fillStyle = PALETTE.window;
      ctx.fillRect(wx, wy, 4, 5);
      // Lit window: probability scales with night (windowGlowChance).
      const glowChance = currentSky?.windowGlowChance ?? 0.2;
      const slot = (strHash(b.process) + r * 13 + c * 7) % 100;
      const lit = slot < Math.floor(glowChance * 100);
      if (lit) {
        ctx.fillStyle = PALETTE.windowGlow;
        ctx.fillRect(wx + 1, wy + 1, 2, 3);
      }
      if (b.hasShutters) {
        const sc = (strHash(b.process) >> 2) % 2 === 0
          ? PALETTE.windowShutter
          : PALETTE.windowShutterRed;
        ctx.fillStyle = sc;
        ctx.fillRect(wx - 1, wy, 1, 5);
        ctx.fillRect(wx + 4, wy, 1, 5);
      }
    }
  }
}

function drawDoor(ctx: CanvasRenderingContext2D, b: Building) {
  const dx = b.x + Math.floor(b.width / 2) - 2;
  const dy = b.baseY - 8;
  ctx.fillStyle = PALETTE.doorDark;
  ctx.fillRect(dx, dy, 4, 8);
  // Arch top
  ctx.fillRect(dx + 1, dy - 1, 2, 1);
}

function drawFlowers(ctx: CanvasRenderingContext2D, b: Building) {
  // Window boxes: pick one window row, attach planter beneath each window
  const cols = b.windowCols;
  const rows = b.windowRows - 1;
  if (rows < 1) return;
  const padX = 3;
  const padY = 4;
  const innerW = b.width - padX * 2;
  const innerH = b.height - padY - 18;
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const hash = strHash(b.process);
  const boxRow = 1 + (hash % Math.max(1, rows - 1));
  for (let c = 0; c < cols; c++) {
    const wx = Math.floor(b.x + padX + c * cellW + cellW / 2 - 2);
    const wy = Math.floor(b.topY + padY + boxRow * cellH + cellH / 2 - 3) + 5;
    if (wx + 3 > b.x + b.width - 2) continue;
    // Planter
    ctx.fillStyle = PALETTE.flowerLeaf;
    ctx.fillRect(wx, wy, 4, 1);
    // Flower buds
    ctx.fillStyle = PALETTE.flower;
    ctx.fillRect(wx, wy - 1, 1, 1);
    ctx.fillRect(wx + 2, wy - 1, 1, 1);
    ctx.fillStyle = PALETTE.flowerLeaf;
    ctx.fillRect(wx + 1, wy - 1, 1, 1);
    ctx.fillRect(wx + 3, wy - 1, 1, 1);
  }
}

function drawLaundry(ctx: CanvasRenderingContext2D, b: Building) {
  if (b.height < 30 || b.width < 24) return;
  // Hang laundry on a horizontal rope between row of windows
  const rows = b.windowRows - 1;
  if (rows < 2) return;
  const hash = strHash(b.process);
  const cellH = (b.height - 14 - 4) / rows;
  const ropeRow = 1 + (hash % Math.max(1, rows - 1));
  const ly = Math.floor(b.topY + 4 + ropeRow * cellH) - 3;
  const startX = b.x + 3;
  const endX = b.x + b.width - 3;
  // Rope
  ctx.fillStyle = "rgba(36,26,16,0.6)";
  ctx.fillRect(startX, ly, endX - startX, 1);
  // Hanging items spaced
  const colors = PALETTE.laundry;
  const itemCount = Math.max(2, Math.floor((endX - startX) / 6));
  for (let i = 0; i < itemCount; i++) {
    const lx = startX + 2 + Math.floor(i * ((endX - startX - 2) / Math.max(1, itemCount - 1)));
    if (lx + 2 > endX) break;
    ctx.fillStyle = colors[(hash + i) % colors.length];
    ctx.fillRect(lx, ly + 1, 2, 3);
    // Clothes-peg dot on rope
    ctx.fillStyle = "#241a10";
    ctx.fillRect(lx, ly, 1, 1);
  }
}

function drawPalazzo(
  ctx: CanvasRenderingContext2D,
  running: DockerContainer[],
  stopped: DockerContainer[],
  frame: number,
  _sky?: SkyPalette
) {
  const px = PIXEL_W - 92;
  const py = 130;
  const pw = 86;
  const ph = ZONE.seawallTop - py;
  // Body
  ctx.fillStyle = PALETTE.palazzoWall;
  ctx.fillRect(px, py, pw, ph);
  // Roof
  ctx.fillStyle = PALETTE.palazzoRoof;
  ctx.fillRect(px - 2, py - 4, pw + 4, 4);
  // Chimney
  ctx.fillStyle = PALETTE.palazzoWall;
  ctx.fillRect(px + pw - 14, py - 12, 8, 8);
  ctx.fillStyle = PALETTE.palazzoRoof;
  ctx.fillRect(px + pw - 14, py - 13, 8, 1);
  // Windows (grid) — each lit window = 1 running container, hoverable
  const cols = 5;
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = px + 6 + c * 16;
      const wy = py + 6 + r * 18;
      ctx.fillStyle = PALETTE.palazzoTrim;
      ctx.fillRect(wx - 1, wy - 1, 8, 12);
      ctx.fillStyle = PALETTE.window;
      ctx.fillRect(wx, wy, 6, 10);
      const idx = r * cols + c;
      if (idx < running.length) {
        ctx.fillStyle = PALETTE.windowGlow;
        ctx.fillRect(wx + 1, wy + 1, 4, 8);
        const container = running[idx];
        scenicHits.push({
          key: `cont:${container.id}`,
          x: wx - 2,
          y: wy - 1,
          w: 9,
          h: 12,
          label: container.name,
          lines: [
            container.name || container.id,
            container.image,
            container.status,
            container.ports.length > 0
              ? container.ports
                  .slice(0, 2)
                  .map((p) => `${p.host_port ?? "·"}→${p.container_port}/${p.proto}`)
                  .join(" ")
              : "no exposed ports"
          ]
        });
      }
      ctx.fillStyle = PALETTE.windowShutter;
      ctx.fillRect(wx - 2, wy - 1, 1, 12);
      ctx.fillRect(wx + 6, wy - 1, 1, 12);
    }
  }
  // Balcony
  ctx.fillStyle = PALETTE.palazzoBalc;
  ctx.fillRect(px, py + ph - 10, pw, 2);
  for (let i = 0; i < pw; i += 3) {
    ctx.fillStyle = PALETTE.palazzoBalc;
    ctx.fillRect(px + i, py + ph - 8, 1, 6);
  }
  // Stone plaque sign above main entrance (pixel font for crisp scaling)
  const plaqueText = `DOCKER ${running.length}/${running.length + stopped.length}`;
  const dtw = pixelTextWidth(plaqueText);
  const ptw = dtw + 8;
  const px0 = px + Math.floor((pw - ptw) / 2);
  const py0 = py + 2;
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(px0 - 1, py0 - 1, ptw + 2, 9);
  ctx.fillStyle = "#e6c97a";
  ctx.fillRect(px0, py0, ptw, 7);
  ctx.fillStyle = "#a37a2e";
  ctx.fillRect(px0, py0 + 6, ptw, 1);
  drawPixelText(ctx, plaqueText, px0 + 4, py0 + 1, "#241a10");
  // Stopped containers as crates on the front terrace (small grey blocks)
  for (let i = 0; i < Math.min(stopped.length, 8); i++) {
    ctx.fillStyle = "#5a4a3a";
    ctx.fillRect(px + 4 + i * 8, py + ph - 6, 6, 3);
    ctx.fillStyle = "#3a2c1c";
    ctx.fillRect(px + 4 + i * 8, py + ph - 6, 6, 1);
  }
  // Smoke from chimney
  const phase = Math.floor(frame / 6) % 6;
  ctx.fillStyle = PALETTE.smoke;
  ctx.fillRect(px + pw - 12, py - 14 - phase, 4, 2);
  ctx.fillRect(px + pw - 10, py - 16 - phase, 2, 2);
}

function drawArchesInSeawall(ctx: CanvasRenderingContext2D, sky: SkyPalette) {
  // Stone arches every 90px-ish, opening into dark water underneath.
  const positions = [50, 160, 280, 410, 530];
  for (const x of positions) {
    const archW = 12;
    const archH = 8;
    const yBase = ZONE.seawallTop + ZONE.seawallHeight - 1;
    // Cut arch: fill with dark water peek
    ctx.fillStyle = darken(sky.waterDeep, 0.4);
    // Arch interior: rounded top
    for (let dy = 0; dy < archH; dy++) {
      const t = 1 - dy / archH;
      const span = Math.floor(archW * (1 - Math.cos(t * Math.PI / 2)));
      const w = Math.max(2, archW - span);
      ctx.fillRect(x - Math.floor(w / 2), yBase - dy, w, 1);
    }
    // Arch keystone (lighter stone)
    ctx.fillStyle = PALETTE.seawallTop;
    ctx.fillRect(x - 1, yBase - archH, 2, 1);
    // Side stones outlining
    ctx.fillStyle = PALETTE.seawallMortar;
    ctx.fillRect(x - Math.floor(archW / 2) - 1, yBase - archH + 1, 1, archH);
    ctx.fillRect(x + Math.floor(archW / 2), yBase - archH + 1, 1, archH);
  }
}

function drawSeawall(ctx: CanvasRenderingContext2D, _tod?: TimeOfDay) {
  ctx.fillStyle = PALETTE.seawallStone;
  ctx.fillRect(0, ZONE.seawallTop, PIXEL_W, ZONE.seawallHeight);
  // Top capstone
  ctx.fillStyle = PALETTE.seawallTop;
  ctx.fillRect(0, ZONE.seawallTop, PIXEL_W, 2);
  // Mortar lines for stone texture
  ctx.fillStyle = PALETTE.seawallMortar;
  for (let y = ZONE.seawallTop + 4; y < ZONE.seawallTop + ZONE.seawallHeight; y += 4) {
    for (let x = ((y / 4) | 0) % 8; x < PIXEL_W; x += 8) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Shadow strip below
  ctx.fillStyle = PALETTE.seawallShadow;
  ctx.fillRect(0, ZONE.seawallTop + ZONE.seawallHeight, PIXEL_W, 1);
}

function drawAtmosphericFog(ctx: CanvasRenderingContext2D, sky: SkyPalette) {
  // Wispy fog: many short translucent horizontal streaks at varied y/length.
  const bandTop = 118;
  const bandH = 26;
  const fogColor = mixColor(sky.skyLow, "#ffffff", 0.55);
  const [fr, fg, fb] = parseColor(fogColor);
  for (let i = 0; i < 90; i++) {
    const y = bandTop + ((i * 17) % bandH);
    const distFromCenter = Math.abs((y - (bandTop + bandH / 2)) / (bandH / 2));
    const baseAlpha = (1 - distFromCenter) * 0.32;
    const x = (i * 53 + (i % 3) * 7) % (PIXEL_W + 60) - 30;
    const w = 14 + ((i * 11) % 60);
    const alpha = baseAlpha * (0.4 + ((i * 7) % 100) / 150);
    if (alpha < 0.03) continue;
    ctx.fillStyle = `rgba(${fr},${fg},${fb},${alpha.toFixed(2)})`;
    ctx.fillRect(x, y, w, 1);
  }
}

function drawSunGlintLane(
  ctx: CanvasRenderingContext2D,
  sky: SkyPalette,
  frame: number,
  waterH: number
) {
  // Only show glint while sun is in upper sky (day/golden hour).
  // Below ~140 the sun has "set" → use a softer moon glint instead.
  const sunBelowHorizon = sky.sunY > 140;
  const baseX = sky.sunX;
  const top = ZONE.waterTop;
  if (sunBelowHorizon) {
    // Silvery moon glint, narrower and bluer.
    for (let dy = 0; dy < waterH; dy++) {
      const dist = dy / waterH;
      const w = 3 + dy * 0.18;
      const alpha = (1 - dist) * 0.22 * sky.ambient;
      if (alpha < 0.04) continue;
      if ((dy + (frame >> 1)) % 4 === 2) continue;
      const wob = Math.sin((dy + frame * 0.15) * 0.35) * 1.2;
      ctx.fillStyle = `rgba(220,228,255,${alpha.toFixed(2)})`;
      ctx.fillRect(Math.floor(baseX - w / 2 + wob), top + dy, Math.ceil(w), 1);
    }
    return;
  }
  // Daytime sun glint cone.
  const widthBase = 6;
  for (let dy = 0; dy < waterH; dy++) {
    const dist = dy / waterH;
    const w = widthBase + dy * 0.5;
    const alpha = (1 - dist) * 0.28 * sky.ambient;
    if (alpha < 0.04) continue;
    if ((dy + (frame >> 1)) % 3 === 2) continue;
    const wob = Math.sin((dy + frame * 0.2) * 0.4) * 2;
    ctx.fillStyle = `rgba(255,239,200,${alpha.toFixed(2)})`;
    ctx.fillRect(Math.floor(baseX - w / 2 + wob), top + dy, Math.ceil(w), 1);
  }
}

function drawChimneySmoke(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number
) {
  // Top 3 buildings by port count get THICK smoke (busy processes).
  const sorted = [...front].sort((a, b) => b.ports.length - a.ports.length);
  const busy = new Set(sorted.slice(0, 3).map((b) => b.process));
  for (const b of front) {
    const isBusy = busy.has(b.process);
    if (!isBusy && (strHash(b.process) >> 6) % 2 !== 0) continue;
    const cx = b.x + Math.floor(b.width * 0.7) + 1;
    const cyTop = b.topY - 8;
    drawSmokePuff(ctx, cx, cyTop, frame + strHash(b.process) % 60, false, isBusy ? b.ports.length : 1);
  }
}

function drawBackChimneySmoke(
  ctx: CanvasRenderingContext2D,
  back: Building[],
  frame: number
) {
  for (const b of back) {
    if ((strHash(b.process) >> 3) % 3 !== 0) continue;
    const cx = b.x + Math.floor(b.width * 0.6);
    const cyTop = b.topY - 4;
    drawSmokePuff(ctx, cx, cyTop, frame + strHash(b.process) % 90, true);
  }
}

function drawSmokePuff(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
  faded: boolean = false,
  intensity: number = 1
) {
  // intensity 1 = normal, >1 = thicker (busy process)
  const puffCount = Math.min(8, 4 + intensity);
  const baseSize = Math.min(3, 1 + Math.floor(intensity / 3));
  for (let i = 0; i < puffCount; i++) {
    const phase = (frame + i * 12) % 70;
    const dy = -phase * 0.55;
    const drift = Math.sin(phase * 0.1 + i) * (1.5 + intensity * 0.3);
    const py = y + dy;
    if (py < 0) continue;
    const alpha = (1 - phase / 70) * (faded ? 0.4 : 0.7);
    if (alpha < 0.05) continue;
    const size = baseSize + Math.floor(phase / 18);
    ctx.fillStyle = `rgba(218,218,228,${alpha.toFixed(2)})`;
    ctx.fillRect(Math.floor(x + drift), Math.floor(py), size, size);
  }
}

function drawBridge(ctx: CanvasRenderingContext2D, front: Building[]) {
  // Connect 2 specific buildings (4th and 5th) w/ stone arch over an alley.
  if (front.length < 6) return;
  const a = front[3];
  const b = front[4];
  if (!a || !b) return;
  const gapStart = a.x + a.width - 2;
  const gapEnd = b.x + 2;
  if (gapEnd - gapStart < 6) return;
  const bridgeY = Math.min(a.topY, b.topY) + 20;
  const archH = 12;
  const w = gapEnd - gapStart;
  // Stone deck top
  ctx.fillStyle = PALETTE.seawallTop;
  ctx.fillRect(gapStart, bridgeY, w, 2);
  ctx.fillStyle = PALETTE.seawallStone;
  ctx.fillRect(gapStart, bridgeY + 2, w, 4);
  // Arch underneath
  ctx.fillStyle = currentSky ? darken(currentSky.skyHigh, 0.15) : "#9bd9ff";
  for (let dy = 0; dy < archH; dy++) {
    const t = dy / archH;
    const span = Math.floor(w * Math.sin(t * Math.PI) * 0.45);
    if (span <= 0) continue;
    ctx.fillRect(gapStart + Math.floor(w / 2) - span, bridgeY + 6 + dy, span * 2, 1);
  }
  // Railing posts
  for (let x = gapStart + 1; x < gapEnd; x += 3) {
    ctx.fillStyle = "#241a10";
    ctx.fillRect(x, bridgeY - 2, 1, 2);
  }
  // Tiny figure crossing
  const phase = (performance.now() / 80) % (w + 8);
  const fx = Math.floor(gapStart + phase - 4);
  if (fx >= gapStart && fx < gapEnd) {
    ctx.fillStyle = "#3a5a78";
    ctx.fillRect(fx, bridgeY - 4, 1, 2);
    ctx.fillStyle = "#e2b692";
    ctx.fillRect(fx, bridgeY - 5, 1, 1);
  }
}

function drawStoneSteps(ctx: CanvasRenderingContext2D, front: Building[]) {
  // Between every other pair of buildings, draw stone steps descending to seawall.
  const stepColor = "#7a6a5a";
  const stepShadow = "#3a2c1c";
  for (let i = 1; i < front.length; i += 3) {
    const b1 = front[i - 1];
    const b2 = front[i];
    if (!b1 || !b2) continue;
    const gx = Math.floor((b1.x + b1.width + b2.x) / 2) - 4;
    // Don't render if buildings already touch / overlap
    if (Math.abs(b1.x + b1.width - b2.x) > 6) continue;
    const baseY = ZONE.seawallTop;
    // 3 steps descending into seawall
    for (let s = 0; s < 3; s++) {
      const sw = 8 + s * 2;
      const sx = gx - s;
      const sy = baseY - 4 + s;
      ctx.fillStyle = stepColor;
      ctx.fillRect(sx, sy, sw, 1);
      ctx.fillStyle = stepShadow;
      ctx.fillRect(sx, sy + 1, sw, 1);
    }
  }
}

function drawLampPosts(ctx: CanvasRenderingContext2D, tod: TimeOfDay, frame: number) {
  if (currentTheme === "caribbean") {
    drawPalmTrees(ctx, frame);
    return;
  }
  const lit = tod === "night" || tod === "dusk" || tod === "dawn";
  const positions = [40, 130, 220, 310, 400, 490, 540];
  for (const x of positions) {
    const baseY = ZONE.seawallTop;
    // Post
    ctx.fillStyle = "#1a1410";
    ctx.fillRect(x, baseY - 12, 1, 12);
    // Crossbar
    ctx.fillRect(x - 1, baseY - 13, 3, 1);
    // Lamp body
    ctx.fillStyle = lit ? "#ffde3c" : "#3a3028";
    ctx.fillRect(x - 1, baseY - 16, 3, 3);
    ctx.fillStyle = "#1a1410";
    ctx.fillRect(x - 1, baseY - 17, 3, 1);
    if (lit) {
      // Glow halo
      const flick = ((frame + x) % 60) < 50 ? 1 : 0.7;
      ctx.fillStyle = `rgba(255,222,60,${(0.18 * flick).toFixed(2)})`;
      for (let r = 8; r > 1; r--) {
        ctx.fillRect(x - r, baseY - 15 - r, r * 2 + 1, 1);
      }
      // Bright center
      ctx.fillStyle = "rgba(255,255,200,0.9)";
      ctx.fillRect(x, baseY - 15, 1, 1);
    }
  }
}

function drawPalmTrees(ctx: CanvasRenderingContext2D, frame: number) {
  const positions = [40, 130, 220, 310, 400, 490, 540];
  for (const x of positions) {
    const baseY = ZONE.seawallTop;
    const sway = Math.sin((frame + x) * 0.02) * 1;
    // Trunk
    ctx.fillStyle = "#5a3a1c";
    ctx.fillRect(x, baseY - 18, 2, 18);
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(x, baseY - 16, 1, 2);
    ctx.fillRect(x, baseY - 10, 1, 2);
    ctx.fillRect(x, baseY - 4, 1, 2);
    // Fronds (5 drooping leaves)
    ctx.fillStyle = "#5fa371";
    const tx = x + 1 + Math.round(sway);
    const ty = baseY - 18;
    // top fronds
    ctx.fillRect(tx - 5, ty - 1, 4, 1);
    ctx.fillRect(tx - 6, ty, 2, 1);
    ctx.fillRect(tx + 1, ty - 1, 4, 1);
    ctx.fillRect(tx + 5, ty, 2, 1);
    ctx.fillRect(tx - 3, ty - 3, 6, 1);
    ctx.fillRect(tx, ty - 4, 1, 1);
    // Brighter highlights
    ctx.fillStyle = "#86c7ff";
    ctx.fillRect(tx - 1, ty - 4, 3, 1);
    // Coconuts
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(tx - 1, ty + 1, 1, 1);
    ctx.fillRect(tx + 2, ty + 1, 1, 1);
  }
}

function drawSpottyTheCat(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number
) {
  if (front.length < 3) return;
  const sorted = [...front].sort((a, b) => b.height - a.height);
  const target = sorted.find((b) => !b.isCathedralAnchor) ?? sorted[1];
  if (!target) return;
  const rooftopBaseY = target.topY - 2;
  const leapCycle = 360;
  const leapPhase = frame % leapCycle;
  const leaping = leapPhase < 30;
  const leapArc = leaping ? Math.sin((leapPhase / 30) * Math.PI) * 8 : 0;
  const rooftopY = rooftopBaseY - leapArc;
  // Move Spotty to LEFT corner of roof so it doesn't sit on the plaque
  const cx = target.x + 6;
  const tailWag = Math.floor(frame / 16) % 2;
  // Tail wagging
  ctx.fillStyle = "#241a10";
  ctx.fillRect(cx - 5, rooftopY - 2 - tailWag, 1, 1);
  ctx.fillRect(cx - 4, rooftopY - 1, 1, 1);
  // Body white
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(cx - 3, rooftopY - 2, 5, 2);
  ctx.fillRect(cx + 2, rooftopY - 3, 2, 2);
  // Black spots
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(cx - 2, rooftopY - 2, 1, 1);
  ctx.fillRect(cx, rooftopY - 1, 1, 1);
  ctx.fillRect(cx + 1, rooftopY - 2, 1, 1);
  // Ears
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(cx + 2, rooftopY - 4, 1, 1);
  ctx.fillRect(cx + 3, rooftopY - 4, 1, 1);
  // Eyes
  ctx.fillStyle = "#39ff14";
  ctx.fillRect(cx + 2, rooftopY - 3, 1, 1);
  // Legs
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(cx - 2, rooftopY, 1, 1);
  ctx.fillRect(cx + 2, rooftopY, 1, 1);
  // Register hit
  scenicHits.push({
    key: "spotty",
    x: cx - 5,
    y: rooftopY - 5,
    w: 10,
    h: 7,
    label: "Spotty",
    lines: ["Spotty the rooftop cat", "watches over harbour", "tail wag: contented"]
  });
}

function drawDollyTheDog(
  ctx: CanvasRenderingContext2D,
  frame: number
) {
  // Pomeranian trotting along seawall (slow gait so users can hover).
  const span = PIXEL_W - 200;
  const period = span * 2;
  const phase = (frame * 0.18) % period;
  const dx = phase < span ? phase : period - phase;
  const facing = phase < span ? 1 : -1;
  const x = 80 + Math.floor(dx);
  const y = ZONE.seawallTop;
  const bob = Math.floor(frame / 6) % 2;
  // Body fluffy (cream)
  ctx.fillStyle = "#f5e3b8";
  ctx.fillRect(x, y - 3, 5, 3);
  // Fluff hint
  ctx.fillStyle = "#fff2cf";
  ctx.fillRect(x, y - 3, 1, 1);
  ctx.fillRect(x + 4, y - 3, 1, 1);
  // Head
  ctx.fillStyle = "#f5e3b8";
  const headX = x + (facing > 0 ? 4 : 0);
  ctx.fillRect(headX, y - 5, 2, 2);
  // Ears (pointed)
  ctx.fillStyle = "#c9a55c";
  ctx.fillRect(headX, y - 6, 1, 1);
  ctx.fillRect(headX + 1, y - 6, 1, 1);
  // Eye
  ctx.fillStyle = "#241a10";
  ctx.fillRect(headX + (facing > 0 ? 1 : 0), y - 4, 1, 1);
  // Nose
  ctx.fillRect(headX + (facing > 0 ? 2 : -1), y - 4, 1, 1);
  // Curly tail
  const tailX = x - (facing > 0 ? 1 : -5);
  ctx.fillRect(tailX, y - 4, 1, 1);
  ctx.fillRect(tailX + (facing > 0 ? -1 : 1), y - 5, 1, 1);
  // Legs
  ctx.fillStyle = "#241a10";
  if (bob === 0) {
    ctx.fillRect(x + 1, y, 1, 1);
    ctx.fillRect(x + 3, y, 1, 1);
  } else {
    ctx.fillRect(x, y, 1, 1);
    ctx.fillRect(x + 4, y, 1, 1);
  }
  // Bouncing red ball ahead of Dolly
  const ballX = x + facing * 10;
  const ballBounce = Math.abs(Math.sin(frame * 0.12)) * 6;
  const by = y - 2 - ballBounce;
  ctx.fillStyle = "#e25c66";
  ctx.fillRect(ballX, by, 2, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(ballX, by, 1, 1);
  // Hit
  scenicHits.push({
    key: "dolly",
    x: x - 1,
    y: y - 7,
    w: 8,
    h: 9,
    label: "Dolly",
    lines: ["Dolly the Pomeranian", "chasing her ball", "very good girl"]
  });
}

function drawMessageInBottle(
  ctx: CanvasRenderingContext2D,
  frame: number
) {
  // Floating bottle drifts slowly across far water.
  const span = PIXEL_W + 60;
  const phase = (frame * 0.08) % span;
  const x = -20 + phase;
  const y = ZONE.waterTop + 60 + Math.sin(frame * 0.05) * 1;
  if (x < -10 || x > PIXEL_W) return;
  // Bottle body (glass green)
  ctx.fillStyle = "#3a7a4a";
  ctx.fillRect(x, y, 6, 3);
  ctx.fillStyle = "#5fa371";
  ctx.fillRect(x, y, 6, 1);
  // Neck
  ctx.fillStyle = "#3a7a4a";
  ctx.fillRect(x + 6, y + 1, 2, 1);
  // Cork
  ctx.fillStyle = "#8a5a2c";
  ctx.fillRect(x + 8, y + 1, 1, 1);
  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillRect(x + 1, y, 1, 1);
  // Hit
  scenicHits.push({
    key: "bottle",
    x: Math.floor(x) - 1,
    y: Math.floor(y) - 1,
    w: 11,
    h: 5,
    label: "Message in a bottle",
    lines: ["obicham te muti"]
  });
}

// ============================================================================
// R5 ADDITIONS: weather, creatures, easter eggs, heat map
// ============================================================================

function drawWeather(
  ctx: CanvasRenderingContext2D,
  frame: number,
  w: import("./types").WeatherKind,
  sky: SkyPalette
) {
  if (w === "clear") return;
  if (w === "rain" || w === "storm") {
    // Diagonal rain streaks (count tuned for perf)
    const density = w === "storm" ? 120 : 60;
    ctx.fillStyle = "rgba(180,200,220,0.55)";
    for (let i = 0; i < density; i++) {
      const x = (i * 37 + frame * 6) % PIXEL_W;
      const y = (i * 19 + frame * 14) % PIXEL_H;
      ctx.fillRect(x, y, 1, 3);
    }
    // Ripple rings on water
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const rx = (i * 73 + frame * 11) % PIXEL_W;
      const ry = ZONE.waterTop + 12 + (i * 17) % 60;
      const r = ((frame + i * 9) % 32) / 4;
      if (r < 1) continue;
      ctx.beginPath();
      ctx.ellipse(rx, ry, r, r * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (w === "storm") {
      // Random lightning flash
      if ((frame % 240) < 4) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
        // Bolt
        ctx.fillStyle = "rgba(255,255,200,0.95)";
        const bx = 100 + ((frame * 13) % 400);
        let y = 0;
        let x = bx;
        for (let k = 0; k < 18; k++) {
          ctx.fillRect(x, y, 2, 6);
          y += 6;
          x += ((k % 2) === 0 ? -3 : 3);
        }
      }
    }
  }
  if (w === "fog") {
    // Volumetric mist: many drifting horizontal wisps at varied y/alpha/speed.
    const baseColor = mixColor(sky.skyLow, "#ffffff", 0.7);
    const [fr, fg, fb] = parseColor(baseColor);
    // Two drifting density layers (was 3)
    for (let layer = 0; layer < 2; layer++) {
      const speed = 0.15 + layer * 0.18;
      for (let i = 0; i < 60; i++) {
        const baseY = 70 + ((i * 13 + layer * 37) % (PIXEL_H - 80));
        const len = 40 + ((i * 11 + layer * 7) % 140);
        const x = ((i * 53 + frame * speed) % (PIXEL_W + 160)) - 80;
        const alphaCore = 0.04 + ((i * 3 + layer * 5) % 6) * 0.012;
        // Soft falloff: thicker middle, thin ends
        ctx.fillStyle = `rgba(${fr},${fg},${fb},${alphaCore.toFixed(2)})`;
        ctx.fillRect(x, baseY, len, 1);
        ctx.fillStyle = `rgba(${fr},${fg},${fb},${(alphaCore * 0.6).toFixed(2)})`;
        ctx.fillRect(x, baseY + 1, len, 1);
      }
    }
    // Light vignette tying the layers together
    ctx.fillStyle = `rgba(${fr},${fg},${fb},0.08)`;
    ctx.fillRect(0, 70, PIXEL_W, PIXEL_H - 70);
  }
  // Suppress unused warning
  void sky;
}

function drawShootingStars(
  ctx: CanvasRenderingContext2D,
  frame: number,
  tod: TimeOfDay
) {
  if (tod !== "night" && tod !== "dusk") return;
  // Single shooting star every ~12 seconds (at 60fps = 720 frames).
  const cycle = 720;
  const phase = frame % cycle;
  if (phase > 60) return;
  const seed = Math.floor(frame / cycle);
  const startX = (seed * 71) % PIXEL_W;
  const startY = 10 + (seed * 13) % 50;
  const t = phase / 60;
  const x = startX + t * 80;
  const y = startY + t * 40;
  // Trail
  for (let i = 0; i < 8; i++) {
    const a = 1 - i / 8;
    ctx.fillStyle = `rgba(255,255,230,${(a * (1 - t)).toFixed(2)})`;
    ctx.fillRect(Math.floor(x - i * 3), Math.floor(y - i * 1.5), 2, 1);
  }
}

function drawAurora(
  ctx: CanvasRenderingContext2D,
  frame: number,
  tod: TimeOfDay
) {
  if (tod !== "night") return;
  // Rare: only on ~1 in 8 cycles, very subtle high-sky glow.
  const seed = Math.floor(frame / 9000);
  if (seed % 8 !== 0) return;
  for (let x = 0; x < PIXEL_W; x++) {
    const wave = Math.sin(x * 0.02 + frame * 0.012) * 3
               + Math.sin(x * 0.05 + frame * 0.018) * 1.5;
    const baseY = 14 + wave;
    // Thin band, soft fade
    for (let dy = 0; dy < 12; dy++) {
      const a = (1 - dy / 12) * 0.08;
      const green = (1 - dy / 12);
      const r = Math.floor(80 + green * 60);
      const g = Math.floor(200 * green + 80);
      const b = Math.floor(120 + (1 - green) * 100);
      ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(3)})`;
      ctx.fillRect(x, Math.floor(baseY + dy), 1, 1);
    }
  }
}

function drawUFO(ctx: CanvasRenderingContext2D, frame: number) {
  const hr = new Date().getHours();
  if (hr !== 3) return;
  const x = (frame * 1.5) % (PIXEL_W + 60) - 30;
  const y = 40 + Math.sin(frame * 0.04) * 4;
  // Saucer body
  ctx.fillStyle = "#9ab2cd";
  ctx.fillRect(x - 5, y, 10, 2);
  ctx.fillRect(x - 7, y + 1, 14, 1);
  // Dome
  ctx.fillStyle = "#a8e0ff";
  ctx.fillRect(x - 2, y - 2, 4, 2);
  // Lights
  ctx.fillStyle = (frame >> 2) % 2 === 0 ? "#ff4060" : "#39ff14";
  ctx.fillRect(x - 5, y + 2, 1, 1);
  ctx.fillRect(x + 4, y + 2, 1, 1);
  // Tractor beam
  ctx.fillStyle = "rgba(57,255,20,0.18)";
  ctx.fillRect(Math.floor(x) - 2, Math.floor(y) + 3, 5, 14);
  // Hit
  scenicHits.push({
    key: "ufo",
    x: Math.floor(x) - 8,
    y: Math.floor(y) - 3,
    w: 16,
    h: 8,
    label: "UFO",
    lines: ["unidentified", "floating object", "3 AM visitor"]
  });
}

function drawWhaleSpout(ctx: CanvasRenderingContext2D, frame: number) {
  // Rare whale spout in distant water (far horizon area)
  const cycle = 1800;
  const phase = frame % cycle;
  if (phase > 240) return;
  const x = 380 + Math.sin(frame * 0.003) * 30;
  const y = ZONE.waterTop + 4;
  // Body hump
  ctx.fillStyle = "#3a4a5a";
  ctx.fillRect(Math.floor(x) - 4, y, 8, 1);
  ctx.fillRect(Math.floor(x) - 2, y - 1, 4, 1);
  // Spout
  if (phase < 80) {
    const sh = phase / 3;
    ctx.fillStyle = "rgba(220,235,245,0.7)";
    ctx.fillRect(Math.floor(x), y - sh, 1, sh);
    ctx.fillRect(Math.floor(x) - 1, y - sh - 2, 3, 2);
  }
  scenicHits.push({
    key: "whale",
    x: Math.floor(x) - 6,
    y: y - 18,
    w: 12,
    h: 22,
    label: "Whale",
    lines: ["a passing whale", "spouts hello"]
  });
}

function drawMermaid(
  ctx: CanvasRenderingContext2D,
  frame: number,
  tod: TimeOfDay
) {
  if (tod !== "goldenHour" && tod !== "dusk") return;
  // On a rock near right side foreground water
  const x = 80;
  const y = ZONE.waterTop + 28;
  // Rock
  ctx.fillStyle = "#3a3030";
  ctx.fillRect(x - 4, y - 1, 9, 3);
  ctx.fillStyle = "#5a4a4a";
  ctx.fillRect(x - 4, y - 1, 9, 1);
  // Tail
  const wag = Math.floor(frame / 20) % 2;
  ctx.fillStyle = "#5fa371";
  ctx.fillRect(x, y - 3, 3, 2);
  ctx.fillRect(x + 3, y - 4 + wag, 2, 2);
  ctx.fillRect(x + 5, y - 5 + wag, 2, 1);
  // Body
  ctx.fillStyle = "#e6c4a8";
  ctx.fillRect(x - 1, y - 5, 3, 2);
  // Hair (long red)
  ctx.fillStyle = "#a64a36";
  ctx.fillRect(x - 2, y - 7, 4, 2);
  ctx.fillRect(x - 1, y - 5, 1, 1);
  ctx.fillRect(x + 2, y - 5, 1, 1);
  scenicHits.push({
    key: "mermaid",
    x: x - 4,
    y: y - 8,
    w: 12,
    h: 10,
    label: "Mermaid",
    lines: ["a mermaid sings", "at golden hour"]
  });
}

function drawTigger(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number
) {
  if (front.length < 5) return;
  // Orange tabby on different building from Spotty, sit on RIGHT corner of roof
  const target = front[Math.floor(front.length * 0.7)];
  if (!target) return;
  const rooftopY = target.topY - 2;
  const cx = target.x + target.width - 6;
  const tailWag = Math.floor(frame / 20) % 2;
  ctx.fillStyle = "#241a10";
  ctx.fillRect(cx - 5, rooftopY - 2 - tailWag, 1, 1);
  ctx.fillRect(cx - 4, rooftopY - 1, 1, 1);
  // Orange body
  ctx.fillStyle = "#e88c3a";
  ctx.fillRect(cx - 3, rooftopY - 2, 5, 2);
  ctx.fillRect(cx + 2, rooftopY - 3, 2, 2);
  // Tabby stripes
  ctx.fillStyle = "#a44818";
  ctx.fillRect(cx - 2, rooftopY - 2, 1, 1);
  ctx.fillRect(cx, rooftopY - 1, 1, 1);
  ctx.fillRect(cx + 1, rooftopY - 2, 1, 1);
  // Ears
  ctx.fillStyle = "#e88c3a";
  ctx.fillRect(cx + 2, rooftopY - 4, 1, 1);
  ctx.fillRect(cx + 3, rooftopY - 4, 1, 1);
  // Eyes
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(cx + 2, rooftopY - 3, 1, 1);
  // Legs
  ctx.fillStyle = "#e88c3a";
  ctx.fillRect(cx - 2, rooftopY, 1, 1);
  ctx.fillRect(cx + 2, rooftopY, 1, 1);
  scenicHits.push({
    key: "tigger",
    x: cx - 5,
    y: rooftopY - 5,
    w: 10,
    h: 7,
    label: "Tigger",
    lines: ["Tigger the orange cat", "nemesis of Spotty"]
  });
}

function drawOwlInBelfry(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number,
  tod: TimeOfDay
) {
  if (tod !== "night" && tod !== "dusk") return;
  const cathedral = front.find((b) => b.isCathedralAnchor);
  if (!cathedral) return;
  const tx = cathedral.x + Math.floor(cathedral.width / 2) - 6;
  const towerH = 40;
  const towerTop = cathedral.topY - 4 - towerH;
  // Owl perched in belfry arch
  const ox = tx + 3;
  const oy = towerTop + 8;
  const blink = (frame % 200) < 6;
  ctx.fillStyle = "#5a3a28";
  ctx.fillRect(ox, oy, 3, 3);
  // Eyes
  ctx.fillStyle = blink ? "#5a3a28" : "#ffde3c";
  ctx.fillRect(ox, oy, 1, 1);
  ctx.fillRect(ox + 2, oy, 1, 1);
  // Beak
  ctx.fillStyle = "#241a10";
  ctx.fillRect(ox + 1, oy + 1, 1, 1);
  scenicHits.push({
    key: "owl",
    x: ox - 1,
    y: oy - 1,
    w: 5,
    h: 5,
    label: "Belfry owl",
    lines: ["wise owl watches", "from cathedral belfry"]
  });
}

function drawBatAtNight(
  ctx: CanvasRenderingContext2D,
  frame: number,
  tod: TimeOfDay
) {
  if (tod !== "night") return;
  const x = (Math.sin(frame * 0.02) * 200 + PIXEL_W / 2) | 0;
  const y = 70 + Math.sin(frame * 0.07) * 10;
  const flap = Math.floor(frame / 5) % 2;
  ctx.fillStyle = "#1a1410";
  if (flap === 0) {
    ctx.fillRect(x - 2, y, 1, 1);
    ctx.fillRect(x + 2, y, 1, 1);
    ctx.fillRect(x, y, 1, 1);
  } else {
    ctx.fillRect(x - 3, y + 1, 1, 1);
    ctx.fillRect(x + 3, y + 1, 1, 1);
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawSmudgeTheCat(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number
) {
  if (front.length < 5) return;
  // 3rd cat on a third rooftop different from Spotty/Tigger
  const sorted = [...front].sort((a, b) => b.height - a.height);
  const target = sorted[2];
  if (!target) return;
  const rooftopY = target.topY - 2;
  const cx = target.x + Math.floor(target.width * 0.3);
  const wave = Math.floor(frame / 24) % 2;
  // Grey body
  ctx.fillStyle = "#7a7a82";
  ctx.fillRect(cx - 2, rooftopY - 2, 4, 2);
  ctx.fillRect(cx + 2, rooftopY - 3, 2, 2);
  // Dark grey patches
  ctx.fillStyle = "#4a4a52";
  ctx.fillRect(cx - 1, rooftopY - 2, 1, 1);
  ctx.fillRect(cx + 1, rooftopY - 1, 1, 1);
  // Tail
  ctx.fillStyle = "#4a4a52";
  ctx.fillRect(cx - 4, rooftopY - 1 - wave, 1, 1);
  // Ears
  ctx.fillStyle = "#7a7a82";
  ctx.fillRect(cx + 2, rooftopY - 4, 1, 1);
  ctx.fillRect(cx + 3, rooftopY - 4, 1, 1);
  // Eyes
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(cx + 2, rooftopY - 3, 1, 1);
  // Legs
  ctx.fillStyle = "#7a7a82";
  ctx.fillRect(cx - 1, rooftopY, 1, 1);
  ctx.fillRect(cx + 2, rooftopY, 1, 1);
  scenicHits.push({
    key: "smudge",
    x: cx - 4,
    y: rooftopY - 5,
    w: 10,
    h: 7,
    label: "Smudge",
    lines: ["Smudge the grey tabby", "third of the harbour cats"]
  });
}

function drawSubmarinePeriscope(ctx: CanvasRenderingContext2D, frame: number) {
  // Very rare: periscope pokes up in far water for ~3s every ~60s
  const cycle = 3600;
  const phase = frame % cycle;
  if (phase > 180) return;
  const seed = Math.floor(frame / cycle);
  if (seed % 4 !== 0) return;
  const x = 360 + ((seed * 47) % 220);
  const y = ZONE.waterTop + 14;
  // Periscope shaft
  ctx.fillStyle = "#3a4a4c";
  ctx.fillRect(x, y - 6, 1, 6);
  // Eyepiece head
  ctx.fillStyle = "#5a6a6c";
  ctx.fillRect(x - 1, y - 8, 3, 2);
  // Lens glint
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(x + 1, y - 7, 1, 1);
  // Wake around periscope
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for (let i = -3; i <= 3; i++) {
    if ((i + frame) % 2 === 0) ctx.fillRect(x + i, y, 1, 1);
  }
  scenicHits.push({
    key: "submarine",
    x: x - 3,
    y: y - 10,
    w: 8,
    h: 12,
    label: "Submarine",
    lines: ["periscope spotted", "she dives again"]
  });
}

function drawBuntingOnBridge(ctx: CanvasRenderingContext2D, front: Building[]) {
  if (front.length < 6) return;
  const a = front[3];
  const b = front[4];
  if (!a || !b) return;
  const gapStart = a.x + a.width - 2;
  const gapEnd = b.x + 2;
  if (gapEnd - gapStart < 6) return;
  const bridgeY = Math.min(a.topY, b.topY) + 20;
  // Day-of-week colored bunting
  const day = new Date().getDay();
  const palettes: Record<number, string[]> = {
    0: ["#e25c66", "#ffffff", "#e25c66"], // Sun
    1: ["#3a5a78", "#86c7ff", "#3a5a78"], // Mon
    2: ["#5fa371", "#ffde3c", "#5fa371"], // Tue
    3: ["#b464ff", "#e25c66", "#b464ff"], // Wed
    4: ["#ff8c28", "#ffde3c", "#ff8c28"], // Thu
    5: ["#39ff14", "#00f5ff", "#39ff14"], // Fri
    6: ["#ffde3c", "#e25c66", "#ffde3c"]  // Sat
  };
  const cols = palettes[day];
  for (let x = gapStart; x < gapEnd; x += 3) {
    const c = cols[(x - gapStart) % cols.length];
    ctx.fillStyle = c;
    ctx.fillRect(x, bridgeY - 5, 2, 2);
    ctx.fillStyle = "#241a10";
    ctx.fillRect(x, bridgeY - 6, 1, 1);
  }
}

function drawJukebox(ctx: CanvasRenderingContext2D, frame: number) {
  const musicOn = (window as any).__harborMusicOn === true;
  const x = 90;
  const baseY = ZONE.seawallTop;
  // Body
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(x - 3, baseY - 8, 8, 8);
  // Top dome
  ctx.fillStyle = "#8a5a2c";
  ctx.fillRect(x - 3, baseY - 11, 8, 3);
  ctx.fillRect(x - 2, baseY - 12, 6, 1);
  // Glass display
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(x - 2, baseY - 10, 6, 2);
  if (musicOn) {
    const bars = ["#e25c66", "#ffde3c", "#39ff14", "#00f5ff", "#b464ff", "#ff8c28"];
    for (let i = 0; i < 6; i++) {
      const h = 1 + Math.floor(Math.abs(Math.sin(frame * 0.2 + i)) * 2);
      ctx.fillStyle = bars[i];
      ctx.fillRect(x - 2 + i, baseY - 9 + (2 - h), 1, h);
    }
  } else {
    // Dim flat bars when off
    ctx.fillStyle = "#3a3030";
    ctx.fillRect(x - 2, baseY - 9, 6, 1);
  }
  // Speaker grille
  ctx.fillStyle = "#3a2516";
  ctx.fillRect(x - 2, baseY - 6, 6, 1);
  ctx.fillRect(x - 2, baseY - 4, 6, 1);
  ctx.fillRect(x - 2, baseY - 2, 6, 1);
  // Note glyph
  ctx.fillStyle = musicOn ? "#ffde3c" : "#5a4a2a";
  ctx.fillRect(x + 1, baseY - 7, 1, 3);
  ctx.fillRect(x + 1, baseY - 4, 2, 1);
  // First-time only tiny pulsing note above jukebox to hint at clickability
  const seen = (window as any).__harborJukeboxSeen === true;
  if (!musicOn && !seen) {
    const bob = Math.floor(frame / 20) % 2;
    const py = baseY - 15 - bob;
    const px = x;
    const pulse = (frame / 12) % 2 < 1;
    ctx.fillStyle = pulse ? "#ffde3c" : "#a37a2e";
    ctx.fillRect(px, py, 1, 3);
    ctx.fillRect(px, py + 3, 2, 1);
  }
  scenicHits.push({
    key: "jukebox",
    x: x - 4,
    y: baseY - 13,
    w: 10,
    h: 14,
    label: "Jukebox",
    lines: [musicOn ? "click to stop music" : "click to play music"]
  });
}

function drawStatue(ctx: CanvasRenderingContext2D) {
  // Bronze statue on plinth in middle of seawall
  const cx = PIXEL_W / 2 - 20;
  const baseY = ZONE.seawallTop;
  // Plinth
  ctx.fillStyle = "#7a6a5a";
  ctx.fillRect(cx - 3, baseY - 6, 6, 6);
  ctx.fillStyle = "#3a2c1c";
  ctx.fillRect(cx - 3, baseY - 7, 6, 1);
  // Statue body (bronze)
  ctx.fillStyle = "#5a4a2a";
  ctx.fillRect(cx - 1, baseY - 13, 3, 6);
  // Head
  ctx.fillRect(cx, baseY - 16, 2, 2);
  // Arm raised (pointing to sea)
  ctx.fillRect(cx - 3, baseY - 13, 2, 1);
  // Cape behind
  ctx.fillStyle = "#3a2c1a";
  ctx.fillRect(cx + 1, baseY - 11, 1, 4);
  scenicHits.push({
    key: "statue",
    x: cx - 4,
    y: baseY - 17,
    w: 8,
    h: 12,
    label: "Founder's statue",
    lines: ["The Port Founder", "gazing eternally seaward"]
  });
}

function drawOldManAndPigeons(ctx: CanvasRenderingContext2D, frame: number) {
  const x = 170;
  const baseY = ZONE.seawallTop;
  // Bench
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(x - 4, baseY - 3, 12, 1);
  ctx.fillRect(x - 4, baseY - 1, 1, 2);
  ctx.fillRect(x + 7, baseY - 1, 1, 2);
  // Old man sitting
  ctx.fillStyle = "#3a2c2a";
  ctx.fillRect(x, baseY - 6, 3, 3);
  ctx.fillStyle = "#e2b692";
  ctx.fillRect(x, baseY - 8, 3, 2);
  // Hat
  ctx.fillStyle = "#3a2c1c";
  ctx.fillRect(x - 1, baseY - 9, 5, 1);
  // Pigeons (3 little blobs that hop)
  const hop = Math.floor(frame / 30) % 2;
  ctx.fillStyle = "#5a5a5a";
  ctx.fillRect(x + 5, baseY - 1 - hop, 2, 1);
  ctx.fillRect(x + 9, baseY - 1, 2, 1);
  ctx.fillRect(x - 2, baseY - 1 - (1 - hop), 2, 1);
  scenicHits.push({
    key: "oldman",
    x: x - 2,
    y: baseY - 10,
    w: 14,
    h: 10,
    label: "Old man",
    lines: ["feeds the pigeons", "every dusk"]
  });
}

function drawLoversOnBridge(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number,
  tod: TimeOfDay
) {
  if (tod !== "goldenHour" && tod !== "dusk") return;
  if (front.length < 6) return;
  const a = front[3];
  const b = front[4];
  if (!a || !b) return;
  const gapStart = a.x + a.width - 2;
  const gapEnd = b.x + 2;
  if (gapEnd - gapStart < 6) return;
  const bridgeY = Math.min(a.topY, b.topY) + 20;
  const mid = Math.floor((gapStart + gapEnd) / 2);
  // Two figures kissing (silhouettes)
  ctx.fillStyle = "#241a10";
  ctx.fillRect(mid - 2, bridgeY - 5, 1, 4);
  ctx.fillRect(mid - 2, bridgeY - 6, 1, 1);
  ctx.fillRect(mid, bridgeY - 5, 1, 4);
  ctx.fillRect(mid, bridgeY - 6, 1, 1);
  // Heart
  if (Math.floor(frame / 30) % 2 === 0) {
    ctx.fillStyle = "#e25c66";
    ctx.fillRect(mid - 1, bridgeY - 8, 2, 1);
  }
}

function drawChildren(ctx: CanvasRenderingContext2D, frame: number) {
  // Tag chase: chaser (red) follows tagger (blue) with slight lag. Roles flip every ~10s.
  const span = 220;
  const t = (frame * 0.3) % (span * 2);
  const baseX = t < span ? t : span * 2 - t;
  const dir = t < span ? 1 : -1;
  const role = Math.floor(frame / 600) % 2;
  const y = ZONE.seawallTop;
  const bob = Math.floor(frame / 6) % 2;
  const kidA = 240 + Math.floor(baseX);
  const kidB = kidA - dir * 12; // chaser 12px behind
  drawChild(ctx, kidA, y, bob, role === 0 ? "#e25c66" : "#3a5a78");
  drawChild(ctx, kidB, y, 1 - bob, role === 0 ? "#3a5a78" : "#e25c66");
  // Exclamation when close
  if ((frame % 40) < 20) {
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(kidA + 1, y - 9, 1, 2);
    ctx.fillRect(kidA + 1, y - 11, 1, 1);
  }
}

function drawChild(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  bob: number,
  shirt: string
) {
  ctx.fillStyle = shirt;
  ctx.fillRect(x, y - 4 - bob, 2, 2);
  ctx.fillStyle = "#e2b692";
  ctx.fillRect(x, y - 6 - bob, 2, 2);
  ctx.fillStyle = "#241a10";
  ctx.fillRect(x, y - 1, 1, 1);
  ctx.fillRect(x + 1, y - 1, 1, 1);
}

function drawHeatMap(
  ctx: CanvasRenderingContext2D,
  on: boolean,
  estab: Map<number, number>,
  buildings: Building[],
  frame: number
) {
  if (!on) return;
  const front = buildings.filter((b) => !b.back);
  for (const b of front) {
    const traffic = b.ports.reduce(
      (acc, p) => acc + (estab.get(p.port) ?? 0),
      0
    );
    if (traffic <= 0) continue;
    const intensity = Math.min(1, traffic / 10);
    const pulse = (Math.sin(frame * 0.1) + 1) / 2;
    ctx.fillStyle = `rgba(255,64,96,${(intensity * (0.25 + pulse * 0.15)).toFixed(2)})`;
    ctx.fillRect(b.x, b.topY, b.width, b.height);
  }
}

function drawNetworkGraph(
  ctx: CanvasRenderingContext2D,
  on: boolean,
  hits: ShipHit[],
  estab: Map<number, number>,
  frame: number
) {
  if (!on) return;
  // Draw glowing lines between all boats with traffic. Pulse along line.
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const a = hits[i];
      const b = hits[j];
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      const traffic =
        (estab.get(a.conn.port) ?? 0) + (estab.get(b.conn.port) ?? 0);
      const intensity = Math.min(1, 0.2 + traffic * 0.1);
      ctx.strokeStyle = `rgba(0,245,255,${(0.35 * intensity).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      // Pulse dot moving along line
      const t = ((frame + i * 7 + j * 11) % 90) / 90;
      const px = ax + (bx - ax) * t;
      const py = ay + (by - ay) * t;
      ctx.fillStyle = "rgba(255,233,168,0.9)";
      ctx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
    }
  }
}

function drawSparklineAboveSelected(
  ctx: CanvasRenderingContext2D,
  selectedKey: string | null,
  hits: ShipHit[]
) {
  // Sparkline above every active boat + bigger one for selected.
  for (const hit of hits) {
    const hist = portHistory.get(hit.conn.port);
    if (!hist || hist.length < 2) continue;
    const max = Math.max(1, ...hist);
    if (max === 0) continue;
    const isSelected = hit.key === selectedKey;
    const w = isSelected ? 40 : Math.min(28, hit.w + 4);
    const h = isSelected ? 8 : 4;
    const sx = hit.x + Math.floor((hit.w - w) / 2);
    const sy = hit.y - h - 2;
    if (isSelected) {
      ctx.fillStyle = "rgba(20,12,40,0.7)";
      ctx.fillRect(sx, sy, w, h);
    }
    ctx.fillStyle = isSelected
      ? "rgba(255,233,168,0.8)"
      : "rgba(255,233,168,0.55)";
    for (let i = 0; i < hist.length; i++) {
      const x = sx + Math.floor((i / Math.max(1, hist.length - 1)) * (w - 1));
      const val = hist[i] / max;
      const yy = sy + h - 1 - Math.floor(val * (h - 2));
      ctx.fillRect(x, yy, 1, 1);
    }
  }
}

function drawPirateFlagDay13(ctx: CanvasRenderingContext2D, front: Building[]) {
  const d = new Date();
  if (d.getDate() !== 13) return;
  const cathedral = front.find((b) => b.isCathedralAnchor);
  if (!cathedral) return;
  const tx = cathedral.x + Math.floor(cathedral.width / 2) - 6;
  const towerTop = cathedral.topY - 4 - 40;
  // Flag pole next to spire
  ctx.fillStyle = "#241a10";
  ctx.fillRect(tx + 11, towerTop - 16, 1, 8);
  // Flag (black)
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(tx + 12, towerTop - 16, 7, 4);
  // Skull
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(tx + 14, towerTop - 15, 3, 2);
  // Eye sockets
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(tx + 14, towerTop - 15, 1, 1);
  ctx.fillRect(tx + 16, towerTop - 15, 1, 1);
  // Crossbones (X)
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(tx + 13, towerTop - 13, 1, 1);
  ctx.fillRect(tx + 17, towerTop - 13, 1, 1);
}

function drawFireworksNYE(ctx: CanvasRenderingContext2D, frame: number) {
  const d = new Date();
  // NYE Dec 31 after 21:00 OR Jan 1 before 01:00
  const isNYE = (d.getMonth() === 11 && d.getDate() === 31 && d.getHours() >= 21) ||
                (d.getMonth() === 0 && d.getDate() === 1 && d.getHours() < 1);
  if (!isNYE) return;
  const colors = ["#ff4060", "#ffde3c", "#39ff14", "#00f5ff", "#b464ff"];
  for (let b = 0; b < 3; b++) {
    const burstCycle = 180;
    const burstSeed = Math.floor((frame + b * 60) / burstCycle);
    const burstPhase = (frame + b * 60) % burstCycle;
    if (burstPhase > 90) continue;
    const cx = ((burstSeed * 173 + b * 89) % (PIXEL_W - 80)) + 40;
    const cy = 30 + ((burstSeed * 41) % 50);
    const t = burstPhase / 90;
    const color = colors[(burstSeed + b) % colors.length];
    const r = t * 22;
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const px = cx + Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r + t * t * 6;
      const alpha = (1 - t);
      ctx.fillStyle = color.replace(")", `,${alpha.toFixed(2)})`).replace("#", "rgba(").replace(/^(rgba\()(.)(.)(.)(.)(.)(.)$/, "$1$2$3,$4$5,$6$7");
      // simpler: skip alpha mixing; use plain color
      ctx.fillStyle = color;
      if (alpha > 0.4) ctx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
    }
  }
}

function drawSelectedSpotlight(
  ctx: CanvasRenderingContext2D,
  selectedKey: string | null,
  hits: ShipHit[]
) {
  if (!selectedKey) return;
  // Only spotlight if selection came from a boat click (not a building click).
  if (!lastClickWasBoat) return;
  const hit = hits.find((h) => h.key === selectedKey);
  if (!hit) return;
  // Dim everything outside a circular spotlight around hit.
  const cx = hit.x + hit.w / 2;
  const cy = hit.y + hit.h / 2;
  const r = 60;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  // Draw dim layer with a circular hole.
  ctx.beginPath();
  ctx.rect(0, 0, PIXEL_W, PIXEL_H);
  ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
  ctx.fill("evenodd");
  // Glow ring around selected
  ctx.strokeStyle = "rgba(255,233,168,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ============================================================================
// R6 ADDITIONS: wildlife, buoys, debris, palazzo shimmer, vignette, more easter eggs
// ============================================================================

function drawBuoys(ctx: CanvasRenderingContext2D, frame: number) {
  const buoys = [
    { x: 24, y: ZONE.waterTop + 18, color: "#ff4060" },
    { x: PIXEL_W - 60, y: ZONE.waterTop + 22, color: "#39ff14" },
    { x: 320, y: ZONE.waterTop + 90, color: "#ffde3c" }
  ];
  for (const b of buoys) {
    const bob = Math.sin((frame + b.x) * 0.06) * 0.6;
    const y = b.y + bob;
    ctx.fillStyle = "#241a10";
    ctx.fillRect(b.x, Math.floor(y) + 2, 3, 2);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, Math.floor(y), 3, 2);
    const blink = (frame + b.x) % 60 < 30;
    if (blink) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(b.x + 1, Math.floor(y) - 1, 1, 1);
    }
  }
}

function drawDebris(ctx: CanvasRenderingContext2D, frame: number) {
  // Floating planks and kelp drifting slowly
  for (let i = 0; i < 6; i++) {
    const x = ((i * 113 + frame * 0.06) % (PIXEL_W + 30)) - 15;
    const y = ZONE.waterTop + 30 + (i * 23) % 80;
    if (i % 2 === 0) {
      // Plank
      ctx.fillStyle = "#5a3a1c";
      ctx.fillRect(Math.floor(x), y, 5, 1);
      ctx.fillStyle = "#3a2516";
      ctx.fillRect(Math.floor(x), y + 1, 5, 1);
    } else {
      // Kelp blob
      ctx.fillStyle = "#3a5a3a";
      ctx.fillRect(Math.floor(x), y, 2, 1);
      ctx.fillRect(Math.floor(x) + 1, y - 1, 1, 1);
    }
  }
}

function drawJellyfish(
  ctx: CanvasRenderingContext2D,
  frame: number,
  tod: TimeOfDay
) {
  if (tod !== "night" && tod !== "dusk") return;
  for (let i = 0; i < 4; i++) {
    const baseX = (i * 173 + frame * 0.15) % PIXEL_W;
    const y = ZONE.waterTop + 50 + (i * 19) % 50 + Math.sin(frame * 0.04 + i) * 3;
    const glowAlpha = 0.4 + Math.sin(frame * 0.08 + i) * 0.2;
    ctx.fillStyle = `rgba(180,100,255,${glowAlpha.toFixed(2)})`;
    ctx.fillRect(Math.floor(baseX), Math.floor(y), 4, 2);
    ctx.fillStyle = `rgba(180,100,255,${(glowAlpha * 0.5).toFixed(2)})`;
    ctx.fillRect(Math.floor(baseX), Math.floor(y) + 2, 1, 2);
    ctx.fillRect(Math.floor(baseX) + 2, Math.floor(y) + 2, 1, 2);
    ctx.fillRect(Math.floor(baseX) + 3, Math.floor(y) + 2, 1, 1);
  }
}

function drawFishJumps(ctx: CanvasRenderingContext2D, frame: number) {
  // Occasional fish leaping out of water with a small splash.
  const cycle = 200;
  for (let i = 0; i < 3; i++) {
    const phase = (frame + i * 70) % cycle;
    if (phase > 30) continue;
    const x = ((i * 211 + Math.floor(frame / cycle) * 127) % (PIXEL_W - 40)) + 20;
    const t = phase / 30;
    const arc = Math.sin(t * Math.PI) * 8;
    const y = ZONE.waterTop + 30 - arc;
    ctx.fillStyle = "#c9d4cc";
    ctx.fillRect(Math.floor(x), Math.floor(y), 2, 1);
    ctx.fillRect(Math.floor(x) - 1, Math.floor(y) + 1, 1, 1);
    if (t > 0.8) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(Math.floor(x), ZONE.waterTop + 30, 3, 1);
      ctx.fillRect(Math.floor(x) - 1, ZONE.waterTop + 31, 5, 1);
    }
  }
}

function drawDolphinPod(ctx: CanvasRenderingContext2D, frame: number) {
  // Pod of 3 dolphins arc-jumping in sequence at intervals.
  const cycle = 800;
  const phase = frame % cycle;
  if (phase > 180) return;
  const baseX = ((Math.floor(frame / cycle) * 191) % (PIXEL_W - 100)) + 30;
  for (let i = 0; i < 3; i++) {
    const t = (phase - i * 30) / 120;
    if (t <= 0 || t >= 1) continue;
    const arc = Math.sin(t * Math.PI) * 10;
    const x = baseX + i * 18 + t * 14;
    const y = ZONE.waterTop + 40 - arc;
    ctx.fillStyle = "#3a4a6a";
    ctx.fillRect(Math.floor(x), Math.floor(y), 5, 2);
    ctx.fillRect(Math.floor(x) + 5, Math.floor(y) - 1, 1, 1);
    // Belly
    ctx.fillStyle = "#cfd4d4";
    ctx.fillRect(Math.floor(x) + 1, Math.floor(y) + 1, 3, 1);
  }
}

function drawTreasureChest(ctx: CanvasRenderingContext2D, frame: number) {
  // Very rare hidden treasure chest near seabed.
  const seed = Math.floor(frame / 18000);
  if (seed % 7 !== 0) return;
  const x = 90;
  const y = PIXEL_H - 18;
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(x, y, 9, 5);
  ctx.fillStyle = "#a08038";
  ctx.fillRect(x, y, 9, 1);
  ctx.fillRect(x, y + 3, 9, 1);
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(x + 4, y + 2, 1, 1);
  // Sparkle
  if ((frame % 60) < 30) {
    ctx.fillStyle = "rgba(255,239,200,0.9)";
    ctx.fillRect(x + 8, y - 2, 1, 1);
  }
  scenicHits.push({
    key: "treasure",
    x: x - 1,
    y: y - 1,
    w: 11,
    h: 7,
    label: "Treasure",
    lines: ["sunken treasure", "X marks the spot"]
  });
}

function drawCrabs(ctx: CanvasRenderingContext2D, frame: number) {
  // Two crabs scuttling along TOP of seawall stone capstone.
  for (let i = 0; i < 2; i++) {
    const span = 80;
    const phase = (frame * 0.25 + i * 200) % (span * 2);
    const dx = phase < span ? phase : span * 2 - phase;
    const x = 60 + i * 280 + Math.floor(dx);
    const y = ZONE.seawallTop + 1; // sits on the stone top
    // Body
    ctx.fillStyle = "#c97a72";
    ctx.fillRect(x, y, 3, 1);
    // Legs (alternate)
    const legPhase = Math.floor(frame / 5) % 2;
    ctx.fillStyle = "#7a3a30";
    if (legPhase === 0) {
      ctx.fillRect(x - 1, y + 1, 1, 1);
      ctx.fillRect(x + 3, y + 1, 1, 1);
    } else {
      ctx.fillRect(x, y + 1, 1, 1);
      ctx.fillRect(x + 2, y + 1, 1, 1);
    }
    // Claws (tucked tight, no overshoot above)
    ctx.fillStyle = "#c97a72";
    ctx.fillRect(x - 1, y, 1, 1);
    ctx.fillRect(x + 3, y, 1, 1);
  }
}

function drawMoonShimmer(
  ctx: CanvasRenderingContext2D,
  sky: SkyPalette,
  frame: number
) {
  // Already handled in drawSunGlintLane via moon-mode. Add subtle silver lane below moon.
  if (sky.sunY < 140) return; // sun visible -> skip
  const cx = sky.sunX;
  // Already done in drawSunGlintLane; this adds extra shimmer dots scattered.
  for (let i = 0; i < 14; i++) {
    const x = cx + Math.sin((frame + i * 30) * 0.04) * 18;
    const y = ZONE.waterTop + 6 + (i * 7) % 90;
    if ((frame + i * 11) % 80 < 30) {
      ctx.fillStyle = "rgba(230,235,250,0.7)";
      ctx.fillRect(Math.floor(x), y, 1, 1);
    }
  }
}

function drawRainPuddles(
  ctx: CanvasRenderingContext2D,
  weather: import("./types").WeatherKind,
  _frame: number
) {
  if (weather !== "rain" && weather !== "storm") return;
  // Puddles on seawall (dark wet patches with lamp reflections).
  const puddles = [60, 200, 360, 480];
  for (const x of puddles) {
    const y = ZONE.seawallTop + ZONE.seawallHeight - 2;
    ctx.fillStyle = "rgba(40,80,120,0.45)";
    ctx.fillRect(x, y, 12, 1);
    ctx.fillRect(x + 1, y - 1, 10, 1);
    ctx.fillStyle = "rgba(255,222,60,0.25)";
    ctx.fillRect(x + 5, y, 2, 1);
  }
}

function drawUmbrellas(
  ctx: CanvasRenderingContext2D,
  weather: import("./types").WeatherKind,
  frame: number
) {
  if (weather !== "rain" && weather !== "storm") return;
  // Add 3 figures w/ umbrellas walking the seawall.
  for (let i = 0; i < 3; i++) {
    const span = PIXEL_W - 80;
    const phase = (frame * 0.15 + i * 200) % (span * 2);
    const dx = phase < span ? phase : span * 2 - phase;
    const x = 40 + Math.floor(dx);
    const y = ZONE.seawallTop;
    // Figure
    ctx.fillStyle = "#241a10";
    ctx.fillRect(x, y - 4, 2, 4);
    // Umbrella dome
    const colors = ["#e25c66", "#3a5a78", "#5fa371"];
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x - 2, y - 8, 6, 2);
    ctx.fillRect(x - 1, y - 9, 4, 1);
    // Handle
    ctx.fillStyle = "#241a10";
    ctx.fillRect(x + 1, y - 6, 1, 2);
  }
}

function drawSailorsUnloading(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number
) {
  // Pick 2 boat positions, draw sailor figure on seawall above each w/ crate stack.
  for (let i = 0; i < 2; i++) {
    const b = front[i * 2];
    if (!b) continue;
    const cx = b.x + Math.floor(b.width * 0.5);
    const y = ZONE.seawallTop;
    // Sailor
    const bob = Math.floor(frame / 12) % 2;
    ctx.fillStyle = "#3a5a78";
    ctx.fillRect(cx, y - 4 - bob, 2, 3);
    ctx.fillStyle = "#e2b692";
    ctx.fillRect(cx, y - 6 - bob, 2, 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(cx, y - 7 - bob, 2, 1);
    // Crate stack on seawall (3 crates)
    ctx.fillStyle = "#8a5a2c";
    ctx.fillRect(cx + 3, y - 3, 4, 3);
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(cx + 3, y - 3, 4, 1);
    ctx.fillStyle = "#8a5a2c";
    ctx.fillRect(cx + 4, y - 6, 3, 3);
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(cx + 4, y - 6, 3, 1);
  }
}

function drawHeatShimmerOnPalazzo(
  ctx: CanvasRenderingContext2D,
  running: number,
  frame: number
) {
  if (running < 3) return;
  const px = PIXEL_W - 92;
  const pw = 86;
  const py = 130;
  const ph = ZONE.seawallTop - py;
  // Wavy heat distortion overlay
  for (let dy = 0; dy < ph; dy++) {
    const wave = Math.sin((dy + frame * 0.2) * 0.5) * 1.5;
    const alpha = 0.05 * (running / 10);
    ctx.fillStyle = `rgba(255,200,150,${alpha.toFixed(3)})`;
    ctx.fillRect(px + wave, py + dy, pw, 1);
  }
}

function drawHolidayDecor(ctx: CanvasRenderingContext2D, frame: number) {
  const d = new Date();
  const m = d.getMonth();
  const day = d.getDate();
  // Christmas (December)
  if (m === 11) {
    // Snow particles
    for (let i = 0; i < 120; i++) {
      const x = (i * 47 + frame * 0.8) % PIXEL_W;
      const y = (i * 19 + frame * 1.4) % PIXEL_H;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillRect(x, y, 1, 1);
    }
    // Reindeer flying across sky once per cycle
    const phase = (frame * 0.6) % (PIXEL_W + 80);
    const rx = phase - 40;
    if (rx > -30 && rx < PIXEL_W + 20) {
      ctx.fillStyle = "#ff4060";
      ctx.fillRect(Math.floor(rx), 40, 1, 1);
      ctx.fillStyle = "#8a5a2c";
      ctx.fillRect(Math.floor(rx) + 1, 40, 4, 2);
      ctx.fillRect(Math.floor(rx) + 5, 39, 3, 1);
    }
  }
  // Halloween
  if (m === 9 && day === 31) {
    const ghostX = (frame * 0.5) % (PIXEL_W + 40) - 20;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillRect(Math.floor(ghostX), 100, 6, 6);
    ctx.fillStyle = "#241a10";
    ctx.fillRect(Math.floor(ghostX) + 1, 102, 1, 1);
    ctx.fillRect(Math.floor(ghostX) + 4, 102, 1, 1);
  }
}

function drawCRTOverlay(ctx: CanvasRenderingContext2D) {
  if (!crtMode) return;
  // Scanlines
  for (let y = 0; y < PIXEL_H; y += 2) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, y, PIXEL_W, 1);
  }
  // Slight tint
  ctx.fillStyle = "rgba(0,255,150,0.04)";
  ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
  // Curved corner mask (top-left + top-right + bottom-left + bottom-right)
  ctx.fillStyle = "#000";
  const cornerR = 14;
  for (let y = 0; y < cornerR; y++) {
    const x = cornerR - Math.floor(Math.sqrt(cornerR * cornerR - (cornerR - y) * (cornerR - y)));
    if (x <= 0) continue;
    ctx.fillRect(0, y, x, 1);
    ctx.fillRect(PIXEL_W - x, y, x, 1);
    ctx.fillRect(0, PIXEL_H - 1 - y, x, 1);
    ctx.fillRect(PIXEL_W - x, PIXEL_H - 1 - y, x, 1);
  }
  // CRT label
  ctx.font = "5px monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(57,255,20,0.5)";
  ctx.fillText("CRT", 6, PIXEL_H - 18);
}

function drawMiniMap(
  ctx: CanvasRenderingContext2D,
  buildings: Building[],
  hits: ShipHit[],
  containers: number
) {
  // Top-left mini-map overview (60x16).
  const mx = 6;
  const my = 18;
  const mw = 80;
  const mh = 14;
  ctx.fillStyle = "rgba(20,12,40,0.75)";
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = "rgba(255,233,168,0.6)";
  ctx.fillRect(mx, my, mw, 1);
  ctx.fillRect(mx, my + mh - 1, mw, 1);
  // Buildings = thin lines
  const front = buildings.filter((b) => !b.back);
  for (const b of front) {
    const fx = mx + Math.floor((b.x / PIXEL_W) * mw);
    const fw = Math.max(1, Math.floor((b.width / PIXEL_W) * mw));
    const fh = Math.max(2, Math.floor((b.height / 80) * 6));
    ctx.fillStyle = "rgba(234,210,179,0.7)";
    ctx.fillRect(fx, my + mh - 2 - fh, fw, fh);
  }
  // Palazzo
  ctx.fillStyle = "#a64a36";
  ctx.fillRect(mx + mw - 8, my + mh - 8, 6, 6);
  // Boats = colored dots
  for (const h of hits) {
    const bx = mx + Math.floor(((h.x + h.w / 2) / PIXEL_W) * mw);
    const by = my + mh - 2;
    ctx.fillStyle = "#39ff14";
    ctx.fillRect(bx, by, 1, 1);
  }
  // Counter
  ctx.font = "5px monospace";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#fffbe6";
  ctx.fillText(`map ${containers}c ${hits.length}b`, mx + 2, my + 2);
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  // Soft dark vignette around canvas edges for cinematic feel.
  const grad = ctx.createRadialGradient(
    PIXEL_W / 2, PIXEL_H / 2, PIXEL_W / 3,
    PIXEL_W / 2, PIXEL_H / 2, PIXEL_W / 1.4
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, PIXEL_W, PIXEL_H);
}

function drawRealisticReflection(
  ctx: CanvasRenderingContext2D,
  sky: SkyPalette,
  frame: number
) {
  const canvas = ctx.canvas;
  const cssScaleY = canvas.height / PIXEL_H;
  // Mirror line = water surface (ZONE.waterTop). Source rows above mirror,
  // destination rows below, 1:1 vertical flip.
  const mirrorY = ZONE.waterTop;
  const waterH = PIXEL_H - mirrorY;
  for (let d = 0; d < waterH; d++) {
    const srcYpixel = mirrorY - 1 - d;
    if (srcYpixel < 0) break;
    const destYpixel = mirrorY + d;
    const srcYcanvas = Math.floor(srcYpixel * cssScaleY);
    const srcHcanvas = Math.max(1, Math.ceil(cssScaleY));
    // Horizontal wobble + scanline breaks for water surface ripples.
    const wob = Math.sin((d + frame * 0.25) * 0.22) * 1.4
              + Math.sin((d + frame * 0.18) * 0.55) * 0.6;
    const fade = Math.max(0.1, 0.8 - (d / waterH) * 0.55);
    // Skip every 9th row only (less aggressive cutting → readable reflections).
    if ((d + (frame >> 1)) % 10 === 9) continue;
    ctx.globalAlpha = fade;
    ctx.drawImage(
      canvas,
      0,
      srcYcanvas,
      canvas.width,
      srcHcanvas,
      Math.round(wob),
      destYpixel,
      PIXEL_W,
      1
    );
  }
  ctx.globalAlpha = 1;
  // Lighter water-color tint so reflections (esp plaques) remain visible.
  const [wr, wg, wb] = parseColor(sky.waterDeep);
  ctx.fillStyle = `rgba(${wr},${wg},${wb},0.18)`;
  ctx.fillRect(0, mirrorY, PIXEL_W, waterH);
}

function drawSailAnims(ctx: CanvasRenderingContext2D) {
  const now = performance.now();
  for (let i = sailAnims.length - 1; i >= 0; i--) {
    if (now > sailAnims[i].startT + sailAnims[i].duration) {
      sailAnims.splice(i, 1);
    }
  }
  for (const a of sailAnims) {
    const t = Math.max(0, Math.min(1, (now - a.startT) / a.duration));
    const x = a.startX + (a.endX - a.startX) * t;
    const y = a.y + Math.sin(t * Math.PI * 4) * 0.6;
    // For sail-out: explosion at start, then smoke trail receding
    if (a.kind === "out" && t < 0.18) {
      // Boom!
      const ex = a.startX;
      const ey = a.y;
      const ringR = t * 30;
      ctx.strokeStyle = `rgba(255,150,40,${(1 - t * 5).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(ex, ey, ringR, 0, Math.PI * 2);
      ctx.stroke();
      // Flame particles
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * Math.PI * 2;
        const r = 3 + t * 18;
        ctx.fillStyle = k % 2 === 0 ? "#ff8c28" : "#ffde3c";
        ctx.fillRect(Math.floor(ex + Math.cos(ang) * r), Math.floor(ey + Math.sin(ang) * r), 1, 1);
      }
      continue;
    }
    ctx.fillStyle = a.hull;
    ctx.fillRect(Math.floor(x), Math.floor(y), 14, 3);
    ctx.fillStyle = darken(a.hull, 0.3);
    ctx.fillRect(Math.floor(x), Math.floor(y) + 2, 14, 1);
    ctx.fillStyle = "#cfd4d4";
    ctx.fillRect(Math.floor(x) + 4, Math.floor(y) - 2, 5, 2);
    ctx.fillStyle = "#241a10";
    ctx.fillRect(Math.floor(x) + 11, Math.floor(y) - 2, 1, 2);
    ctx.fillStyle = "rgba(218,218,228,0.6)";
    ctx.fillRect(Math.floor(x) + 11, Math.floor(y) - 4, 2, 1);
    const dir = a.kind === "in" ? -1 : 1;
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = `rgba(255,255,255,${(0.4 - k * 0.07).toFixed(2)})`;
      ctx.fillRect(Math.floor(x) + (dir > 0 ? 14 : -1) + dir * k * 3, Math.floor(y) + 1, 2, 1);
    }
    if (a.kind === "in" && t < 0.6) {
      ctx.fillStyle = "#39ff14";
      ctx.fillRect(Math.floor(x) + 6, Math.floor(y) - 6, 3, 2);
    }
  }
}

function drawTicker(ctx: CanvasRenderingContext2D, events: DockerEvent[]) {
  if (!events || events.length === 0) return;
  // Build a single scrolling line across bottom of canvas.
  const items = events
    .slice(0, 12)
    .map((e) => `${e.action} ${e.name || e.image || e.id.slice(0, 10)}`)
    .join("  •  ");
  if (!items) return;
  ctx.font = "5px monospace";
  ctx.textBaseline = "top";
  const fullText = `  •  ${items}  •  `;
  const tw = ctx.measureText(fullText).width;
  const speedPxPerSec = 24;
  const off = (performance.now() * 0.001 * speedPxPerSec) % tw;
  const y = PIXEL_H - 9;
  // BG strip
  ctx.fillStyle = "rgba(20,12,40,0.85)";
  ctx.fillRect(0, y - 1, PIXEL_W, 9);
  ctx.fillStyle = "rgba(255,222,60,0.6)";
  ctx.fillRect(0, y - 1, PIXEL_W, 1);
  // Render text twice for seamless wrap
  ctx.fillStyle = "#ffe9a8";
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y - 1, PIXEL_W, 9);
  ctx.clip();
  ctx.fillText(fullText, -off, y + 1);
  ctx.fillText(fullText, -off + tw, y + 1);
  ctx.restore();
}

function drawTanker(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, shipW: number,
  conn: Conn, selectedKey: string | null, frame: number, idx: number, anchored: boolean
): ShipHit {
  const wave = waveAt(cx, frame);
  const bob = anchored ? wave * 0.2 : wave * 0.7;
  const y = cy + bob;
  const x = cx - Math.floor(shipW / 2);
  // Low flat hull, long
  ctx.fillStyle = "#3a2c1c";
  ctx.fillRect(x, y, shipW, 4);
  ctx.fillStyle = "#241a10";
  ctx.fillRect(x, y + 3, shipW, 1);
  // Deck pipes
  ctx.fillStyle = "#5a4a3a";
  for (let i = 2; i < shipW - 4; i += 3) {
    ctx.fillRect(x + i, y - 1, 1, 1);
  }
  // Cabin at rear
  ctx.fillStyle = "#cfd4d4";
  ctx.fillRect(x + shipW - 8, y - 4, 6, 4);
  ctx.fillStyle = PALETTE.window;
  ctx.fillRect(x + shipW - 7, y - 3, 4, 2);
  // Mast
  ctx.fillStyle = "#241a10";
  ctx.fillRect(x + shipW - 5, y - 8, 1, 4);
  ctx.fillStyle = portFlagColor(conn.port);
  ctx.fillRect(x + shipW - 4, y - 8, 3, 2);
  if (connKey(conn) === selectedKey) {
    ctx.strokeStyle = "#ffe9a8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 9, shipW + 1, 14);
  }
  ctx.fillStyle = "#241a10";
  ctx.font = "5px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(String(conn.port), cx, y + 5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  void idx;
  return { key: connKey(conn), x: x - 1, y: y - 9, w: shipW + 1, h: 15, conn };
}

function drawSailboat(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, shipW: number,
  conn: Conn, selectedKey: string | null, frame: number, idx: number, anchored: boolean
): ShipHit {
  const wave = waveAt(cx, frame);
  const bob = anchored ? wave * 0.3 : wave * 1.0;
  const y = cy + bob;
  shipW = Math.min(28, shipW);
  const x = cx - Math.floor(shipW / 2);
  // Hull v-shape
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 2, y, shipW - 4, 1);
  ctx.fillStyle = "#3a5a78";
  ctx.fillRect(x + 3, y + 1, shipW - 6, 2);
  ctx.fillRect(x + 5, y + 3, shipW - 10, 1);
  // Mast
  const mastX = x + Math.floor(shipW / 2);
  ctx.fillStyle = "#241a10";
  ctx.fillRect(mastX, y - 16, 1, 16);
  // Main sail triangle
  ctx.fillStyle = "#ffffff";
  for (let dy = 0; dy < 14; dy++) {
    const span = 10 - Math.floor(dy * 0.6);
    if (span <= 0) break;
    ctx.fillRect(mastX + 1, y - 14 + dy, span, 1);
  }
  // Sail line shadow
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  for (let dy = 0; dy < 14; dy += 4) {
    ctx.fillRect(mastX + 1, y - 14 + dy, 8 - dy, 1);
  }
  // Jib (front sail)
  for (let dy = 0; dy < 8; dy++) {
    const span = 5 - Math.floor(dy * 0.5);
    if (span <= 0) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(mastX - 1 - span, y - 8 + dy, span, 1);
  }
  if (connKey(conn) === selectedKey) {
    ctx.strokeStyle = "#ffe9a8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 17, shipW + 1, 22);
  }
  ctx.fillStyle = "#241a10";
  ctx.font = "5px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(String(conn.port), cx, y + 5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  void idx;
  return { key: connKey(conn), x: x - 1, y: y - 17, w: shipW + 1, h: 22, conn };
}

function drawYacht(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, shipW: number,
  conn: Conn, selectedKey: string | null, frame: number, idx: number, anchored: boolean
): ShipHit {
  const wave = waveAt(cx, frame);
  const bob = anchored ? wave * 0.2 : wave * 0.8;
  const y = cy + bob;
  const x = cx - Math.floor(shipW / 2);
  // Sleek white hull
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(x + 2, y, shipW - 4, 2);
  ctx.fillRect(x + 1, y + 1, shipW - 2, 2);
  ctx.fillRect(x, y + 2, shipW, 1);
  // Cyan stripe
  ctx.fillStyle = "#00f5ff";
  ctx.fillRect(x + 2, y + 2, shipW - 4, 1);
  // Cabin (raked)
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(x + 4, y - 4, shipW - 10, 4);
  ctx.fillStyle = "#00d4ff";
  ctx.fillRect(x + 5, y - 3, shipW - 12, 3);
  // Bow rail
  ctx.fillStyle = "#241a10";
  ctx.fillRect(x + 2, y - 1, 1, 1);
  ctx.fillRect(x + shipW - 3, y - 1, 1, 1);
  // Antenna
  ctx.fillRect(x + Math.floor(shipW / 2), y - 9, 1, 5);
  ctx.fillStyle = portFlagColor(conn.port);
  ctx.fillRect(x + Math.floor(shipW / 2) + 1, y - 9, 2, 2);
  if (connKey(conn) === selectedKey) {
    ctx.strokeStyle = "#ffe9a8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 10, shipW + 1, 14);
  }
  ctx.fillStyle = "#241a10";
  ctx.font = "5px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(String(conn.port), cx, y + 4);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  void idx;
  return { key: connKey(conn), x: x - 1, y: y - 10, w: shipW + 1, h: 14, conn };
}

function drawBoatWakes(
  ctx: CanvasRenderingContext2D,
  boatPositions: { cx: number; cy: number; active: boolean }[]
) {
  for (const b of boatPositions) {
    if (!b.active) continue;
    const cx = b.cx;
    const cy = b.cy + 4;
    const rx = 16;
    const ry = 5;
    for (let dx = -rx; dx <= rx; dx++) {
      for (let dy = -ry; dy <= ry; dy++) {
        const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
        if (d > 1) continue;
        const a = (1 - d) * 0.22;
        if (a < 0.05) continue;
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
        ctx.fillRect(cx + dx, cy + dy, 1, 1);
      }
    }
    for (let i = 0; i < 6; i++) {
      const tx = cx - 14 - i * 3;
      if (tx < 0) break;
      const off = i + 1;
      ctx.fillStyle = `rgba(255,255,255,${(0.4 - i * 0.05).toFixed(2)})`;
      ctx.fillRect(tx, cy - off, 2, 1);
      ctx.fillRect(tx, cy + off, 2, 1);
    }
  }
}

// Wave field: sum of 3 sines. Used both for visual waves and ship bob.
export function waveAt(x: number, frame: number): number {
  return (
    Math.sin(x * 0.045 + frame * 0.06) * 3.0 +
    Math.sin(x * 0.11 - frame * 0.04) * 1.8 +
    Math.sin(x * 0.19 + frame * 0.09) * 0.8
  );
}

function drawWaterAndReflection(
  ctx: CanvasRenderingContext2D,
  front: Building[],
  frame: number,
  sky: SkyPalette,
  _tod: TimeOfDay
) {
  const waterBottom = PIXEL_H;
  const waterH = waterBottom - ZONE.waterTop;

  const grad = ctx.createLinearGradient(0, ZONE.waterTop, 0, waterBottom);
  grad.addColorStop(0, sky.waterShallow);
  grad.addColorStop(0.4, sky.waterMid);
  grad.addColorStop(1, sky.waterDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(0, ZONE.waterTop, PIXEL_W, waterH);

  // SUN GLINT LANE: vertical column of bright shimmer beneath the sun.
  drawSunGlintLane(ctx, sky, frame, waterH);

  // Realistic reflection: mirror the actual rendered canvas region into water.
  drawRealisticReflection(ctx, sky, frame);

  // Sparse short ripples scattered through the water column.
  // Each ripple = a 6-14px wide horizontal squiggle with a subtle highlight.
  const ripples = 70;
  for (let i = 0; i < ripples; i++) {
    // Deterministic per-i position, drifting over time.
    const baseX = (i * 47 + frame * 0.25 + (i % 7) * 11) % PIXEL_W;
    const baseY = ZONE.waterTop + 4 + ((i * 19) % (waterH - 8));
    // Skip if directly under reflected building density (purely aesthetic)
    const len = 4 + (i % 7);
    const tilt = ((i + frame / 30) | 0) % 2 === 0 ? 0 : 1;
    // Body
    const dist = (baseY - ZONE.waterTop) / waterH; // 0 near top, 1 deep
    const alpha = 0.35 - dist * 0.18;
    ctx.fillStyle = `rgba(220,236,243,${alpha.toFixed(2)})`;
    for (let dx = 0; dx < len; dx++) {
      const px = Math.floor(baseX + dx);
      if (px >= PIXEL_W) break;
      ctx.fillRect(px, baseY + (dx === Math.floor(len / 2) ? tilt : 0), 1, 1);
    }
    // Highlight pixel at center
    if (i % 4 === 0 && baseY < ZONE.waterTop + 30) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(Math.floor(baseX + len / 2), baseY - 1, 1, 1);
    }
  }

  // Smooth foam line right at seawall base (continuous, soft).
  for (let x = 0; x < PIXEL_W; x++) {
    const fw = Math.sin(x * 0.18 + frame * 0.1) * 0.5 + 0.5;
    if (fw > 0.55) {
      ctx.fillStyle = `rgba(255,255,255,${(0.6 * fw).toFixed(2)})`;
      ctx.fillRect(x, ZONE.waterTop, 1, 1);
    }
    if (fw > 0.85 && (x + frame) % 11 === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillRect(x, ZONE.waterTop - 1, 1, 1);
    }
  }

  // Seawall froth: heavier, splashing.
  for (let x = 0; x < PIXEL_W; x++) {
    const ph = (x + frame * 0.6) * 0.18;
    const splash = Math.sin(ph) * Math.sin(ph * 0.5);
    const intensity = splash > 0.4 ? 1 : splash > 0 ? 0.5 : 0;
    if (intensity === 0) continue;
    ctx.fillStyle = `rgba(255,255,255,${(0.55 * intensity).toFixed(2)})`;
    ctx.fillRect(x, ZONE.waterTop, 1, 1);
    // Occasional splash droplets up onto seawall
    if (intensity === 1 && (x + frame) % 7 === 0) {
      ctx.fillRect(x, ZONE.waterTop - 1, 1, 1);
    }
  }

  // Sun glints in deeper water
  for (let i = 0; i < 40; i++) {
    const baseX = (i * 71 + frame * 0.5) % PIXEL_W;
    const baseY = ZONE.waterTop + 14 + (i * 19) % (waterH - 14);
    const phase = (frame + i * 7) % 260;
    if (phase < 90) {
      ctx.fillStyle = "rgba(255,239,200,0.5)";
      ctx.fillRect(baseX, baseY, 2, 1);
    }
  }
}

function drawBoats(
  ctx: CanvasRenderingContext2D,
  buildings: Building[],
  listen: Conn[],
  estab: Map<number, number>,
  selectedKey: string | null,
  frame: number
): ShipHit[] {
  const maxBoats = Math.min(6, buildings.length);
  if (maxBoats === 0) return [];
  const top = buildings.slice(0, maxBoats);
  const rowYs = [ZONE.waterTop + 16, ZONE.waterTop + 38];
  const usableX = PIXEL_W - 110;
  const slotW = usableX / maxBoats;

  // Precompute positions + draw wakes BEFORE hulls so wakes sit under boats.
  const positions: { cx: number; cy: number; active: boolean }[] = [];
  for (let i = 0; i < maxBoats; i++) {
    const b = top[i];
    const conn = b.ports[0];
    if (!conn) continue;
    const traffic = estab.get(conn.port) ?? 0;
    const cx = Math.floor(8 + slotW * (i + 0.5));
    const cy = rowYs[i % 2];
    positions.push({ cx, cy, active: traffic > 0 });
  }
  drawBoatWakes(ctx, positions);

  const hits: ShipHit[] = [];
  for (let i = 0; i < maxBoats; i++) {
    const b = top[i];
    const conn = b.ports[0];
    if (!conn) continue;
    const traffic = estab.get(conn.port) ?? 0;
    const shipW = Math.min(38, 28 + Math.min(traffic, 4) * 2);
    // Slow x-drift around base slot. Active boats drift more.
    const driftAmp = traffic > 0 ? 10 : 3;
    const drift = Math.sin((frame + i * 47) * 0.01) * driftAmp;
    const cx = Math.floor(8 + slotW * (i + 0.5) + drift);
    const cy = rowYs[i % 2];
    const anchored = traffic === 0;
    const hit = drawFishingBoat(ctx, cx, cy, shipW, conn, listen, selectedKey, frame, i, anchored);
    hits.push(hit);
  }
  return hits;
}

type BoatType = "trawler" | "sailboat" | "yacht" | "tanker";

function boatTypeFor(port: number): BoatType {
  if (port < 1024) return "tanker";
  if (port < 5000) return "trawler";
  if (port < 49152) return "sailboat";
  return "yacht";
}

function drawFishingBoat(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  shipW: number,
  conn: Conn,
  _listen: Conn[],
  selectedKey: string | null,
  frame: number,
  idx: number,
  anchored: boolean
): ShipHit {
  const btype = boatTypeFor(conn.port);
  if (btype === "tanker") return drawTanker(ctx, cx, cy, shipW + 6, conn, selectedKey, frame, idx, anchored);
  if (btype === "sailboat") return drawSailboat(ctx, cx, cy, shipW, conn, selectedKey, frame, idx, anchored);
  if (btype === "yacht") return drawYacht(ctx, cx, cy, shipW, conn, selectedKey, frame, idx, anchored);
  // trawler = original
  // Boats ride the wave at their position. Anchored boats only sway gently.
  const wave = waveAt(cx, frame);
  const bob = anchored ? wave * 0.25 : wave * 0.85;
  const y = cy + bob;
  const tilt = anchored ? 0 : Math.sign(wave) * (Math.abs(wave) > 1.6 ? 1 : 0);
  shipW = Math.max(shipW, 30);
  const x = cx - Math.floor(shipW / 2);
  const hullH = 7;
  const palette = [PALETTE.hullBlue, PALETTE.hullRed, PALETTE.hullGreen];
  const hullColor = palette[idx % palette.length];
  const selected = connKey(conn) === selectedKey;

  // Hull silhouette: pointed bow on left, slight stern slope on right
  ctx.fillStyle = hullColor;
  ctx.fillRect(x + 4, y, shipW - 6, hullH - 1);
  ctx.fillRect(x + 2, y + 1, shipW - 4, hullH - 2);
  ctx.fillRect(x + 1, y + 2, shipW - 2, hullH - 3);
  ctx.fillRect(x, y + 3, shipW - 1, hullH - 4);
  // Hull waterline stripe
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 4, y + 2, shipW - 8, 1);
  // Dark hull bottom
  ctx.fillStyle = darken(hullColor, 0.4);
  ctx.fillRect(x + 2, y + hullH - 2, shipW - 4, 1);
  // Bumpers (tires)
  ctx.fillStyle = "#1a1410";
  for (let i = 0; i < 3; i++) {
    const bx = x + 6 + i * Math.floor((shipW - 12) / 3);
    ctx.fillRect(bx, y + 3, 2, 2);
  }
  // Deck
  ctx.fillStyle = PALETTE.hullDeck;
  ctx.fillRect(x + 5, y - 1, shipW - 10, 1);
  // Cabin (multi-level: pilot house tall, sleeping bay shorter)
  const cabinW = Math.max(10, Math.floor(shipW * 0.45));
  const cabinX = x + Math.floor(shipW * 0.45) - Math.floor(cabinW * 0.3);
  ctx.fillStyle = PALETTE.hullCabin;
  ctx.fillRect(cabinX, y - 5, cabinW, 4);
  ctx.fillStyle = darken(PALETTE.hullCabin, 0.15);
  ctx.fillRect(cabinX, y - 5, 1, 4);
  // Cabin windows
  ctx.fillStyle = PALETTE.window;
  for (let w = 1; w < cabinW - 1; w += 3) {
    ctx.fillRect(cabinX + w, y - 4, 2, 2);
  }
  // Pilot house (taller box)
  const pilotW = Math.max(4, Math.floor(cabinW * 0.4));
  const pilotX = cabinX + Math.floor(cabinW * 0.55);
  ctx.fillStyle = PALETTE.hullCabin;
  ctx.fillRect(pilotX, y - 9, pilotW, 4);
  ctx.fillStyle = PALETTE.window;
  ctx.fillRect(pilotX + 1, y - 8, pilotW - 2, 2);
  // Cabin trim
  ctx.fillStyle = hullColor;
  ctx.fillRect(cabinX - 1, y - 6, cabinW + 2, 1);
  ctx.fillRect(pilotX - 1, y - 10, pilotW + 2, 1);
  // Mast + rigging
  const mastX = pilotX + Math.floor(pilotW / 2);
  ctx.fillStyle = PALETTE.mast;
  ctx.fillRect(mastX, y - 16, 1, 7);
  // Rigging lines
  ctx.strokeStyle = "rgba(36,26,16,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mastX, y - 14);
  ctx.lineTo(x + 6, y - 2);
  ctx.moveTo(mastX, y - 14);
  ctx.lineTo(x + shipW - 4, y - 2);
  ctx.stroke();
  // Flag (pennant flaps in wind). Boats 0 and 3 fly Kurdistan flag.
  const flapPhase = Math.sin(frame * 0.15 + cx) * 0.5 + 0.5;
  const flagWidth = 3 + Math.round(flapPhase * 2);
  const isKurdish = idx === 0 || idx === 3;
  if (isKurdish) {
    // 3-stripe Kurdish flag (red/white/green) + tiny yellow sun
    ctx.fillStyle = "#e25c66";
    ctx.fillRect(mastX + 1, y - 16, flagWidth, 1);
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(mastX + 1, y - 15, flagWidth, 1);
    ctx.fillStyle = "#5fa371";
    ctx.fillRect(mastX + 1, y - 14, flagWidth, 1);
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(mastX + 1 + Math.floor(flagWidth / 2), y - 15, 1, 1);
  } else {
    ctx.fillStyle = portFlagColor(conn.port);
    ctx.fillRect(mastX + 1, y - 16, flagWidth, 2);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(mastX + flagWidth, y - 15, 1, 1);
  }
  // Boat name (short) painted on hull side
  const boatName = conn.process.slice(0, 6).toUpperCase();
  drawPixelText(ctx, boatName, x + 4, y + hullH - 2, "rgba(255,255,255,0.4)");
  // Mast lantern lit at night/dusk
  if (currentTod === "night" || currentTod === "dusk" || currentTod === "dawn") {
    ctx.fillStyle = "#ffde3c";
    ctx.fillRect(mastX, y - 11, 1, 1);
    ctx.fillStyle = "rgba(255,222,60,0.3)";
    ctx.fillRect(mastX - 1, y - 12, 3, 3);
  }
  // Selection ring
  if (selected) {
    ctx.strokeStyle = "#ffe9a8";
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 17, shipW + 1, hullH + 18);
  }
  // Rope from stern to seawall bollard
  ctx.strokeStyle = PALETTE.ropeColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + shipW - 2, y + 2);
  ctx.lineTo(x + shipW + 6, ZONE.seawallTop + 3);
  ctx.stroke();
  // Bollard
  ctx.fillStyle = "#241a10";
  ctx.fillRect(x + shipW + 5, ZONE.seawallTop, 2, 3);
  // Port number label
  ctx.fillStyle = "#241a10";
  ctx.font = "5px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(String(conn.port), cx, y + hullH + 1);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  return {
    key: connKey(conn),
    x: x - 1,
    y: y - 17,
    w: shipW + 2,
    h: hullH + 18,
    conn
  };
}

function portFlagColor(port: number): string {
  if (port < 1024) return "#e25c66";
  if (port < 49152) return "#e8c25a";
  return "#5fa371";
}

function drawWorkersOnSeawall(ctx: CanvasRenderingContext2D, frame: number, buildings: number) {
  const count = Math.min(6, Math.max(2, Math.floor(buildings / 3)));
  for (let i = 0; i < count; i++) {
    const speed = 0.2 + (i % 3) * 0.1; // slower for hover
    const span = PIXEL_W - 40;
    const phase = (frame * speed + i * 100) % (span * 2);
    const dx = phase < span ? phase : span * 2 - phase;
    const x = 20 + Math.floor(dx);
    const y = ZONE.seawallTop;
    drawWorker(ctx, x, y, frame, i);
  }
  // Stationary fishermen at fixed spots, casting lines into water.
  const fishermenAt = [70, 240, 380];
  for (let i = 0; i < fishermenAt.length; i++) {
    drawFisherman(ctx, fishermenAt[i], ZONE.seawallTop, frame, i);
  }
}

function drawFisherman(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
  idx: number
) {
  const cast = Math.floor(frame / 60) % 2; // periodic cast cycle
  // Legs
  ctx.fillStyle = "#1a1410";
  ctx.fillRect(x, y - 1, 1, 2);
  ctx.fillRect(x + 1, y - 1, 1, 2);
  // Body
  ctx.fillStyle = idx === 0 ? "#3a5a78" : idx === 1 ? "#5a3a3a" : "#3a4a3a";
  ctx.fillRect(x, y - 5, 2, 3);
  // Head
  ctx.fillStyle = "#e2b692";
  ctx.fillRect(x, y - 7, 2, 2);
  // Hat (wide-brim)
  ctx.fillStyle = "#8a5a2c";
  ctx.fillRect(x - 1, y - 8, 4, 1);
  ctx.fillRect(x, y - 9, 2, 1);
  // Rod
  ctx.fillStyle = "#3a2516";
  const rodAngle = cast === 0 ? -1 : 1;
  for (let r = 1; r <= 6; r++) {
    ctx.fillRect(x + 2 + r, y - 6 + r * rodAngle, 1, 1);
  }
  // Line going down to water
  const rodTipX = x + 8;
  const rodTipY = y - 6 + 6 * rodAngle;
  ctx.strokeStyle = "rgba(36,26,16,0.7)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rodTipX, rodTipY);
  // Sway the line tip with wave
  const tipX = rodTipX + 2 + Math.sin(frame * 0.05 + idx) * 1;
  ctx.lineTo(tipX, ZONE.waterTop + 6);
  ctx.stroke();
  // Bobber on water surface
  ctx.fillStyle = "#e25c66";
  ctx.fillRect(Math.floor(tipX), ZONE.waterTop + 6, 1, 1);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.floor(tipX), ZONE.waterTop + 7, 1, 1);
  // Hit
  scenicHits.push({
    key: `fisherman_${idx}`,
    x: x - 2,
    y: y - 10,
    w: 8,
    h: 11,
    label: "Fisherman",
    lines: ["a patient fisherman", "waiting for nibbles", "rod creaks softly"]
  });
}

function drawWorker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  frame: number,
  idx: number
) {
  const bob = Math.floor(frame / 5) % 2;
  // Legs
  ctx.fillStyle = "#241a10";
  if (bob === 0) {
    ctx.fillRect(x, y - 1, 1, 2);
    ctx.fillRect(x + 1, y - 2, 1, 1);
  } else {
    ctx.fillRect(x, y - 2, 1, 1);
    ctx.fillRect(x + 1, y - 1, 1, 2);
  }
  // Body shirt
  const shirts = [PALETTE.workerShirt, PALETTE.workerRed, PALETTE.workerYellow];
  ctx.fillStyle = shirts[idx % shirts.length];
  ctx.fillRect(x, y - 5 - bob, 2, 3);
  // Head
  ctx.fillStyle = PALETTE.workerSkin;
  ctx.fillRect(x, y - 7 - bob, 2, 2);
  // Hat
  ctx.fillStyle = idx % 2 === 0 ? PALETTE.workerRed : PALETTE.workerYellow;
  ctx.fillRect(x - 1, y - 8 - bob, 4, 1);
  // Box carry
  if (idx % 2 === 1) {
    ctx.fillStyle = "#8a5a2c";
    ctx.fillRect(x + 2, y - 4 - bob, 3, 3);
    ctx.fillStyle = "#3a2516";
    ctx.fillRect(x + 2, y - 4 - bob, 3, 1);
  }
}

function drawSeagulls(ctx: CanvasRenderingContext2D, frame: number) {
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 5; i++) {
    const baseX = 80 + i * 90;
    const baseY = 50 + (i * 23) % 40;
    const x = (baseX + frame * (0.4 + (i % 3) * 0.1)) % PIXEL_W;
    const flap = Math.floor(frame / 8 + i) % 2;
    if (flap === 0) {
      ctx.fillRect(x, baseY, 1, 1);
      ctx.fillRect(x + 1, baseY - 1, 1, 1);
      ctx.fillRect(x + 2, baseY, 1, 1);
    } else {
      ctx.fillRect(x, baseY + 1, 1, 1);
      ctx.fillRect(x + 1, baseY, 1, 1);
      ctx.fillRect(x + 2, baseY + 1, 1, 1);
    }
  }
}

function drawImagesOnHorizon(
  ctx: CanvasRenderingContext2D,
  images: DockerImage[],
  frame: number
) {
  // Far horizon ships: tiny silhouettes hugging the seawall edge for distance.
  // Limit to top 4 by size + render very small + slow drift.
  if (images.length === 0) return;
  const horizonY = ZONE.waterTop + 1;
  const top = images.slice(0, 4);
  for (let i = 0; i < top.length; i++) {
    const drift = ((frame * 0.08 + i * 160) % (PIXEL_W + 60)) - 30;
    const x = Math.floor(drift);
    if (x < -10 || x > PIXEL_W) continue;
    const size = imageSizeBucket(top[i].size_bytes);
    const w = 5 + size; // 5–9px wide max
    // Tiny dark silhouette
    ctx.fillStyle = "rgba(36,40,56,0.7)";
    ctx.fillRect(x, horizonY, w, 1);
    ctx.fillStyle = "rgba(36,40,56,0.55)";
    ctx.fillRect(x + Math.floor(w / 3), horizonY - 1, Math.max(2, Math.floor(w / 3)), 1);
  }
}

function imageSizeBucket(bytes: number): number {
  if (bytes <= 0) return 1;
  if (bytes < 50 * 1024 * 1024) return 1;
  if (bytes < 250 * 1024 * 1024) return 2;
  if (bytes < 1024 * 1024 * 1024) return 3;
  return 4;
}

function drawScenicTooltip(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  hit: ScenicHit
) {
  const lines = hit.lines;
  ctx.font = "5px monospace";
  ctx.textBaseline = "top";
  const w = Math.max(...lines.map((l) => Math.ceil(ctx.measureText(l).width))) + 8;
  const h = lines.length * 7 + 6;
  let x = Math.floor(px) + 6;
  let y = Math.floor(py) - h - 4;
  if (x + w > PIXEL_W - 2) x = Math.floor(px) - w - 6;
  if (y < 2) y = Math.floor(py) + 8;
  ctx.fillStyle = "rgba(36,26,16,0.9)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#e25c66";
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = "#ffde3c";
  ctx.fillRect(x + 2, y + 2, 3, 1);
  ctx.fillStyle = "#fffbe6";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + 7, y + 3 + i * 7);
  }
}

function drawTooltip(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  conn: Conn
) {
  const lines = [
    `port ${conn.port}${conn.service ? "  " + conn.service : ""}`,
    `${conn.proto}${conn.ipv6 ? "6" : ""}  ${conn.state}`,
    `${conn.process}${conn.pid != null ? "  pid " + conn.pid : ""}`,
    `${conn.local}`
  ];
  ctx.font = "5px monospace";
  ctx.textBaseline = "top";
  const w = Math.max(
    ...lines.map((l) => Math.ceil(ctx.measureText(l).width))
  ) + 8;
  const h = lines.length * 7 + 6;
  let x = Math.floor(px) + 6;
  let y = Math.floor(py) - h - 4;
  if (x + w > PIXEL_W - 2) x = Math.floor(px) - w - 6;
  if (y < 2) y = Math.floor(py) + 8;
  ctx.fillStyle = "rgba(36,26,16,0.85)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ffe9a8";
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = "#fffbe6";
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + 4, y + 3 + i * 7);
  }
}

function drawBubbles(ctx: CanvasRenderingContext2D, bubbles: ActiveBubble[]) {
  if (bubbles.length === 0) return;
  const b = bubbles[bubbles.length - 1];
  const ttl = Math.max(0, (b.expires - performance.now()) / 2400);
  if (ttl <= 0) return;
  const alpha = ttl < 0.2 ? ttl * 5 : ttl > 0.8 ? (1 - ttl) * 5 : 1;
  ctx.font = "6px monospace";
  ctx.textBaseline = "top";
  const text = b.text;
  const tw = Math.min(PIXEL_W - 220, ctx.measureText(text).width + 18);
  const x = Math.floor((PIXEL_W - tw) / 2);
  const y = 22;
  ctx.fillStyle = `rgba(36,26,16,${(0.82 * alpha).toFixed(2)})`;
  ctx.fillRect(x, y, tw, 11);
  ctx.fillStyle = b.color;
  ctx.fillRect(x, y, 3, 11);
  ctx.fillStyle = `rgba(255,233,168,${(0.9 * alpha).toFixed(2)})`;
  ctx.fillRect(x, y, tw, 1);
  ctx.fillRect(x, y + 10, tw, 1);
  ctx.fillStyle = `rgba(255,251,230,${alpha.toFixed(2)})`;
  ctx.fillText(text, x + 7, y + 3);
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  listen: number,
  estab: number,
  containers: number
) {
  ctx.fillStyle = "rgba(36,26,16,0.55)";
  ctx.fillRect(4, 4, 200, 12);
  ctx.fillStyle = "#fffbe6";
  ctx.font = "6px monospace";
  ctx.textBaseline = "top";
  ctx.fillText(
    `Port Harbour  listen=${listen}  estab=${estab}  containers=${containers}`,
    8,
    7
  );
}

function darken(hex: string, amt: number): string {
  return mixColor(hex, "#000000", amt);
}

function lighten(hex: string, amt: number): string {
  return mixColor(hex, "#ffffff", amt);
}

function desat(hex: string, amt: number): string {
  const [r, g, b] = parseHex(hex);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const nr = Math.round(r * (1 - amt) + lum * amt);
  const ng = Math.round(g * (1 - amt) + lum * amt);
  const nb = Math.round(b * (1 - amt) + lum * amt);
  return mixColor(`rgb(${nr},${ng},${nb})`, "#cdeaff", amt * 0.45);
}

function mixColor(a: string, b: string, t: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  const r = Math.round(pa[0] * (1 - t) + pb[0] * t);
  const g = Math.round(pa[1] * (1 - t) + pb[1] * t);
  const bl = Math.round(pa[2] * (1 - t) + pb[2] * t);
  return `rgb(${r},${g},${bl})`;
}

function parseColor(c: string): [number, number, number] {
  if (c.startsWith("#")) return parseHex(c);
  const m = c.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [0, 0, 0];
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

function actionColor(action: string): string {
  switch (action) {
    case "start":
    case "create":
      return "#5fa371";
    case "die":
    case "stop":
    case "kill":
      return "#c97a72";
    case "pause":
      return "#e8c25a";
    case "pull":
      return "#7ec5d8";
    default:
      return "#9b8fc4";
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}
