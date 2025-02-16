from PyQt6.QtWidgets import QWidget, QVBoxLayout, QPushButton
from PyQt6.QtCore import QSize, Qt
from PyQt6.QtGui import QIcon, QPixmap
from svg_icons import SvgIcons

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
            layout.addWidget(btn, 0, Qt.AlignmentFlag.AlignHCenter)

        layout.addStretch()
