"""
Encryption service for sensitive data (e.g., Kaggle API credentials).
Uses Fernet symmetric encryption (AES-128-CBC with HMAC).
"""

from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from infrastructure.config.config import config


def _get_fernet() -> Optional[Fernet]:
    """Get Fernet instance with configured key. Returns None if key not configured."""
    key = config.kaggle_encryption_key
    if not key:
        return None
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        return None


def encrypt_credential(plaintext: str) -> Optional[bytes]:
    """
    Encrypt a credential string.

    Args:
        plaintext: The credential to encrypt

    Returns:
        Encrypted bytes, or None if encryption key not configured

    Raises:
        ValueError: If encryption fails
    """
    if not plaintext:
        return None

    fernet = _get_fernet()
    if not fernet:
        raise ValueError("Encryption key not configured. Set KAGGLE_ENCRYPTION_KEY in environment.")

    try:
        return fernet.encrypt(plaintext.encode("utf-8"))
    except Exception as e:
        raise ValueError(f"Encryption failed: {str(e)}")


def decrypt_credential(ciphertext: bytes) -> Optional[str]:
    """
    Decrypt an encrypted credential.

    Args:
        ciphertext: The encrypted bytes

    Returns:
        Decrypted string, or None if ciphertext is None/empty

    Raises:
        ValueError: If decryption fails (invalid key or corrupted data)
    """
    if not ciphertext:
        return None

    fernet = _get_fernet()
    if not fernet:
        raise ValueError("Encryption key not configured. Set KAGGLE_ENCRYPTION_KEY in environment.")

    try:
        return fernet.decrypt(ciphertext).decode("utf-8")
    except InvalidToken:
        raise ValueError("Decryption failed: invalid token or wrong key")
    except Exception as e:
        raise ValueError(f"Decryption failed: {str(e)}")


def is_encryption_configured() -> bool:
    """Check if encryption is properly configured."""
    return _get_fernet() is not None
