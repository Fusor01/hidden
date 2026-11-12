import os
import uuid

import pytest

from common import blindrsa as b

BITS = int(os.environ.get("TEST_KEY_BITS", "2048"))


@pytest.fixture(scope="module")
def priv():
    return b.generate_private_key(BITS)


def _issue(priv, cid=None, token=None):
    pub = priv.public_key()
    cid = cid or uuid.uuid4()
    token = token or os.urandom(32)
    msg = b.token_message(cid, token)
    blinded, state = b.blind(pub, msg)
    sig = b.finalize(pub, state, b.blind_sign(priv, blinded))
    return pub, cid, token, msg, blinded, sig


def test_roundtrip_verifies_with_standard_rsa_pss(priv):
    pub, _, _, msg, _, sig = _issue(priv)
    assert b.verify(pub, msg, sig)  # verified by cryptography's own RSA-PSS, not our encoder


def test_signature_is_bound_to_message(priv):
    pub, cid, token, _, _, sig = _issue(priv)
    assert not b.verify(pub, b.token_message(cid, os.urandom(32)), sig)
    assert not b.verify(pub, b.token_message(uuid.uuid4(), token), sig)


def test_forged_and_truncated_signatures_rejected(priv):
    pub, _, _, msg, _, sig = _issue(priv)
    assert not b.verify(pub, msg, bytes(len(sig)))
    assert not b.verify(pub, msg, sig[:-1])
    assert not b.verify(pub, msg, sig[:-1] + bytes([sig[-1] ^ 1]))


def test_other_campaign_key_rejects(priv):
    pub, _, _, msg, _, sig = _issue(priv)
    other = b.generate_private_key(BITS).public_key()
    assert not b.verify(other, msg, sig)


def test_blinded_value_is_unlinkable_to_token(priv):
    pub = priv.public_key()
    msg = b.token_message(uuid.uuid4(), os.urandom(32))
    b1, _ = b.blind(pub, msg)
    b2, _ = b.blind(pub, msg)
    assert b1 != b2  # same token, different blinded values
    assert msg not in b1


def test_blind_sign_rejects_bad_input(priv):
    with pytest.raises(b.BlindRSAError):
        b.blind_sign(priv, b"short")
    with pytest.raises(b.BlindRSAError):
        b.blind_sign(priv, bytes(b.modulus_len(priv.public_key())))


def test_key_serialisation_roundtrip(priv):
    pub2 = b.load_public_key(b.public_key_der(priv.public_key()))
    priv2 = b.load_private_key(b.private_key_der(priv))
    _, _, _, msg, _, sig = _issue(priv2)
    assert b.verify(pub2, msg, sig)
