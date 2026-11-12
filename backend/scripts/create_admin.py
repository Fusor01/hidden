"""python -m scripts.create_admin admin@college.edu"""
import getpass
import sys

from argon2 import PasswordHasher

from common.config import get_settings
from common.db import make_session_factory
from identity_api.models import User

email = sys.argv[1].strip().lower()
pw = getpass.getpass("Password (min 12 chars): ")
if len(pw) < 12 or pw != getpass.getpass("Repeat: "):
    sys.exit("Passwords differ or are too short")
_, Session = make_session_factory(get_settings().identity_database_url)
with Session() as db:
    db.add(User(email=email, role="admin", password_hash=PasswordHasher().hash(pw)))
    db.commit()
print("admin created")
