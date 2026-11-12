"""RSA blind signatures, RFC 9474, variant RSABSSA-SHA384-PSS-Deterministic.

Only the primitives the system needs:
  * blind()       - client side (implemented here for tests; browsers use blindrsa-ts)
  * blind_sign()  - issuer side (identity-api)
  * finalize()    - client side
  * verify()      - verifier side (ballot-api): plain RSASSA-PSS, SHA-384, MGF1-SHA384, salt length 0
"""
from __future__ import annotations

import hashlib
import math
import secrets
import uuid
from dataclasses import dataclass

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

_H = hashlib.sha384
_HLEN = 48
_SLEN = 0  # deterministic variant


class BlindRSAError(Exception):
    pass


def _i2osp(x: int, n: int) -> bytes:
    return x.to_bytes(n, "big")


def _os2ip(b: bytes) -> int:
    return int.from_bytes(b, "big")


def _mgf1(seed: bytes, length: int) -> bytes:
    out, counter = b"", 0
    while len(out) < length:
        out += _H(seed + _i2osp(counter, 4)).digest()
        counter += 1
    return out[:length]


def _emsa_pss_encode(msg: bytes, em_bits: int) -> bytes:
    em_len = (em_bits + 7) // 8
    if em_len < _HLEN + _SLEN + 2:
        raise BlindRSAError("modulus too small")
    h = _H(b"\x00" * 8 + _H(msg).digest()).digest()  # salt is empty
    db = b"\x00" * (em_len - _SLEN - _HLEN - 2) + b"\x01"
    masked = bytearray(a ^ b for a, b in zip(db, _mgf1(h, em_len - _HLEN - 1)))
    masked[0] &= 0xFF >> (8 * em_len - em_bits)
    return bytes(masked) + h + b"\xbc"


def generate_private_key(bits: int = 3072) -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=bits)


def public_key_der(pub: rsa.RSAPublicKey) -> bytes:
    return pub.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


def load_public_key(der: bytes) -> rsa.RSAPublicKey:
    key = serialization.load_der_public_key(der)
    if not isinstance(key, rsa.RSAPublicKey):
        raise BlindRSAError("not an RSA key")
    return key


def private_key_der(priv: rsa.RSAPrivateKey) -> bytes:
    return priv.private_bytes(
        serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )


def load_private_key(der: bytes) -> rsa.RSAPrivateKey:
    key = serialization.load_der_private_key(der, password=None)
    if not isinstance(key, rsa.RSAPrivateKey):
        raise BlindRSAError("not an RSA key")
    return key


def modulus_len(pub: rsa.RSAPublicKey) -> int:
    return (pub.public_numbers().n.bit_length() + 7) // 8


def token_message(campaign_id: uuid.UUID, token: bytes) -> bytes:
    """The exact bytes that get blind-signed. Binds the token to one campaign."""
    return b"hidden/v1|" + campaign_id.bytes + token


@dataclass(frozen=True)
class BlindingState:
    inv: int
    msg: bytes


def blind(pub: rsa.RSAPublicKey, msg: bytes) -> tuple[bytes, BlindingState]:
    nums = pub.public_numbers()
    n, e = nums.n, nums.e
    m = _os2ip(_emsa_pss_encode(msg, n.bit_length() - 1))
    while True:
        r = secrets.randbelow(n - 2) + 2
        if math.gcd(r, n) == 1:
            break
    z = (m * pow(r, e, n)) % n
    return _i2osp(z, modulus_len(pub)), BlindingState(inv=pow(r, -1, n), msg=msg)


def blind_sign(priv: rsa.RSAPrivateKey, blinded: bytes) -> bytes:
    nums = priv.private_numbers()
    n, e, d = nums.public_numbers.n, nums.public_numbers.e, nums.d
    k = (n.bit_length() + 7) // 8
    if len(blinded) != k:
        raise BlindRSAError("blinded message has wrong length")
    z = _os2ip(blinded)
    if not 0 < z < n:
        raise BlindRSAError("blinded message out of range")
    s = pow(z, d, n)
    if pow(s, e, n) != z:  # guards against fault attacks
        raise BlindRSAError("signing fault")
    return _i2osp(s, k)


def verify(pub: rsa.RSAPublicKey, msg: bytes, signature: bytes) -> bool:
    try:
        pub.verify(
            signature,
            msg,
            padding.PSS(mgf=padding.MGF1(hashes.SHA384()), salt_length=_SLEN),
            hashes.SHA384(),
        )
        return True
    except (InvalidSignature, ValueError):
        return False


def finalize(pub: rsa.RSAPublicKey, state: BlindingState, blind_sig: bytes) -> bytes:
    n = pub.public_numbers().n
    sig = _i2osp((_os2ip(blind_sig) * state.inv) % n, modulus_len(pub))
    if not verify(pub, state.msg, sig):
        raise BlindRSAError("invalid signature")
    return sig
