import sqlite3
from pathlib import Path

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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS timestamps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER,
                timestamp INTEGER,
                label TEXT,
                FOREIGN KEY (video_id) REFERENCES videos (id)
            )
        ''')
        self.conn.commit()

    def add_video(self, path: str, title: str, duration: int, has_ai_data: bool) -> int:
        cursor = self.conn.cursor()
        cursor.execute(
            'INSERT OR REPLACE INTO videos (path, title, duration, has_ai_data) VALUES (?, ?, ?, ?)',
            (str(path), title, duration, has_ai_data)
        )
        self.conn.commit()
        return cursor.lastrowid

    def add_timestamps(self, video_id: int, timestamps: list):
        cursor = self.conn.cursor()
        cursor.executemany(
            'INSERT INTO timestamps (video_id, timestamp, label) VALUES (?, ?, ?)',
            [(video_id, ts['timestamp'], ts['label']) for ts in timestamps]
        )
        self.conn.commit()

    def get_video_timestamps(self, video_id: int) -> list:
        cursor = self.conn.cursor()
        cursor.execute('SELECT timestamp, label FROM timestamps WHERE video_id = ? ORDER BY timestamp', (video_id,))
        return [{'timestamp': ts, 'label': label} for ts, label in cursor.fetchall()]

    def get_all_videos(self) -> list:
        cursor = self.conn.cursor()
        cursor.execute('SELECT id, path, title, duration, has_ai_data FROM videos ORDER BY created_at DESC')
        return [
            {
                'id': row[0],
                'path': row[1],
                'title': row[2],
                'duration': row[3],
                'has_ai_data': row[4]
            }
            for row in cursor.fetchall()
        ]

    def close(self):
        self.conn.close()
