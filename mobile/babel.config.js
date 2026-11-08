module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'].filter((plugin) => {
      try {
        require.resolve(plugin);
        return true;
      } catch {
        return false;
      }
    }),
  };
};
