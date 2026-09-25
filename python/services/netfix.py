"""
Connect to a host through the address that actually answers.

A tunnel host (e.g. *.trycloudflare.com) resolves to several addresses, and from some networks one
of them never answers. Python's blocking connect tries them one after another, so every new
connection first waits for that dead address to time out (measured here: 104.16.230.132 timed out
after 21 s, 104.16.231.132 answered in 0.17 s — every new connection took 22 s, which stalled the
live speech stream). `install()` makes name resolution list the answering addresses first: all
addresses are tried at once, fastest first, and the order is kept for a few minutes.
"""
from __future__ import annotations

import socket
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError, as_completed

_original = socket.getaddrinfo
_cache: dict[tuple[str, int], tuple[float, list]] = {}
_lock = threading.Lock()
CACHE_S = 300
PROBE_TIMEOUT_S = 3.0


def _probe(info) -> float:
    family, kind, proto, _, address = info
    sock = socket.socket(family, kind, proto)
    sock.settimeout(PROBE_TIMEOUT_S)
    started = time.perf_counter()
    try:
        sock.connect(address)
        return time.perf_counter() - started
    except OSError:
        return float("inf")
    finally:
        sock.close()


def _answering_first(host: str, port: int, infos: list) -> list:
    key = (host, port)
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < CACHE_S:
            order = hit[1]
            return sorted(infos, key=lambda i: order.index(i[4]) if i[4] in order else len(order))
    unique = list({i[4]: i for i in infos if i[1] == socket.SOCK_STREAM}.values())
    # Try all at once and take the first that answers — without waiting for a dead one to time out.
    pool = ThreadPoolExecutor(max_workers=len(unique) or 1)
    futures = {pool.submit(_probe, i): i[4] for i in unique}
    times: dict = {}
    try:
        for done in as_completed(futures, timeout=PROBE_TIMEOUT_S + 1):
            times[futures[done]] = done.result()
            if times[futures[done]] != float("inf"):
                break
    except TimeoutError:
        pass
    finally:
        pool.shutdown(wait=False)
    order = sorted(times, key=times.get) + [a for a in futures.values() if a not in times]
    with _lock:
        _cache[key] = (time.monotonic(), order)
    return sorted(infos, key=lambda i: order.index(i[4]) if i[4] in order else len(order))


def _getaddrinfo(host, port, *args, **kwargs):
    infos = _original(host, port, *args, **kwargs)
    if not isinstance(host, str) or host in ("localhost",) or len({i[4] for i in infos}) < 2:
        return infos
    try:
        socket.inet_pton(socket.AF_INET, host)
        return infos  # a literal address: nothing to choose
    except OSError:
        pass
    try:
        return _answering_first(host, int(port or 0), infos)
    except Exception:  # noqa: BLE001 — never make resolution worse than it was
        return infos


def install() -> None:
    """Idempotent; affects this process (the bridge and each STT worker call it)."""
    if socket.getaddrinfo is not _getaddrinfo:
        socket.getaddrinfo = _getaddrinfo
