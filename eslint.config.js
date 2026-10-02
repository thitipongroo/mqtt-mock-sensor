const js = require('@eslint/js');
const prettierPlugin = require('eslint-plugin-prettier/recommended');
const globals = require('globals');

module.exports = [
    js.configs.recommended,
    prettierPlugin,
    {
        languageOptions: {
            ecmaVersion: 2021,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.jest
            }
        },
        rules: {
            'no-console': 'off'
        }
    }
];
