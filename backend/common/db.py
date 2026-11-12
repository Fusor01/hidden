from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def make_session_factory(url: str | None):
    if not url:
        raise RuntimeError("A required database URL is not configured for this service")
    if url.startswith("sqlite"):
        kwargs = {"connect_args": {"check_same_thread": False}}
    else:
        # Serverless + Neon pooler: few connections per instance, and no server-side prepared statements.
        kwargs = {"pool_pre_ping": True, "pool_size": 2, "max_overflow": 0, "pool_recycle": 300,
                  "connect_args": {"prepare_threshold": None}}
    engine = create_engine(url, **kwargs)
    return engine, sessionmaker(bind=engine, expire_on_commit=False)
