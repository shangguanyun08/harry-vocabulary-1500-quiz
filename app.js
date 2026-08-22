(function () {
  "use strict";

  const questions = Array.isArray(window.HARRY_VOCABULARY_QUESTIONS)
    ? window.HARRY_VOCABULARY_QUESTIONS
    : [];
  const sessionSize = 50;
  const totalSessions = 30;
  const storageKey = "harry-vocabulary-1500-quest-progress-v1";
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const views = ["dashboard", "quiz", "round-summary", "completion"];
  const el = (id) => document.getElementById(id);
  let currentSessionNumber = null;
  let progress = loadProgress();

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && saved.version === 1 && saved.sessions && typeof saved.sessions === "object") return saved;
    } catch {}
    return { version: 1, sessions: {} };
  }

  function saveProgress() {
    localStorage.setItem(storageKey, JSON.stringify(progress));
  }

  function unique(values) {
    return [...new Set(values)];
  }

  function sessionQuestionIds(number) {
    const start = (number - 1) * sessionSize;
    return questions.slice(start, start + sessionSize).map((question) => question.id);
  }

  function createSession(number) {
    return {
      number,
      round: 1,
      queue: sessionQuestionIds(number),
      cursor: 0,
      wrong: [],
      mastered: [],
      attempts: 0,
      completed: false,
      awaitingRoundStart: false,
      pendingAnswer: null,
      summary: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function getSession(number, create) {
    const key = String(number);
    if (!progress.sessions[key] && create) {
      progress.sessions[key] = createSession(number);
      saveProgress();
    }
    return progress.sessions[key];
  }

  function showView(id) {
    for (const view of views) el(view).hidden = view !== id;
    el("save-exit").hidden = id === "dashboard";
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function overallMastered() {
    const ids = new Set();
    for (const session of Object.values(progress.sessions)) {
      for (const id of session.mastered || []) ids.add(id);
    }
    return ids.size;
  }

  function preferredSession() {
    const sessions = Object.values(progress.sessions)
      .filter((session) => !session.completed)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    if (sessions.length) return sessions[0].number;
    for (let number = 1; number <= totalSessions; number += 1) {
      if (!getSession(number, false)?.completed) return number;
    }
    return totalSessions;
  }

  function renderDashboard() {
    currentSessionNumber = null;
    showView("dashboard");
    const mastered = overallMastered();
    const complete = Object.values(progress.sessions).filter((session) => session.completed).length;
    const percent = Math.round(mastered / questions.length * 100);
    el("mastered-count").textContent = mastered.toLocaleString();
    el("completed-count").textContent = complete;
    el("overall-percent").textContent = percent + "% mastered";
    el("overall-bar").style.width = percent + "%";

    const next = preferredSession();
    const nextProgress = getSession(next, false);
    el("continue-button").textContent = nextProgress ? "Continue Session " + next : "Start Session " + next;
    el("continue-button").dataset.session = next;

    const cards = [];
    for (let number = 1; number <= totalSessions; number += 1) {
      const session = getSession(number, false);
      const count = session?.mastered?.length || 0;
      const status = session?.completed ? "completed" : session ? "in-progress" : "new";
      const statusLabel = status === "completed" ? "Mastered" : status === "in-progress" ? "In progress" : "Not started";
      const wordStart = (number - 1) * sessionSize + 1;
      const wordEnd = number * sessionSize;
      cards.push(
        '<button class="session-card ' + status + '" type="button" data-session="' + number + '">' +
          '<div class="session-head"><span class="session-number">' + number + '</span><span class="session-status">' + statusLabel + '</span></div>' +
          '<h3>Words ' + wordStart + "–" + wordEnd + '</h3>' +
          '<p>' + count + ' of 50 mastered' + (session && !session.completed ? " · Round " + session.round : "") + '</p>' +
          '<div class="mini-track" aria-hidden="true"><span style="width:' + (count * 2) + '%"></span></div>' +
        '</button>'
      );
    }
    el("session-grid").innerHTML = cards.join("");
  }

  function openSession(number) {
    if (number < 1 || number > totalSessions) return;
    currentSessionNumber = number;
    const session = getSession(number, true);
    if (session.completed) {
      showCompletion();
    } else if (session.awaitingRoundStart) {
      showRoundSummary();
    } else {
      renderQuestion();
    }
  }

  function currentSession() {
    return getSession(currentSessionNumber, true);
  }

  function currentQuestion() {
    const session = currentSession();
    return questionById.get(session.queue[session.cursor]);
  }

  function renderQuestion() {
    const session = currentSession();
    const question = currentQuestion();
    if (!question) {
      finishRound();
      return;
    }

    showView("quiz");
    el("quiz-session-label").textContent = "Session " + currentSessionNumber + " of " + totalSessions;
    el("quiz-round-label").textContent = "Round " + session.round;
    el("quiz-position").textContent = (session.cursor + 1) + " / " + session.queue.length;
    el("quiz-progress-bar").style.width = ((session.cursor + 1) / session.queue.length * 100) + "%";
    el("word-rank").textContent = "Word " + question.id + " of 1,500";
    el("grade-pill").textContent = "Grade " + question.grade;
    el("question-text").textContent = question.question;
    el("feedback").hidden = true;
    el("feedback").className = "feedback";
    el("next-button").hidden = true;

    const list = el("choice-list");
    list.innerHTML = "";
    for (const option of question.options) {
      const button = document.createElement("button");
      button.className = "choice";
      button.type = "button";
      button.dataset.letter = option.letter;
      const letter = document.createElement("span");
      letter.className = "choice-letter";
      letter.textContent = option.letter;
      const text = document.createElement("span");
      text.textContent = option.text;
      button.append(letter, text);
      button.addEventListener("click", () => answerQuestion(option.letter));
      list.append(button);
    }

    if (session.pendingAnswer && session.pendingAnswer.id === question.id) {
      displayFeedback(question, session.pendingAnswer);
    }
  }

  function answerQuestion(selectedLetter) {
    const session = currentSession();
    const question = currentQuestion();
    if (!question || session.pendingAnswer) return;
    const correct = selectedLetter === question.answer;

    session.attempts += 1;
    if (correct) {
      session.mastered = unique([...(session.mastered || []), question.id]);
    } else {
      session.wrong = unique([...(session.wrong || []), question.id]);
    }
    session.pendingAnswer = {
      id: question.id,
      selectedLetter,
      correct,
    };
    session.updatedAt = new Date().toISOString();
    saveProgress();
    displayFeedback(question, session.pendingAnswer);
  }

  function displayFeedback(question, answer) {
    const buttons = [...el("choice-list").querySelectorAll(".choice")];
    for (const button of buttons) {
      button.disabled = true;
      const letter = button.dataset.letter;
      if (letter === question.answer) button.classList.add("correct-choice");
      else if (letter === answer.selectedLetter) button.classList.add("wrong-choice");
      else button.classList.add("dimmed");
    }

    const correctOption = question.options.find((option) => option.letter === question.answer);
    const feedback = el("feedback");
    feedback.hidden = false;
    feedback.className = answer.correct ? "feedback" : "feedback wrong-feedback";
    el("feedback-icon").textContent = answer.correct ? "✓" : "!";
    el("feedback-title").textContent = answer.correct ? "Correct!" : "Not quite";
    el("feedback-answer").textContent = "The answer is " + question.answer + ". " + correctOption.text + ".";
    el("feedback-explanation").textContent = question.explanation;
    el("feedback-source").textContent = question.questionSource === "zozeck"
      ? "Original Zozeck Grade 4–5 question"
      : "Built from Harry's meaning and example";
    const session = currentSession();
    el("next-button").textContent = session.cursor + 1 === session.queue.length
      ? "Finish Round " + session.round
      : "Next question";
    el("next-button").hidden = false;
    el("next-button").focus({ preventScroll: true });
  }

  function nextQuestion() {
    const session = currentSession();
    if (!session.pendingAnswer) return;
    session.pendingAnswer = null;
    session.cursor += 1;
    session.updatedAt = new Date().toISOString();
    saveProgress();
    if (session.cursor >= session.queue.length) finishRound();
    else renderQuestion();
  }

  function finishRound() {
    const session = currentSession();
    const completedRound = session.round;
    const missed = unique(session.wrong || []);
    const masteredThisRound = session.queue.length - missed.length;
    session.pendingAnswer = null;
    session.summary = {
      round: completedRound,
      total: session.queue.length,
      mastered: masteredThisRound,
      missed: missed.length,
    };

    if (!missed.length) {
      session.completed = true;
      session.awaitingRoundStart = false;
      session.completedAt = new Date().toISOString();
      session.updatedAt = session.completedAt;
      saveProgress();
      showCompletion();
      return;
    }

    session.round += 1;
    session.queue = missed;
    session.cursor = 0;
    session.wrong = [];
    session.awaitingRoundStart = true;
    session.updatedAt = new Date().toISOString();
    saveProgress();
    showRoundSummary();
  }

  function showRoundSummary() {
    const session = currentSession();
    const summary = session.summary || { round: session.round - 1, total: session.queue.length, mastered: 0, missed: session.queue.length };
    showView("round-summary");
    el("summary-session").textContent = "Session " + currentSessionNumber + " of " + totalSessions;
    el("summary-title").textContent = "Round " + summary.round + " complete";
    el("summary-message").textContent = summary.missed + " missed word" + (summary.missed === 1 ? "" : "s") + " will return. Correct words are finished and will not repeat.";
    el("round-mastered").textContent = summary.mastered;
    el("round-review").textContent = summary.missed;
    el("start-review").textContent = "Start Round " + session.round;
  }

  function startReview() {
    const session = currentSession();
    session.awaitingRoundStart = false;
    session.updatedAt = new Date().toISOString();
    saveProgress();
    renderQuestion();
  }

  function showCompletion() {
    const session = currentSession();
    showView("completion");
    el("complete-session").textContent = "Session " + currentSessionNumber + " complete";
    el("complete-rounds").textContent = session.round;
    el("complete-message").textContent = "Excellent work. All 50 words are mastered after " + session.attempts + " total answer" + (session.attempts === 1 ? "" : "s") + ".";
    el("next-session").hidden = currentSessionNumber >= totalSessions;
    if (currentSessionNumber < totalSessions) el("next-session").textContent = "Start Session " + (currentSessionNumber + 1);
  }

  function resetSession() {
    if (!currentSessionNumber) return;
    if (!window.confirm("Erase this session and practice its 50 words again?")) return;
    delete progress.sessions[String(currentSessionNumber)];
    saveProgress();
    openSession(currentSessionNumber);
  }

  function resetAll() {
    if (!window.confirm("Erase all saved progress for every session?")) return;
    progress = { version: 1, sessions: {} };
    saveProgress();
    renderDashboard();
  }

  el("session-grid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-session]");
    if (card) openSession(Number(card.dataset.session));
  });
  el("continue-button").addEventListener("click", (event) => openSession(Number(event.currentTarget.dataset.session)));
  el("next-button").addEventListener("click", nextQuestion);
  el("start-review").addEventListener("click", startReview);
  el("next-session").addEventListener("click", () => openSession(currentSessionNumber + 1));
  el("reset-all").addEventListener("click", resetAll);
  el("brand-home").addEventListener("click", renderDashboard);
  el("save-exit").addEventListener("click", renderDashboard);
  for (const button of document.querySelectorAll(".dashboard-link")) button.addEventListener("click", renderDashboard);
  for (const button of document.querySelectorAll(".reset-session")) button.addEventListener("click", resetSession);

  if (questions.length !== 1500) {
    document.body.innerHTML = '<main class="center-view"><article class="summary-card"><h1>Question data could not load.</h1><p>Please refresh the page.</p></article></main>';
  } else {
    renderDashboard();
  }
})();
