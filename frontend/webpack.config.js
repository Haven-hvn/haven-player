const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

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
    devtool: isProduction ? 'source-map' : 'eval-source-map',
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
  },
  // Renderer process configuration
  {
    mode: isProduction ? 'production' : 'development',
    entry: './src/index.tsx',
    target: 'electron-renderer',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
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
      filename: 'renderer.js',
      path: path.resolve(__dirname, 'dist'),
      // Enable chunking for code splitting
      chunkFilename: '[name].[contenthash].js',
    },
    optimization: {
      // Enable code splitting
      splitChunks: {
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
              const match = module.context.match(
                /[\\/]node_modules[\\/](.*?)([\\/]|$)/
              );
              if (!match) return 'vendor.misc';
              const packageName = match[1];
              return `vendor.${packageName.replace('@', '')}`;
            },
            priority: 10,
            chunks: 'all',
            // Limit the number of vendor chunks
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
      },
      // Minimize in production
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
      // Keep runtime chunk separate for better caching
      runtimeChunk: 'single',
      // Module IDs for better caching
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
        global: 'window',
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      }),
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser.js',
      }),
      // Fix process/browser resolution for ESM modules
      new webpack.NormalModuleReplacementPlugin(
        /^process\/browser$/,
        require.resolve('process/browser.js')
      ),
      // Bundle analysis (run with ANALYZE=true)
      shouldAnalyze && BundleAnalyzerPlugin && new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'bundle-report.html',
        openAnalyzer: true,
      }),
      // Gzip compression for production
      isProduction && CompressionPlugin && new CompressionPlugin({
        algorithm: 'gzip',
        test: /\.(js|css|html|svg)$/,
        threshold: 10240,
        minRatio: 0.8,
      }),
    ].filter(Boolean),
    // Performance hints
    performance: {
      hints: isProduction ? 'warning' : false,
      maxEntrypointSize: 512000,
      maxAssetSize: 512000,
    },
  },
];
