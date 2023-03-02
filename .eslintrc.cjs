module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: 'airbnb-base',
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'no-await-in-loop': 'off',
    'no-restricted-syntax': 'off',
    'import/extensions': 'off',
    'no-use-before-define': 'off',
    'no-shadow': 'off'
  },
};
