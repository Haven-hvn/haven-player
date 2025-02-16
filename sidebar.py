from PyQt6.QtWidgets import QWidget, QVBoxLayout, QPushButton, QFileDialog
from PyQt6.QtCore import QSize, Qt, pyqtSlot
from PyQt6.QtGui import QIcon, QPixmap
from svg_icons import SvgIcons
from database import add_video  # Import the function to add a video
from utils import validate_video_file, parse_ai_data, get_video_length, generate_thumbnail  # Import additional utility functions

class Sidebar(QWidget):
    def __init__(self):
        super().__init__()
        self.setup_ui()

    def setup_ui(self):
        self.setFixedWidth(50)
        self.setStyleSheet("""
            background-color: #2d2d2d;
            border-right: 1px solid #3A3A3A;
        """)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 20, 0, 20)
        layout.setSpacing(15)

        # Sidebar icons
        icons = [
            ('home', SvgIcons.house_svg()),
            ('file', SvgIcons.folder_svg()),
            ('add', SvgIcons.plus_svg()),
            ('graph-up', SvgIcons.graph_up_svg()),
            ('settings', SvgIcons.gear_svg()),
            ('help', SvgIcons.info_circle_svg())
        ]

        for icon_name, svg_content in icons:
            btn = QPushButton()
            pixmap = QPixmap()
            pixmap.loadFromData(svg_content.encode())
            btn.setIcon(QIcon(pixmap))
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
            if icon_name == 'add':
                btn.clicked.connect(self.add_video_handler)  # Connect the 'Add' button to the handler
            layout.addWidget(btn, 0, Qt.AlignmentFlag.AlignHCenter)

        layout.addStretch()

    @pyqtSlot()
    def add_video_handler(self):
        video_path = self.get_video_path()
        if video_path and validate_video_file(video_path):  # Validate the video file
            ai_data = parse_ai_data(video_path)  # Parse AI data
            video_length = get_video_length(video_path)  # Get video length
            thumbnail_path = generate_thumbnail(video_path)  # Generate thumbnail
            add_video(video_path, ai_data, video_length, thumbnail_path)  # Add video with additional data

    def get_video_path(self):
        # Open a file dialog to select a video file
        file_dialog = QFileDialog(self)
        file_dialog.setNameFilter("Video Files (*.mp4 *.avi *.mkv *.mov)")
        file_dialog.setFileMode(QFileDialog.FileMode.ExistingFile)
        if file_dialog.exec():
            return file_dialog.selectedFiles()[0]
        return None
