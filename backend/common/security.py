import base64
import hashlib
import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def b64u_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def b64u_decode(s: str) -> bytes:
    try:
        return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "Invalid encoding") from exc


class RateLimiter:
    """Sliding window, per process. Use a shared store (Redis) when running >1 worker."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window_s: int) -> None:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and now - q[0] > window_s:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(429, "Too many requests. Try again later.")
            q.append(now)


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    # Behind a trusted proxy, configure uvicorn --proxy-headers and --forwarded-allow-ips.
    return request.client.host if request.client else "unknown"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        resp = await call_next(request)
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        resp.headers["Referrer-Policy"] = "no-referrer"
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'"
        resp.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
        resp.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
        return resp


class OriginCheckMiddleware(BaseHTTPMiddleware):
    """CSRF defence for cookie-authenticated routes: unsafe methods must carry an allowed Origin."""

    def __init__(self, app, allowed_origins: list[str]):
        super().__init__(app)
        self.allowed = set(allowed_origins)

    async def dispatch(self, request, call_next):
        if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
            origin = request.headers.get("origin")
            if origin not in self.allowed:
                return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        return await call_next(request)
