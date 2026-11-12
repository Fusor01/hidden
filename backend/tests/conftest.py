import os
import tempfile
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from cryptography.fernet import Fernet

_tmp = tempfile.mkdtemp(prefix="hidden-tests-")
os.environ.update(
    IDENTITY_DATABASE_URL=f"sqlite:///{_tmp}/identity.db",
    BALLOT_DATABASE_URL=f"sqlite:///{_tmp}/ballot.db",
    ELIG_HMAC_KEY=os.urandom(32).hex(),
    MASTER_KEY=Fernet.generate_key().decode(),
    KEY_BITS="2048",
    COOKIE_SECURE="false",
)

import pytest  # noqa: E402
from argon2 import PasswordHasher  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from ballot_api import models as bm  # noqa: E402
from ballot_api.main import app as ballot_app  # noqa: E402
from common import blindrsa  # noqa: E402
from common.config import get_settings  # noqa: E402
from common.db import make_session_factory  # noqa: E402
from common.security import b64u_decode, b64u_encode, limiter  # noqa: E402
from identity_api import models as im  # noqa: E402
from identity_api.main import app as identity_app  # noqa: E402

ORIGIN = {"Origin": "http://localhost:3000"}
PW = "correct horse battery staple"
_ph = PasswordHasher()
_, IdentitySession = make_session_factory(os.environ["IDENTITY_DATABASE_URL"])
_, BallotSession = make_session_factory(os.environ["BALLOT_DATABASE_URL"])
im.Base.metadata.create_all(IdentitySession.kw["bind"])
bm.Base.metadata.create_all(BallotSession.kw["bind"])


@pytest.fixture(autouse=True)
def _reset_limiter():
    limiter._hits.clear()


def new_client(app=identity_app) -> TestClient:
    return TestClient(app, headers=ORIGIN)


def _user(db, role, email):
    u = im.User(email=email, role=role, password_hash=_ph.hash(PW))
    db.add(u)
    db.flush()
    return u


def login(email: str) -> TestClient:
    c = new_client()
    r = c.post("/api/v1/auth/login", json={"email": email, "password": PW})
    assert r.status_code == 200, r.text
    return c


def build_world(n_students=5, k=3, text=True, moderation=False, open_campaign=True) -> SimpleNamespace:
    tag = uuid.uuid4().hex[:8]
    with IdentitySession() as db:
        admin = _user(db, "admin", f"admin-{tag}@x.edu")
        fac = _user(db, "faculty", f"fac-{tag}@x.edu")
        other = _user(db, "faculty", f"other-{tag}@x.edu")
        db.add_all([im.Faculty(user_id=fac.id, employee_no=f"E{tag}", name="Dr. A"),
                    im.Faculty(user_id=other.id, employee_no=f"F{tag}", name="Dr. B")])
        students = []
        for i in range(n_students):
            u = _user(db, "student", f"s{i}-{tag}@x.edu")
            db.add(im.Student(user_id=u.id, roll_no=f"R{tag}{i}", name=f"S{i}"))
            students.append(u)
        sem = im.Semester(name=f"Sem {tag}", start_date=datetime(2026, 1, 1).date(), end_date=datetime(2026, 6, 1).date())
        course = im.Course(code=f"C{tag}", title="Databases")
        db.add_all([sem, course])
        db.flush()
        off = im.Offering(course_id=course.id, semester_id=sem.id, faculty_id=fac.id)
        db.add(off)
        db.flush()
        db.add_all(im.Enrollment(student_id=s.id, offering_id=off.id) for s in students)
        db.commit()
        w = SimpleNamespace(tag=tag, offering_id=str(off.id), admin_email=admin.email, fac_email=fac.email,
                            other_fac_email=other.email, student_emails=[s.email for s in students])
    w.admin = login(w.admin_email)
    now = datetime.now(timezone.utc)
    body = {
        "offering_id": w.offering_id, "name": f"Feedback {tag}", "k_threshold": k, "text_enabled": text,
        "moderation_enabled": moderation,
        "starts_at": (now - timedelta(minutes=1)).isoformat(), "ends_at": (now + timedelta(days=7)).isoformat(),
        "questions": [
            {"type": "star", "prompt": "Overall teaching quality", "required": True},
            {"type": "single", "prompt": "Pace of the course", "required": True, "options": ["Too slow", "Right", "Too fast"]},
        ] + ([{"type": "text", "prompt": "Any comments?", "required": False}] if text else []),
    }
    r = w.admin.post("/api/v1/admin/campaigns", json=body)
    assert r.status_code == 201, r.text
    w.campaign_id = r.json()["id"]
    assert w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/eligibility", json={"mode": "enrolled"}).status_code == 200
    if open_campaign:
        r = w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/open")
        assert r.status_code == 200, r.text
    return w


def claim(client: TestClient, campaign_id: str):
    """What the browser does: blind a fresh token, claim, unblind. Returns (token, signature, detail)."""
    detail = client.get(f"/api/v1/student/campaigns/{campaign_id}").json()
    pub = blindrsa.load_public_key(b64u_decode(detail["public_key"]))
    token = os.urandom(32)
    msg = blindrsa.token_message(uuid.UUID(campaign_id), token)
    blinded, state = blindrsa.blind(pub, msg)
    r = client.post(f"/api/v1/student/campaigns/{campaign_id}/credential", json={"blinded_msg": b64u_encode(blinded)})
    assert r.status_code == 200, r.text
    sig = blindrsa.finalize(pub, state, b64u_decode(r.json()["blind_sig"]))
    return token, sig, detail, (b64u_encode(blinded))


def answers_for(detail, stars=4, choice=1, text=None):
    out = []
    for q in detail["questions"]:
        if q["type"] == "star":
            out.append({"question_id": q["id"], "value": stars})
        elif q["type"] == "single":
            out.append({"question_id": q["id"], "option_ids": [q["options"][choice]["id"]]})
        elif q["type"] == "text" and text:
            out.append({"question_id": q["id"], "text": text})
    return out


def submit(campaign_id, token, sig, detail, answers):
    c = new_client(ballot_app)  # a fresh client: no cookies, like a separate origin
    return c.post(f"/api/v1/campaigns/{campaign_id}/submit", json={
        "key_id": detail["key_id"], "token": b64u_encode(token), "signature": b64u_encode(sig), "answers": answers})


def cast_all(w, stars=(5, 4, 4, 3, 5), text=None):
    """Every student claims and submits once."""
    for i, email in enumerate(w.student_emails):
        c = login(email)
        token, sig, detail, _ = claim(c, w.campaign_id)
        r = submit(w.campaign_id, token, sig, detail, answers_for(detail, stars=stars[i % len(stars)], text=text and f"{text} {i}"))
        assert r.status_code == 201, r.text
