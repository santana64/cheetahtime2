"use client";

import { useEffect, useState } from "react";

/**
 * CheetahSprint — Speed streaks that sweep across the screen on mount.
 * Mimics the blur trails of a cheetah at full sprint.
 * Plays once then unmounts itself.
 */

const STREAKS = [
  { top: "7%",  color: "oklch(0.555 0.155 145)", width: "48vw", delay: "0ms",   dur: "0.54s", opacity: 0.60 },
  { top: "17%", color: "oklch(0.670 0.172 52)",  width: "64vw", delay: "55ms",  dur: "0.47s", opacity: 0.45 },
  { top: "29%", color: "oklch(0.355 0.118 145)", width: "36vw", delay: "110ms", dur: "0.61s", opacity: 0.35 },
  { top: "48%", color: "oklch(0.555 0.155 145)", width: "52vw", delay: "25ms",  dur: "0.51s", opacity: 0.28 },
  { top: "63%", color: "oklch(0.670 0.172 52)",  width: "42vw", delay: "85ms",  dur: "0.57s", opacity: 0.22 },
  { top: "80%", color: "oklch(0.555 0.155 145)", width: "30vw", delay: "140ms", dur: "0.66s", opacity: 0.16 },
] as const;

export function CheetahSprint() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide after the longest streak finishes (dur + delay + buffer)
    const timer = setTimeout(() => setVisible(false), 950);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 9997 }}
      aria-hidden="true"
    >
      {STREAKS.map((s, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: s.top,
            left: 0,
            width: s.width,
            height: "2px",
            borderRadius: "9999px",
            /* Beam: transparent tail → solid → transparent leading edge */
            background: `linear-gradient(
              90deg,
              transparent      0%,
              ${s.color}       28%,
              ${s.color}       72%,
              transparent      100%
            )`,
            opacity: s.opacity,
            animation: `speed-streak ${s.dur} cubic-bezier(0.06, 0.97, 0.37, 1) ${s.delay} both`,
          }}
        />
      ))}
    </div>
  );
}
