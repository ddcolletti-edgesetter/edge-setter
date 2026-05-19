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
      <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 320, borderTop: "2px solid #F5B841", paddingTop: 20 }}>
          <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#F8FAFC", margin: "8px 0 16px" }}>Admin Access</p>
          <input
            type="password"
            placeholder="Admin password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pass === ADMIN_PASS && setAuthed(true)}
            style={{ background: "#050505", border: "1px solid rgba(245,184,65,0.3)", color: "#F8FAFC", fontSize: 12, padding: "8px 10px", width: "100%", boxSizing: "border-box", marginBottom: 8 }}
          />
          <button
            onClick={() => pass === ADMIN_PASS && setAuthed(true)}
            style={{ width: "100%", padding: "9px 0", background: "#F5B841", color: "#050505", border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}
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
