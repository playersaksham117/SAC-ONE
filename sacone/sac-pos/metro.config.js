// Expo's Metro config, plus: the app's own files get Text / TextInput in CAPITALS
// (src/ui/caps). Libraries and the caps files themselves get the real react-native.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const appDir = path.resolve(__dirname, 'src') + path.sep;
const capsDir = path.resolve(__dirname, 'src', 'ui', 'caps') + path.sep;
const shim = path.resolve(capsDir, 'react-native.js');
// Web builds rewrite `import { Text } from 'react-native'` to react-native-web's own modules.
const WEB_TEXT = /^react-native-web\/dist\/(?:cjs\/)?exports\/(Text|TextInput)(?:\/index(?:\.js)?)?$/;
const webShim = { Text: path.resolve(capsDir, 'web-text.js'), TextInput: path.resolve(capsDir, 'web-text-input.js') };

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const from = context.originModulePath || '';
  const appFile = from.startsWith(appDir) && !from.startsWith(capsDir);
  if (moduleName === 'react-native' && appFile) {
    return { type: 'sourceFile', filePath: shim };
  }
  const web = appFile && WEB_TEXT.exec(moduleName);
  if (web) return { type: 'sourceFile', filePath: webShim[web[1]] };
  return (upstream || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
