from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ballot_api.routers import ballot
from common.config import get_settings
from common.security import SecurityHeadersMiddleware

settings = get_settings()
app = FastAPI(
    title="HIDDEN ballot-api",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
)
app.add_middleware(SecurityHeadersMiddleware)
# No cookies are ever accepted or set here: allow_credentials stays False.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ballot_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(ballot.router, prefix="/api/v1")

# Run with:  uvicorn ballot_api.main:app --no-access-log
