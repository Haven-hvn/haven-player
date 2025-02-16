from PyQt6.QtWidgets import QWidget, QVBoxLayout, QPushButton
from PyQt6.QtCore import QSize
from PyQt6.QtGui import QIcon, QPixmap

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

        for icon_name, icon_file in icons:
            btn = QPushButton()
            if icon_file == 'plus.svg':
                svg_content = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path> <path d="M9 12h6"></path> <path d="M12 9v6"></path> </svg>
                """
                pixmap = QPixmap()
                pixmap.loadFromData(svg_content.encode())
                btn.setIcon(QIcon(pixmap))
            elif icon_file == 'graph-up.svg':
                svg_content = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M3 4m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z"></path> <path d="M7 20l10 0"></path> <path d="M9 16l0 4"></path> <path d="M15 16l0 4"></path> <path d="M8 12l3 -3l2 2l3 -3"></path> </svg>
                """
                pixmap = QPixmap()
                pixmap.loadFromData(svg_content.encode())
                btn.setIcon(QIcon(pixmap))
            else:
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
            layout.addWidget(btn, 0, Qt.AlignmentFlag.AlignHCenter)

        layout.addStretch()
