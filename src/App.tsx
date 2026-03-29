import { useMemo, useState } from "react";

type Status = "idle" | "hunting" | "shiny_found" | "error";

export default function App() {
  const [status, setStatus] = useState<Status>("idle");
  const [encounters, setEncounters] = useState(0);
  const [target, setTarget] = useState("Ralts");
  const [profile, setProfile] = useState("ORAS Starters");

  const startedAt = useMemo(() => Date.now(), []);
  const elapsed = Math.floor((Date.now() - startedAt) / 1000);

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#e2e8f0", padding: 24, fontFamily: "Inter, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Pokemon Shiny Hunt Assistant</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, marginBottom: 16 }}>
        <Card label="Status" value={status} />
        <Card label="Encounters" value={String(encounters)} />
        <Card label="Elapsed" value={`${elapsed}s`} />
        <Card label="Target" value={target} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => setStatus("hunting")}>Start Hunt</button>
        <button onClick={() => setStatus("idle")}>Stop Hunt</button>
        <button onClick={() => setEncounters((v) => v + 1)}>+ Encounter</button>
        <button onClick={() => setStatus("shiny_found")}>Force Shiny</button>
      </div>

      <div style={{ display: "grid", gap: 10, maxWidth: 500 }}>
        <label>Target Pokemon
          <input value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle} />
        </label>
        <label>Game Profile
          <input value={profile} onChange={(e) => setProfile(e.target.value)} style={inputStyle} />
        </label>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 18 }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: 10,
  background: "#0f172a",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 10
};
