import av
from pathlib import Path
import json
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QSlider, QFileDialog, QFrame
)
from PyQt6.QtCore import Qt, QTimer, QSize, QUrl
from PyQt6.QtGui import QImage, QPixmap, QDragEnterEvent, QDropEvent, QPainter, QColor, QPen

class TimelineWidget(QFrame):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(30)
        self.setStyleSheet("background-color: #2d2d2d;")
        self.tags = {}
        self.duration = 0
        self.tag_colors = {
            "Grabbing Hands": QColor("#FF5733"),
            "Hug": QColor("#33FF57"),
            "Embrace": QColor("#3357FF"),
            "Kiss": QColor("#FF33F5")
        }

    def set_data(self, ai_data):
        if ai_data and "tags" in ai_data:
            self.tags = ai_data["tags"]
            if "video_metadata" in ai_data:
                self.duration = ai_data["video_metadata"]["duration"]
            self.update()

    def paintEvent(self, event):
        super().paintEvent(event)
        if not self.tags or not self.duration:
            return

        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        width = self.width()
        height = self.height()

        # Draw timeline base
        painter.fillRect(0, 0, width, height, QColor("#2d2d2d"))

        # Draw tags
        for tag_name, tag_data in self.tags.items():
            color = self.tag_colors.get(tag_name, QColor("#FFFFFF"))
            pen = QPen(color)
            pen.setWidth(2)
            painter.setPen(pen)

            for frame in tag_data["time_frames"]:
                start_time = frame["start"]
                end_time = frame.get("end", start_time + 2.0)  # Default 2 second duration if no end time
                
                start_x = int((start_time / self.duration) * width)
                end_x = int((end_time / self.duration) * width)
                
                # Draw line for timestamp range
                y_pos = height // 2
                painter.drawLine(start_x, y_pos, end_x, y_pos)
                
                # Draw confidence indicator
                if "confidence" in frame:
                    confidence_height = int(frame["confidence"] * height)
                    painter.drawLine(start_x, y_pos - confidence_height//2, 
                                   start_x, y_pos + confidence_height//2)

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
        
        # Video info
        info_layout = QHBoxLayout()
        self.title_label = QLabel()
        self.title_label.setStyleSheet("color: white; font-size: 14px;")
        info_layout.addWidget(self.title_label)
        
        self.duration_label = QLabel()
        self.duration_label.setStyleSheet("color: #888888;")
        info_layout.addWidget(self.duration_label)
        
        info_layout.addStretch()
        layout.addLayout(info_layout)
        
        # Video display area
        self.video_frame = QLabel()
        self.video_frame.setMinimumSize(640, 360)
        self.video_frame.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.video_frame.setStyleSheet("background-color: #1e1e1e;")
        layout.addWidget(self.video_frame)

        # Controls
        controls_layout = QHBoxLayout()
        
        self.play_button = QPushButton("Play")
        self.play_button.clicked.connect(self.toggle_playback)
        self.play_button.setEnabled(False)
        controls_layout.addWidget(self.play_button)

        self.analyze_button = QPushButton("Analyze")
        self.analyze_button.clicked.connect(self.analyze_video)
        self.analyze_button.setEnabled(False)
        self.analyze_button.hide()
        controls_layout.addWidget(self.analyze_button)

        self.time_slider = QSlider(Qt.Orientation.Horizontal)
        self.time_slider.setEnabled(False)
        self.time_slider.valueChanged.connect(self.seek)
        controls_layout.addWidget(self.time_slider)

        self.time_label = QLabel("00:00 / 00:00")
        self.time_label.setStyleSheet("color: white;")
        controls_layout.addWidget(self.time_label)

        layout.addLayout(controls_layout)

        # Timeline for AI timestamps
        self.timeline = TimelineWidget()
        layout.addWidget(self.timeline)

        # Enable drag and drop
        self.setAcceptDrops(True)
        
        # Set widget style
        self.setStyleSheet("""
            QWidget {
                background-color: #2d2d2d;
            }
            QPushButton {
                background-color: #3d3d3d;
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 3px;
                min-width: 80px;
            }
            QPushButton:hover {
                background-color: #4d4d4d;
            }
            QSlider::groove:horizontal {
                border: 1px solid #999999;
                height: 8px;
                background: #3d3d3d;
                margin: 2px 0;
            }
            QSlider::handle:horizontal {
                background: #5d5d5d;
                border: 1px solid #999999;
                width: 18px;
                margin: -2px 0;
                border-radius: 3px;
            }
        """)

    def load_video(self, path: Path):
        try:
            self.container = av.open(str(path))
            self.stream = self.container.streams.video[0]
            
            # Check if video is AV1 encoded
            if self.stream.codec_context.name != 'av1':
                raise ValueError("Video must be AV1 encoded")

            self.total_frames = self.stream.frames
            self.time_slider.setRange(0, self.total_frames - 1)
            
            # Update title and duration
            self.title_label.setText(path.name)
            duration = self.total_frames / self.stream.rate
            self.duration_label.setText(self.format_time(duration))
            
            # Check for AI data file
            ai_file = path.with_suffix(path.suffix + '.AI.json')
            if ai_file.exists():
                with open(ai_file) as f:
                    self.ai_data = json.load(f)
                self.timeline.set_data(self.ai_data)
                self.play_button.show()
                self.analyze_button.hide()
            else:
                self.ai_data = None
                self.play_button.hide()
                self.analyze_button.show()

            self.play_button.setEnabled(True)
            self.analyze_button.setEnabled(True)
            self.time_slider.setEnabled(True)
            self.display_frame(0)

        except Exception as e:
            print(f"Error loading video: {e}")

    def display_frame(self, frame_num):
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

    def display_next_frame(self):
        if self.current_frame < self.total_frames - 1:
            self.current_frame += 1
            self.time_slider.setValue(self.current_frame)
            self.display_frame(self.current_frame)
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
        current = self.current_frame / self.stream.rate if self.stream else 0
        total = self.total_frames / self.stream.rate if self.stream else 0
        self.time_label.setText(f"{self.format_time(current)} / {self.format_time(total)}")

    def format_time(self, seconds):
        m, s = divmod(int(seconds), 60)
        h, m = divmod(m, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"

    def analyze_video(self):
        # TODO: Implement AI analysis
        pass

    def dragEnterEvent(self, event: QDragEnterEvent):
        if event.mimeData().hasUrls():
            event.acceptProposedAction()

    def dropEvent(self, event: QDropEvent):
        urls = event.mimeData().urls()
        if urls:
            path = Path(urls[0].toLocalFile())
            if path.suffix.lower() in ['.mp4', '.mkv', '.webm']:
                self.load_video(path)
