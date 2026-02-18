"use client";

import { useEffect, useState } from "react";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";
import Link from "next/link";

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
    label: "LLM Evaluation",
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

import { WHATSAPP_INVITE_URL, DISCORD_INVITE_URL } from "@/constants/links";

const GITHUB_REPO_URL = "https://github.com/artpark-sahai-org/calibrate";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState("stt");
  const [getStartedTab, setGetStartedTab] = useState<"evaluate" | "learn">(
    "evaluate"
  );

  // Set page title
  useEffect(() => {
    document.title =
      "Calibrate | Evaluation and testing framework for voice agents";
  }, []);

  return (
    <div
      className="min-h-screen bg-white"
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, -apple-system, sans-serif",
      }}
    >
      <LandingHeader />

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

        <div className="relative max-w-4xl mx-auto px-4 md:px-8 pt-16 md:pt-24 pb-12 md:pb-16 text-center">
          <h1 className="text-4xl md:text-6xl font-medium text-gray-900 leading-[1.1] mb-4 md:mb-6 tracking-[-0.02em]">
            Simulation and evaluation 
            <br />
            studio for voice agents
          </h1>

          <p className="text-base md:text-xl text-gray-500 max-w-2xl mx-auto">
            Run simulations with realistic user personas for key scenarios and evaluate every component of your voice agent to ship with confidence  
          </p>

          {/* Launch Video */}
          <div className="mt-8 md:mt-12 w-full max-w-3xl mx-auto">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute top-0 left-0 w-full h-full rounded-xl shadow-lg"
                src="https://www.youtube.com/embed/_VS8KQbBxKs?autoplay=1&mute=1"
                title="Calibrate Launch Video"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </div>

      {/* Feature Tabs Section */}
      <div className="px-6 md:px-8 lg:px-12 pb-16 md:pb-20">
        {/* Tabs - Hidden on mobile */}
        <div className="hidden md:flex justify-center mb-8 md:mb-12 max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
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

        {/* Desktop: Tabbed view */}
        <div className="hidden md:grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 md:gap-8 items-start">
          {/* Left - Text Content */}
          <div className="text-left lg:sticky lg:top-8">
            <h2 className="text-2xl md:text-3xl lg:text-4xl leading-[1.2] tracking-[-0.01em] mb-4 md:mb-6">
              <span className="font-medium text-gray-900">
                {tabs.find((t) => t.id === activeTab)?.headingBold}
              </span>{" "}
              <span className="font-normal text-gray-400">
                {tabs.find((t) => t.id === activeTab)?.headingLight}
              </span>
            </h2>
            {/* Description */}
            <p className="text-sm md:text-base text-gray-500">
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
              )
            )}
          </div>
        </div>

        {/* Mobile: All sections stacked */}
        <div className="md:hidden space-y-12">
          {tabs.map((tab) => (
            <div key={tab.id} className="space-y-4">
              <div className="text-left">
                <h2 className="text-2xl leading-[1.2] tracking-[-0.01em] mb-3">
                  <span className="font-medium text-gray-900">
                    {tab.headingBold}
                  </span>{" "}
                  <span className="font-normal text-gray-400">
                    {tab.headingLight}
                  </span>
                </h2>
                <p className="text-sm text-gray-500">{tab.description}</p>
              </div>
              <div className="flex flex-col gap-4">
                {tab.images.map((src, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl overflow-hidden shadow-xl"
                  >
                    <img
                      src={src}
                      alt={`${tab.label} preview ${idx + 1}`}
                      className="w-full h-auto"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Integrations Section */}
      <div className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Works with any
            <br />
            voice agent stack
          </h2>
          <p className="text-base md:text-xl text-gray-500 mb-8 md:mb-10 max-w-2xl mx-auto">
            Supports all major STT, TTS, and LLM providers
            <br className="hidden md:block" /> with more coming soon
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4 mb-10 md:mb-16">
            <a
              href={`${process.env.NEXT_PUBLIC_DOCS_URL}/integrations`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              See all integrations
              <span>→</span>
            </a>
            <a
              href="https://forms.gle/AoGE6DMs7N4DNAK2A"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 md:px-6 py-2.5 md:py-3 text-sm md:text-base font-medium border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
            >
              Request an integration
              <span>→</span>
            </a>
          </div>

          {/* Integration Grid */}
          <div className="grid grid-cols-4 border border-gray-200 rounded-xl overflow-hidden">
            {/* Row 1 */}
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Deepgram
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                ElevenLabs
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                OpenAI
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Google
              </span>
            </div>
            {/* Row 2 */}
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Cartesia
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Anthropic
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Groq
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                DeepSeek
              </span>
            </div>
            {/* Row 3 */}
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Smallest AI
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Claude
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Gemini
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Qwen
              </span>
            </div>
            {/* Row 4 */}
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Meta
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Mistral
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Cohere
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-b border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Sarvam
              </span>
            </div>
            {/* Row 5 */}
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                AI21
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Baidu
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 border-r border-gray-200 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                NVIDIA
              </span>
            </div>
            <div className="flex items-center justify-center p-3 md:p-5 bg-gray-50">
              <span className="text-gray-900 text-xs md:text-sm font-medium text-center">
                Amazon
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Open Source Section */}
      <div className="bg-gray-50 py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Proudly open source
          </h2>
          <p className="text-base md:text-xl text-gray-500 mb-8 md:mb-10">
            Calibrate is committed to open source.{" "}
            <br className="hidden md:block" />
            You can either use the hosted version or run it{" "}
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-900 transition-colors"
            >
              locally
            </a>
          </p>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 md:gap-3 px-4 md:px-6 py-3 md:py-4 bg-gray-900 border border-gray-900 rounded-xl hover:bg-gray-800 transition-colors"
          >
            <svg
              className="w-6 h-6 md:w-8 md:h-8 text-white"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-white text-sm md:text-base font-medium">
              artpark-sahai-org/calibrate
            </span>
            <span className="text-gray-400">★</span>
          </a>
        </div>
      </div>

      {/* Join the Community Section */}
      <div
        id="join-community"
        className="bg-white py-16 md:py-24 px-4 md:px-8 lg:px-12 scroll-mt-20"
      >
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Join the community
          </h2>
          <p className="text-base md:text-xl text-gray-500 mb-8 md:mb-10">
            Talk to the team building Calibrate to get your questions answered
            and shape our roadmap
          </p>
          <div className="flex flex-col items-center gap-4 md:gap-6">
            <div className="flex items-center justify-center gap-3 md:gap-4">
              <a
                href={WHATSAPP_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-green-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </a>
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base border border-gray-300 rounded-lg text-gray-900 hover:bg-gray-50 transition-colors"
              >
                <svg
                  className="w-5 h-5 text-indigo-500"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                </svg>
                Discord
              </a>
            </div>
            <a
              href="https://cal.com/amandalmia/30min"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 text-sm md:text-base bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              Book a demo
            </a>
          </div>
        </div>
      </div>

      {/* Get Started Section */}
      <div className="bg-gray-50 py-16 md:py-20 px-4 md:px-8 lg:px-12">
        <div className="max-w-6xl mx-auto text-center mb-10 md:mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-3 md:mb-4 tracking-[-0.02em]">
            Start testing with Calibrate today
          </h2>
          <p className="text-base md:text-xl text-gray-500">
            Choose your path to start building better voice agents
          </p>
        </div>

        {/* Mobile: Segmented tabs */}
        <div className="md:hidden flex justify-center mb-6 max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            <button
              onClick={() => setGetStartedTab("evaluate")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
                getStartedTab === "evaluate"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Evaluate your agent
            </button>
            <button
              onClick={() => setGetStartedTab("learn")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer whitespace-nowrap ${
                getStartedTab === "learn"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Learn more
            </button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {/* Left Column - Evaluate */}
          <div
            className={`bg-gray-50 rounded-2xl p-4 md:p-8 border border-gray-200 ${
              getStartedTab === "learn" ? "hidden md:block" : ""
            }`}
          >
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">
              Evaluate your agent
            </h3>
            <div className="space-y-3 md:space-y-4">
              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/speech-to-text`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-text`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
                  <div className="font-medium text-gray-900">
                    LLM Evaluation
                  </div>
                  <div className="text-sm text-gray-500">
                    Test tool calling and response quality across models
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/text-to-speech`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/quickstart/simulations`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
          <div
            className={`bg-gray-50 rounded-2xl p-4 md:p-8 border border-gray-200 ${
              getStartedTab === "evaluate" ? "hidden md:block" : ""
            }`}
          >
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-4 md:mb-6">
              Learn more
            </h3>
            <div className="space-y-3 md:space-y-4">
              <a
                href="#"
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
                    See Calibrate in action with a guided walkthrough
                  </div>
                </div>
                <div className="text-gray-400 group-hover:text-gray-900 transition-colors">
                  →
                </div>
              </a>

              <a
                href={`${process.env.NEXT_PUBLIC_DOCS_URL}/core-concepts`}
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
                    Understand the core concepts underpinning Calibrate
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
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
                className="flex items-start gap-3 md:gap-4 p-3 md:p-4 rounded-xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all group"
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
      <div className="bg-gray-900 py-16 md:py-24 px-4 md:px-8 lg:px-12">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-white mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
            Ready to get started?
          </h2>
          <p className="text-base md:text-xl text-gray-400 mb-8 md:mb-10">
            Become a team that ships reliable voice agents beyond vibe checks
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 md:gap-3 px-6 md:px-8 py-3 md:py-4 bg-white hover:bg-gray-100 text-gray-800 text-sm md:text-base font-medium rounded-xl transition-all duration-200 cursor-pointer"
          >
            Get started free
            <span>→</span>
          </Link>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
