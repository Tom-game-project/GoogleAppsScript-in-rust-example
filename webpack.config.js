const path = require('path');
const GasPlugin = require('gas-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  //mode: 'development',
  target: ['web', 'es2020'],
  entry: ['./textencoderdecoder.ts', './main.ts'],
  devtool: false,
  // NOTE: `cache: { type: 'filesystem' }` is intentionally not used: gas-webpack-plugin's
  // GasDependency is not serializable, so webpack would skip caching those modules anyway.
  // Rebuild avoidance is handled by the Makefile's explicit dependencies instead.
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    // dist/index.html (Web UI) and dist/appsscript.json are produced by other make rules.
    clean: {
      keep: /^(index\.html|appsscript\.json)$/,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              compact: false,
            },
          },
          {
            loader: 'ts-loader',
            // Type checking is done once by `tsc --noEmit` (make typecheck / build-pack)
            // in parallel with bundling instead of per-module inside webpack.
            options: { transpileOnly: true },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        exclude: (modulePath) => {
          // node_modules以下なら一旦除外
          if (/node_modules/.test(modulePath)) {
            // ただし、@bytecodealliance/preview2-shim は含める
            if (/node_modules\/@bytecodealliance\/preview2-shim/.test(modulePath)) {
              return false; // exclude しない
            }
            return true; // exclude する
          }
          return false; // exclude しない（自前コードなど）
        },
        use: {
          loader: 'babel-loader',
          options: {
            compact: false,
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new GasPlugin(),
    new webpack.NormalModuleReplacementPlugin(/^wasi:/, (resource) => {
      resource.request = path.resolve(__dirname, 'js/wasi_stub.ts');
    }),
  ],
};
