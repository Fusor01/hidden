"""Vercel entrypoint. Two Vercel projects deploy this same folder; HIDDEN_SERVICE picks the service."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if os.environ.get("HIDDEN_SERVICE") == "ballot":
    from ballot_api.main import app  # noqa: F401
elif os.environ.get("HIDDEN_SERVICE") == "identity":
    from identity_api.main import app  # noqa: F401
else:
    raise RuntimeError("Set HIDDEN_SERVICE to 'identity' or 'ballot'")
