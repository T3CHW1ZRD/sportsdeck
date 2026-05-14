"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface Digest {
  id: number;
  content: string;
  date: string;
  createdAt: string;
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          {listItems.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inlineFormat(item) }} />
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  const inlineFormat = (str: string): string => {
    // Bold
    str = str.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-zinc-900 dark:text-zinc-100">$1</strong>');
    // Italic
    str = str.replace(/\*(.+?)\*/g, "<em>$1</em>");
    return str;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // H2
    if (trimmed.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={key++} className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mt-6 mb-2 first:mt-0">
          {trimmed.slice(3)}
        </h2>
      );
      continue;
    }

    // H3
    if (trimmed.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mt-4 mb-1">
          {trimmed.slice(4)}
        </h3>
      );
      continue;
    }

    // H1
    if (trimmed.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={key++} className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mt-6 mb-2 first:mt-0">
          {trimmed.slice(2)}
        </h1>
      );
      continue;
    }

    // Bullet point
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listItems.push(trimmed.slice(2));
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      listItems.push(trimmed.replace(/^\d+\.\s/, ""));
      continue;
    }

    // Paragraph
    flushList();
    elements.push(
      <p
        key={key++}
        className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300"
        dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }}
      />
    );
  }

  flushList();
  return elements;
}

export default function DigestPage() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await api.get<{ digest: Digest }>("/ai/digest", { skipAuth: true });
      if (err || !data?.digest) {
        setError(true);
      } else {
        setDigest(data.digest);
      }
      setLoading(false);
    }
    load();
  }, []);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-zinc-200 dark:bg-zinc-700 rounded w-48" />
          <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-32" />
          <div className="mt-6 space-y-3">
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-5/6" />
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-full" />
            <div className="h-4 bg-zinc-200 dark:bg-zinc-700 rounded w-4/6" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !digest) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">Daily Digest</h1>
        <p className="text-sm text-zinc-500 mb-6">{today}</p>
        <div className="p-6 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">No digest for today yet. Check back later!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="relative rounded-2xl overflow-hidden mb-6 h-32 border border-zinc-200 dark:border-zinc-700">
        <img src="/assets/PremierLeague.webp" alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/80 to-purple-900/40 flex items-center px-5">
          <div>
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-wide">AI daily briefing</p>
            <p className="text-white text-lg font-bold">Your PL catch-up in one read</p>
          </div>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 mb-1">Daily Digest</h1>
      <p className="text-sm text-zinc-500 mb-6">{today}</p>

      <div className="p-6 bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
        <div className="space-y-2">
          {renderMarkdown(digest.content)}
        </div>
        <p className="mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-700 text-xs text-zinc-400">
          Generated{" "}
          {new Date(digest.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
