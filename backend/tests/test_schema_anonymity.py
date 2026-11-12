"""Structural guarantees: these fail if someone later adds a link between identity and ballots."""
from sqlalchemy import Date, DateTime

from ballot_api import models as bm
from identity_api import models as im

IDENTITY_TABLES = set(im.Base.metadata.tables)


def test_anonymous_schema_has_no_identity_columns_or_foreign_keys():
    for table in bm.Base.metadata.tables.values():
        for col in table.columns:
            assert col.name not in {"student_id", "user_id", "email", "roll_no", "ip", "session_id"}, (table.name, col.name)
            for fk in col.foreign_keys:
                assert fk.column.table.name not in IDENTITY_TABLES, (table.name, col.name)
        assert not set(table.metadata.tables) & IDENTITY_TABLES  # disjoint table sets


def test_anonymous_ballot_tables_carry_no_timestamps():
    for name in ("responses", "response_answers", "spent_tokens"):
        for col in bm.Base.metadata.tables[name].columns:
            assert not isinstance(col.type, (DateTime, Date)), (name, col.name)


def test_anonymous_primary_keys_are_random_not_sequential():
    for name in ("responses", "response_answers"):
        pk = list(bm.Base.metadata.tables[name].primary_key.columns)[0]
        assert pk.type.__class__.__name__ in {"Uuid", "UUID"}
        assert pk.default is not None


def test_identity_side_keeps_only_a_date_for_credential_claims():
    t = im.Base.metadata.tables["eligibility_credentials"]
    assert isinstance(t.c.issued_on.type, Date) and not isinstance(t.c.issued_on.type, DateTime)


def test_no_audit_event_type_exists_for_credential_claims():
    import inspect
    from identity_api.services import issuance
    assert "AuditLog" not in inspect.getsource(issuance)


def test_responses_have_no_back_reference_to_tokens():
    cols = {c.name for c in bm.Base.metadata.tables["responses"].columns}
    assert not cols & {"token_hash", "token", "signature"}
