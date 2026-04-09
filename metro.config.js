const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prevent Metro from resolving the ESM "import" condition on packages like
// zustand v5, which ship .mjs files containing import.meta syntax. Metro
// doesn't support import.meta, so we force the react-native/CJS path instead.
config.resolver.unstable_conditionNames = ['react-native', 'require', 'default'];

module.exports = config;
