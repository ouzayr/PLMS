# PLMS
Personal LMS: **Framework Library**, a single-file reading app (`framework-library.html`).

- **Starts empty.** Add books by importing `.json` files. Ready-made books are in `Books/`, and `BOOK-FORMAT-GUIDE.md` explains how to write new ones.
- **Categories.** Give each book one or more categories on its book page, or in the JSON (`"categories": ["NIST", "AI"]`). The library filters by category.
- **Two modes, both optional:**
  - **Local (default):** books and progress stay in this browser. Move them between devices with Settings → Export backup / Restore backup.
  - **Google:** Settings → Connect Google account. Books, categories and progress sync through a hidden app folder in your Google Drive. The app keeps working offline and syncs when it's back online.

## Enabling Google sync (one-time setup)

Google sign-in only works when the page is served over **https**. It does not work when you open the file directly from disk (`file://`).

### 1. Host the file (Azure Storage static website)
1. Open the storage account and go to **Data management → Static website**. Set it to **Enabled** and set the index document name to `framework-library.html`.
2. Upload `framework-library.html` to the `$web` container.
3. Note the **primary endpoint**, e.g. `https://<account>.z13.web.core.windows.net`. If you use a custom domain or CDN, note that URL too.

### 2. Create a Google OAuth client ID
In [Google Cloud Console](https://console.cloud.google.com/):
1. Create a project, or pick an existing one.
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **Google Auth Platform**:
   - **Branding**: enter an app name and a support email.
   - **Audience**: choose External. Either add your Gmail address as a test user, or click **Publish app**. The only scope the app uses is `drive.appdata`, which Google classes as non-sensitive, so publishing needs no verification review.
   - **Clients → Create client**: choose Web application. Under **Authorized JavaScript origins**, add the endpoint from step 1.3 with no path and no trailing slash. You don't need redirect URIs.
4. Copy the **Client ID** (`…apps.googleusercontent.com`).

### 3. Put the client ID in the app
In `framework-library.html`, set:
```js
var GOOGLE_CLIENT_ID = 'YOUR_ID.apps.googleusercontent.com';
```
Then re-upload the file. A client ID is not a secret, so committing it is fine.

## How sync behaves
- **Local-first.** The browser always holds a working copy. When connected, the app merges it with Drive when it opens, about 2 seconds after each change, and when you leave the tab. Changes made offline on two devices are merged, and each item keeps its newest edit.
- **Sign-in lasts about 1 hour.** Google access tokens expire after an hour, and a static page with no server can't renew them in the background. When a token has expired, the cloud icon shows a red dot and the library shows **Reconnect**. One tap renews it: a Google pop-up opens and closes by itself. Allow pop-ups for the site.
- **Disconnect** (Settings) signs out this device only. Local books and progress stay, and the Drive copy stays for your other devices.
- **Where the data is:** a hidden app folder in your own Drive (`state.json` plus one `book-<id>.json` per book). To delete it, open Google Drive → Settings → Manage apps → this app → Delete hidden app data.
