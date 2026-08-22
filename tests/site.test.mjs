import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const questions = JSON.parse(fs.readFileSync(path.join(root, "questions.json"), "utf8"));
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

test("contains exactly 1,500 valid questions in 30 sessions", () => {
  assert.equal(questions.length, 1500);
  assert.equal(new Set(questions.map((item) => item.id)).size, 1500);
  assert.equal(new Set(questions.map((item) => item.word.toLowerCase())).size, 1500);
  assert.equal(questions.length / 50, 30);

  for (const item of questions) {
    assert.ok(item.question.trim());
    assert.ok(item.explanation.trim());
    assert.equal(item.options.length, 4);
    assert.equal(new Set(item.options.map((option) => option.text.toLowerCase())).size, 4);
    const answer = item.options.find((option) => option.letter === item.answer);
    assert.ok(answer);
    assert.equal(answer.text.toLowerCase(), item.word.toLowerCase());
  }
});

test("preserves 908 Zozeck questions and creates 592 controlled questions", () => {
  const zozeck = questions.filter((item) => item.questionSource === "zozeck");
  const generated = questions.filter((item) => item.questionSource === "generated");
  assert.equal(zozeck.length, 908);
  assert.equal(generated.length, 592);
  assert.ok(zozeck.every((item) => Number.isInteger(item.zozeckChapter)));
  assert.ok(generated.every((item) => item.question.includes(item.meaning)));
  assert.ok(generated.every((item) => item.question.includes("______")));
});

test("ships an offline-friendly static app with saved review rounds", () => {
  assert.match(html, /Harry's Vocabulary Practice/);
  assert.match(html, /questions\.js/);
  assert.match(html, /Round 1 asks all 50 questions/);
  assert.match(html, /One-way progress/);
  assert.match(html, /Select vocabulary set/);
  assert.match(app, /localStorage\.setItem/);
  assert.match(app, /session\.wrong/);
  assert.match(app, /session\.round \+= 1/);
  assert.match(app, /pendingAnswer/);
  assert.doesNotMatch(html, /previous|go back/i);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /grid-template-columns: minmax\(270px, 340px\)/);
  new vm.Script(app);
});
