import * as vscode from "vscode";
import { spawn, ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { DockerScanner } from "./dockerScanner";

let panel: vscode.WebviewPanel | undefined;
let child: ChildProcess | undefined;
let docker: DockerScanner | undefined;
let buf = "";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("harbour.show", () => showPanel(context))
  );
}

export function deactivate() {
  killChild();
  docker?.dispose();
  docker = undefined;
  panel?.dispose();
  panel = undefined;
}

function showPanel(context: vscode.ExtensionContext) {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Active);
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "harbour.panel",
    "Port Harbour",
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "out", "webview"),
        vscode.Uri.joinPath(context.extensionUri, "assets")
      ]
    }
  );

  panel.webview.html = renderHtml(panel.webview, context);

  panel.onDidDispose(() => {
    killChild();
    docker?.dispose();
    docker = undefined;
    panel = undefined;
  });

  panel.webview.onDidReceiveMessage((msg) => handleWebviewMessage(msg, context));

  startScanner(context);
  startDocker();
}

function startDocker() {
  docker?.dispose();
  const cfg = vscode.workspace.getConfiguration("harbour");
  if (cfg.get<boolean>("docker", true) === false) return;
  const intervalMs = cfg.get<number>("dockerIntervalMs") ?? 3000;
  docker = new DockerScanner((msg) => {
    if (!panel) return;
    if (msg.type === "snapshot") {
      panel.webview.postMessage({ type: "docker_snapshot", data: msg.data });
    } else if (msg.type === "event") {
      panel.webview.postMessage({ type: "docker_event", data: msg.data });
    }
  }, intervalMs);
  docker.start();
}

function renderHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const webviewRoot = vscode.Uri.joinPath(context.extensionUri, "out", "webview");
  const indexPath = vscode.Uri.joinPath(webviewRoot, "index.html").fsPath;

  if (!fs.existsSync(indexPath)) {
    return fallbackHtml();
  }

  let html = fs.readFileSync(indexPath, "utf8");
  const baseUri = webview.asWebviewUri(webviewRoot).toString();
  html = html.replace(/(href|src)="([^"]+)"/g, (m, attr, val) => {
    if (val.startsWith("http") || val.startsWith("data:") || val.startsWith("vscode-")) {
      return m;
    }
    const trimmed = val.startsWith("/") ? val.slice(1) : val;
    return `${attr}="${baseUri}/${trimmed}"`;
  });
  const cspSource = webview.cspSource;
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data: blob:; style-src ${cspSource} 'unsafe-inline'; script-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};">`;
  html = html.replace("<head>", `<head>\n${csp}`);
  return html;
}

function fallbackHtml(): string {
  return `<!doctype html>
<html><body style="background:#080418;color:#0ff;font-family:monospace;padding:24px">
<h1 style="color:#ff00aa">Port Harbour</h1>
<p>The webview bundle is missing. Run <code>npm install</code> and <code>npm run build</code> in the project root.</p>
</body></html>`;
}

function startScanner(context: vscode.ExtensionContext) {
  killChild();
  buf = "";

  const cfg = vscode.workspace.getConfiguration("harbour");
  const binPath = resolveBinary(context, cfg.get<string>("binaryPath") ?? "");
  if (!binPath) {
    panel?.webview.postMessage({
      type: "error",
      message:
        "Port Harbour binary not found. Build it with `cargo build --release` in the `rust/` folder, or set `harbour.binaryPath` in settings."
    });
    return;
  }

  const args = [
    "--stream",
    "--interval",
    String(cfg.get<number>("intervalMs") ?? 1000)
  ];
  if (cfg.get<boolean>("showAll")) {
    args.push("--all");
  }

  try {
    child = spawn(binPath, args, { stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    panel?.webview.postMessage({
      type: "error",
      message: `Failed to spawn scanner: ${(err as Error).message}`
    });
    return;
  }

  child.stdout?.on("data", (chunk: Buffer) => onScannerChunk(chunk));
  child.stderr?.on("data", (chunk: Buffer) => {
    console.error("[harbour scanner]", chunk.toString());
  });
  child.on("error", (err) => {
    panel?.webview.postMessage({
      type: "error",
      message: `Scanner error: ${err.message}`
    });
  });
  child.on("exit", (code, signal) => {
    if (panel) {
      panel.webview.postMessage({
        type: "info",
        message: `Scanner exited (code=${code}, signal=${signal ?? "none"})`
      });
    }
    child = undefined;
  });
}

function onScannerChunk(chunk: Buffer) {
  buf += chunk.toString("utf8");
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const snapshot = JSON.parse(line);
      panel?.webview.postMessage({ type: "snapshot", data: snapshot });
    } catch (err) {
      console.error("[harbour] bad json line", err, line.slice(0, 200));
    }
  }
}

function handleWebviewMessage(msg: any, context: vscode.ExtensionContext) {
  if (!msg || typeof msg !== "object") return;
  switch (msg.type) {
    case "ready":
      break;
    case "restartScanner":
      startScanner(context);
      break;
    case "killPid":
      if (typeof msg.pid === "number") killPid(msg.pid);
      break;
  }
}

function killPid(pid: number) {
  vscode.window
    .showWarningMessage(
      `Send SIGTERM to PID ${pid}?`,
      { modal: true },
      "Kill",
      "Cancel"
    )
    .then((choice) => {
      if (choice !== "Kill") return;
      try {
        process.kill(pid, "SIGTERM");
        vscode.window.showInformationMessage(`SIGTERM sent to PID ${pid}`);
      } catch (err) {
        vscode.window.showErrorMessage(
          `Kill failed: ${(err as Error).message}`
        );
      }
    });
}

function killChild() {
  if (!child) return;
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  child = undefined;
  buf = "";
}

function resolveBinary(context: vscode.ExtensionContext, configured: string): string | undefined {
  if (configured) {
    if (configured === "portharbour" || configured === "portharbour.exe") return configured;
    return fs.existsSync(configured) ? configured : undefined;
  }
  const candidates = [
    path.join(context.extensionPath, "bin", platformBinaryName()),
    path.join(context.extensionPath, "rust", "target", "release", binaryName()),
    path.join(context.extensionPath, "..", "rust", "target", "release", binaryName())
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

function binaryName(): string {
  return process.platform === "win32" ? "portharbour.exe" : "portharbour";
}

function platformBinaryName(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const os =
    process.platform === "win32"
      ? "win32"
      : process.platform === "darwin"
      ? "darwin"
      : "linux";
  const suffix = process.platform === "win32" ? ".exe" : "";
  return `portharbour-${os}-${arch}${suffix}`;
}
