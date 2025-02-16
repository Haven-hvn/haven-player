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

# ... [rest of the file remains unchanged] ...

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
