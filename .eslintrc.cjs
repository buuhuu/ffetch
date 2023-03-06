module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: '@adobe/helix',
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-await-in-loop': 'off',
    'no-shadow': 'off'
  },
};
