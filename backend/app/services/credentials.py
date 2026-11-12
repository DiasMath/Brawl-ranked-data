import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from ..config import collection_environment
from ..domain import iso, utc_now
from .supercell import CollectionError


def encryption_key():
    try:
        key = bytes.fromhex(os.getenv("BRAWL_CREDENTIAL_KEY", ""))
    except ValueError:
        return None
    return key if len(key) == 32 else None


def credential_cipher():
    key = encryption_key()
    if key is None:
        raise CollectionError(503, "Configure BRAWL_CREDENTIAL_KEY no backend para proteger a chave da Supercell.")
    return AESGCM(key)


def credential_status(cursor):
    environment = collection_environment()
    cursor.execute("SELECT updated_at FROM brawl_secrets.supercell_credentials WHERE environment=%s", (environment,))
    row = cursor.fetchone()
    return {"environment": environment, "configured": row is not None,
            "encryption_configured": encryption_key() is not None,
            "updated_at": iso(row["updated_at"]) if row else None}


def stored_token(cursor):
    environment = collection_environment()
    cursor.execute("SELECT encrypted_token FROM brawl_secrets.supercell_credentials WHERE environment=%s", (environment,))
    row = cursor.fetchone()
    if row is None:
        raise CollectionError(503, "Cadastre a chave da Supercell em Contas e dados.")
    cipher = credential_cipher()
    encrypted = bytes(row["encrypted_token"])
    try:
        return cipher.decrypt(encrypted[:12], encrypted[12:], environment.encode()).decode("ascii")
    except (InvalidTag, ValueError) as exc:
        raise CollectionError(503, "A chave salva não pôde ser lida. Confira BRAWL_CREDENTIAL_KEY ou cadastre a chave novamente.") from exc


def store_token(cursor, token, cipher):
    environment = collection_environment()
    nonce = os.urandom(12)
    encrypted = nonce + cipher.encrypt(nonce, token.encode("ascii"), environment.encode())
    cursor.execute("""
        INSERT INTO brawl_secrets.supercell_credentials (environment, encrypted_token, updated_at)
        VALUES (%s, %s, %s)
        ON CONFLICT (environment) DO UPDATE SET
            encrypted_token=EXCLUDED.encrypted_token, updated_at=EXCLUDED.updated_at
    """, (environment, encrypted, utc_now()))
