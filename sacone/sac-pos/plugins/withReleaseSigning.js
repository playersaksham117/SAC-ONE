/**
 * Release signing without Expo's build service: GitHub Actions builds the APK with Gradle and signs
 * it with the shop's own key, given through environment variables (never stored in the repo):
 *
 *   SACPOS_KEYSTORE           path to the keystore file (PKCS12 / JKS)
 *   SACPOS_KEYSTORE_PASSWORD  keystore password
 *   SACPOS_KEY_ALIAS          key alias
 *   SACPOS_KEY_PASSWORD       key password (defaults to the keystore password)
 *
 * Without them the release build falls back to the debug key (local test builds only).
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv('SACPOS_KEYSTORE')) {
                storeFile file(System.getenv('SACPOS_KEYSTORE'))
                storePassword System.getenv('SACPOS_KEYSTORE_PASSWORD')
                keyAlias System.getenv('SACPOS_KEY_ALIAS')
                keyPassword System.getenv('SACPOS_KEY_PASSWORD') ?: System.getenv('SACPOS_KEYSTORE_PASSWORD')
            }
        }`;

function patch(gradle) {
  if (gradle.includes("System.getenv('SACPOS_KEYSTORE')")) return gradle;
  let out = gradle.replace(/signingConfigs\s*\{/, (m) => `${m}${RELEASE_CONFIG}`);
  // the release build type: our key when given, else the debug key
  out = out.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/, (m, head) =>
    `${head}signingConfig System.getenv('SACPOS_KEYSTORE') ? signingConfigs.release : signingConfigs.debug`);
  if (out === gradle || !out.includes('signingConfigs.release')) {
    throw new Error('withReleaseSigning: android/app/build.gradle did not have the expected signingConfigs / release blocks');
  }
  return out;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = patch(cfg.modResults.contents);
    return cfg;
  });
};
module.exports.patch = patch;
