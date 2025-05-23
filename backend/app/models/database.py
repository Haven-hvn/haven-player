from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

# Define DB_PATH at the module level so it can be imported elsewhere
DB_PATH: Path = Path.home() / '.haven-player' / 'videos.db'
# Ensure the directory for the database exists before trying to create the engine
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

SQLALCHEMY_DATABASE_URL: str = f"sqlite:///{DB_PATH}"

# Define engine at the module level so it can be imported elsewhere
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 