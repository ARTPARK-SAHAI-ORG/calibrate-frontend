"use client";

import { useEffect } from "react";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingFooter } from "@/components/LandingFooter";

export default function AboutPage() {
  useEffect(() => {
    document.title = "About Us | Calibrate";
  }, []);

  return (
    <div
      className="min-h-screen bg-white"
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, -apple-system, sans-serif",
      }}
    >
      <LandingHeader showLogoLink talkToUsHref="/login#join-community" />

      {/* Content */}
      <div className="max-w-4xl mx-auto px-8 py-24">
        

        {/* Mission Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-medium text-gray-900 mb-6 tracking-[-0.02em]">
            Our Vision
          </h2>
          <p className="text-lg text-gray-600 leading-relaxed mb-4">
            Voice AI is transforming how businesses interact with their
            customers. But building reliable voice agents is hard — there are
            countless providers for speech-to-text, text-to-speech, and LLMs,
            each with different strengths and trade-offs.
          </p>
          <p className="text-lg text-gray-600 leading-relaxed">
            Calibrate helps teams benchmark providers, test their agents with
            realistic simulations, and catch issues before they reach
            production. We believe that rigorous testing is the key to building
            voice agents that users can trust.
          </p>
        </div>

        {/* Team Section */}
        <div className="mb-16">
          <h2 className="text-3xl font-medium text-gray-900 mb-6 tracking-[-0.02em]">
            Team
          </h2>
          <div className="grid md:grid-cols-2 gap-8 max-w-xl">
            <a
              href="https://linkedin.com/in/aman-dalmia"
              target="_blank"
              rel="noopener noreferrer"
              className="text-center group"
            >
              <img
                src="/team/aman.jpeg"
                alt="Aman Dalmia"
                className="w-24 h-24 rounded-full mx-auto mb-4 object-cover bg-gray-200 group-hover:opacity-80 transition-opacity"
              />
              <h3 className="font-medium text-gray-900 group-hover:text-gray-600 transition-colors">
                Aman Dalmia
              </h3>
              <p className="text-sm text-gray-500">Principal ML Engineer</p>
            </a>
            <a
              href="https://linkedin.com/in/jigarkdoshi"
              target="_blank"
              rel="noopener noreferrer"
              className="text-center group"
            >
              <img
                src="/team/jigar.jpeg"
                alt="Jigar Doshi"
                className="w-24 h-24 rounded-full mx-auto mb-4 object-cover bg-gray-200 group-hover:opacity-80 transition-opacity"
              />
              <h3 className="font-medium text-gray-900 group-hover:text-gray-600 transition-colors">
                Jigar Doshi
              </h3>
              <p className="text-sm text-gray-500">Director of ML</p>
            </a>
          </div>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
