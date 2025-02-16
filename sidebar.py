from PyQt6.QtWidgets import QWidget, QVBoxLayout, QPushButton
from PyQt6.QtCore import QSize, Qt
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

        # Sidebar icons
        icons = [
            ('home', 'house.svg'),
            ('file', 'folder.svg'),
            ('add', 'plus.svg'),
            ('graph-up', 'graph-up.svg'),
            ('settings', 'gear.svg'),
            ('help', 'info-circle.svg')
        ]

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
            elif icon_file == 'house.svg':
                svg_content = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M5 12l-2 0l9 -9l9 9l-2 0"></path> <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"></path> <path d="M10 12h4v4h-4z"></path> </svg> 
                """
                pixmap = QPixmap()
                pixmap.loadFromData(svg_content.encode())
                btn.setIcon(QIcon(pixmap))
            elif icon_file == 'folder.svg':
                svg_content = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2"> <path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2"></path> </svg> 
                """
                pixmap = QPixmap()
                pixmap.loadFromData(svg_content.encode())
                btn.setIcon(QIcon(pixmap))
            elif icon_file == 'gear.svg':
                svg_content = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2">
  <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z"></path>
  <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"></path>
</svg>
                """
                pixmap = QPixmap()
                pixmap.loadFromData(svg_content.encode())
                btn.setIcon(QIcon(pixmap))
            elif icon_file == 'info-circle.svg':
                svg_content = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2">
  <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0"></path>
  <path d="M12 9h.01"></path>
  <path d="M11 12h1v4h1"></path>
</svg>
                """
                pixmap = QPixmap()
                pixmap.loadFromData(svg_content.encode())
                btn.setIcon(QIcon(pixmap))
            elif icon_file == 'play.svg':
                svg_content = """
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" stroke-width="2">
  <path d="M7 4v16l13 -8z"></path>
</svg>
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
