"use client";

interface ActivityDay {
  date: string;
  threads: number;
  posts: number;
  total: number;
}

interface ActivityChartProps {
  activity: ActivityDay[];
  days: number;
}

export default function ActivityChart({ activity, days }: ActivityChartProps) {
  if (!activity.length) return null;

  const recent = activity.slice(-Math.min(days, activity.length));
  const maxTotal = Math.max(...recent.map((d) => d.total), 1);
  const totalThreads = recent.reduce((s, d) => s + d.threads, 0);
  const totalPosts = recent.reduce((s, d) => s + d.posts, 0);

  const firstDate = new Date(recent[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const lastDate = new Date(recent[recent.length - 1].date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="mt-6 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Activity</h3>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" /> Threads ({totalThreads})
          </span>
          <span className="flex items-center gap-1 text-[10px] text-zinc-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-400 dark:bg-purple-500" /> Posts ({totalPosts})
          </span>
        </div>
      </div>

      {/* Stacked bars */}
      <div className="flex items-end gap-px h-28">
        {recent.map((day) => {
          const totalH = maxTotal > 0 ? Math.max((day.total / maxTotal) * 100, day.total > 0 ? 8 : 2) : 2;
          const threadPct = day.total > 0 ? (day.threads / day.total) * totalH : 0;
          const postPct = day.total > 0 ? (day.posts / day.total) * totalH : 0;

          return (
            <div
              key={day.date}
              className="flex-1 min-w-0 flex flex-col justify-end items-center cursor-default group"
              title={`${new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}: ${day.threads} thread${day.threads !== 1 ? "s" : ""}, ${day.posts} post${day.posts !== 1 ? "s" : ""}`}
            >
              <div className="w-full h-24 flex flex-col justify-end rounded-t overflow-hidden bg-zinc-100 dark:bg-zinc-700/30">
                {/* Posts layer (top) */}
                {postPct > 0 && (
                  <div
                    className="w-full bg-purple-400 dark:bg-purple-500 transition-all"
                    style={{ height: `${postPct}%` }}
                  />
                )}
                {/* Threads layer (bottom) */}
                {threadPct > 0 && (
                  <div
                    className="w-full bg-indigo-500 dark:bg-indigo-600 transition-all"
                    style={{ height: `${threadPct}%` }}
                  />
                )}
                {day.total === 0 && (
                  <div className="w-full bg-zinc-200 dark:bg-zinc-600 min-h-[2px]" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Date labels */}
      {days <= 30 ? (
        <div className="flex gap-px mt-1.5">
          {recent.map((day, i) => {
            const show = days <= 14 ? true : i % 5 === 0 || i === recent.length - 1;
            return (
              <div key={day.date} className="flex-1 min-w-0 text-center overflow-hidden">
                {show && (
                  <span className="text-[7px] sm:text-[8px] text-zinc-400 leading-none">
                    {days <= 14
                      ? new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })
                      : new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex justify-between mt-1.5">
          {[0, Math.floor(recent.length / 3), Math.floor(recent.length * 2 / 3), recent.length - 1].map((idx) => (
            <span key={idx} className="text-[8px] text-zinc-400">
              {new Date(recent[idx].date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
