import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const zozeckPath = path.resolve(here, "../exports/zozeck-grade-4-5/zozeck-grade-4-5-data.json");
const wordsUrl = "https://raw.githubusercontent.com/shangguanyun08/harry-vocabulary-1500/main/docs/words.json";

const normalize = (value) => String(value ?? "")
  .trim()
  .toLocaleLowerCase("en-US")
  .replaceAll("’", "'");

const escapeRegExp = (value) => value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function meaningTokens(value) {
  const stop = new Set(["a", "an", "and", "as", "at", "be", "for", "from", "in", "is", "it", "of", "on", "or", "someone", "something", "that", "the", "to", "with"]);
  return new Set(normalize(value).replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((token) => token.length > 2 && !stop.has(token)));
}

function overlap(left, right) {
  const a = meaningTokens(left);
  const b = meaningTokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const token of a) if (b.has(token)) common += 1;
  return common / Math.min(a.size, b.size);
}

function partBucket(meaning) {
  const value = normalize(meaning);
  if (/^to\s/.test(value)) return "verb";
  if (/^(a|an|the)\s/.test(value) || /^(someone|something|one who|a person|a place|a thing)\b/.test(value)) return "noun";
  if (/^(very|not|able|full|having|showing|without|related|ready|likely|easy|difficult)\b/.test(value)) return "modifier";
  return "general";
}

function wordShape(word) {
  const value = normalize(word);
  const single = /^[a-z][a-z'-]*$/.test(value);
  const ending = /ing$/.test(value) ? "ing" : /ed$/.test(value) ? "ed" : /s$/.test(value) ? "s" : "base";
  return { single, ending };
}

function distractorScore(target, candidate) {
  const targetWord = normalize(target.word);
  const candidateWord = normalize(candidate.word);
  const targetShape = wordShape(targetWord);
  const candidateShape = wordShape(candidateWord);
  let score = 0;
  if (targetShape.single !== candidateShape.single) score += 10000;
  if (targetShape.ending !== candidateShape.ending) score += 1000;
  if (targetWord[0] !== candidateWord[0]) score += 100;
  score += Math.abs(targetWord.length - candidateWord.length) * 4;
  score += (hash(target.id + ":" + candidate.id) % 1000) / 1000;
  return score;
}

function sourceScore(question) {
  const blanks = (question.question.match(/_+/g) || []).length;
  const length = question.question.length;
  let score = 0;
  if (blanks === 1) score += 80;
  if (length >= 35 && length <= 180) score += 25;
  if (new Set(question.options.map((option) => normalize(option.text))).size === 4) score += 20;
  score -= Math.max(0, length - 220);
  score -= Number(question.globalNumber || 0) / 100000;
  return score;
}

function chooseDistractors(target, words) {
  const bucket = partBucket(target.meaning);
  const candidates = words
    .filter((item) => item.id !== target.id)
    .filter((item) => item.grade === target.grade)
    .filter((item) => partBucket(item.meaning) === bucket)
    .filter((item) => overlap(item.meaning, target.meaning) < 0.45)
    .filter((item) => !normalize(target.meaning).includes(normalize(item.word)))
    .filter((item) => !normalize(item.meaning).includes(normalize(target.word)))
    .sort((a, b) => distractorScore(target, a) - distractorScore(target, b));

  const fallback = words
    .filter((item) => item.id !== target.id && item.grade === target.grade)
    .sort((a, b) => distractorScore(target, a) - distractorScore(target, b));

  const chosen = [];
  for (const item of [...candidates, ...fallback]) {
    if (chosen.some((entry) => normalize(entry.word) === normalize(item.word))) continue;
    chosen.push(item);
    if (chosen.length === 3) break;
  }
  if (chosen.length !== 3) throw new Error("Could not find distractors for " + target.word);
  return chosen;
}

function generatedQuestion(word, words) {
  const exact = new RegExp("\\b" + escapeRegExp(word.word) + "\\b", "i");
  const hasWord = exact.test(word.example);
  const cloze = hasWord ? word.example.replace(exact, "______") : "";
  const question = hasWord
    ? "Which word meaning “" + word.meaning + "” best completes the sentence?\n“" + cloze + "”"
    : "Which word best matches this meaning?\n“" + word.meaning + "”";
  const choices = [word, ...chooseDistractors(word, words)]
    .sort((a, b) => hash("choice:" + word.id + ":" + a.id) - hash("choice:" + word.id + ":" + b.id))
    .map((item, index) => ({ letter: "ABCD"[index], text: item.word }));
  const answer = choices.find((choice) => normalize(choice.text) === normalize(word.word));

  return {
    id: word.id,
    word: word.word,
    meaning: word.meaning,
    example: word.example,
    grade: word.grade,
    listSource: word.source,
    question,
    options: choices,
    answer: answer.letter,
    answerText: word.word,
    explanation: word.word + " means " + word.meaning + ". Example: " + word.example,
    questionSource: "generated",
  };
}

function originalQuestion(word, source) {
  return {
    id: word.id,
    word: word.word,
    meaning: word.meaning,
    example: word.example,
    grade: word.grade,
    listSource: word.source,
    question: source.question,
    options: source.options.map((option) => ({ letter: option.letter, text: option.text })),
    answer: source.answer,
    answerText: source.answerText,
    explanation: source.solution,
    questionSource: "zozeck",
    zozeckChapter: source.chapter,
    zozeckQuestion: source.numberInChapter,
  };
}

const response = await fetch(wordsUrl);
if (!response.ok) throw new Error("Could not download the 1,500-word source list: " + response.status);
const words = await response.json();
const zozeck = JSON.parse(fs.readFileSync(zozeckPath, "utf8"));

if (!Array.isArray(words) || words.length !== 1500) throw new Error("Expected exactly 1,500 source words");
if (new Set(words.map((item) => normalize(item.word))).size !== 1500) throw new Error("The source list contains duplicate words");

const sourceByAnswer = new Map();
for (const question of zozeck) {
  const key = normalize(question.answerText);
  if (!sourceByAnswer.has(key)) sourceByAnswer.set(key, []);
  sourceByAnswer.get(key).push(question);
}
for (const choices of sourceByAnswer.values()) choices.sort((a, b) => sourceScore(b) - sourceScore(a));

const questions = words.map((word) => {
  const source = sourceByAnswer.get(normalize(word.word))?.[0];
  return source ? originalQuestion(word, source) : generatedQuestion(word, words);
});

for (const item of questions) {
  if (!item.question.trim() || !item.explanation.trim()) throw new Error("Blank question content at ID " + item.id);
  if (item.options.length !== 4) throw new Error("Expected four choices at ID " + item.id);
  if (new Set(item.options.map((option) => normalize(option.text))).size !== 4) throw new Error("Duplicate choices at ID " + item.id);
  const correct = item.options.find((option) => option.letter === item.answer);
  if (!correct || normalize(correct.text) !== normalize(item.word)) throw new Error("Answer mismatch at ID " + item.id);
}

const sourceCounts = questions.reduce((counts, item) => {
  counts[item.questionSource] += 1;
  return counts;
}, { zozeck: 0, generated: 0 });

fs.writeFileSync(path.join(here, "questions.json"), JSON.stringify(questions, null, 2) + "\n", "utf8");
fs.writeFileSync(path.join(here, "questions.js"), "window.HARRY_VOCABULARY_QUESTIONS = " + JSON.stringify(questions) + ";\n", "utf8");
fs.writeFileSync(path.join(here, "data-summary.json"), JSON.stringify({
  total: questions.length,
  sessions: questions.length / 50,
  sessionSize: 50,
  sources: sourceCounts,
  generatedWithCloze: questions.filter((item) => item.questionSource === "generated" && item.question.includes("best completes")).length,
}, null, 2) + "\n", "utf8");

console.log(JSON.stringify({ total: questions.length, ...sourceCounts, sessions: questions.length / 50 }));
