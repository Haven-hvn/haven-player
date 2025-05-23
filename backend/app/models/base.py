from typing import Any
from sqlalchemy.orm import declarative_base, Session
from sqlalchemy import Engine

Base = declarative_base()

def init_db(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine) 