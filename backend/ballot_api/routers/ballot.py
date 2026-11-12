import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ballot_api.deps import get_db
from ballot_api.models import CampaignPublic, Response, SpentToken
from ballot_api.schemas import SubmitIn
from ballot_api.services.validate import validate_answers
from common import blindrsa
from common.security import b64u_decode, client_ip, limiter, sha256

router = APIRouter()


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/campaigns/{campaign_id}/submit", status_code=201)
def submit(campaign_id: uuid.UUID, body: SubmitIn, request: Request, db: Session = Depends(get_db)):
    limiter.check(f"submit:{client_ip(request)}", limit=30, window_s=60)

    camp = db.get(CampaignPublic, campaign_id)
    if camp is None:
        raise HTTPException(404, "Campaign not found")
    if camp.status != "open" or not (
        datetime.fromisoformat(camp.opens_at_iso) <= _now() < datetime.fromisoformat(camp.closes_at_iso)
    ):
        raise HTTPException(410, "Campaign is not accepting submissions")
    if body.key_id != camp.key_id:
        raise HTTPException(401, "Invalid credential")

    # 1. Cryptographic check first: cheap, and nothing touches the DB for forged tokens.
    token = b64u_decode(body.token)
    signature = b64u_decode(body.signature)
    if len(token) != 32:
        raise HTTPException(401, "Invalid credential")
    pub = blindrsa.load_public_key(camp.public_key_der)
    if not blindrsa.verify(pub, blindrsa.token_message(campaign_id, token), signature):
        raise HTTPException(401, "Invalid credential")

    # 2. Validate the ballot content.
    checked = validate_answers(camp, body.answers)

    # 3. One transaction: consume the token AND store the ballot, or neither.
    try:
        db.add(SpentToken(campaign_id=campaign_id, token_hash=sha256(token)))
        db.flush()  # PRIMARY KEY (campaign_id, token_hash) makes a replay fail here, atomically
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This credential has already been used") from None

    response = Response(
        campaign_id=campaign_id,
        moderation="pending" if (camp.moderation_enabled and checked.has_text) else "ok",
        answers=checked.rows,
    )
    db.add(response)
    db.commit()
    return {}


@router.get("/campaigns/{campaign_id}/spent")
def spent_tokens(campaign_id: uuid.UUID, db: Session = Depends(get_db)):
    """After close, publish consumed-token hashes so a student can verify their ballot was counted."""
    camp = db.get(CampaignPublic, campaign_id)
    if camp is None or camp.status != "closed":
        raise HTTPException(404, "Not available")
    rows = db.query(SpentToken.token_hash).filter(SpentToken.campaign_id == campaign_id).all()
    return {"token_hashes": sorted(r[0].hex() for r in rows)}
