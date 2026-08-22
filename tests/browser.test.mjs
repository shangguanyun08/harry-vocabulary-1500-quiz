import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const modules = process.env.CODEX_NODE_MODULES || "C:/Users/A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = await import(pathToFileURL(path.join(modules, "playwright", "index.mjs")).href);
const questions = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const questionById = new Map(questions.map((item) => [item.id, item]));

const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

function startServer() {
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const file = path.resolve(root, relative);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function wordIdFromLabel(label) {
  return Number(label.match(/Word (\d+)/)?.[1]);
}

test("completes Round 1, persists feedback, and masters misses in Round 2", async () => {
  const server = await startServer();
  const address = server.address();
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1365, height: 900 }, deviceScaleFactor: 1 });
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });

  try {
    await page.goto("http://127.0.0.1:" + address.port, { waitUntil: "networkidle" });
    assert.equal(await page.locator(".session-card").count(), 30);
    assert.match(await page.locator("h1").first().textContent(), /Build a powerful/);
    await page.screenshot({ path: path.join(artifacts, "dashboard-desktop.png"), fullPage: true });

    await page.locator('.session-card[data-session="1"]').click();
    assert.equal(await page.locator("#quiz-round-label").textContent(), "Round 1");
    assert.equal(await page.locator('[aria-label*="previous" i]').count(), 0);

    const firstId = wordIdFromLabel(await page.locator("#word-rank").textContent());
    const first = questionById.get(firstId);
    const wrong = first.options.find((option) => option.letter !== first.answer);
    await page.locator('.choice[data-letter="' + wrong.letter + '"]').click();
    await page.locator("#feedback-title").waitFor({ state: "visible" });
    assert.equal(await page.locator("#feedback-title").textContent(), "Not quite");

    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#continue-button").textContent(), "Continue Session 1");
    await page.locator("#continue-button").click();
    assert.equal(await page.locator("#feedback-title").textContent(), "Not quite");
    assert.equal(await page.locator(".choice:disabled").count(), 4);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(artifacts, "quiz-feedback-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.locator("#next-button").click();

    for (let position = 1; position < 50; position += 1) {
      const id = wordIdFromLabel(await page.locator("#word-rank").textContent());
      const question = questionById.get(id);
      const letter = position === 1
        ? question.options.find((option) => option.letter !== question.answer).letter
        : question.answer;
      await page.locator('.choice[data-letter="' + letter + '"]').click();
      await page.locator("#next-button").click();
    }

    await page.locator("#round-summary").waitFor({ state: "visible" });
    assert.equal(await page.locator("#summary-title").textContent(), "Round 1 complete");
    assert.equal(await page.locator("#round-review").textContent(), "2");
    assert.equal(await page.locator("#start-review").textContent(), "Start Round 2");
    await page.locator("#start-review").click();

    for (let position = 0; position < 2; position += 1) {
      const id = wordIdFromLabel(await page.locator("#word-rank").textContent());
      await page.locator('.choice[data-letter="' + questionById.get(id).answer + '"]').click();
      await page.locator("#next-button").click();
    }

    await page.locator("#completion").waitFor({ state: "visible" });
    assert.match(await page.locator("#completion h1").textContent(), /Every word mastered/);
    assert.equal(await page.locator("#complete-rounds").textContent(), "2");
    await page.locator("#completion .dashboard-link").click();
    assert.match(await page.locator('.session-card[data-session="1"] .session-status').textContent(), /Mastered/);
    await page.screenshot({ path: path.join(artifacts, "dashboard-session-complete.png"), fullPage: true });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
