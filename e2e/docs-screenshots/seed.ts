// Creates the AI tutor example through the backend API and runs everything the
// docs pictures show. Every name and input comes from the backend's
// src/testing/demo_replies.json, which its FAKE_AI_DEMO mode also answers from.
import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { expect } from "../fixtures";
import { STORAGE_STATE } from "../storage-state";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Param = { name: string; type: string; description: string };
type DemoTest = {
  name: string;
  kind: "response" | "tool_call";
  user_message: string;
  criteria?: string;
  expected_tool_call?: { name: string; arguments: Record<string, unknown> };
  demo: { reply: string; passed: boolean; reasoning: string };
};
export type Demo = {
  agent: {
    name: string;
    system_prompt: string;
    llm_model: string;
    stt_provider: string;
    tts_provider: string;
  };
  tools: { kind: string; name: string; description: string; url?: string; method?: string; parameters: Param[] }[];
  evaluators: { name: string; reply_name: string; type: "binary" | "rating"; prompt: string; scale_min?: number; scale_max?: number }[];
  tests: DemoTest[];
  benchmark_models: { model: string }[];
  personas: { name: string; characteristics: string; gender: string; language: string; interruption_level: string }[];
  scenarios: { name: string; description: string }[];
  simulation: { name: string };
  stt_dataset: { name: string; language: string; rows: string[]; providers: string[] };
  tts_dataset: { name: string; language: string; rows: string[]; providers: string[] };
  human_alignment: { task_name: string; evaluator: string; annotators: string[] };
};

export type Seeded = Awaited<ReturnType<typeof seed>>;

export function loadDemo(): Demo {
  const dir = process.env.CALIBRATE_BACKEND_DIR;
  if (!dir) throw new Error("CALIBRATE_BACKEND_DIR is not set; run through scripts/e2e-fake-backend.sh.");
  return JSON.parse(fs.readFileSync(path.join(dir, "src/testing/demo_replies.json"), "utf8"));
}

function token(): string {
  const state = JSON.parse(fs.readFileSync(STORAGE_STATE, "utf8")) as {
    cookies?: { name: string; value: string }[];
  };
  return state.cookies!.find((c) => c.name === "access_token")!.value;
}

async function api<T>(
  request: APIRequestContext,
  urlPath: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const res = await request.fetch(`${BACKEND_URL}${urlPath}`, {
    method,
    headers: { Authorization: `Bearer ${token()}` },
    ...(body === undefined ? {} : { data: body }),
  });
  expect(res.ok(), `${method} ${urlPath} failed (${res.status()}): ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** Wait for a background job; fail with its last answer if it ends badly. */
async function waitFor(
  request: APIRequestContext,
  urlPath: string,
): Promise<void> {
  let last: { status?: string } = {};
  await expect
    .poll(
      async () => {
        last = await api<{ status?: string }>(request, urlPath);
        if (last.status === "failed") throw new Error(`${urlPath} failed: ${JSON.stringify(last)}`);
        return ["done", "completed"].includes(last.status ?? "");
      },
      { timeout: 5 * 60_000, intervals: [1000, 2000] },
    )
    .toBe(true);
}

/** A 1.5 second silent 16 kHz mono 16-bit PCM WAV. */
function silentWav(): Buffer {
  const rate = 16000;
  const dataBytes = rate * 1.5 * 2;
  const b = Buffer.alloc(44 + dataBytes);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + dataBytes, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(dataBytes, 40);
  return b;
}


const toolParams = (params: Param[]) =>
  params.map((p) => ({ id: p.name, type: p.type, description: p.description, required: true }));

export async function seed(request: APIRequestContext, d: Demo) {
  // The backend has no call that renames a user, so only the workspace is named.
  const [org] = await api<{ uuid: string }[]>(request, "/organizations");
  await api(request, `/organizations/${org.uuid}`, { name: "Maths tutor team" }, "PATCH");

  // Agent built in Calibrate, plus a connected one for the Connection pictures.
  const { uuid: agentId } = await api<{ uuid: string }>(request, "/agents", {
    name: d.agent.name,
    type: "agent",
    config: {
      system_prompt: d.agent.system_prompt,
      llm: { model: d.agent.llm_model },
      stt: { provider: d.agent.stt_provider },
      tts: { provider: d.agent.tts_provider },
    },
  });
  // The backend refuses a localhost agent URL, so the connection is marked
  // verified directly; a signed-in create keeps that flag.
  const { uuid: connectionAgentId } = await api<{ uuid: string }>(request, "/agents", {
    name: `${d.agent.name} (connected)`,
    type: "connection",
    config: {
      agent_url: "https://example.org/tutor/chat",
      connection_verified: true,
      connection_verified_at: new Date().toISOString(),
    },
  });

  const toolIds: string[] = [];
  for (const t of d.tools) {
    const config =
      t.kind === "webhook"
        ? {
            type: "webhook",
            parameters: [],
            webhook: {
              method: t.method,
              url: t.url,
              timeout: 20,
              headers: [],
              queryParameters: toolParams(t.parameters),
            },
          }
        : { type: t.kind, parameters: toolParams(t.parameters) };
    toolIds.push(
      (await api<{ uuid: string }>(request, "/tools", { name: t.name, description: t.description, config })).uuid,
    );
  }
  await api(request, "/agent-tools", { agent_uuid: agentId, tool_uuids: toolIds });

  // Simulations only take conversation evaluators, and the fake matches the
  // simulation verdicts by these names, so the demo evaluators are that type.
  // Names are unique across a workspace, so the agent reply copies (the kind
  // the agent's Evaluators page lists, and the only kind that scores traces)
  // get their own names.
  const createEvaluator = async (e: Demo["evaluators"][number], name: string, type: string) => {
    const scale =
      e.type === "rating"
        ? Array.from({ length: e.scale_max! - e.scale_min! + 1 }, (_, i) => ({
            value: e.scale_min! + i,
            name: String(e.scale_min! + i),
          }))
        : undefined;
    return (
      await api<{ uuid: string }>(request, "/evaluators", {
        name,
        evaluator_type: type,
        data_type: "text",
        output_type: e.type,
        version: { judge_model: "openai/gpt-5.4-mini", system_prompt: e.prompt, ...(scale && { output_config: { scale } }) },
      })
    ).uuid;
  };
  const evaluatorIds: string[] = [];
  for (const e of d.evaluators) evaluatorIds.push(await createEvaluator(e, e.name, "conversation"));
  // A second, live version so the evaluator page shows its version history.
  await api(request, `/evaluators/${evaluatorIds[0]}/versions`, {
    judge_model: "openai/gpt-4.1",
    system_prompt: d.evaluators[0].prompt,
    make_live: true,
  });
  await api(request, `/agents/${agentId}/evaluators`, { evaluator_ids: evaluatorIds });

  // Tests: the criteria go to the built-in Correctness evaluator.
  const all = await api<{ items: { uuid: string; slug?: string; source_default_slug?: string; evaluator_type?: string }[] }>(
    request,
    "/evaluators?include_defaults=true&evaluator_type=llm",
  );
  const correctness = all.items.find(
    (e) => (e.source_default_slug ?? e.slug) === "default-llm-next-reply" && e.evaluator_type === "llm",
  );
  expect(correctness, "no built-in Correctness evaluator").toBeTruthy();
  const history = (t: DemoTest) => [{ role: "user", content: t.user_message }];
  const responseTests = d.tests.filter((t) => t.kind === "response");
  const toolTests = d.tests.filter((t) => t.kind === "tool_call");
  await api(request, "/tests/bulk", {
    type: "response",
    agent_uuids: [agentId],
    tests: responseTests.map((t) => ({
      name: t.name,
      conversation_history: history(t),
      evaluators: [{ evaluator_uuid: correctness!.uuid, variable_values: { criteria: t.criteria } }],
    })),
  });
  await api(request, "/tests/bulk", {
    type: "tool_call",
    agent_uuids: [agentId],
    tests: toolTests.map((t) => ({
      name: t.name,
      conversation_history: history(t),
      tool_calls: [
        {
          tool: t.expected_tool_call!.name,
          accept_any_arguments: false,
          arguments: Object.fromEntries(
            Object.entries(t.expected_tool_call!.arguments).map(([k, v]) => [k, { match_type: "exact", value: v }]),
          ),
        },
      ],
    })),
  });

  // Runs go one at a time: the backend runs one job per workspace at once.
  const testRunId = (await api<{ task_id: string }>(request, `/agent-tests/agent/${agentId}/run`, {})).task_id;
  await waitFor(request, `/agent-tests/run/${testRunId}`);
  const benchmarkId = (
    await api<{ task_id: string }>(request, `/agent-tests/agent/${agentId}/benchmark`, {
      models: d.benchmark_models.map((m) => m.model),
    })
  ).task_id;
  await waitFor(request, `/agent-tests/benchmark/${benchmarkId}`);

  // Monitoring. Linked after the runs above so they do not change their
  // results.
  const replyEvaluatorIds: string[] = [];
  for (const e of d.evaluators) {
    replyEvaluatorIds.push(await createEvaluator(e, e.reply_name, "llm"));
  }
  await api(request, `/agents/${agentId}/evaluators`, { evaluator_ids: replyEvaluatorIds });
  // One trace per test exchange.
  for (const [i, t] of d.tests.entries()) {
    await api(request, "/traces", {
      agent_id: agentId,
      message_id: `docs-${i}`,
      conversation_id: `docs-conversation-${i}`,
      input: history(t),
      output: { response: t.demo.reply },
    });
  }

  // Simulations.
  const personaIds: string[] = [];
  for (const p of d.personas) {
    personaIds.push(
      (
        await api<{ uuid: string }>(request, "/personas", {
          name: p.name,
          description: p.characteristics,
          config: { gender: p.gender, language: p.language, interruption_sensitivity: p.interruption_level },
        })
      ).uuid,
    );
  }
  const scenarioIds: string[] = [];
  for (const s of d.scenarios) {
    scenarioIds.push((await api<{ uuid: string }>(request, "/scenarios", s)).uuid);
  }
  const { uuid: simulationId } = await api<{ uuid: string }>(request, "/simulations", {
    name: d.simulation.name,
    agent_uuid: agentId,
    persona_uuids: personaIds,
    scenario_uuids: scenarioIds,
    evaluators: evaluatorIds.map((id) => ({ evaluator_uuid: id })),
  });
  const runSimulation = async (type: "text" | "voice") => {
    const { task_id } = await api<{ task_id: string }>(request, `/simulations/${simulationId}/run`, { type });
    await waitFor(request, `/simulations/run/${task_id}`);
    return task_id;
  };
  const textRunId = await runSimulation("text");
  const voiceRunId = await runSimulation("voice");

  // Speech to text: upload a short silent clip per row, the way the dataset
  // editor does.
  const stt = await api<{ uuid: string }>(request, "/datasets", { name: d.stt_dataset.name, dataset_type: "stt" });
  const sttItems = [];
  for (const text of d.stt_dataset.rows) {
    const up = await api<{ presigned_url: string; s3_path: string }>(request, "/presigned-url", {
      task_type: "stt",
      content_type: "audio/wav",
      extension: "wav",
    });
    // Local storage answers with a path on the backend; S3 with a full URL.
    const url = up.presigned_url.startsWith("/") ? `${BACKEND_URL}${up.presigned_url}` : up.presigned_url;
    const put = await request.put(url, { data: silentWav(), headers: { "Content-Type": "audio/wav" } });
    expect(put.ok(), `audio upload failed (${put.status()})`).toBeTruthy();
    sttItems.push({ audio_path: up.s3_path, text });
  }
  await api(request, `/datasets/${stt.uuid}/items`, sttItems);
  const sttTaskId = (
    await api<{ task_id: string }>(request, "/stt/evaluate", {
      dataset_id: stt.uuid,
      providers: d.stt_dataset.providers,
      language: d.stt_dataset.language,
    })
  ).task_id;
  await waitFor(request, `/stt/evaluate/${sttTaskId}`);

  const tts = await api<{ uuid: string }>(request, "/datasets", { name: d.tts_dataset.name, dataset_type: "tts" });
  await api(request, `/datasets/${tts.uuid}/items`, d.tts_dataset.rows.map((text) => ({ text })));
  const ttsTaskId = (
    await api<{ task_id: string }>(request, "/tts/evaluate", {
      dataset_id: tts.uuid,
      providers: d.tts_dataset.providers,
      language: d.tts_dataset.language,
    })
  ).task_id;
  await waitFor(request, `/tts/evaluate/${ttsTaskId}`);

  // Human alignment: the four test exchanges, labelled by both annotators,
  // then judged by the evaluator.
  const ha = d.human_alignment;
  const evaluatorId = evaluatorIds[d.evaluators.findIndex((e) => e.name === ha.evaluator)];
  const { uuid: taskId } = await api<{ uuid: string }>(request, "/annotation-tasks", {
    name: ha.task_name,
    type: "conversation",
    evaluator_ids: [evaluatorId],
  });
  await api(request, `/annotation-tasks/${taskId}/items`, {
    items: d.tests.map((t) => ({
      payload: {
        name: t.name,
        transcript: [
          { role: "user", content: t.user_message },
          { role: "assistant", content: t.demo.reply },
        ],
      },
    })),
  });
  const annotatorIds: string[] = [];
  for (const name of ha.annotators) {
    annotatorIds.push((await api<{ uuid: string }>(request, "/annotators", { name })).uuid);
  }
  const { jobs } = await api<{ jobs: { public_token: string }[] }>(request, `/annotation-tasks/${taskId}/jobs`, {
    annotator_ids: annotatorIds,
    select_all: true,
  });
  for (const [j, job] of jobs.entries()) {
    const view = await api<{ items: { uuid: string; payload: { name: string } }[] }>(
      request,
      `/public/annotation-jobs/${job.public_token}`,
    );
    for (const item of view.items) {
      const i = d.tests.findIndex((t) => t.name === item.payload.name);
      // The second annotator disagrees on the last exchange, so agreement is
      // not a flat 100%.
      const value = j === 1 && i === d.tests.length - 1 ? !d.tests[i].demo.passed : d.tests[i].demo.passed;
      await api(request, `/public/annotation-jobs/${job.public_token}/annotations`, {
        item_id: item.uuid,
        annotations: [{ evaluator_id: evaluatorId, value: { value } }],
      });
    }
  }
  const { job_uuid: evaluatorRunId } = await api<{ job_uuid: string }>(
    request,
    `/annotation-tasks/${taskId}/evaluator-runs`,
    { evaluators: [{ evaluator_id: evaluatorId }], select_all: true },
  );
  await waitFor(request, `/annotation-tasks/${taskId}/evaluator-runs/${evaluatorRunId}`);

  return {
    agentId,
    connectionAgentId,
    testRunId,
    benchmarkId,
    evaluatorIds,
    simulationId,
    textRunId,
    voiceRunId,
    sttTaskId,
    ttsTaskId,
    taskId,
    evaluatorRunId,
    jobTokens: jobs.map((j) => j.public_token),
  };
}
