"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

const tabs = [
  {
    id: "stt",
    label: "Speech to text",
    headingBold: "Benchmark providers",
    headingLight: "to find the best fit for your use case",
    description:
      "Go beyond simplistic rule-based metrics towards accurate evaluations by comparing the meaning of the transcriptions with the reference texts",
    images: ["/stt-leaderboard.png", "/stt-output.png"],
  },
  {
    id: "llm",
    label: "Text to text",
    headingBold: "Choose the best LLM",
    headingLight: "by evaluating multi-turn conversations",
    description:
      "Test the agent's tool calling and response quality by defining specific edge cases and benchmark them across multiple models, proprietary or open source",
    images: ["/llm-output.png", "/llm-ui.png"],
  },
  {
    id: "tts",
    label: "Text to speech",
    headingBold: "Select the perfect voice",
    headingLight: "for your agent",
    description:
      "Automated evaluations using models that compare the reference texts with the generated audio samples without an intermediate transcription step help you select the right provider",
    images: ["/tts-leaderboard.png", "/tts-output.png"],
  },

  {
    id: "simulations",
    label: "Simulations",
    headingBold: "Simulate realistic conversations",
    headingLight: "to catch bugs before deployment",
    description:
      "Define user personas and scenarios your agent should handle to run simulated conversations with automated evaluations based on metrics defined by you",
    images: ["/simulation-run.png"],
  },
];

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState("stt");

  // Set page title
  useEffect(() => {
    document.title = "Pense | Evaluation and testing framework for AI agents";
  }, []);

  const handleGoogleSignIn = () => {
    signIn("google", { callbackUrl: "/agents" });
  };

  const handleBookDemo = () => {
    window.open("https://cal.com/amandalmia/30min", "_blank");
  };

  return (
    <div
      className="min-h-screen bg-white"
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg
            className="w-8 h-8 text-black"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
            />
          </svg>
          <span className="text-xl font-bold tracking-tight text-black">
            PENSE
          </span>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://discord.gg/pense"
            target="_blank"
            rel="noopener noreferrer"
            className="px-5 py-2.5 border border-gray-300 text-gray-900 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Join Discord
          </a>
          <button
            onClick={handleBookDemo}
            className="px-5 py-2.5 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
          >
            Book a demo
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern
                id="grid"
                width="60"
                height="60"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 60 0 L 0 0 0 60"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>

        {/* Decorative circles */}
        <div className="absolute top-20 left-1/4 w-64 h-64 bg-emerald-100 rounded-full blur-3xl opacity-40"></div>
        <div className="absolute top-40 right-1/4 w-48 h-48 bg-blue-100 rounded-full blur-3xl opacity-40"></div>

        <div className="relative max-w-4xl mx-auto px-8 pt-24 pb-16 text-center">
          <h1 className="text-5xl md:text-6xl font-medium text-gray-900 leading-[1.1] mb-6 tracking-[-0.02em]">
            Build & scale your
            <br />
            AI agents with confidence
          </h1>

          <p className="text-xl text-gray-500 mb-12 max-w-2xl mx-auto">
            Evaluate every component of your agent, identify where it fails and
            rapidly improve performance with an automated agent testing process
          </p>

          {/* Main CTA - Continue with Google */}
          <button
            onClick={handleGoogleSignIn}
            className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white hover:bg-gray-50 text-gray-800 font-medium rounded-xl transition-all duration-200 shadow-lg shadow-gray-200/50 border border-gray-200 hover:shadow-xl hover:border-gray-300 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>

      {/* Feature Tabs Section */}
      <div className="px-12 pb-20">
        {/* Tabs */}
        <div className="flex justify-center mb-12 max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Two Column Layout - Text left, Images right */}
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-8 items-start">
          {/* Left - Text Content */}
          <div className="text-left lg:sticky lg:top-8">
            <h2 className="text-3xl md:text-4xl leading-[1.2] tracking-[-0.01em] mb-6">
              <span className="font-medium text-gray-900">
                {tabs.find((t) => t.id === activeTab)?.headingBold}
              </span>{" "}
              <span className="font-normal text-gray-400">
                {tabs.find((t) => t.id === activeTab)?.headingLight}
              </span>
            </h2>
            {/* Description */}
            <p className="text-gray-500">
              {tabs.find((t) => t.id === activeTab)?.description}
            </p>
          </div>

          {/* Right - Images Stack (one per row, full height) */}
          <div className="flex flex-col gap-4">
            {(tabs.find((t) => t.id === activeTab)?.images || []).map(
              (src, idx) => (
                <div key={idx} className="rounded-xl overflow-hidden shadow-xl">
                  <img
                    src={src}
                    alt={`Feature preview ${idx + 1}`}
                    className="w-full h-auto"
                  />
                </div>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Integrations Section */}
      <div className="bg-white py-24 px-12">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-medium text-gray-900 mb-6 leading-[1.1] tracking-[-0.02em]">
            Works with any
            <br />
            voice agent stack
          </h2>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            Python SDK and CLI for seamless integration,
            <br />
            supports all major STT, TTS, and LLM providers
            <br />
            with more coming soon
          </p>
          <div className="flex items-center justify-center gap-8 mb-16">
            <a
              href="https://penseapp.vercel.app/docs/integrations"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-900 hover:text-gray-600 transition-colors"
            >
              Integration overview
              <span>→</span>
            </a>
            <a
              href="https://forms.gle/AoGE6DMs7N4DNAK2A"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-900 hover:text-gray-600 transition-colors"
            >
              Request new integration
              <span>→</span>
            </a>
          </div>

          {/* Integration Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 border border-gray-200 rounded-xl overflow-hidden">
            {/* Row 1 */}
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">
                Deepgram
              </span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">
                ElevenLabs
              </span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">OpenAI</span>
            </div>
            <div className="flex items-center justify-center p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Google</span>
            </div>
            {/* Row 2 */}
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">
                Cartesia
              </span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">
                Anthropic
              </span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Groq</span>
            </div>
            <div className="flex items-center justify-center p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">
                DeepSeek
              </span>
            </div>
            {/* Row 3 */}
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">
                Smallest AI
              </span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Claude</span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Gemini</span>
            </div>
            <div className="flex items-center justify-center p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Qwen</span>
            </div>
            {/* Row 4 */}
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Meta</span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Mistral</span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Cohere</span>
            </div>
            <div className="flex items-center justify-center p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">
                Moonshot AI
              </span>
            </div>
            {/* Row 5 */}
            <div className="flex items-center justify-center p-5 border-r border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">AI21</span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Baidu</span>
            </div>
            <div className="flex items-center justify-center p-5 border-r border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">NVIDIA</span>
            </div>
            <div className="flex items-center justify-center p-5 bg-gray-50">
              <span className="text-gray-900 text-sm font-medium">Amazon</span>
            </div>
          </div>
        </div>
      </div>

      {/* Open Source Section */}
      <div className="bg-gray-50 py-24 px-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-medium text-gray-900 mb-6 leading-[1.1] tracking-[-0.02em]">
            Proudly open source
          </h2>
          <p className="text-xl text-gray-500 mb-10">
            Pense is committed to open source. <br />
            You can either use the hosted version or run it{" "}
            <a
              href="https://github.com/artpark-sahai-org/agentloop"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-900 transition-colors"
            >
              locally
            </a>
          </p>
          <a
            href="https://github.com/artpark-sahai-org/agentloop"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-6 py-4 bg-gray-900 border border-gray-900 rounded-xl hover:bg-gray-800 transition-colors"
          >
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-white font-medium">
              artpark-sahai-org/agentloop
            </span>
            <span className="text-gray-400">★</span>
          </a>
        </div>
      </div>

      {/* Join the Community Section */}
      <div className="bg-white py-24 px-12">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-medium text-gray-900 mb-6 leading-[1.1] tracking-[-0.02em]">
            Join the community
          </h2>
          <p className="text-xl text-gray-500 mb-10">
            Talk to the team building Pense to get your questions answered and
            shape our roadmap
          </p>
          <div className="flex items-center justify-center gap-6">
            <a
              href="https://x.com/artikiagents"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
            >
              Follow @artikiagents
              <span>→</span>
            </a>
            <a
              href="https://linkedin.com/company/artpark"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
            >
              Connect on LinkedIn
              <span>→</span>
            </a>
          </div>
        </div>
      </div>

      {/* Get Started Section */}
      <div className="bg-gray-50 py-20 px-12">
        <div className="max-w-6xl mx-auto text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-gray-900 mb-4 tracking-[-0.02em]">
            Start testing with Pense today
          </h2>
          <p className="text-xl text-gray-500">
            Choose your path to start building better AI agents
          </p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column - Evaluate */}
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              Evaluate your agent
            </h3>
            <div className="space-y-4">
              <a
                href="https://penseapp.vercel.app/docs/quickstart/speech-to-text"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Speech to Text
                  </div>
                  <div className="text-sm text-gray-500">
                    Compare accuracy across providers on your dataset
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://penseapp.vercel.app/docs/quickstart/text-to-text"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Text to Text</div>
                  <div className="text-sm text-gray-500">
                    Test tool calling and response quality across models
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://penseapp.vercel.app/docs/quickstart/text-to-speech"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Text to Speech
                  </div>
                  <div className="text-sm text-gray-500">
                    Automatically evaluate generated voices across providers
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://penseapp.vercel.app/docs/quickstart/simulations"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Run simulations
                  </div>
                  <div className="text-sm text-gray-500">
                    Simulate conversations with user personas and scenarios
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>
            </div>
          </div>

          {/* Right Column - Learn More */}
          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-900 mb-6">
              Learn more
            </h3>
            <div className="space-y-4">
              <a
                href="#"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Watch the demo
                  </div>
                  <div className="text-sm text-gray-500">
                    See Pense in action with a guided walkthrough
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://penseapp.vercel.app/docs/core-concepts"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Read documentation
                  </div>
                  <div className="text-sm text-gray-500">
                    Understand the core concepts underpinning Pense
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://cal.com/amandalmia/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">Book a demo</div>
                  <div className="text-sm text-gray-500">
                    Get a personalized walkthrough with our team
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href="https://voiceaiandvoiceagents.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                <div className="text-gray-400 mt-1">
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
                      d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">
                    Guide to voice agents
                  </div>
                  <div className="text-sm text-gray-500">
                    Learn to build production-ready voice AI applications
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Final CTA Section */}
      <div className="bg-gray-900 py-24 px-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-medium text-white mb-6 leading-[1.1] tracking-[-0.02em]">
            Ready to get started?
          </h2>
          <p className="text-xl text-gray-400 mb-10">
            Become a team that ships reliable AI agents beyond vibe checks
          </p>
          <button
            onClick={handleGoogleSignIn}
            className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl transition-all duration-200 cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-50 text-gray-500 py-16 px-12 border-t border-gray-200">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {/* Resources Column */}
            <div className="border-l border-gray-300 pl-8">
              <h3 className="text-gray-400 text-sm tracking-[0.2em] uppercase mb-6">
                Resources
              </h3>
              <ul className="space-y-4">
                <li>
                  <a
                    href="https://penseapp.vercel.app/docs"
                    className="hover:text-gray-900 transition-colors"
                  >
                    Documentation
                  </a>
                </li>
                <li>
                  <a
                    href="https://penseapp.vercel.app/docs/python-sdk/overview"
                    className="hover:text-gray-900 transition-colors"
                  >
                    Python SDK
                  </a>
                </li>
                <li>
                  <a
                    href="https://penseapp.vercel.app/docs/cli/overview"
                    className="hover:text-gray-900 transition-colors"
                  >
                    CLI
                  </a>
                </li>
                <li>
                  <a
                    href="https://docs.google.com/document/d/e/2PACX-1vTRkPJ3-aoibS0ySGfN62w-ytqZrsQ4EogQNTO01Ts4epzT8KJTXpbgSFV1Nb2xihnVpxniC11se5Cx/pub"
                    target="_blank"
                    className="hover:text-gray-900 transition-colors"
                  >
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a
                    href="https://docs.google.com/document/d/e/2PACX-1vRk2LZDD3ZtMHBocQVl5Qh14PtThP2nB1DFUsC0_9w028yx6LrDKHE77IgOxY-PojVgtyGp-hClts8l/pub"
                    target="_blank"
                    className="hover:text-gray-900 transition-colors"
                  >
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>

            {/* Community Column */}
            <div className="border-l border-gray-300 pl-8">
              <h3 className="text-gray-400 text-sm tracking-[0.2em] uppercase mb-6">
                Community
              </h3>
              <ul className="space-y-4">
                <li>
                  <a
                    href="https://discord.gg/pense"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gray-900 transition-colors"
                  >
                    Discord
                  </a>
                </li>
                <li>
                  <a
                    href="https://linkedin.com/company/artpark"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-gray-900 transition-colors"
                  >
                    LinkedIn
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-16 text-right text-gray-400 text-sm">
            © {new Date().getFullYear()}
          </div>
        </div>
      </footer>
    </div>
  );
}
