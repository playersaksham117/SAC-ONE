// Expo's Metro config, plus: the app's own files get Text / TextInput in CAPITALS
// (src/ui/caps). Libraries and the caps files themselves get the real react-native.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const appDir = path.resolve(__dirname, 'src') + path.sep;
const capsDir = path.resolve(__dirname, 'src', 'ui', 'caps') + path.sep;
const shim = path.resolve(capsDir, 'react-native.js');

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const from = context.originModulePath || '';
  if (moduleName === 'react-native' && from.startsWith(appDir) && !from.startsWith(capsDir)) {
    return { type: 'sourceFile', filePath: shim };
  }
  return (upstream || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
