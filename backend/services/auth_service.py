import hashlib
import secrets
import jwt
import datetime
from backend.config import settings
from backend.database import SessionLocal
from backend.database.models import User

JWT_SECRET = settings.JWT_SECRET
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 72


def _hash_with_salt(password: str, salt: str = None) -> str:
    """Simple salted SHA-256 password hashing."""
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.sha256(f"{salt}:{password}".encode()).hexdigest()
    return f"{salt}${h}"


def hash_password(password: str) -> str:
    return _hash_with_salt(password)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        salt, _ = hashed.split("$", 1)
        return _hash_with_salt(plain, salt) == hashed
    except (ValueError, AttributeError):
        return False


def create_token(user_id: int, username: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HOURS),
        "iat": datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])


def register_user(username: str, password: str) -> User:
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            raise ValueError("用户名已存在")
        user = User(username=username, password_hash=hash_password(password))
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def authenticate_user(username: str, password: str) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or not verify_password(password, user.password_hash):
            raise ValueError("用户名或密码错误")
        return user
    finally:
        db.close()


def get_user_by_id(user_id: int) -> User | None:
    db = SessionLocal()
    try:
        return db.query(User).filter(User.id == user_id).first()
    finally:
        db.close()
