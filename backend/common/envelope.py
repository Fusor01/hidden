from cryptography.fernet import Fernet


def seal(master_key: str, data: bytes) -> bytes:
    return Fernet(master_key.encode()).encrypt(data)


def unseal(master_key: str, blob: bytes) -> bytes:
    return Fernet(master_key.encode()).decrypt(blob)
