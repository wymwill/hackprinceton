import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const dataFile = process.env.BWF_DATA_FILE ?? path.join(here, "..", ".data", "db.json");
const staticDir = process.env.BWF_STATIC_DIR ?? path.join(here, "..", "..", "frontend", "dist");
const allowReset = process.env.BWF_ALLOW_RESET === "1";

createApp({ dataFile, allowReset, staticDir }).listen(port, () => {
  console.log(`Betting with Friends API on http://localhost:${port}  (data: ${dataFile}${allowReset ? ", reset on" : ""})`);
});
