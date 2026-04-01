import fs from 'node:fs/promises';
import path from 'node:path';
import type { ScreenshotService } from '../types/interfaces';

export class PlaceholderScreenshotService implements ScreenshotService {
  async capture(sessionId: string, encounterId: string, folder: string): Promise<string> {
    await fs.mkdir(folder, { recursive: true });
    const filePath = path.join(folder, `shiny-${sessionId}-${encounterId}.svg`);
    const stamp = new Date().toISOString();
    const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#581c87"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#bg)"/>
<text x="80" y="160" fill="#f8fafc" font-family="Arial" font-size="64">Pokemon Shiny Hunt Assistant</text>
<text x="80" y="260" fill="#facc15" font-family="Arial" font-size="48">✨ Shiny Encounter Captured</text>
<text x="80" y="340" fill="#e2e8f0" font-family="Arial" font-size="32">Session: ${sessionId}</text>
<text x="80" y="390" fill="#e2e8f0" font-family="Arial" font-size="32">Encounter: ${encounterId}</text>
<text x="80" y="440" fill="#94a3b8" font-family="Arial" font-size="28">Captured: ${stamp}</text>
</svg>`;
    await fs.writeFile(filePath, image, 'utf-8');
    return filePath;
  }
}
