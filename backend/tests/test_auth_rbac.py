from tests.conftest import PW, build_world, login, new_client


def test_login_sets_httponly_host_only_cookie():
    w = build_world(open_campaign=False)
    r = new_client().post("/api/v1/auth/login", json={"email": w.student_emails[0], "password": PW})
    assert r.status_code == 200 and r.json()["role"] == "student"
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "domain=" not in cookie


def test_wrong_password_and_unknown_user_look_identical():
    w = build_world(open_campaign=False)
    a = new_client().post("/api/v1/auth/login", json={"email": w.student_emails[0], "password": "nope" * 5})
    b = new_client().post("/api/v1/auth/login", json={"email": "ghost@x.edu", "password": "nope" * 5})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_lockout_after_repeated_failures():
    w = build_world(open_campaign=False)
    c = new_client()
    for _ in range(5):
        c.post("/api/v1/auth/login", json={"email": w.student_emails[1], "password": "bad" * 5})
    r = c.post("/api/v1/auth/login", json={"email": w.student_emails[1], "password": PW})
    assert r.status_code == 401  # correct password refused while locked


def test_unauthenticated_requests_rejected():
    assert new_client().get("/api/v1/student/campaigns").status_code == 401
    assert new_client().get("/api/v1/admin/dashboard").status_code == 401


def test_csrf_unsafe_method_needs_allowed_origin():
    from fastapi.testclient import TestClient
    from identity_api.main import app
    r = TestClient(app).post("/api/v1/auth/login", json={"email": "a@b.c", "password": "x"})
    assert r.status_code == 403


def test_role_boundaries():
    w = build_world(open_campaign=False)
    student, fac = login(w.student_emails[0]), login(w.fac_email)
    assert student.get("/api/v1/admin/dashboard").status_code == 403
    assert student.get("/api/v1/faculty/dashboard").status_code == 403
    assert fac.get("/api/v1/admin/dashboard").status_code == 403
    assert fac.get("/api/v1/student/campaigns").status_code == 403
    assert w.admin.get("/api/v1/student/campaigns").status_code == 403


def test_brute_force_login_is_rate_limited():
    c = new_client()
    codes = [c.post("/api/v1/auth/login", json={"email": "x@y.z", "password": "p" * 12}).status_code for _ in range(12)]
    assert 429 in codes
