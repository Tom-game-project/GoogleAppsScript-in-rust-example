const path = require('path');
const GasPlugin = require('gas-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  //mode: 'development',
  target: ['web', 'es2020'],
  entry: ['./textencoderdecoder.ts', './main.ts'],
  devtool: false,
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
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
          'ts-loader',
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
