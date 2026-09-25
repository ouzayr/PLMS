# PLMS: Framework Library

A personal reading app for framework and certification study material: chapters, quizzes, flashcards and a glossary. It is **one HTML file** (`framework-library.html`) with no build step and no server code.

## Features

- **Empty shelf by default.** You add books by importing `.json` files. Ready-made books are in `Books/`, and `BOOK-FORMAT-GUIDE.md` explains how to write new ones (you can also give the guide to an AI to generate a book).
- **Categories.** Each book can have one or more categories, set on the book page or in the JSON (`"categories": ["NIST", "AI"]`). The library filters by category (All, each category, Uncategorised). Tapping a category on a book page opens the library filtered to it.
- **Two ways to use it:**
  - **Local (default, no login):** books and progress stay in this browser. You move them between devices with *Settings → Export backup / Restore backup*.
  - **Google (optional):** *Settings → Connect Google account*. Books, categories and progress sync through a hidden app folder in your own Google Drive, and the app still works offline.

---

## Enabling Google sync: step by step

Allow 15 to 20 minutes. You need:
- a Google account (the one you'll sync with),
- an Azure subscription (to host the page),
- a text editor for one line of the HTML file.

> **Why hosting is required.** Google sign-in only works from a web address (`https://…`). It does not work when you double-click the file on your computer (`file://…`). Local mode still works from a file.

Console menus change from time to time. If a label differs slightly, look for the nearest match.

### Step 1: Host the app on Azure (Static website)

**1.1 Create a storage account** (skip this if you already have one you want to use)
1. Go to <https://portal.azure.com> → search **Storage accounts** → **+ Create**.
2. On the **Basics** tab:
   - **Subscription:** yours.
   - **Resource group:** click *Create new* and enter e.g. `plms-rg`.
   - **Storage account name:** globally unique, 3 to 24 lowercase letters and digits, e.g. `plmsreader`.
   - **Region:** the one closest to you.
   - **Performance:** Standard. **Redundancy:** Locally-redundant storage (LRS) is the cheapest and is enough here.
3. Click **Review + create** → **Create**, wait for it to finish, then click **Go to resource**.

**1.2 Turn on the static website**
1. In the storage account's left menu, open **Data management → Static website**.
2. Set **Static website** to **Enabled**.
3. **Index document name:** `framework-library.html`
4. **Error document path:** `framework-library.html` (optional)
5. Click **Save**.
6. Copy the **Primary endpoint**, e.g. `https://plmsreader.z33.web.core.windows.net/`. This is your app's address.

**1.3 Upload the app**
1. In the left menu, open **Data storage → Containers**, then open the **`$web`** container, which Azure created in 1.2.
2. Click **Upload** → select `framework-library.html` → **Upload**.
3. Open the primary endpoint in your browser. You should see *"Your shelf is empty."*

**1.4 Write down your origin.** This is the primary endpoint with **no trailing slash and no path**:
```
https://plmsreader.z33.web.core.windows.net
```
If you later add a custom domain (for example through Azure Front Door), that domain is a second origin, and you'll add it in Step 5 too.

### Step 2: Create a Google Cloud project
1. Go to <https://console.cloud.google.com> and sign in with your Google account.
2. Click the project picker at the top → **New project**.
3. **Project name:** e.g. `PLMS Reader`. **Location:** leave it as is. Click **Create**.
4. Make sure the new project is selected in the project picker.

### Step 3: Enable the Google Drive API
1. Open the menu (☰) → **APIs & Services → Library**.
2. Search for **Google Drive API** → open it → click **Enable**.

If you skip this step, sync fails with a "Google Drive error 403".

### Step 4: Set up the sign-in screen (Google Auth Platform)
1. Open the menu (☰) → **Google Auth Platform**, or type it in the console's search bar. The older name is *APIs & Services → OAuth consent screen*.
2. If you see *"Google Auth Platform not configured yet"*, click **Get started** and complete the wizard:
   - **App information:** App name `Framework Library` (this is what you'll see on Google's sign-in pop-up). User support email: your email.
   - **Audience:** **External**. Internal is only available to Google Workspace organisations.
   - **Contact information:** your email.
   - **Finish:** tick the agreement to the Google API Services User Data Policy → **Continue** → **Create**.
3. **Don't upload a logo** under *Branding*. A logo means Google has to review the app.
4. **Audience** (left menu). Choose one:
   - **Personal use (recommended):** keep **Publishing status = Testing**. Under **Test users**, click **+ Add users**, enter your Gmail address (and anyone else who will use it, up to 100), then **Save**. Only these accounts can sign in.
   - **Open to anyone:** click **Publish app** → **Confirm**. The app only asks for `drive.appdata`, which Google classes as non-sensitive, so no review is needed.
5. **Data Access** (left menu) → **Add or remove scopes**. Filter for `drive.appdata` and tick **`.../auth/drive.appdata`** ("See, create, and delete its own configuration data in your Google Drive"). Click **Update** → **Save**.

### Step 5: Create the OAuth client ID
1. **Google Auth Platform → Clients** → **+ Create client**.
2. **Application type:** **Web application**.
3. **Name:** e.g. `Framework Library web`.
4. **Authorized JavaScript origins** → **+ Add URI** → paste your origin from step 1.4, e.g. `https://plmsreader.z33.web.core.windows.net`.
   - It must be exact: `https`, no trailing `/`, no path.
   - Add one entry per address you'll open the app from (Azure endpoint, custom domain).
   - To test locally as well, add `http://localhost:8080` and serve the file with `npx http-server -p 8080`.
5. **Authorized redirect URIs:** leave empty.
6. Click **Create**. Copy the **Client ID**, which looks like `1234567890-abc…apps.googleusercontent.com`. The app doesn't use the client secret.

> Google notes that new or changed origins can take **5 minutes to a few hours** to take effect. If sign-in fails with `origin_mismatch` right after setup, wait and retry.

### Step 6: Put the client ID into the app and redeploy
1. Open `framework-library.html` in a text editor (or GitHub's web editor).
2. Find this line near the top of the `<script>` section (search for `GOOGLE_CLIENT_ID`):
   ```js
   var GOOGLE_CLIENT_ID = '';
   ```
3. Paste your client ID between the quotes:
   ```js
   var GOOGLE_CLIENT_ID = '1234567890-abc...apps.googleusercontent.com';
   ```
   The client ID is public by design, so it is safe to commit to GitHub. The secret is not used.
4. Upload the file to the `$web` container again, as in step 1.3. Tick **Overwrite if files already exist**.
5. Hard-refresh the page (Ctrl+F5 on a PC, Cmd+Shift+R on a Mac). On a phone, close the tab and reopen it.

### Step 7: Connect and check it works
1. Open your app address → **Settings** → **Google account** → **Connect Google account**. If it says *"Loading Google sign-in. Tap again in a moment"*, tap again.
2. In the Google pop-up, choose your account.
   - In **Testing** mode, Google shows *"Google hasn't verified this app"*. This is expected for your own app. Click **Continue**.
   - Approve the permission: *"See, create, and delete its own configuration data in your Google Drive"*. Leave it ticked.
3. Back in the app, you should see *"Connected. Syncing your library…"*. Settings then shows *"Connected as you@gmail.com. Last synced just now."*, and the cloud icon in the top bar turns green.
4. On a second device (for example your phone), open the same address → Settings → Connect. Your books, categories and progress appear.
5. Optional: open Google Drive → ⚙ **Settings → Manage apps**. *Framework Library* is listed with some *hidden app data*.

Setup is done. From now on you only re-upload the HTML file when the app changes.

### Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| Settings says *"Sync is not set up in this copy of the app"* | `GOOGLE_CLIENT_ID` is empty in the deployed file, or the browser is showing a cached old copy | Do step 6, re-upload, then hard-refresh |
| *"Google sync needs the app to be opened from its web address"* | The file was opened from disk (`file://`) | Use the Azure address |
| Google error **`origin_mismatch`** or **`redirect_uri_mismatch`** | The address in the browser isn't listed as an origin | Add it exactly in step 5, then allow a few minutes |
| Google error **403 `access_denied`**, *"has not completed the Google verification process"* | The app is in Testing mode and this account isn't a test user | Add the account under *Audience → Test users*, or publish |
| *"The Google window was blocked"* | The browser blocked the pop-up | Allow pop-ups for the site and tap again |
| *"Sync needs permission to use its Google Drive app folder"* | The Drive permission box was unticked on the consent screen | Connect again and leave it ticked |
| *"Last sync failed. Google Drive error 403."* | The Drive API isn't enabled | Do step 3 |
| Red dot on the cloud icon, *"Google sync is paused"* | Google sign-in expired (normal after about 1 hour) | Tap **Reconnect**. The pop-up opens and closes by itself |
| Amber dot on the cloud icon | You're offline | Nothing to do. It syncs when you're back online |

---

## How sync behaves

- **Local first.** The browser always keeps a working copy, so reading works offline. When you're connected, the app merges that copy with Google Drive:
  - when the app opens,
  - about 2 seconds after each change (section read, quiz, flashcards, import, categories, removal),
  - when you leave or return to the tab,
  - when you tap the cloud icon.
- **Merging.** Every change carries a timestamp, so edits made on two devices (even offline) are combined and the newest edit of each item wins:
  - sections read are combined from both devices;
  - *Mark as unread*, *Remove book* and *Reset progress* also reach your other devices;
  - "Pick up where you left off" follows whichever device you read on last.
- **The 1-hour sign-in limit.** Google access tokens last about an hour, and a static page with no server can't renew them in the background. When a token has expired, the cloud icon shows a red dot and the library shows **Reconnect**. One tap renews it. Your changes are kept locally in the meantime and upload after you reconnect.
- **Disconnect** (Settings) signs this device out. Books and progress stay on the device, and the Drive copy stays for your other devices.
- **Backups** still work in both modes and don't include account details.

## Your data and privacy

- Synced data lives only in your own Google Drive, in a hidden app folder. The app can only see files it created there. It can't read or change anything else in your Drive.
- The app stores these files there: `state.json` (library, categories, progress) and one `book-<id>.json` per book.
- **To delete the cloud copy:** Google Drive → ⚙ Settings → **Manage apps** → Framework Library → **Options → Delete hidden app data**.
- **To revoke access entirely:** <https://myaccount.google.com/permissions> → Framework Library → remove access.

## Repository layout

| Path | What it is |
|---|---|
| `framework-library.html` | The whole app: HTML, CSS and JS in one file |
| `Books/*.json` | Ready-made books to import. `book-template.json` shows every feature |
| `BOOK-FORMAT-GUIDE.md` | Book JSON format and rules (give it to an AI to generate books) |
| `tests/e2e.js` | End-to-end test with a fake Google Drive: `node tests/e2e.js` |
| `CLAUDE.md` | Notes for Claude (AI assistant): architecture, status, next steps |
