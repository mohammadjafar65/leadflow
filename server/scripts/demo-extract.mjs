// End-to-end Phase 1 demo: POST /leads/extract then stream /ws/jobs/:id
// progress until the scrape job completes. Node 22+ (global fetch + WebSocket).
const BASE = "http://localhost:4000/api/v1";
const WS = "ws://localhost:4000/ws/jobs";
const EMAIL = "demo@maplestreet.test";
const PASSWORD = "password123";

const session = await fetch(`${BASE}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then((r) => r.json());

const params = {
  region: { type: "city", query: "Austin" },
  categories: ["restaurants", "cafes", "plumbers", "law_firms", "dental_clinics"],
};
const started = await fetch(`${BASE}/leads/extract`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
    "Idempotency-Key": `demo-extract-${Date.now()}`,
  },
  body: JSON.stringify(params),
});
const { jobId } = await started.json();
console.log(`extraction job: ${jobId}`);

const ws = new WebSocket(`${WS}/${jobId}?token=${session.accessToken}`);
ws.onmessage = async (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === "progress") {
    console.log(
      `  progress: processed=${msg.progress.processed} created=${msg.progress.created} merged=${msg.progress.merged}`,
    );
  }
  if (msg.type === "status" && (msg.status === "completed" || msg.status === "failed")) {
    console.log(`job ${msg.status}:`, msg.result ?? msg.error ?? "");
    if (msg.status === "completed") {
      const { items } = await fetch(`${BASE}/leads?limit=5`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }).then((r) => r.json());
      console.log("first leads in pipeline:");
      for (const l of items) {
        console.log(
          `  - ${l.name} | ${l.category} | ${l.phoneE164 ?? "no phone"} | ${l.address?.split(",")[0]} | stage=${l.stage} | enrichment=${l.enrichment.length} records`,
        );
      }
      const total = await fetch(`${BASE}/leads?limit=1`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      }).then(async (r) => {
        // walk cursors to count
        let cursor = null;
        let n = 0;
        do {
          const page = await fetch(`${BASE}/leads?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, {
            headers: { Authorization: `Bearer ${session.accessToken}` },
          }).then((r) => r.json());
          n += page.items.length;
          cursor = page.nextCursor;
        } while (cursor);
        return n;
      });
      console.log(`total leads in org: ${total}`);
    }
    ws.close();
    process.exit(0);
  }
};
ws.onerror = (e) => {
  console.error("ws error", e.message);
  process.exit(1);
};
setTimeout(() => {
  console.error("timed out waiting for job");
  process.exit(1);
}, 60_000);