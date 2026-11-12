"""Anonymous DB. No student reference, no timestamps, random primary keys.
Nothing here can be joined to the identity DB except campaign_id."""
import uuid

from sqlalchemy import (Boolean, CheckConstraint, ForeignKey, Integer, LargeBinary, String, Text, Uuid)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _pk():
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class CampaignPublic(Base):
    __tablename__ = "campaign_public"
    campaign_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    course_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    faculty_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    semester_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    status: Mapped[str] = mapped_column(String(10))
    opens_at_iso: Mapped[str] = mapped_column(String(40))
    closes_at_iso: Mapped[str] = mapped_column(String(40))
    k_threshold: Mapped[int] = mapped_column(Integer)
    text_enabled: Mapped[bool] = mapped_column(Boolean)
    moderation_enabled: Mapped[bool] = mapped_column(Boolean)
    key_id: Mapped[str] = mapped_column(String(32))
    public_key_der: Mapped[bytes] = mapped_column(LargeBinary)
    questions = relationship("QuestionPublic", cascade="all, delete-orphan", order_by="QuestionPublic.position")


class QuestionPublic(Base):
    __tablename__ = "questions_public"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_public.campaign_id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(10))
    prompt: Mapped[str] = mapped_column(String(500))
    required: Mapped[bool] = mapped_column(Boolean)
    min_value: Mapped[int | None] = mapped_column(Integer)
    max_value: Mapped[int | None] = mapped_column(Integer)
    options = relationship("OptionPublic", cascade="all, delete-orphan", order_by="OptionPublic.position")


class OptionPublic(Base):
    __tablename__ = "options_public"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions_public.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(200))


class SpentToken(Base):
    """SHA-256 of a consumed token. The composite primary key IS the replay defence."""
    __tablename__ = "spent_tokens"
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_public.campaign_id", ondelete="CASCADE"), primary_key=True)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), primary_key=True)


class Response(Base):
    __tablename__ = "responses"
    id: Mapped[uuid.UUID] = _pk()  # random, so primary-key order reveals nothing
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_public.campaign_id", ondelete="CASCADE"), index=True)
    moderation: Mapped[str] = mapped_column(String(8), default="ok")  # pending | ok | hidden
    answers = relationship("ResponseAnswer", cascade="all, delete-orphan")
    __table_args__ = (CheckConstraint("moderation in ('pending','ok','hidden')", name="ck_resp_mod"),)


class ResponseAnswer(Base):
    __tablename__ = "response_answers"
    id: Mapped[uuid.UUID] = _pk()
    response_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("responses.id", ondelete="CASCADE"), index=True)
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("questions_public.id", ondelete="CASCADE"), index=True)
    int_value: Mapped[int | None] = mapped_column(Integer)
    option_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("options_public.id", ondelete="CASCADE"))
    text_value: Mapped[str | None] = mapped_column(Text)
    __table_args__ = (
        CheckConstraint(
            "(CASE WHEN int_value IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN option_id IS NOT NULL THEN 1 ELSE 0 END) + (CASE WHEN text_value IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="ck_answer_exactly_one_value",
        ),
    )
