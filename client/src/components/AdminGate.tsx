import { useState } from "react";

const STORAGE_KEY = "edgesetter.adminPass";

export function getAdminPassword(): string {
  try { return sessionStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
}

export function setAdminPassword(pw: string): void {
  try { sessionStorage.setItem(STORAGE_KEY, pw); } catch {}
}

/** Bearer auth headers for admin API calls — keeps the credential out of URLs and bodies. */
export function adminAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getAdminPassword()}` };
}

/** Checks the password against the server (any requireAdmin route works; site-watch is cheap). */
export async function verifyAdminPassword(pw: string): Promise<boolean> {
  try {
    const r = await fetch("/api/agent/site-watch?limit=1", { headers: { Authorization: `Bearer ${pw}` } });
    return r.ok;
  } catch {
    return false;
  }
}

interface AdminGateProps {
  children: React.ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
  const [authed, setAuthed] = useState(() => getAdminPassword() !== "");
  const [pass, setPass] = useState("");
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    if (!pass || checking) return;
    setChecking(true);
    setFailed(false);
    if (await verifyAdminPassword(pass)) {
      setAdminPassword(pass);
      setAuthed(true);
    } else {
      setFailed(true);
    }
    setChecking(false);
  };

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "#050505", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 320, borderTop: "2px solid #F5B841", paddingTop: 20 }}>
          <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: "#F8FAFC", margin: "8px 0 16px" }}>Admin Access</p>
          <input
            type="password"
            placeholder="Admin password"
            value={pass}
            onChange={e => { setPass(e.target.value); setFailed(false); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            style={{ background: "#050505", border: "1px solid rgba(245,184,65,0.3)", color: "#F8FAFC", fontSize: 12, padding: "8px 10px", width: "100%", boxSizing: "border-box", marginBottom: 8 }}
          />
          <button
            onClick={submit}
            disabled={checking}
            style={{ width: "100%", padding: "9px 0", background: "#F5B841", color: "#050505", border: "none", cursor: checking ? "wait" : "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", opacity: checking ? 0.6 : 1 }}
          >
            {checking ? "Checking…" : "Enter"}
          </button>
          {failed && (
            <p style={{ fontSize: 11, color: "#C04040", marginTop: 6 }}>Incorrect password</p>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
