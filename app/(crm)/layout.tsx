"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import QuickLogButton from "../../components/QuickLogButton";

interface CrmUser {
  id: string;
  name: string;
  username: string;
  role: string;
  avatarEmoji?: string;
  profilePictureUrl?: string;
  assignedCreators: string[];
  /** Creator IDs where socials axis is enabled */
  socialCreators: string[];
  /** Creator IDs where revenue axis is enabled */
  revenueCreators: string[];
  /** Creator IDs where trackingLinks axis is enabled */
  trackingCreators: string[];
}

// axis: which access axis grants visibility to this page (null = role-only)
const NAV_ITEMS: { href: string; label: string; emoji: string; enabled: boolean; roles: string[]; axis?: "socials" | "revenue" | "tracking" }[] = [
  { href: "/manager-dashboard", label: "Traffic Dashboard", emoji: "📈", enabled: true, roles: ["admin"], axis: "tracking" },
  { href: "/traffic-analytics", label: "Traffic Analytics", emoji: "🔬", enabled: true, roles: ["admin"], axis: "socials" },
  { href: "/ig-stats", label: "IG Stats", emoji: "📸", enabled: true, roles: ["admin"], axis: "socials" },
  { href: "/dashboard", label: "Dashboard", emoji: "📊", enabled: true, roles: ["admin", "manager", "supervisor", "chatter"], axis: "revenue" },
  { href: "/creators", label: "Creators", emoji: "👤", enabled: true, roles: ["admin", "manager", "supervisor", "chatter"] },
  { href: "/reports", label: "Reports", emoji: "📝", enabled: true, roles: ["admin", "manager", "supervisor", "chatter"] },
  { href: "/schedule", label: "Schedule", emoji: "📆", enabled: true, roles: ["admin", "manager", "supervisor", "chatter"] },
  { href: "/performance", label: "Performance", emoji: "📈", enabled: true, roles: ["admin", "manager", "supervisor"] },
  { href: "/analytics", label: "Analytics", emoji: "📊", enabled: true, roles: ["admin", "manager"], axis: "revenue" },
  { href: "/insights", label: "Insights", emoji: "🔮", enabled: true, roles: ["admin", "manager", "supervisor"] },
  { href: "/sales-feed", label: "Sales Feed", emoji: "🔔", enabled: true, roles: ["admin", "manager", "supervisor"] },
  { href: "/targets", label: "Targets", emoji: "🎯", enabled: true, roles: ["admin", "manager"] },
  { href: "/payroll", label: "Payroll", emoji: "💰", enabled: true, roles: ["admin", "manager"] },
  { href: "/admin/imports", label: "Imports", emoji: "📥", enabled: true, roles: ["admin"] },
  { href: "/admin/of-api", label: "OF API", emoji: "💠", enabled: true, roles: ["admin", "manager"] },
  { href: "/admin/team", label: "Team", emoji: "👥", enabled: true, roles: ["admin"] },
  { href: "/admin/members", label: "Members", emoji: "👤", enabled: true, roles: ["admin"] },
  { href: "/admin/roles", label: "Roles", emoji: "🔐", enabled: true, roles: ["admin"] },
  { href: "/admin/socials", label: "Socials", emoji: "📱", enabled: true, roles: ["admin"] },
];

function isNavVisible(item: typeof NAV_ITEMS[number], user: CrmUser): boolean {
  // Role grants access
  if (item.roles.includes(user.role)) return true;
  // Axis grants access
  if (item.axis === "socials" && user.socialCreators.length > 0) return true;
  if (item.axis === "revenue" && user.revenueCreators.length > 0) return true;
  if (item.axis === "tracking" && user.trackingCreators.length > 0) return true;
  return false;
}

function clearLocalAuth() {
  localStorage.removeItem("crm_token");
  localStorage.removeItem("crm_user");
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [token, setToken] = useState<string>("");
  const [user, setUser] = useState<CrmUser | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let active = true;

    const hydrateFromSession = async (session: Session) => {
      if (!active) return;

      const authUserId = session.user.id;
      const { data: chatter, error: chatterError } = await supabase
        .from("crm_chatters")
        .select("id,name,username,role,avatar_emoji,profile_picture_url,assigned_creators")
        .eq("supabase_auth_id", authUserId)
        .maybeSingle();

      if (!active) return;

      if (chatterError || !chatter) {
        clearLocalAuth();
        setToken("");
        setUser(null);
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      // Load access axes for this user
      const { data: accessRows } = await supabase
        .from("crm_user_creator_access")
        .select("creator_id, axes")
        .eq("user_id", chatter.id);

      const socialCreators: string[] = [];
      const revenueCreators: string[] = [];
      const trackingCreators: string[] = [];
      for (const row of accessRows ?? []) {
        const axes = row.axes as any;
        if (axes?.socials) socialCreators.push(row.creator_id);
        if (axes?.revenue) revenueCreators.push(row.creator_id);
        if (axes?.trackingLinks) trackingCreators.push(row.creator_id);
      }

      const crmUser: CrmUser = {
        id: chatter.id,
        name: chatter.name,
        username: chatter.username,
        role: chatter.role,
        avatarEmoji: chatter.avatar_emoji,
        profilePictureUrl: chatter.profile_picture_url,
        assignedCreators: chatter.assigned_creators ?? [],
        socialCreators,
        revenueCreators,
        trackingCreators,
      };

      localStorage.setItem("crm_token", session.access_token);
      localStorage.setItem("crm_user", JSON.stringify(crmUser));
      setToken(session.access_token);
      setUser(crmUser);
    };

    const initializeAuth = async () => {
      setMounted(true);
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      const session = data?.session;
      if (error || !session?.user) {
        clearLocalAuth();
        setToken("");
        setUser(null);
        router.replace("/login");
        return;
      }

      await hydrateFromSession(session);
    };

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session?.user) {
        clearLocalAuth();
        setToken("");
        setUser(null);
        router.replace("/login");
        return;
      }

      void hydrateFromSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!user || !pathname) return;

    // Check if current path is allowed
    const currentNavItem = NAV_ITEMS.find((item) =>
      pathname === item.href || pathname?.startsWith(item.href + "/")
    );

    // If it's a nav-managed page, check access
    if (currentNavItem && !isNavVisible(currentNavItem, user)) {
      // Redirect to first accessible page
      const firstAccessible = NAV_ITEMS.find((item) => isNavVisible(item, user));
      router.replace(firstAccessible?.href ?? "/dashboard");
    }
  }, [user, pathname, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearLocalAuth();
    setToken("");
    setUser(null);
    router.replace("/login");
  };

  if (!mounted || !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
        }}
      >
        <div style={{ fontSize: "18px", color: "var(--text-muted)" }}>Loading...</div>
      </div>
    );
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin": return "#ef4444";
      case "manager": return "#8b5cf6";
      case "supervisor": return "#f59e0b";
      case "marketing_manager": return "#3b82f6";
      case "backend_manager": return "#10b981";
      default: return "#22c55e";
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg)" }}>
      {/* Mobile header */}
      <div
        style={{
          display: "none",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "60px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          zIndex: 50,
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
        }}
        className="mobile-header"
      >
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            padding: "8px",
          }}
        >
          ☰
        </button>
        <span style={{ fontWeight: "700", fontSize: "16px", color: "var(--text)" }}>
          Preach CRM
        </span>
        <div style={{ width: "40px" }} />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            zIndex: 60,
          }}
          className="mobile-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: "256px",
          minWidth: "256px",
          background: "#1e1e1e",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
          zIndex: 70,
          transition: "transform 0.2s ease",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "24px 20px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <h1
            style={{
              fontSize: "20px",
              fontWeight: "700",
              color: "var(--text)",
              letterSpacing: "-0.02em",
            }}
          >
            🙏 Preach CRM
          </h1>
        </div>

        {/* User info */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {user.profilePictureUrl ? (
              <img
                src={user.profilePictureUrl}
                alt={user.name}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #f1ae38 0%, #d99b2e 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                }}
              >
                {user.avatarEmoji || "👤"}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  display: "inline-block",
                  marginTop: "2px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: "600",
                  color: getRoleBadgeColor(user.role),
                  background: `${getRoleBadgeColor(user.role)}15`,
                  borderRadius: "6px",
                  textTransform: "uppercase",
                }}
              >
                {user.role.replace(/_/g, " ")}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "12px 12px", overflow: "auto" }}>
          {NAV_ITEMS.filter((item) => isNavVisible(item, user)).map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <div key={item.href}>
                {item.enabled ? (
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 12px",
                      borderRadius: "12px",
                      fontSize: "14px",
                      fontWeight: isActive ? "600" : "500",
                      color: isActive ? "#f1ae38" : "var(--text-secondary)",
                      background: isActive ? "rgba(241,174,56,0.1)" : "transparent",
                      marginBottom: "4px",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ fontSize: "18px" }}>{item.emoji}</span>
                    {item.label}
                  </Link>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 12px",
                      borderRadius: "12px",
                      fontSize: "14px",
                      fontWeight: "500",
                      color: "var(--text-muted)",
                      marginBottom: "4px",
                      opacity: 0.5,
                      cursor: "not-allowed",
                    }}
                  >
                    <span style={{ fontSize: "18px" }}>{item.emoji}</span>
                    {item.label}
                    <span style={{ fontSize: "10px", marginLeft: "auto" }}>soon</span>
                  </div>
                )}
              </div>
            );
          })}

          {/* Admin link - only for admins */}
          {user.role === "admin" && (
            <Link
              href="/admin"
              onClick={() => setSidebarOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 12px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: pathname === "/admin" ? "600" : "500",
                color: pathname === "/admin" ? "#f1ae38" : "var(--text-secondary)",
                background: pathname === "/admin" ? "rgba(241,174,56,0.1)" : "transparent",
                marginBottom: "4px",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: "18px" }}>⚙️</span>
              Admin
            </Link>
          )}
        </nav>

        {/* Logout */}
        <div style={{ padding: "12px 12px 20px" }}>
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              width: "100%",
              padding: "12px 12px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: "500",
              color: "var(--text-muted)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <span style={{ fontSize: "18px" }}>🚪</span>
            Log out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          padding: "32px",
          minWidth: 0,
        }}
      >
        {children}
        {token && ["admin", "manager", "supervisor", "chatter"].includes(user.role) ? (
          <QuickLogButton
            token={token}
            role={user.role}
            assignedCreatorIds={user.assignedCreators ?? []}
          />
        ) : null}
      </main>

      {/* Mobile styles */}
      <style>{`
        @media (max-width: 768px) {
          .mobile-header { display: flex !important; }
          .mobile-overlay { display: block !important; }
          aside {
            position: fixed !important;
            left: 0;
            top: 0;
            bottom: 0;
            transform: ${sidebarOpen ? "translateX(0)" : "translateX(-100%)"};
          }
          main {
            padding: 16px !important;
            padding-top: 76px !important;
          }
        }
      `}</style>
    </div>
  );
}
