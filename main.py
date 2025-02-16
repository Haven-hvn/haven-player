import sys
from PyQt6.QtWidgets import QApplication, QMainWindow, QVBoxLayout, QWidget, QScrollArea, QHBoxLayout
from PyQt6.QtCore import Qt

from video_entry import VideoEntry
from sidebar import Sidebar
from top_bar import TopBar

class HavenPlayer(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Haven Player")
        self.setGeometry(100, 100, 800, 600)
        self.setup_ui()

    def setup_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)

        # Top Bar
        self.top_bar = TopBar()
        layout.addWidget(self.top_bar)

        # Main Content
        main_content = QWidget()
        main_layout = QHBoxLayout(main_content)
        layout.addWidget(main_content)

        # Sidebar
        self.sidebar = Sidebar()
        main_layout.addWidget(self.sidebar)

        # Video Entries
        self.video_entries = QScrollArea()
        self.video_entries.setWidgetResizable(True)
        self.video_entries.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        self.video_entries.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.video_entries_widget = QWidget()
        self.video_entries_layout = QVBoxLayout(self.video_entries_widget)
        self.video_entries_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.video_entries.setWidget(self.video_entries_widget)
        main_layout.addWidget(self.video_entries)

        # Add sample video entries
        self.add_video_entry({"title": "Sample Video 1", "duration": "5:30", "thumbnail_path": ":/thumbnails/sample1.jpg"})
        self.add_video_entry({"title": "Sample Video 2", "duration": "3:45", "thumbnail_path": ":/thumbnails/sample2.jpg"})

    def add_video_entry(self, video):
        entry = VideoEntry(video)
        self.video_entries_layout.addWidget(entry)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    haven_player = HavenPlayer()
    haven_player.show()
    sys.exit(app.exec())
