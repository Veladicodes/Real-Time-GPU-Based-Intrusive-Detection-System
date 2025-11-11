"use client";

import { useEffect, useState } from "react";

import { useUIAudio } from "@/hooks/useUIAudio";

export const AudioToggle = () => {
  const { muted, toggleMute } = useUIAudio();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const label = hydrated ? (muted ? "🔇 Audio Off" : "🔊 Audio On") : "🔇 Audio Off";

  return (
    <button
      aria-label="Toggle system audio"
      onClick={toggleMute}
      className="rounded bg-black/40 px-3 py-1 text-sm text-orange-400 transition hover:bg-orange-300 focus:outline-none focus:ring focus:ring-orange-500"
      type="button"
    >
      {label}
    </button>
  );
};


