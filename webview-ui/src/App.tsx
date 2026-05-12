import { useEffect, useMemo, useRef, useState } from "react";
import { Harbor } from "./Harbor";
import { Sidebar } from "./Sidebar";
import type {
  Conn,
  DockerEvent,
  DockerSnapshot,
  HostMessage,
  Snapshot
} from "./types";
import { loadPersistedState, savePersistedState, vscode } from "./vscode";
import { audio, defaultAudioSettings } from "./audio";
import { defaultSceneSettings } from "./types";

function portKeySet(s: Snapshot | null): Set<string> {
  const out = new Set<string>();
  if (!s) return out;
  for (const c of s.conns) if (c.state === "LISTEN") out.add(`${c.proto}:${c.port}`);
  return out;
}

export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [docker, setDocker] = useState<DockerSnapshot | null>(null);
  const [recentEvents, setRecentEvents] = useState<DockerEvent[]>([]);
  const [status, setStatus] = useState<string>("waiting for scanner...");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [audioSettings, setAudioSettings] = useState(() =>
    loadPersistedState("audio", defaultAudioSettings())
  );
  const [sceneSettings, setSceneSettings] = useState(() =>
    loadPersistedState("scene", defaultSceneSettings())
  );
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    loadPersistedState("sidebarOpen", false)
  );
  const [showTutorial, setShowTutorial] = useState(() =>
    loadPersistedState("hasSeenTutorial", false) ? false : true
  );
  const [jukeboxSeen, setJukeboxSeen] = useState(() =>
    loadPersistedState("jukeboxSeen", false)
  );
  useEffect(() => savePersistedState("jukeboxSeen", jukeboxSeen), [jukeboxSeen]);
  useEffect(() => {
    (window as any).__harborJukeboxSeen = jukeboxSeen;
  }, [jukeboxSeen]);

  useEffect(() => savePersistedState("audio", audioSettings), [audioSettings]);
  useEffect(() => savePersistedState("scene", sceneSettings), [sceneSettings]);
  useEffect(() => savePersistedState("sidebarOpen", sidebarOpen), [sidebarOpen]);
  const audioRef = useRef(audio);
  const prevPortsRef = useRef<Set<string>>(new Set());
  const lastBellHourRef = useRef<number>(-1);

  useEffect(() => {
    vscode().postMessage({ type: "ready" });
    const onMessage = (e: MessageEvent<HostMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case "snapshot": {
          const newSet = portKeySet(msg.data);
          const old = prevPortsRef.current;
          // Detect newly-opened LISTEN ports → chime.
          for (const k of newSet) {
            if (!old.has(k)) {
              const port = Number(k.split(":")[1]);
              if (!Number.isNaN(port)) audioRef.current.playPortChime(port, true);
            }
          }
          // Detect closed ports → low chime.
          for (const k of old) {
            if (!newSet.has(k)) {
              const port = Number(k.split(":")[1]);
              if (!Number.isNaN(port)) audioRef.current.playPortChime(port, false);
            }
          }
          prevPortsRef.current = newSet;
          setSnapshot(msg.data);
          setStatus(
            `live · ${msg.data.conns.length} sockets · scan ${msg.data.scan_ms}ms`
          );
          break;
        }
        case "docker_snapshot":
          setDocker(msg.data);
          break;
        case "docker_event":
          setRecentEvents((prev) => [msg.data, ...prev].slice(0, 20));
          audioRef.current.onDockerEvent(msg.data);
          break;
        case "error":
          setStatus(`error: ${msg.message}`);
          break;
        case "info":
          setStatus(msg.message);
          break;
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    audioRef.current.applySettings(audioSettings);
    (window as any).__harborMusicOn = audioSettings.music;
  }, [audioSettings]);

  // Expose horn fn + music toggle + prime so canvas can trigger from clicks.
  useEffect(() => {
    (window as any).__harborHorn = () => audioRef.current.playHorn(0.5);
    (window as any).__harborToggleMusic = () => {
      audioRef.current.prime();
      setAudioSettings((prev) => ({ ...prev, music: !prev.music }));
      setJukeboxSeen(true);
    };
    (window as any).__harborPrimeAudio = () => audioRef.current.prime();
    return () => {
      delete (window as any).__harborHorn;
      delete (window as any).__harborToggleMusic;
      delete (window as any).__harborPrimeAudio;
    };
  }, []);

  // Cathedral bell on the hour.
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = d.getHours();
      if (d.getMinutes() === 0 && lastBellHourRef.current !== h) {
        lastBellHourRef.current = h;
        const count = h === 0 ? 12 : h > 12 ? h - 12 : h;
        audioRef.current.playBellToll(count);
      }
    };
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Crickets at night (intermittent) + occasional owl hoot.
  useEffect(() => {
    const cricket = () => {
      const h = new Date().getHours();
      if (h < 21 && h >= 6) return;
      if (Math.random() < 0.4) audioRef.current.playCricketChirp();
      if (Math.random() < 0.06) audioRef.current.playOwlHoot();
    };
    const id = window.setInterval(cricket, 2200);
    return () => window.clearInterval(id);
  }, []);

  // Occasional boat creak ambient
  useEffect(() => {
    const id = window.setInterval(() => {
      if (Math.random() < 0.25) audioRef.current.playBoatCreak();
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  // Random horn toot from a random boat every ~60s
  useEffect(() => {
    const id = window.setInterval(() => {
      if (Math.random() < 0.55) audioRef.current.playHorn(0.4 + Math.random() * 0.3);
    }, 55000 + Math.floor(Math.random() * 15000));
    return () => window.clearInterval(id);
  }, []);

  const selected = useMemo<Conn | null>(() => {
    if (!snapshot || !selectedKey) return null;
    return snapshot.conns.find((c) => connKey(c) === selectedKey) ?? null;
  }, [snapshot, selectedKey]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: sidebarOpen ? "minmax(0, 1fr) 340px" : "minmax(0, 1fr) 28px",
        gridTemplateRows: "1fr auto",
        gap: 0,
        height: "100%",
        width: "100%",
        background: "#080418",
        transition: "grid-template-columns 0.2s ease-out"
      }}
    >
      <div style={{ position: "relative", overflow: "hidden" }}>
        <Harbor
          snapshot={snapshot}
          docker={docker}
          recentEvents={recentEvents}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          sceneSettings={sceneSettings}
        />
      </div>
      <Sidebar
        snapshot={snapshot}
        docker={docker}
        selected={selected}
        recentEvents={recentEvents}
        audioSettings={audioSettings}
        sceneSettings={sceneSettings}
        open={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((v) => !v)}
        onAudioChange={setAudioSettings}
        onSceneChange={setSceneSettings}
        onSelect={(c) => setSelectedKey(c ? connKey(c) : null)}
        onKill={(pid) => vscode().postMessage({ type: "killPid", pid })}
        onRestart={() => vscode().postMessage({ type: "restartScanner" })}
        onAudioPrime={() => audioRef.current.prime()}
        onScreenshot={() => triggerScreenshot()}
      />
      {/* Persistent help button bottom-left */}
      <button
        onClick={() => setShowTutorial(true)}
        style={{
          position: "fixed",
          bottom: 38,
          left: 12,
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "#0e0620",
          border: "1px solid #ff00aa",
          color: "#ff00aa",
          fontFamily: "inherit",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          zIndex: 50
        }}
        aria-label="Show help"
        title="Help"
      >
        ?
      </button>
      {showTutorial && (
        <div
          onClick={() => {
            setShowTutorial(false);
            savePersistedState("hasSeenTutorial", true);
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8,4,24,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            cursor: "pointer"
          }}
        >
          <div
            style={{
              background: "#0e0620",
              border: "2px solid #ff00aa",
              padding: "20px 28px",
              maxWidth: 480,
              color: "#e6e6f0",
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.7
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#ff00aa", margin: "0 0 12px", letterSpacing: 2 }}>
              PORT HARBOUR
            </h2>
            <p style={{ margin: "0 0 10px" }}>
              Your dev machine as a living pixel-art harbour.
            </p>
            <ul style={{ paddingLeft: 18, margin: "0 0 12px" }}>
              <li>🚢 Each fishing boat = a listening socket</li>
              <li>🏛️ Red palazzo = Docker (windows = containers)</li>
              <li>🏘️ Buildings = processes; hover for info</li>
              <li>👑 Click Mikaela in the bell tower for a surprise</li>
              <li>🎵 Click the jukebox to toggle music</li>
              <li>📂 Open sidebar w/ <kbd>◀</kbd> arrow on right</li>
              <li>🎮 Konami code → CRT mode</li>
            </ul>
            <div
              style={{
                color: "#8c82aa",
                fontSize: 11,
                textAlign: "center",
                marginTop: 8
              }}
            >
              click anywhere to dismiss
            </div>
          </div>
        </div>
      )}
      <div
        style={{
          gridColumn: "1 / -1",
          fontSize: 11,
          letterSpacing: 1,
          padding: "6px 12px",
          color: "#9b8fc4",
          background: "#100828",
          borderTop: "1px solid #2a1452",
          display: "flex",
          justifyContent: "space-between"
        }}
      >
        <span>{status}</span>
        <span>
          docker: {docker?.available ? `${docker.containers.length} containers · ${docker.images.length} images` : "not detected"}
        </span>
      </div>
    </div>
  );
}

export function connKey(c: Conn): string {
  return `${c.proto}:${c.local}->${c.remote}#${c.pid ?? "?"}`;
}

function triggerScreenshot() {
  const c = document.querySelector("canvas") as HTMLCanvasElement | null;
  if (!c) return;
  const url = c.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = url;
  a.download = `port-harbour-${Date.now()}.png`;
  a.click();
}
