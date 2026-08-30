#!/usr/bin/env python3
"""A stand-in agent for testing run results by hand.

Speaks the Connect agent contract: it is posted
`{"messages": [{"role", "content"}, ...]}` (or `{"input": "..."}` for a single
agent response agent) and answers `{"response": "...", "metrics": {...}}`.

It answers the connection check normally, so the agent verifies. What each test
does after that is decided by the test's own input, so one agent can produce a
run where some tests pass, some are answered wrongly, and some never answer at
all.

Write the behaviour into the test's input:

    SAY: the next vaccination is at 14 weeks   answers with that exact text
    WRONG                                      answers something off-topic
    ERROR                                      returns HTTP 500, no answer
    TIMEOUT                                    never answers, then drops the call
    EMPTY                                      returns 200 with no answer in it
    TOOL: get_schedule {"child_age_weeks": 14} answers with that tool call

Anything else gets a plain answer, which is what makes the connection check pass.

To make every test behave the same way without editing them (for the run that
gives up part way through, which needs a long row of failures), set a mode:

    curl -X POST localhost:8787/mode/error     every call returns HTTP 500
    curl -X POST localhost:8787/mode/timeout   every call hangs
    curl -X POST localhost:8787/mode/ok        back to reading the input

Run it:

    python3 scripts/dummy-agent.py             (listens on 8787)
    python3 scripts/dummy-agent.py 9001        (listens on 9001)

Then create a Connect agent whose URL is http://127.0.0.1:8787/chat and verify
it. The backend calls this from its own process, so keep both on this machine.
"""

import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# What every call does, regardless of the input. "input" means read the input.
MODE = "input"
MODES = ("input", "ok", "error", "timeout")

# How long a TIMEOUT call is held open before the connection is dropped. Long
# enough to look like an agent that has stopped responding, short enough that a
# run is not left waiting on it. Raise it with DUMMY_HANG_SECONDS=600 to watch
# a real request timeout instead.
HANG_SECONDS = int(os.environ.get("DUMMY_HANG_SECONDS", "45"))

PLAIN_ANSWER = "Namaste. Aapki beti ka agla vaccination 14 weeks pe hai."
OFF_TOPIC_ANSWER = "I do not know anything about that. Please call the office."


def last_user_text(body: dict) -> str:
    """The text this call is answering, from either request shape."""
    if isinstance(body.get("input"), str):
        return body["input"]
    messages = body.get("messages")
    if isinstance(messages, list):
        for message in reversed(messages):
            if isinstance(message, dict) and message.get("role") == "user":
                return str(message.get("content") or "")
        if messages and isinstance(messages[-1], dict):
            return str(messages[-1].get("content") or "")
    return ""


def answer_for(text: str) -> tuple[int, dict | None]:
    """The status and body this text asks for. A body of None means hang."""
    upper = text.upper()

    if "ERROR" in upper:
        return 500, {"detail": "Dummy agent was told to fail this one."}
    if "TIMEOUT" in upper:
        return 200, None
    if "EMPTY" in upper:
        return 200, {}

    tool = re.search(r"TOOL:\s*([A-Za-z0-9_.-]+)\s*(\{.*\})?", text, re.DOTALL)
    if tool:
        try:
            arguments = json.loads(tool.group(2)) if tool.group(2) else {}
        except json.JSONDecodeError:
            arguments = {}
        return 200, {
            "response": PLAIN_ANSWER,
            "tool_calls": [{"tool": tool.group(1), "arguments": arguments}],
        }

    say = re.search(r"SAY:\s*(.+)", text, re.DOTALL)
    if say:
        return 200, {"response": say.group(1).strip()}
    if "WRONG" in upper:
        return 200, {"response": OFF_TOPIC_ANSWER}

    return 200, {"response": PLAIN_ANSWER}


def with_metrics(body: dict, started: float) -> dict:
    """Adds the optional metrics block, so the run's cost and latency cards fill in."""
    if "response" not in body:
        return body
    return {
        **body,
        "metrics": {
            "cost": 0.0021,
            "prompt_tokens": 1200,
            "completion_tokens": 340,
            "latency_ms": int((time.monotonic() - started) * 1000),
        },
    }


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))

    def reply(self, status: int, body: dict) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        self.reply(200, {"mode": MODE, "modes": list(MODES)})

    def do_POST(self):
        global MODE
        started = time.monotonic()

        set_mode = re.fullmatch(r"/mode/([a-z]+)", self.path)
        if set_mode:
            wanted = set_mode.group(1)
            if wanted not in MODES:
                self.reply(400, {"detail": f"Unknown mode. Pick one of {list(MODES)}."})
                return
            MODE = wanted
            print(f"[dummy-agent] mode is now {MODE}", flush=True)
            self.reply(200, {"mode": MODE})
            return

        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            body = {}

        text = last_user_text(body)
        if MODE == "error":
            status, reply = 500, {"detail": "Dummy agent is in error mode."}
        elif MODE == "timeout":
            status, reply = 200, None
        elif MODE == "ok":
            status, reply = 200, {"response": PLAIN_ANSWER}
        else:
            status, reply = answer_for(text)

        print(f"[dummy-agent] {status} for {text[:60]!r}", flush=True)

        if reply is None:
            # Hold the connection open and answer nothing, which is what a real
            # agent that has stopped responding looks like, then drop it so the
            # run is not left waiting on this call for ever.
            time.sleep(HANG_SECONDS)
            self.close_connection = True
            return

        self.reply(status, with_metrics(reply, started) if status == 200 else reply)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    print(f"[dummy-agent] listening on http://127.0.0.1:{port}/chat", flush=True)
    print(f"[dummy-agent] mode is {MODE}", flush=True)
    # Threaded, so one test left hanging does not hold up the rest of the run.
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
