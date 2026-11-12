import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from common.config import get_settings
from common.security import b64u_encode, client_ip, limiter
from identity_api.deps import aware, get_db, require_role, utcnow
from identity_api.models import (Campaign, Course, EligibilityCredential, Faculty, Offering, SigningKey, User)
from identity_api.schemas import CredentialIn
from identity_api.services.issuance import claim_credential

router = APIRouter()
student_only = require_role("student")


def _row(camp: Campaign, cred: EligibilityCredential, course: Course, fac: Faculty) -> dict:
    return {
        "id": str(camp.id), "name": camp.name, "course_code": course.code, "course_title": course.title,
        "faculty": fac.name, "ends_at": aware(camp.ends_at).isoformat(), "status": camp.status,
        "state": "started" if cred.issued_on else "not_started",  # 'started' = credential claimed
    }


@router.get("/campaigns")
def list_campaigns(user: User = Depends(student_only), db: Session = Depends(get_db)):
    rows = db.execute(
        select(Campaign, EligibilityCredential, Course, Faculty)
        .join(EligibilityCredential, EligibilityCredential.campaign_id == Campaign.id)
        .join(Offering, Offering.id == Campaign.offering_id)
        .join(Course, Course.id == Offering.course_id)
        .join(Faculty, Faculty.user_id == Offering.faculty_id)
        .where(EligibilityCredential.student_id == user.id, Campaign.status.in_(["open", "closed"]))
        .order_by(Campaign.ends_at)
    ).all()
    return [_row(*r) for r in rows]


@router.get("/campaigns/{campaign_id}")
def campaign_detail(campaign_id: uuid.UUID, user: User = Depends(student_only), db: Session = Depends(get_db)):
    cred = db.get(EligibilityCredential, (campaign_id, user.id))
    camp = db.get(Campaign, campaign_id)
    if cred is None or camp is None or camp.status != "open" or aware(camp.ends_at) <= utcnow():
        raise HTTPException(404, "Campaign not found")
    key = db.get(SigningKey, campaign_id)
    return {
        "id": str(camp.id), "name": camp.name, "description": camp.description,
        "ends_at": aware(camp.ends_at).isoformat(), "text_enabled": camp.text_enabled,
        "state": "started" if cred.issued_on else "not_started",
        "key_id": key.key_id, "public_key": b64u_encode(key.public_key_der),
        "questions": [
            {"id": str(q.id), "type": q.type, "prompt": q.prompt, "required": q.required,
             "min_value": q.min_value, "max_value": q.max_value,
             "options": [{"id": str(o.id), "label": o.label} for o in q.options]}
            for q in camp.questions],
    }


@router.post("/campaigns/{campaign_id}/credential")
def claim(campaign_id: uuid.UUID, body: CredentialIn, request: Request, user: User = Depends(student_only),
          db: Session = Depends(get_db)):
    limiter.check(f"claim:{user.id}", 10, 60)
    limiter.check(f"claim-ip:{client_ip(request)}", 60, 60)
    return claim_credential(db, get_settings(), user.id, campaign_id, body.blinded_msg)


@router.get("/submissions")
def submissions(user: User = Depends(student_only), db: Session = Depends(get_db)):
    """Campaigns where this student claimed a credential. By design this cannot say whether a ballot
    was submitted: that would link the student to a ballot."""
    rows = db.execute(
        select(Campaign, EligibilityCredential, Course, Faculty)
        .join(EligibilityCredential, EligibilityCredential.campaign_id == Campaign.id)
        .join(Offering, Offering.id == Campaign.offering_id)
        .join(Course, Course.id == Offering.course_id)
        .join(Faculty, Faculty.user_id == Offering.faculty_id)
        .where(EligibilityCredential.student_id == user.id, EligibilityCredential.issued_on.is_not(None))
    ).all()
    return [_row(*r) for r in rows]
