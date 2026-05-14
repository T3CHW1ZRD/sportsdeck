"use client";

export function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-700 h-4 ${className}`}
    />
  );
}

export function SkeletonAvatar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700 h-10 w-10 ${className}`}
    />
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 ${className}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <SkeletonAvatar className="h-8 w-8" />
        <SkeletonLine className="w-24" />
      </div>
      <SkeletonLine className="w-full mb-2" />
      <SkeletonLine className="w-3/4 mb-2" />
      <SkeletonLine className="w-1/2" />
    </div>
  );
}
