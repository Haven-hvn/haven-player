import sys
import subprocess
import json
from pathlib import Path
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QScrollArea, QFileDialog, QMessageBox, QGridLayout, QMenu
)
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QCursor, QAction
from video_player import VideoPlayer, VideoThumbnailWidget
from database import Database
from utils import check_av1_codec, get_video_duration, generate_thumbnail, parse_ai_data
from sidebar import Sidebar
from top_bar import TopBar

class HavenPlayer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Haven Player")
        self.setMinimumSize(1200, 800)
        print("[Main] Initializing Haven Player")
        self.db = Database()
        self.current_player = None
        self.setup_ui()
        self.load_videos()

    def setup_ui(self):
        print("[Main] Setting up UI")
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Original TopBar integration
        self.top_bar = TopBar()
        main_layout.addWidget(self.top_bar)

        # Main content area
        content_widget = QWidget()
        content_layout = QHBoxLayout(content_widget)
        content_layout.setContentsMargins(20, 20, 20, 20)
        content_layout.setSpacing(20)

        # Original Sidebar integration
        self.sidebar = Sidebar()
        self.sidebar.add_video_requested.connect(self.add_video)  # Connect to add_video method
        print("[Main] Connected sidebar add_video_requested signal")
        content_layout.addWidget(self.sidebar, stretch=1)

        # Enhanced video grid area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: #1e1e1e;
            }
            QScrollBar:vertical {
                background: #2d2d2d;
                width: 10px;
            }
            QScrollBar::handle:vertical {
                background: #5d5d5d;
                min-height: 20px;
                border-radius: 5px;
            }
        """)

        self.video_grid = QWidget()
        self.grid_layout = QGridLayout(self.video_grid)
        self.grid_layout.setSpacing(20)
        scroll.setWidget(self.video_grid)

        content_layout.addWidget(scroll, stretch=3)
        main_layout.addWidget(content_widget)

        # Dark theme styling
        self.setStyleSheet("""
            QMainWindow, QWidget {
                background-color: #1e1e1e;
                color: white;
            }
        """)
        print("[Main] UI setup complete")

    def add_video(self, video_path):
        print(f"[Main] Adding video from path: {video_path}")
        path = Path(video_path)
        if not path.exists():
            print(f"[Main] Error: Video path does not exist: {video_path}")
            return
                
        print("[Main] Checking video codec")
        if not check_av1_codec(str(path)):
            print(f"[Main] Error: Video is not AV1 encoded: {path.name}")
            QMessageBox.warning(
                self,
                "Invalid Codec",
                f"Video {path.name} is not AV1 encoded. Skipping..."
            )
            return

        print("[Main] Getting video duration")
        duration = get_video_duration(str(path))
        print(f"[Main] Video duration: {duration} seconds")
        
        print("[Main] Generating thumbnail")
        thumbnail_path = generate_thumbnail(str(path))
        print(f"[Main] Thumbnail generated at: {thumbnail_path}")
        
        ai_file = path.with_suffix(path.suffix + '.AI.json')
        has_ai_data = ai_file.exists()
        ai_data = None
        if has_ai_data:
            print(f"[Main] Found AI data file: {ai_file}")
            try:
                with open(ai_file) as f:
                    ai_data = parse_ai_data(json.load(f))
                print("[Main] AI data parsed successfully")
            except Exception as e:
                print(f"[Main] Error loading AI data: {e}")
                has_ai_data = False
                ai_data = None
        
        print("[Main] Adding video to database")
        self.db.add_video(
            path=str(path),
            title=path.name,
            duration=duration,
            has_ai_data=has_ai_data,
            thumbnail_path=thumbnail_path
        )
        
        if has_ai_data and ai_data:
            print("[Main] Adding AI timestamps to database")
            self.db.add_timestamps(path, ai_data["tags"])
        
        print("[Main] Reloading video grid")
        self.load_videos()
        QMessageBox.information(
            self,
            "Video Added",
            f"Successfully added video: {path.name}"
        )

    def load_videos(self):
        print("[Main] Loading videos into grid")
        while self.grid_layout.count():
            child = self.grid_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        videos = self.db.get_all_videos()
        columns = max(1, self.video_grid.width() // 400)
        print(f"[Main] Grid columns: {columns}")
        
        for i, video in enumerate(videos):
            row = i // columns
            col = i % columns
            print(f"[Main] Creating thumbnail for video: {video['path']} at position {row},{col}")
            
            thumbnail = VideoThumbnailWidget(
                video,
                self.db.get_video_timestamps(video['path'])
            )
            thumbnail.play_clicked.connect(self.play_video)
            thumbnail.analyze_clicked.connect(self.analyze_video)
            thumbnail.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
            thumbnail.customContextMenuRequested.connect(
                lambda pos, v=video: self.show_context_menu(pos, v)
            )
            
            self.grid_layout.addWidget(thumbnail, row, col)
        print(f"[Main] Loaded {len(videos)} videos into grid")

    def play_video(self, video_path):
        print(f"[Main] Playing video: {video_path}")
        if self.current_player:
            print("[Main] Closing existing video player")
            self.current_player.close()
            
        self.current_player = VideoPlayer()
        self.current_player.load_video(Path(video_path))
        self.current_player.showMaximized()
        print("[Main] Video player launched")

    def analyze_video(self, video_path):
        print(f"[Main] Analyze video requested for: {video_path}")
        # TODO: Implement video analysis
        pass

    def show_context_menu(self, pos, video):
        print(f"[Main] Showing context menu for video: {video['path']}")
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu {
                background-color: #2d2d2d;
                color: white;
                border: 1px solid #3d3d3d;
            }
            QMenu::item {
                padding: 5px 20px;
            }
            QMenu::item:selected {
                background-color: #3d3d3d;
            }
        """)
        
        move_front = QAction("Move to front", self)
        move_front.triggered.connect(lambda: self.move_to_front(video))
        menu.addAction(move_front)
        
        remove = QAction("Remove", self)
        remove.triggered.connect(lambda: self.remove_video(video))
        menu.addAction(remove)
        
        show_folder = QAction("Show in folder", self)
        show_folder.triggered.connect(lambda: self.show_in_folder(video))
        menu.addAction(show_folder)
        
        clear_playlist = QAction("Clear playlist", self)
        clear_playlist.triggered.connect(self.clear_playlist)
        menu.addAction(clear_playlist)
        
        menu.exec(QCursor.pos())

    def move_to_front(self, video):
        print(f"[Main] Moving video to front: {video['path']}")
        self.db.move_to_front(video['path'])
        self.load_videos()

    def remove_video(self, video):
        print(f"[Main] Removing video: {video['path']}")
        self.db.remove_video(video['path'])
        self.load_videos()

    def show_in_folder(self, video):
        print(f"[Main] Opening folder for video: {video['path']}")
        path = Path(video['path'])
        if sys.platform == 'win32':
            subprocess.run(['explorer', '/select,', str(path)])
        elif sys.platform == 'darwin':
            subprocess.run(['open', '-R', str(path)])
        else:
            subprocess.run(['xdg-open', str(path.parent)])

    def clear_playlist(self):
        print("[Main] Clear playlist requested")
        reply = QMessageBox.question(
            self,
            "Clear Playlist",
            "Are you sure you want to clear the entire playlist?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            print("[Main] Clearing playlist")
            self.db.clear_videos()
            self.load_videos()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    player = HavenPlayer()
    player.show()
    sys.exit(app.exec())
