export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMatchThreadCron } = await import("./lib/matchThreadCron");
    startMatchThreadCron();
  }
}
