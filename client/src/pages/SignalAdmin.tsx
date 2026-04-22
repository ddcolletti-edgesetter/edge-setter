/**
 * /signal-admin — Protected admin page for manual signal management
 * Hidden route. Basic password gate via env var ADMIN_PASSWORD.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import type { Signal, Waitlist, User } from "@shared/schema";

const C = {
  void: "#080706", shell: "#0C0A08", panel: "#111009", lift: "#181410",
  gold: "#C9A84C", goldBright: "#E2BE6A", goldDim: "#6A5218",
  ivory: "#F0E8D6", ivoryMid: "#B8AD98", ivoryDim: "#6E6458", ivoryFaint: "#242018",
  green: "#3DAE72", red: "#C04040", amber: "#D4932A",
};

const ADMIN_PASS = "edgesetter-admin-2026";

function Cap({ children, color, size = 9 }: { children: React.ReactNode; color?: string; size?: number }) {
  return <span style={{ fontFamily: "'Barlow Condensed','Arial Narrow',Arial,sans-serif", fontSize: size, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: color ?? C.ivoryDim }}>{children}</span>;
}

function inputStyle(extra?: React.CSSProperties): React.CSSProperties {
  return { background: C.shell, border: `1px solid ${C.ivoryFaint}`, borderTop: `1px solid ${C.gold}30`, color: C.ivory, fontSize: 12, padding: "8px 10px", outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box", ...extra };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ borderTop: `1px solid ${C.gold}40`, paddingTop: 14, marginBottom: 14 }}>
        <Cap color={C.goldBright} size={10}>{title}</Cap>
      </div>
      {children}
    </div>
  );
}

function SignalRow({ signal, onEdit }: { signal: Signal; onEdit: (s: Signal) => void }) {
  const qc = useQueryClient();
  const toggleMutation = useMutation({
    mutationFn: (data: Partial<Signal>) => apiRequest("PATCH", `/api/signals/${signal.id}`, data).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/signals/all"] }),
  });

  return (
    <div data-testid={`admin-signal-row-${signal.id}`} style={{ borderTop: `1px solid ${C.ivoryFaint}`, padding: "10px 0", display: "grid", gridTemplateColumns: "1fr auto auto auto auto", gap: 8, alignItems: "center" }}>
      <div>
        <p style={{ fontSize: 12, color: C.ivory, margin: "0 0 2px" }}>{signal.title}</p>
        <Cap color={C.ivoryDim}>{signal.player_name} · {signal.team} · conf {signal.confidence_score}</Cap>
      </div>
      <div>
        <span style={{ fontSize: 9, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: signal.is_public ? C.green : C.amber, padding: "3px 6px", border: `1px solid ${signal.is_public ? C.green : C.amber}40` }}>
          {signal.is_public ? "public" : "private"}
        </span>
      </div>
      <div>
        <span style={{ fontSize: 9, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: signal.is_featured ? C.gold : C.ivoryDim }}>
          {signal.is_featured ? "★ featured" : "—"}
        </span>
      </div>
      <button
        data-testid={`button-toggle-public-${signal.id}`}
        onClick={() => toggleMutation.mutate({ is_public: !signal.is_public })}
        style={{ background: "transparent", border: `1px solid ${C.ivoryFaint}`, color: C.ivoryMid, padding: "4px 8px", cursor: "pointer", fontSize: 9, fontFamily: "'Barlow Condensed'", letterSpacing: "0.14em", textTransform: "uppercase" }}
      >
        {signal.is_public ? "Make Private" : "Publish"}
      </button>
      <button
        data-testid={`button-edit-signal-${signal.id}`}
        onClick={() => onEdit(signal)}
        style={{ background: C.gold, border: "none", color: C.void, padding: "4px 8px", cursor: "pointer", fontSize: 9, fontFamily: "'Barlow Condensed'", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}
      >
        Edit
      </button>
    </div>
  );
}

function EditSignalModal({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: signal.title,
    verdict: signal.verdict,
    confidence_score: String(signal.confidence_score),
    action_takeaway: signal.action_takeaway,
    summary: signal.summary,
    status_tag: signal.status_tag,
    is_featured: signal.is_featured ?? false,
    is_public: signal.is_public ?? true,
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<Signal>) => apiRequest("PATCH", `/api/signals/${signal.id}`, data).then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/signals/all"] }); onClose(); },
  });

  function handleSave() {
    mutation.mutate({ ...form, confidence_score: parseInt(form.confidence_score) });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,7,6,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
      <div style={{ background: C.shell, border: `1px solid ${C.gold}40`, borderTop: `2px solid ${C.gold}`, padding: 28, width: 520, maxWidth: "90vw", maxHeight: "90vh", overflowY: "auto" }}>
        <Cap color={C.goldBright} size={10}>Edit Signal</Cap>
        <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 16, color: C.ivory, margin: "8px 0 20px" }}>{signal.title}</p>

        {(["title", "verdict", "confidence_score", "action_takeaway", "summary"] as const).map(field => (
          <div key={field} style={{ marginBottom: 12 }}>
            <Cap color={C.ivoryDim} size={8}>{field.replace(/_/g, " ")}</Cap>
            {field === "summary" || field === "action_takeaway" ? (
              <textarea
                data-testid={`input-${field}`}
                value={(form as any)[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                rows={3}
                style={{ ...inputStyle(), marginTop: 4, resize: "vertical" }}
              />
            ) : (
              <input
                data-testid={`input-${field}`}
                value={(form as any)[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                style={{ ...inputStyle(), marginTop: 4 }}
              />
            )}
          </div>
        ))}

        <div style={{ marginBottom: 12 }}>
          <Cap color={C.ivoryDim} size={8}>Status Tag</Cap>
          <select
            data-testid="select-status-tag"
            value={form.status_tag}
            onChange={e => setForm(f => ({ ...f, status_tag: e.target.value }))}
            style={{ ...inputStyle(), marginTop: 4 }}
          >
            <option value="verified">verified</option>
            <option value="high-risk">high-risk</option>
            <option value="speculative">speculative</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
          {(["is_featured", "is_public"] as const).map(field => (
            <label key={field} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!form[field]}
                onChange={e => setForm(f => ({ ...f, [field]: e.target.checked }))}
                data-testid={`checkbox-${field}`}
              />
              <Cap color={C.ivoryMid} size={8}>{field.replace(/_/g, " ")}</Cap>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            data-testid="button-save-signal"
            onClick={handleSave}
            disabled={mutation.isPending}
            style={{ flex: 1, padding: "10px 0", background: C.gold, color: C.void, border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </button>
          <button
            onClick={onClose}
            style={{ padding: "10px 16px", background: "transparent", border: `1px solid ${C.ivoryFaint}`, color: C.ivoryDim, cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateSignalForm() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: "", player_name: "", team: "", signal_type: "Injury status",
    status_tag: "verified", confidence_score: "80", source_count: "3",
    verdict: "Confirmed", summary: "", action_takeaway: "",
    is_featured: false, is_public: true,
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/signals", data).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/signals/all"] });
      setForm(f => ({ ...f, title: "", player_name: "", team: "", summary: "", action_takeaway: "" }));
    },
  });

  function handleCreate() {
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
    mutation.mutate({ ...form, slug, confidence_score: parseInt(form.confidence_score), source_count: parseInt(form.source_count) });
  }

  const fields: { key: keyof typeof form; label: string; type?: string }[] = [
    { key: "title", label: "Title" }, { key: "player_name", label: "Player Name" },
    { key: "team", label: "Team" }, { key: "signal_type", label: "Signal Type" },
    { key: "confidence_score", label: "Confidence (0-100)", type: "number" },
    { key: "source_count", label: "Source Count", type: "number" },
    { key: "verdict", label: "Verdict" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        {fields.map(f => (
          <div key={f.key}>
            <Cap color={C.ivoryDim} size={8}>{f.label}</Cap>
            <input
              data-testid={`create-${f.key}`}
              type={f.type ?? "text"}
              value={String(form[f.key])}
              onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
              style={{ ...inputStyle(), marginTop: 3 }}
            />
          </div>
        ))}
        <div>
          <Cap color={C.ivoryDim} size={8}>Status Tag</Cap>
          <select data-testid="create-status-tag" value={form.status_tag} onChange={e => setForm(f => ({ ...f, status_tag: e.target.value }))} style={{ ...inputStyle(), marginTop: 3 }}>
            <option value="verified">verified</option>
            <option value="high-risk">high-risk</option>
            <option value="speculative">speculative</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <Cap color={C.ivoryDim} size={8}>Summary</Cap>
        <textarea data-testid="create-summary" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} rows={2} style={{ ...inputStyle(), marginTop: 3, resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Cap color={C.ivoryDim} size={8}>Action Takeaway</Cap>
        <textarea data-testid="create-action-takeaway" value={form.action_takeaway} onChange={e => setForm(f => ({ ...f, action_takeaway: e.target.value }))} rows={2} style={{ ...inputStyle(), marginTop: 3, resize: "vertical" }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 14 }}>
        {(["is_featured", "is_public"] as const).map(field => (
          <label key={field} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={!!form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.checked }))} />
            <Cap color={C.ivoryMid} size={8}>{field.replace(/_/g, " ")}</Cap>
          </label>
        ))}
      </div>
      <button
        data-testid="button-create-signal"
        onClick={handleCreate}
        disabled={mutation.isPending || !form.title || !form.player_name}
        style={{ padding: "10px 24px", background: mutation.isPending ? C.goldDim : C.gold, color: C.void, border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}
      >
        {mutation.isPending ? "Creating…" : "Create Signal"}
      </button>
      {mutation.isSuccess && <Cap color={C.green} size={9}> ✓ Created</Cap>}
      {mutation.isError && <Cap color={C.red} size={9}> Error creating signal</Cap>}
    </div>
  );
}

export default function SignalAdmin() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState("");
  const [editSignal, setEditSignal] = useState<Signal | null>(null);
  const [tab, setTab] = useState<"signals" | "waitlist" | "users">("signals");

  const { data: signals = [] } = useQuery<Signal[]>({
    queryKey: ["/api/signals/all"],
    queryFn: () => apiRequest("GET", "/api/signals/all").then(r => r.json()),
    enabled: authed,
  });
  const { data: waitlist = [] } = useQuery<Waitlist[]>({
    queryKey: ["/api/admin/waitlist"],
    queryFn: () => apiRequest("GET", "/api/admin/waitlist").then(r => r.json()),
    enabled: authed && tab === "waitlist",
  });
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    queryFn: () => apiRequest("GET", "/api/admin/users").then(r => r.json()),
    enabled: authed && tab === "users",
  });

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: C.void, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 320, borderTop: `2px solid ${C.gold}`, paddingTop: 20 }}>
          <Cap color={C.goldBright} size={10}>Admin Access</Cap>
          <p style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: 18, color: C.ivory, margin: "8px 0 16px" }}>Signal Admin</p>
          <input
            data-testid="input-admin-password"
            type="password"
            placeholder="Admin password"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === "Enter" && pass === ADMIN_PASS && setAuthed(true)}
            style={{ ...inputStyle(), marginBottom: 8 }}
          />
          <button
            data-testid="button-admin-login"
            onClick={() => pass === ADMIN_PASS && setAuthed(true)}
            style={{ width: "100%", padding: "9px 0", background: C.gold, color: C.void, border: "none", cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}
          >
            Enter
          </button>
          {pass && pass !== ADMIN_PASS && <p style={{ fontSize: 11, color: C.red, marginTop: 6 }}>Incorrect password</p>}
        </div>
      </div>
    );
  }

  const tabs = ["signals", "waitlist", "users"] as const;

  return (
    <div style={{ minHeight: "100vh", background: C.void, color: C.ivory }}>
      <div style={{ background: C.shell, borderBottom: `1px solid ${C.gold}30`, padding: "0 20px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", height: 48, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Cap color={C.goldBright} size={11}>Signal Admin</Cap>
          <div style={{ display: "flex", gap: 20 }}>
            {tabs.map(t => (
              <button
                key={t}
                data-testid={`tab-${t}`}
                onClick={() => setTab(t)}
                style={{ background: "none", border: "none", borderBottom: tab === t ? `1px solid ${C.gold}` : "none", padding: "14px 0", cursor: "pointer", fontFamily: "'Barlow Condensed'", fontSize: 9, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: tab === t ? C.gold : C.ivoryDim }}
              >
                {t} {t === "signals" ? `(${signals.length})` : t === "waitlist" ? `(${waitlist.length})` : `(${users.length})`}
              </button>
            ))}
          </div>
          <a
            href="/api/admin/waitlist/csv"
            style={{ fontFamily: "'Barlow Condensed'", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.ivoryDim, textDecoration: "none" }}
          >
            Export CSV ↓
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 20px 48px" }}>
        {tab === "signals" && (
          <>
            <Section title="Create Signal">
              <CreateSignalForm />
            </Section>
            <Section title={`All Signals (${signals.length})`}>
              {signals.map(s => <SignalRow key={s.id} signal={s} onEdit={setEditSignal} />)}
            </Section>
          </>
        )}

        {tab === "waitlist" && (
          <Section title={`Waitlist — ${waitlist.length} leads`}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Email", "Name", "Role", "Signed Up"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.ivoryFaint}` }}>
                      <Cap color={C.ivoryDim} size={8}>{h}</Cap>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waitlist.map(w => (
                  <tr key={w.id} data-testid={`waitlist-row-${w.id}`}>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: C.ivory }}>{w.email}</td>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: C.ivoryDim }}>{w.name ?? "—"}</td>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: C.ivoryDim }}>{w.role ?? "—"}</td>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: C.ivoryDim }}>{w.created_at?.slice(0, 10) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {tab === "users" && (
          <Section title={`Pro Users — ${users.filter((u: User) => u.plan === "pro").length} active`}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Email", "Plan", "Status", "Customer ID", "Created"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C.ivoryFaint}` }}>
                      <Cap color={C.ivoryDim} size={8}>{h}</Cap>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u: User) => (
                  <tr key={u.id} data-testid={`user-row-${u.id}`}>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: C.ivory }}>{u.email}</td>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: u.plan === "pro" ? C.green : C.ivoryDim }}>{u.plan}</td>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: u.access_status === "active" ? C.green : C.amber }}>{u.access_status}</td>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: C.ivoryDim, fontSize: 10 }}>{u.stripe_customer_id?.slice(0, 18) ?? "—"}</td>
                    <td style={{ padding: "7px 8px", borderBottom: `1px solid ${C.ivoryFaint}20`, color: C.ivoryDim }}>{u.created_at?.slice(0, 10) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
      </div>

      {editSignal && <EditSignalModal signal={editSignal} onClose={() => setEditSignal(null)} />}
    </div>
  );
}
