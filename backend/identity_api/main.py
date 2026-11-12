from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from common.config import get_settings
from common.security import OriginCheckMiddleware, SecurityHeadersMiddleware
from identity_api.routers import admin, auth, faculty, internal, student

settings = get_settings()
app = FastAPI(
    title="HIDDEN identity-api",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(OriginCheckMiddleware, allowed_origins=settings.identity_origins)  # CSRF
app.add_middleware(
    CORSMiddleware, allow_origins=settings.identity_origins, allow_credentials=True,
    allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type"],
)
for prefix, mod in (("/auth", auth), ("/student", student), ("/faculty", faculty), ("/admin", admin), ("/internal", internal)):
    app.include_router(mod.router, prefix=f"/api/v1{prefix}")

# Run with:  uvicorn identity_api.main:app
