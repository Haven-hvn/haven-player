import sys
from pathlib import Path
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, 
    QHBoxLayout, QPushButton, QLabel, QScrollArea,
    QFileDialog, QMessageBox
)
from PyQt6.QtCore import Qt
from PyQt6.QtGui import QIcon
from video_player import VideoPlayer
from database import Database
from utils import check_av1_codec, get_video_duration, generate_thumbnail

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Haven Player")
        self.setMinimumSize(1200, 800)
        self.db = Database()
        self.setup_ui()
        self.load_videos()

    def setup_ui(self):
        # Create central widget and main layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Left sidebar
        sidebar = QWidget()
        sidebar.setFixedWidth(60)
        sidebar.setStyleSheet("background-color: #1a1a1a;")
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        sidebar_layout.setContentsMargins(10, 10, 10, 10)
        sidebar_layout.setSpacing(10)
        
        # Add video button
        add_button = QPushButton("+")
        add_button.setFixedSize(40, 40)
        add_button.setStyleSheet("""
            QPushButton {
                background-color: #3d3d3d;
                color: white;
                border: none;
                border-radius: 20px;
                font-size: 20px;
            }
            QPushButton:hover {
                background-color: #4d4d4d;
            }
        """)
        add_button.clicked.connect(self.add_videos)
        sidebar_layout.addWidget(add_button)
        
        main_layout.addWidget(sidebar)

        # Right content area
        content = QWidget()
        content.setStyleSheet("background-color: #2d2d2d;")
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(20, 20, 20, 20)
        content_layout.setSpacing(20)

        # Header with video count
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
        
        # Analyze all button
        analyze_all_btn = QPushButton("Analyze all")
        analyze_all_btn.setStyleSheet("""
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
        analyze_all_btn.clicked.connect(self.analyze_all_videos)
        header_layout.addWidget(analyze_all_btn, alignment=Qt.AlignmentFlag.AlignRight)
        
        content_layout.addWidget(header)

        # Video list scroll area
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: transparent;
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
        
        self.video_list_widget = QWidget()
        self.video_list_layout = QVBoxLayout(self.video_list_widget)
        self.video_list_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.video_list_layout.setSpacing(20)
        scroll.setWidget(self.video_list_widget)
        
        content_layout.addWidget(scroll)
        main_layout.addWidget(content)

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
            has_ai_data = path.with_suffix(path.suffix + '.AI.json').exists()
            
            # Add to database
            self.db.add_video(
                path=str(path),
                title=path.name,
                duration=duration,
                has_ai_data=has_ai_data
            )
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
        while self.video_list_layout.count():
            child = self.video_list_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        # Load videos from database
        videos = self.db.get_all_videos()
        self.video_count_label.setText(f"{len(videos)} videos")

        for video in videos:
            player = VideoPlayer()
            player.load_video(Path(video['path']))
            self.video_list_layout.addWidget(player)

    def analyze_all_videos(self):
        videos = self.db.get_all_videos()
        unanalyzed = [v for v in videos if not v['has_ai_data']]
        
        if not unanalyzed:
            QMessageBox.information(
                self,
                "Analysis",
                "All videos have already been analyzed!"
            )
            return
            
        reply = QMessageBox.question(
            self,
            "Analyze Videos",
            f"Start analysis of {len(unanalyzed)} video(s)?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            # TODO: Implement batch analysis
            pass

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
