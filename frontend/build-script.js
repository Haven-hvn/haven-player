const webpack = require('webpack');
const config = require('./webpack.config.js');
const chalk = require('chalk'); // Assuming chalk is installed, if not remove the .chalk usage

console.log('Starting production build...');

// Force environment variable
process.env.NODE_ENV = 'production';

webpack(config, (err, stats) => {
  if (err || stats.hasErrors()) {
    console.error(err || stats.toString({
      colors: true,
      errors: true,
      errorDetails: true,
      modules: false,
      chunks: false,
    }));
    process.exit(1);
  }

  console.log(stats.toString({
    colors: true,
    chunks: false, // Makes the output much less verbose
    modules: false,
  }));
  
  console.log('\nBuild completed successfully!');
});