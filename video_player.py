import av
from pathlib import Path
import json
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QSlider, QFrame, QSizePolicy
)
from PyQt6.QtCore import Qt, QTimer, QSize, pyqtSignal
from PyQt6.QtGui import QImage, QPixmap, QPainter, QColor, QPen, QIcon

class TimestampBar(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(6)
        self.setStyleSheet("background-color: #1e1e1e;")
        self.timestamps = []
        self.duration = 0

    def set_data(self, timestamps: list, duration: int):
        self.timestamps = timestamps
        self.duration = duration
        self.update()

    def paintEvent(self, event):
        super().paintEvent(event)
        if not self.timestamps or not self.duration:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        width = self.width()
        height = self.height()

        # Draw base bar
        painter.fillRect(0, 0, width, height, QColor("#1e1e1e"))

        # Draw timestamp indicators
        for ts in self.timestamps:
            if 'start' in ts and 'end' in ts:
                start_x = int((ts['start'] / self.duration) * width)
                end_x = int((ts['end'] / self.duration) * width)
                
                # Draw blue indicator for timestamp range
                painter.fillRect(
                    start_x, 0,
                    max(2, end_x - start_x), height,
                    QColor("#007AFF")
                )

        painter.end()  # Ensure QPainter is properly ended

# [Rest of the file content remains unchanged]
