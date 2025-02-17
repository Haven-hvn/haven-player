import av
from pathlib import Path
import json
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QSlider, QFrame, QSizePolicy
)
from PyQt6.QtCore import Qt, QTimer, QSize, pyqtSignal
from PyQt6.QtGui import QImage, QPixmap, QPainter, QColor, QPen, QIcon
from svg_icons import SvgIcons  # Import the SvgIcons class

class AnalysisProgressBar(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(12)  # Increased thickness
        self.setStyleSheet("background-color: #2d2d2d; border-radius: 6px;")  # Colored to match design
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
        painter.fillRect(0, 0, width, height, QColor("#4A4A4A"))

        # Draw timestamp indicators
        for ts in self.timestamps:
            if 'start' in ts:
                start_x = int((ts['start'] / self.duration) * width)
                if 'end' in ts:
                    end_x = int((ts['end'] / self.duration) * width)
                else:
                    end_x = int(((ts['start']+5) / self.duration) * width)
                
                # Draw blue indicator for timestamp range
                painter.fillRect(
                    start_x, 0,
                    max(2, end_x - start_x), height,
                    QColor("#4A90E2")
                )

class VideoThumbnailWidget(QWidget):
    play_clicked = pyqtSignal(str)
    analyze_clicked = pyqtSignal(str)

    def __init__(self, video: dict, timestamps: list, parent=None):
        super().__init__(parent)
        self.video = video
        self.timestamps = timestamps
        self.setup_ui()

    def setup_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        # Thumbnail
        thumbnail_label = QLabel()
        thumbnail_label.setFixedSize(80, 45)
        if self.video['thumbnail_path']:
            pixmap = QPixmap(self.video['thumbnail_path'])
            thumbnail_label.setPixmap(pixmap.scaled(
                80, 45,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation
            ))
        layout.addWidget(thumbnail_label)

        # Video Name
        title_label = QLabel(Path(self.video['path']).name)
        title_label.setStyleSheet("color: white; font-weight: bold;")
        layout.addWidget(title_label)

        # Analysis Indicator
        self.analysis_bar = AnalysisProgressBar()
        self.analysis_bar.set_data(self.timestamps, self.video['duration'])
        layout.addWidget(self.analysis_bar, stretch=1)

        # Completion Status
        if self.video['has_ai_data']:
            status_label = QLabel("Completed")
            status_label.setStyleSheet("color: #34C759;")
            layout.addWidget(status_label)
        else:
            analyze_btn = QPushButton("Analyze")
            analyze_btn.setFixedSize(80, 32)
            analyze_btn.setStyleSheet("""
                QPushButton {
                    background-color: #FF9500;
                    color: white;
                    border: none;
                    border-radius: 16px;
                }
                QPushButton:hover {
                    background-color: #CC7600;
                }
            """)
            analyze_btn.clicked.connect(lambda: self.analyze_clicked.emit(self.video['path']))
            layout.addWidget(analyze_btn)

        # Play Button
        play_btn = QPushButton()
        play_svg_content = SvgIcons.play_svg()  # Get the SVG content
        pixmap = QPixmap()
        pixmap.loadFromData(play_svg_content.encode())  # Load the SVG content
        play_btn.setIcon(QIcon(pixmap))
        play_btn.setIconSize(QSize(20, 20))
        play_btn.setFixedSize(32, 32)
        play_btn.setStyleSheet("""
            QPushButton {
                background-color: #3A3A3A;
                border-radius: 16px;
            }
            QPushButton:hover {
                background-color: #4A90E2;
            }
        """)
        play_btn.clicked.connect(lambda: self.play_clicked.emit(self.video['path']))
        layout.addWidget(play_btn)

        # Set fixed height for consistent grid layout
        self.setFixedHeight(50)
        self.setStyleSheet("""
            QWidget {
                background-color: #2d2d2d;
                border-radius: 8px;
            }
        """)

class VideoPlayer(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.container = None
        self.stream = None
        self.current_frame = 0
        self.total_frames = 0
        self.timer = QTimer()
        self.timer.timeout.connect(self.display_next_frame)
        self.setup_ui()

    def setup_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Video display
        self.video_frame = QLabel()
        self.video_frame.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.video_frame.setStyleSheet("background-color: black;")
        layout.addWidget(self.video_frame)

        # Controls overlay
        controls = QWidget()
        controls.setStyleSheet("""
            QWidget {
                background-color: rgba(0, 0, 0, 0.7);
            }
            QPushButton {
                background-color: rgba(255, 255, 255, 0.2);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 8px;
            }
            QPushButton:hover {
                background-color: rgba(255, 255, 255, 0.3);
            }
            QLabel {
                color: white;
            }
        """)
        
        controls_layout = QVBoxLayout(controls)
        controls_layout.setContentsMargins(20, 10, 20, 20)
        
        # Timeline slider
        self.time_slider = QSlider(Qt.Orientation.Horizontal)
        self.time_slider.setStyleSheet("""
            QSlider::groove:horizontal {
                border: none;
                height: 4px;
                background: #555555;
            }
            QSlider::handle:horizontal {
                background: white;
                width: 12px;
                margin: -4px 0;
                border-radius: 6px;
            }
        """)
        self.time_slider.valueChanged.connect(self.seek)
        controls_layout.addWidget(self.time_slider)
        
        # Playback controls
        playback_layout = QHBoxLayout()
        
        self.play_button = QPushButton("Play")
        self.play_button.setFixedSize(80, 36)
        self.play_button.clicked.connect(self.toggle_playback)
        playback_layout.addWidget(self.play_button)
        
        self.time_label = QLabel("00:00:00 / 00:00:00")
        playback_layout.addWidget(self.time_label)
        
        controls_layout.addLayout(playback_layout)
        layout.addWidget(controls)

    def load_video(self, path: Path):
        try:
            self.container = av.open(str(path))
            self.stream = self.container.streams.video[0]
            self.total_frames = self.stream.frames
            self.time_slider.setRange(0, self.total_frames - 1)
            self.display_frame(0)
            self.update_time_label()
            self.play_button.setEnabled(True)
            self.time_slider.setEnabled(True)
        except Exception as e:
            print(f"Error loading video: {e}")

    def display_frame(self, frame_num):
        try:
            self.container.seek(frame_num, stream=self.stream)
            for frame in self.container.decode(video=0):
                img = frame.to_ndarray(format='rgb24')
                h, w = img.shape[:2]
                bytes_per_line = 3 * w
                image = QImage(img.data, w, h, bytes_per_line, QImage.Format.Format_RGB888)
                scaled_pixmap = QPixmap.fromImage(image).scaled(
                    self.video_frame.size(),
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation
                )
                self.video_frame.setPixmap(scaled_pixmap)
                break
        except Exception as e:
            print(f"Error displaying frame: {e}")

    def display_next_frame(self):
        if self.current_frame < self.total_frames - 1:
            self.current_frame += 1
            self.time_slider.setValue(self.current_frame)
            self.display_frame(self.current_frame)
            self.update_time_label()
        else:
            self.timer.stop()
            self.play_button.setText("Play")

    def toggle_playback(self):
        if self.timer.isActive():
            self.timer.stop()
            self.play_button.setText("Play")
        else:
            self.timer.start(1000 // 30)  # 30 fps
            self.play_button.setText("Pause")

    def seek(self, frame_num):
        self.current_frame = frame_num
        self.display_frame(frame_num)
        self.update_time_label()

    def update_time_label(self):
        if not self.stream:
            return
            
        current = self.current_frame / self.stream.rate
        total = self.total_frames / self.stream.rate
        self.time_label.setText(
            f"{self.format_time(current)} / {self.format_time(total)}"
        )

    def format_time(self, seconds):
        m, s = divmod(int(seconds), 60)
        h, m = divmod(m, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def closeEvent(self, event):
        self.timer.stop()
        if self.container:
            self.container.close()
        super().closeEvent(event)
