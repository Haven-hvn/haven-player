import sys
from pathlib import Path
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QPushButton, QLabel, QScrollArea, QFileDialog, QMessageBox,
    QGridLayout, QMenu, QFrame, QSizePolicy
)
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QIcon, QPixmap, QAction, QCursor, QColor
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
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Left Sidebar
        sidebar = QWidget()
        sidebar.setFixedWidth(50)
        sidebar.setStyleSheet("""
            QWidget {
                background-color: #282828;
            }
        """)
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)

        icons = ["home", "file", "settings", "help"]
        for icon in icons:
            btn = QPushButton()
            btn.setIcon(QIcon(f":/icons/{icon}.png"))
            btn.setIconSize(QSize(24, 24))
            btn.setFixedSize(50, 50)
            btn.setStyleSheet("""
                QPushButton {
                    background-color: #282828;
                    border: none;
                }
                QPushButton:hover {
                    background-color: #4A90E2;
                }
            """)
            sidebar_layout.addWidget(btn)

        main_layout.addWidget(sidebar)

        # Main Content Area
        main_content = QWidget()
        main_content.setStyleSheet("""
            QWidget {
                background-color: #282828;
                color: #FFFFFF;
            }
        """)
        main_content_layout = QVBoxLayout(main_content)
        main_content_layout.setContentsMargins(20, 20, 20, 20)
        main_content_layout.setSpacing(20)

        # Top Bar
        top_bar = QWidget()
        top_bar_layout = QHBoxLayout(top_bar)
        top_bar_layout.setContentsMargins(0, 0, 0, 0)
        
        self.video_count_label = QLabel("0 videos")
        self.video_count_label.setStyleSheet("""
            color: #FFFFFF;
            font-size: 16px;
            font-weight: bold;
        """)
        top_bar_layout.addWidget(self.video_count_label)
        
        analyze_all_button = QPushButton("Analyze All")
        analyze_all_button.setIcon(QIcon(":/icons/analyze.png"))
        analyze_all_button.setIconSize(QSize(24, 24))
        analyze_all_button.setStyleSheet("""
            QPushButton {
                background-color: #282828;
                color: #FFFFFF;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
            }
            QPushButton:hover {
                background-color: #4A90E2;
            }
        """)
        analyze_all_button.clicked.connect(self.analyze_all_videos)
        top_bar_layout.addWidget(analyze_all_button, alignment=Qt.AlignmentFlag.AlignRight)
        
        main_content_layout.addWidget(top_bar)

        # Scroll area for video list
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: #282828;
            }
            QScrollBar:vertical {
                border: none;
                background: #282828;
                width: 10px;
                margin: 0px;
            }
            QScrollBar::handle:vertical {
                background: #4A90E2;
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
        self.video_list_layout.setSpacing(20)
        scroll.setWidget(self.video_list_widget)
        
        main_content_layout.addWidget(scroll)

        main_layout.addWidget(main_content)

    def load_videos(self):
        # Clear existing videos
        while self.video_list_layout.count():
            child = self.video_list_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        # Load videos from database
        videos = self.db.get_all_videos()
        self.video_count_label.setText(f"{len(videos)} videos")

        for i, video in enumerate(videos):
            video_entry = QWidget()
            video_entry_layout = QHBoxLayout(video_entry)
            video_entry_layout.setContentsMargins(0, 0, 0, 0)
            video_entry_layout.setSpacing(10)

            # Entry Number
            entry_number = QLabel(f"{i+1}.")
            entry_number.setStyleSheet("""
                color: #FFFFFF;
                font-size: 14px;
            """)
            video_entry_layout.addWidget(entry_number)

            # Video Thumbnail
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
            video_entry_layout.addWidget(thumbnail)

            # Video Details
            details = QVBoxLayout()
            title = QLabel(video['title'])
            title.setStyleSheet("""
                color: #FFFFFF;
                font-size: 14px;
            """)
            duration = QLabel(f"Duration: {video['duration']}")
            duration.setStyleSheet("""
                color: #FFFFFF;
                font-size: 12px;
            """)
            details.addWidget(title)
            details.addWidget(duration)
            video_entry_layout.addLayout(details)

            # Analysis Indicator Bar
            indicator_bar = QFrame()
            indicator_bar.setFixedHeight(10)
            indicator_bar.setStyleSheet("""
                QFrame {
                    background-color: #4A90E2;
                }
            """)
            video_entry_layout.addWidget(indicator_bar)

            # Buttons
            completed_button = QPushButton("Completed")
            completed_button.setStyleSheet("""
                QPushButton {
                    background-color: #282828;
                    color: #FFFFFF;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                QPushButton:hover {
                    background-color: #4A90E2;
                }
            """)
            video_entry_layout.addWidget(completed_button)

            play_button = QPushButton("Play")
            play_button.setStyleSheet("""
                QPushButton {
                    background-color: #282828;
                    color: #FFFFFF;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                QPushButton:hover {
                    background-color: #4A90E2;
                }
            """)
            play_button.clicked.connect(lambda: self.play_video(video['path']))
            video_entry_layout.addWidget(play_button)

            self.video_list_layout.addWidget(video_entry)

    def play_video(self, video_path):
        if self.current_player:
            self.current_player.close()
            
        self.current_player = VideoPlayer()
        self.current_player.load_video(Path(video_path))
        self.current_player.showMaximized()

    def analyze_video(self, video_path):
        # TODO: Implement video analysis
        pass

    def analyze_all_videos(self):
        # TODO: Implement analyze all videos
        pass

    def show_context_menu(self, pos, video):
        # TODO: Implement context menu
        pass

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
