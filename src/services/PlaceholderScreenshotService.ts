import fs from "node:fs/promises";
import path from "node:path";
import type { ScreenshotService } from "../types/interfaces";

export class PlaceholderScreenshotService implements ScreenshotService {
  async capture(sessionId: string, encounterId: string, folder: string): Promise<string> {
    await fs.mkdir(folder, { recursive: true });
    const p = path.join(folder, `shiny-${sessionId}-${encounterId}.txt`);
    await fs.writeFile(p, "Placeholder screenshot");
    return p;
  }
}
