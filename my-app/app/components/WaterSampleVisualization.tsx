"use client";

import { useId, useMemo } from "react";
import { motion } from "framer-motion";
import { WaterReading } from "@/types/hydrowatch";

type WaterSampleVisualizationProps = {
  reading?: WaterReading;
};

type SampleState = {
  badge: "Safe" | "Moderate" | "Warning" | "Unsafe";
  condition: string;
  water: string;
  surface: string;
  particle: string;
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
  const waterLevel = 406;
  const timestamp = reading
    ? new Date(reading.createdAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Waiting for reading";

  return (
    <section className={`relative overflow-hidden rounded-3xl border bg-[#111A38] p-6 shadow-2xl shadow-black/25 transition-colors duration-700 sm:p-7 ${state.ring}`}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm uppercase tracking-[0.2em] text-sky-300">
              Water Sample
            </p>
            <motion.span
              animate={state.pulse ? { opacity: [1, 0.58, 1], scale: [1, 1.04, 1] } : { opacity: 1, scale: 1 }}
              className={`rounded-full px-3 py-1 text-xs font-extrabold ring-1 ${state.text}`}
              transition={{ duration: 1.4, repeat: state.pulse ? Infinity : 0, ease: "easeInOut" }}
            >
              {state.badge}
            </motion.span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Stat label="Current NTU" value={reading ? `${ntu.toFixed(2)} NTU` : "-- NTU"} />
            <Stat label="Condition" value={state.condition} />
            <Stat label="Last Reading" value={timestamp} />
          </div>
        </div>

        <motion.div
          animate={state.pulse ? { boxShadow: ["0 0 0 rgba(248,113,113,0)", "0 0 38px rgba(248,113,113,0.24)", "0 0 0 rgba(248,113,113,0)"] } : {}}
          className="mx-auto w-full max-w-[430px] rounded-2xl bg-[#0B1128]/70 p-3"
          transition={{ duration: 1.8, repeat: state.pulse ? Infinity : 0, ease: "easeInOut" }}
        >
          <svg className="h-auto w-full" viewBox="0 0 500 520" role="img" aria-label={`${state.condition} water sample beaker`}>
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
            </g>

            <ellipse cx="250" cy="132" rx="142" ry="22" fill="none" stroke="url(#rim)" strokeWidth="8" />
            <path d="M114 132h272l-28 298c-2.8 28-25.6 49-53.8 49H195.8c-28.2 0-51-21-53.8-49L114 132Z" fill="none" stroke="url(#glass)" strokeWidth="7" />
            <path d="M155 150 177 420" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="12" opacity="0.16" />
            <path d="M349 152 327 426" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="7" opacity="0.18" />
            <path d="M185 116c20-15 108-15 130 0" stroke="#FFFFFF" strokeLinecap="round" strokeWidth="5" opacity="0.34" />
            <path d="M132 183h54M136 236h38M140 289h54M145 342h38" stroke="#E0F2FE" strokeLinecap="round" strokeWidth="4" opacity="0.28" />
          </svg>
        </motion.div>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 truncate text-xl font-extrabold text-white">{value}</p>
    </div>
  );
}

function getSampleState(ntu: number, hasReading: boolean): SampleState {
  if (!hasReading) {
    return {
      badge: "Safe",
      condition: "Awaiting sample",
      water: "#7DD3FC",
      surface: "#BAE6FD",
      particle: "#E0F2FE",
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
      water: "#6DDCFF",
      surface: "#DDF8FF",
      particle: "#E0F2FE",
      ring: "border-emerald-300/20",
      text: "bg-emerald-400/20 text-emerald-200 ring-emerald-300/40",
      opacity: 0.34,
      particleCount: 3,
      pulse: false,
    };
  }

  if (ntu <= 5) {
    return {
      badge: "Moderate",
      condition: "Slight haze",
      water: "#69CFEA",
      surface: "#BAE6FD",
      particle: "#CFFAFE",
      ring: "border-sky-300/25",
      text: "bg-sky-400/20 text-sky-200 ring-sky-300/40",
      opacity: 0.48,
      particleCount: 7,
      pulse: false,
    };
  }

  if (ntu <= 10) {
    return {
      badge: "Warning",
      condition: "Cloudy water",
      water: "#98B7A6",
      surface: "#D9E7C6",
      particle: "#FDE68A",
      ring: "border-yellow-300/30",
      text: "bg-yellow-400/20 text-yellow-100 ring-yellow-300/40",
      opacity: 0.66,
      particleCount: 13,
      pulse: false,
    };
  }

  return {
    badge: "Unsafe",
    condition: "Murky brown-gray water",
    water: "#75685D",
    surface: "#B7AA90",
    particle: "#D6B47A",
    ring: "border-red-400/35",
    text: "bg-red-500/20 text-red-100 ring-red-300/50",
    opacity: 0.84,
    particleCount: particles.length,
    pulse: true,
  };
}
