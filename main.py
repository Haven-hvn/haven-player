import sys
from pathlib import Path
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
    QPushButton, QLabel, QScrollArea, QFileDialog, QMessageBox,
    QGridLayout, QMenu, QSizePolicy, QSpacerItem
)
from PyQt6.QtCore import Qt, QSize, pyqtSignal
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
        # Main window styling
        self.setStyleSheet("""
            QMainWindow {
                background-color: #282828;
            }
        """)

        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Left Sidebar
        sidebar = QWidget()
        sidebar.setFixedWidth(50)
        sidebar.setStyleSheet("""
            background-color: #2d2d2d;
            border-right: 1px solid #3A3A3A;
        """)
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 20, 0, 20)
        sidebar_layout.setSpacing(15)

        # Sidebar icons
        icons = [
            ('home', 'house.svg'),
            ('file', 'folder.svg'),
            ('add', 'plus.svg'),
            ('settings', 'gear.svg'),
            ('help', 'info-circle.svg')
        ]

        for icon_name, icon_file in icons:
            btn = QPushButton()
            btn.setIcon(QIcon(f":/icons/{icon_file}"))
            btn.setIconSize(QSize(24, 24))
            btn.setFixedSize(40, 40)
            btn.setStyleSheet(f"""
                QPushButton {{
                    background: transparent;
                    border: none;
                }}
                QPushButton:hover {{
                    background-color: #3A3A3A;
                    border-radius: 5px;
                }}
            """)
            sidebar_layout.addWidget(btn, 0, Qt.AlignmentFlag.AlignHCenter)

        sidebar_layout.addStretch()

        main_layout.addWidget(sidebar)

        # Main content area
        content_widget = QWidget()
        content_layout = QVBoxLayout(content_widget)
        content_layout.setContentsMargins(20, 20, 20, 20)
        content_layout.setSpacing(20)

        # Top Bar
        top_bar = QWidget()
        top_bar.setStyleSheet("background-color: #282828;")
        top_bar_layout = QHBoxLayout(top_bar)
        top_bar_layout.setContentsMargins(0, 0, 0, 0)
        top_bar_layout.setSpacing(20)

        # Folder info section
        folder_info = QWidget()
        folder_layout = QHBoxLayout(folder_info)
        folder_layout.setContentsMargins(0, 0, 0, 0)
        folder_layout.setSpacing(10)

        folder_icon = QLabel()
        folder_icon.setPixmap(QIcon(":/icons/folder.svg").pixmap(24, 24))
        folder_layout.addWidget(folder_icon)

        self.video_count_label = QLabel("0 videos")
        self.video_count_label.setStyleSheet("""
            color: #FFFFFF;
            font-size: 14px;
            font-weight: 500;
        """)
        folder_layout.addWidget(self.video_count_label)
        top_bar_layout.addWidget(folder_info)

        # Top bar buttons
        button_container = QWidget()
        button_layout = QHBoxLayout(button_container)
        button_layout.setContentsMargins(0, 0, 0, 0)
        button_layout.setSpacing(10)

        self.add_btn = QPushButton()
        self.add_btn.setIcon(QIcon(":/icons/plus.svg"))
        self.add_btn.setIconSize(QSize(20, 20))
        self.add_btn.setFixedSize(32, 32)
        self.add_btn.setStyleSheet("""
            QPushButton {
                background-color: #3A3A3A;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #4A90E2;
            }
        """)
        self.add_btn.clicked.connect(self.load_videos)
        button_layout.addWidget(self.add_btn)

        self.analyze_btn = QPushButton()
        self.analyze_btn.setIcon(QIcon(":/icons/graph-up.svg"))
        self.analyze_btn.setIconSize(QSize(20, 20))
        self.analyze_btn.setFixedSize(32, 32)
        self.analyze_btn.setStyleSheet("""
            QPushButton {
                background-color: #3A3A3A;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #4A90E2;
            }
        """)
        button_layout.addWidget(self.analyze_btn)

        top_bar_layout.addWidget(button_container)
        content_layout.addWidget(top_bar)

        # Scroll area for video list
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("""
            QScrollArea {
                border: none;
                background-color: #282828;
            }
            QScrollBar:vertical {
                background: #3A3A3A;
                width: 8px;
                border-radius: 4px;
                margin: 0;
            }
            QScrollBar::handle:vertical {
                background: #5d5d5d;
                min-height: 30px;
                border-radius: 4px;
            }
        """)

        self.video_list_widget = QWidget()
        self.video_list_layout = QVBoxLayout(self.video_list_widget)
        self.video_list_layout.setContentsMargins(0, 0, 10, 0)
        self.video_list_layout.setSpacing(15)
        scroll.setWidget(self.video_list_widget)

        content_layout.addWidget(scroll)
        main_layout.addWidget(content_widget)

    def create_video_entry(self, video):
        entry = QWidget()
        entry.setStyleSheet("""
            QWidget {
                background-color: #3A3A3A;
                border-radius: 6px;
                padding: 15px;
            }
        """)
        entry.setFixedHeight(120)
        
        layout = QHBoxLayout(entry)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(20)

        # Thumbnail
        thumbnail = QLabel()
        thumbnail.setPixmap(QPixmap(video['thumbnail_path']).scaled(160, 90, Qt.AspectRatioMode.KeepAspectRatio))
        layout.addWidget(thumbnail)

        # Details
        details = QVBoxLayout()
        details.setSpacing(8)
        
        title = QLabel(video['title'])
        title.setStyleSheet("""
            color: white;
            font-size: 16px;
            font-weight: bold;
        """)
        details.addWidget(title)
        
        duration = QLabel(f"Duration: {video['duration']}")
        duration.setStyleSheet("color: #AAAAAA;")
        details.addWidget(duration)
        
        # Analysis indicator bar
        analysis_bar = QWidget()
        analysis_bar.setFixedHeight(4)
        analysis_bar.setStyleSheet("""
            background-color: #4A90E2;
            border-radius: 2px;
        """)
        details.addWidget(analysis_bar)
        
        layout.addLayout(details)
        
        # Action buttons
        btn_container = QWidget()
        btn_layout = QVBoxLayout(btn_container)
        btn_layout.setContentsMargins(0, 0, 0, 0)
        btn_layout.setSpacing(8)
        
        play_btn = QPushButton()
        play_btn.setIcon(QIcon(":/icons/play.svg"))
        play_btn.setIconSize(QSize(20, 20))
        play_btn.setFixedSize(32, 32)
        play_btn.setStyleSheet("""
            QPushButton {
                background-color: #3A3A3A;
                border-radius: 5px;
            }
            QPushButton:hover {
                background-color: #4A90E2;
            }
        """)
        btn_layout.addWidget(play_btn)
        
        layout.addWidget(btn_container)
        
        entry.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        entry.customContextMenuRequested.connect(
            lambda pos, v=video: self.show_context_menu(pos, v)
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
            entry = self.create_video_entry(video)
            self.video_list_layout.addWidget(entry)

    # ... (rest of the existing methods remain with style updates as needed)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
