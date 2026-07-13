# Backend test mode: `FAKE_AI_PROVIDERS`

This document specifies a **backend** change (repo: `ARTPARK-SAHAI-ORG/calibrate-backend`,
local clone `pense-backend`) that lets CI and local E2E exercise the full run →
results pipeline **without any real LLM/STT/TTS API calls, keys, or cost**.

It is the contract the frontend E2E specs in `e2e/runs.auth.spec.ts` depend on.
Those specs are **gated off** (`test.skip` unless `E2E_FAKE_AI=1`) until this
lands, so they are inert in CI today.

---

## Why this shape

The backend never calls OpenAI/Deepgram/etc. directly. Every AI operation — LLM
test runs, the evaluator judge, benchmarks, STT, TTS, and both simulation modes —
is delegated to one external CLI binary (`calibrate-agent`) via `subprocess`,
and **every call site funnels through a single function**:

```python
# src/utils.py:53-55
def get_calibrate_agent_cli() -> str:
    """Executable for the eval engine (PyPI package ``calibrate-agent``)."""
    return "calibrate-agent"
```

Each worker builds its command as `[get_calibrate_agent_cli(), <subcommand>, ...]`,
launches it with `subprocess.Popen(...)`, polls `process.poll()` on a ~2s loop,
then reads output files out of the `-o <output_dir>` directory. So a **single
injection point** covers everything: when the flag is on, return the path to a
deterministic fake CLI that writes the canned output files and exits 0.

**Production is untouched when the flag is unset. No worker/router code changes.**

---

## Change 1 — flip the seam behind a flag

```python
# src/utils.py
import os, sys  # sys already imported elsewhere; os is present

def get_calibrate_agent_cli() -> str:
    """Executable for the eval engine (PyPI package ``calibrate-agent``).

    In test mode (FAKE_AI_PROVIDERS=1) return a deterministic local fake that
    writes canned output files instead of calling real AI providers.
    """
    if env_bool("FAKE_AI_PROVIDERS", False):
        return _fake_calibrate_agent_path()
    return "calibrate-agent"
```

`env_bool` already exists (`src/utils.py:34-39`, parses `1/true/yes/y/on`).

`_fake_calibrate_agent_path()` returns an absolute path to the fake script
(shipped in the repo, e.g. `src/testing/fake_calibrate_agent.py`) and ensures it
is invoked with the current interpreter. Two options:

- Return `f"{sys.executable} {script}"`? No — call sites do `Popen([cli, sub, ...])`
  (list form, `cli` is `argv[0]`). So the fake must be **directly executable**:
  make `fake_calibrate_agent.py` `chmod +x` with a `#!/usr/bin/env python3`
  shebang and return its absolute path. (Confirm every call site uses the list
  form with `cli` as a single element — they do per the map; if any use
  `shell=True` string form, adjust.)

Prefer keeping the fake in-repo and version-controlled so its output contract
evolves with the readers.

---

## Change 2 — the fake CLI

`src/testing/fake_calibrate_agent.py` — a standalone script (no backend imports)
that: parses `sys.argv` for the **subcommand** (`argv[1]`) and the `-o`/`-c`/`-p`/
`-l`/`-i`/`-m`/`--type`/`--dataset`/`--eval-only` flags, **writes the output files
each worker reads**, then `sys.exit(0)`. It must write files **before** exiting
(workers only read after `poll()` returns non-None).

All `-o` paths are **absolute**. Parse args leniently (argparse with
`parse_known_args`, or a hand rolled scan) — real calibrate accepts many flags;
the fake only needs the few below.

### Canned constants (the frontend asserts these — keep them stable)

```python
FAKE_RESPONSE   = "Simulated agent reply."
FAKE_REASONING  = "Simulated judge reasoning: criteria satisfied."
FAKE_LATENCY_MS = 100
FAKE_COST       = 0.001
FAKE_TOKENS     = 42
FAKE_WER        = 0.0
FAKE_TTFB       = 0.5
# Every evaluator verdict is a PASS; every rating is scale_max.
```

### Per-subcommand output contract

Read the backend's own test doubles for the exact shapes — they already encode
this: `tests/test_run_tasks.py` (`_make_stt_output_dir`, `_make_tts_output_dir`,
`_write_conversation_llm_output`) and `tests/test_routers_agent_tests.py:1095-1120`.

#### `llm` — test run AND benchmark (`run_llm_test_task`, `run_benchmark_task`)

Args: `llm -c <input/test_config.json> [-m <model>...] [-p <provider>] -o <output> [--skip-verify] [--eval-only --dataset <ds>]`.

1. Read `-c` config JSON. It has `test_cases: [{id, name, evaluation:{criteria:[{name}], tool_calls?}}]`
   and `evaluators: [{name, uuid?}]` (also `params.model`). Determine the list of
   **models**: each `-m` value; if none given (agent-connection mode), use a
   single folder named `default`.
2. For **each model**, create `<output>/<safe_model>/` where `<safe_model>` is the
   model string with `/`→`__` and `:`→`_` (matches `_match_model_to_folder`). Write:
   - `results.json` — a JSON **list**, one object per test case:
     ```json
     [{
       "test_case_id": "<test_case.id>",
       "test_case": <the test_case object echoed back>,
       "output": {"response": "Simulated agent reply.", "tool_calls": [], "cost": 0.001},
       "metrics": {
         "passed": true,
         "reasoning": "Simulated judge reasoning: criteria satisfied.",
         "judge_results": {
           "<evaluator_name>": {"reasoning": "Simulated judge reasoning: criteria satisfied.", "match": true}
         }
       },
       "latency_ms": 100
     }]
     ```
     For a **rating** evaluator use `{"reasoning": ..., "score": <scale_max>}` instead
     of `{"match": true}`. For **tool-call** tests, put the expected calls in
     `output.tool_calls` and keep `passed: true`.
   - `metrics.json` — a JSON **dict**:
     ```json
     {"total": <n_tests>, "passed": <n_tests>, "latency_ms": 100, "cost": 0.001,
      "total_tokens": 42,
      "criteria": {
        "<evaluator_name>": {"type": "binary", "evaluator_id": "<uuid>",
                             "passed": <n_tests>, "total": <n_tests>, "pass_rate": 1.0}
      }}
     ```
     `criteria` is **required for benchmark** (consumed by `_build_evaluator_summary`);
     a single-model run ignores it but it's harmless. For a rating evaluator use
     `{"type": "rating", "evaluator_id": ..., "mean": <scale_max>, "min": <scale_max>,
     "max": <scale_max>, "count": <n>, "scale_min": <min>, "scale_max": <max>}`.
3. For **benchmark** (more than one `-m`), also write `<output>/leaderboard/leaderboard.csv`
   with a header row and one row per model. Required column: `model` (in
   `<safe_model>` form — the reader normalizes it back). Include a pass-rate column
   and per-evaluator columns, e.g.:
   ```csv
   model,test_pass_rate,<evaluator_name>
   openai__gpt-5.4-mini,1.0,1.0
   ```
   (`_read_leaderboard_csv` passes non-`model` columns through as-is; exact naming
   here is the one spot most likely to need a tweak once the real calibrate
   leaderboard CSV header is confirmed — see "Verification".)
4. Write `<output>/config.json` with `{"evaluators_map": {"<uuid>": "<evaluator_name>"}}`
   for every evaluator that carried a uuid in the input config (round-trips UUIDs
   so STT/TTS evaluator_runs attach; harmless for llm).

Missing `results.json` AND `metrics.json` → job FAILED. Non-zero exit → FAILED.

#### `stt` (`run_evaluation_task`)

Args: `stt -p <prov...> -l <lang> -i <input_dir> -o <output> [--config <cfg>] [--eval-only --dataset <ds>]`.
For **each** provider in `-p`, write `<output>/<provider>_results/`:
- `results.csv` — header `id,gt,pred`, one row per input utterance (read the input
  `<input_dir>/stt.csv` `id,text` to know the ids; each row `id,<text>,<text>`).
- `metrics.json` — `{"wer": 0.0}`. To surface evaluator scores, add aggregate
  entries keyed by evaluator name whose value is a dict with a `"type"` key, e.g.
  `{"wer": 0.0, "<evaluator_name>": {"type": "binary", "mean": 1.0, "scale_min": 0, "scale_max": 1}}`.
Also write `<output>/config.json` `evaluators_map` (as above). Optional empty
`<output>/leaderboard/` dir is tolerated.

#### `tts` (`run_tts_evaluation_task`)

Args: `tts -p <prov...> -l <lang> -i <input.csv> -o <output> [--config <cfg>]`.
`-i` is a **file** (`id,text`). For each provider write `<output>/<provider>_results/`:
- `results.csv` — header `id,text,audio_path`. Set `audio_path` to any path (the
  worker rewrites it to an S3 key if it matches a walked `.wav`; a non-matching
  path is left as-is, which is fine for E2E).
- `metrics.json` — `{"ttfb": 0.5}` (+ optional evaluator aggregates as for STT).
Plus `<output>/config.json` and optional empty `<output>/leaderboard/`.

#### `simulations` (`_run_calibrate_text_simulation` / voice)

Args: `simulations --type text|voice -c <input/simulation_config.json> -o <output> [-m <model>] [--skip-verify] [--eval-only --dataset <ds>]`.
Read `-c` config: `personas: [...]`, `scenarios: [...]`. For each
`(persona_i, scenario_j)` pair (1-based), create
`<output>/simulation_persona_<i>_scenario_<j>/`:
- `transcript.json` — `[{"role":"user","content":"Simulated user turn."},{"role":"assistant","content":"Simulated agent reply."}]`
- `evaluation_results.csv` — header `evaluator_id,name,type,value,reasoning`, one
  row per evaluator: `<uuid>,<name>,binary,Pass,Simulated judge reasoning...` (for
  rating use `type=rating,value=<scale_max>`). **Presence of this file marks the
  case complete.**
- `config.json` — `{"persona": <persona_obj>, "scenario": <scenario_obj>}`.
Optionally `<output>/metrics.json` (top-level run metrics dict).

#### annotation eval-only (`annotation_eval_runner`)

Same `--eval-only` invocations; writes **flat** run-root files: `<output>/results.csv`
(`id,gt,pred,<evaluator>,<evaluator>_reasoning`), `<output>/metrics.json`, and
`<output>/config.json` `evaluators_map`.

### Optional: short-circuit the provider health probe

`src/provider_status.py:~160` execs the CLI for a version/health check. Under the
flag, return a static "healthy" for all providers so the UI's status pills don't
depend on the fake implementing a `--version` path. (Non-blocking — do it if easy.)

---

## Change 3 — make it self-configuring for CI

The CI job (frontend repo, `.github/workflows/tests.yml`) will add
`FAKE_AI_PROVIDERS: "1"` to the backend-boot step's env. With the flag set the
fake replaces the real `calibrate-agent`, so **the `uv`-installed `calibrate-agent`
package is never invoked** and no provider keys are needed. Nothing else in the
CI backend boot changes.

---

## Tests (backend repo)

- The existing suite must stay green (the change is inert when the flag is unset).
- Add a focused test that sets `FAKE_AI_PROVIDERS=1`, runs one `run_llm_test_task`
  end-to-end **without** patching `subprocess`, and asserts the job reaches
  `completed` with `passed == total`. This proves the fake CLI + seam wire up.

---

## Verification (done later, jointly)

Once merged, boot a backend instance with `FAKE_AI_PROVIDERS=1` on a spare port and
run the frontend specs with `E2E_FAKE_AI=1` against it. The **benchmark leaderboard
CSV header** (Change 2 §3) is the one shape derived from reader behavior rather than
a captured real output — if the leaderboard table renders empty, adjust the CSV
columns to match what `calibrate-agent`'s real `leaderboard/*.csv` emits (capture one
real run's file once and mirror it). Everything else is verified against the
backend's own test doubles.
