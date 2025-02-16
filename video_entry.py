import sys
from PyQt6.QtWidgets import QWidget, QHBoxLayout, QLabel, QVBoxLayout, QPushButton
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QPixmap, QIcon

class VideoEntry(QWidget):
    def __init__(self, video):
        super().__init__()
        self.video = video
        self.setup_ui()

    def setup_ui(self):
        self.setStyleSheet("""
            QWidget {
                background-color: #3A3A3A;
                border-radius: 6px;
                padding: 15px;
            }
        """)
        self.setFixedHeight(120)
        
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 10, 10, 10)
        layout.setSpacing(20)

        # Thumbnail
        thumbnail = QLabel()
        thumbnail.setPixmap(QPixmap(self.video['thumbnail_path']).scaled(160, 90, Qt.AspectRatioMode.KeepAspectRatio))
        layout.addWidget(thumbnail)

        # Details
        details = QVBoxLayout()
        details.setSpacing(8)
        
        title = QLabel(self.video['title'])
        title.setStyleSheet("""
            color: white;
            font-size: 16px;
            font-weight: bold;
        """)
        details.addWidget(title)
        
        duration = QLabel(f"Duration: {self.video['duration']}")
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
        
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.CustomContextMenu)
        self.customContextMenuRequested.connect(
            lambda pos: self.show_context_menu(pos)
        )

    def show_context_menu(self, pos):
        # Placeholder for context menu logic
        pass
