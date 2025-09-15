from typing import Any
from sqlalchemy.orm import declarative_base, Session
# Import engine and SQLALCHEMY_DATABASE_URL from app.models.database
from app.models.database import engine, SQLALCHEMY_DATABASE_URL 
# Remove direct create_engine and sessionmaker from here

Base = declarative_base()

def init_db():
    # Import all models here to ensure they are registered with SQLAlchemy
    from app.models.video import Video, Timestamp
    from app.models.config import AppConfig
    from app.models.analysis_job import AnalysisJob
    from app.models.live_session import LiveSession

    # Create all tables using the imported engine
    Base.metadata.create_all(bind=engine)
