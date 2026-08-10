// Agent Bridge Server
// Lightweight WebSocket relay between OpenClaw agents and OpenCharts.
// Agents POST annotation commands via HTTP, the server relays to connected
// OpenCharts clients over WebSocket.

const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = 18790;
const WS_PATH = "/agent-bridge";

const server = http.createServer((req, res) => {
  // CORS headers for localhost
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/annotate") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);
        // Relay to all connected OpenCharts clients
        let delivered = 0;
        for (const client of wss.clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify(msg));
            delivered++;
          }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, delivered }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server, path: WS_PATH });

wss.on("connection", (ws) => {
  console.log(`[agent-bridge] OpenCharts client connected (${wss.clients.size} total)`);

  ws.on("close", () => {
    console.log(`[agent-bridge] OpenCharts client disconnected (${wss.clients.size} total)`);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[agent-bridge] WebSocket relay on ws://127.0.0.1:${PORT}${WS_PATH}`);
  console.log(`[agent-bridge] HTTP POST endpoint on http://127.0.0.1:${PORT}/annotate`);
});