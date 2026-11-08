"""Run the WeParkit API under a supervisor so it stays up.

    python -m scripts.serve                  # from backend/, venv active
    python -m scripts.serve --port 8000 --host 0.0.0.0

- Restarts uvicorn whenever it exits unexpectedly (crash, OOM kill), with exponential backoff
  (1 s -> 30 s) so a broken startup can't spin the CPU; backoff resets after 60 s of healthy uptime.
- Watchdog: polls /api/live every 10 s; 3 consecutive failures (a hung process) -> kill and restart.
- Uses the flags the app needs: --timeout-keep-alive 75 (phones reuse connections across the 15 s poll)
  and --timeout-graceful-shutdown 2. No --reload: on Windows it leaves orphaned workers holding the port.
- Ctrl+C stops the server and the supervisor cleanly.
"""
from __future__ import annotations

import argparse
import logging
import signal
import subprocess
import sys
import time
import urllib.request

logging.basicConfig(level=logging.INFO, format="%(asctime)s supervisor: %(message)s")
log = logging.getLogger("serve")

WATCH_EVERY_S, WATCH_FAILS, STARTUP_GRACE_S, HEALTHY_RESET_S = 10, 3, 45, 60


def alive(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/api/live", timeout=5) as r:
            return r.status == 200
    except Exception:
        return False


def start(host: str, port: int) -> subprocess.Popen:
    cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", host, "--port", str(port),
           "--timeout-keep-alive", "75", "--timeout-graceful-shutdown", "2"]
    log.info("starting: %s", " ".join(cmd[1:]))
    return subprocess.Popen(cmd)


def stop(p: subprocess.Popen) -> None:
    if p.poll() is not None:
        return
    p.terminate()
    try:
        p.wait(timeout=8)
    except subprocess.TimeoutExpired:
        p.kill()
        p.wait(timeout=5)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    stopping = False

    def on_signal(*_):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGINT, on_signal)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, on_signal)

    backoff = 1.0
    while not stopping:
        proc, started, fails = start(args.host, args.port), time.time(), 0
        while not stopping:
            time.sleep(1)
            code = proc.poll()
            if code is not None:
                log.warning("server exited with code %s", code)
                break
            up = time.time() - started
            if up > HEALTHY_RESET_S:
                backoff = 1.0
            if up > STARTUP_GRACE_S and int(up) % WATCH_EVERY_S == 0:
                fails = 0 if alive(args.port) else fails + 1
                if fails:
                    log.warning("health check failed (%d/%d)", fails, WATCH_FAILS)
                if fails >= WATCH_FAILS:
                    log.error("server unresponsive; restarting")
                    stop(proc)
                    break
        if stopping:
            stop(proc)
            break
        log.info("restarting in %.0f s", backoff)
        time.sleep(backoff)
        backoff = min(30.0, backoff * 2)
    log.info("stopped")


if __name__ == "__main__":
    main()
