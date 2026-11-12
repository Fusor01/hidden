import os
from concurrent.futures import ThreadPoolExecutor

from common import blindrsa
from common.security import b64u_decode, b64u_encode
from tests.conftest import (BallotSession, answers_for, build_world, cast_all, claim, login, new_client, submit)
from ballot_api import models as bm


def test_full_flow_claim_then_anonymous_submit():
    w = build_world()
    c = login(w.student_emails[0])
    token, sig, detail, _ = claim(c, w.campaign_id)
    r = submit(w.campaign_id, token, sig, detail, answers_for(detail, text="Great course"))
    assert r.status_code == 201, r.text


def test_replayed_token_is_rejected():
    w = build_world()
    token, sig, detail, _ = claim(login(w.student_emails[0]), w.campaign_id)
    assert submit(w.campaign_id, token, sig, detail, answers_for(detail)).status_code == 201
    assert submit(w.campaign_id, token, sig, detail, answers_for(detail)).status_code == 409


def test_concurrent_replays_consume_the_token_exactly_once():
    w = build_world()
    token, sig, detail, _ = claim(login(w.student_emails[0]), w.campaign_id)
    ans = answers_for(detail)
    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(lambda _: submit(w.campaign_id, token, sig, detail, ans).status_code, range(8)))
    assert codes.count(201) == 1 and codes.count(409) == 7
    with BallotSession() as db:
        import uuid
        assert db.query(bm.Response).filter_by(campaign_id=uuid.UUID(w.campaign_id)).count() == 1


def test_second_claim_with_a_different_blinded_message_is_refused():
    w = build_world()
    c = login(w.student_emails[0])
    claim(c, w.campaign_id)
    detail = c.get(f"/api/v1/student/campaigns/{w.campaign_id}").json()
    pub = blindrsa.load_public_key(b64u_decode(detail["public_key"]))
    import uuid
    blinded, _ = blindrsa.blind(pub, blindrsa.token_message(uuid.UUID(w.campaign_id), os.urandom(32)))
    r = c.post(f"/api/v1/student/campaigns/{w.campaign_id}/credential", json={"blinded_msg": b64u_encode(blinded)})
    assert r.status_code == 409


def test_retry_with_same_blinded_message_is_idempotent_and_survives_relogin():
    w = build_world()
    c = login(w.student_emails[0])
    _, _, _, blinded = claim(c, w.campaign_id)
    again = login(w.student_emails[0])  # logging in again must not reset eligibility
    r = again.post(f"/api/v1/student/campaigns/{w.campaign_id}/credential", json={"blinded_msg": blinded})
    assert r.status_code == 200


def test_student_not_on_roster_cannot_claim():
    w = build_world()
    outsider = build_world(open_campaign=False)
    c = login(outsider.student_emails[0])
    assert c.get(f"/api/v1/student/campaigns/{w.campaign_id}").status_code == 404
    r = c.post(f"/api/v1/student/campaigns/{w.campaign_id}/credential", json={"blinded_msg": "A" * 400})
    assert r.status_code == 404


def test_forged_token_and_other_campaign_token_rejected():
    w, w2 = build_world(), build_world()
    token, sig, detail, _ = claim(login(w.student_emails[0]), w.campaign_id)
    ans = answers_for(detail)
    assert submit(w.campaign_id, os.urandom(32), sig, detail, ans).status_code == 401           # wrong token
    assert submit(w.campaign_id, token, bytes(len(sig)), detail, ans).status_code == 401        # forged signature
    d2 = login(w2.student_emails[0]).get(f"/api/v1/student/campaigns/{w2.campaign_id}").json()
    assert submit(w2.campaign_id, token, sig, d2, answers_for(d2)).status_code == 401            # replay in another campaign


def test_invalid_answers_rejected_and_token_not_burned():
    w = build_world()
    token, sig, detail, _ = claim(login(w.student_emails[0]), w.campaign_id)
    bad = answers_for(detail, stars=9)
    assert submit(w.campaign_id, token, sig, detail, bad).status_code == 400
    assert submit(w.campaign_id, token, sig, detail, answers_for(detail)).status_code == 201


def test_required_question_missing_rejected():
    w = build_world()
    token, sig, detail, _ = claim(login(w.student_emails[0]), w.campaign_id)
    assert submit(w.campaign_id, token, sig, detail, answers_for(detail)[:1]).status_code == 400


def test_closing_stops_claims_and_submissions_and_destroys_key():
    w = build_world()
    c = login(w.student_emails[0])
    token, sig, detail, _ = claim(c, w.campaign_id)
    assert w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/close").status_code == 200
    assert submit(w.campaign_id, token, sig, detail, answers_for(detail)).status_code == 410
    c2 = login(w.student_emails[1])
    assert c2.get(f"/api/v1/student/campaigns/{w.campaign_id}").status_code == 404
    from identity_api.models import SigningKey
    from tests.conftest import IdentitySession
    import uuid
    with IdentitySession() as db:
        assert db.get(SigningKey, uuid.UUID(w.campaign_id)).private_key_enc is None


def test_student_submissions_endpoint_cannot_reveal_whether_a_ballot_was_cast():
    w = build_world()
    c = login(w.student_emails[0])
    claim(c, w.campaign_id)
    rows = c.get("/api/v1/student/submissions").json()
    assert rows and set(rows[0]) == {"id", "name", "course_code", "course_title", "faculty", "ends_at", "status", "state"}


def test_spent_list_only_after_close_and_contains_hash_not_token():
    w = build_world()
    token, sig, detail, _ = claim(login(w.student_emails[0]), w.campaign_id)
    submit(w.campaign_id, token, sig, detail, answers_for(detail))
    ballot = new_client(__import__("ballot_api.main", fromlist=["app"]).app)
    assert ballot.get(f"/api/v1/campaigns/{w.campaign_id}/spent").status_code == 404
    w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/close")
    hashes = ballot.get(f"/api/v1/campaigns/{w.campaign_id}/spent").json()["token_hashes"]
    import hashlib
    assert hashlib.sha256(token).hexdigest() in hashes and token.hex() not in hashes
