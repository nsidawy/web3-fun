const path = require('path');

module.exports = {
  entry: './test/index.js',
  mode: 'development',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'test', 'dist'),
  },
};
