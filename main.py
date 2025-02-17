from PyQt6.QtWidgets import QApplication, QMainWindow
from top_bar import TopBar

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.top_bar = TopBar()
        self.setCentralWidget(self.top_bar)
        self.update_video_count(5)  # Example: Update video count to 5

    def update_video_count(self, count):
        self.top_bar.update_video_count(count)

if __name__ == "__main__":
    app = QApplication([])
    window = MainWindow()
    window.show()
    app.exec()
