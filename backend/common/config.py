from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    identity_database_url: str | None = None   # identity project only
    ballot_database_url: str | None = None     # ballot project only (role ballot_rw)
    anon_admin_database_url: str | None = None   # identity-api publishing/moderation role
    anon_reports_database_url: str | None = None  # identity-api read role for aggregates

    elig_hmac_key: str = ""             # identity project only. hex, >= 32 bytes. Derives LLT digests.
    master_key: str = ""                # identity project only. Fernet key. Seals campaign private keys.
    key_bits: int = 3072

    cookie_secure: bool = True
    session_ttl_minutes: int = 120
    max_failed_logins: int = 5
    lockout_minutes: int = 15

    identity_origins: list[str] = ["http://localhost:3000"]
    ballot_origins: list[str] = ["http://localhost:3000"]
    docs_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
