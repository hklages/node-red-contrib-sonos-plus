import typescriptEslint from 'typescript-eslint'

export default [
  ...typescriptEslint.configs.recommended,
  {
    files: ['*.js', '*.ts'],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: 'module',
      globals: {
        require: 'readonly',
        module: 'readonly',
        __dirname: 'readonly'
      }
    },
    linterOptions: {
      noInlineConfig: false
    },
    rules: {
      'array-bracket-spacing': ['error', 'never'],
      'block-spacing': 'error',
      'brace-style': ['error', '1tbs'],
      'comma-spacing': ['error', { after: true }],
      'comma-style': ['error', 'last'],
      'eqeqeq': ['error', 'smart'],
      'indent': ['error', 2],
      'func-call-spacing': ['error', 'never'],
      'key-spacing': ['error', { beforeColon: false, afterColon: true }],
      'linebreak-style': ['error', 'windows'],
      'max-len': ['error', { code: 100 }],
      'no-array-constructor': 'error',
      'no-multi-assign': 'error',
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'no-restricted-syntax': ['error', 'SequenceExpression'],
      'no-return-assign': ['error', 'always'],
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-unneeded-ternary': 'error',
      'no-use-before-define': ['error', { functions: false, classes: false }],
      'no-var': 'error',
      'no-whitespace-before-property': 'error',
      'object-curly-spacing': ['error', 'always'],
      'one-var': ['error', 'never'],
      'operator-linebreak': ['error', 'before'],
      'prefer-const': 'error',
      'quotes': ['error', 'single'],
      'semi': ['error', 'never'],
      'space-before-blocks': 'error',
      'space-before-function-paren': ['error', 'always'],
      'space-in-parens': ['error', 'never']
    }
  }
]
