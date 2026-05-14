"use client";

export default function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = {
    sm: "h-4 w-4 border-2",
    md: "h-8 w-8 border-3",
    lg: "h-12 w-12 border-4",
  }[size];

  return (
    <div
      className={`${sizeClass} animate-spin rounded-full border-zinc-300 border-t-indigo-600`}
    />
  );
}
