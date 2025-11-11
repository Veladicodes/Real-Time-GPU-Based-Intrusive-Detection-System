import { Volume2, VolumeX } from "lucide-react"

interface SoundToggleProps {
  muted: boolean
  onToggle: () => void
}

export function SoundToggle({ muted, onToggle }: SoundToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative flex items-center gap-2 rounded-sm border px-3 py-2 text-xs font-mono uppercase tracking-[0.3em] transition ${
        muted
          ? "border-brand/20 text-muted hover:border-brand/40 hover:text-brand"
          : "border-brand/40 text-brand shadow-glow hover:border-brand/60"
      }`}
    >
      {!muted && (
        <span className="absolute inset-0 animate-pulse rounded-sm border border-brand/40 opacity-60 blur-[1px]" />
      )}
      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      {muted ? "MUTED" : "AUDIO"}
    </button>
  )
}


