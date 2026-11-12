import secrets
import uuid

from argon2 import PasswordHasher
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ballot_api import models as bm
from common.config import get_settings
from identity_api.deps import get_anon_admin_db, get_anon_reports_db, get_db, require_role
from identity_api.models import (AuditLog, Campaign, CampaignEligibility, Course, EligibilityCredential, Enrollment,
                                 Faculty, Offering, Option, Question, Semester, Student, User)
from identity_api.schemas import (CampaignIn, CourseIn, EligibilityIn, EnrollmentsIn, FacultyIn, ModerationIn,
                                  OfferingIn, SemesterIn, StudentIn)
from identity_api.services.lifecycle import close_campaign, open_campaign
from identity_api.services.results import campaign_results

router = APIRouter()
admin_only = require_role("admin")
ph = PasswordHasher()


def _audit(db: Session, actor: User, action: str, target_type: str, target_id: str, meta: dict | None = None):
    db.add(AuditLog(actor_user_id=actor.id, action=action, target_type=target_type, target_id=target_id, meta=meta))


def _commit(db: Session):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Conflicts with an existing record") from None


def _new_user(db: Session, email: str, role: str, password: str | None) -> tuple[User, str]:
    temp = password or secrets.token_urlsafe(10)
    u = User(email=email.strip().lower(), role=role, password_hash=ph.hash(temp))
    db.add(u)
    db.flush()
    return u, temp


# ---------- dashboard ----------
@router.get("/dashboard")
def dashboard(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    count = lambda m: db.scalar(select(func.count()).select_from(m)) or 0  # noqa: E731
    by = lambda s: db.scalar(select(func.count()).select_from(Campaign).where(Campaign.status == s)) or 0  # noqa: E731
    return {"students": count(Student), "faculty": count(Faculty), "courses": count(Course),
            "active_campaigns": by("open"), "completed_campaigns": by("closed"), "draft_campaigns": by("draft")}


# ---------- people & academics ----------
@router.post("/students", status_code=201)
def create_student(body: StudentIn, actor: User = Depends(admin_only), db: Session = Depends(get_db)):
    try:
        u, temp = _new_user(db, body.email, "student", body.password)
        db.add(Student(user_id=u.id, roll_no=body.roll_no, name=body.name, department=body.department,
                       batch_year=body.batch_year))
        _audit(db, actor, "student.create", "student", str(u.id))
        _commit(db)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email or roll number already exists") from None
    return {"id": str(u.id), "temporary_password": None if body.password else temp}


@router.get("/students")
def list_students(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.execute(select(Student, User.email).join(User, User.id == Student.user_id).order_by(Student.roll_no)).all()
    return [{"id": str(s.user_id), "name": s.name, "roll_no": s.roll_no, "department": s.department, "email": e}
            for s, e in rows]


@router.post("/faculty", status_code=201)
def create_faculty(body: FacultyIn, actor: User = Depends(admin_only), db: Session = Depends(get_db)):
    try:
        u, temp = _new_user(db, body.email, "faculty", body.password)
        db.add(Faculty(user_id=u.id, employee_no=body.employee_no, name=body.name, department=body.department))
        _audit(db, actor, "faculty.create", "faculty", str(u.id))
        _commit(db)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Email or employee number already exists") from None
    return {"id": str(u.id), "temporary_password": None if body.password else temp}


@router.get("/faculty")
def list_faculty(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [{"id": str(f.user_id), "name": f.name, "employee_no": f.employee_no, "department": f.department}
            for f in db.scalars(select(Faculty).order_by(Faculty.name))]


@router.post("/semesters", status_code=201)
def create_semester(body: SemesterIn, actor: User = Depends(admin_only), db: Session = Depends(get_db)):
    s = Semester(**body.model_dump())
    db.add(s)
    _audit(db, actor, "semester.create", "semester", str(s.id))
    _commit(db)
    return {"id": str(s.id)}


@router.get("/semesters")
def list_semesters(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [{"id": str(s.id), "name": s.name, "start_date": s.start_date.isoformat(), "end_date": s.end_date.isoformat()}
            for s in db.scalars(select(Semester).order_by(Semester.start_date.desc()))]


@router.post("/courses", status_code=201)
def create_course(body: CourseIn, actor: User = Depends(admin_only), db: Session = Depends(get_db)):
    c = Course(**body.model_dump())
    db.add(c)
    _audit(db, actor, "course.create", "course", str(c.id))
    _commit(db)
    return {"id": str(c.id)}


@router.get("/courses")
def list_courses(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [{"id": str(c.id), "code": c.code, "title": c.title, "department": c.department}
            for c in db.scalars(select(Course).order_by(Course.code))]


@router.post("/offerings", status_code=201)
def create_offering(body: OfferingIn, actor: User = Depends(admin_only), db: Session = Depends(get_db)):
    o = Offering(**body.model_dump())
    db.add(o)
    _audit(db, actor, "offering.create", "offering", str(o.id))
    _commit(db)
    return {"id": str(o.id)}


@router.get("/offerings")
def list_offerings(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    rows = db.execute(select(Offering, Course, Semester, Faculty).join(Course, Course.id == Offering.course_id)
                      .join(Semester, Semester.id == Offering.semester_id)
                      .join(Faculty, Faculty.user_id == Offering.faculty_id)).all()
    return [{"id": str(o.id), "course": f"{c.code} {c.title}", "semester": s.name, "faculty": f.name,
             "section": o.section} for o, c, s, f in rows]


@router.post("/enrollments", status_code=201)
def enroll(body: EnrollmentsIn, actor: User = Depends(admin_only), db: Session = Depends(get_db)):
    if db.get(Offering, body.offering_id) is None:
        raise HTTPException(404, "Offering not found")
    have = set(db.scalars(select(Enrollment.student_id).where(Enrollment.offering_id == body.offering_id)))
    valid = set(db.scalars(select(Student.user_id).where(Student.user_id.in_(body.student_ids))))
    new = (valid - have)
    db.add_all(Enrollment(student_id=s, offering_id=body.offering_id) for s in new)
    _audit(db, actor, "enrollment.add", "offering", str(body.offering_id), {"added": len(new)})
    _commit(db)
    return {"added": len(new), "ignored": len(body.student_ids) - len(new)}


# ---------- campaigns ----------
def _apply(camp: Campaign, body: CampaignIn) -> None:
    camp.offering_id, camp.name, camp.description = body.offering_id, body.name, body.description
    camp.starts_at, camp.ends_at, camp.k_threshold = body.starts_at, body.ends_at, body.k_threshold
    camp.text_enabled, camp.moderation_enabled = body.text_enabled, body.moderation_enabled
    camp.questions.clear()
    for i, q in enumerate(body.questions):
        lo, hi = (1, 5) if q.type == "star" else (q.min_value, q.max_value)
        camp.questions.append(Question(
            position=i, type=q.type, prompt=q.prompt, required=q.required, min_value=lo, max_value=hi,
            options=[Option(position=j, label=o.strip()) for j, o in enumerate(q.options)]))


def _out(c: Campaign) -> dict:
    return {"id": str(c.id), "name": c.name, "description": c.description, "status": c.status,
            "offering_id": str(c.offering_id), "starts_at": c.starts_at.isoformat(), "ends_at": c.ends_at.isoformat(),
            "k_threshold": c.k_threshold, "text_enabled": c.text_enabled, "moderation_enabled": c.moderation_enabled,
            "roster_hash": c.roster_hash,
            "questions": [{"type": q.type, "prompt": q.prompt, "required": q.required,
                           "options": [o.label for o in q.options]} for q in c.questions]}


def _get(db: Session, cid: uuid.UUID) -> Campaign:
    c = db.get(Campaign, cid)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    return c


@router.post("/campaigns", status_code=201)
def create_campaign(body: CampaignIn, actor: User = Depends(admin_only), db: Session = Depends(get_db)):
    if db.get(Offering, body.offering_id) is None:
        raise HTTPException(404, "Offering not found")
    c = Campaign(created_by=actor.id, status="draft")
    _apply(c, body)
    db.add(c)
    db.flush()
    _audit(db, actor, "campaign.create", "campaign", str(c.id))
    _commit(db)
    return _out(c)


@router.get("/campaigns")
def list_campaigns(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return [_out(c) for c in db.scalars(select(Campaign).order_by(Campaign.starts_at.desc()))]


@router.put("/campaigns/{campaign_id}")
def update_campaign(campaign_id: uuid.UUID, body: CampaignIn, actor: User = Depends(admin_only),
                    db: Session = Depends(get_db)):
    c = _get(db, campaign_id)
    if c.status != "draft":
        raise HTTPException(409, "Only draft campaigns can be edited")
    _apply(c, body)
    _audit(db, actor, "campaign.update", "campaign", str(c.id))
    _commit(db)
    return _out(c)


@router.post("/campaigns/{campaign_id}/eligibility")
def set_eligibility(campaign_id: uuid.UUID, body: EligibilityIn, actor: User = Depends(admin_only),
                    db: Session = Depends(get_db)):
    c = _get(db, campaign_id)
    if c.status != "draft":
        raise HTTPException(409, "The roster is frozen once a campaign opens")
    if body.mode == "enrolled":
        ids = set(db.scalars(select(Enrollment.student_id).where(Enrollment.offering_id == c.offering_id)))
    else:
        ids = set(db.scalars(select(Student.user_id).where(Student.user_id.in_(body.student_ids))))
    db.query(CampaignEligibility).filter(CampaignEligibility.campaign_id == c.id).delete()
    db.add_all(CampaignEligibility(campaign_id=c.id, student_id=s) for s in ids)
    _audit(db, actor, "campaign.roster", "campaign", str(c.id), {"size": len(ids), "mode": body.mode})
    _commit(db)
    return {"eligible": len(ids)}


@router.post("/campaigns/{campaign_id}/open")
def open_(campaign_id: uuid.UUID, actor: User = Depends(admin_only), db: Session = Depends(get_db),
          anon: Session = Depends(get_anon_admin_db)):
    c = _get(db, campaign_id)
    open_campaign(db, anon, get_settings(), c, actor.id)
    return _out(c)


@router.post("/campaigns/{campaign_id}/close")
def close_(campaign_id: uuid.UUID, actor: User = Depends(admin_only), db: Session = Depends(get_db),
           anon: Session = Depends(get_anon_admin_db)):
    c = _get(db, campaign_id)
    close_campaign(db, anon, c, actor.id)
    return _out(c)


@router.get("/campaigns/{campaign_id}/stats")
def stats(campaign_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db),
          anon: Session = Depends(get_anon_reports_db)):
    c = _get(db, campaign_id)
    eligible = db.scalar(select(func.count()).select_from(CampaignEligibility)
                         .where(CampaignEligibility.campaign_id == c.id)) or 0
    claimed = db.scalar(select(func.count()).select_from(EligibilityCredential).where(
        EligibilityCredential.campaign_id == c.id, EligibilityCredential.issued_on.is_not(None))) or 0
    out = {"status": c.status, "eligible": eligible,
           # rounded while open so one student's claim cannot be watched in real time
           "claimed": claimed if c.status != "open" else int(round(claimed / 5.0) * 5)}
    if c.status == "closed":
        out["submitted"] = anon.scalar(select(func.count()).select_from(bm.Response)
                                       .where(bm.Response.campaign_id == c.id)) or 0
    return out


@router.get("/campaigns/{campaign_id}/moderation")
def moderation_queue(campaign_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db),
                     anon: Session = Depends(get_anon_admin_db)):
    c = _get(db, campaign_id)
    if not c.moderation_enabled:
        return []
    rows = anon.execute(
        select(bm.Response.id, bm.Response.moderation, bm.ResponseAnswer.text_value)
        .join(bm.ResponseAnswer, bm.ResponseAnswer.response_id == bm.Response.id)
        .where(bm.Response.campaign_id == c.id, bm.ResponseAnswer.text_value.is_not(None))).all()
    grouped: dict[uuid.UUID, dict] = {}
    for rid, state, text in rows:
        grouped.setdefault(rid, {"response_id": str(rid), "state": state, "texts": []})["texts"].append(text)
    items = list(grouped.values())
    secrets.SystemRandom().shuffle(items)  # no ordering information
    return items


@router.post("/campaigns/{campaign_id}/moderation")
def moderate(campaign_id: uuid.UUID, body: ModerationIn, actor: User = Depends(admin_only),
             db: Session = Depends(get_db), anon: Session = Depends(get_anon_admin_db)):
    _get(db, campaign_id)
    r = anon.get(bm.Response, body.response_id)
    if r is None or r.campaign_id != campaign_id:
        raise HTTPException(404, "Response not found")
    r.moderation = body.state
    anon.commit()
    _audit(db, actor, "moderation.set", "campaign", str(campaign_id), {"state": body.state})
    db.commit()
    return {"ok": True}


# ---------- reports ----------
@router.get("/reports")
def reports(_: User = Depends(admin_only), db: Session = Depends(get_db),
            anon: Session = Depends(get_anon_reports_db)):
    rows = db.execute(
        select(Campaign, Course, Semester, Faculty)
        .join(Offering, Offering.id == Campaign.offering_id).join(Course, Course.id == Offering.course_id)
        .join(Semester, Semester.id == Offering.semester_id).join(Faculty, Faculty.user_id == Offering.faculty_id)
        .where(Campaign.status == "closed").order_by(Semester.start_date.desc())).all()
    out = []
    for c, co, s, f in rows:
        r = campaign_results(anon, c.id)
        out.append({"campaign_id": str(c.id), "campaign": c.name, "course": co.code, "semester": s.name,
                    "faculty": f.name, "released": r["released"], "n": r.get("n"), "overall_mean": r.get("overall_mean")})
    return out


@router.get("/reports/{campaign_id}")
def report(campaign_id: uuid.UUID, _: User = Depends(admin_only), db: Session = Depends(get_db),
           anon: Session = Depends(get_anon_reports_db)):
    c = _get(db, campaign_id)
    return {"campaign": c.name, **campaign_results(anon, campaign_id)}
