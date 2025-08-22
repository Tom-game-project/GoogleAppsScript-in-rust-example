const path = require('path');
const GasPlugin = require('gas-webpack-plugin');

module.exports = {
  mode: 'development',
  entry: './main.ts',
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
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.js$/,
        exclude: /node_modules\/(?!@bytecodealliance\/preview2-shim)/,
        //include: [
	//	path.resolve(__dirname, 'target/jco'),
	//	path.resolve(__dirname, 'node_modules/@bytecodealliance/preview2-shim')
        //],
        use: {
          loader: "babel-loader",
	  options: {
            compact: false
	  }
        }
      }
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  plugins: [
    new GasPlugin(),
  ],
};

