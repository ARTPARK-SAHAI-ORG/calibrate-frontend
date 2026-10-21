// Rules that send code to the shared helper instead of a hand-written copy.
// Kept apart from eslint.config.mjs because the full lint already fails on
// hundreds of older errors, and these have to be able to block a commit.
// Places that broke a rule before it existed are listed in
// eslint-reuse-suppressions.json; only new ones fail.
// Run with `npm run lint:reuse`.
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const message = {
  title:
    "Use Tooltip from src/components/Tooltip.tsx for hover text, not the browser's title attribute.",
  routerPush:
    "Use Link from @/lib/nav so the page can be opened in a new tab, not router.push or router.replace in onClick.",
  fetch:
    "Use apiClient from src/lib/api.ts for backend requests, not a hand-written fetch.",
  useSession:
    "Use useAuth or useAccessToken from src/hooks/useAccessToken.ts. useSession only covers Google sign-in.",
  console: "Use reportError from src/lib/reportError.ts.",
};

const restrictedSyntax = [
  "error",
  {
    // A lowercase tag is a browser element. An iframe's title is what a
    // screen reader announces, not hover text, so it stays.
    selector:
      "JSXOpeningElement[name.name=/^[a-z]/][name.name!='iframe'] > JSXAttribute[name.name='title']",
    message: message.title,
  },
  {
    selector:
      "JSXAttribute[name.name='onClick'] CallExpression[callee.object.name='router'][callee.property.name=/^(push|replace)$/]",
    message: message.routerPush,
  },
];

// fetch has rules of its own, so the counts of old breaks in
// eslint-reuse-suppressions.json cannot let a new fetch stand in for an old
// title, or the other way round.
const fetchRules = {
  "no-restricted-globals": ["error", { name: "fetch", message: message.fetch }],
  "no-restricted-properties": [
    "error",
    ...["window", "globalThis", "self"].map((object) => ({
      object,
      property: "fetch",
      message: message.fetch,
    })),
  ],
};

export default [
  // Only the parser and plugins from Next's config, none of its rules. The
  // plugins are kept so existing disable comments naming their rules resolve.
  ...[...nextVitals, ...nextTs].map(({ rules: _rules, ...setup }) => setup),
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["**/__tests__/**", "**/*.test.*", "**/*.spec.*"],
    rules: {
      "no-restricted-syntax": restrictedSyntax,
      ...fetchRules,
      "no-console": ["error"],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next-auth/react",
              importNames: ["useSession"],
              message: message.useSession,
            },
          ],
        },
      ],
    },
  },
  // The helpers themselves.
  { files: ["src/lib/reportError.ts"], rules: { "no-console": "off" } },
  {
    files: ["src/hooks/useAccessToken.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    files: ["src/lib/api.ts"],
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },
];
