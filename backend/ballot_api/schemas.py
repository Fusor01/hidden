import uuid

from pydantic import BaseModel, Field


class AnswerIn(BaseModel):
    question_id: uuid.UUID
    value: int | None = None
    option_ids: list[uuid.UUID] | None = Field(default=None, max_length=50)
    text: str | None = Field(default=None, max_length=2000)


class SubmitIn(BaseModel):
    key_id: str = Field(max_length=32)
    token: str = Field(min_length=40, max_length=50)        # base64url of 32 bytes
    signature: str = Field(min_length=100, max_length=1200)
    answers: list[AnswerIn] = Field(max_length=100)
