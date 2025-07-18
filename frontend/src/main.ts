import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import * as path from "path";

// Check if we're in development mode
const isDev =
  process.env.NODE_ENV === "development" || process.argv.includes("--dev");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuiting = false;

// Track quit intent to allow tray quit
app.on("before-quit", () => {
  isQuiting = true;
});

// Function to create system tray icon and menu
function createTray() {
  const iconPath = path.join(__dirname, "tray-icon.png");
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        if (mainWindow) mainWindow.show();
      },
    },
    {
      label: "Quit",
      click: () => {
        isQuiting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip("Haven Player");
  tray.on("double-click", () => {
    if (mainWindow) mainWindow.show();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // Disable web security for development
      // TODO: Improve security later with preload script
    },
  });

  // Load from development server in dev mode, otherwise load from local files
  if (isDev) {
    console.log("Loading from development server: http://localhost:3000");
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();

    // Enable hot reload
    mainWindow.webContents.on("did-frame-finish-load", () => {
      if (isDev) {
        mainWindow?.webContents.once("devtools-opened", () => {
          mainWindow?.webContents.focus();
        });
      }
    });
  } else {
    const indexPath = path.join(__dirname, "index.html");
    console.log("Loading from local file:", indexPath);
    mainWindow.loadFile(indexPath);
  }

  // After window is created, set up tray and override close to hide
  createTray();

  mainWindow.on("close", (event) => {
    if (!isQuiting) {
      event.preventDefault();
      if (mainWindow) {
        mainWindow.hide();
      }
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle file selection
ipcMain.handle("select-video", async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Videos", extensions: ["mp4", "webm", "mkv"] }],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});
