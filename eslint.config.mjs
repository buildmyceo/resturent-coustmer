import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      "import/no-anonymous-default-export": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "off",
      "@next/next/no-location-assign-relative-destination": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "supabase/**", "scripts/**"],
  },
];

export default config;
