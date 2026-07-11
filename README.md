# Calibrate Frontend

[![component coverage][component-badge]][codecov] [![e2e coverage][e2e-badge]][codecov] [![CC BY-SA 4.0][cc-by-sa-shield]][cc-by-sa]

Frontend for [Calibrate](https://calibrate.artpark.ai), a framework for evaluating AI agents which let you move from slow, manual testing to a fast, automated, and repeatable testing process for your entire agent stack.

## Prerequisites

- Node.js 18+
- npm

## Setup

### Install dependencies

```bash
npm install
```

### Configure environment variables

Copy `env.example` to `.env.local` and fill in the values:

```bash
cp env.example .env.local
```

## Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build for Production

```bash
npm run build
npm start
```

## Testing

Coverage is measured in two independent layers, reported separately on Codecov
(the `component` and `e2e` flags / badges above):

- **Component / interaction tests** — Jest (jsdom) + React Testing Library, in
  `src/**/__tests__/`. Fast, no backend.
- **End-to-end tests** — Playwright, in `e2e/`. Split into `public` (no backend)
  and `authenticated` (`*.auth.spec.ts`, needs the
  [backend][calibrate-backend] on `:8000`). See [e2e/README.md](e2e/README.md).

```bash
npm test                               # component tests (Jest)
npm run test:coverage                  # component coverage -> coverage/component/
npm run test:e2e                       # public E2E (Playwright, no backend)
npm run test:e2e:integration           # authenticated E2E (needs backend)
npm run test:e2e:coverage              # public E2E coverage -> coverage/e2e/
npm run coverage                       # component + public E2E coverage
```

## Self-hosting

To deploy your own instance of Calibrate's frontend, see [SELF_HOSTING.md](SELF_HOSTING.md).

## Contributing

Calibrate also includes a [backend][calibrate-backend] and [CLI][calibrate-cli].

Reference docs:

- [Architecture diagram](https://docs.google.com/presentation/d/e/2PACX-1vQMXtGLWFnT6pGuYLS-P8GU6iHVVRFHYksgntIpcs-OzNp9DrPdq7ra38eYrCBxe8Y--6ZhK8Z-fyD8/pub?start=false&loop=false&delayms=3000)

## License

This work is licensed under a
[Creative Commons Attribution-ShareAlike 4.0 International License][cc-by-sa].

[![CC BY-SA 4.0][cc-by-sa-image]][cc-by-sa]

[calibrate-backend]: https://github.com/ARTPARK-SAHAI-ORG/calibrate-backend
[calibrate-cli]: https://github.com/ARTPARK-SAHAI-ORG/calibrate
[cc-by-sa]: http://creativecommons.org/licenses/by-sa/4.0/
[cc-by-sa-image]: https://licensebuttons.net/l/by-sa/4.0/88x31.png
[cc-by-sa-shield]: https://img.shields.io/badge/License-CC%20BY--SA%204.0-lightgrey.svg
[codecov]: https://codecov.io/gh/ARTPARK-SAHAI-ORG/calibrate-frontend
[component-badge]: https://img.shields.io/codecov/c/github/ARTPARK-SAHAI-ORG/calibrate-frontend/main?flag=component&label=component%20coverage&logo=codecov
[e2e-badge]: https://img.shields.io/codecov/c/github/ARTPARK-SAHAI-ORG/calibrate-frontend/main?flag=e2e&label=e2e%20coverage&logo=codecov
