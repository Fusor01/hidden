"""Opening and closing campaigns. Opening freezes the roster and creates the signing key."""
import hashlib
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ballot_api import models as bm
from common import blindrsa
from common.config import Settings
from common.envelope import seal
from identity_api.deps import aware, utcnow
from identity_api.models import (AuditLog, Campaign, CampaignEligibility, EligibilityCredential, Offering,
                                 SigningKey)
from identity_api.services.issuance import llt_digest


def open_campaign(db: Session, anon: Session, settings: Settings, camp: Campaign, actor: uuid.UUID) -> None:
    if camp.status != "draft":
        raise HTTPException(409, "Only draft campaigns can be opened")
    roster = sorted(db.scalars(select(CampaignEligibility.student_id)
                               .where(CampaignEligibility.campaign_id == camp.id)).all(), key=str)
    if not roster:
        raise HTTPException(400, "The eligibility roster is empty")
    if not camp.questions:
        raise HTTPException(400, "The campaign has no questions")
    if len(roster) < camp.k_threshold:
        raise HTTPException(
            400, "The roster is smaller than the anonymity threshold, so results could never be shown. "
                 "Enlarge the roster or lower k (minimum 3).")
    if aware(camp.ends_at) <= utcnow():
        raise HTTPException(400, "The campaign end date is in the past")

    for sid in roster:
        db.add(EligibilityCredential(
            campaign_id=camp.id, student_id=sid, expires_at=camp.ends_at,
            llt_digest=llt_digest(settings.elig_hmac_key, camp.id, sid)))

    priv = blindrsa.generate_private_key(settings.key_bits)
    pub_der = blindrsa.public_key_der(priv.public_key())
    key_id = hashlib.sha256(pub_der).hexdigest()[:16]
    db.add(SigningKey(campaign_id=camp.id, key_id=key_id, public_key_der=pub_der,
                      private_key_enc=seal(settings.master_key, blindrsa.private_key_der(priv))))

    camp.status = "open"
    camp.roster_hash = hashlib.sha256(",".join(map(str, roster)).encode()).hexdigest()
    camp.roster_frozen_at = utcnow()

    off = db.get(Offering, camp.offering_id)
    cp = bm.CampaignPublic(
        campaign_id=camp.id, course_id=off.course_id, faculty_id=off.faculty_id, semester_id=off.semester_id,
        status="open", opens_at_iso=aware(camp.starts_at).isoformat(), closes_at_iso=aware(camp.ends_at).isoformat(),
        k_threshold=camp.k_threshold, text_enabled=camp.text_enabled, moderation_enabled=camp.moderation_enabled,
        key_id=key_id, public_key_der=pub_der,
        questions=[
            bm.QuestionPublic(
                id=q.id, position=q.position, type=q.type, prompt=q.prompt, required=q.required,
                min_value=q.min_value, max_value=q.max_value,
                options=[bm.OptionPublic(id=o.id, position=o.position, label=o.label) for o in q.options])
            for q in camp.questions
        ])
    anon.add(cp)
    anon.commit()  # if this fails nothing was opened; if the next commit fails nobody can claim a credential
    db.add(AuditLog(actor_user_id=actor, action="campaign.open", target_type="campaign", target_id=str(camp.id),
                    meta={"eligible": len(roster), "roster_hash": camp.roster_hash}))
    db.commit()


def close_campaign(db: Session, anon: Session, camp: Campaign, actor: uuid.UUID) -> None:
    if camp.status != "open":
        raise HTTPException(409, "Only open campaigns can be closed")
    cp = anon.get(bm.CampaignPublic, camp.id)
    if cp is not None:
        cp.status = "closed"  # ballots stop first
        anon.commit()
    key = db.get(SigningKey, camp.id)
    if key is not None:
        key.private_key_enc = None  # no further credentials can ever be issued
        key.destroyed_at = utcnow()
    camp.status = "closed"
    db.add(AuditLog(actor_user_id=actor, action="campaign.close", target_type="campaign", target_id=str(camp.id)))
    db.commit()
