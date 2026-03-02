"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";

function MultiSelect({
  selected,
  options,
  onChange,
  disabled,
}: {
  selected: string[];
  options: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((s) => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const remove = (val: string) => {
    onChange(selected.filter((s) => s !== val));
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: "240px" }}>
      <div
        onClick={() => !disabled && setOpen(!open)}
        style={{
          background: "#253545",
          color: "#fff",
          border: "1px solid #3a4a5a",
          borderRadius: "8px",
          padding: "6px 10px",
          fontSize: "13px",
          cursor: disabled ? "default" : "pointer",
          minHeight: "36px",
          display: "flex",
          flexWrap: "wrap",
          gap: "4px",
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {selected.length === 0 && (
          <span style={{ color: "#8899AA" }}>— None —</span>
        )}
        {selected.map((s) => (
          <span
            key={s}
            style={{
              background: "#3a4a5a",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            {s}
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) remove(s);
              }}
              style={{ cursor: "pointer", opacity: 0.7, fontSize: "14px" }}
            >
              ×
            </span>
          </span>
        ))}
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            background: "#1C2A3A",
            border: "1px solid #3a4a5a",
            borderRadius: "8px",
            marginTop: "4px",
            maxHeight: "200px",
            overflowY: "auto",
            zIndex: 100,
          }}
        >
          {options.length === 0 && (
            <div style={{ padding: "8px 12px", color: "#8899AA", fontSize: "13px" }}>
              No accounts available
            </div>
          )}
          {options.map((opt) => (
            <div
              key={opt}
              onClick={() => toggle(opt)}
              style={{
                padding: "8px 12px",
                fontSize: "13px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: selected.includes(opt) ? "#253545" : "transparent",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#253545")}
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = selected.includes(opt)
                  ? "#253545"
                  : "transparent")
              }
            >
              <span
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "3px",
                  border: "1px solid #3a4a5a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  background: selected.includes(opt) ? "#4a9eff" : "transparent",
                  color: "#fff",
                }}
              >
                {selected.includes(opt) ? "✓" : ""}
              </span>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminSocialsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const [creators, setCreators] = useState<any[] | null>(null);
  const [igAccounts, setIgAccounts] = useState<any[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: creatorsData }, { data: igData }] = await Promise.all([
        supabase.from("crm_creators").select("id,name,avatar_url,only_fans_handle,instagram_username,instagram_usernames,platform_account_id"),
        supabase.from("crm_ig_accounts").select("username"),
      ]);
      if (cancelled) return;
      setCreators(creatorsData ?? []);
      setIgAccounts(igData ?? []);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <div style={{ padding: 24, color: "#fff" }}>
        🔒 Admin only.
      </div>
    );
  }

  const igUsernames = (igAccounts || []).map((a: any) => a.username).filter(Boolean);

  const ofApiCreators = (creators || []).filter((c: any) => !!c.platform_account_id);

  const handleChange = async (creatorId: string, instagramUsernames: string[]) => {
    setSaving(creatorId);
    try {
      const { error } = await supabase
        .from("crm_creators")
        .update({ instagram_usernames: instagramUsernames, instagram_username: instagramUsernames[0] ?? null })
        .eq("id", creatorId);
      if (error) throw error;

      setCreators((prev) => (prev || []).map((c: any) => c.id === creatorId
        ? { ...c, instagram_usernames: instagramUsernames, instagram_username: instagramUsernames[0] ?? null }
        : c));
    } catch (e) {
      console.error("Failed to update IG usernames", e);
    }
    setSaving(null);
  };

  return (
    <div style={{ maxWidth: "900px", color: "#fff" }}>
      <h1 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "8px" }}>
        📱 Socials
      </h1>
      <p style={{ fontSize: "14px", color: "#8899AA", marginBottom: "24px" }}>
        Link Instagram accounts to creators for the Traffic Dashboard.
      </p>

      <div style={{
        background: "#1C2A3A", borderRadius: "16px", padding: "24px",
        border: "1px solid #253545",
      }}>
        {!creators ? (
          <div style={{ color: "#8899AA", textAlign: "center", padding: "40px 0" }}>Loading…</div>
        ) : ofApiCreators.length === 0 ? (
          <div style={{ color: "#8899AA", textAlign: "center", padding: "40px 0" }}>No OF API creators found</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #253545" }}>
                <th style={{ padding: "12px", fontSize: "11px", color: "#8899AA", fontWeight: 600, textAlign: "left", textTransform: "uppercase" }}>
                  Creator Name
                </th>
                <th style={{ padding: "12px", fontSize: "11px", color: "#8899AA", fontWeight: 600, textAlign: "left", textTransform: "uppercase" }}>
                  OF Account
                </th>
                <th style={{ padding: "12px", fontSize: "11px", color: "#8899AA", fontWeight: 600, textAlign: "left", textTransform: "uppercase" }}>
                  Instagram Accounts
                </th>
              </tr>
            </thead>
            <tbody>
              {ofApiCreators.map((creator: any) => {
                const currentUsernames: string[] =
                  creator.instagram_usernames && creator.instagram_usernames.length > 0
                    ? creator.instagram_usernames
                    : creator.instagram_username
                      ? [creator.instagram_username]
                      : [];

                return (
                  <tr key={creator.id} style={{ borderBottom: "1px solid #253545" }}>
                    <td style={{ padding: "14px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        {creator.avatar_url ? (
                          <img src={creator.avatar_url} alt="" style={{ width: "32px", height: "32px", borderRadius: "8px", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#253545", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>
                            👤
                          </div>
                        )}
                        <span style={{ fontWeight: 600, fontSize: "14px" }}>{creator.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "14px 12px", color: "#8899AA", fontSize: "13px" }}>
                      {creator.only_fans_handle || "—"}
                    </td>
                    <td style={{ padding: "14px 12px" }}>
                      <MultiSelect
                        selected={currentUsernames}
                        options={igUsernames}
                        onChange={(values) => handleChange(creator.id, values)}
                        disabled={saving === creator.id}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
