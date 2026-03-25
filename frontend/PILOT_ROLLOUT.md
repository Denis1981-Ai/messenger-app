# Limited Pilot Rollout Package

## Pilot owner and daily operator
- Pilot owner: decides go / no-go and stop / continue
- Daily operator: checks health, smoke, backup status and handles first-line incidents

## Which document to use
- Public start / restart / restore path: `DEPLOY_PUBLIC.md`
- Daily pilot operation: this file
- User issue intake: `BUG_REPORT_TEMPLATE.md`

## Pilot launch flow
1. Start the system by `DEPLOY_PUBLIC.md`
2. Verify `GET /api/health` returns `200`
3. Verify backup path is available and create a fresh backup
4. Verify at least one real active user can log in
5. Verify one real chat flow works: text message, file upload, file download
6. Only after that allow the limited pilot group to use the system

## Go / no-go checklist
Go only if all items below are true:
- health is ok
- smoke is ok
- fresh backup was created successfully
- first real active user login works
- text message flow works
- file upload works
- file download works

No-go if any item above fails.

## Daily quick check
Run at the start of the pilot day:
1. Check `https://chat.svarka-weld.ru/api/health`
2. Run smoke for one active pilot user
3. Confirm the uploads path exists on the server
4. Confirm the latest backup file exists and today it can still be created

## Desktop install manual QA
Run after public updates that can affect app shell or browser installability:
1. Open `https://chat.svarka-weld.ru` in desktop Chrome or Edge
2. Confirm the browser shows an install option for the site
3. Install the messenger as an app
4. Launch the installed app as a separate window
5. Verify login works
6. Verify chat list, direct chat, private group, text send, file upload and file download
7. Verify polling-based refresh still updates chats and messages without `F5`
8. Verify unread badges still change after open / read
9. While the installed app window is minimized or not focused, send unread messages from another user
10. Verify app badge count appears where the browser/OS supports it
11. Verify the window title falls back to `(N) Svarka Weld Messenger`
12. Open the unread chat and verify badge/title count decreases or clears
13. Verify logout clears badge/title state
14. Verify login again inside the installed app
15. Treat delayed updates in a minimized app as a browser/background timer issue unless the unread signal fails to arrive after the next polling window

## Windows desktop bootstrap manual QA
Run when validating the Tauri desktop shell:
1. Build the installer by `npm run desktop:build`
2. Install `src-tauri/target/release/bundle/nsis/Svarka Weld Messenger_0.1.0_x64-setup.exe`
3. Launch the installed desktop app
4. Verify login works
5. Verify chat list opens
6. Verify direct chat works
7. Verify private group works
8. Verify text send works
9. Verify file upload and file download work
10. Verify logout and login again work
11. Verify the live web runtime still works in the browser after desktop testing

## Windows desktop notifications manual QA
Run only inside the installed Tauri desktop app:
1. Open the installed desktop app and log in as user A
2. Open DevTools and run `window.__messengerDesktopNotificationsDebug?.test()`
3. Verify Windows shows a real system desktop notification
4. Click the notification and verify the desktop app is restored/focused
5. Open DevTools and run `window.__messengerDesktopNotificationsDebug?.testOverlay(3)`
6. Verify the Windows taskbar icon shows unread overlay `3`
7. Run `window.__messengerDesktopNotificationsDebug?.clearOverlay()`
8. Verify the taskbar overlay is removed
9. Open another browser or desktop app session as user B
10. Open a direct chat between A and B inside the desktop app
11. Leave that same chat selected, then minimize the desktop app or move focus away from it
12. Send a new direct message from B to A
13. Verify Windows shows a desktop notification even though that same chat was already selected in A
14. Verify the taskbar overlay appears with unread count
15. Click the notification and verify the desktop app is restored/focused
16. If the app is already running, verify the target chat opens or refreshes correctly
17. Open/read the message and verify the taskbar overlay count decreases or clears
18. Repeat the same flow with the app not minimized but simply out of focus
19. Repeat the same flow for a private group message
20. Repeat once for a file-only or text+file message
21. Verify A still does not get a notification for A's own outgoing message
22. Log out from the desktop app and verify notifications stop and the taskbar overlay clears for that logged-out user session

## After restart check
Run immediately after any restart/update:
1. Check `https://chat.svarka-weld.ru/api/health`
2. Log in with one active pilot user
3. Open chats list
4. Send one text message
5. Upload one file
6. Download that file

## User complaint handling
When a pilot user reports a problem:
1. Capture it in `BUG_REPORT_TEMPLATE.md`
2. Classify it as P1, P2 or not-for-pilot-fix
3. Re-check `health`
4. Re-run smoke
5. If login, text or file flow is broken for more than one user, treat it as P1
6. If it is reproducible but not blocking pilot scope, record it and keep the pilot running

## If health is down
1. Stop new pilot usage
2. Check whether app, DB or proxy is down
3. Restart the stack using `DEPLOY_PUBLIC.md`
4. Re-run health and smoke
5. If health does not recover or data looks wrong, move to restore

## Stop criteria
Stop the pilot and restore service only after triage if any of the following happens:
- login breaks for multiple users
- text message flow is broken
- file upload or file download is broken
- health is down or DB is unreachable
- data looks corrupted or unexpectedly missing
- restore path cannot be executed when needed

## Priority rules during pilot
### P1
Fix immediately during pilot:
- login broken for multiple users
- health/db failure
- text message flow broken
- file upload or file download broken
- data corruption or unexpected data loss

### P2
Can wait for scheduled fix window during pilot:
- issue affects one user but there is a workaround
- intermittent non-destructive failure
- non-critical UI break that does not block login, text or file flow
- documentation/runbook confusion without data loss

### Not fixed during pilot
Do not expand scope during pilot for:
- cosmetic polish
- non-blocking layout issues
- copy tweaks
- feature requests outside current pilot scope
- anything from the known limitations list below

## Problem handling
1. Stop new pilot usage if stop criteria are hit
2. Capture the issue using `BUG_REPORT_TEMPLATE.md`
3. Check `GET /api/health`
4. Re-run smoke
5. If issue is confirmed and blocks pilot, restore from the latest valid backup if needed
6. Restart service and verify health + smoke again before reopening usage

## Rollback / restore
Minimal rollback path:
1. `docker compose --env-file .env.public -f docker-compose.public.yml down`
2. Restore using `DEPLOY_PUBLIC.md`
3. `docker compose --env-file .env.public -f docker-compose.public.yml up -d --build`
4. Re-run health and smoke before reopening access

## Known limitations of current pilot
This pilot does not include:
- realtime/websocket updates
- search
- S3/CDN storage
- server-side preview generation
- antivirus scanning
- quotas
- advanced admin UI
- offline-first messaging or cached authenticated API usage in the installed app
- guaranteed native OS badge visibility on every browser/desktop setup
- instant unread attention in a minimized installed app on every browser/OS setup
- standalone local desktop messaging without the live server
- desktop notifications in the browser web runtime; they exist only in the Tauri desktop app
- guaranteed Windows taskbar overlay readability on every Windows theme/DPI/taskbar setup

## Notes for pilot communication
- Tell pilot users that this is a limited internal pilot
- Do not position it as final production messaging platform yet
- Route every issue through the bug template so failures are reproducible and actionable
