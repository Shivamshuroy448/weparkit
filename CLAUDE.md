# CLAUDE.md: IceStation UB

Hackathon prototype (UB Hacking 2026, theme Deep Space). Satellite-triggered winter parking and
walkway-safety app for UB North Campus. Read README.md for the product pitch and run steps.

## Layout
- `backend/`: FastAPI + SQLAlchemy 2 + SQLite + OpenCV. Python 3.11+. **Complete, 45 tests pass.**
- `mobile/`: Expo SDK 58, React Native 0.88, React 19.3, expo-router (file routes in `app/`), TypeScript strict.
  **Type-checks clean and bundles for Android (`npx expo export --platform android`). Not yet run on a device.**
- The original spec asked for a React web frontend; the team switched to Expo to match the pitch deck. There is no web frontend.

## Commands
```bash
# backend (from backend/, venv active)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
python -m pytest -q
python -m scripts.init_db --reset          # wipe + reseed
python -m scripts.generate_samples         # rebuild synthetic sample photos

# mobile (from mobile/)
npx expo start                              # Expo Go
npx tsc --noEmit
npx expo install --fix                      # if Expo warns about versions
```

## Architecture rules (keep these)
- **Honesty labels are a product requirement.** Anything simulated is labelled in data *and* UI:
  `is_demo` flags, `source` = `simulated` / `goes19_live` / `archived_frames`, DEMO tags, "SIMULATED SATELLITE FEED".
  Never present seed occupancy as live UB data. Never say a spot is reserved. Never call a route "safe".
- **Vehicle count ≠ open spaces.** Open spaces come from `services/vision/spaces.py`
  (calibrated stall regions → area heuristic → Gemini). Keep it that way.
- **Privacy first:** `vision/privacy.py` runs before any image is written. Raw uploads never touch disk.
- **Pure logic is unit-tested:** `services/ice_season.py` and `services/recommendation.py` take no DB.
  Add tests in `backend/tests/` when changing them.
- **Manual override ≠ automatic decision.** `SystemState.decision_source` is one of
  `satellite_engine | demo_storm_replay | manual_override`; the UI shows which.
- Expiry is enforced on read (`expires_at > now`) plus a 30 s loop in `main.py` that pushes WebSocket events.
- Realtime: `services/realtime.py` `hub.publish(event)` with events
  `lots | state | hazards | notifications | crew | satellite`; the mobile store refetches that resource.
  Polling every 15 s is the fallback.
- Mobile theming: `useStore().c` is the palette; `c.accent` flips cyan → orange in ice season.
  Use the primitives in `mobile/src/components/ui.tsx` (Screen, Card, T, Button, Pill, DemoTag...).
- API base URL: `mobile/src/config.ts` (EXPO_PUBLIC_API_URL → Metro host IP:8000 → emulator fallbacks).

## Key endpoints
`GET /api/health` · `GET /api/parking/lots` · `POST /api/parking/scan` (multipart: lot_id + file | sample_id) ·
`POST /api/parking/report` (confirm/correct a scan, or manual occupancy_pct) · `GET /api/parking/locate?lat&lng&accuracy_m` (GPS → lot) · `GET /api/parking/recommendations` ·
`POST /api/parking/leave` · `GET /api/weather/current` · `GET /api/satellite/status` · `POST /api/satellite/analyze` ·
`POST /api/satellite/demo-storm` · `POST /api/state/mode` (manual override, null clears) · `POST /api/demo/reset` ·
`GET /api/hazards` · `GET /api/hazards/routes` · `POST /api/hazards/report` · `POST /api/hazards/{id}/vote|clear` ·
`POST /api/crew/me` · `GET /api/crew/leaderboard` · `POST /api/crew/assist` · `GET /api/notifications` · `WS /ws`.
Full docs at `/docs`.

## Not done yet / next tasks (in priority order)
1. **Run on a real phone in Expo Go** and fix any runtime issues (layout on small screens, map rendering,
   image picker upload via RN FormData, WebSocket on device). Verify the bottom tab bar doesn't cover content.
2. **Calibrate live GOES-19:** confirm `GOES_SECTOR_URL` listing format, then set `BUFFALO_PX_X/Y` and
   `KM_PER_PX` for the 600x600 Northeast sector. Drop real lake-effect frames into `backend/data/storm_frames/`
   (named `YYYYDDDHHMM_*.jpg`) so the replay uses archived real imagery.
3. **Test YOLOv8 path:** `pip install -r requirements-ml.txt`, set `VISION_PROVIDER=yolo`, run a real lot photo.
4. **Lot identification (pitch slide 4):** GPS part DONE: `services/geo.py` (pure, tested) + `/api/parking/locate`
   + `mobile/src/location.ts` (`useLotLocator`) on Scan and Dock; a manual pick always overrides GPS.
   Jarvis/Hochstetter/Center for Tomorrow use real OSM outlines (`OSM_OUTLINES` in `campus.py`, ODbL attribution);
   Stadium Lot is still an approximate box. Remaining backups: lot-sign OCR via Gemini, ORB reference-photo matching.
5. **Class-schedule fill model (pitch slide 5):** replace `hourly_profile` seed curves with 15-minute predictions
   from UB's public class schedule near each lot.
6. Push notifications (expo-notifications) for Leaving now / Stuck in orbit / ice season.
7. Optional: Firestore with TTL (pitch slide 8) instead of SQLite; the models use portable types.
8. Pin the Python dependency versions after a clean install (`pip freeze`).

## Gotchas
- `seed.init()` re-syncs lot lat/lng/polygon from `campus.py` into an existing DB on startup (geometry is config).
- Hazard votes: one per user, except confirm → clear may flip once (conditions change); flips award no points.
- Windows: venv python is `backend\.venv\Scripts\python.exe`. Windows Firewall blocks phones on Public networks:
  allow inbound TCP 8000 and 8081 (admin PowerShell) or use a hotspot / tunnel.
- `expo start --tunnel` only tunnels Metro; set `EXPO_PUBLIC_API_URL` to a public backend URL in that case.
- Phones can't reach `localhost`; run uvicorn with `--host 0.0.0.0`. Campus Wi-Fi may block device-to-device
  traffic; use a hotspot or tunnels.
- OpenCV 5 removed `CascadeClassifier`; `requirements.txt` installs 4.x so Haar face/plate blur works.
  The privacy module degrades gracefully either way.
- `SIM_CLOCK=09:40` in `backend/.env` makes the seed model behave like a weekday morning for night-time demos.
- Expo SDK 58 tab bars use `navigateToTab(route.key)` (see `app/(tabs)/_layout.tsx`), not `navigation.navigate`.
- `react-native-maps` prop is `showsPointsOfInterests` (plural) in this version.
