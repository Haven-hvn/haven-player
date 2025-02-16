import sqlite3
from pathlib import Path
import json

class Database:
    def __init__(self):
        self.db_path = Path.home() / '.haven-player' / 'videos.db'
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        print(f"[Database] Connecting to database at {self.db_path}")
        self.conn = sqlite3.connect(str(self.db_path))
        self.create_tables()

    def create_tables(self):
        print("[Database] Creating/verifying tables")
        cursor = self.conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                duration INTEGER,
                has_ai_data BOOLEAN DEFAULT FALSE,
                thumbnail_path TEXT,
                position INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS timestamps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_path TEXT,
                tag_name TEXT,
                start_time FLOAT,
                end_time FLOAT,
                confidence FLOAT,
                FOREIGN KEY (video_path) REFERENCES videos (path)
            )
        ''')
        self.conn.commit()
        print("[Database] Tables created/verified successfully")

    def add_video(self, path: str, title: str, ai_data: dict, duration: int, thumbnail_path: str) -> int:
        print(f"[Database] Adding video: {path}")
        has_ai_data = bool(ai_data)
        cursor = self.conn.cursor()
        # Get max position
        cursor.execute('SELECT COALESCE(MAX(position), 0) FROM videos')
        max_position = cursor.fetchone()[0]
        print(f"[Database] Current max position: {max_position}, new position will be: {max_position + 1}")
        
        cursor.execute('''
            INSERT OR REPLACE INTO videos 
            (path, title, duration, has_ai_data, thumbnail_path, position) 
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (str(path), title, duration, has_ai_data, thumbnail_path, max_position + 1))
        self.conn.commit()
        print(f"[Database] Video added with ID: {cursor.lastrowid}")
        return cursor.lastrowid

    def get_all_videos(self):
        print("[Database] Fetching all videos")
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT path, title, duration, has_ai_data, thumbnail_path 
            FROM videos 
            ORDER BY position DESC, created_at DESC
        ''')
        videos = [
            {
                'path': row[0],
                'title': row[1],
                'duration': row[2],
                'has_ai_data': row[3],
                'thumbnail_path': row[4]
            }
            for row in cursor.fetchall()
        ]
        print(f"[Database] Found {len(videos)} videos")
        return videos

    def move_to_front(self, video_path: str):
        print(f"[Database] Moving video to front: {video_path}")
        cursor = self.conn.cursor()
        # Get max position
        cursor.execute('SELECT COALESCE(MAX(position), 0) FROM videos')
        max_position = cursor.fetchone()[0]
        
        # Update video position
        cursor.execute(
            'UPDATE videos SET position = ? WHERE path = ?',
            (max_position + 1, str(video_path))
        )
        self.conn.commit()
        print(f"[Database] Video moved to front with position: {max_position + 1}")

    def remove_video(self, video_path: str):
        print(f"[Database] Removing video: {video_path}")
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM timestamps WHERE video_path = ?', (str(video_path),))
        cursor.execute('DELETE FROM videos WHERE path = ?', (str(video_path),))
        self.conn.commit()
        print("[Database] Video and its timestamps removed successfully")

    def clear_videos(self):
        print("[Database] Clearing all videos and timestamps")
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM timestamps')
        cursor.execute('DELETE FROM videos')
        self.conn.commit()
        print("[Database] All videos and timestamps cleared successfully")

    def get_video_timestamps(self, video_path: str):
        print(f"[Database] Fetching timestamps for video: {video_path}")
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT tag_name, start_time, end_time, confidence
            FROM timestamps
            WHERE video_path = ?
        ''', (str(video_path),))
        timestamps = [
            {
                'tag_name': row[0],
                'start_time': row[1],
                'end_time': row[2],
                'confidence': row[3]
            }
            for row in cursor.fetchall()
        ]
        print(f"[Database] Found {len(timestamps)} timestamps for video: {video_path}")
        return timestamps

    def close(self):
        print("[Database] Closing database connection")
        self.conn.close()
        print("[Database] Database connection closed")
