const path = require('path');
const fs = require('fs-extra');

module.exports = {
  packagerConfig: {
    asar: false,
    ignore: [
      // Use simple strings where possible
      "/src/",
      "/webpack.log",
      // Use regex for patterns
      /^\/\.git/,
      /\.map$/,
      // Fix the backend ignore: use a function for absolute control
      function (file) {
        // Ignore the sibling backend folder
        // file.path is the absolute path
        return file.path.includes('backend') && !file.path.includes('haven-backend.exe');
      },
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',  // Using zip for speed
	  platforms: ['darwin','win32'],
    },
  ],
  hooks: {
    packageAfterCopy: async (forgeConfig, buildPath) => {
      console.log('Copying Python backend...');
      const path = require('path');
      const fs = require('fs-extra');
      
      // Source path: Relative to THIS config file (frontend), go up to backend/dist
      const sourceExe = path.join(__dirname, '..', 'backend', 'dist', 'haven-backend.exe');
      
      // Destination path: The ROOT of the app folder inside the package
      // This ensures it lands at resources/app/haven-backend.exe
      const destExe = path.join(buildPath, 'haven-backend.exe');
      
      console.log('Source:', sourceExe);
      console.log('Destination:', destExe);
      
      if (fs.existsSync(sourceExe)) {
        await fs.copy(sourceExe, destExe);
        console.log('Backend copied successfully!');
      } else {
        console.warn('Warning: Python backend exe not found at ' + sourceExe);
      }
    }
}};