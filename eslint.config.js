import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    rules: { 'no-undef': 'error', 'no-unused-vars': 'warn' },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window:true, document:true, localStorage:true, sessionStorage:true,
        history:true, setTimeout:true, clearInterval:true, setInterval:true,
        console:true, fetch:true, URL:true, URLSearchParams:true,
        Blob:true, FileReader:true, navigator:true,
        // vitest globals
        describe:true, it:true, expect:true, beforeEach:true, afterEach:true, vi:true,
      }
    }
  }
];
