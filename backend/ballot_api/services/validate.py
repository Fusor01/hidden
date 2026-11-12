"""Server-side validation of a ballot against the campaign's question schema."""
import uuid
from dataclasses import dataclass

from fastapi import HTTPException

from ballot_api.models import CampaignPublic, ResponseAnswer
from ballot_api.schemas import AnswerIn


@dataclass
class Checked:
    rows: list[ResponseAnswer]
    has_text: bool


def _bad(msg: str) -> HTTPException:
    return HTTPException(400, msg)


def validate_answers(camp: CampaignPublic, answers: list[AnswerIn]) -> Checked:
    by_q = {q.id: q for q in camp.questions}
    seen: set[uuid.UUID] = set()
    rows: list[ResponseAnswer] = []
    has_text = False

    for a in answers:
        q = by_q.get(a.question_id)
        if q is None:
            raise _bad("Unknown question")
        if a.question_id in seen:
            raise _bad("Duplicate answer for a question")
        seen.add(a.question_id)

        if q.type in ("star", "numeric"):
            if a.value is None or a.option_ids or a.text:
                raise _bad("Expected a numeric value")
            lo = 1 if q.type == "star" else q.min_value
            hi = 5 if q.type == "star" else q.max_value
            if lo is None or hi is None or not lo <= a.value <= hi:
                raise _bad("Value out of range")
            rows.append(ResponseAnswer(question_id=q.id, int_value=a.value))

        elif q.type in ("single", "multi"):
            ids = a.option_ids or []
            valid = {o.id for o in q.options}
            if a.value is not None or a.text or not ids:
                raise _bad("Expected option selection")
            if len(set(ids)) != len(ids) or not set(ids) <= valid:
                raise _bad("Invalid option selection")
            if q.type == "single" and len(ids) != 1:
                raise _bad("Exactly one option expected")
            rows.extend(ResponseAnswer(question_id=q.id, option_id=oid) for oid in ids)

        elif q.type == "text":
            if not camp.text_enabled:
                raise _bad("Text answers are disabled for this campaign")
            text = (a.text or "").strip()
            if a.value is not None or a.option_ids or not text:
                raise _bad("Expected text")
            rows.append(ResponseAnswer(question_id=q.id, text_value=text))
            has_text = True

    missing = [q.id for q in camp.questions if q.required and q.id not in seen]
    if missing:
        raise _bad("Required questions are unanswered")
    if not rows:
        raise _bad("Empty submission")
    return Checked(rows=rows, has_text=has_text)
