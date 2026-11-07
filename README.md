# IceStation UB 🛰️❄️

**Parking that knows it's winter in Buffalo.** UB Hacking 2026 · Theme: Deep Space

A crew-powered mission control for UB North Campus parking. Students scan lots, AI estimates the
open spaces, and a NOAA GOES-19 weather satellite switches the whole app into ice season before
the snow arrives.

```
icestation-ub/
├── backend/          Python FastAPI + SQLAlchemy + SQLite + OpenCV   (complete, 45 tests passing)
│   ├── app/
│   │   ├── main.py             app, WebSocket /ws, media, expiry loop
│   │   ├── models.py           11 tables + SystemState
│   │   ├── campus.py           lots, buildings, hazard spots (seed config, editable)
│   │   ├── routers/            parking · orbital (satellite/weather/system) · community (hazards/crew/notifications)
│   │   └── services/
│   │       ├── vision/         detectors (YOLOv8 | OpenCV), stall-region analysis, Gemini, privacy blur
│   │       ├── satellite.py    GOES-19 fetch, band detection, optical flow, simulated feed
│   │       ├── weather.py      NWS alerts + KBUF observation
│   │       ├── ice_season.py   decision engine (pure, tested)
│   │       └── recommendation.py  docking engine (pure, tested)
│   ├── scripts/        init_db.py, generate_samples.py
│   ├── data/samples/   bundled SYNTHETIC lot + walkway photos with stall maps
│   └── tests/
├── mobile/           Expo SDK 58 · React Native · expo-router · TypeScript
│   ├── app/(tabs)/     index (Mission Control) · dock · scan · orbit · ice · crew
│   ├── app/demo.tsx    INITIATE DEEP SPACE DEMO runner
│   └── src/            api client, store (polling + WebSocket), theme, components
├── CLAUDE.md         handoff notes for Claude Code
└── .env.example
```

## Run it

You need Python 3.11+, Node 20+, and the **Expo Go** app on your phone (same Wi-Fi as your laptop).

### 1. Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                 # optional, everything works without keys
python -m scripts.init_db
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
`--host 0.0.0.0` matters: your phone has to reach the laptop. API docs: http://localhost:8000/docs

### 2. Mobile app
```bash
cd mobile
npm install
npx expo install --fix               # aligns native package versions with your Expo CLI
npx expo start
```
Scan the QR code with Expo Go (Android) or the Camera app (iOS).
The app finds the backend automatically at `http://<your-laptop-IP>:8000`.
If it can't (campus Wi-Fi often isolates devices), set `EXPO_PUBLIC_API_URL` in `mobile/.env`
or run `npx expo start --tunnel` and expose the backend with a tunnel too.

In VS Code: **Terminal → Run Task → "Backend: install"**, then **"Run everything"**.

### Tests
```bash
cd backend && python -m pytest -q        # 45 tests: recommendation, ice-season logic, GPS lot matching, API flows
cd mobile && npx tsc --noEmit
```

## What works vs. demo mode

| Feature | Status |
|---|---|
| Parking dashboard, snow-adjusted capacity, confidence, live updates (WebSocket + polling) | Works |
| Photo scan → vehicle detection → stall-level open/snow-blocked estimate → confirm/correct → broadcast | Works (OpenCV detector by default) |
| Privacy blur before storage | Works (detector people, Haar face/plate on OpenCV 4.x, plate zones, skin-tone fallback) |
| YOLOv8 detection | Code path written, **not tested here**: `pip install -r requirements-ml.txt` |
| Gemini Vision (snow, plowing, spaces, hazard labels) | Works when `GEMINI_API_KEY` is set; falls back to OpenCV |
| GOES-19 band detection + optical flow + ETA | Works; live feed needs internet and **pixel calibration** of UB (`BUFFALO_PX_X/Y`) |
| NWS alerts + observation | Live when reachable; status shown honestly when not |
| Ice-season decision engine (auto, demo replay, manual override, all labelled) | Works |
| Docking recommendations, leave-by time, fill forecast, accessible routing | Works |
| Hazard reports, AI classification, 6 h expiry, confirm/clear voting, wheelchair hard stops | Works |
| Crew XP, leaderboard, Leaving now, Stuck in orbit | Works |
| GPS lot identification (point-in-outline, accuracy-aware radius, manual override) | Works (`/api/parking/locate`); lot-sign OCR backup not built |
| Lot outlines | Jarvis, Hochstetter, Center for Tomorrow traced from OpenStreetMap (© OpenStreetMap contributors, ODbL); Stadium Lot is an approximate box |
| Demo storm replay | **Demo**: simulated frames (or real frames in `backend/data/storm_frames/`) + DEMO NWS alert |
| Sample photos | **Demo**: synthetic, watermarked |
| Lot capacities, hourly occupancy | **Seed estimates**, not UB data |

## Optional keys
- `GEMINI_API_KEY`: better scans and hazard labels (Google AI Studio).
- NOAA GOES-19 and NWS need **no key**, just internet.

## Judge demo script (90 seconds)
1. **Mission Control.** "Four North Campus lots, snow-adjusted capacity, confidence on every number."
2. Tap **INITIATE DEEP SPACE DEMO → Initiate.** Narrate as steps tick:
   - "A student scans Jarvis A. Cars counted, stalls classified: open, occupied, buried in snow. People and plates are blurred before anything is stored."
   - "Beamed. Every phone at this table just updated."
   - "Now the deep-space part: GOES-19 frames, labelled simulated for the demo. OpenCV finds a lake-effect band, optical flow tracks it toward Buffalo, ETA under 60 minutes. With the NWS warning, the satellite engine flips ice season on by itself."
   - "Capacity drops, leave-by times pad, and an ice pin appears between Jarvis A and Davis Hall."
3. Close the demo: **the whole app is orange.** Open **Dock**: new best lot and leave-by time.
4. Open **Ice**: toggle a route check; "blocked ramps are hard stops, and we never call a route safe without data."
5. Hand a judge a phone: **Scan → Camera** on anything, or **Leaving now**.
6. **Reset demo** for the next judge.

Honesty notes for judges: IceStation predicts and informs; it never reserves a space.
Occupancy is from crew reports or a seed model, not live UB Parking data.
