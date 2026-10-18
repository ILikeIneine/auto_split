import http from "node:http";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../demo/index.html", import.meta.url));
const server = http.createServer((req, res) => {
  if (req.url === "/download") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="auto-split-test.txt"' });
    res.end("Auto Split download test\n");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  res.end(html);
});
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
server.listen(8765, "127.0.0.1", () => console.log("Auto Split demo: http://127.0.0.1:8765"));
