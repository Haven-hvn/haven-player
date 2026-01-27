This guide details how to compile the Haven Player from source on Windows, covering the full build stack from the Python backend to the Electron frontend.

### Prerequisites

1.  **Windows Software Development Kit (SDK)**
    *   **Why?** You need this to compile certain Node.js native modules. If you do not have this installed, your build will fail with errors regarding `node-gyp` or `windows-build-tools`.
    *   **How to Install:** Download the "Windows 10 SDK" (or newer) from the official Microsoft Windows SDK page or via the Visual Studio Installer (look for "Desktop development with C++").

2.  **Python 3.14**
    *   The backend requires Python 3.14. Ensure you install it and add it to your PATH.

3.  **Node.js**
    *   Install Node.js (LTS version recommended).

---

### Step 1: Clone the Repository
Open your terminal (Command Prompt or PowerShell) and navigate to where you want to keep the project.

```cmd
git clone https://github.com/Haven-hvn/haven-player.git
cd haven-player
```

### Step 2: Build the Backend (Python)

The backend is a Python application that requires specific libraries. We will create a virtual environment to keep dependencies isolated.

1.  **Navigate to the backend folder:**
    ```cmd
    cd backend
    ```

2.  **Create a Virtual Environment:**
    This creates a `venv` folder in your backend directory.
    ```cmd
    python -m venv venv
    ```

3.  **Activate the Virtual Environment:**
    ```cmd
    venv\Scripts\activate
    ```

4.  **Install Dependencies:**
    ```cmd
    pip install -r requirements.txt
    ```

5.  **Build the Executable:**
    We use PyInstaller to package the Python code into a standalone `.exe` file.
    
    ```cmd
    pyinstaller haven-backend.spec --clean
    ```
    
    Once finished, you should find `haven-backend.exe` inside `backend\dist\`.

### Step 3: Build the Frontend (Electron)

Now we will package the Electron frontend and embed the backend executable we just built.

1.  **Navigate to the frontend folder:**
    ```cmd
    cd ..\frontend
    ```

2.  **Install Frontend Dependencies:**
    ```cmd
    npm install
    ```

3.  **Build the Application:**
    This command runs the Webpack build process (compiling React/TypeScript) and then packages the app using Electron Forge.
    
    *   *Note: If you are running this on a machine with limited RAM (less than 16GB), you might encounter "JavaScript heap out of memory" errors.
    
    ```cmd
    npm run make
    ```

### Step 4: Locate your Installer

Once the command finishes successfully, you will find your distributables in the following folder:

```cmd
cd out\make
```

Inside, you will see the generated installer (e.g., a squirrel setup file or `.exe`).

### Troubleshooting

*   **Frontend Build `JavaScript heap out of memory`**: Update `package.json` scripts to increase the poarameter  `--max-old-space-size=`.