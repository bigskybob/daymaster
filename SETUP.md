# Daymaster Setup Guide
## Phone + iPad + Desktop, synced via Google Drive

---

## What you're setting up
- A permanent URL (GitHub Pages) you bookmark on every device
- Google Drive sync so all devices read/write the same data
- Installable as an app on iPhone and iPad (no App Store needed)

Total time: ~25 minutes, all in the browser, no installs.

---

## PART 1: GitHub (10 min)

### Step 1 — Create a GitHub account
1. Go to **github.com**
2. Click **Sign up**
3. Choose a username (this becomes part of your URL, e.g. `johndoe.github.io`)
4. Use your email, create a password, verify your account

### Step 2 — Create a repository
1. Once logged in, click the **+** icon top-right → **New repository**
2. Repository name: `daymaster`
3. Make sure **Public** is selected (required for free GitHub Pages)
4. Check **Add a README file**
5. Click **Create repository**

### Step 3 — Upload your files
You have 3 files to upload: `index.html`, `app.js`, `manifest.json`

1. In your new repository, click **Add file** → **Upload files**
2. Drag all 3 files into the upload area
3. Scroll down, click **Commit changes**

### Step 4 — Enable GitHub Pages
1. In your repository, click **Settings** (top tab)
2. Click **Pages** in the left sidebar
3. Under **Source**, select **Deploy from a branch**
4. Branch: **main**, folder: **/ (root)**
5. Click **Save**
6. Wait 2 minutes, then your site is live at:
   **https://YOURUSERNAME.github.io/daymaster**

---

## PART 2: Google Drive API (10 min)

### Step 1 — Create a Google Cloud project
1. Go to **console.cloud.google.com**
2. Sign in with your Google account
3. Click **Select a project** (top bar) → **New Project**
4. Name it: `Daymaster`
5. Click **Create**

### Step 2 — Enable the Drive API
1. In the search bar at top, type **Google Drive API**
2. Click it → click **Enable**

### Step 3 — Configure OAuth consent screen
1. In the left menu → **APIs & Services** → **OAuth consent screen**
2. Select **External** → click **Create**
3. Fill in:
   - App name: `Daymaster`
   - User support email: your email
   - Developer contact: your email
4. Click **Save and Continue** through the next screens (you can skip scopes and test users)
5. Click **Back to Dashboard**

### Step 4 — Create OAuth credentials
1. Left menu → **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `Daymaster Web`
5. Under **Authorized JavaScript origins**, click **Add URI**:
   - Add: `https://YOURUSERNAME.github.io`
6. Click **Create**
7. A popup shows your **Client ID** — copy it, it looks like:
   `123456789-abcdefg.apps.googleusercontent.com`

---

## PART 3: Connect everything (5 min)

### Step 1 — Add your Client ID to the app
1. Go back to your GitHub repository
2. Click on `index.html`
3. Click the **pencil icon** (Edit)
4. Find this line:
   ```
   GOOGLE_CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID_HERE",
   ```
5. Replace `YOUR_GOOGLE_CLIENT_ID_HERE` with your actual Client ID
6. Also update:
   ```
   APP_URL: "YOUR_GITHUB_PAGES_URL_HERE",
   ```
   Replace with `https://YOURUSERNAME.github.io/daymaster`
7. Click **Commit changes**

### Step 2 — Wait 1-2 minutes for GitHub to rebuild, then test
1. Open **https://YOURUSERNAME.github.io/daymaster**
2. Click **↻ Connect Drive** in the header
3. Sign in with Google when prompted
4. You should see the sync dot turn green — you're live!

---

## PART 4: Install on iPhone / iPad (2 min)

### iPhone / iPad (Safari only)
1. Open your Daymaster URL in **Safari**
2. Tap the **Share** button (box with arrow pointing up)
3. Scroll down → tap **Add to Home Screen**
4. Name it `Daymaster` → tap **Add**
5. It now lives on your home screen like a native app

### Mac
1. Open in Chrome or Edge
2. Click the install icon in the address bar (looks like a monitor with arrow)
3. Click **Install**

### Android
1. Open in Chrome
2. Tap menu (3 dots) → **Add to Home screen**

---

## How sync works day-to-day

- Every keystroke saves locally to your browser (instant)
- Every 2 seconds after you stop typing, it saves to Google Drive
- The small dot in the header shows sync status:
  - **Gray** = idle
  - **Gold** = saving
  - **Green** = saved to Drive
  - **Red** = save failed (check connection)
- When you open on a new device, it loads from Drive automatically
- **Your data lives in Google Drive → Daymaster → daymaster-data.json**

---

## If something goes wrong

**"Connect Drive" does nothing:**
- Make sure your Client ID is correct in index.html
- Make sure your GitHub Pages URL is in the Authorized JavaScript Origins in Google Cloud

**Data not syncing between devices:**
- Check the sync dot — if red, try reconnecting Drive
- Use ⬇ Backup on one device and ⬆ Restore on the other as a manual workaround

**Lost data:**
- Your data is in Google Drive — open Drive, find the Daymaster folder, open daymaster-data.json
- You can also use ⬆ Restore from any previous backup file

---

## Going forward

- The URL never changes — bookmark it everywhere
- No ongoing costs, no subscriptions
- Your layout changes and all daily data sync automatically
- To add new tile types or features in the future, just update app.js in GitHub
