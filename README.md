# TJ LEXICORE (frontend-only)

A minimal static frontend site with an admin panel for adding posts. Reactions are stored in browser localStorage.

Features:
- Public feed (`index.html`) shows posts with title, body, image/video/link media, and emoji reactions.
- Admin panel (`admin.html`) protected by a basic password (default: `shazmaz`) to add/delete posts.
- Reactions are saved under `tj_reactions` in localStorage. Posts are saved under `tj_posts`.

How to use:
- Open `index.html` in your browser to view posts.
Only admin post things unless you are premium

Notes:
- This is frontend-only and intended for local/static hosting. The admin password is stored client-side and is not secure.
- Reactions are stored per-browser in localStorage; clearing storage will remove them.

LocalStorage keys:
- `tj_posts` - JSON array of posts.
- `tj_reactions` - JSON mapping postId -> emoji -> count

Reactions schema (updated):
- `tj_reactions` is now an object mapping postId -> emoji -> { count: number, users: [ids] }
	- Each reaction tracks which users/clients reacted so duplicate reactions are prevented per user/client and reactions can be toggled.
	- The app enforces at most one emoji reaction per user/client per post; choosing a different emoji switches the user's reaction.

UI: reaction buttons now animate with a short "pop" effect when clicked and highlight when active.

Authentication (local only):
- `tj_users` - JSON array of user objects { username, password } stored in plain text in localStorage (demo only).
- `tj_current_user` - JSON object of the logged-in user { username }.

Use `admin.html` to manage posts. Use the Register form in `index.html` to create a local account, then Login to associate actions with your username.

License: Personal use.

Backend (optional real-time sync)

1. Install dependencies and start server (in project folder):

	npm install
	npm start

2. Server runs on port 8080 by default. Clients will attempt to connect to ws://<host>:8080 and synchronize reactions. Reactions are persisted to `data.json` on the server.
```markdown
# TJ LEXICORE (frontend-only)

A static, local-first frontend demo with an admin panel for adding posts and lightweight social features. All data is stored in the browser (localStorage / optional service-worker cache). This repo is intended as a local demo and teaching example — do not rely on it for production security.

Core features
- Public feed (`index.html`) showing posts with title, body, image/video/link media, emoji reactions, and comments.
- Admin panel (`admin.html`) where an admin can create posts, memes, quizzes, and lock posts with a passcode (client-side hashing).
- Local accounts (register/login) for associating actions with a username. Authentication is purely client-side and intended for demo use only.

Quick start
- Open `index.html` in your browser to view posts. For full PWA features and service-worker caching, serve the folder over `http://localhost` (see PWA section below).

Notes
- This project is frontend-only. The admin password, passcodes, and user data are stored client-side and are not secure.
- Reactions, posts, comments and other data live in localStorage and are removed when the user clears site data.

LocalStorage keys (important)
- `tj_posts` — JSON array of posts (each post may include fields like `id`, `title`, `body`, `media`, `locked`, `lockHash`, `clue`, `clueReveal`).
- `tj_reactions` — mapping postId -> emoji -> { count, users } (tracks which users reacted).
- `tj_comments` — array of comment objects { id, postId, author, text, at }.
- `tj_users` — array of local user accounts.
- `tj_current_user` — the logged-in user object.
- `tj_unlocked_users` — list of usernames who have successfully unlocked passcode-protected posts.
- `tj_clues_found` — mapping username -> array of postIds (tracks which secret-clues a user has marked as found).

New: Secret Code Hunt (admin + player flow)
This repo now includes a lightweight Secret Code Hunt gamification feature:

- Admin side (`admin.html`): when creating a post you can set a "Clue" (`postClue`) and a "Reveal Hint" flag (`postClueReveal`). If `postClueReveal` is enabled a short hint is shown on the post; otherwise the post only indicates a clue is hidden.
- Admins can also lock a post with a passcode (client-side SHA-256 hash saved as `lockHash` on the post). Locked posts present an unlock input on the post for registered users.
- Player side (`index.html` / `secret.html`): registered users can attempt to unlock a locked post by entering the passcode. A correct passcode grants the user's username into `tj_unlocked_users`, creates an optional admin-configured shoutout, and gives access to the `secret.html` area.
- Clue tracking: when a user finds a clue they can tap "Mark Found" on the post; the app records that discovery under `tj_clues_found` for that username. This allows per-user progress tracking and simple leaderboards can be implemented later.

Storage and security notes for the Secret Code Hunt
- Passcodes are hashed using the browser SubtleCrypto SHA-256 API and the hex digest is stored in `tj_posts` on the `lockHash` field. This is front-end obfuscation only — do not treat it as secure for production secrets.
- All clue and unlock state is stored locally (no server). If you want permanent cross-device progress, you will need a backend to persist `tj_clues_found` and `tj_unlocked_users`.

UI changes since earlier versions
- The previous floating top M-Pesa donation button was removed from the header (donations still available via the Donate modal, not as a persistent top button).
- Notification permission and toggle have been moved into the Settings modal. Enabling notifications there will prompt the browser permission request.
- The "Browse Anonymously" toggle was moved and now appears above the "Play Offline Game" link in the main UI for easier access.

Reactions and interaction
- Reaction buttons animate briefly when clicked and show active state per-user.
- Unlocked users (from passcode unlock) unlock an "advanced reactions" palette on posts with an additional animated burst effect.

PWA and offline
- The site includes `manifest.json` and a basic `service-worker.js` for caching static assets and an `offline.html` fallback. Serve via `localhost` or HTTPS to test service-worker/PWA features.

Donations (M-Pesa)
- The project supports a manual M-Pesa Paybill flow inside a Donate modal. Automated STK Push or live payment integrations require a backend and provider credentials (not included).

Developer notes & next steps

- Everything is intentionally stored client-side to keep the demo simple. Recommended small next steps:

	- Add a small dashboard for per-user clue progress (uses `tj_clues_found`).

	- Add admin options to embed richer hidden clues (images or attachments) stored outside localStorage (IndexedDB or server).

	- If you need cross-device persistence, add a minimal backend API to store `tj_unlocked_users` and `tj_clues_found` securely.

License
- Personal use / demo.

```

