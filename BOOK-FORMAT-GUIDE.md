# Framework Library: Book Generation Guide

This file tells an AI (or a person) how to write a new **book** for the Framework Library app. Give the AI the whole file plus a request such as *"Create a book on ISO/IEC 27001:2022 following this guide"*. The output must be **one valid JSON file** that the app can import.

---

## 1. How the app works

- **Framework Library** is a single, offline HTML file (`framework-library.html`). It is designed for phones first and works on laptops too.
- It shows a **library shelf** of books. Some are built in; the user adds more by importing `.json` files (Settings, then Import books).
- Each book has **chapters**. Each chapter has **sections**, and each section is one reading page. Each chapter can also have a **quiz**. Each book can have **flashcards** and a **glossary**.
- Progress is saved in the browser's local storage. That covers sections read, the last position including scroll, best quiz scores and flashcard mastery. It is saved per device; users move it between devices with Export backup and Restore backup.
- **Search** covers every book's text, including control IDs. It also has a combined glossary.
- Importing a book with an `id` that already exists asks the user whether to replace it, and progress is kept. The `id` of a built-in book cannot be reused.
- **Text is plain text, not HTML.** Only two inline formats are supported:
  - `**bold**`
  - `` `code` ``

  Any HTML tags are shown as literal text.

---

## 2. JSON structure

### 2.1 Book (top level)

```json
{
  "schema": "fwlib.book/1",
  "id": "iso-27001-2022",
  "title": "ISO/IEC 27001:2022",
  "subtitle": "Information security management systems",
  "source": "Based on ISO/IEC 27001:2022 and ISO/IEC 27002:2022. Requirements paraphrased",
  "version": "2022",
  "color": "#2F5D50",
  "estimatedMinutes": 240,
  "description": "One or two sentences shown on the book page. Supports **bold**.",
  "chapters": [ /* Chapter objects */ ],
  "flashcards": [ /* Flashcard objects */ ],
  "glossary": [ /* Glossary objects */ ]
}
```

| Field | Required | Rules |
|---|---|---|
| `schema` | Recommended | Always `"fwlib.book/1"` |
| `id` | **Yes** | Lowercase letters, digits and hyphens; 2 to 61 characters; must start with a letter or digit. Regex: `^[a-z0-9][a-z0-9-]{1,60}$`. Must be unique. |
| `title` | **Yes** | Short; appears on the book cover |
| `subtitle` | No | Shown under the title on the cover |
| `source` | No | Where the content comes from. Say if text is paraphrased. |
| `version` | No | The framework version, shown as "Version X" |
| `color` | No | Cover colour as a hex value (`#RRGGBB`). Pick a darkish colour so white text is readable, and one not already on the shelf (see §6). |
| `estimatedMinutes` | No | Total reading time in minutes |
| `description` | No | Shown on the book page |
| `chapters` | **Yes** | Non-empty array |
| `flashcards` | No | Array |
| `glossary` | No | Array |

### 2.2 Chapter

```json
{
  "id": "context",
  "title": "Clause 4: Context of the organization",
  "summary": "One line describing the chapter.",
  "sections": [ /* Section objects */ ],
  "quiz": [ /* Question objects */ ]
}
```

- `id` is required and must be unique within the book. Keep it short and URL-safe, e.g. `govern`, `d2a`, `c1-3`.
- `title` is required. `summary` is optional but recommended.
- `sections` is required and must not be empty.
- `quiz` is optional. When present, the "Done" button on the chapter's last section leads into the quiz.

### 2.3 Section

```json
{
  "id": "interested-parties",
  "title": "4.2 Understanding interested parties",
  "blocks": [ /* Block objects */ ]
}
```

- `id` is required and must be unique **within its chapter**.
- `title` and `blocks` are required. `blocks` may be empty, but never should be.
- One section should take about **2 to 6 minutes** to read on a phone.

### 2.4 Blocks

There are seven block types. Any other `type` fails validation.

| `type` | Required fields | Optional fields | Renders as |
|---|---|---|---|
| `p` | `text` | | Paragraph |
| `h` | `text` | | Subheading within a section |
| `list` | `items` (array of strings) | `ordered` (true or false) | Bullet list, or numbered if `ordered` is true |
| `table` | `headers` (array of strings), `rows` (array of arrays of strings) | | Table that scrolls sideways on phones |
| `callout` | `text` | `style`, `title` | Highlighted box |
| `def` | `term`, `text` | | Definition, with the term in bold |
| `control` | `id`, `text` | `practice`, `example` | Card for a control, requirement or outcome |

**Callout `style` values** (the default title is shown when `title` is omitted):

| style | Default title | Use for |
|---|---|---|
| `tip` | Tip | Practical advice |
| `warn` | Watch out | Pitfalls and caveats |
| `example` | Example | Concrete scenarios |
| `exam` | Exam focus | What exams test |
| `exec` | Executive view | Board-level or business framing |
| `note` | Note | Anything else |

**Control block**: use it for every numbered requirement, control, safeguard or outcome in a framework.

```json
{
  "type": "control",
  "id": "A.5.15 | Organizational",
  "text": "**Access control.** Rules to control physical and logical access are established and implemented based on business and security requirements.",
  "practice": "What an organisation actually does, and what evidence an auditor looks for.",
  "example": "A concrete, realistic scenario, e.g. a bank, manufacturer, hospital or SaaS company."
}
```

- `id` is shown as a small coloured label, and search covers it. Useful patterns:
  - `"PR.AA-05"`
  - `"6.5 | IG1 | Protect"` (number | tier | function)
  - `"GOVERN 1.6"`
- Put the control's title in bold at the start of `text`, then the requirement.
- Don't repeat the title word for word as the requirement. Say what it means.

**Table rules:** every row must have exactly as many cells as `headers`. On phones, keep tables to 4 columns or fewer. Cells support `**bold**` and `` `code` ``.

### 2.5 Quiz question

```json
{
  "q": "Which clause requires determining interested parties?",
  "options": ["4.1", "4.2", "5.1", "6.1"],
  "answer": 1,
  "explain": "4.2 covers interested parties and their requirements; 4.1 covers internal and external issues."
}
```

- `answer` is the **0-based index** of the correct option.
- Use 4 options.
- **Spread correct answers evenly across positions 0 to 3.** Never put most answers in the same slot. Shuffle the options after writing them, keeping options that are a numeric sequence in order.
- `explain` is required in practice. Say why the answer is right and, where useful, why a tempting option is wrong.
- Never refer to option letters ("A", "B") in `q` or `explain`, because the order may change. Don't use "all of the above".

### 2.6 Flashcard and glossary

```json
{ "front": "Term or question", "back": "Answer, one to three lines", "tag": "Short group label" }
{ "term": "Residual risk", "definition": "Risk remaining after controls." }
```

---

## 3. Validation (the import fails if any of these fail)

1. The file is valid JSON (UTF-8). The root is a book object, an array of books, or `{ "books": [...] }`.
2. `id` matches `^[a-z0-9][a-z0-9-]{1,60}$` and is not one of the built-in ids (§6).
3. `title` is a non-empty string, and `color`, if present, is `#` followed by 3 to 8 hex digits.
4. `chapters` is non-empty. Each chapter has a unique `id`, a `title` and a non-empty `sections` array.
5. Each section has an `id` unique within its chapter, a `title` and a `blocks` array.
6. Each block has a valid `type` and its required fields, as in §2.4.
7. Each quiz question has `q`, at least 2 `options`, and an `answer` that is an integer within the options' range.
8. Each flashcard has `front` and `back`. Each glossary entry has `term` and `definition`.

Also check these yourself (the app doesn't enforce them, but they matter):
- Table rows have the same length as the headers.
- The count of control blocks equals the framework's official count, e.g. 93 for ISO 27001 Annex A.
- There are no HTML tags in text.
- Correct answers are spread across positions.

---

## 4. Content standards

**Structure**
- **Chapter 1** is an overview: what the framework is, who owns it, the current version and date, its structure, and how it relates to other frameworks.
- **Core chapters** follow the framework's own structure (domains, clauses, functions or controls). Cover **every** control or requirement, each as a `control` block.
- **Closing chapters** cover how to apply it: implementation roadmap, assessment approach, metrics, board reporting, a worked case study and common pitfalls.
- For certification exams, add:
  - exam format and eligibility
  - the "mindset" or question technique
  - a final review with formulas and terms
  - a practice-exam chapter (a short instruction section plus a 25 to 30 question quiz)

**Quantities (guideline)**
- 5 to 8 quiz questions per chapter.
- 30 to 60 flashcards.
- 30 to 50 glossary terms.
- Sections of about 150 to 600 words.

**Accuracy**
- Check the current version, dates, counts and exam details against the owner's official site before writing, because frameworks change (e.g. CSF 2.0 in 2024, CIS Controls v8.1 in 2024, ITIL 5 in 2026, the CISM outline change in November 2026).
- Put exact counts in the text and check them (e.g. "22 categories, 106 subcategories").
- If something can't be verified, say so in a `warn` callout rather than guessing.
- Put the verification date or version in `source` or `version`.

**Copyright**
- Public-domain text (e.g. NIST publications) may be quoted.
- Paraphrase copyrighted text (ISO, ISACA, PeopleCert/ITIL, CIS under CC BY-NC-ND). Titles and short identifiers are fine.
- Say "paraphrased" in `source`.

**Writing style**
- Plain, direct language, written for a busy professional reading on a phone.
- Short paragraphs; lists and tables where they help scanning.
- Examples come from realistic sectors (banking, insurance, oil and gas, manufacturing, telecom, public sector, healthcare, SaaS) and a mix of regions, including MENA and Africa.
- Every control gets:
  - `practice`: what to do and what evidence proves it
  - `example`: one concrete scenario
- Use callouts sparingly and purposefully, about one or two per section.

---

## 5. Workflow for the AI

1. **Research:** confirm the latest version, structure and counts from official sources.
2. **Outline:** chapter and section list with ids, and the planned control count per chapter.
3. **Write the content chapter by chapter.** For large books, generate with a script (e.g. Python helper functions that build the dicts) rather than writing raw JSON by hand.
4. **Build the quizzes, shuffle their options,** and check that the answer positions are balanced.
5. **Validate** against §3, including the control count.
6. **Output** one file named `<id>.json`.

Suggested Python helpers:

```python
def P(t): return {"type":"p","text":t}
def H(t): return {"type":"h","text":t}
def L(items, ordered=False): return {"type":"list","items":items,"ordered":ordered}
def T(headers, rows): return {"type":"table","headers":headers,"rows":rows}
def C(style, title, text): return {"type":"callout","style":style,"title":title,"text":text}
def D(term, text): return {"type":"def","term":term,"text":text}
def K(cid, text, practice, example): return {"type":"control","id":cid,"text":text,"practice":practice,"example":example}
def S(sid, title, *blocks): return {"id":sid,"title":title,"blocks":list(blocks)}
def Q(q, options, answer, explain): return {"q":q,"options":options,"answer":answer,"explain":explain}
def CH(cid, title, summary, sections, quiz=None): return {"id":cid,"title":title,"summary":summary,"sections":sections,"quiz":quiz or []}
def F(front, back, tag=""): return {"front":front,"back":back,"tag":tag}
def G(term, definition): return {"term":term,"definition":definition}
```

---

## 6. Existing books (don't reuse these ids or colours)

| id | Title | Colour |
|---|---|---|
| `frameworks-101` | Frameworks 101 (built in) | `#4B5A2A` |
| `nist-csf-2` | NIST CSF 2.0 (built in) | `#1F4E79` |
| `nist-ai-rmf` | NIST AI RMF 1.0 (built in) | `#5B3F8C` |
| `itil-5-foundation` | ITIL (Version 5) Foundation (built in) | `#1C6E5E` |
| `cis-controls-benchmarks` | CIS Controls and Benchmarks (imported) | `#8C4A1F` |
| `isaca-cism` | ISACA CISM (imported) | `#7A2340` |

Ideas for future books: `iso-27001-2022`, `cobit-2019`, `iso-42001`, `eu-ai-act`, `pci-dss-4`, `isaca-crisc`, `isaca-cisa`, `togaf-10`, `iso-22301`, `nist-800-53`.

---

## 7. Complete minimal example

```json
{
  "schema": "fwlib.book/1",
  "id": "sample-framework",
  "title": "Sample Framework",
  "subtitle": "A two-section example",
  "source": "Illustrative only",
  "version": "1.0",
  "color": "#3A4F7A",
  "estimatedMinutes": 10,
  "description": "Shows every block type.",
  "chapters": [
    {
      "id": "basics",
      "title": "Basics",
      "summary": "What the framework is.",
      "sections": [
        {
          "id": "intro",
          "title": "Introduction",
          "blocks": [
            { "type": "p", "text": "A paragraph with **bold** and `code`." },
            { "type": "h", "text": "Structure" },
            { "type": "list", "items": ["First point", "Second point"], "ordered": false },
            { "type": "table", "headers": ["Level", "Meaning"], "rows": [["1", "Basic"], ["2", "Advanced"]] },
            { "type": "callout", "style": "tip", "title": "Remember", "text": "Callouts highlight key points." },
            { "type": "def", "term": "Control", "text": "A measure that modifies risk." }
          ]
        },
        {
          "id": "controls",
          "title": "Controls",
          "blocks": [
            {
              "type": "control",
              "id": "SF-1 | Basic",
              "text": "**Asset inventory.** Keep an up-to-date list of assets with owners.",
              "practice": "Automated discovery feeding a CMDB; quarterly review. Evidence: inventory export with owners.",
              "example": "A retailer finds 40 unmanaged point-of-sale devices during reconciliation."
            }
          ]
        }
      ],
      "quiz": [
        {
          "q": "What does SF-1 require?",
          "options": ["Encryption", "Penetration tests", "An asset inventory with owners", "A SIEM"],
          "answer": 2,
          "explain": "SF-1 is about knowing your assets and who owns them."
        }
      ]
    }
  ],
  "flashcards": [ { "front": "SF-1", "back": "Asset inventory with owners", "tag": "Controls" } ],
  "glossary": [ { "term": "CMDB", "definition": "Configuration management database." } ]
}
```

---

## 8. Prompt template

> Using the attached "Framework Library: Book Generation Guide", create a complete book on **[FRAMEWORK / CERTIFICATION, VERSION]**.
> - Verify the current version, structure and counts from official sources first.
> - Cover every [control / requirement / domain subtopic] as control blocks with practice guidance and examples.
> - Include [exam prep: format, mindset, practice exam] if it's a certification.
> - Paraphrase copyrighted text.
> - Output a single valid JSON file named `<id>.json` that passes every check in §3, with correct answers spread evenly across positions.
