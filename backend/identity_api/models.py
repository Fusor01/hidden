"""Identity DB. Knows WHO is eligible and WHO claimed a credential. Never sees a token or a ballot."""
import uuid
from datetime import date, datetime

from sqlalchemy import (JSON, Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer,
                        LargeBinary, String, Text, UniqueConstraint, Uuid, func)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _pk():
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _pk()
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (CheckConstraint("role in ('student','faculty','admin')", name="ck_users_role"),)


class Student(Base):
    __tablename__ = "students"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    roll_no: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    department: Mapped[str | None] = mapped_column(String(80))
    batch_year: Mapped[int | None] = mapped_column(Integer)


class Faculty(Base):
    __tablename__ = "faculty"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    employee_no: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    department: Mapped[str | None] = mapped_column(String(80))


class Semester(Base):
    __tablename__ = "semesters"
    id: Mapped[uuid.UUID] = _pk()
    name: Mapped[str] = mapped_column(String(60), unique=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    __table_args__ = (CheckConstraint("end_date > start_date", name="ck_semester_dates"),)


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[uuid.UUID] = _pk()
    code: Mapped[str] = mapped_column(String(30), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    department: Mapped[str | None] = mapped_column(String(80))


class Offering(Base):
    __tablename__ = "course_offerings"
    id: Mapped[uuid.UUID] = _pk()
    course_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("courses.id", ondelete="RESTRICT"))
    semester_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("semesters.id", ondelete="RESTRICT"))
    faculty_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("faculty.user_id", ondelete="RESTRICT"))
    section: Mapped[str] = mapped_column(String(10), default="A")
    course = relationship("Course")
    semester = relationship("Semester")
    __table_args__ = (UniqueConstraint("course_id", "semester_id", "faculty_id", "section"),)


class Enrollment(Base):
    __tablename__ = "enrollments"
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.user_id", ondelete="CASCADE"), primary_key=True)
    offering_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("course_offerings.id", ondelete="CASCADE"), primary_key=True)


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[uuid.UUID] = _pk()
    offering_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("course_offerings.id", ondelete="RESTRICT"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="draft")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    k_threshold: Mapped[int] = mapped_column(Integer, default=5)
    text_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    moderation_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    roster_hash: Mapped[str | None] = mapped_column(String(64))
    roster_frozen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    offering = relationship("Offering")
    questions = relationship("Question", cascade="all, delete-orphan", order_by="Question.position")
    __table_args__ = (
        CheckConstraint("status in ('draft','open','closed')", name="ck_campaign_status"),
        CheckConstraint("k_threshold >= 3", name="ck_campaign_k"),
        CheckConstraint("ends_at > starts_at", name="ck_campaign_dates"),
    )


class Question(Base):
    __tablename__ = "campaign_questions"
    id: Mapped[uuid.UUID] = _pk()
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(10))  # star | numeric | single | multi | text
    prompt: Mapped[str] = mapped_column(String(500))
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    min_value: Mapped[int | None] = mapped_column(Integer)
    max_value: Mapped[int | None] = mapped_column(Integer)
    options = relationship("Option", cascade="all, delete-orphan", order_by="Option.position")
    __table_args__ = (CheckConstraint("type in ('star','numeric','single','multi','text')", name="ck_q_type"),)


class Option(Base):
    __tablename__ = "question_options"
    id: Mapped[uuid.UUID] = _pk()
    question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaign_questions.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(200))


class CampaignEligibility(Base):
    """Frozen roster: who may claim a credential."""
    __tablename__ = "campaign_eligibility"
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), primary_key=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.user_id", ondelete="CASCADE"), primary_key=True)


class EligibilityCredential(Base):
    """The LLT. llt_digest = HMAC(k_elig, campaign_id || student_id). Stable across logins.
    issued_on is a DATE on purpose: no time of day is kept (timing-correlation defence)."""
    __tablename__ = "eligibility_credentials"
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), primary_key=True)
    student_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("students.user_id", ondelete="CASCADE"), primary_key=True)
    llt_digest: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    issued_on: Mapped[date | None] = mapped_column(Date)
    blinded_hash: Mapped[bytes | None] = mapped_column(LargeBinary(32))


class SigningKey(Base):
    __tablename__ = "signing_keys"
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), primary_key=True)
    key_id: Mapped[str] = mapped_column(String(32))
    public_key_der: Mapped[bytes] = mapped_column(LargeBinary)
    private_key_enc: Mapped[bytes | None] = mapped_column(LargeBinary)  # NULL after campaign close
    destroyed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserSession(Base):
    __tablename__ = "sessions"
    id_hash: Mapped[bytes] = mapped_column(LargeBinary(32), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuditLog(Base):
    """Administrative actions only. Deliberately has no event for credential claims."""
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = _pk()
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str | None] = mapped_column(String(40))
    target_id: Mapped[str | None] = mapped_column(String(64))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    meta: Mapped[dict | None] = mapped_column(JSON)
