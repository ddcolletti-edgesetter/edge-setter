import { useState } from "react";

const ADMIN_PASS = "edgesetter-admin-2026";

interface AdminGateProps {
  children: React.ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#0A0B0D", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 320, borderTop: "2px solid #CAA85A", paddingTop: 20 }}>
          <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#F3EFE6", margin: "8px 0 16px" }}>Admin Access</p>
          <input
            type="password"
            placeholder="Admin password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pass === ADMIN_PASS && setAuthed(true)}
            style={{ background: "#0C0A08", border: "1px solid rgba(202,168,90,0.3)", color: "#F3EFE6", fontSize: 12, padding: "8px 10px", width: "100%", boxSizing: "border-box", marginBottom: 8 }}
          />
          <button
            onClick={() => pass === ADMIN_PASS && setAuthed(true)}
            style={{ width: "100%", padding: "9px 0", background: "#CAA85A", color: "#0A0B0D", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            Enter
          </button>
          {pass && pass !== ADMIN_PASS && (
            <p style={{ fontSize: 11, color: "#C04040", marginTop: 6 }}>Incorrect password</p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
