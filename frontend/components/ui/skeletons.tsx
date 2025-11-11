import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function GaugeSkeleton() {
  return (
    <div className="flex h-48 items-center justify-center">
      <div className="h-32 w-32 animate-pulse rounded-full border border-neutral-800 bg-neutral-900/80" />
    </div>
  )
}

export function AttackFrequencySkeleton() {
  return (
    <Card className="border border-neutral-800 bg-neutral-900/80">
      <CardHeader className="pb-2">
        <CardTitle className="h-4 w-36 animate-pulse rounded bg-neutral-800" />
      </CardHeader>
      <CardContent className="h-56">
        <div className="h-full animate-pulse rounded bg-neutral-800/60" />
      </CardContent>
    </Card>
  )
}

export function ListSkeleton() {
  return (
    <Card className="border border-neutral-800 bg-neutral-900/80">
      <CardHeader className="pb-2">
        <CardTitle className="h-4 w-48 animate-pulse rounded bg-neutral-800" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded bg-neutral-800/60" />
        ))}
      </CardContent>
    </Card>
  )
}


