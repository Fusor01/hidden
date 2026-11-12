"""LLT validation + blind credential issuance."""
import hashlib
import hmac
import uuid

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from common import blindrsa
from common.config import Settings
from common.envelope import unseal
from common.security import b64u_decode, b64u_encode, sha256
from identity_api.deps import aware, utcnow
from identity_api.models import Campaign, EligibilityCredential, SigningKey


def llt_digest(elig_key_hex: str, campaign_id: uuid.UUID, student_id: uuid.UUID) -> bytes:
    """Deterministic: logging in again can never produce a 'fresh' eligibility."""
    return hmac.new(bytes.fromhex(elig_key_hex), campaign_id.bytes + student_id.bytes, hashlib.sha256).digest()


def claim_credential(db: Session, settings: Settings, student_id: uuid.UUID, campaign_id: uuid.UUID,
                     blinded_b64: str) -> dict:
    now = utcnow()
    cred = db.get(EligibilityCredential, (campaign_id, student_id))
    camp = db.get(Campaign, campaign_id)
    if cred is None or camp is None:
        raise HTTPException(404, "Campaign not found")  # same answer for 'not on roster'
    if camp.status != "open" or not (aware(camp.starts_at) <= now < aware(camp.ends_at)) \
            or aware(cred.expires_at) <= now:
        raise HTTPException(410, "Campaign is not open")
    if not hmac.compare_digest(cred.llt_digest, llt_digest(settings.elig_hmac_key, campaign_id, student_id)):
        raise HTTPException(403, "Eligibility check failed")

    key = db.get(SigningKey, campaign_id)
    if key is None or key.private_key_enc is None:
        raise HTTPException(410, "Campaign is not open")
    blinded = b64u_decode(blinded_b64)
    try:
        # Sign BEFORE recording the claim: a failure here can never burn the student's one claim.
        priv = blindrsa.load_private_key(unseal(settings.master_key, key.private_key_enc))
        signature = blindrsa.blind_sign(priv, blinded)
    except blindrsa.BlindRSAError:
        raise HTTPException(400, "Invalid blinded message") from None

    h = sha256(blinded)
    response = {"blind_sig": b64u_encode(signature), "key_id": key.key_id}

    if cred.issued_on is None:
        # Atomic, single-winner claim. The WHERE clause is the whole concurrency story.
        res = db.execute(
            update(EligibilityCredential)
            .where(
                EligibilityCredential.campaign_id == campaign_id,
                EligibilityCredential.student_id == student_id,
                EligibilityCredential.issued_on.is_(None),
                EligibilityCredential.expires_at > now,
            )
            .values(issued_on=now.date(), blinded_hash=h)
        )
        db.commit()
        if res.rowcount == 1:
            return response
        db.refresh(cred)  # lost a race with another request from the same student

    # Already claimed. Same blinded message => idempotent retry (lost response / refresh).
    if cred.blinded_hash is not None and hmac.compare_digest(cred.blinded_hash, h):
        return response
    raise HTTPException(409, "A credential was already issued for this campaign")
