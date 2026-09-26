import WebSocket from "ws";

const [jobId, token] = process.argv.slice(2);
if (!jobId || !token) {
  console.error("usage: demo-ws.mjs <jobId> <token>");
  process.exit(1);
}

const ws = new WebSocket(`ws://localhost:4000/ws/jobs/${jobId}?token=${token}`);
const timer = setTimeout(() => {
  console.error("timed out");
  process.exit(1);
}, 45_000);

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "progress") {
    console.log(`progress: processed=${msg.progress.processed} created=${msg.progress.created} merged=${msg.progress.merged}`);
  } else if (msg.type === "status") {
    console.log(`status: ${msg.status}${msg.error ? ` error=${msg.error}` : ""}`);
    if (msg.status === "completed" || msg.status === "failed") {
      clearTimeout(timer);
      process.exit(0);
    }
  } else {
    console.log("msg:", msg.type, JSON.stringify(msg).slice(0, 200));
  }
});
ws.on("error", (e) => {
  console.error("ws error:", e.message);
  process.exit(1);
});