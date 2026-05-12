// Spawns `docker` CLI safely via execFile/spawn (no shell, no injection risk).
// Inputs to docker subprocess are static; we never interpolate user-controlled
// strings into argv.

import { spawn, ChildProcess, execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DockerPortMap {
  host_ip: string;
  host_port: number | null;
  container_port: number;
  proto: string;
}

export interface DockerContainerInfo {
  id: string;
  image: string;
  name: string;
  state:
    | "running"
    | "exited"
    | "paused"
    | "created"
    | "restarting"
    | "removing"
    | "dead"
    | string;
  status: string;
  ports: DockerPortMap[];
  created: string;
  size_bytes: number;
  virtual_bytes: number;
}

export interface DockerImageInfo {
  id: string;
  repository: string;
  tag: string;
  size: string;
  size_bytes: number;
  created: string;
}

export interface DockerEventInfo {
  type: string;
  action: string;
  id: string;
  name?: string;
  image?: string;
  time: number;
}

export interface DockerSnapshot {
  available: boolean;
  containers: DockerContainerInfo[];
  images: DockerImageInfo[];
  scan_ms: number;
}

export type DockerListener =
  | { type: "snapshot"; data: DockerSnapshot }
  | { type: "event"; data: DockerEventInfo };

export class DockerScanner {
  private interval: NodeJS.Timeout | undefined;
  private eventsChild: ChildProcess | undefined;
  private eventBuf = "";
  private listener: (msg: DockerListener) => void;
  private intervalMs: number;
  private disposed = false;

  constructor(listener: (msg: DockerListener) => void, intervalMs = 3000) {
    this.listener = listener;
    this.intervalMs = intervalMs;
  }

  start() {
    this.tick();
    this.interval = setInterval(() => this.tick(), this.intervalMs);
    this.startEventsStream();
  }

  dispose() {
    this.disposed = true;
    if (this.interval) clearInterval(this.interval);
    this.interval = undefined;
    if (this.eventsChild) {
      try {
        this.eventsChild.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      this.eventsChild = undefined;
    }
  }

  private async tick() {
    if (this.disposed) return;
    const started = Date.now();
    try {
      const [containers, images] = await Promise.all([
        listContainers(),
        listImages()
      ]);
      this.listener({
        type: "snapshot",
        data: {
          available: true,
          containers,
          images,
          scan_ms: Date.now() - started
        }
      });
    } catch {
      this.listener({
        type: "snapshot",
        data: {
          available: false,
          containers: [],
          images: [],
          scan_ms: Date.now() - started
        }
      });
    }
  }

  private startEventsStream() {
    try {
      this.eventsChild = spawn(
        "docker",
        ["events", "--format", "{{json .}}", "--filter", "type=container"],
        { stdio: ["ignore", "pipe", "pipe"] }
      );
    } catch {
      return;
    }
    this.eventsChild.stdout?.on("data", (chunk: Buffer) => {
      this.eventBuf += chunk.toString("utf8");
      let nl;
      while ((nl = this.eventBuf.indexOf("\n")) >= 0) {
        const line = this.eventBuf.slice(0, nl).trim();
        this.eventBuf = this.eventBuf.slice(nl + 1);
        if (!line) continue;
        try {
          const raw = JSON.parse(line);
          const evt: DockerEventInfo = {
            type: raw.Type ?? "container",
            action: raw.Action ?? "",
            id: raw.id ?? raw.Actor?.ID ?? "",
            name: raw.Actor?.Attributes?.name,
            image: raw.Actor?.Attributes?.image ?? raw.from,
            time: typeof raw.time === "number" ? raw.time : Date.now() / 1000
          };
          this.listener({ type: "event", data: evt });
        } catch {
          /* skip malformed line */
        }
      }
    });
    this.eventsChild.on("exit", () => {
      this.eventsChild = undefined;
    });
    this.eventsChild.on("error", () => {
      this.eventsChild = undefined;
    });
  }
}

async function listContainers(): Promise<DockerContainerInfo[]> {
  const { stdout } = await execFileAsync(
    "docker",
    ["ps", "-as", "--no-trunc", "--format", "{{json .}}"],
    { maxBuffer: 8 * 1024 * 1024 }
  );
  const out: DockerContainerInfo[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const raw = JSON.parse(t);
      const sizeField: string = raw.Size ?? "";
      const { size_bytes, virtual_bytes } = parseSizeField(sizeField);
      out.push({
        id: shortId(raw.ID ?? ""),
        image: raw.Image ?? "",
        name: raw.Names ?? raw.Name ?? "",
        state: (raw.State ?? raw.Status ?? "").toLowerCase().split(" ")[0],
        status: raw.Status ?? "",
        ports: parsePorts(raw.Ports ?? ""),
        created: raw.CreatedAt ?? raw.Created ?? "",
        size_bytes,
        virtual_bytes
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

async function listImages(): Promise<DockerImageInfo[]> {
  const { stdout } = await execFileAsync(
    "docker",
    ["images", "--no-trunc", "--format", "{{json .}}"],
    { maxBuffer: 8 * 1024 * 1024 }
  );
  const out: DockerImageInfo[] = [];
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const raw = JSON.parse(t);
      const sizeStr: string = raw.Size ?? raw.VirtualSize ?? "";
      out.push({
        id: shortId(raw.ID ?? ""),
        repository: raw.Repository ?? "<none>",
        tag: raw.Tag ?? "<none>",
        size: sizeStr,
        size_bytes: parseHumanSize(sizeStr),
        created: raw.CreatedAt ?? raw.CreatedSince ?? ""
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

function parseSizeField(s: string): { size_bytes: number; virtual_bytes: number } {
  // Format: "32MB (virtual 1.2GB)" or "0B"
  if (!s) return { size_bytes: 0, virtual_bytes: 0 };
  const m = /^([\d.]+\s?[kKmMgGtT]?[bB])(?:\s*\(virtual\s+([\d.]+\s?[kKmMgGtT]?[bB])\))?/.exec(s);
  if (!m) return { size_bytes: 0, virtual_bytes: 0 };
  return {
    size_bytes: parseHumanSize(m[1] ?? ""),
    virtual_bytes: parseHumanSize(m[2] ?? m[1] ?? "")
  };
}

function parseHumanSize(s: string): number {
  if (!s) return 0;
  const m = /^([\d.]+)\s?([kKmMgGtT]?)[bB]?$/.exec(s.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  const mul =
    unit === "k" ? 1024 :
    unit === "m" ? 1024 * 1024 :
    unit === "g" ? 1024 * 1024 * 1024 :
    unit === "t" ? 1024 * 1024 * 1024 * 1024 :
    1;
  return Math.round(n * mul);
}

function shortId(id: string): string {
  return id.replace(/^sha256:/, "").slice(0, 12);
}

function parsePorts(s: string): DockerPortMap[] {
  // Examples:
  //   "0.0.0.0:8080->80/tcp, :::8080->80/tcp"
  //   "80/tcp"
  //   "" (empty)
  if (!s) return [];
  const out: DockerPortMap[] = [];
  const seen = new Set<string>();
  for (const piece of s.split(",")) {
    const t = piece.trim();
    if (!t) continue;
    const m = /^(?:([\w.:\[\]]+):(\d+)->)?(\d+)\/(tcp|udp)$/i.exec(t);
    if (!m) continue;
    const host_ip = m[1] ?? "";
    const host_port = m[2] ? Number(m[2]) : null;
    const container_port = Number(m[3]);
    const proto = m[4].toUpperCase();
    const key = `${host_ip}:${host_port}:${container_port}:${proto}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ host_ip, host_port, container_port, proto });
  }
  return out;
}
