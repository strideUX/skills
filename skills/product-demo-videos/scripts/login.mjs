#!/usr/bin/env node
// Signs in to the demo account once and saves the session for every take.
//
//   node login.mjs [url]
//
// Opens a browser window on the app. Sign in to the DEMO account (never a real
// one), then close the window. The session is saved to auth.json (and to
// .profile/ for screen mode). Run it again whenever the session expires.
import path from "node:path";
import { loadProject, loadPlaywright, resolveUrl, sleep } from "./lib/util.mjs";

const { root, config } = loadProject();
const { chromium } = await loadPlaywright(root);
const url = resolveUrl(root, process.argv[2] || config.app.url);
const authFile = path.resolve(root, config.app.auth || "auth.json");

const ctx = await chromium.launchPersistentContext(path.join(root, ".profile"), { headless: false, viewport: null, args: ["--window-size=1280,860"] });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto(url);
console.log(`Sign in to the demo account in the browser window, then close the window.\nSaving the session to ${authFile} as you go.`);
let open = true;
ctx.on("close", () => (open = false));
while (open && ctx.pages().length > 0) {
  await ctx.storageState({ path: authFile }).catch(() => {});
  await sleep(1500);
}
await ctx.close().catch(() => {});
console.log(`saved ${authFile}`);
