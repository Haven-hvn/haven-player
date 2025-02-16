import sys
from pathlib import Path
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QPushButton, QLabel, QScrollArea, QFileDialog, QMessageBox,
    QGridLayout, QMenu
)
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QIcon, QPixmap, QAction, QCursor
from video_player import VideoPlayer, VideoThumbnailWidget
from database import Database
from utils import check_av1_codec, get_video_duration, generate_thumbnail, parse_ai_data
import json

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Haven Player")
        self.setMinimumSize(1200, 800)
        self.db = Database()
        self.current_player = None
        self.setup_ui()
        self.load_videos()

    def setup_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(20, 20, 20, 20)
        main_layout.setSpacing(20)

        # Header with controls
        header = QWidget()
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(0, 0, 0, 0)
        
        self.video_count_label = QLabel("0 videos")
        self.video_count_label.setStyleSheet("""
            color: white;
            font-size: 16px;
            font-weight: bold;
        """)
        header_layout.addWidget(self.video_count_label)
        
        add_button = QPushButton("Add Videos")
        add_button.setStyleSheet("""
            QPushButton {
                background-color: #3d3d3d;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #4d4d4d;
            }
        """)
        add_button.clicked.connect(self.add_videos)
        header_layout.addWidget(add_button, alignment=Qt.AlignmentFlag.AlignRight)
        
        main_layout.addWidget(header)

        # Scroll area for video grid
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: #1e1e1e;
            }
            QScrollBar:vertical {
                border: none;
                background: #2d2d2d;
                width: 10px;
                margin: 0px;
            }
            QScrollBar::handle:vertical {
                background: #5d5d5d;
                min-height: 20px;
                border-radius: 5px;
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                border: none;
                background: none;
            }
        """)
        
        self.video_grid_widget = QWidget()
        self.video_grid_layout = QGridLayout(self.video_grid_widget)
        self.video_grid_layout.setSpacing(20)
        scroll.setWidget(self.video_grid_widget)
        
        main_layout.addWidget(scroll)

        # Set dark theme
        self.setStyleSheet("""
            QMainWindow {
                background-color: #1e1e1e;
                color: white;
            }
        """)

    def add_videos(self):
        files, _ = QFileDialog.getOpenFileNames(
            self,
            "Select Videos",
            str(Path.home()),
            "Video Files (*.mp4 *.mkv *.webm)"
        )
        
        added_count = 0
        for file in files:
            path = Path(file)
            if not path.exists():
                continue
                
            # Check if video is AV1 encoded
            if not check_av1_codec(str(path)):
                QMessageBox.warning(
                    self,
                    "Invalid Codec",
                    f"Video {path.name} is not AV1 encoded. Skipping..."
                )
                continue

            # Get video duration
            duration = get_video_duration(str(path))
            
            # Generate thumbnail
            thumbnail_path = generate_thumbnail(str(path))
            
            # Check for AI data file
            ai_file = path.with_suffix(path.suffix + '.AI.json')
            has_ai_data = ai_file.exists()
            ai_data = None
            if has_ai_data:
                try:
                    with open(ai_file) as f:
                        ai_data = parse_ai_data(json.load(f))
                except Exception as e:
                    print(f"Error loading AI data: {e}")
                    has_ai_data = False
            
            # Add to database
            self.db.add_video(
                path=str(path),
                title=path.name,
                duration=duration,
                has_ai_data=has_ai_data,
                thumbnail_path=thumbnail_path
            )
            
            if has_ai_data and ai_data:
                self.db.add_timestamps(path, ai_data["tags"])
            
            added_count += 1
            
        if added_count > 0:
            self.load_videos()
            QMessageBox.information(
                self,
                "Videos Added",
                f"Successfully added {added_count} video(s)"
            )

    def load_videos(self):
        # Clear existing videos
        while self.video_grid_layout.count():
            child = self.video_grid_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        # Load videos from database
        videos = self.db.get_all_videos()
        self.video_count_label.setText(f"{len(videos)} videos")

        # Calculate grid layout
        columns = max(1, self.video_grid_widget.width() // 400)
        
        for i, video in enumerate(videos):
            row = i // columns
            col = i % columns
            
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
            
            self.video_grid_layout.addWidget(thumbnail, row, col)

    def play_video(self, video_path):
        if self.current_player:
            self.current_player.close()
            
        self.current_player = VideoPlayer()
        self.current_player.load_video(Path(video_path))
        self.current_player.showMaximized()

    def analyze_video(self, video_path):
        # TODO: Implement video analysis
        pass

    def show_context_menu(self, pos, video):
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
        self.db.move_to_front(video['path'])
        self.load_videos()

    def remove_video(self, video):
        self.db.remove_video(video['path'])
        self.load_videos()

    def show_in_folder(self, video):
        path = Path(video['path'])
        if sys.platform == 'win32':
            subprocess.run(['explorer', '/select,', str(path)])
        elif sys.platform == 'darwin':
            subprocess.run(['open', '-R', str(path)])
        else:
            subprocess.run(['xdg-open', str(path.parent)])

    def clear_playlist(self):
        reply = QMessageBox.question(
            self,
            "Clear Playlist",
            "Are you sure you want to clear the entire playlist?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            self.db.clear_videos()
            self.load_videos()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
