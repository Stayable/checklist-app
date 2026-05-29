import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const datetimeRestrictedSyntax = [
  {
    selector: "CallExpression[callee.property.name='toLocaleString']",
    message:
      "Use formatInET / formatDateInET from lib/datetime.ts instead of toLocaleString — all user-facing datetimes must render in America/New_York (ADR-013).",
  },
  {
    selector: "CallExpression[callee.property.name='toLocaleDateString']",
    message:
      "Use formatDateInET from lib/datetime.ts instead of toLocaleDateString (ADR-013).",
  },
  {
    selector: "CallExpression[callee.property.name='toLocaleTimeString']",
    message:
      "Use formatInET from lib/datetime.ts instead of toLocaleTimeString (ADR-013).",
  },
  {
    selector:
      "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
    message:
      "Use formatInET / formatDateInET from lib/datetime.ts instead of Intl.DateTimeFormat (ADR-013).",
  },
];

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "prisma/migrations/**",
    ],
  },
  {
    rules: {
      "no-restricted-syntax": ["error", ...datetimeRestrictedSyntax],
    },
  },
  {
    files: ["lib/datetime.ts", "lib/datetime.test.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];

export default eslintConfig;
