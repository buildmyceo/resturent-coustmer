import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      "import/no-anonymous-default-export": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "supabase/**", "scripts/**"],
  },
];

export default config;
