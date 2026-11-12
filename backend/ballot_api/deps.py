from common.config import get_settings
from common.db import make_session_factory

_engine = _Session = None


def _factory():
    global _engine, _Session
    if _Session is None:
        _engine, _Session = make_session_factory(get_settings().ballot_database_url)
    return _Session


def get_db():
    with _factory()() as session:
        yield session
