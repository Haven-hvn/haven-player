from PyQt6.QtWidgets import QWidget, QHBoxLayout, QLabel, QPushButton
from PyQt6.QtCore import QSize
from PyQt6.QtGui import QIcon, QPixmap

class TopBar(QWidget):
    def __init__(self):
        super().__init__()
        self.setup_ui()

    def setup_ui(self):
        self.setStyleSheet("background-color: #282828;")
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(20)

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
        layout.addWidget(folder_info)

        # Top bar buttons
        button_container = QWidget()
        button_layout = QHBoxLayout(button_container)
        button_layout.setContentsMargins(0, 0, 0, 0)
        button_layout.setSpacing(10)

        self.add_btn = QPushButton()
        svg_content = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path> <path d="M9 12h6"></path> <path d="M12 9v6"></path> </svg>
        """
        pixmap = QPixmap()
        pixmap.loadFromData(svg_content.encode())
        self.add_btn.setIcon(QIcon(pixmap))
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
        button_layout.addWidget(self.add_btn)

        self.analyze_btn = QPushButton()
        svg_content = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M3 4m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z"></path> <path d="M7 20l10 0"></path> <path d="M9 16l0 4"></path> <path d="M15 16l0 4"></path> <path d="M8 12l3 -3l2 2l3 -3"></path> </svg>
        """
        pixmap = QPixmap()
        pixmap.loadFromData(svg_content.encode())
        self.analyze_btn.setIcon(QIcon(pixmap))
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

        layout.addWidget(button_container)
