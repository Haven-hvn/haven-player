const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin'); // Required to copy Python files

// Optional plugins - only load if available
let BundleAnalyzerPlugin;
let CompressionPlugin;
try {
  BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
} catch (e) {
  // Plugin not installed
}
try {
  CompressionPlugin = require('compression-webpack-plugin');
} catch (e) {
  // Plugin not installed
}

const isProduction = process.env.NODE_ENV === 'production';
const shouldAnalyze = process.env.ANALYZE === 'true';

module.exports = [
  // Main process configuration
  {
    mode: isProduction ? 'production' : 'development',
    entry: './src/main.ts',
    target: 'electron-main',
    // Use cheap source maps for dev, standard for prod
    devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',
    
    // Enable filesystem caching for massive speed/memory gains in dev
    cache: isProduction ? false : {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename]
      }
    },

    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    ignoreWarnings: [
      /Critical dependency: the request of a dependency is an expression/,
      /require function is used in a way in which dependencies cannot be statically extracted/,
    ],
    output: {
      filename: 'main.js',
      path: path.resolve(__dirname, 'dist'),
    },
    node: {
      __dirname: false,
      __filename: false,
    },
    optimization: {
      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: isProduction,
              drop_debugger: isProduction,
            },
          },
        }),
      ],
    },
    // Copy Python backend files to dist so they can be packaged by electron-builder
    plugins: [new CopyPlugin({
    patterns: [

      {
        from: path.resolve(__dirname, '../backend'),
        to: 'backend',
        // Use a filter function for absolute control over what gets copied
        filter: (resourcePath) => {
          // Get the relative path of the file being copied
          const relativePath = path.relative(path.resolve(__dirname, '../backend'), resourcePath);
          
          // Explicitly block the venv folder
          if (relativePath.includes('venv')) {
            return false;
          }
          // Block cache
          if (relativePath.includes('__pycache__')) {
            return false;
          }
          // Block previous builds
          if (relativePath.includes('dist') || relativePath.includes('build')) {
            return false;
          }
          // Allow everything else (app folder, py files, etc.)
          return true;
        },
      },

    ],
  }),].filter(Boolean),
  },

  // Renderer process configuration
  {
    mode: isProduction ? 'production' : 'development',
    entry: { renderer: './src/index.tsx' },
    target: 'electron-renderer',
    devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',
    
    // Enable filesystem caching
    cache: isProduction ? false : {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename]
      }
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(png|jpe?g|gif|svg)$/i,
          type: 'asset/resource',
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.mjs', '.cjs'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'process/browser': require.resolve('process/browser.js'),
        'pino-pretty': false,
      },
      fallback: {
        "buffer": require.resolve("buffer"),
        "process": require.resolve("process/browser.js"),
        "process/browser": require.resolve("process/browser.js"),
      },
      conditionNames: ['import', 'require', 'default', 'browser', 'module', 'node'],
      mainFields: ['browser', 'module', 'main'],
      fullySpecified: false,
    },
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      chunkFilename: '[name].[contenthash].js',
    },
    optimization: {
      // Only use aggressive splitting in production to save dev memory
      splitChunks: isProduction ? {
        chunks: 'all',
        maxInitialRequests: 25,
        minSize: 20000,
        cacheGroups: {
          // MUI components (large)
          mui: {
            test: /[\\/]node_modules[\\/]@mui[\\/]/,
            name: 'vendor.mui',
            priority: 30,
            chunks: 'all',
          },
          // React ecosystem
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
            name: 'vendor.react',
            priority: 25,
            chunks: 'all',
          },
          // Emotion (CSS-in-JS)
          emotion: {
            test: /[\\/]node_modules[\\/]@emotion[\\/]/,
            name: 'vendor.emotion',
            priority: 20,
            chunks: 'all',
          },
          // Crypto/blockchain libraries
          crypto: {
            test: /[\\/]node_modules[\\/](ethers|@lit-protocol|multiformats|@ipld)[\\/]/,
            name: 'vendor.crypto',
            priority: 20,
            chunks: 'all',
          },
          // OpenTelemetry
          telemetry: {
            test: /[\\/]node_modules[\\/]@opentelemetry[\\/]/,
            name: 'vendor.telemetry',
            priority: 15,
            chunks: 'all',
          },
          // Other vendor chunks
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name(module) {
              const match = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/);
              if (!match) return 'vendor.misc';
              const packageName = match[1];
              return `vendor.${packageName.replace('@', '')}`;
            },
            priority: 10,
            chunks: 'all',
            maxSize: 200000,
          },
          // Common chunks from app code
          common: {
            name: 'common',
            minChunks: 2,
            priority: 5,
            chunks: 'all',
            reuseExistingChunk: true,
          },
        },
      } : false, // Disabled in dev for memory savings

      minimize: isProduction,
      minimizer: [
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: isProduction,
              drop_debugger: isProduction,
              pure_funcs: isProduction ? ['console.log', 'console.debug'] : [],
            },
            mangle: isProduction,
            output: {
              comments: false,
            },
          },
          extractComments: false,
        }),
      ],
      runtimeChunk: 'single',
      moduleIds: 'deterministic',
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './src/index.html',
        filename: 'index.html',
        minify: isProduction ? {
          removeComments: true,
          collapseWhitespace: true,
          removeRedundantAttributes: true,
          useShortDoctype: true,
          removeEmptyAttributes: true,
          removeStyleLinkTypeAttributes: true,
          keepClosingSlash: true,
          minifyJS: true,
          minifyCSS: true,
          minifyURLs: true,
        } : false,
      }),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
        'global': JSON.stringify('window'),
        'globalThis': JSON.stringify('window'),
      }),
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser.js',
        global: 'window',
      }),
      new webpack.BannerPlugin({
        banner: 'if (typeof global === "undefined") { window.global = window; }',
        raw: true,
        entryOnly: true,
      }),
      new webpack.NormalModuleReplacementPlugin(
        /^process\/browser$/,
        require.resolve('process/browser.js')
      ),
      // Bundle analysis
      shouldAnalyze && BundleAnalyzerPlugin && new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'bundle-report.html',
        openAnalyzer: true,
      }),
      // Gzip compression
      isProduction && CompressionPlugin && new CompressionPlugin({
        algorithm: 'gzip',
        test: /\.(js|css|html|svg)$/,
        threshold: 10240,
        minRatio: 0.8,
      }),
    ].filter(Boolean),
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    },
  },
];