"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
};

export function Tooltip({
  content,
  children,
  position = "top",
  className = "",
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const updateTooltipPosition = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current?.offsetHeight || 0;
    const tooltipWidth = tooltipRef.current?.offsetWidth || 0;
    const padding = 12; // Minimum distance from viewport edge
    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = rect.top - tooltipHeight - 8;
        left = rect.left + rect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2;
        break;
      case "left":
        top = rect.top + rect.height / 2;
        left = rect.left - tooltipWidth - 8;
        break;
      case "right":
        top = rect.top + rect.height / 2;
        left = rect.right + 8;
        break;
    }

    // Clamp horizontal position to keep tooltip within viewport
    if (position === "top" || position === "bottom") {
      const halfWidth = tooltipWidth / 2;
      const minLeft = halfWidth + padding;
      const maxLeft = window.innerWidth - halfWidth - padding;
      left = Math.max(minLeft, Math.min(maxLeft, left));
    } else {
      // For left/right positions, ensure tooltip doesn't go off horizontally
      if (left < padding) {
        left = padding;
      } else if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - tooltipWidth - padding;
      }
    }

    // Clamp vertical position to keep tooltip within viewport
    if (top < padding) {
      top = padding;
    } else if (top + tooltipHeight > window.innerHeight - padding) {
      top = window.innerHeight - tooltipHeight - padding;
    }

    setTooltipPosition({ top, left });
  };

  useEffect(() => {
    if (isVisible) {
      // Initial position calculation
      updateTooltipPosition();
      
      // Update position after tooltip renders to get accurate dimensions
      const timeoutId = setTimeout(() => {
        updateTooltipPosition();
      }, 0);

      window.addEventListener("scroll", updateTooltipPosition, true);
      window.addEventListener("resize", updateTooltipPosition);
      
      return () => {
        clearTimeout(timeoutId);
        window.removeEventListener("scroll", updateTooltipPosition, true);
        window.removeEventListener("resize", updateTooltipPosition);
      };
    }
  }, [isVisible, position, content]);

  const arrowClasses = {
    top: "top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white",
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 -mb-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[6px] border-b-white",
    left: "left-full top-1/2 -translate-y-1/2 -ml-1 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[6px] border-l-white",
    right:
      "right-full top-1/2 -translate-y-1/2 -mr-1 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-white",
  };

  const tooltipContent = isVisible && (
    <div
      ref={tooltipRef}
      className="fixed z-[9999] pointer-events-none"
      style={{
        top: `${tooltipPosition.top}px`,
        left: `${tooltipPosition.left}px`,
        transform: position === "top" || position === "bottom" ? "translateX(-50%)" : "translateY(-50%)",
      }}
    >
      <div className="px-3 py-2 text-xs text-gray-900 bg-white rounded-lg shadow-lg whitespace-normal break-words max-w-64 w-max">
        {content}
        {/* Arrow */}
        <div className={`absolute ${arrowClasses[position]}`}></div>
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative ${className}`}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {typeof window !== "undefined" &&
        createPortal(tooltipContent, document.body)}
    </>
  );
}
