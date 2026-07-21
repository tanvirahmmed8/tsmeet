import nextVitals from 'eslint-config-next/core-web-vitals';

const config = [
  ...nextVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      '@next/next/no-assign-module-variable': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
  { ignores: ['.next/**', 'coverage/**', 'server/storage/**'] },
];

export default config;
