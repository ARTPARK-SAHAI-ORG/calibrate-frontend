#!/usr/bin/env bash
#
# Run the authenticated Playwright E2E suite against an isolated calibrate-backend
# booted in FAKE_AI_PROVIDERS mode.
#
# Ordering guarantee (this is the whole point of the script): the backend is
# ALWAYS started first and polled until healthy BEFORE any test/dev-server
# ("the agents") is started, and it is torn down on exit. Tests never run
# without a backend, and the backend never leaks past the run.
#
# Why a *separate* backend: FAKE_AI_PROVIDERS=1 makes the backend return
# deterministic canned AI results (no real keys/cost), which the run-gated
# specs (e2e/runs.auth.spec.ts, gated on E2E_FAKE_AI=1) need. It runs on its
# own port with its own throwaway SQLite DB so it never touches a real backend
# you may have on :8000.
#
# Usage:
#   scripts/e2e-fake-backend.sh                       # runs `npm run test:e2e:integration`
#   scripts/e2e-fake-backend.sh npm run test:e2e:integration:coverage
#   CALIBRATE_BACKEND_DIR=/path/to/calibrate-backend scripts/e2e-fake-backend.sh
#
# Env overrides:
#   CALIBRATE_BACKEND_DIR  path to the calibrate-backend checkout (auto-detected if unset)
#   FAKE_BACKEND_PORT      backend port (default: a random free port far from :8000)
#   E2E_PORT               Playwright dev-server port (default 3100; must match CORS)
#
set -euo pipefail

DEV_PORT="${E2E_PORT:-3100}"

# --- Pick the backend port ----------------------------------------------------
# Default to a RANDOM free port in the 20000–59999 range — deliberately far from
# :8000 (and its neighbours), where unrelated services often live, so a stray
# process never collides with (or gets mistaken for) this throwaway backend.
port_is_free() { ! lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
pick_free_port() {
  for _ in $(seq 1 50); do
    local p=$(( (RANDOM % 40000) + 20000 ))
    port_is_free "$p" && { echo "$p"; return; }
  done
  echo "ERROR: could not find a free port after 50 tries." >&2; exit 1
}
if [[ -n "${FAKE_BACKEND_PORT:-}" ]]; then
  PORT="${FAKE_BACKEND_PORT}"
else
  PORT="$(pick_free_port)"
fi

# --- Locate the backend checkout ---------------------------------------------
find_backend() {
  if [[ -n "${CALIBRATE_BACKEND_DIR:-}" ]]; then echo "${CALIBRATE_BACKEND_DIR}"; return; fi
  for c in \
    "${HOME}/Documents/repos/artpark/pense-backend" \
    "${HOME}/Documents/repos/artpark/calibrate-backend" \
    "$(pwd)/../calibrate-backend" \
    "$(pwd)/../pense-backend"; do
    [[ -f "${c}/src/main.py" ]] && { echo "${c}"; return; }
  done
  echo ""
}
BACKEND_DIR="$(find_backend)"
if [[ -z "${BACKEND_DIR}" || ! -f "${BACKEND_DIR}/src/main.py" ]]; then
  echo "ERROR: calibrate-backend not found. Set CALIBRATE_BACKEND_DIR to its path." >&2
  echo "       Clone: https://github.com/ARTPARK-SAHAI-ORG/calibrate-backend" >&2
  exit 1
fi

command -v uv >/dev/null 2>&1 || { echo "ERROR: 'uv' is required to run the backend." >&2; exit 1; }

# --- Boot the backend FIRST ---------------------------------------------------
DB_DIR="$(mktemp -d)"
echo "==> Starting FAKE_AI backend on :${PORT}"
echo "    dir=${BACKEND_DIR}  db=${DB_DIR}"
(
  cd "${BACKEND_DIR}/src"
  FAKE_AI_PROVIDERS=1 \
  CORS_ALLOWED_ORIGINS="http://localhost:${DEV_PORT}" \
  DB_ROOT_DIR="${DB_DIR}" \
  JWT_SECRET_KEY="${JWT_SECRET_KEY:-e2e-fake-secret}" \
  uv run uvicorn main:app --port "${PORT}"
) &
BACKEND_PID=$!

cleanup() {
  echo "==> Stopping FAKE_AI backend (pid ${BACKEND_PID})"
  kill "${BACKEND_PID}" 2>/dev/null || true
  wait "${BACKEND_PID}" 2>/dev/null || true
  rm -rf "${DB_DIR}"
}
trap cleanup EXIT

# --- Wait until healthy BEFORE starting any test ------------------------------
HEALTH_TIMEOUT="${FAKE_BACKEND_HEALTH_TIMEOUT:-90}"
echo "==> Waiting for backend health on :${PORT} (up to ${HEALTH_TIMEOUT}s) ..."
for i in $(seq 1 "${HEALTH_TIMEOUT}"); do
  if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
    echo "ERROR: backend exited before becoming healthy." >&2; exit 1
  fi
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${PORT}/" 2>/dev/null || echo 000)"
  if [[ "${code}" == "200" ]]; then echo "    backend healthy (HTTP 200)"; break; fi
  if [[ "${i}" -eq "${HEALTH_TIMEOUT}" ]]; then
    echo "ERROR: backend not healthy after ${HEALTH_TIMEOUT}s." >&2; exit 1
  fi
  sleep 1
done

# --- Only now start the E2E run -----------------------------------------------
export E2E_FAKE_AI=1
export NEXT_PUBLIC_BACKEND_URL="http://localhost:${PORT}"
echo "==> Running E2E against ${NEXT_PUBLIC_BACKEND_URL} (E2E_FAKE_AI=1)"

if [[ "$#" -gt 0 ]]; then
  "$@"
else
  # Default: run the authenticated specs against this backend. (Use the raw
  # target, NOT test:e2e:integration — that one calls this script and would
  # recurse.)
  npm run test:e2e:authenticated
fi
