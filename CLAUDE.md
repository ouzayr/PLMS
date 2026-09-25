# CLAUDE.md

Guidance for Claude when working in this repo. Read this first, then `README.md` (user-facing, including the Google setup) and `BOOK-FORMAT-GUIDE.md` (book JSON format).

## Owner preferences (follow these)
- **Keep it simple.** The app is deliberately **one HTML file** with no build step, no framework, no npm dependencies at runtime and no server. Don't introduce any of these without asking.
- Communication: direct, concise, frank. No filler, no flattery.
- Hosting: **Azure Storage static website** (the file is uploaded to the `$web` container). Google sync requires https, so it doesn't work from `file://`.

## What the app is
**Framework Library** (`framework-library.html`) is a mobile-first reader for study books (NIST, ISO, ITIL, CISM…). Each book has chapters, sections (one page each), chapter quizzes, flashcards and a glossary. Books are JSON files that the user imports. There is full-text search and a combined glossary.

## Status

### Implemented (branch `claude/reading-app-google-sync-categories-2y3xj6`)
- **No built-in books.** The shelf starts empty and `BUILTIN` was removed. Book JSONs live in `Books/` for importing.
- **Categories per book.** Sources:
  - an optional `categories` array in the book JSON (validated: array of strings);
  - editing on the book page (chips with ×, "+ Add category", comma-separated input, datalist of existing labels, case-insensitive reuse of the existing spelling).

  The library has single-select filter chips (All / each category / Uncategorised) with counts, and the selected filter persists per device. Export injects the current categories into the book JSON.
- **Two modes:**
  - **Local (default):** `localStorage`, same as before.
  - **Google:** optional sync via Google Identity Services (token model) and the Drive **appDataFolder** (`drive.appdata` scope). Local-first with timestamped merges. Top-bar cloud icon states: ok / busy / auth / offline / error. Library "Reconnect" banner. Settings section for connect, sync now and disconnect. Disconnect **always keeps** local data (owner's choice).
- **Migration from the v1 state format** is automatic (`normalize()`). Progress for formerly built-in books re-attaches when the same book id is imported again.
- **Backup format v2** (includes `lib` and `removed`; excludes account data). Restoring a v1 backup still works.
- `tests/e2e.js`: 21 end-to-end checks with a fake GIS and an in-memory Drive (see Testing).
- Docs: README (detailed Azure + Google setup, troubleshooting), BOOK-FORMAT-GUIDE (`categories` field, no built-ins), `Books/book-template.json` (has `categories`).

### Pending (needs the owner, or needs a real environment)
1. **Set `GOOGLE_CLIENT_ID`** in `framework-library.html` (empty = sync disabled). Steps are in README.
2. **Deploy to Azure** and add the Azure origin to the OAuth client's *Authorized JavaScript origins*.
3. **First real-world test against Google.** Sync has only been verified against the fake Drive in `tests/e2e.js`, never against real Google endpoints. Things to watch on the first real run:
   - the multipart upload format;
   - `alt=media` responses;
   - `about?fields=user(emailAddress)`;
   - pop-up behaviour on iOS Safari.
4. The branch hasn't been merged or opened as a PR yet (as of this writing).

### Known limitations (by design, or accepted for simplicity)
- **Google access tokens last about 1 hour.** Silent renewal needs a pop-up, which only works inside a user gesture. After expiry the UI shows "Reconnect", and one tap renews the token (`prompt:''` + `login_hint`, so the pop-up auto-closes). Removing this limit needs a backend (auth-code flow with refresh tokens) or Firebase Auth.
- `localStorage` is about 5 MB per origin. All 8 books in `Books/` total about 1.3 MB. A large library would need IndexedDB.
- Concurrent `state.json` writes from two devices can momentarily overwrite each other. This self-heals on the next sync of the device whose write was lost, because each device re-merges its local copy. Duplicate `state.json` files (from a create race) are merged and the extras deleted.
- Tombstones (`S.removed`) and orphaned progress (for example old built-in book ids) are never pruned. They are small, and the orphaned progress is intentional: it lets progress re-attach on re-import.
- `driveList` ignores pagination (`pageSize=1000`), which is fine below about 1000 books.
- Categories can't be renamed or deleted globally, only per book.

### Suggested enhancements (rough priority)
1. **Periodic pull while the tab is visible** (e.g. every 5 min) so changes from another device show up without switching tabs. Cheap: 1 list plus 1 get per sync.
2. **Manage categories** screen in Settings: rename, merge or delete a label across all books.
3. **"Add from collection"**: publish `Books/*.json` plus a `books-index.json` manifest next to the HTML on Azure, and add an in-app picker that fetches and imports them. This removes the download-then-import step.
4. **PWA**: manifest plus service worker for installing on the phone and offline start. Note: the service worker must not cache the GIS script or Drive calls.
5. **IndexedDB for book content** (keep small state in localStorage) to remove the 5 MB ceiling.
6. **Deploy automation**: a GitHub Action that uploads to `$web` (`az storage blob upload-batch`) and injects `GOOGLE_CLIENT_ID` from a repo variable. Also add a CI job running `node tests/e2e.js`.
7. **Settings → "Delete my data from Google Drive"** button (delete all appDataFolder files, then disconnect).
8. Shelf sorting (recent, progress, title), multi-select category filter, category filter in Search, categories shown on covers.
9. **Persistent sign-in** (only if the 1-hour reconnect annoys the owner). Options:
   - Firebase Auth + Firestore: more setup, 1 MB doc limit, so books need one doc each or chunking.
   - An Azure Function for the OAuth auth-code exchange that stores the refresh token in an HttpOnly cookie. Adds a server, which goes against "simplest".

## File map
| Path | Purpose |
|---|---|
| `framework-library.html` | Entire app: `<style>`, markup (top bar, `#view`, bottom tabs, hidden `#filein`, `#toast`), and one IIFE `<script>` |
| `Books/*.json` | Importable books (`fwlib.book/1`). `book-template.json` shows every block type |
| `BOOK-FORMAT-GUIDE.md` | Book schema, validation rules, content standards, existing ids and colours |
| `tests/e2e.js` | Playwright end-to-end test (fake Google) |
| `README.md` | User docs + step-by-step Google/Azure setup |

## Architecture (inside the `<script>` IIFE, in file order)
- **Config:** `TEMPLATE` (the downloadable template), `KEY='fwlib.v1'` (the localStorage key, kept for backward compatibility even though the state is v2), `BLOCK_TYPES`, `GOOGLE_CLIENT_ID`.
- **Storage:** the state object `S`, then `normalize()`, `persist()`, `save()`, `changed()` (see Rules).
- **Utils:** `$`, `esc`, `fmt` (only `**bold**` and `` `code` ``), `enc`, `safeColor`, `toast`, `download`, `applyTheme`.
- **Books/progress:** `books()`, `getBook`, `prog`, `resetProg`, `isDone`, `removeBook`, `secList`, `stats`, `chStats`, `resumeTarget`.
- **Categories:** `NONE` (sentinel `' none'`; labels are trimmed, so no label can equal it), `cleanCats` (trim, collapse whitespace, ≤40 chars, case-insensitive dedupe, ≤20 labels), `catsOf`, `allCats`, `setCats`, `addCats`.
- **Import/export:** `validateBook`, the `#filein` change handler (books or backups), `exportBackup`, `restoreBackup`, `exportBook`.
- **Views** (hash router, `route()`):

  | Route | Renderer |
  |---|---|
  | `#/` | `renderLibrary` |
  | `#/book/:id` | `renderBook` |
  | `#/read/:b/:c/:s` | `renderRead` |
  | `#/quiz/:b/:c` | `renderQuiz` |
  | `#/cards/:b` | `renderCards` |
  | `#/glossary/:b` | `renderGlossary` |
  | `#/search` | `renderSearch` |
  | `#/settings` | `renderSettings` |

- **Google sync:**
  - auth: `syncAvailable`, `connected`, `getToken`/`setToken` (localStorage `fwlib.gtoken` + in-memory fallback), `loadGIS`, `authorize`, `onToken`, `onAuthError`, `disconnect`;
  - Drive calls: `api` (fetch wrapper; 401 → clears the token, throws `{auth:true}`), `driveList`/`driveGet`/`drivePut` (multipart create or media PATCH)/`driveDel`;
  - merge logic: `cleanDoc`, `mergeProg`, `mergeDocs`, `canon` (key-sorted JSON), `applyMerged`, `runSync`;
  - scheduling and UI: `scheduleSync` (2 s debounce), `syncNow`, `setSync`/`syncText` (UI), `refresh`, `initSync` (startup + `visibilitychange`/`online` listeners).

### State `S` (localStorage `fwlib.v1`)
```
{ v:2,
  imported: [bookObject…],                 // book content, in shelf order
  lib:      { [id]: {rev, cats:[…], catsAt} }, // rev = import time of this content; catsAt = last category edit
  removed:  { [id]: time },                // tombstones for removed books
  books:    { [id]: progress },            // progress, below
  lastBook, theme, filter,                 // theme/filter are per-device (not synced)
  google:   null | {email, last} }         // per-device connection info (not synced, not in backups)
progress = { done:{ "chapId/secId": time | -time },  // negative = marked unread
             last:{c,s,y,t}, quiz:{ chapId:{best,last,attempts,at} },
             cards:{ index:level0-3 }, cardsAt, reset }
```
Invariant: every book in `S.imported` has an `S.lib` entry, and `normalize()` enforces it.

### Sync protocol (Drive appDataFolder)
- **Files:** `state.json` = `{lib, removed, progress}`, plus one `book-<id>.json` = `{rev, book}` per book.
- **`runSync()` steps:**
  1. List the files.
  2. Get and merge every `state.json` (duplicates get merged).
  3. Download book files whose remote `rev` is higher than the local one and that aren't tombstoned.
  4. Run `applyMerged(mergeDocs(local, remote))` synchronously. This re-merges with the *current* local state, so edits made during the awaits aren't lost.
  5. Upload books whose rev differs from the remote index (or whose file is missing), and delete files of tombstoned books.
  6. Upload `state.json` if `canon(doc) !== canon(remote)`.

  Failure → `dirty=true` and the state becomes auth / offline / error. A change during a sync sets `again` → the sync reruns.
- **Merge rules** (commutative and idempotent, so any order converges):
  - `removed`: max time per id. A book is present iff `lib.rev > removed[id]`.
  - `lib.rev`: max, but `applyMerged` uses the rev of the content actually available locally or downloaded, and drops entries with no content anywhere (self-healing).
  - `cats`: last writer wins by `catsAt`.
  - Progress: `reset` = max, and anything with a time ≤ `reset` is dropped.
    - `done`: per key, the larger |time| wins (negative = unread).
    - `last`: latest `t`.
    - `quiz`: best = max, attempts = max, `last`/`at` from the newest.
    - `cards`: the whole map, by latest `cardsAt`.
  - `S.lastBook`: the book whose `last.t` is newest.

## Rules and gotchas when changing code
- **Escape everything.** All book and user text goes through `esc()`/`fmt()` before `innerHTML`, including categories in `data-*` attributes. Book text is plain text, never HTML.
- **Pick the right save:**
  - `changed()` for anything that should sync (read or unread, quiz, cards, import, remove, categories, resets);
  - `save()` for noisy local writes (scroll position; it marks dirty, and the data syncs on tab hide or the next change);
  - `persist()` for per-device settings (theme, filter, google meta).
- **Every synced value needs a timestamp.** If you add a synced field, update `cleanDoc`, `mergeProg`/`mergeDocs` and `normalize()`, and add a test in `tests/e2e.js`.
- **Update progress objects in place.** `applyMerged` updates `S.books[id]` in place because open views (reader, quiz, cards) hold a reference `p` to it. Don't replace those objects during a sync. `resetProg` replaces them, but it's only called from pages that re-render right afterwards.
- **Pop-up timing.** `authorize()` must run synchronously inside a click handler, or browsers block the Google pop-up. GIS is preloaded on startup when connected, and whenever Settings renders.
- **Status checks:**
  - `connected()` is false when `GOOGLE_CLIENT_ID` is empty or the page is on `file://`, even if `S.google` is set.
  - Section read status must go through `isDone()` (values can be negative), never a truthiness check on `p.done[key]`.
- **Don't reintroduce built-in books.** The owner wants an empty default shelf.
- **Style:** ES5 (`var`, `function`, no arrow functions or modules in the app), compact one-line helpers, CSS variables with light/dark themes (`:root` + `[data-theme]` + `prefers-color-scheme`), 44 px touch targets, mobile-first with a 700 px breakpoint.

## Testing
- **Syntax and lint check:** extract the script and run `node --check`, e.g.:
  ```
  python3 -c "import re;s=open('framework-library.html').read();open('/tmp/app.js','w').write(re.search(r'<script>(.*)</script>',s,re.S).group(1))" && node --check /tmp/app.js
  ```
- **End-to-end:** `node tests/e2e.js` from the repo root. It needs Playwright with Chromium: locally `npm i -D playwright && npx playwright install chromium`. Claude Code cloud sessions have both preinstalled; don't run `playwright install` there.
  - The page is served from a fake `https://plms.test` origin via route interception, with a test client ID injected.
  - `accounts.google.com/gsi/client` is replaced by a stub that returns tokens immediately.
  - `www.googleapis.com` is served by an in-memory Drive shared by two browser contexts (devices A and B).
  - It covers: empty shelf; categories (add, reuse case, remove, filter, persistence, JSON import, export); read/unread; v1 migration; the `file://` message; connect/upload; merge of local and remote; propagation of remove, categories, unread and reset; token expiry → Reconnect with `prompt:''` + `login_hint`; 401 mid-session; re-import after removal; disconnect keeps data; backup v2; duplicate `state.json` cleanup.
- Run both checks before every push. Update the test when you change behaviour.

## Deployment
Upload `framework-library.html` to the Azure storage account's `$web` container (index document = `framework-library.html`). The Azure origin must be listed in the Google OAuth client's Authorized JavaScript origins. See README → *Enabling Google sync*.
