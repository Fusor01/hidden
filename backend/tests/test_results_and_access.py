from tests.conftest import build_world, cast_all, login, new_client


def _results(client, cid):
    return client.get(f"/api/v1/faculty/campaigns/{cid}/results")


def test_nothing_is_released_while_the_campaign_is_open():
    w = build_world()
    cast_all(w)
    r = _results(login(w.fac_email), w.campaign_id)
    assert r.status_code == 200 and r.json()["released"] is False


def test_results_suppressed_below_k():
    w = build_world(n_students=5, k=5, text=False)
    from tests.conftest import claim, submit, answers_for
    for email in w.student_emails[:4]:  # only 4 of 5 respond; k = 5
        t, s, d, _ = claim(login(email), w.campaign_id)
        assert submit(w.campaign_id, t, s, d, answers_for(d)).status_code == 201
    w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/close")
    body = _results(login(w.fac_email), w.campaign_id).json()
    assert body["released"] is False and body["reason"] == "below_threshold"
    assert "n" not in body and "questions" not in body


def test_results_released_at_k_with_aggregates_only():
    w = build_world(n_students=5, k=5, text=False)
    cast_all(w, stars=(5, 4, 4, 3, 5))
    w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/close")
    body = _results(login(w.fac_email), w.campaign_id).json()
    assert body["released"] and body["n"] == 5 and body["overall_mean"] == 4.2
    star = next(q for q in body["questions"] if q["type"] == "star")
    assert star["distribution"] == {"1": 0, "2": 0, "3": 1, "4": 2, "5": 2}
    flat = str(body).lower()
    for forbidden in ("student", "email", "token", "created", "timestamp", "user_id"):
        assert forbidden not in flat


def test_text_hidden_until_moderated_ok_then_shuffled_and_thresholded():
    w = build_world(n_students=5, k=3, text=True, moderation=True)
    cast_all(w, text="comment")
    w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/close")
    fac = login(w.fac_email)
    txt = lambda: next(q for q in _results(fac, w.campaign_id).json()["questions"] if q["type"] == "text")  # noqa: E731
    assert txt()["suppressed"] is True  # nothing approved yet
    queue = w.admin.get(f"/api/v1/admin/campaigns/{w.campaign_id}/moderation").json()
    assert len(queue) == 5 and all(set(i) == {"response_id", "state", "texts"} for i in queue)
    for item in queue[:2]:
        w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/moderation", json={"response_id": item["response_id"], "state": "ok"})
    assert txt()["suppressed"] is True  # 2 approved < k = 3
    w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/moderation", json={"response_id": queue[2]["response_id"], "state": "ok"})
    assert txt()["suppressed"] is False and txt()["n"] == 3


def test_faculty_cannot_read_another_facultys_campaign():
    w = build_world()
    cast_all(w)
    w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/close")
    other = login(w.other_fac_email)
    assert _results(other, w.campaign_id).status_code == 404
    assert other.get(f"/api/v1/faculty/reports/{w.campaign_id}").status_code == 404
    assert other.get("/api/v1/faculty/analytics").json() == []


def test_students_cannot_read_results_or_other_students_data():
    w = build_world()
    s = login(w.student_emails[0])
    assert s.get(f"/api/v1/faculty/campaigns/{w.campaign_id}/results").status_code == 403
    assert s.get(f"/api/v1/admin/campaigns/{w.campaign_id}/stats").status_code == 403


def test_admin_stats_round_claims_while_open_and_hide_submitted():
    w = build_world(n_students=5, k=3)
    from tests.conftest import claim
    claim(login(w.student_emails[0]), w.campaign_id)
    s = w.admin.get(f"/api/v1/admin/campaigns/{w.campaign_id}/stats").json()
    assert s["claimed"] % 5 == 0 and "submitted" not in s
    w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/close")
    s = w.admin.get(f"/api/v1/admin/campaigns/{w.campaign_id}/stats").json()
    assert s["claimed"] == 1 and s["submitted"] == 0


def test_roster_is_frozen_after_open_and_small_rosters_are_refused():
    w = build_world()
    assert w.admin.post(f"/api/v1/admin/campaigns/{w.campaign_id}/eligibility", json={"mode": "enrolled"}).status_code == 409
    small = build_world(n_students=3, k=5, open_campaign=False)
    assert small.admin.post(f"/api/v1/admin/campaigns/{small.campaign_id}/open").status_code == 400


def test_api_surface_has_no_student_to_ballot_endpoint():
    from identity_api.main import app as ia
    from ballot_api.main import app as ba
    paths = " ".join(r.path for r in ia.routes) + " " + " ".join(r.path for r in ba.routes)
    for bad in ("responses", "ballots", "mapping", "who"):
        assert bad not in paths
