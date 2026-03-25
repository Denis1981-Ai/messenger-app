# Public internet deployment for limited internal pilot

## Scope
Single VPS/server, Docker Compose, Caddy, HTTPS, one public URL.
No unread, no realtime, no search, no S3/CDN.

## Current public pilot URL
- `https://chat.svarka-weld.ru`

## What you need
- Linux VPS with Docker Engine + Docker Compose plugin
- Public DNS record pointing the pilot domain to the server IP
- Open ports: 80/tcp and 443/tcp
- SSH access to the server

## Files to use
- `docker-compose.public.yml`
- `Caddyfile`
- `.env.public` copied from `.env.public.example`

## First public start
1. Copy `.env.public.example` to `.env.public`
2. Set:
   - `APP_DOMAIN`
   - `CADDY_EMAIL`
   - `SESSION_SECRET`
   - `POSTGRES_PASSWORD`
3. Start the stack:
   - `docker compose --env-file .env.public -f docker-compose.public.yml up -d --build`
4. Apply schema:
   - `docker compose --env-file .env.public -f docker-compose.public.yml exec app npx prisma migrate deploy`
5. Do not run seed in live pilot.
6. Create the first real user:
   - `docker compose --env-file .env.public -f docker-compose.public.yml exec app npm run user:create -- --login <login> --name "<Name>" --password "<strong-password>"`
7. Open `https://<APP_DOMAIN>` and verify login.

## Restart / update
- `docker compose --env-file .env.public -f docker-compose.public.yml down`
- `docker compose --env-file .env.public -f docker-compose.public.yml up -d --build`
- After restart, run the daily restart check from `PILOT_ROLLOUT.md`

## Health
- Public: `https://<APP_DOMAIN>/api/health`
- Server-side: `docker compose --env-file .env.public -f docker-compose.public.yml ps`

## Smoke after start
Use one real active user and one existing chat:
- `npm run ops:smoke -- --url https://<APP_DOMAIN> --login <active-login> --password <password>`

## Persistence
- PostgreSQL data: Docker volume created by the compose project for `postgres-data`
- Caddy certificates/state: Docker volumes created by the compose project for `caddy-data` and `caddy-config`
- Uploaded files: host path `/opt/messenger-pilot/storage/uploads`
- Do not delete these volumes or `/opt/messenger-pilot/storage/uploads` during restart/update

## Backup
Run on the server from the project root:
- `docker compose --env-file .env.public -f docker-compose.public.yml exec -T postgres pg_dump -U postgres -d messenger_stage1 --format=custom --no-owner --no-privileges > backups/public-pilot.dump`

## Restore
1. `docker compose --env-file .env.public -f docker-compose.public.yml down`
2. `cat ./backups/public-pilot.dump | docker compose --env-file .env.public -f docker-compose.public.yml exec -T postgres pg_restore --clean --if-exists --no-owner --no-privileges -U postgres -d messenger_stage1`
3. `docker compose --env-file .env.public -f docker-compose.public.yml up -d --build`
4. Run smoke again

## Minimal go-live check
- DNS points to the server
- `https://<APP_DOMAIN>/api/health` returns ok
- first real user logs in
- text message works
- file upload works
- file download works

## Desktop install path
- Install path is browser-based PWA only
- Supported operator QA path: desktop Chrome or Edge
- Manifest URL: `https://<APP_DOMAIN>/manifest.webmanifest`
- Service worker URL: `https://<APP_DOMAIN>/sw.js`
- The service worker is intentionally minimal and does not cache authenticated API responses, polling responses or attachment downloads
- Unread attention is progressive enhancement only: App Badging API where supported, window title fallback otherwise
- Minimized installed PWA windows can still be affected by browser background timer throttling; unread attention remains polling-based, not realtime
- After deploy, run the desktop install manual QA from `PILOT_ROLLOUT.md`

## Daily operator note
- For daily checks, stop/go rules and bug handling, use `PILOT_ROLLOUT.md`

## Windows desktop bootstrap via Tauri
- Scope: one minimal Windows desktop shell over the existing server-side messenger
- It does not embed the backend and does not work as a standalone local messenger
- Production desktop window points to `https://chat.svarka-weld.ru`

### Local desktop dev prerequisites
- Rust via `rustup`
- Microsoft Visual Studio Build Tools 2022 with C++ workload
- Microsoft Edge WebView2 runtime on Windows
- After installing Rust, open a fresh terminal so `cargo` is on `PATH`

### Local desktop dev command
- `npm run desktop:dev`
- This starts a local Next dev server on `http://127.0.0.1:1420` and runs the Tauri shell against it
- Do not keep another `next dev` from the same repo running at the same time; Tauri dev expects to own the local frontend dev server for that session

### Windows installer build
- `npm run desktop:build`
- Installer output:
  - `src-tauri/target/release/bundle/nsis/Svarka Weld Messenger_0.1.0_x64-setup.exe`

### Desktop bootstrap limitations
- Unsigned Windows installer
- No auto-update
- No tray integration
- Native notifications exist only inside the Tauri desktop app, not in the browser web runtime
- Notification click is intended to focus the app and reopen the target chat in the running desktop shell
- Desktop toast suppression now happens only when the app is focused, not minimized, and the user is actively viewing that same chat
- If the app is minimized or not focused, the desktop toast must still fire even when that chat is already selected
- Delivery for the currently open chat is accelerated through the existing active-chat polling path instead of waiting only for the slower chat-list polling
- Windows unread taskbar count uses `Window.setOverlayIcon`, not universal badge API
- Taskbar overlay count is intentionally compact: `1..9`, then `9+`
- Overlay clears when unread becomes `0`, after opening unread chats, and on logout/session loss
- This stage does not include push notifications, notification history, reply actions or sound alerts
- No offline-first desktop mode
- Desktop shell depends on the live server URL being reachable
