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
[component-badge]: https://codecov.io/gh/ARTPARK-SAHAI-ORG/calibrate-frontend/branch/main/graph/badge.svg?flag=component
[e2e-badge]: https://codecov.io/gh/ARTPARK-SAHAI-ORG/calibrate-frontend/branch/main/graph/badge.svg?flag=e2e
