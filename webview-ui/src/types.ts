export interface Conn {
  port: number;
  proto: string;
  state: string;
  pid: number | null;
  process: string;
  user: string;
  local: string;
  remote: string;
  service: string;
  ipv6: boolean;
}

export interface Snapshot {
  ts: number;
  scan_ms: number;
  listening_only: boolean;
  conns: Conn[];
}

export interface DockerPortMap {
  host_ip: string;
  host_port: number | null;
  container_port: number;
  proto: string;
}

export interface DockerContainer {
  id: string;
  image: string;
  name: string;
  state: string;
  status: string;
  ports: DockerPortMap[];
  created: string;
  size_bytes: number;
  virtual_bytes: number;
}

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  size: string;
  size_bytes: number;
  created: string;
}

export interface DockerSnapshot {
  available: boolean;
  containers: DockerContainer[];
  images: DockerImage[];
  scan_ms: number;
}

export interface DockerEvent {
  type: string;
  action: string;
  id: string;
  name?: string;
  image?: string;
  time: number;
}

export type HostMessage =
  | { type: "snapshot"; data: Snapshot }
  | { type: "docker_snapshot"; data: DockerSnapshot }
  | { type: "docker_event"; data: DockerEvent }
  | { type: "error"; message: string }
  | { type: "info"; message: string };

export type WebviewMessage =
  | { type: "ready" }
  | { type: "restartScanner" }
  | { type: "killPid"; pid: number }
  | { type: "setAudio"; channel: AudioChannel; on: boolean }
  | { type: "setVolume"; value: number };

export type AudioChannel = "horn" | "birds" | "waves" | "music";

export interface AudioSettings {
  master: number;
  horn: boolean;
  birds: boolean;
  waves: boolean;
  music: boolean;
}

export type WeatherKind = "clear" | "rain" | "storm" | "fog";
export type ThemeKind = "mediterranean" | "tokyo" | "caribbean" | "scandinavian";

export interface SceneSettings {
  weather: WeatherKind;
  theme: ThemeKind;
  heatMap: boolean;
  paused: boolean;
  networkGraph: boolean;
}

export function defaultSceneSettings(): SceneSettings {
  return {
    weather: "clear",
    theme: "mediterranean",
    heatMap: false,
    paused: false,
    networkGraph: false
  };
}
