/**
 * app.json plus what a self-hosted (GitHub Actions + Gradle) release needs:
 * - the Android versionCode from SACPOS_VERSION_CODE (rises with every build, so phones see the update)
 * - signing with the shop's own key (plugins/withReleaseSigning.js)
 */
module.exports = ({ config }) => {
  const code = Number.parseInt(process.env.SACPOS_VERSION_CODE || '', 10);
  return {
    ...config,
    version: process.env.SACPOS_VERSION_NAME || config.version,
    android: {
      ...config.android,
      ...(Number.isInteger(code) && code > 0 ? { versionCode: code } : {}),
    },
    plugins: [...(config.plugins || []), './plugins/withReleaseSigning'],
  };
};
