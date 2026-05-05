export function AboutMarketingSection() {
  return (
    <div className="text-center">
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-gray-900 mb-4 md:mb-6 leading-[1.1] tracking-[-0.02em]">
        Team
      </h2>
      <p className="text-base md:text-xl text-gray-500 max-w-2xl mx-auto mb-10 md:mb-14">
        Combined experience of 25+ years building AI systems
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-3xl mx-auto text-left">
        <a
          href="https://linkedin.com/in/aman-dalmia"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Aman Dalmia on LinkedIn"
          className="group flex flex-col sm:flex-row sm:items-center gap-4 md:gap-5 rounded-2xl border border-gray-200 bg-white p-5 md:p-7 shadow-sm hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
        >
          <img
            src="/team/aman.jpeg"
            alt="Aman Dalmia"
            width={112}
            height={112}
            className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-full object-cover bg-gray-200 mx-auto sm:mx-0"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
              Aman Dalmia
            </h3>
            <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed mt-1">
              Principal ML Engineer, Artpark
            </p>
            <p
              className="text-sm font-medium text-gray-900 mt-3 inline-flex items-center gap-1 decoration-gray-300 underline-offset-4 group-hover:underline"
              aria-hidden
            >
              LinkedIn
              <span aria-hidden>→</span>
            </p>
          </div>
        </a>
        <a
          href="https://linkedin.com/in/jigarkdoshi"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Jigar Doshi on LinkedIn"
          className="group flex flex-col sm:flex-row sm:items-center gap-4 md:gap-5 rounded-2xl border border-gray-200 bg-white p-5 md:p-7 shadow-sm hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
        >
          <img
            src="/team/jigar.jpeg"
            alt="Jigar Doshi"
            width={112}
            height={112}
            className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-full object-cover bg-gray-200 mx-auto sm:mx-0"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gray-700 transition-colors">
              Jigar Doshi
            </h3>
            <p className="text-sm md:text-[15px] text-gray-500 leading-relaxed mt-1">
              Director of ML, Artpark
            </p>
            <p
              className="text-sm font-medium text-gray-900 mt-3 inline-flex items-center gap-1 decoration-gray-300 underline-offset-4 group-hover:underline"
              aria-hidden
            >
              LinkedIn
              <span aria-hidden>→</span>
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
