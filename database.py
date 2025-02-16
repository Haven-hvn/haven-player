import sqlite3
from pathlib import Path
import json

class Database:
    def __init__(self):
        self.db_path = Path.home() / '.haven-player' / 'videos.db'
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.create_tables()

    def create_tables(self):
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

    def add_video(self, path: str, title: str, duration: int, has_ai_data: bool, thumbnail_path: str) -> int:
        cursor = self.conn.cursor()
        # Get max position
        cursor.execute('SELECT COALESCE(MAX(position), 0) FROM videos')
        max_position = cursor.fetchone()[0]
        
        cursor.execute('''
            INSERT OR REPLACE INTO videos 
            (path, title, duration, has_ai_data, thumbnail_path, position) 
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (str(path), title, duration, has_ai_data, thumbnail_path, max_position + 1))
        self.conn.commit()
        return cursor.lastrowid

    def add_timestamps(self, video_path: str, tags: dict):
        cursor = self.conn.cursor()
        for tag_name, tag_data in tags.items():
            for frame in tag_data["time_frames"]:
                cursor.execute('''
                    INSERT INTO timestamps 
                    (video_path, tag_name, start_time, end_time, confidence) 
                    VALUES (?, ?, ?, ?, ?)
                ''', (
                    str(video_path),
                    tag_name,
                    frame["start"],
                    frame.get("end", frame["start"] + 2.0),
                    frame.get("confidence", 1.0)
                ))
        self.conn.commit()

    def get_video_timestamps(self, video_path: str) -> list:
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT tag_name, start_time, end_time, confidence 
            FROM timestamps 
            WHERE video_path = ? 
            ORDER BY start_time
        ''', (str(video_path),))
        
        timestamps = []
        for row in cursor.fetchall():
            timestamps.append({
                'tag': row[0],
                'start': row[1],
                'end': row[2],
                'confidence': row[3]
            })
        return timestamps

    def get_all_videos(self) -> list:
        cursor = self.conn.cursor()
        cursor.execute('''
            SELECT path, title, duration, has_ai_data, thumbnail_path 
            FROM videos 
            ORDER BY position DESC, created_at DESC
        ''')
        return [
            {
                'path': row[0],
                'title': row[1],
                'duration': row[2],
                'has_ai_data': row[3],
                'thumbnail_path': row[4]
            }
            for row in cursor.fetchall()
        ]

    def move_to_front(self, video_path: str):
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

    def remove_video(self, video_path: str):
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM timestamps WHERE video_path = ?', (str(video_path),))
        cursor.execute('DELETE FROM videos WHERE path = ?', (str(video_path),))
        self.conn.commit()

    def clear_videos(self):
        cursor = self.conn.cursor()
        cursor.execute('DELETE FROM timestamps')
        cursor.execute('DELETE FROM videos')
        self.conn.commit()

    def close(self):
        self.conn.close()
