# Haven Player Backend

This is the backend API for the Haven Player application, built with FastAPI and SQLAlchemy.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Install the package in editable mode (recommended):
```bash
pip install -e .
```

This allows Python to find the `app` package regardless of where you run commands from.

4. Run the development server:
```bash
uvicorn app.main:app --reload --log-level info
```

For more verbose logging (debug mode):
```bash
uvicorn app.main:app --reload --log-level debug
```

**Note:** If you didn't install the package in editable mode (step 3), you'll need to either:
- Set PYTHONPATH: `PYTHONPATH=".." uvicorn app.main:app --reload` (from backend directory)
- Or run from project root: `uvicorn backend.app.main:app --reload`

The API will be available at http://localhost:8000

## API Documentation

Once the server is running, you can access the API documentation at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Testing

Run the test suite with:
```bash
pytest
```

This will run all tests with coverage reporting.

## API Endpoints

- `GET /api/videos/` - Get all videos
- `POST /api/videos/` - Create a new video
- `POST /api/videos/{video_path}/timestamps/` - Add a timestamp to a video
- `GET /api/videos/{video_path}/timestamps/` - Get all timestamps for a video
- `DELETE /api/videos/{video_path}` - Delete a video
- `PUT /api/videos/{video_path}/move-to-front` - Move a video to the front of the list 