import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class CredentialIn(BaseModel):
    blinded_msg: str = Field(min_length=100, max_length=1200)  # base64url


class QuestionIn(BaseModel):
    type: Literal["star", "numeric", "single", "multi", "text"]
    prompt: str = Field(min_length=3, max_length=500)
    required: bool = True
    min_value: int | None = None
    max_value: int | None = None
    options: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _check(self):
        if self.type in ("single", "multi"):
            if len(self.options) < 2 or any(not o.strip() for o in self.options):
                raise ValueError("Choice questions need at least two non-empty options")
        elif self.options:
            raise ValueError("Only choice questions take options")
        if self.type == "numeric":
            if self.min_value is None or self.max_value is None or self.min_value >= self.max_value:
                raise ValueError("Numeric questions need min_value < max_value")
        return self


class CampaignIn(BaseModel):
    offering_id: uuid.UUID
    name: str = Field(min_length=3, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    starts_at: datetime
    ends_at: datetime
    k_threshold: int = Field(default=5, ge=3, le=50)
    text_enabled: bool = True
    moderation_enabled: bool = True
    questions: list[QuestionIn] = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def _check(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        if not self.text_enabled and any(q.type == "text" for q in self.questions):
            raise ValueError("Text questions require text_enabled")
        return self


class EligibilityIn(BaseModel):
    mode: Literal["enrolled", "explicit"] = "enrolled"
    student_ids: list[uuid.UUID] = Field(default_factory=list, max_length=5000)


class StudentIn(BaseModel):
    email: str = Field(max_length=254)
    name: str = Field(min_length=1, max_length=120)
    roll_no: str = Field(min_length=1, max_length=40)
    department: str | None = None
    batch_year: int | None = None
    password: str | None = Field(default=None, min_length=10, max_length=200)


class FacultyIn(BaseModel):
    email: str = Field(max_length=254)
    name: str = Field(min_length=1, max_length=120)
    employee_no: str = Field(min_length=1, max_length=40)
    department: str | None = None
    password: str | None = Field(default=None, min_length=10, max_length=200)


class SemesterIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    start_date: date
    end_date: date


class CourseIn(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=160)
    department: str | None = None


class OfferingIn(BaseModel):
    course_id: uuid.UUID
    semester_id: uuid.UUID
    faculty_id: uuid.UUID
    section: str = Field(default="A", max_length=10)


class EnrollmentsIn(BaseModel):
    offering_id: uuid.UUID
    student_ids: list[uuid.UUID] = Field(min_length=1, max_length=5000)


class ModerationIn(BaseModel):
    response_id: uuid.UUID
    state: Literal["ok", "hidden"]
