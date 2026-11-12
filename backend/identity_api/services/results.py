"""The ONLY code path that turns raw ballots into numbers. Suppression rules live here.

Rules: results exist only after the campaign closes; nothing is shown below k responses;
a question is suppressed below k answers; free text is shown only when at least k moderated-OK
texts exist, and always shuffled. Ballots carry no timestamps, so nothing time-based can leak.
"""
import secrets
import uuid
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ballot_api import models as bm

_rng = secrets.SystemRandom()


def campaign_results(anon: Session, campaign_id: uuid.UUID) -> dict:
    cp = anon.get(bm.CampaignPublic, campaign_id)
    if cp is None or cp.status != "closed":
        return {"released": False, "reason": "campaign_not_closed"}
    k = cp.k_threshold
    n = anon.scalar(select(func.count()).select_from(bm.Response).where(bm.Response.campaign_id == campaign_id)) or 0
    if n < k:
        return {"released": False, "reason": "below_threshold", "k": k}

    out = []
    for q in cp.questions:
        rows = anon.execute(
            select(bm.ResponseAnswer.response_id, bm.ResponseAnswer.int_value, bm.ResponseAnswer.option_id,
                   bm.ResponseAnswer.text_value, bm.Response.moderation)
            .join(bm.Response, bm.Response.id == bm.ResponseAnswer.response_id)
            .where(bm.ResponseAnswer.question_id == q.id, bm.Response.campaign_id == campaign_id)
        ).all()
        item = {"question_id": str(q.id), "prompt": q.prompt, "type": q.type}

        if q.type == "text":
            texts = [r.text_value for r in rows if r.moderation == "ok"]
            if len(texts) < k:
                item.update(suppressed=True, n=0)
            else:
                _rng.shuffle(texts)
                item.update(suppressed=False, n=len(texts), texts=texts)
        else:
            answered = len({r.response_id for r in rows})
            if answered < k:
                item.update(suppressed=True, n=0)
            elif q.type in ("star", "numeric"):
                vals = [r.int_value for r in rows]
                dist = Counter(vals)
                item.update(suppressed=False, n=answered, mean=round(sum(vals) / len(vals), 2),
                            distribution={str(v): dist.get(v, 0)
                                          for v in range(1 if q.type == "star" else q.min_value,
                                                         (5 if q.type == "star" else q.max_value) + 1)})
            else:
                cnt = Counter(r.option_id for r in rows)
                item.update(suppressed=False, n=answered,
                            options=[{"label": o.label, "count": cnt.get(o.id, 0)} for o in q.options])
        out.append(item)

    means = [i["mean"] for i in out if i["type"] == "star" and not i["suppressed"]]
    return {"released": True, "n": n, "k": k, "overall_mean": round(sum(means) / len(means), 2) if means else None,
            "questions": out}
