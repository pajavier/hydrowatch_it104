"use client";

import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { WaterReading } from "@/types/hydrowatch";

type WaterSampleVisualizationProps = {
  reading?: WaterReading;
};

export type SampleState = {
  badge: "Safe" | "Moderate" | "Warning" | "Unsafe";
  condition: string;
  water: string;
  surface: string;
  particle: string;
  sediment: string;
  sedimentOpacity: number;
  sedimentHeight: number;
  measureOpacity: number;
  ring: string;
  text: string;
  opacity: number;
  particleCount: number;
  pulse: boolean;
};

const particles = [
  { x: 126, y: 302, r: 2.2, d: 4.4 },
  { x: 166, y: 268, r: 1.6, d: 5.8 },
  { x: 211, y: 330, r: 2.7, d: 4.9 },
  { x: 254, y: 284, r: 1.8, d: 6.3 },
  { x: 302, y: 348, r: 2.1, d: 5.2 },
  { x: 340, y: 260, r: 1.4, d: 6.7 },
  { x: 372, y: 318, r: 2.9, d: 4.6 },
  { x: 143, y: 356, r: 1.7, d: 6.1 },
  { x: 194, y: 246, r: 2.4, d: 5.4 },
  { x: 236, y: 370, r: 1.5, d: 6.9 },
  { x: 286, y: 252, r: 2.8, d: 4.8 },
  { x: 328, y: 386, r: 1.9, d: 5.9 },
  { x: 360, y: 356, r: 2.5, d: 5.1 },
  { x: 153, y: 224, r: 1.3, d: 7.2 },
  { x: 222, y: 292, r: 2.3, d: 5.5 },
  { x: 274, y: 322, r: 1.6, d: 6.6 },
  { x: 318, y: 214, r: 2.2, d: 4.7 },
  { x: 350, y: 294, r: 1.7, d: 6.4 },
  { x: 179, y: 388, r: 2.6, d: 5.6 },
  { x: 243, y: 226, r: 1.9, d: 6.8 },
  { x: 295, y: 392, r: 3.1, d: 4.5 },
  { x: 384, y: 244, r: 2.2, d: 5.7 },
  { x: 122, y: 247, r: 1.5, d: 5.1 },
  { x: 136, y: 401, r: 2.9, d: 4.9 },
  { x: 161, y: 286, r: 2.5, d: 5.6 },
  { x: 187, y: 337, r: 1.8, d: 6.2 },
  { x: 206, y: 405, r: 3.2, d: 4.4 },
  { x: 229, y: 258, r: 1.6, d: 6.5 },
  { x: 251, y: 346, r: 2.7, d: 4.8 },
  { x: 267, y: 420, r: 2.1, d: 5.3 },
  { x: 291, y: 286, r: 3.3, d: 4.6 },
  { x: 314, y: 332, r: 1.7, d: 6.1 },
  { x: 335, y: 408, r: 3.5, d: 4.5 },
  { x: 354, y: 230, r: 2.6, d: 5.4 },
  { x: 375, y: 374, r: 1.9, d: 6.4 },
  { x: 398, y: 312, r: 3.1, d: 4.7 },
  { x: 151, y: 327, r: 3.4, d: 4.3 },
  { x: 177, y: 226, r: 2.1, d: 5.9 },
  { x: 217, y: 379, r: 3.7, d: 4.2 },
  { x: 276, y: 238, r: 2.4, d: 5.8 },
  { x: 322, y: 371, r: 2.8, d: 5.0 },
  { x: 366, y: 418, r: 3.6, d: 4.1 },
  { x: 392, y: 268, r: 2.3, d: 5.7 },
  { x: 117, y: 352, r: 2.0, d: 6.0 },
  { x: 342, y: 304, r: 3.8, d: 4.0 },
  { x: 251, y: 302, r: 3.0, d: 4.6 },
];

export function WaterSampleVisualization({ reading }: WaterSampleVisualizationProps) {
  const clipId = useId();
  const glowId = useId();
  const ntu = reading?.turbidity ?? 0;
  const state = getSampleState(ntu, Boolean(reading));
  const visibleParticles = useMemo(
    () => particles.slice(0, state.particleCount),
    [state.particleCount],
  );
  const waterLevel = 210;

  return (
    <motion.div
      animate={state.pulse ? { filter: ["drop-shadow(0 0 0 rgba(248,113,113,0))", "drop-shadow(0 0 28px rgba(248,113,113,0.34))", "drop-shadow(0 0 0 rgba(248,113,113,0))"] } : {}}
      className="relative flex min-h-[340px] w-full items-center justify-center overflow-visible px-2 py-3 sm:min-h-[370px] lg:min-h-[400px]"
      transition={{ duration: 1.8, repeat: state.pulse ? Infinity : 0, ease: "easeInOut" }}
    >
          <div className="absolute bottom-8 h-8 w-52 rounded-full bg-sky-300/10 blur-xl" />
          <div className="absolute bottom-9 h-5 w-40 rounded-full bg-black/35 blur-md" />
          <svg className="relative h-[340px] w-auto max-w-full sm:h-[370px] lg:h-[400px]" viewBox="0 0 500 520" role="img" aria-label={`${state.condition} water sample beaker`}>
            <defs>
              <clipPath id={clipId}>
                <path d="M114 132h272l-28 298c-2.8 28-25.6 49-53.8 49H195.8c-28.2 0-51-21-53.8-49L114 132Z" />
              </clipPath>
              <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.4 0 1 0 0 0.75 0 0 1 0 1 0 0 0 0.35 0" />
                <feBlend in="SourceGraphic" />
              </filter>
              <linearGradient id="glass" x1="98" x2="396" y1="116" y2="472" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFFFFF" stopOpacity="0.34" />
                <stop offset="0.48" stopColor="#B8E7FF" stopOpacity="0.08" />
                <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.22" />
              </linearGradient>
              <linearGradient id="rim" x1="94" x2="406" y1="104" y2="150" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F8FDFF" stopOpacity="0.72" />
                <stop offset="0.5" stopColor="#BAE6FD" stopOpacity="0.22" />
                <stop offset="1" stopColor="#F8FDFF" stopOpacity="0.62" />
              </linearGradient>
            </defs>

            <ellipse cx="250" cy="474" rx="128" ry="18" fill="#020617" opacity="0.45" />
            <path d="M114 132h272l-28 298c-2.8 28-25.6 49-53.8 49H195.8c-28.2 0-51-21-53.8-49L114 132Z" fill="#DFF8FF" opacity="0.05" />

            <motion.g
              animate={{ opacity: state.measureOpacity }}
              clipPath={`url(#${clipId})`}
              transition={{ duration: 0.8 }}
            >
              <path d="M132 183h54M136 236h38M140 289h54M145 342h38" stroke="#E0F2FE" strokeLinecap="round" strokeWidth="4" />
            </motion.g>

            <g clipPath={`url(#${clipId})`}>
              <motion.path
                animate={{
                  d: [
                    `M80 ${waterLevel} C132 ${waterLevel - 18} 184 ${waterLevel + 18} 236 ${waterLevel} S340 ${waterLevel - 18} 392 ${waterLevel} S464 ${waterLevel + 16} 520 ${waterLevel} V520 H80 Z`,
                    `M80 ${waterLevel} C132 ${waterLevel + 16} 184 ${waterLevel - 18} 236 ${waterLevel} S340 ${waterLevel + 18} 392 ${waterLevel} S464 ${waterLevel - 16} 520 ${waterLevel} V520 H80 Z`,
                  ],
                  fill: state.water,
                  opacity: state.opacity,
                }}
                filter={`url(#${glowId})`}
                transition={{
                  d: { duration: 4.2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
                  fill: { duration: 0.8 },
                  opacity: { duration: 0.8 },
                }}
              />
              <motion.path
                animate={{
                  d: [
                    `M82 ${waterLevel - 2} C134 ${waterLevel - 25} 178 ${waterLevel + 10} 232 ${waterLevel - 4} S342 ${waterLevel - 20} 394 ${waterLevel - 2} S462 ${waterLevel + 10} 518 ${waterLevel - 4}`,
                    `M82 ${waterLevel - 2} C134 ${waterLevel + 12} 178 ${waterLevel - 24} 232 ${waterLevel - 4} S342 ${waterLevel + 14} 394 ${waterLevel - 2} S462 ${waterLevel - 22} 518 ${waterLevel - 4}`,
                  ],
                  stroke: state.surface,
                }}
                fill="none"
                strokeLinecap="round"
                strokeWidth="7"
                transition={{
                  d: { duration: 3.6, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
                  stroke: { duration: 0.8 },
                }}
              />

              {visibleParticles.map((particle, index) => (
                <motion.circle
                  animate={{
                    cx: [particle.x, particle.x + (index % 2 === 0 ? 10 : -10), particle.x],
                    cy: [particle.y, particle.y - 20, particle.y],
                    opacity: [0.28, 0.9, 0.28],
                  }}
                  fill={state.particle}
                  key={`${particle.x}-${particle.y}`}
                  r={particle.r}
                  transition={{
                    duration: particle.d,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: index * 0.13,
                  }}
                />
              ))}

              <motion.path
                animate={{
                  d: `M130 ${468 - state.sedimentHeight} C170 ${462 - state.sedimentHeight * 0.18} 205 ${476 - state.sedimentHeight * 0.08} 246 ${466 - state.sedimentHeight * 0.2} S322 ${462 - state.sedimentHeight * 0.08} 370 ${468 - state.sedimentHeight} V520 H130 Z`,
                  fill: state.sediment,
                  opacity: state.sedimentOpacity,
                }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              />
            </g>

            <ellipse cx="250" cy="132" rx="142" ry="22" fill="none" stroke="url(#rim)" strokeWidth="8" />
            <path d="M114 132h272l-28 298c-2.8 28-25.6 49-53.8 49H195.8c-28.2 0-51-21-53.8-49L114 132Z" fill="none" stroke="url(#glass)" strokeWidth="7" />
            <path d="M155 150 177 420" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="12" opacity="0.16" />
            <path d="M349 152 327 426" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="7" opacity="0.18" />
            <path d="M185 116c20-15 108-15 130 0" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="5" opacity="0.34" />
          </svg>
    </motion.div>
  );
}

export function getWaterSampleState(ntu: number, hasReading: boolean): SampleState {
  return getSampleState(ntu, hasReading);
}

function getSampleState(ntu: number, hasReading: boolean): SampleState {
  const normalizedTurbidity = Math.max(0, Math.min(1, ntu / 15));
  const waterColor = interpolateColor(
    [
      [0, "#7DD3FC"],
      [0.18, "#74B9CC"],
      [0.48, "#9A8D77"],
      [1, "#4F392B"],
    ],
    normalizedTurbidity,
  );
  const surfaceColor = interpolateColor(
    [
      [0, "#DDF8FF"],
      [0.28, "#B8D5D8"],
      [0.62, "#B6A07E"],
      [1, "#8A6D4E"],
    ],
    normalizedTurbidity,
  );
  const sedimentColor = interpolateColor(
    [
      [0, "#CDBF91"],
      [0.38, "#A18452"],
      [0.72, "#765334"],
      [1, "#3F2D20"],
    ],
    normalizedTurbidity,
  );
  const particleColor = interpolateColor(
    [
      [0, "#E0F2FE"],
      [0.4, "#E9D7A0"],
      [1, "#B98652"],
    ],
    normalizedTurbidity,
  );
  const opacity = 0.26 + normalizedTurbidity * 0.66;
  const particleCount = Math.round(2 + normalizedTurbidity * (particles.length - 2));
  const sedimentHeight = normalizedTurbidity < 0.15 ? normalizedTurbidity * 35 : 8 + normalizedTurbidity * 52;
  const sedimentOpacity = Math.max(0, normalizedTurbidity - 0.08) * 0.78;
  const measureOpacity = 0.3 - normalizedTurbidity * 0.26;

  if (!hasReading) {
    return {
      badge: "Safe",
      condition: "Awaiting sample",
      water: "#7DD3FC",
      surface: "#BAE6FD",
      particle: "#E0F2FE",
      sediment: "#B8A77A",
      sedimentOpacity: 0,
      sedimentHeight: 0,
      measureOpacity: 0.28,
      ring: "border-white/10",
      text: "bg-slate-500/20 text-slate-200 ring-slate-300/30",
      opacity: 0.28,
      particleCount: 2,
      pulse: false,
    };
  }

  if (ntu <= 1) {
    return {
      badge: "Safe",
      condition: "Crystal clear water",
      water: waterColor,
      surface: surfaceColor,
      particle: particleColor,
      sediment: sedimentColor,
      sedimentOpacity,
      sedimentHeight,
      measureOpacity,
      ring: "border-emerald-300/20",
      text: "bg-emerald-400/20 text-emerald-200 ring-emerald-300/40",
      opacity,
      particleCount,
      pulse: false,
    };
  }

  if (ntu <= 5) {
    return {
      badge: "Moderate",
      condition: "Slight haze",
      water: waterColor,
      surface: surfaceColor,
      particle: particleColor,
      sediment: sedimentColor,
      sedimentOpacity,
      sedimentHeight,
      measureOpacity,
      ring: "border-sky-300/25",
      text: "bg-sky-400/20 text-sky-200 ring-sky-300/40",
      opacity,
      particleCount,
      pulse: false,
    };
  }

  if (ntu <= 10) {
    return {
      badge: "Warning",
      condition: "Cloudy water",
      water: waterColor,
      surface: surfaceColor,
      particle: particleColor,
      sediment: sedimentColor,
      sedimentOpacity,
      sedimentHeight,
      measureOpacity,
      ring: "border-yellow-300/30",
      text: "bg-yellow-400/20 text-yellow-100 ring-yellow-300/40",
      opacity,
      particleCount,
      pulse: false,
    };
  }

  return {
    badge: "Unsafe",
    condition: "Murky brown-gray water",
    water: waterColor,
    surface: surfaceColor,
    particle: particleColor,
    sediment: sedimentColor,
    sedimentOpacity,
    sedimentHeight,
    measureOpacity,
    ring: "border-red-400/35",
    text: "bg-red-500/20 text-red-100 ring-red-300/50",
    opacity,
    particleCount,
    pulse: true,
  };
}

function interpolateColor(stops: Array<[number, string]>, value: number) {
  const upperIndex = stops.findIndex(([stop]) => value <= stop);
  if (upperIndex <= 0) return stops[0][1];

  const [lowerStop, lowerColor] = stops[upperIndex - 1];
  const [upperStop, upperColor] = stops[upperIndex];
  const localValue = (value - lowerStop) / (upperStop - lowerStop);
  const lower = hexToRgb(lowerColor);
  const upper = hexToRgb(upperColor);

  return rgbToHex({
    r: lower.r + (upper.r - lower.r) * localValue,
    g: lower.g + (upper.g - lower.g) * localValue,
    b: lower.b + (upper.b - lower.b) * localValue,
  });
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}
