import sys
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Use absolute path relative to exe (PyInstaller) or project root (dev)
_EXE_DIR = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).resolve().parent.parent.parent
_DB_DIR = _EXE_DIR / "data"
_DB_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = f"sqlite:///{_DB_DIR / 'app.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    import backend.database.models  # noqa: ensure models imported
    Base.metadata.create_all(bind=engine)
    # Migration: add sentiment_score column if it doesn't exist (for existing DBs)
    _migrate_add_column("messages", "sentiment_score", "INTEGER")
    _migrate_add_column("messages", "route_json", "TEXT")


def _migrate_add_column(table: str, column: str, col_type: str):
    """Add a column to an existing table if it doesn't already exist (SQLite-safe)."""
    import sqlite3
    conn = None
    db_path = str(_DB_DIR / "app.db")
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.execute(f"PRAGMA table_info({table})")
        existing = [row[1] for row in cursor.fetchall()]
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            conn.commit()
    except (sqlite3.OperationalError, sqlite3.InterfaceError):
        pass  # table may not exist yet — harmless
    finally:
        if conn:
            conn.close()
