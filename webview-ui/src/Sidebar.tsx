import { useEffect, useMemo, useState } from "react";
import { connKey } from "./App";
import type {
  AudioChannel,
  AudioSettings,
  Conn,
  DockerEvent,
  DockerSnapshot,
  SceneSettings,
  Snapshot
} from "./types";

interface Props {
  snapshot: Snapshot | null;
  docker: DockerSnapshot | null;
  selected: Conn | null;
  recentEvents: DockerEvent[];
  audioSettings: AudioSettings;
  sceneSettings: SceneSettings;
  open: boolean;
  onToggleOpen: () => void;
  onAudioChange: (s: AudioSettings) => void;
  onSceneChange: (s: SceneSettings) => void;
  onAudioPrime: () => void;
  onSelect: (c: Conn | null) => void;
  onKill: (pid: number) => void;
  onRestart: () => void;
  onScreenshot: () => void;
}

const NEON = {
  pink: "#ff00aa",
  cyan: "#00f5ff",
  green: "#39ff14",
  yellow: "#ffde3c",
  purple: "#b464ff",
  red: "#ff4060",
  orange: "#ff8c28",
  bgPanel: "#0e0620",
  border: "#2a1452",
  text: "#e6e6f0",
  dim: "#8c82aa"
};

type TabKey = "sockets" | "docker" | "settings" | "about";

export function Sidebar({
  snapshot,
  docker,
  selected,
  recentEvents,
  audioSettings,
  sceneSettings,
  open,
  onToggleOpen,
  onAudioChange,
  onSceneChange,
  onAudioPrime,
  onSelect,
  onKill,
  onRestart,
  onScreenshot
}: Props) {
  const [tab, setTab] = useState<TabKey>("sockets");
  const [filterText, setFilterText] = useState("");
  const stats = useMemo(() => deriveStats(snapshot), [snapshot]);

  const toggleAudio = (channel: AudioChannel) => {
    onAudioPrime();
    onAudioChange({ ...audioSettings, [channel]: !audioSettings[channel] });
  };

  if (!open) {
    return (
      <aside
        style={{
          background: NEON.bgPanel,
          borderLeft: `1px solid ${NEON.border}`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "8px 4px",
          cursor: "pointer"
        }}
        onClick={onToggleOpen}
        title="Open sidebar"
      >
        <button
          onClick={onToggleOpen}
          style={{
            background: "transparent",
            border: "none",
            color: NEON.pink,
            fontSize: 16,
            cursor: "pointer",
            padding: 0
          }}
          aria-label="Expand sidebar"
        >
          ◀
        </button>
        <div
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            color: NEON.dim,
            fontSize: 10,
            marginTop: 8,
            letterSpacing: 2
          }}
        >
          PORT HARBOUR
        </div>
      </aside>
    );
  }

  return (
    <aside
      style={{
        background: NEON.bgPanel,
        borderLeft: `1px solid ${NEON.border}`,
        display: "flex",
        flexDirection: "column",
        fontFamily: "inherit",
        fontSize: 12,
        lineHeight: 1.45,
        height: "100%",
        minHeight: 0,
        overflow: "hidden"
      }}
    >
      {/* Compact header */}
      <header
        style={{
          padding: "10px 12px 8px",
          borderBottom: `1px solid ${NEON.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <div>
          <div
            style={{
              color: NEON.pink,
              fontWeight: 700,
              letterSpacing: 2,
              fontSize: 13
            }}
          >
            PORT HARBOUR
          </div>
          <div style={{ color: NEON.dim, fontSize: 10 }}>
            {stats.total} sockets · {docker?.containers.filter((c) => c.state === "running").length ?? 0} containers · {stats.estab} active
          </div>
        </div>
        <button
          onClick={onToggleOpen}
          style={{
            background: "transparent",
            border: "none",
            color: NEON.pink,
            fontSize: 14,
            cursor: "pointer"
          }}
          aria-label="Collapse sidebar"
        >
          ▶
        </button>
      </header>

      {/* Tab strip */}
      <div
        style={{
          display: "flex",
          borderBottom: `1px solid ${NEON.border}`,
          background: "#1a0d3a"
        }}
      >
        {(["sockets", "docker", "settings", "about"] as TabKey[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              background: tab === t ? NEON.bgPanel : "transparent",
              border: "none",
              color: tab === t ? NEON.cyan : NEON.dim,
              padding: "8px 4px",
              fontSize: 10,
              letterSpacing: 1,
              cursor: "pointer",
              fontFamily: "inherit",
              textTransform: "uppercase",
              borderBottom: tab === t ? `2px solid ${NEON.cyan}` : "2px solid transparent"
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px" }}>
        {tab === "sockets" && (
          <SocketsTab
            snapshot={snapshot}
            selected={selected}
            filterText={filterText}
            setFilterText={setFilterText}
            onSelect={onSelect}
            onKill={onKill}
          />
        )}
        {tab === "docker" && (
          <DockerTab docker={docker} recentEvents={recentEvents} />
        )}
        {tab === "settings" && (
          <SettingsTab
            sceneSettings={sceneSettings}
            audioSettings={audioSettings}
            onSceneChange={onSceneChange}
            onAudioChange={onAudioChange}
            onAudioPrime={onAudioPrime}
            toggleAudio={toggleAudio}
            onRestart={onRestart}
            onScreenshot={onScreenshot}
          />
        )}
        {tab === "about" && (
          <AboutTab snapshot={snapshot} docker={docker} stats={stats} />
        )}
      </div>
    </aside>
  );
}

function SocketsTab({
  snapshot,
  selected,
  filterText,
  setFilterText,
  onSelect,
  onKill
}: {
  snapshot: Snapshot | null;
  selected: Conn | null;
  filterText: string;
  setFilterText: (s: string) => void;
  onSelect: (c: Conn | null) => void;
  onKill: (pid: number) => void;
}) {
  const f = filterText.toLowerCase();
  const filtered =
    snapshot?.conns.filter((c) => {
      if (!f) return true;
      return (
        c.port.toString().includes(f) ||
        c.process.toLowerCase().includes(f) ||
        c.proto.toLowerCase().includes(f) ||
        c.local.toLowerCase().includes(f)
      );
    }) ?? [];

  return (
    <>
      <input
        type="text"
        placeholder="filter port / proc / addr..."
        value={filterText}
        onChange={(e) => setFilterText(e.target.value)}
        style={{
          width: "100%",
          background: "transparent",
          border: `1px solid ${NEON.dim}`,
          color: NEON.text,
          fontFamily: "inherit",
          fontSize: 11,
          padding: "4px 8px",
          marginBottom: 8
        }}
      />
      {selected && (
        <Section title="SELECTED" color={NEON.yellow}>
          <DetailRow label="port" value={String(selected.port)} color={portColor(selected.port)} />
          <DetailRow label="service" value={selected.service || "·"} />
          <DetailRow label="proto" value={selected.proto + (selected.ipv6 ? "6" : "")} />
          <DetailRow label="state" value={selected.state} color={stateColor(selected.state)} />
          <DetailRow label="pid" value={selected.pid != null ? String(selected.pid) : "·"} />
          <DetailRow label="process" value={selected.process} />
          <DetailRow label="user" value={selected.user} />
          <DetailRow label="local" value={selected.local} />
          <DetailRow label="remote" value={selected.remote} />
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
            <button
              disabled={selected.pid == null}
              onClick={() => selected.pid != null && onKill(selected.pid)}
              style={btnStyle(NEON.red)}
            >
              KILL PID
            </button>
            <button onClick={() => onSelect(null)} style={btnStyle(NEON.dim)}>
              CLEAR
            </button>
          </div>
        </Section>
      )}
      <Section title={`SOCKETS (${filtered.length})`} color={NEON.cyan}>
        {filtered.map((c) => {
          const key = connKey(c);
          const isSel = selected && connKey(selected) === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(c)}
              style={{
                display: "flex",
                width: "100%",
                gap: 8,
                padding: "3px 6px",
                marginBottom: 2,
                background: isSel ? "#1f0f4a" : "transparent",
                border: `1px solid ${isSel ? NEON.pink : "transparent"}`,
                color: NEON.text,
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 11,
                textAlign: "left"
              }}
            >
              <span style={{ color: portColor(c.port), width: 52 }}>{c.port}</span>
              <span style={{ width: 30, color: NEON.dim }}>{c.proto}</span>
              <span style={{ flex: 1, color: NEON.cyan }}>{truncate(c.process, 18)}</span>
            </button>
          );
        })}
      </Section>
    </>
  );
}

function DockerTab({
  docker,
  recentEvents
}: {
  docker: DockerSnapshot | null;
  recentEvents: DockerEvent[];
}) {
  if (!docker) {
    return <div style={{ color: NEON.dim }}>waiting for docker scanner...</div>;
  }
  if (!docker.available) {
    return <div style={{ color: NEON.dim }}>docker daemon not detected</div>;
  }
  const running = docker.containers.filter((c) => c.state === "running");
  const stopped = docker.containers.filter((c) => c.state !== "running");
  return (
    <>
      <Section title="STATS" color={NEON.purple}>
        <StatRow label="running" value={running.length} color={NEON.green} />
        <StatRow label="stopped" value={stopped.length} color={NEON.dim} />
        <StatRow label="images" value={docker.images.length} color={NEON.cyan} />
      </Section>
      <Section title="RUNNING" color={NEON.green}>
        {running.length === 0 && <div style={{ color: NEON.dim }}>none</div>}
        {running.map((c) => (
          <div key={c.id} style={{ fontSize: 11, marginBottom: 4 }}>
            <div style={{ color: NEON.text }}>{c.name || c.id}</div>
            <div style={{ color: NEON.dim, fontSize: 10 }}>
              {c.image} · {c.status}
            </div>
            {c.ports.length > 0 && (
              <div style={{ color: NEON.cyan, fontSize: 10 }}>
                {c.ports.map((p) => `${p.host_port ?? "·"}→${p.container_port}`).join(" ")}
              </div>
            )}
          </div>
        ))}
      </Section>
      <Section title="RECENT EVENTS" color={NEON.yellow}>
        {recentEvents.length === 0 && (
          <div style={{ color: NEON.dim }}>no events</div>
        )}
        {recentEvents.slice(0, 8).map((e, i) => (
          <div key={i} style={{ fontSize: 10, color: NEON.text }}>
            <span style={{ color: actionColor(e.action) }}>{e.action}</span>{" "}
            <span style={{ color: NEON.dim }}>{truncate(e.name || e.image || e.id, 24)}</span>
          </div>
        ))}
      </Section>
    </>
  );
}

function SettingsTab({
  sceneSettings,
  audioSettings,
  onSceneChange,
  onAudioChange,
  onAudioPrime,
  toggleAudio,
  onRestart,
  onScreenshot
}: {
  sceneSettings: SceneSettings;
  audioSettings: AudioSettings;
  onSceneChange: (s: SceneSettings) => void;
  onAudioChange: (s: AudioSettings) => void;
  onAudioPrime: () => void;
  toggleAudio: (channel: AudioChannel) => void;
  onRestart: () => void;
  onScreenshot: () => void;
}) {
  return (
    <>
      <Section title="WORLD" color={NEON.green}>
        <ToggleRow
          label="heat map"
          on={sceneSettings.heatMap}
          onChange={() =>
            onSceneChange({ ...sceneSettings, heatMap: !sceneSettings.heatMap })
          }
          color={NEON.red}
        />
        <ToggleRow
          label="network graph"
          on={sceneSettings.networkGraph}
          onChange={() =>
            onSceneChange({
              ...sceneSettings,
              networkGraph: !sceneSettings.networkGraph
            })
          }
          color={NEON.cyan}
        />
        <ToggleRow
          label="pause world"
          on={sceneSettings.paused}
          onChange={() =>
            onSceneChange({ ...sceneSettings, paused: !sceneSettings.paused })
          }
          color={NEON.yellow}
        />
        <button onClick={onScreenshot} style={{ ...btnStyle(NEON.purple), width: "100%", marginTop: 4 }}>
          📸 SCREENSHOT
        </button>
      </Section>
      <Section title="AUDIO" color={NEON.yellow}>
        <ToggleRow label="ship horns" on={audioSettings.horn} onChange={() => toggleAudio("horn")} color={NEON.orange} />
        <ToggleRow label="birds" on={audioSettings.birds} onChange={() => toggleAudio("birds")} color={NEON.yellow} />
        <ToggleRow label="sea waves" on={audioSettings.waves} onChange={() => toggleAudio("waves")} color={NEON.cyan} />
        <ToggleRow label="retro music" on={audioSettings.music} onChange={() => toggleAudio("music")} color={NEON.pink} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
          <span style={{ color: NEON.dim, width: 50 }}>volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audioSettings.master}
            onChange={(e) => {
              onAudioPrime();
              onAudioChange({ ...audioSettings, master: Number(e.target.value) });
            }}
            style={{ flex: 1 }}
          />
          <span style={{ color: NEON.text, width: 26, textAlign: "right" }}>
            {Math.round(audioSettings.master * 100)}
          </span>
        </div>
        <div style={{ color: NEON.dim, fontSize: 10, marginTop: 4 }}>
          click anything above to enable audio
        </div>
      </Section>
      <Section title="SCANNER" color={NEON.dim}>
        <button onClick={onRestart} style={{ ...btnStyle(NEON.cyan), width: "100%" }}>
          RESTART SCANNER
        </button>
      </Section>
      <Section title="PROFILE" color={NEON.purple}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => exportSettings(sceneSettings, audioSettings)}
            style={{ ...btnStyle(NEON.purple), flex: 1 }}
          >
            EXPORT
          </button>
          <button
            onClick={() =>
              importSettings((s, a) => {
                if (s) onSceneChange(s);
                if (a) onAudioChange(a);
              })
            }
            style={{ ...btnStyle(NEON.purple), flex: 1 }}
          >
            IMPORT
          </button>
        </div>
      </Section>
    </>
  );
}

function AboutTab({
  snapshot,
  docker,
  stats
}: {
  snapshot: Snapshot | null;
  docker: DockerSnapshot | null;
  stats: ReturnType<typeof deriveStats>;
}) {
  return (
    <>
      <Section title="STATS" color={NEON.cyan}>
        <StatRow label="total" value={stats.total} color={NEON.cyan} />
        <StatRow label="TCP" value={stats.tcp} color={NEON.green} />
        <StatRow label="UDP" value={stats.udp} color={NEON.orange} />
        <StatRow label="LISTEN" value={stats.listen} color={NEON.green} />
        <StatRow label="ESTAB" value={stats.estab} color={NEON.cyan} />
        <StatRow label="IPv6" value={stats.ipv6} color={NEON.yellow} />
        <StatRow label="procs" value={stats.procs} color={NEON.purple} />
      </Section>
      <Section title="TOP PROCESSES" color={NEON.pink}>
        {stats.topProcs.length === 0 && (
          <div style={{ color: NEON.dim }}>no data</div>
        )}
        {stats.topProcs.map((p, i) => {
          const max = stats.topProcs[0]?.count || 1;
          const frac = p.count / max;
          return (
            <div key={p.name} style={{ marginBottom: 4 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: NEON.text }}>{truncate(p.name, 18)}</span>
                <span style={{ color: rotatingNeon(i) }}>{p.count}</span>
              </div>
              <div
                style={{
                  height: 4,
                  background: "#1a0d3a",
                  borderRadius: 2,
                  overflow: "hidden"
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.round(frac * 100)}%`,
                    background: rotatingNeon(i)
                  }}
                />
              </div>
            </div>
          );
        })}
      </Section>
      <Section title="ACHIEVEMENTS" color={NEON.green}>
        <AchievementList snapshot={snapshot} docker={docker} />
      </Section>
      <Section title="EASTER EGGS" color={NEON.purple}>
        <EasterEggList />
      </Section>
      <Section title="DEBUG" color={NEON.dim}>
        <FPSCounter />
        <div style={{ color: NEON.dim, fontSize: 10, marginTop: 4 }}>
          konami code: ↑↑↓↓←→←→ b a → CRT mode
        </div>
      </Section>
    </>
  );
}

function Section({
  title,
  color,
  children
}: {
  title: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 14 }}>
      <div
        style={{
          color,
          letterSpacing: 2,
          fontWeight: 700,
          marginBottom: 6,
          fontSize: 11,
          borderBottom: `1px solid ${color}55`,
          paddingBottom: 2
        }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function StatRow({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: NEON.dim }}>{label}</span>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
  color
}: {
  label: string;
  on: boolean;
  onChange: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onChange}
      style={{
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "3px 6px",
        marginBottom: 2,
        background: "transparent",
        border: `1px solid ${on ? color : "#2a1452"}`,
        color: NEON.text,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 11,
        textAlign: "left"
      }}
    >
      <span style={{ color: on ? color : NEON.dim }}>{label}</span>
      <span style={{ color: on ? color : NEON.dim }}>{on ? "ON" : "OFF"}</span>
    </button>
  );
}

function DetailRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: NEON.dim, width: 60 }}>{label}</span>
      <span style={{ color: color || NEON.text, wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    flex: 1,
    background: "transparent",
    border: `1px solid ${color}`,
    color,
    padding: "5px 8px",
    fontSize: 11,
    letterSpacing: 1,
    cursor: "pointer",
    fontFamily: "inherit",
    textTransform: "uppercase" as const
  };
}

function deriveStats(s: Snapshot | null) {
  if (!s) {
    return {
      total: 0,
      tcp: 0,
      udp: 0,
      listen: 0,
      estab: 0,
      ipv6: 0,
      procs: 0,
      topProcs: [] as { name: string; count: number }[]
    };
  }
  const tcp = s.conns.filter((c) => c.proto === "TCP").length;
  const udp = s.conns.filter((c) => c.proto === "UDP").length;
  const listen = s.conns.filter((c) => c.state === "LISTEN").length;
  const estab = s.conns.filter((c) => c.state === "ESTABLISHED").length;
  const ipv6 = s.conns.filter((c) => c.ipv6).length;
  const bag = new Map<string, number>();
  for (const c of s.conns) bag.set(c.process, (bag.get(c.process) ?? 0) + 1);
  const topProcs = Array.from(bag.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
  return {
    total: s.conns.length,
    tcp,
    udp,
    listen,
    estab,
    ipv6,
    procs: bag.size,
    topProcs
  };
}

export function portColor(port: number): string {
  if (port < 1024) return NEON.red;
  if (port < 49152) return NEON.yellow;
  return NEON.green;
}

export function stateColor(state: string): string {
  switch (state) {
    case "LISTEN":
      return NEON.green;
    case "ESTABLISHED":
      return NEON.cyan;
    case "TIME_WAIT":
    case "CLOSE_WAIT":
      return NEON.yellow;
    default:
      return NEON.dim;
  }
}

function actionColor(action: string): string {
  switch (action) {
    case "start":
    case "create":
      return NEON.green;
    case "die":
    case "stop":
    case "kill":
      return NEON.red;
    case "pause":
      return NEON.yellow;
    case "pull":
      return NEON.cyan;
    default:
      return NEON.dim;
  }
}

function rotatingNeon(idx: number): string {
  const colors = [NEON.pink, NEON.cyan, NEON.purple, NEON.green, NEON.yellow];
  return colors[idx % colors.length];
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function exportSettings(scene: SceneSettings, audio: AudioSettings) {
  const blob = new Blob(
    [JSON.stringify({ scene, audio }, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "port-harbour-settings.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importSettings(
  apply: (scene: SceneSettings | null, audio: AudioSettings | null) => void
) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    try {
      const text = await f.text();
      const obj = JSON.parse(text);
      apply(obj.scene ?? null, obj.audio ?? null);
    } catch {
      /* ignore bad file */
    }
  };
  input.click();
}

const EGG_LIST: { key: string; label: string }[] = [
  { key: "princess", label: "👑 Princess Mikaela" },
  { key: "spotty", label: "🐱 Spotty (cat)" },
  { key: "tigger", label: "🐈 Tigger (cat)" },
  { key: "owl", label: "🦉 Belfry owl" },
  { key: "dolly", label: "🐕 Dolly (Pomeranian)" },
  { key: "mailman", label: "📮 Mailman" },
  { key: "oldman", label: "👴 Old man + pigeons" },
  { key: "treasure", label: "💰 Sunken treasure" },
  { key: "mermaid", label: "🧜 Mermaid" },
  { key: "whale", label: "🐳 Whale" },
  { key: "serpent", label: "🐉 Sea serpent" },
  { key: "ufo", label: "🛸 UFO (3 AM)" },
  { key: "lighthouse", label: "🗼 Lighthouse" },
  { key: "keeper", label: "🧑‍✈️ Lighthouse keeper" },
  { key: "jukebox", label: "🎵 Jukebox" },
  { key: "bottle", label: "🍾 Bottle (obicham te muti)" },
  { key: "fisherman_0", label: "🎣 Fisherman" }
];

function EasterEggList() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1500);
    return () => window.clearInterval(id);
  }, []);
  const eggs: Set<string> = (window as any).__harborEggs ?? new Set();
  const found = EGG_LIST.filter((e) => eggs.has(e.key)).length;
  return (
    <div style={{ fontSize: 10 }}>
      <div style={{ color: NEON.dim, marginBottom: 4 }}>
        {found}/{EGG_LIST.length} found
      </div>
      {EGG_LIST.map((e) => {
        const ok = eggs.has(e.key);
        return (
          <div
            key={e.key}
            style={{
              color: ok ? NEON.green : NEON.dim,
              opacity: ok ? 1 : 0.5
            }}
          >
            {ok ? "✓" : "○"} {ok ? e.label : "???"}
          </div>
        );
      })}
    </div>
  );
}

function FPSCounter() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div style={{ color: NEON.green, fontWeight: 700 }}>fps {fps}</div>;
}

function AchievementList({
  snapshot,
  docker
}: {
  snapshot: Snapshot | null;
  docker: DockerSnapshot | null;
}) {
  const sockets = snapshot?.conns.length ?? 0;
  const containers = docker?.containers.length ?? 0;
  const [eggCount, setEggCount] = useState(0);
  useEffect(() => {
    const tick = () => {
      const eggs: Set<string> = (window as any).__harborEggs;
      if (eggs) setEggCount(eggs.size);
    };
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  const items = [
    { name: "Harbour Master", unlocked: sockets >= 100, hint: "100+ sockets" },
    { name: "Fleet Captain", unlocked: containers >= 5, hint: "5+ containers" },
    { name: "Bustling Port", unlocked: sockets >= 25, hint: "25+ sockets" },
    { name: "Ghost Town", unlocked: sockets <= 1, hint: "≤1 socket" },
    { name: "Cat Hunter", unlocked: eggCount >= 2, hint: `${eggCount} eggs` },
    { name: "Treasure Found", unlocked: ((window as any).__harborEggs as Set<string> | undefined)?.has("treasure") ?? false, hint: "spot sunken chest" },
    { name: "Cartographer", unlocked: eggCount >= 10, hint: `${eggCount}/10 eggs` }
  ];
  return (
    <div style={{ fontSize: 10 }}>
      {items.map((a) => (
        <div
          key={a.name}
          style={{
            display: "flex",
            justifyContent: "space-between",
            color: a.unlocked ? NEON.green : NEON.dim
          }}
        >
          <span>
            {a.unlocked ? "✓" : "○"} {a.name}
          </span>
          <span style={{ color: NEON.dim }}>{a.hint}</span>
        </div>
      ))}
    </div>
  );
}
