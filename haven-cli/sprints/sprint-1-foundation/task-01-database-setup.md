# Task 01: Database Infrastructure Setup

## Assignee
Backend Developer

## Priority
Critical

## Estimated Effort
3 days

## Description
Implement the SQLite database infrastructure for storing video metadata, job history, and plugin state. This is a foundational task that blocks multiple downstream features.

## Current State
The codebase has placeholder database references throughout:
- `haven_cli/config.py` - defines `database_url` but no actual database code
- `haven_cli/pipeline/steps/ingest_step.py` - `_save_to_database()` is a no-op
- `haven_cli/pipeline/steps/sync_step.py` - `_update_database()` is a no-op
- `haven_cli/pipeline/steps/upload_step.py` - `_update_database()` is a no-op

## Requirements

### 1. Database Models
Create SQLAlchemy models (or equivalent ORM) for:

```python
# videos table
- id: Integer (primary key)
- phash: String (indexed, for deduplication)
- source_path: String
- title: String
- duration: Float
- file_size: Integer
- mime_type: String
- source_uri: String (optional, original URL)
- creator_handle: String (optional)
- cid: String (optional, Filecoin CID after upload)
- piece_cid: String (optional)
- arkiv_entity_key: String (optional)
- encrypted: Boolean (default False)
- has_ai_data: Boolean (default False)
- created_at: DateTime
- updated_at: DateTime

# timestamps table (AI-generated timestamps)
- id: Integer (primary key)
- video_id: Integer (foreign key)
- tag_name: String
- start_time: Float
- end_time: Float
- confidence: Float
- created_at: DateTime

# job_executions table
- id: Integer (primary key)
- job_id: UUID
- plugin_name: String
- started_at: DateTime
- completed_at: DateTime
- success: Boolean
- sources_found: Integer
- sources_archived: Integer
- error: Text (nullable)
```

### 2. Database Connection Management
- Create connection pool management
- Support async database operations (aiosqlite)
- Handle migrations with Alembic or similar

### 3. Repository Pattern
Implement repository classes:
```python
class VideoRepository:
    async def create(video: VideoMetadata) -> Video
    async def get_by_id(video_id: int) -> Optional[Video]
    async def get_by_phash(phash: str) -> Optional[Video]
    async def update(video_id: int, **kwargs) -> Video
    async def list(limit: int, offset: int) -> List[Video]

class TimestampRepository:
    async def create_bulk(video_id: int, timestamps: List[dict]) -> List[Timestamp]
    async def get_for_video(video_id: int) -> List[Timestamp]

class JobExecutionRepository:
    async def create(execution: JobExecutionResult) -> JobExecution
    async def get_history(job_id: UUID, limit: int) -> List[JobExecution]
```

## Files to Create/Modify

### Create
- `haven_cli/database/__init__.py`
- `haven_cli/database/models.py` - SQLAlchemy models
- `haven_cli/database/connection.py` - Connection management
- `haven_cli/database/repositories.py` - Repository implementations
- `haven_cli/database/migrations/` - Alembic migrations directory

### Modify
- `haven_cli/config.py` - Ensure database URL is properly configured
- `pyproject.toml` - Add sqlalchemy, aiosqlite, alembic dependencies

## Acceptance Criteria
- [ ] Database schema created with all required tables
- [ ] Can insert and query video records
- [ ] Can check for duplicates by pHash
- [ ] Migrations run successfully on fresh database
- [ ] Async operations work correctly
- [ ] Unit tests cover CRUD operations

## Technical Notes
- Use SQLite for local development, schema should be compatible with PostgreSQL for future scaling
- Consider using `databases` library for async support
- Ensure all datetime fields use UTC

## Code Reuse from Electron App

### HIGH REUSE - Direct Port Available
The electron app backend has a complete, production-tested database implementation that can be directly ported:

#### Source Files to Reference:
1. **`backend/app/models/database.py`** - Database connection setup
   - SQLAlchemy engine configuration with SQLite
   - Session management with `SessionLocal`
   - `get_db()` generator for dependency injection
   - **Reuse Level: 95%** - Copy and adapt path from `~/.haven-player/` to `~/.haven-cli/`

2. **`backend/app/models/video.py`** - Video model (comprehensive)
   - Complete `Video` model with 40+ fields including:
     - All required fields (path, title, duration, phash, etc.)
     - Filecoin fields (filecoin_root_cid, piece_cid, etc.)
     - Encryption fields (is_encrypted, lit_encryption_metadata)
     - Plugin fields (plugin_name, plugin_source_id, plugin_metadata)
     - Arkiv fields (arkiv_entity_key, arkiv_data_completeness)
   - `Timestamp` model for AI-generated timestamps
   - `to_dict()` serialization methods
   - **Reuse Level: 90%** - Use as-is, may simplify some fields

3. **`backend/app/models/recurring_job.py`** - Job model
   - Complete `RecurringJob` model with:
     - Schedule (cron format), method, on_success
     - Execution tracking (last_run_at, next_run_at)
     - Statistics (total_runs, successful_runs, failed_runs)
     - Error tracking (last_error, last_error_at)
   - **Reuse Level: 85%** - Adapt for CLI context

4. **`backend/app/models/config.py`** - AppConfig model
   - Configuration storage in database
   - VLM settings, recording directory, upload coordinator settings
   - **Reuse Level: 70%** - Simplify for CLI needs

5. **`backend/app/models/base.py`** - SQLAlchemy Base class
   - **Reuse Level: 100%** - Copy directly

#### Key Code Snippets to Port:

```python
# From backend/app/models/database.py - Connection setup
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pathlib import Path

DB_PATH: Path = Path.home() / '.haven-cli' / 'haven.db'  # Changed from .haven-player
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
SQLALCHEMY_DATABASE_URL: str = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```

```python
# From backend/app/models/video.py - Video model structure
class Video(Base):
    __tablename__ = 'videos'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    path: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    duration: Mapped[int] = mapped_column(Integer)
    phash: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    # ... (see full model in backend/app/models/video.py)
```

### Implementation Strategy
1. **Copy** `backend/app/models/base.py` → `haven_cli/database/models.py`
2. **Copy** `backend/app/models/database.py` → `haven_cli/database/connection.py` (change path)
3. **Copy** `backend/app/models/video.py` → `haven_cli/database/models.py` (append)
4. **Copy** `backend/app/models/recurring_job.py` → `haven_cli/database/models.py` (append)
5. **Create** repository layer on top (new code, but simple CRUD wrappers)

### What's NOT Reusable
- FastAPI dependency injection patterns (CLI uses different patterns)
- Some video fields specific to electron app (live_session, segment_metadata)
- Upload queue model (CLI uses different pipeline approach)

## Dependencies
None - this is a foundational task

## Blocking
- Sprint 2: All pipeline steps that save to database
- Sprint 4: Job history storage
