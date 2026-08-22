# Harry's 1,500-Word Quest

A standalone vocabulary practice site for Harry:

- 1,500 vocabulary questions in 30 sessions of 50
- 908 original Zozeck Grade 4–5 questions selected by exact answer-word match
- 592 new questions built from the existing Harry vocabulary meaning and example
- immediate answer feedback and explanations
- missed words move to Round 2, Round 3, and later rounds until mastered
- progress saves automatically in the browser
- no previous-question control

## Open locally

Open `index.html` in a modern browser. The question data is supplied through `questions.js`, so the site also works from a local `file://` address.

## Rebuild the question data

```bash
npm run build:data
npm test
```

The rebuild script reads the local Zozeck Grade 4–5 export and the public [Harry Vocabulary 1,500](https://shangguanyun08.github.io/harry-vocabulary-1500/) data.

## Public site

<https://shangguanyun08.github.io/harry-vocabulary-1500-quiz/>
