import threading
import time

from app.services.swr import SWRCache


def test_first_read_waits_then_serves_cache():
    calls = []
    c = SWRCache("t", lambda: calls.append(1) or len(calls), ttl_s=60)
    assert c.get() == 1 and c.get() == 1 and len(calls) == 1


def test_stale_read_returns_immediately_and_refreshes_once_in_background():
    gate = threading.Event()
    calls = []

    def slow():
        calls.append(1)
        if len(calls) > 1:
            gate.wait(2)  # simulate a hung upstream on refresh
        return len(calls)

    c = SWRCache("t", slow, ttl_s=0.01)
    assert c.get() == 1
    time.sleep(0.02)
    t0 = time.time()
    assert [c.get() for _ in range(5)] == [1] * 5  # stale value, no waiting
    assert time.time() - t0 < 0.2
    time.sleep(0.05)
    assert len(calls) == 2  # five stale reads started exactly one refresh (still hung on the gate)
    gate.set()
    for _ in range(50):
        if c.get() != 1:
            break
        time.sleep(0.02)
    assert c.get() >= 2  # refreshed value replaces the stale one


def test_force_refreshes_synchronously():
    n = iter(range(10))
    c = SWRCache("t", lambda: next(n), ttl_s=60)
    assert c.get() == 0 and c.get(force=True) == 1
