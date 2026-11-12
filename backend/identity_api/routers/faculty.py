import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from identity_api.deps import get_anon_reports_db, get_db, require_role
from identity_api.models import Campaign, Course, Faculty, Offering, Semester, User
from identity_api.services.results import campaign_results

router = APIRouter()
faculty_only = require_role("faculty")


def _own_campaign(db: Session, user: User, campaign_id: uuid.UUID):
    row = db.execute(
        select(Campaign, Course, Semester)
        .join(Offering, Offering.id == Campaign.offering_id)
        .join(Course, Course.id == Offering.course_id)
        .join(Semester, Semester.id == Offering.semester_id)
        .where(Campaign.id == campaign_id, Offering.faculty_id == user.id, Campaign.status != "draft")
    ).first()
    if row is None:
        raise HTTPException(404, "Campaign not found")  # also the answer for someone else's campaign (no IDOR oracle)
    return row


def _list_own(db: Session, user: User):
    return db.execute(
        select(Campaign, Course, Semester)
        .join(Offering, Offering.id == Campaign.offering_id)
        .join(Course, Course.id == Offering.course_id)
        .join(Semester, Semester.id == Offering.semester_id)
        .where(Offering.faculty_id == user.id, Campaign.status != "draft")
        .order_by(Semester.start_date.desc(), Course.code)
    ).all()


@router.get("/dashboard")
def dashboard(user: User = Depends(faculty_only), db: Session = Depends(get_db)):
    rows = _list_own(db, user)
    return {"campaigns": len(rows), "open": sum(c.status == "open" for c, _, _ in rows),
            "closed": sum(c.status == "closed" for c, _, _ in rows)}


@router.get("/courses")
def courses(user: User = Depends(faculty_only), db: Session = Depends(get_db)):
    return [{"campaign_id": str(c.id), "name": c.name, "course_code": co.code, "course_title": co.title,
             "semester": s.name, "status": c.status} for c, co, s in _list_own(db, user)]


@router.get("/campaigns/{campaign_id}/results")
def results(campaign_id: uuid.UUID, user: User = Depends(faculty_only), db: Session = Depends(get_db),
            anon: Session = Depends(get_anon_reports_db)):
    camp, course, sem = _own_campaign(db, user, campaign_id)
    return {"campaign": camp.name, "course": f"{course.code} {course.title}", "semester": sem.name,
            **campaign_results(anon, campaign_id)}


@router.get("/analytics")
def analytics(user: User = Depends(faculty_only), db: Session = Depends(get_db),
              anon: Session = Depends(get_anon_reports_db)):
    out = []
    for camp, course, sem in _list_own(db, user):
        if camp.status != "closed":
            continue
        r = campaign_results(anon, camp.id)
        out.append({"campaign_id": str(camp.id), "campaign": camp.name, "course": course.code, "semester": sem.name,
                    "released": r["released"], "n": r.get("n"), "overall_mean": r.get("overall_mean")})
    return out


@router.get("/reports/{campaign_id}")
def report(campaign_id: uuid.UUID, user: User = Depends(faculty_only), db: Session = Depends(get_db),
           anon: Session = Depends(get_anon_reports_db)):
    camp, course, sem = _own_campaign(db, user, campaign_id)
    fac = db.get(Faculty, user.id)
    return {"title": camp.name, "faculty": fac.name, "course": f"{course.code} {course.title}", "semester": sem.name,
            **campaign_results(anon, campaign_id)}
