import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const opts = {
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  sourcemap: true,
  external: ["vscode"],
  logLevel: "info"
};

if (watch) {
  const ctx = await context(opts);
  await ctx.watch();
  console.log("portviz extension: watching for changes...");
} else {
  await build(opts);
}
