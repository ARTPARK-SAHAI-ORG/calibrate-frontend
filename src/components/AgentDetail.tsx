"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { INBUILT_TOOLS, getInbuiltToolIcon } from "@/constants/inbuilt-tools";

type AgentDetailProps = {
  agentUuid: string;
  onHeaderUpdate?: (headerContent: React.ReactNode) => void;
};

type AgentData = {
  uuid: string;
  name: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ToolData = {
  uuid: string;
  name: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

const sttProviders = [
  { label: "deepgram", value: "deepgram" },
  { label: "openai", value: "openai" },
  { label: "cartesia", value: "cartesia" },
  { label: "elevenlabs", value: "elevenlabs" },
  { label: "whisper", value: "groq" },
  { label: "google", value: "google" },
  { label: "sarvam", value: "sarvam" },
];

const ttsProviders = [
  { label: "cartesia", value: "cartesia" },
  { label: "openai", value: "openai" },
  { label: "orpheus", value: "groq" },
  { label: "google", value: "google" },
  { label: "elevenlabs", value: "elevenlabs" },
  { label: "sarvam", value: "sarvam" },
];

type LLMModel = {
  id: string;
  name: string;
};

type LLMProvider = {
  name: string;
  models: LLMModel[];
};

const llmProviders: LLMProvider[] = [
  {
    name: "OpenAI",
    models: [
      { id: "openai/gpt-5.2-chat", name: "GPT-5.2 Chat" },
      { id: "openai/gpt-5.2-pro", name: "GPT-5.2 Pro" },
      { id: "openai/gpt-5.2", name: "GPT-5.2" },
      { id: "openai/gpt-5.1-codex-max", name: "GPT-5.1-Codex-Max" },
      { id: "openai/gpt-5.1", name: "GPT-5.1" },
      { id: "openai/gpt-5.1-chat", name: "GPT-5.1 Chat" },
      { id: "openai/gpt-5.1-codex", name: "GPT-5.1-Codex" },
      { id: "openai/gpt-5.1-codex-mini", name: "GPT-5.1-Codex-Mini" },
      { id: "openai/gpt-oss-safeguard-20b", name: "gpt-oss-safeguard-20b" },
      { id: "openai/gpt-5-image-mini", name: "GPT-5 Image Mini" },
      { id: "openai/gpt-5-image", name: "GPT-5 Image" },
      { id: "openai/o3-deep-research", name: "o3 Deep Research" },
      { id: "openai/o4-mini-deep-research", name: "o4 Mini Deep Research" },
      { id: "openai/gpt-5-pro", name: "GPT-5 Pro" },
      { id: "openai/gpt-5-codex", name: "GPT-5 Codex" },
      { id: "openai/gpt-4o-audio-preview", name: "GPT-4o Audio" },
      { id: "openai/gpt-5-chat", name: "GPT-5 Chat" },
      { id: "openai/gpt-5", name: "GPT-5" },
      { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
      { id: "openai/gpt-5-nano", name: "GPT-5 Nano" },
      { id: "openai/gpt-oss-120b:free", name: "gpt-oss-120b (free)" },
      { id: "openai/gpt-oss-120b", name: "gpt-oss-120b" },
      { id: "openai/gpt-oss-120b:exacto", name: "gpt-oss-120b (exacto)" },
      { id: "openai/gpt-oss-20b:free", name: "gpt-oss-20b (free)" },
      { id: "openai/gpt-oss-20b", name: "gpt-oss-20b" },
      { id: "openai/o3-pro", name: "o3 Pro" },
      { id: "openai/codex-mini", name: "Codex Mini" },
      { id: "openai/o4-mini-high", name: "o4 Mini High" },
      { id: "openai/o3", name: "o3" },
      { id: "openai/o4-mini", name: "o4 Mini" },
      { id: "openai/gpt-4.1", name: "GPT-4.1" },
      { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini" },
      { id: "openai/gpt-4.1-nano", name: "GPT-4.1 Nano" },
      { id: "openai/o1-pro", name: "o1-pro" },
      {
        id: "openai/gpt-4o-mini-search-preview",
        name: "GPT-4o-mini Search Preview",
      },
      { id: "openai/gpt-4o-search-preview", name: "GPT-4o Search Preview" },
      { id: "openai/o3-mini-high", name: "o3 Mini High" },
      { id: "openai/o3-mini", name: "o3 Mini" },
      { id: "openai/o1", name: "o1" },
      { id: "openai/gpt-4o-2024-11-20", name: "GPT-4o (2024-11-20)" },
      { id: "openai/chatgpt-4o-latest", name: "ChatGPT-4o" },
      { id: "openai/gpt-4o-2024-08-06", name: "GPT-4o (2024-08-06)" },
      { id: "openai/gpt-4o-mini-2024-07-18", name: "GPT-4o-mini (2024-07-18)" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o-mini" },
      { id: "openai/gpt-4o-2024-05-13", name: "GPT-4o (2024-05-13)" },
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "openai/gpt-4o:extended", name: "GPT-4o (extended)" },
      { id: "openai/gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "openai/gpt-3.5-turbo-0613", name: "GPT-3.5 Turbo (older v0613)" },
      { id: "openai/gpt-4-turbo-preview", name: "GPT-4 Turbo Preview" },
      { id: "openai/gpt-4-1106-preview", name: "GPT-4 Turbo (older v1106)" },
      { id: "openai/gpt-3.5-turbo-instruct", name: "GPT-3.5 Turbo Instruct" },
      { id: "openai/gpt-3.5-turbo-16k", name: "GPT-3.5 Turbo 16k" },
      { id: "openai/gpt-4-0314", name: "GPT-4 (older v0314)" },
      { id: "openai/gpt-4", name: "GPT-4" },
      { id: "openai/gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ],
  },
  {
    name: "Google",
    models: [
      { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
      {
        id: "google/gemini-3-pro-image-preview",
        name: "Nano Banana Pro (Gemini 3 Pro Image Preview)",
      },
      { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
      {
        id: "google/gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image (Nano Banana)",
      },
      {
        id: "google/gemini-2.5-flash-preview-09-2025",
        name: "Gemini 2.5 Flash Preview 09-2025",
      },
      {
        id: "google/gemini-2.5-flash-lite-preview-09-2025",
        name: "Gemini 2.5 Flash Lite Preview 09-2025",
      },
      {
        id: "google/gemini-2.5-flash-image-preview",
        name: "Gemini 2.5 Flash Image Preview (Nano Banana)",
      },
      { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
      { id: "google/gemma-3n-e2b-it:free", name: "Gemma 3n 2B (free)" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      {
        id: "google/gemini-2.5-pro-preview",
        name: "Gemini 2.5 Pro Preview 06-05",
      },
      { id: "google/gemma-3n-e4b-it:free", name: "Gemma 3n 4B (free)" },
      { id: "google/gemma-3n-e4b-it", name: "Gemma 3n 4B" },
      {
        id: "google/gemini-2.5-pro-preview-05-06",
        name: "Gemini 2.5 Pro Preview 05-06",
      },
      { id: "google/gemma-3-4b-it:free", name: "Gemma 3 4B (free)" },
      { id: "google/gemma-3-4b-it", name: "Gemma 3 4B" },
      { id: "google/gemma-3-12b-it:free", name: "Gemma 3 12B (free)" },
      { id: "google/gemma-3-12b-it", name: "Gemma 3 12B" },
      { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B (free)" },
      { id: "google/gemma-3-27b-it", name: "Gemma 3 27B" },
      { id: "google/gemini-2.0-flash-lite-001", name: "Gemini 2.0 Flash Lite" },
      { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
      {
        id: "google/gemini-2.0-flash-exp:free",
        name: "Gemini 2.0 Flash Experimental (free)",
      },
      { id: "google/gemma-2-27b-it", name: "Gemma 2 27B" },
      { id: "google/gemma-2-9b-it", name: "Gemma 2 9B" },
    ],
  },
  {
    name: "Anthropic",
    models: [
      { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5" },
      { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
      { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
      { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1" },
      { id: "anthropic/claude-opus-4", name: "Claude Opus 4" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4" },
      {
        id: "anthropic/claude-3.7-sonnet:thinking",
        name: "Claude 3.7 Sonnet (thinking)",
      },
      { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet" },
      {
        id: "anthropic/claude-3.5-haiku-20241022",
        name: "Claude 3.5 Haiku (2024-10-22)",
      },
      { id: "anthropic/claude-3.5-haiku", name: "Claude 3.5 Haiku" },
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku" },
    ],
  },
  {
    name: "DeepSeek",
    models: [
      { id: "deepseek/deepseek-v3.2-speciale", name: "DeepSeek V3.2 Speciale" },
      { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2" },
      { id: "deepseek/deepseek-v3.2-exp", name: "DeepSeek V3.2 Exp" },
      {
        id: "deepseek/deepseek-v3.1-terminus:exacto",
        name: "DeepSeek V3.1 Terminus (exacto)",
      },
      { id: "deepseek/deepseek-v3.1-terminus", name: "DeepSeek V3.1 Terminus" },
      { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek V3.1" },
      {
        id: "deepseek/deepseek-r1-0528-qwen3-8b",
        name: "DeepSeek R1 0528 Qwen3 8B",
      },
      { id: "deepseek/deepseek-r1-0528:free", name: "R1 0528 (free)" },
      { id: "deepseek/deepseek-r1-0528", name: "R1 0528" },
      { id: "deepseek/deepseek-prover-v2", name: "DeepSeek Prover V2" },
      { id: "deepseek/deepseek-chat-v3-0324", name: "DeepSeek V3 0324" },
      {
        id: "deepseek/deepseek-r1-distill-qwen-32b",
        name: "R1 Distill Qwen 32B",
      },
      {
        id: "deepseek/deepseek-r1-distill-qwen-14b",
        name: "R1 Distill Qwen 14B",
      },
      {
        id: "deepseek/deepseek-r1-distill-llama-70b",
        name: "R1 Distill Llama 70B",
      },
      { id: "deepseek/deepseek-r1", name: "R1" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
    ],
  },
  {
    name: "Meta",
    models: [
      { id: "meta-llama/llama-guard-4-12b", name: "Llama Guard 4 12B" },
      { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick" },
      { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout" },
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        name: "Llama 3.3 70B Instruct (free)",
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        name: "Llama 3.3 70B Instruct",
      },
      {
        id: "meta-llama/llama-3.2-3b-instruct:free",
        name: "Llama 3.2 3B Instruct (free)",
      },
      { id: "meta-llama/llama-3.2-3b-instruct", name: "Llama 3.2 3B Instruct" },
      { id: "meta-llama/llama-3.2-1b-instruct", name: "Llama 3.2 1B Instruct" },
      {
        id: "meta-llama/llama-3.2-90b-vision-instruct",
        name: "Llama 3.2 90B Vision Instruct",
      },
      {
        id: "meta-llama/llama-3.2-11b-vision-instruct",
        name: "Llama 3.2 11B Vision Instruct",
      },
      { id: "meta-llama/llama-3.1-405b", name: "Llama 3.1 405B (base)" },
      { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B Instruct" },
      {
        id: "meta-llama/llama-3.1-405b-instruct:free",
        name: "Llama 3.1 405B Instruct (free)",
      },
      {
        id: "meta-llama/llama-3.1-405b-instruct",
        name: "Llama 3.1 405B Instruct",
      },
      {
        id: "meta-llama/llama-3.1-70b-instruct",
        name: "Llama 3.1 70B Instruct",
      },
      { id: "meta-llama/llama-guard-2-8b", name: "LlamaGuard 2 8B" },
      { id: "meta-llama/llama-3-70b-instruct", name: "Llama 3 70B Instruct" },
      { id: "meta-llama/llama-3-8b-instruct", name: "Llama 3 8B Instruct" },
    ],
  },
  {
    name: "Mistral",
    models: [
      {
        id: "mistralai/mistral-small-creative",
        name: "Mistral Small Creative",
      },
      { id: "mistralai/devstral-2512:free", name: "Devstral 2 2512 (free)" },
      { id: "mistralai/devstral-2512", name: "Devstral 2 2512" },
      { id: "mistralai/ministral-14b-2512", name: "Ministral 3 14B 2512" },
      { id: "mistralai/ministral-8b-2512", name: "Ministral 3 8B 2512" },
      { id: "mistralai/ministral-3b-2512", name: "Ministral 3 3B 2512" },
      { id: "mistralai/mistral-large-2512", name: "Mistral Large 3 2512" },
      {
        id: "mistralai/voxtral-small-24b-2507",
        name: "Voxtral Small 24B 2507",
      },
      { id: "mistralai/mistral-medium-3.1", name: "Mistral Medium 3.1" },
      { id: "mistralai/codestral-2508", name: "Codestral 2508" },
      { id: "mistralai/devstral-medium", name: "Devstral Medium" },
      { id: "mistralai/devstral-small", name: "Devstral Small 1.1" },
      {
        id: "mistralai/mistral-small-3.2-24b-instruct",
        name: "Mistral Small 3.2 24B",
      },
      { id: "mistralai/devstral-small-2505", name: "Devstral Small 2505" },
      { id: "mistralai/mistral-medium-3", name: "Mistral Medium 3" },
      {
        id: "mistralai/mistral-small-3.1-24b-instruct:free",
        name: "Mistral Small 3.1 24B (free)",
      },
      {
        id: "mistralai/mistral-small-3.1-24b-instruct",
        name: "Mistral Small 3.1 24B",
      },
      { id: "mistralai/mistral-saba", name: "Saba" },
      {
        id: "mistralai/mistral-small-24b-instruct-2501",
        name: "Mistral Small 3",
      },
      { id: "mistralai/pixtral-large-2411", name: "Pixtral Large 2411" },
      { id: "mistralai/ministral-8b", name: "Ministral 8B" },
      { id: "mistralai/ministral-3b", name: "Ministral 3B" },
      { id: "mistralai/pixtral-12b", name: "Pixtral 12B" },
      { id: "mistralai/mistral-nemo", name: "Mistral Nemo" },
      {
        id: "mistralai/mistral-7b-instruct:free",
        name: "Mistral 7B Instruct (free)",
      },
      { id: "mistralai/mistral-7b-instruct", name: "Mistral 7B Instruct" },
      {
        id: "mistralai/mistral-7b-instruct-v0.3",
        name: "Mistral 7B Instruct v0.3",
      },
      {
        id: "mistralai/mixtral-8x22b-instruct",
        name: "Mixtral 8x22B Instruct",
      },
      {
        id: "mistralai/mistral-7b-instruct-v0.2",
        name: "Mistral 7B Instruct v0.2",
      },
      { id: "mistralai/mixtral-8x7b-instruct", name: "Mixtral 8x7B Instruct" },
      {
        id: "mistralai/mistral-7b-instruct-v0.1",
        name: "Mistral 7B Instruct v0.1",
      },
    ],
  },
  {
    name: "Qwen",
    models: [
      { id: "qwen/qwen3-vl-32b-instruct", name: "Qwen3 VL 32B Instruct" },
      { id: "qwen/qwen3-vl-8b-thinking", name: "Qwen3 VL 8B Thinking" },
      { id: "qwen/qwen3-vl-8b-instruct", name: "Qwen3 VL 8B Instruct" },
      {
        id: "qwen/qwen3-vl-30b-a3b-thinking",
        name: "Qwen3 VL 30B A3B Thinking",
      },
      {
        id: "qwen/qwen3-vl-30b-a3b-instruct",
        name: "Qwen3 VL 30B A3B Instruct",
      },
      {
        id: "qwen/qwen3-vl-235b-a22b-thinking",
        name: "Qwen3 VL 235B A22B Thinking",
      },
      {
        id: "qwen/qwen3-vl-235b-a22b-instruct",
        name: "Qwen3 VL 235B A22B Instruct",
      },
      { id: "qwen/qwen3-max", name: "Qwen3 Max" },
      { id: "qwen/qwen3-coder-plus", name: "Qwen3 Coder Plus" },
      { id: "qwen/qwen3-coder-flash", name: "Qwen3 Coder Flash" },
      {
        id: "qwen/qwen3-next-80b-a3b-thinking",
        name: "Qwen3 Next 80B A3B Thinking",
      },
      {
        id: "qwen/qwen3-next-80b-a3b-instruct",
        name: "Qwen3 Next 80B A3B Instruct",
      },
      { id: "qwen/qwen-plus-2025-07-28", name: "Qwen Plus 0728" },
      {
        id: "qwen/qwen-plus-2025-07-28:thinking",
        name: "Qwen Plus 0728 (thinking)",
      },
      {
        id: "qwen/qwen3-30b-a3b-thinking-2507",
        name: "Qwen3 30B A3B Thinking 2507",
      },
      {
        id: "qwen/qwen3-coder-30b-a3b-instruct",
        name: "Qwen3 Coder 30B A3B Instruct",
      },
      {
        id: "qwen/qwen3-30b-a3b-instruct-2507",
        name: "Qwen3 30B A3B Instruct 2507",
      },
      {
        id: "qwen/qwen3-235b-a22b-thinking-2507",
        name: "Qwen3 235B A22B Thinking 2507",
      },
      { id: "qwen/qwen3-coder:free", name: "Qwen3 Coder 480B A35B (free)" },
      { id: "qwen/qwen3-coder", name: "Qwen3 Coder 480B A35B" },
      { id: "qwen/qwen3-coder:exacto", name: "Qwen3 Coder 480B A35B (exacto)" },
      {
        id: "qwen/qwen3-235b-a22b-2507",
        name: "Qwen3 235B A22B Instruct 2507",
      },
      { id: "qwen/qwen3-4b:free", name: "Qwen3 4B (free)" },
      { id: "qwen/qwen3-30b-a3b", name: "Qwen3 30B A3B" },
      { id: "qwen/qwen3-8b", name: "Qwen3 8B" },
      { id: "qwen/qwen3-14b", name: "Qwen3 14B" },
      { id: "qwen/qwen3-32b", name: "Qwen3 32B" },
      { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B A22B" },
      {
        id: "qwen/qwen2.5-coder-7b-instruct",
        name: "Qwen2.5 Coder 7B Instruct",
      },
      { id: "qwen/qwen2.5-vl-32b-instruct", name: "Qwen2.5 VL 32B Instruct" },
      { id: "qwen/qwq-32b", name: "QwQ 32B" },
      { id: "qwen/qwen-vl-plus", name: "Qwen VL Plus" },
      { id: "qwen/qwen-vl-max", name: "Qwen VL Max" },
      { id: "qwen/qwen-turbo", name: "Qwen-Turbo" },
      { id: "qwen/qwen2.5-vl-72b-instruct", name: "Qwen2.5 VL 72B Instruct" },
      { id: "qwen/qwen-plus", name: "Qwen-Plus" },
      { id: "qwen/qwen-max", name: "Qwen-Max" },
      { id: "qwen/qwen-2.5-7b-instruct", name: "Qwen2.5 7B Instruct" },
      {
        id: "qwen/qwen-2.5-vl-7b-instruct:free",
        name: "Qwen2.5-VL 7B Instruct (free)",
      },
      { id: "qwen/qwen-2.5-vl-7b-instruct", name: "Qwen2.5-VL 7B Instruct" },
    ],
  },
  {
    name: "xAI",
    models: [
      { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast" },
      { id: "x-ai/grok-4-fast", name: "Grok 4 Fast" },
      { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1" },
      { id: "x-ai/grok-4", name: "Grok 4" },
      { id: "x-ai/grok-3-mini", name: "Grok 3 Mini" },
      { id: "x-ai/grok-3", name: "Grok 3" },
      { id: "x-ai/grok-3-mini-beta", name: "Grok 3 Mini Beta" },
      { id: "x-ai/grok-3-beta", name: "Grok 3 Beta" },
    ],
  },
  {
    name: "Perplexity",
    models: [
      { id: "perplexity/sonar-pro-search", name: "Sonar Pro Search" },
      { id: "perplexity/sonar-reasoning-pro", name: "Sonar Reasoning Pro" },
      { id: "perplexity/sonar-pro", name: "Sonar Pro" },
      { id: "perplexity/sonar-deep-research", name: "Sonar Deep Research" },
      { id: "perplexity/sonar", name: "Sonar" },
    ],
  },
  {
    name: "MoonshotAI",
    models: [
      { id: "moonshotai/kimi-k2-thinking", name: "Kimi K2 Thinking" },
      { id: "moonshotai/kimi-k2-0905", name: "Kimi K2 0905" },
      { id: "moonshotai/kimi-k2-0905:exacto", name: "Kimi K2 0905 (exacto)" },
      { id: "moonshotai/kimi-k2:free", name: "Kimi K2 0711 (free)" },
      { id: "moonshotai/kimi-k2", name: "Kimi K2 0711" },
      { id: "moonshotai/kimi-dev-72b", name: "Kimi Dev 72B" },
    ],
  },
  {
    name: "Cohere",
    models: [
      { id: "cohere/command-a", name: "Command A" },
      { id: "cohere/command-r7b-12-2024", name: "Command R7B (12-2024)" },
      { id: "cohere/command-r-08-2024", name: "Command R (08-2024)" },
      { id: "cohere/command-r-plus-08-2024", name: "Command R+ (08-2024)" },
    ],
  },
  {
    name: "Amazon",
    models: [
      { id: "amazon/nova-2-lite-v1", name: "Nova 2 Lite" },
      { id: "amazon/nova-premier-v1", name: "Nova Premier 1.0" },
      { id: "amazon/nova-lite-v1", name: "Nova Lite 1.0" },
      { id: "amazon/nova-micro-v1", name: "Nova Micro 1.0" },
      { id: "amazon/nova-pro-v1", name: "Nova Pro 1.0" },
    ],
  },
  {
    name: "NVIDIA",
    models: [
      {
        id: "nvidia/nemotron-3-nano-30b-a3b:free",
        name: "Nemotron 3 Nano 30B A3B (free)",
      },
      { id: "nvidia/nemotron-3-nano-30b-a3b", name: "Nemotron 3 Nano 30B A3B" },
      {
        id: "nvidia/nemotron-nano-12b-v2-vl:free",
        name: "Nemotron Nano 12B 2 VL (free)",
      },
      { id: "nvidia/nemotron-nano-12b-v2-vl", name: "Nemotron Nano 12B 2 VL" },
      {
        id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        name: "Llama 3.3 Nemotron Super 49B V1.5",
      },
      {
        id: "nvidia/nemotron-nano-9b-v2:free",
        name: "Nemotron Nano 9B V2 (free)",
      },
      { id: "nvidia/nemotron-nano-9b-v2", name: "Nemotron Nano 9B V2" },
      {
        id: "nvidia/llama-3.1-nemotron-ultra-253b-v1",
        name: "Llama 3.1 Nemotron Ultra 253B v1",
      },
      {
        id: "nvidia/llama-3.1-nemotron-70b-instruct",
        name: "Llama 3.1 Nemotron 70B Instruct",
      },
    ],
  },
  {
    name: "Microsoft",
    models: [
      { id: "microsoft/phi-4-reasoning-plus", name: "Phi 4 Reasoning Plus" },
      {
        id: "microsoft/phi-4-multimodal-instruct",
        name: "Phi 4 Multimodal Instruct",
      },
      { id: "microsoft/phi-4", name: "Phi 4" },
    ],
  },
  {
    name: "ByteDance Seed",
    models: [
      { id: "bytedance-seed/seed-1.6-flash", name: "Seed 1.6 Flash" },
      { id: "bytedance-seed/seed-1.6", name: "Seed 1.6" },
    ],
  },
  {
    name: "MiniMax",
    models: [
      { id: "minimax/minimax-m2.1", name: "MiniMax M2.1" },
      { id: "minimax/minimax-m2", name: "MiniMax M2" },
      { id: "minimax/minimax-m1", name: "MiniMax M1" },
      { id: "minimax/minimax-01", name: "MiniMax-01" },
    ],
  },
  {
    name: "Z.AI",
    models: [
      { id: "z-ai/glm-4.7", name: "GLM 4.7" },
      { id: "z-ai/glm-4.6v", name: "GLM 4.6V" },
      { id: "z-ai/glm-4.6", name: "GLM 4.6" },
      { id: "z-ai/glm-4.6:exacto", name: "GLM 4.6 (exacto)" },
      { id: "z-ai/glm-4.5v", name: "GLM 4.5V" },
      { id: "z-ai/glm-4.5", name: "GLM 4.5" },
      { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 Air (free)" },
      { id: "z-ai/glm-4.5-air", name: "GLM 4.5 Air" },
      { id: "z-ai/glm-4-32b", name: "GLM 4 32B" },
    ],
  },
  {
    name: "AllenAI",
    models: [
      { id: "allenai/olmo-3.1-32b-think", name: "Olmo 3.1 32B Think" },
      { id: "allenai/olmo-3-32b-think", name: "Olmo 3 32B Think" },
      { id: "allenai/olmo-3-7b-instruct", name: "Olmo 3 7B Instruct" },
      { id: "allenai/olmo-3-7b-think", name: "Olmo 3 7B Think" },
      { id: "allenai/olmo-2-0325-32b-instruct", name: "Olmo 2 32B Instruct" },
    ],
  },
  {
    name: "Arcee AI",
    models: [
      { id: "arcee-ai/trinity-mini:free", name: "Trinity Mini (free)" },
      { id: "arcee-ai/trinity-mini", name: "Trinity Mini" },
      { id: "arcee-ai/spotlight", name: "Spotlight" },
      { id: "arcee-ai/maestro-reasoning", name: "Maestro Reasoning" },
      { id: "arcee-ai/virtuoso-large", name: "Virtuoso Large" },
      { id: "arcee-ai/coder-large", name: "Coder Large" },
    ],
  },
  {
    name: "Deep Cogito",
    models: [
      { id: "deepcogito/cogito-v2.1-671b", name: "Cogito v2.1 671B" },
      {
        id: "deepcogito/cogito-v2-preview-llama-405b",
        name: "Cogito V2 Preview Llama 405B",
      },
      {
        id: "deepcogito/cogito-v2-preview-llama-70b",
        name: "Cogito V2 Preview Llama 70B",
      },
    ],
  },
  {
    name: "Baidu",
    models: [
      {
        id: "baidu/ernie-4.5-21b-a3b-thinking",
        name: "ERNIE 4.5 21B A3B Thinking",
      },
      { id: "baidu/ernie-4.5-21b-a3b", name: "ERNIE 4.5 21B A3B" },
      { id: "baidu/ernie-4.5-vl-28b-a3b", name: "ERNIE 4.5 VL 28B A3B" },
      { id: "baidu/ernie-4.5-vl-424b-a47b", name: "ERNIE 4.5 VL 424B A47B" },
      { id: "baidu/ernie-4.5-300b-a47b", name: "ERNIE 4.5 300B A47B" },
    ],
  },
  {
    name: "Nous",
    models: [
      { id: "nousresearch/hermes-4-70b", name: "Hermes 4 70B" },
      { id: "nousresearch/hermes-4-405b", name: "Hermes 4 405B" },
      {
        id: "nousresearch/deephermes-3-mistral-24b-preview",
        name: "DeepHermes 3 Mistral 24B Preview",
      },
      {
        id: "nousresearch/hermes-3-llama-3.1-70b",
        name: "Hermes 3 70B Instruct",
      },
      {
        id: "nousresearch/hermes-3-llama-3.1-405b:free",
        name: "Hermes 3 405B Instruct (free)",
      },
      {
        id: "nousresearch/hermes-3-llama-3.1-405b",
        name: "Hermes 3 405B Instruct",
      },
    ],
  },
  {
    name: "AI21",
    models: [
      { id: "ai21/jamba-mini-1.7", name: "Jamba Mini 1.7" },
      { id: "ai21/jamba-large-1.7", name: "Jamba Large 1.7" },
    ],
  },
  {
    name: "Inflection",
    models: [
      { id: "inflection/inflection-3-pi", name: "Inflection 3 Pi" },
      {
        id: "inflection/inflection-3-productivity",
        name: "Inflection 3 Productivity",
      },
    ],
  },
  {
    name: "IBM",
    models: [
      { id: "ibm-granite/granite-4.0-h-micro", name: "Granite 4.0 Micro" },
    ],
  },
  {
    name: "Tencent",
    models: [
      { id: "tencent/hunyuan-a13b-instruct", name: "Hunyuan A13B Instruct" },
    ],
  },
  {
    name: "StepFun",
    models: [{ id: "stepfun-ai/step3", name: "Step3" }],
  },
  {
    name: "Morph",
    models: [
      { id: "morph/morph-v3-large", name: "Morph V3 Large" },
      { id: "morph/morph-v3-fast", name: "Morph V3 Fast" },
    ],
  },
  {
    name: "Inception",
    models: [
      { id: "inception/mercury", name: "Mercury" },
      { id: "inception/mercury-coder", name: "Mercury Coder" },
    ],
  },
  {
    name: "Prime Intellect",
    models: [{ id: "prime-intellect/intellect-3", name: "INTELLECT-3" }],
  },
];

type TabType =
  | "agent"
  | "tools"
  | "evaluation"
  | "data-extraction"
  | "settings";

const validTabs: TabType[] = [
  "agent",
  "tools",
  "evaluation",
  "data-extraction",
  "settings",
];

export function AgentDetail({ agentUuid, onHeaderUpdate }: AgentDetailProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Get initial tab from URL or default to "agent"
  const getInitialTab = (): TabType => {
    const tabParam = searchParams.get("tab");
    if (tabParam && validTabs.includes(tabParam as TabType)) {
      return tabParam as TabType;
    }
    return "agent";
  };

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>(getInitialTab);

  // Update URL when tab changes
  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`, { scroll: false });
  };
  const [systemPrompt, setSystemPrompt] = useState("");
  const [sttProvider, setSttProvider] = useState<string>("google");
  const [ttsProvider, setTtsProvider] = useState<string>("google");
  const [selectedLLM, setSelectedLLM] = useState<LLMModel | null>({
    id: "google/gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
  });
  const [llmModalOpen, setLlmModalOpen] = useState(false);
  const [llmSearchQuery, setLlmSearchQuery] = useState("");
  const [endConversationEnabled, setEndConversationEnabled] = useState(true);
  const [agentSpeaksFirst, setAgentSpeaksFirst] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveToast, setShowSaveToast] = useState(false);
  const saveRef = useRef<() => void>(() => {});
  const isSavingRef = useRef(false);
  const [toolsSearchQuery, setToolsSearchQuery] = useState("");
  const [addToolDialogOpen, setAddToolDialogOpen] = useState(false);
  const [addToolDialogSearchQuery, setAddToolDialogSearchQuery] = useState("");
  const [selectedToolsForAdd, setSelectedToolsForAdd] = useState<Set<string>>(
    new Set()
  );
  // Tools linked to this agent
  const [agentTools, setAgentTools] = useState<ToolData[]>([]);
  const [agentToolsLoading, setAgentToolsLoading] = useState(false);
  const [agentToolsError, setAgentToolsError] = useState<string | null>(null);
  // All available tools (for the add tool dialog)
  const [allTools, setAllTools] = useState<ToolData[]>([]);
  const [allToolsLoading, setAllToolsLoading] = useState(false);
  const [allToolsError, setAllToolsError] = useState<string | null>(null);
  // Delete tool confirmation dialog
  const [deleteToolDialogOpen, setDeleteToolDialogOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<ToolData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Data extraction sidebar state
  const [addDataPointSidebarOpen, setAddDataPointSidebarOpen] = useState(false);
  const [dataPointDataType, setDataPointDataType] = useState("string");
  const [dataPointIdentifier, setDataPointIdentifier] = useState("");
  const [dataPointDescription, setDataPointDescription] = useState("");
  const [isCreatingDataPoint, setIsCreatingDataPoint] = useState(false);
  const [createDataPointError, setCreateDataPointError] = useState<
    string | null
  >(null);

  // Data extraction fields list state
  type DataExtractionFieldData = {
    uuid: string;
    type: string;
    name: string;
    description: string;
    agent_id: string;
    created_at: string;
    updated_at: string;
  };
  const [dataExtractionFields, setDataExtractionFields] = useState<
    DataExtractionFieldData[]
  >([]);
  const [dataExtractionFieldsLoading, setDataExtractionFieldsLoading] =
    useState(false);
  const [dataExtractionFieldsError, setDataExtractionFieldsError] = useState<
    string | null
  >(null);

  // Reset data point form
  const resetDataPointForm = () => {
    setDataPointDataType("string");
    setDataPointIdentifier("");
    setDataPointDescription("");
    setCreateDataPointError(null);
  };

  // Evaluation criteria sidebar state
  const [addCriteriaSidebarOpen, setAddCriteriaSidebarOpen] = useState(false);
  const [criteriaName, setCriteriaName] = useState("");
  const [criteriaInstructions, setCriteriaInstructions] = useState("");
  const [isCreatingCriteria, setIsCreatingCriteria] = useState(false);
  const [createCriteriaError, setCreateCriteriaError] = useState<string | null>(
    null
  );

  // Evaluation criteria list state
  type EvaluationCriteriaData = {
    uuid: string;
    name: string;
    description: string;
    agent_id: string;
    created_at: string;
    updated_at: string;
  };
  const [evaluationCriteria, setEvaluationCriteria] = useState<
    EvaluationCriteriaData[]
  >([]);
  const [evaluationCriteriaLoading, setEvaluationCriteriaLoading] =
    useState(false);
  const [evaluationCriteriaError, setEvaluationCriteriaError] = useState<
    string | null
  >(null);

  // Reset criteria form
  const resetCriteriaForm = () => {
    setCriteriaName("");
    setCriteriaInstructions("");
    setCreateCriteriaError(null);
  };

  useEffect(() => {
    const fetchAgent = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/agents/${agentUuid}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch agent");
        }

        const data: AgentData = await response.json();
        setAgent(data);

        // Initialize form fields from agent config if available
        if (data.config) {
          if (data.config.system_prompt) {
            setSystemPrompt(data.config.system_prompt);
          }
          if (data.config.stt?.provider) {
            setSttProvider(data.config.stt.provider);
          }
          if (data.config.tts?.provider) {
            setTtsProvider(data.config.tts.provider);
          }
          if (data.config.llm?.model) {
            // Find the matching LLM model from the providers list
            const modelId = data.config.llm.model;
            let foundModel: LLMModel | null = null;
            for (const provider of llmProviders) {
              const model = provider.models.find((m) => m.id === modelId);
              if (model) {
                foundModel = model;
                break;
              }
            }
            if (foundModel) {
              setSelectedLLM(foundModel);
            } else {
              // If model not found in list, create a basic entry
              setSelectedLLM({ id: modelId, name: modelId });
            }
          }
          if (data.config.settings?.agent_speaks_first !== undefined) {
            setAgentSpeaksFirst(data.config.settings.agent_speaks_first);
          }
          if (data.config.system_tools?.end_call !== undefined) {
            setEndConversationEnabled(data.config.system_tools.end_call);
          }
        }
      } catch (err) {
        console.error("Error fetching agent:", err);
        setError(err instanceof Error ? err.message : "Failed to load agent");
      } finally {
        setIsLoading(false);
      }
    };

    if (agentUuid) {
      fetchAgent();
    }

    // Cleanup: clear header when component unmounts
    return () => {
      if (onHeaderUpdate) {
        onHeaderUpdate(null);
      }
    };
  }, [agentUuid, onHeaderUpdate]);

  // Fetch tools linked to this agent
  useEffect(() => {
    const fetchAgentTools = async () => {
      if (!agentUuid) return;

      try {
        setAgentToolsLoading(true);
        setAgentToolsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/agent-tools/agent/${agentUuid}/tools`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              "ngrok-skip-browser-warning": "true",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch agent tools");
        }

        const data: ToolData[] = await response.json();
        setAgentTools(data);
      } catch (err) {
        console.error("Error fetching agent tools:", err);
        setAgentToolsError(
          err instanceof Error ? err.message : "Failed to load agent tools"
        );
      } finally {
        setAgentToolsLoading(false);
      }
    };

    fetchAgentTools();
  }, [agentUuid]);

  // Fetch all available tools (for the add tool dialog)
  useEffect(() => {
    const fetchAllTools = async () => {
      try {
        setAllToolsLoading(true);
        setAllToolsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tools`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch tools");
        }

        const data: ToolData[] = await response.json();
        setAllTools(data);
      } catch (err) {
        console.error("Error fetching tools:", err);
        setAllToolsError(
          err instanceof Error ? err.message : "Failed to load tools"
        );
      } finally {
        setAllToolsLoading(false);
      }
    };

    fetchAllTools();
  }, []);

  // Fetch evaluation criteria for this agent
  useEffect(() => {
    const fetchEvaluationCriteria = async () => {
      if (!agentUuid) return;

      try {
        setEvaluationCriteriaLoading(true);
        setEvaluationCriteriaError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/evaluation-criteria/agent/${agentUuid}`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              "ngrok-skip-browser-warning": "true",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch evaluation criteria");
        }

        const data: EvaluationCriteriaData[] = await response.json();
        setEvaluationCriteria(data);
      } catch (err) {
        console.error("Error fetching evaluation criteria:", err);
        setEvaluationCriteriaError(
          err instanceof Error
            ? err.message
            : "Failed to load evaluation criteria"
        );
      } finally {
        setEvaluationCriteriaLoading(false);
      }
    };

    fetchEvaluationCriteria();
  }, [agentUuid]);

  // Fetch data extraction fields for this agent
  useEffect(() => {
    const fetchDataExtractionFields = async () => {
      if (!agentUuid) return;

      try {
        setDataExtractionFieldsLoading(true);
        setDataExtractionFieldsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/data-extraction-fields/agent/${agentUuid}`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              "ngrok-skip-browser-warning": "true",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch data extraction fields");
        }

        const data: DataExtractionFieldData[] = await response.json();
        setDataExtractionFields(data);
      } catch (err) {
        console.error("Error fetching data extraction fields:", err);
        setDataExtractionFieldsError(
          err instanceof Error
            ? err.message
            : "Failed to load data extraction fields"
        );
      } finally {
        setDataExtractionFieldsLoading(false);
      }
    };

    fetchDataExtractionFields();
  }, [agentUuid]);

  // Update save function ref when relevant state changes
  useEffect(() => {
    saveRef.current = async () => {
      if (!agent) return;

      try {
        setIsSaving(true);
        isSavingRef.current = true;
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/agents/${agentUuid}`, {
          method: "PUT",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            name: agent.name,
            config: {
              system_prompt: systemPrompt,
              stt: { provider: sttProvider },
              tts: { provider: ttsProvider },
              llm: { model: selectedLLM?.id || "" },
              settings: { agent_speaks_first: agentSpeaksFirst },
              system_tools: { end_call: endConversationEnabled },
            },
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to save agent");
        }

        // Show success toast
        setShowSaveToast(true);
      } catch (err) {
        console.error("Error saving agent:", err);
        alert(err instanceof Error ? err.message : "Failed to save agent");
      } finally {
        setIsSaving(false);
        isSavingRef.current = false;
      }
    };
  }, [
    agent,
    agentUuid,
    systemPrompt,
    sttProvider,
    ttsProvider,
    selectedLLM,
    agentSpeaksFirst,
    endConversationEnabled,
  ]);

  // Update header when isSaving changes
  useEffect(() => {
    if (agent && onHeaderUpdate) {
      onHeaderUpdate(
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <Link
              href="/agents"
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
              title="Back to agents"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </Link>
            <h1 className="text-lg font-semibold">{agent.name}</h1>
          </div>
          <button
            onClick={() => saveRef.current()}
            disabled={isSaving}
            className="h-8 px-6 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving && (
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isSaving ? "" : "Save"}
          </button>
        </div>
      );
    }
  }, [agent, isSaving, onHeaderUpdate]);

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (showSaveToast) {
      const timer = setTimeout(() => {
        setShowSaveToast(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [showSaveToast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <span className="text-base text-muted-foreground">
            Loading agent...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-base text-red-500 mb-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-base text-muted-foreground">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs Navigation */}
      <div className="flex items-center gap-6 border-b border-border -mt-6">
        <button
          onClick={() => handleTabChange("agent")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "agent"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Agent
        </button>
        <button
          onClick={() => handleTabChange("tools")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "tools"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Tools
        </button>
        <button
          onClick={() => handleTabChange("data-extraction")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "data-extraction"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Data extraction
        </button>
        <button
          onClick={() => handleTabChange("evaluation")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "evaluation"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Evaluation
        </button>
        <button
          onClick={() => handleTabChange("settings")}
          className={`pb-2 text-base font-medium transition-colors cursor-pointer ${
            activeTab === "settings"
              ? "text-foreground border-b-2 border-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Settings
        </button>
      </div>

      {/* Agent Tab Content */}
      {activeTab === "agent" && (
        <div className="grid grid-cols-2 gap-8 h-[calc(100vh-200px)]">
          {/* Left Column: System Prompt */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <label className="text-base font-medium text-foreground">
                System prompt
              </label>
              <div className="relative group">
                <button className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                    />
                  </svg>
                </button>
                <div className="absolute left-0 top-full mt-2 w-72 p-3 bg-white text-gray-900 text-base leading-relaxed rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  The system prompt is used to determine the persona of the
                  agent and the context of the conversation.
                </div>
              </div>
            </div>
            <div className="bg-muted/30 rounded-xl overflow-hidden border border-border flex-1">
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="w-full h-full px-4 py-3 text-base bg-muted/30 text-foreground focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Right Column: STT, TTS, LLM */}
          <div className="space-y-8">
            {/* Speech To Text */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-medium text-foreground">
                    Speech To Text
                  </h3>
                  <p className="text-base text-muted-foreground mt-0.5">
                    Select the STT provider for the agent
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <div className="relative">
                  <select
                    value={sttProvider}
                    onChange={(e) => setSttProvider(e.target.value)}
                    className="w-full h-10 px-4 pr-10 rounded-md text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                  >
                    {sttProviders.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg
                      className="w-4 h-4 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Text To Speech */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-medium text-foreground">
                    Text To Speech
                  </h3>
                  <p className="text-base text-muted-foreground mt-0.5">
                    Select the TTS provider for the agent
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <div className="relative">
                  <select
                    value={ttsProvider}
                    onChange={(e) => setTtsProvider(e.target.value)}
                    className="w-full h-10 px-4 pr-10 rounded-md text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                  >
                    {ttsProviders.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                    <svg
                      className="w-4 h-4 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* LLM */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-medium text-foreground">LLM</h3>
                  <p className="text-base text-muted-foreground mt-0.5">
                    Select which provider and model to use for the LLM
                  </p>
                </div>
              </div>
              <div className="mt-3">
                <button
                  onClick={() => setLlmModalOpen(true)}
                  className="w-full h-10 px-4 rounded-md text-base border border-border bg-background hover:bg-muted/50 flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span
                    className={
                      selectedLLM ? "text-foreground" : "text-muted-foreground"
                    }
                  >
                    {selectedLLM ? selectedLLM.name : "Select LLM model"}
                  </span>
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LLM Selection Modal */}
      {llmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50">
          <div className="bg-background border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setLlmModalOpen(false)}
                  className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 19.5L8.25 12l7.5-7.5"
                    />
                  </svg>
                </button>
                <h2 className="text-base font-semibold">Select LLM</h2>
              </div>
              <button
                onClick={() => setLlmModalOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Search Input */}
            <div className="px-4 py-3 border-b border-border">
              <input
                type="text"
                value={llmSearchQuery}
                onChange={(e) => setLlmSearchQuery(e.target.value)}
                placeholder="Search LLM"
                className="w-full h-10 px-4 rounded-md text-base border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            {/* Models List */}
            <div className="flex-1 overflow-y-auto">
              {llmProviders.map((provider) => {
                const filteredModels = provider.models.filter(
                  (model) =>
                    model.name
                      .toLowerCase()
                      .includes(llmSearchQuery.toLowerCase()) ||
                    provider.name
                      .toLowerCase()
                      .includes(llmSearchQuery.toLowerCase())
                );
                if (filteredModels.length === 0) return null;
                return (
                  <div key={provider.name} className="py-2">
                    <h3 className="px-4 py-2 text-sm font-medium text-muted-foreground">
                      {provider.name}
                    </h3>
                    {filteredModels.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setSelectedLLM(model);
                          setLlmModalOpen(false);
                          setLlmSearchQuery("");
                        }}
                        className={`w-full px-4 py-3 flex items-center hover:bg-muted/50 transition-colors cursor-pointer ${
                          selectedLLM?.id === model.id ? "bg-muted/50" : ""
                        }`}
                      >
                        <span className="text-base font-medium text-foreground">
                          {model.name}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tools Tab Content */}
      {activeTab === "tools" && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setAddToolDialogOpen(true)}
              className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
            >
              Add tool
            </button>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Left Column - Tools List */}
            <div className="col-span-2 space-y-4">
              {/* Search Input */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg
                    className="w-5 h-5 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={toolsSearchQuery}
                  onChange={(e) => setToolsSearchQuery(e.target.value)}
                  placeholder="Search tools"
                  className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Tools List / Loading / Error / Empty State */}
              {agentToolsLoading ? (
                <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-5 h-5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                </div>
              ) : agentToolsError ? (
                <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
                  <p className="text-base text-red-500 mb-2">
                    {agentToolsError}
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              ) : agentTools.filter(
                  (tool) =>
                    tool.name
                      .toLowerCase()
                      .includes(toolsSearchQuery.toLowerCase()) ||
                    (tool.config?.description &&
                      tool.config?.description
                        .toLowerCase()
                        .includes(toolsSearchQuery.toLowerCase()))
                ).length === 0 ? (
                <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
                  <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
                    <svg
                      className="w-7 h-7 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    No tools found
                  </h3>
                  <p className="text-base text-muted-foreground mb-4">
                    {toolsSearchQuery
                      ? "No tools match your search"
                      : "No tools have been added to this agent yet"}
                  </p>
                  <button
                    onClick={() => setAddToolDialogOpen(true)}
                    className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    Add tool
                  </button>
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-3 border-b border-border bg-muted/30">
                    <div className="text-sm font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Description
                    </div>
                    <div className="w-10"></div>
                  </div>
                  {/* Table Body */}
                  {agentTools
                    .filter(
                      (tool) =>
                        tool.name
                          .toLowerCase()
                          .includes(toolsSearchQuery.toLowerCase()) ||
                        (tool.config?.description &&
                          tool.config?.description
                            .toLowerCase()
                            .includes(toolsSearchQuery.toLowerCase()))
                    )
                    .map((tool) => (
                      <div
                        key={tool.uuid}
                        className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                      >
                        {/* Name Column */}
                        <div className="flex items-center">
                          <div className="text-base font-medium text-foreground">
                            {tool.name}
                          </div>
                        </div>
                        {/* Description Column */}
                        <div className="flex items-center">
                          <p className="text-base text-muted-foreground line-clamp-2">
                            {tool.config?.description || "—"}
                          </p>
                        </div>
                        {/* Delete Button */}
                        <div className="flex items-center">
                          <button
                            onClick={() => {
                              setToolToDelete(tool);
                              setDeleteToolDialogOpen(true);
                            }}
                            className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Remove tool from agent"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Right Column - In-built Tools */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-medium text-foreground">
                  In-built tools
                </h3>
                <p className="text-base text-muted-foreground mt-0.5">
                  Allow the agent to perform built-in actions.
                </p>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                {/* Active tools counter */}
                <div className="px-4 py-3 bg-muted/30 border-b border-border">
                  <span className="text-base text-foreground">
                    {endConversationEnabled ? "1" : "0"} active tools
                  </span>
                </div>

                {/* In-built tools list */}
                {INBUILT_TOOLS.map((tool) => (
                  <div
                    key={tool.id}
                    className="px-4 py-3 flex items-center justify-between border-b border-border last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className="w-5 h-5 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={getInbuiltToolIcon(tool.icon)}
                        />
                      </svg>
                      <span className="text-base font-medium text-foreground">
                        {tool.name}
                      </span>
                    </div>
                    {/* Toggle Switch */}
                    <button
                      onClick={() => {
                        if (tool.id === "end_call") {
                          setEndConversationEnabled(!endConversationEnabled);
                        }
                      }}
                      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                        tool.id === "end_call" && endConversationEnabled
                          ? "bg-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-background transition-transform ${
                          tool.id === "end_call" && endConversationEnabled
                            ? "translate-x-5"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tool Dialog */}
      {addToolDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            {/* Dialog Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="text-base font-semibold">Add Tools</h2>
              <button
                onClick={() => {
                  setAddToolDialogOpen(false);
                  setAddToolDialogSearchQuery("");
                  setSelectedToolsForAdd(new Set());
                }}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Tools List */}
            <div className="flex-1 overflow-y-auto p-4">
              {allToolsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-3">
                    <svg
                      className="w-5 h-5 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  </div>
                </div>
              ) : (
                (() => {
                  // Filter out tools already added to the agent
                  const agentToolUuids = new Set(agentTools.map((t) => t.uuid));
                  const baseAvailableTools = allTools.filter(
                    (tool) => !agentToolUuids.has(tool.uuid)
                  );

                  // If no tools are available at all (all added to agent), show message without search
                  if (baseAvailableTools.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <p className="text-base text-muted-foreground">
                          All available tools have been added to this agent
                        </p>
                      </div>
                    );
                  }

                  // Filter by search query
                  const availableTools = baseAvailableTools.filter(
                    (tool) =>
                      tool.name
                        .toLowerCase()
                        .includes(addToolDialogSearchQuery.toLowerCase()) ||
                      (tool.config?.description &&
                        tool.config?.description
                          .toLowerCase()
                          .includes(addToolDialogSearchQuery.toLowerCase()))
                  );

                  return (
                    <>
                      {/* Search Input - only shown when there are tools to search */}
                      <div className="mb-4">
                        <input
                          type="text"
                          value={addToolDialogSearchQuery}
                          onChange={(e) =>
                            setAddToolDialogSearchQuery(e.target.value)
                          }
                          placeholder="Search tools"
                          className="w-full h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>

                      {availableTools.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <p className="text-base text-muted-foreground">
                            No tools match your search
                          </p>
                        </div>
                      ) : (
                        availableTools.map((tool) => {
                          const isSelected = selectedToolsForAdd.has(tool.uuid);
                          return (
                            <button
                              key={tool.uuid}
                              onClick={() => {
                                // Toggle tool selection
                                setSelectedToolsForAdd((prev) => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(tool.uuid)) {
                                    newSet.delete(tool.uuid);
                                  } else {
                                    newSet.add(tool.uuid);
                                  }
                                  return newSet;
                                });
                              }}
                              className={`w-full p-4 rounded-lg border transition-colors cursor-pointer text-left mb-3 last:mb-0 ${
                                isSelected
                                  ? "border-foreground bg-muted/50"
                                  : "border-border bg-muted/30 hover:bg-muted/50"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {/* Checkbox */}
                                <div
                                  className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
                                    isSelected
                                      ? "bg-foreground border-foreground"
                                      : "border-border"
                                  }`}
                                >
                                  {isSelected && (
                                    <svg
                                      className="w-3 h-3 text-background"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={3}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M4.5 12.75l6 6 9-13.5"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <div>
                                  <h4 className="text-base font-medium text-foreground">
                                    {tool.name}
                                  </h4>
                                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                    {tool.config?.description}
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </>
                  );
                })()
              )}
            </div>

            {/* Footer - only shown when tools are selected */}
            {selectedToolsForAdd.size > 0 && (
              <div className="px-4 py-3 border-t border-border flex items-center justify-end">
                <button
                  onClick={async () => {
                    try {
                      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
                      if (!backendUrl) {
                        throw new Error(
                          "BACKEND_URL environment variable is not set"
                        );
                      }

                      const toolUuidsToAdd = Array.from(selectedToolsForAdd);

                      const response = await fetch(
                        `${backendUrl}/agent-tools`,
                        {
                          method: "POST",
                          headers: {
                            accept: "application/json",
                            "Content-Type": "application/json",
                            "ngrok-skip-browser-warning": "true",
                          },
                          body: JSON.stringify({
                            agent_uuid: agentUuid,
                            tool_uuids: toolUuidsToAdd,
                          }),
                        }
                      );

                      if (!response.ok) {
                        throw new Error("Failed to add tools to agent");
                      }

                      // Add tools to local state
                      const addedTools = allTools.filter((tool) =>
                        toolUuidsToAdd.includes(tool.uuid)
                      );
                      setAgentTools((prev) => [...prev, ...addedTools]);

                      // Close dialog and reset state
                      setAddToolDialogOpen(false);
                      setAddToolDialogSearchQuery("");
                      setSelectedToolsForAdd(new Set());
                    } catch (err) {
                      console.error("Error adding tools to agent:", err);
                    }
                  }}
                  className="h-10 px-4 rounded-md text-sm font-medium bg-white text-gray-900 hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Add ({selectedToolsForAdd.size})
                </button>
              </div>
            )}
          </div>

          {/* Backdrop click to close */}
          <div
            className="absolute inset-0 -z-10"
            onClick={() => {
              setAddToolDialogOpen(false);
              setAddToolDialogSearchQuery("");
              setSelectedToolsForAdd(new Set());
            }}
          />
        </div>
      )}

      {/* Delete Tool Confirmation Dialog */}
      {deleteToolDialogOpen && toolToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border border-border rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground mb-2">
              Remove tool
            </h2>
            <p className="text-base text-muted-foreground mb-6">
              Are you sure you want to remove this tool from this agent?
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setDeleteToolDialogOpen(false);
                  setToolToDelete(null);
                }}
                disabled={isDeleting}
                className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
                    if (!backendUrl) {
                      throw new Error(
                        "BACKEND_URL environment variable is not set"
                      );
                    }

                    const response = await fetch(`${backendUrl}/agent-tools`, {
                      method: "DELETE",
                      headers: {
                        accept: "application/json",
                        "Content-Type": "application/json",
                        "ngrok-skip-browser-warning": "true",
                      },
                      body: JSON.stringify({
                        agent_uuid: agentUuid,
                        tool_uuid: toolToDelete.uuid,
                      }),
                    });

                    if (!response.ok) {
                      throw new Error("Failed to remove tool from agent");
                    }

                    // Remove tool from local state
                    setAgentTools((prev) =>
                      prev.filter((t) => t.uuid !== toolToDelete.uuid)
                    );

                    // Close dialog
                    setDeleteToolDialogOpen(false);
                    setToolToDelete(null);
                  } catch (err) {
                    console.error("Error removing tool from agent:", err);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={isDeleting}
                className="h-10 px-4 rounded-md text-sm font-medium bg-red-800 text-white hover:bg-red-900 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isDeleting && (
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                )}
                {isDeleting ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>

          {/* Backdrop click to close */}
          <div
            className="absolute inset-0 -z-10"
            onClick={() => {
              if (!isDeleting) {
                setDeleteToolDialogOpen(false);
                setToolToDelete(null);
              }
            }}
          />
        </div>
      )}

      {/* Evaluation Tab Content */}
      {activeTab === "evaluation" && (
        <div className="space-y-6">
          {/* Header with Add button */}
          {evaluationCriteria.length > 0 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  resetCriteriaForm();
                  setAddCriteriaSidebarOpen(true);
                }}
                className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Add criteria
              </button>
            </div>
          )}

          {/* Loading State */}
          {evaluationCriteriaLoading ? (
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            </div>
          ) : evaluationCriteriaError ? (
            /* Error State */
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <p className="text-base text-red-500 mb-2">
                {evaluationCriteriaError}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : evaluationCriteria.length === 0 ? (
            /* Empty State */
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
                <svg
                  className="w-7 h-7 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                No evaluation criteria defined
              </h3>
              <p className="text-base text-muted-foreground mb-4 text-center max-w-2xl">
                Define criteria to evaluate whether conversations were
                successful or not
              </p>
              <button
                onClick={() => {
                  resetCriteriaForm();
                  setAddCriteriaSidebarOpen(true);
                }}
                className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Add criteria
              </button>
            </div>
          ) : (
            /* Criteria List */
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-3 border-b border-border bg-muted/30">
                <div className="text-sm font-medium text-muted-foreground">
                  Name
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Description
                </div>
                <div className="w-10"></div>
              </div>
              {/* Table Body */}
              {evaluationCriteria.map((criteria) => (
                <div
                  key={criteria.uuid}
                  className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Name Column */}
                  <div className="flex items-center">
                    <div className="text-base font-medium text-foreground">
                      {criteria.name}
                    </div>
                  </div>
                  {/* Description Column */}
                  <div className="flex items-center">
                    <p className="text-base text-muted-foreground line-clamp-2">
                      {criteria.description || "—"}
                    </p>
                  </div>
                  {/* Delete Button */}
                  <div className="flex items-center">
                    <button
                      onClick={async () => {
                        if (
                          !confirm(
                            `Are you sure you want to delete "${criteria.name}"?`
                          )
                        )
                          return;

                        try {
                          const backendUrl =
                            process.env.NEXT_PUBLIC_BACKEND_URL;
                          if (!backendUrl) {
                            throw new Error(
                              "BACKEND_URL environment variable is not set"
                            );
                          }

                          const response = await fetch(
                            `${backendUrl}/evaluation-criteria/${criteria.uuid}`,
                            {
                              method: "DELETE",
                              headers: {
                                accept: "application/json",
                                "ngrok-skip-browser-warning": "true",
                              },
                            }
                          );

                          if (!response.ok) {
                            throw new Error(
                              "Failed to delete evaluation criteria"
                            );
                          }

                          // Remove from local state
                          setEvaluationCriteria((prev) =>
                            prev.filter((c) => c.uuid !== criteria.uuid)
                          );
                        } catch (err) {
                          console.error(
                            "Error deleting evaluation criteria:",
                            err
                          );
                          alert(
                            err instanceof Error
                              ? err.message
                              : "Failed to delete evaluation criteria"
                          );
                        }
                      }}
                      className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Delete criteria"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Evaluation Criteria Sidebar */}
      {addCriteriaSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetCriteriaForm();
              setAddCriteriaSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-full max-w-xl bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                  />
                </svg>
                <h2 className="text-lg font-semibold">
                  Add evaluation criteria
                </h2>
              </div>
              <button
                onClick={() => {
                  resetCriteriaForm();
                  setAddCriteriaSidebarOpen(false);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Criteria name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Criteria name
                </label>
                <input
                  type="text"
                  value={criteriaName}
                  placeholder="Enter the name of the criteria"
                  onChange={(e) => setCriteriaName(e.target.value)}
                  className="w-full h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Evaluation instructions */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Evaluation instructions
                </label>
                <textarea
                  value={criteriaInstructions}
                  onChange={(e) => setCriteriaInstructions(e.target.value)}
                  rows={10}
                  placeholder="Describe how the agent should evaluate whether the
                  conversation was a success"
                  className="w-full px-4 py-3 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              {createCriteriaError && (
                <p className="text-sm text-red-500">{createCriteriaError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetCriteriaForm();
                    setAddCriteriaSidebarOpen(false);
                  }}
                  disabled={isCreatingCriteria}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!criteriaName.trim()) return;

                    try {
                      setIsCreatingCriteria(true);
                      setCreateCriteriaError(null);
                      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
                      if (!backendUrl) {
                        throw new Error(
                          "BACKEND_URL environment variable is not set"
                        );
                      }

                      const response = await fetch(
                        `${backendUrl}/evaluation-criteria`,
                        {
                          method: "POST",
                          headers: {
                            accept: "application/json",
                            "Content-Type": "application/json",
                            "ngrok-skip-browser-warning": "true",
                          },
                          body: JSON.stringify({
                            name: criteriaName.trim(),
                            description: criteriaInstructions.trim(),
                            agent_id: agentUuid,
                          }),
                        }
                      );

                      if (!response.ok) {
                        throw new Error("Failed to create evaluation criteria");
                      }

                      const responseData = await response.json();

                      // Construct the criteria object using form data and response uuid
                      const newCriteria: EvaluationCriteriaData = {
                        uuid: responseData.uuid || responseData.id,
                        name: criteriaName.trim(),
                        description: criteriaInstructions.trim(),
                        agent_id: agentUuid,
                        created_at:
                          responseData.created_at || new Date().toISOString(),
                        updated_at:
                          responseData.updated_at || new Date().toISOString(),
                      };

                      // Add the new criteria to the list
                      setEvaluationCriteria((prev) => [...prev, newCriteria]);

                      // Reset and close
                      resetCriteriaForm();
                      setAddCriteriaSidebarOpen(false);
                    } catch (err) {
                      console.error("Error creating evaluation criteria:", err);
                      setCreateCriteriaError(
                        err instanceof Error
                          ? err.message
                          : "Failed to create evaluation criteria"
                      );
                    } finally {
                      setIsCreatingCriteria(false);
                    }
                  }}
                  disabled={isCreatingCriteria || !criteriaName.trim()}
                  className="h-10 px-4 rounded-md text-base font-medium bg-white text-gray-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingCriteria ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    "Add criteria"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Extraction Tab Content */}
      {activeTab === "data-extraction" && (
        <div className="space-y-6">
          {/* Header with Add button */}
          {dataExtractionFields.length > 0 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  resetDataPointForm();
                  setAddDataPointSidebarOpen(true);
                }}
                className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Add field
              </button>
            </div>
          )}

          {/* Loading State */}
          {dataExtractionFieldsLoading ? (
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            </div>
          ) : dataExtractionFieldsError ? (
            /* Error State */
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <p className="text-base text-red-500 mb-2">
                {dataExtractionFieldsError}
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : dataExtractionFields.length === 0 ? (
            /* Empty State */
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
                <svg
                  className="w-7 h-7 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M12 18.375h-7.5"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                No extraction fields defined
              </h3>
              <p className="text-base text-muted-foreground mb-4 text-center max-w-2xl">
                Define custom data specifications to extract from conversation
                transcripts
              </p>
              <button
                onClick={() => {
                  resetDataPointForm();
                  setAddDataPointSidebarOpen(true);
                }}
                className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Add field
              </button>
            </div>
          ) : (
            /* Fields List */
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[100px_1fr_2fr_auto] gap-4 px-4 py-3 border-b border-border bg-muted/30">
                <div className="text-sm font-medium text-muted-foreground">
                  Type
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Name
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Description
                </div>
                <div className="w-10"></div>
              </div>
              {/* Table Body */}
              {dataExtractionFields.map((field) => (
                <div
                  key={field.uuid}
                  className="grid grid-cols-[100px_1fr_2fr_auto] gap-4 px-4 py-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Type Column */}
                  <div className="flex items-center">
                    <span className="text-sm text-muted-foreground capitalize">
                      {field.type}
                    </span>
                  </div>
                  {/* Name Column */}
                  <div className="flex items-center">
                    <div className="text-base font-medium text-foreground">
                      {field.name}
                    </div>
                  </div>
                  {/* Description Column */}
                  <div className="flex items-center">
                    <p className="text-base text-muted-foreground line-clamp-2">
                      {field.description || "—"}
                    </p>
                  </div>
                  {/* Delete Button */}
                  <div className="flex items-center">
                    <button
                      onClick={async () => {
                        if (
                          !confirm(
                            `Are you sure you want to delete "${field.name}"?`
                          )
                        )
                          return;

                        try {
                          const backendUrl =
                            process.env.NEXT_PUBLIC_BACKEND_URL;
                          if (!backendUrl) {
                            throw new Error(
                              "BACKEND_URL environment variable is not set"
                            );
                          }

                          const response = await fetch(
                            `${backendUrl}/data-extraction-fields/${field.uuid}`,
                            {
                              method: "DELETE",
                              headers: {
                                accept: "application/json",
                                "ngrok-skip-browser-warning": "true",
                              },
                            }
                          );

                          if (!response.ok) {
                            throw new Error(
                              "Failed to delete data extraction field"
                            );
                          }

                          // Remove from local state
                          setDataExtractionFields((prev) =>
                            prev.filter((f) => f.uuid !== field.uuid)
                          );
                        } catch (err) {
                          console.error(
                            "Error deleting data extraction field:",
                            err
                          );
                          alert(
                            err instanceof Error
                              ? err.message
                              : "Failed to delete data extraction field"
                          );
                        }
                      }}
                      className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Delete field"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Data Point Sidebar */}
      {addDataPointSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetDataPointForm();
              setAddDataPointSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-full max-w-xl bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M12 18.375h-7.5"
                  />
                </svg>
                <h2 className="text-lg font-semibold">Add data point</h2>
              </div>
              <button
                onClick={() => {
                  resetDataPointForm();
                  setAddDataPointSidebarOpen(false);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full border border-border hover:bg-muted transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Data type and Identifier */}
              <div className="flex gap-4">
                <div className="w-40">
                  <label className="block text-sm font-medium mb-2">
                    Data type
                  </label>
                  <div className="relative">
                    <select
                      value={dataPointDataType}
                      onChange={(e) => setDataPointDataType(e.target.value)}
                      className="w-full h-10 pl-4 pr-10 rounded-md text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                    >
                      <option value="boolean">Boolean</option>
                      <option value="integer">Integer</option>
                      <option value="number">Number</option>
                      <option value="string">String</option>
                      <option value="object">Object</option>
                      <option value="array">Array</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className="w-4 h-4 text-muted-foreground"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">
                    Identifier
                  </label>
                  <input
                    type="text"
                    value={dataPointIdentifier}
                    onChange={(e) => setDataPointIdentifier(e.target.value)}
                    className="w-full h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={dataPointDescription}
                  onChange={(e) => setDataPointDescription(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                  placeholder="This field will be passed to the LLM and should describe in
                  detail how to extract the data from the transcript"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              {createDataPointError && (
                <p className="text-sm text-red-500">{createDataPointError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetDataPointForm();
                    setAddDataPointSidebarOpen(false);
                  }}
                  disabled={isCreatingDataPoint}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!dataPointIdentifier.trim()) return;

                    try {
                      setIsCreatingDataPoint(true);
                      setCreateDataPointError(null);
                      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
                      if (!backendUrl) {
                        throw new Error(
                          "BACKEND_URL environment variable is not set"
                        );
                      }

                      const response = await fetch(
                        `${backendUrl}/data-extraction-fields`,
                        {
                          method: "POST",
                          headers: {
                            accept: "application/json",
                            "Content-Type": "application/json",
                            "ngrok-skip-browser-warning": "true",
                          },
                          body: JSON.stringify({
                            type: dataPointDataType,
                            name: dataPointIdentifier.trim(),
                            description: dataPointDescription.trim(),
                            agent_id: agentUuid,
                          }),
                        }
                      );

                      if (!response.ok) {
                        throw new Error(
                          "Failed to create data extraction field"
                        );
                      }

                      const responseData = await response.json();

                      // Construct the field object using form data and response uuid
                      const newField: DataExtractionFieldData = {
                        uuid: responseData.uuid || responseData.id,
                        type: dataPointDataType,
                        name: dataPointIdentifier.trim(),
                        description: dataPointDescription.trim(),
                        agent_id: agentUuid,
                        created_at:
                          responseData.created_at || new Date().toISOString(),
                        updated_at:
                          responseData.updated_at || new Date().toISOString(),
                      };

                      // Add the new field to the list
                      setDataExtractionFields((prev) => [...prev, newField]);

                      // Reset and close
                      resetDataPointForm();
                      setAddDataPointSidebarOpen(false);
                    } catch (err) {
                      console.error(
                        "Error creating data extraction field:",
                        err
                      );
                      setCreateDataPointError(
                        err instanceof Error
                          ? err.message
                          : "Failed to create data extraction field"
                      );
                    } finally {
                      setIsCreatingDataPoint(false);
                    }
                  }}
                  disabled={isCreatingDataPoint || !dataPointIdentifier.trim()}
                  className="h-10 px-4 rounded-md text-base font-medium bg-white text-gray-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isCreatingDataPoint ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    "Add field"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab Content */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Toggle Switch */}
                <button
                  onClick={() => setAgentSpeaksFirst(!agentSpeaksFirst)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                    agentSpeaksFirst ? "bg-foreground" : "bg-muted"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-background transition-transform ${
                      agentSpeaksFirst ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <div>
                  <h3 className="text-base font-medium text-foreground">
                    Agent speaks first
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Whether the agent should initiate the conversation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {showSaveToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-3 bg-foreground text-background px-4 py-3 rounded-lg shadow-lg">
            <svg
              className="w-5 h-5 text-green-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium">Saved successfully</span>
            <button
              onClick={() => setShowSaveToast(false)}
              className="ml-2 hover:opacity-70 transition-opacity cursor-pointer"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
