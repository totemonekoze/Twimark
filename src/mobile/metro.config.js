// 一覧の画面と拡張が使う ../shared（store.js、meta.js、view.js）を、写さずにそのまま束ねる
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../shared')];
module.exports = config;
