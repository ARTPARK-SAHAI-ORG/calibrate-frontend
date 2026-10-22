"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
  /** Above or below, line the popup's right edge up with the trigger's own
   *  instead of centring it. For a wide popup near the right of the window. */
  alignEnd?: boolean;
  /** Styles on the popup itself. Use this for width: a utility class would
   *  fight the built-in cap and lose, depending on stylesheet order. */
  contentStyle?: React.CSSProperties;
};

export function Tooltip({
  content,
  children,
  position = "top",
  className = "",
  alignEnd = false,
  contentStyle,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  // `side` is the side the popup ended up on, which is not always the one
  // asked for: near the top or bottom of the window it flips to the other
  // side rather than sliding over the thing it describes.
  const [tooltipPosition, setTooltipPosition] = useState({
    top: 0,
    left: 0,
    side: position,
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // Closing is delayed so the pointer can cross the 8px gap between the
  // trigger and the popup without the popup vanishing on the way. Hovering
  // the popup itself cancels the pending close, so a popup holding pills or
  // links can be read and reached.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleared and forgotten together, so "is a close pending" stays truthful.
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    setIsVisible(true);
  };
  const hide = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setIsVisible(false);
    }, 150);
  };
  const hideNow = () => {
    cancelClose();
    setIsVisible(false);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
    },
    [],
  );

  const updateTooltipPosition = () => {
    if (!triggerRef.current) return;
    // A click has already asked this to close and the popup is living out its
    // grace period. Re-measuring now can catch the trigger mid-teardown, e.g.
    // its tab being hidden, and park the popup in the corner on the way out.
    if (closeTimer.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current?.offsetHeight || 0;
    const tooltipWidth = tooltipRef.current?.offsetWidth || 0;
    const padding = 12; // Minimum distance from viewport edge
    let top = 0;
    let left = 0;

    // Flip to the opposite side when the popup would not fit, and only when
    // it does fit there. Sliding it back into view instead would park it on
    // top of the thing it describes, hiding it and leaving the arrow
    // pointing at nothing.
    const fitsAbove = rect.top - tooltipHeight - 8 >= padding;
    const fitsBelow =
      rect.bottom + 8 + tooltipHeight <= window.innerHeight - padding;
    const fitsLeft = rect.left - tooltipWidth - 8 >= padding;
    const fitsRight =
      rect.right + 8 + tooltipWidth <= window.innerWidth - padding;

    let side = position;
    if (position === "top" && !fitsAbove && fitsBelow) side = "bottom";
    else if (position === "bottom" && !fitsBelow && fitsAbove) side = "top";
    else if (position === "left" && !fitsLeft && fitsRight) side = "right";
    else if (position === "right" && !fitsRight && fitsLeft) side = "left";

    switch (side) {
      case "top":
        top = rect.top - tooltipHeight - 8;
        left = alignEnd ? rect.right : rect.left + rect.width / 2;
        break;
      case "bottom":
        top = rect.bottom + 8;
        left = alignEnd ? rect.right : rect.left + rect.width / 2;
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

    // Clamp horizontal position to keep tooltip within viewport. What `left`
    // means depends on the alignment: the popup's centre, or its right edge.
    if (side === "top" || side === "bottom") {
      const before = alignEnd ? tooltipWidth : tooltipWidth / 2;
      const after = alignEnd ? 0 : tooltipWidth / 2;
      const minLeft = before + padding;
      const maxLeft = window.innerWidth - after - padding;
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

    setTooltipPosition({ top, left, side });
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
      className="fixed z-[9999]"
      onMouseEnter={show}
      onMouseLeave={hide}
      // Clicking something inside the popup usually opens a dialog over it,
      // and the pointer never leaves, so close the popup on the way. Closing
      // is left to `hide`'s timer on purpose: closing here and now tears the
      // popup down mid-click, and whatever was clicked never gets to run.
      onClickCapture={hide}
      style={{
        top: `${tooltipPosition.top}px`,
        left: `${tooltipPosition.left}px`,
        transform:
          tooltipPosition.side === "top" || tooltipPosition.side === "bottom"
            ? alignEnd
              ? "translateX(-100%)"
              : "translateX(-50%)"
            : "translateY(-50%)",
      }}
    >
      <div
        className={`px-3 py-2 text-xs text-gray-900 bg-white rounded-lg shadow-lg whitespace-normal break-words max-w-64 w-max`}
        style={contentStyle}
      >
        {content}
        {/* Arrow */}
        <div
          className={`absolute ${arrowClasses[tooltipPosition.side]} ${
            alignEnd &&
            (tooltipPosition.side === "top" ||
              tooltipPosition.side === "bottom")
              ? "left-auto right-4 translate-x-0"
              : ""
          }`}
        ></div>
      </div>
    </div>
  );

  return (
    <>
      <div
        ref={triggerRef}
        className={`relative ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        // Hide on click too: clicking the trigger often opens a dialog/overlay
        // on top of it, so the pointer never physically leaves and no
        // mouseleave fires — leaving the tooltip stuck on screen. Use the
        // capture phase so it still fires when the child button calls
        // stopPropagation() in its own (bubble-phase) onClick.
        onClickCapture={hideNow}
      >
        {children}
      </div>
      {typeof window !== "undefined" &&
        createPortal(tooltipContent, document.body)}
    </>
  );
}
