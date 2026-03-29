export async function sendDiscordTest(webhookUrl: string): Promise<void> {
  if (!webhookUrl) throw new Error("Webhook URL ontbreekt.");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Pokemon Shiny Hunt Assistant",
      content: "✅ Test notification from desktop app.",
    }),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed (${res.status})`);
  }
}