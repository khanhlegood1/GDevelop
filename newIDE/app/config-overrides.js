// This file customizes webpack configuration for react-app-rewired.
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');

module.exports = {
  webpack: function override(config, env) {
    // Keep remote previews usable on memory-constrained development machines.
    // Opt in only: normal development and production builds stay unchanged.
    if (env === 'development' && process.env.GD_LOW_MEMORY_PREVIEW === 'true') {
      config.devtool = false;
      config.cache = false;
    }

    config.module.rules.push({
      test: /\.worker\.js$/,
      use: {
        loader: 'worker-loader',
        options: {
          filename: '[name].[contenthash].worker.js',
        },
      },
    });

    // A lot of packages we use in node_modules trigger source map warnings
    // but it is not a blocking issue, so we ignore them.
    config.ignoreWarnings = [/Failed to parse source map/];

    config.resolve.plugins = config.resolve.plugins.filter(
      (plugin) => !(plugin instanceof ModuleScopePlugin)
    );

    return config;
  },

  // Remote previews must serve the engine on the editor origin, not on a
  // localhost port in the visitor's browser. Keep normal development unchanged.
  devServer: function(configFunction) {
    return function(proxy, allowedHost) {
      const config = configFunction(proxy, allowedHost);
      if (process.env.GD_REMOTE_PREVIEW === 'true') {
        config.allowedHosts = ['localhost', '.e2b.app'];
        config.static = [
          ...(Array.isArray(config.static) ? config.static : [config.static]).filter(Boolean),
          {
            directory: require('path').resolve(__dirname, 'resources/GDJS'),
            publicPath: '/GDJS',
            watch: false,
          },
        ];
        config.client = {
          ...config.client,
          webSocketURL: { protocol: 'wss', port: 443 },
          // Optional upstream services may be unreachable in a sandbox. Let
          // the app display its own network errors instead of blocking all UI.
          overlay: { errors: true, warnings: false, runtimeErrors: false },
        };
      }
      return config;
    };
  },

  jest: function(config) {
    config.transformIgnorePatterns = [
      '<rootDir>/node_modules/(?!react-markdown|vfile|unist-.*|unified|bail|trough|character-entities|remark-parse|mdast-util-.*|micromark|decode-named-character-reference|remark-rehype|property-information|hast-util-.*|space-separated-tokens|comma-separated-tokens|ccount|escape-string-regexp|trim-lines|hast-util-whitespace|remark-gfm|mdast-util-gfm|mdast-util-find-and-replace|mdast-util-to-markdown|markdown-table|is-plain-obj)',
    ];

    return config;
  },
};
