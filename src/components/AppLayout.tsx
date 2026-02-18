"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import { WHATSAPP_INVITE_URL, DISCORD_INVITE_URL } from "@/constants/links";
import {
  useHideFloatingButton,
  useFloatingButtonHideCount,
} from "@/components/providers/FloatingButtonProvider";

// Re-export the hook so existing imports continue to work
export { useHideFloatingButton } from "@/components/providers/FloatingButtonProvider";

type Theme = "light" | "dark" | "device";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

type NavSection = {
  title?: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    items: [
      {
        id: "agents",
        label: "Agents",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
            />
          </svg>
        ),
      },
      {
        id: "tools",
        label: "Tools",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
            />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Unit Tests",
    items: [
      {
        id: "stt",
        label: "Speech-to-Text",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
            />
          </svg>
        ),
      },
      {
        id: "tests",
        label: "LLM Evaluation",
        icon: (
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 3h6v2h-1v4.5l4.5 7.5c.5.83.5 1.5-.17 2.17-.67.67-1.34.83-2.33.83H8c-1 0-1.67-.17-2.33-.83-.67-.67-.67-1.34-.17-2.17L10 9.5V5H9V3zm3 8.5L8.5 17h7L12 11.5z" />
          </svg>
        ),
      },
      {
        id: "tts",
        label: "Text-to-Speech",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
            />
          </svg>
        ),
      },
    ],
  },
  {
    title: "End-to-End Tests",
    items: [
      {
        id: "personas",
        label: "Personas",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        ),
      },
      {
        id: "scenarios",
        label: "Scenarios",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
        ),
      },
      {
        id: "metrics",
        label: "Metrics",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z"
            />
          </svg>
        ),
      },
      {
        id: "simulations",
        label: "Simulations",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
            />
          </svg>
        ),
      },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        id: "docs",
        label: "Documentation",
        icon: (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
            />
          </svg>
        ),
      },
    ],
  },
];

type AppLayoutProps = {
  activeItem: string;
  onItemChange: (itemId: string) => void;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
  children: React.ReactNode;
  customHeader?: React.ReactNode;
  headerActions?: React.ReactNode;
};

// Type for user stored in localStorage (from email/password login)
type LocalUser = {
  uuid: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export function AppLayout({
  activeItem,
  onItemChange,
  sidebarOpen,
  onSidebarToggle,
  children,
  customHeader,
  headerActions,
}: AppLayoutProps) {
  const { data: session } = useSession();
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [talkToUsOpen, setTalkToUsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("device");
  const profileRef = useRef<HTMLDivElement>(null);
  const talkToUsRef = useRef<HTMLDivElement>(null);

  // Load user from localStorage (for email/password login)
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setLocalUser(JSON.parse(storedUser));
      } catch {
        // Invalid JSON, ignore
      }
    }
  }, []);

  // Compute user display info from either session or localStorage
  const userName = session?.user?.name || (localUser ? `${localUser.first_name} ${localUser.last_name}` : "User");
  const userEmail = session?.user?.email || localUser?.email || "";
  const userImage = session?.user?.image || null;

  // Get the hide count from the global context provider
  const floatingButtonHideCount = useFloatingButtonHideCount();

  // Close the talk to us popup when a dialog opens
  useEffect(() => {
    if (floatingButtonHideCount > 0) {
      setTalkToUsOpen(false);
    }
  }, [floatingButtonHideCount]);

  // Apply theme to document
  const applyTheme = (newTheme: Theme) => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");

    if (newTheme === "device") {
      // Follow system preference
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      root.classList.add(prefersDark ? "dark" : "light");
    } else {
      root.classList.add(newTheme);
    }
  };

  // Load theme from localStorage on mount and listen for system changes
  useEffect(() => {
    const savedTheme = (localStorage.getItem("theme") as Theme) || "device";
    setTheme(savedTheme);
    applyTheme(savedTheme);

    // Listen for system theme changes when in "device" mode
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (
        localStorage.getItem("theme") === "device" ||
        !localStorage.getItem("theme")
      ) {
        applyTheme("device");
      }
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () =>
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    applyTheme(newTheme);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(event.target as Node)
      ) {
        setProfileOpen(false);
      }
      if (
        talkToUsRef.current &&
        !talkToUsRef.current.contains(event.target as Node)
      ) {
        setTalkToUsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get first letter of first name for avatar placeholder
  const getFirstLetter = (name?: string | null) => {
    if (!name) return "U";
    return name.trim()[0].toUpperCase();
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar - Hidden on mobile, overlay on tablet, fixed on desktop */}
      <aside
        className={`${
          sidebarOpen ? "w-[260px]" : "w-14"
        } border-r border-border flex flex-col bg-background ${
          sidebarOpen ? "fixed md:relative z-40 h-full" : "hidden md:flex"
        }`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border">
          <div className="flex items-center gap-2 w-full">
            <button
              onClick={!sidebarOpen ? onSidebarToggle : undefined}
              className={`${
                sidebarOpen ? "w-7 h-7" : "w-8 h-8"
              } rounded-lg flex items-center justify-center flex-shrink-0 transition-all group ${
                sidebarOpen
                  ? "bg-foreground cursor-default"
                  : "bg-background border border-border hover:bg-accent cursor-pointer"
              }`}
              aria-label={sidebarOpen ? undefined : "Open sidebar"}
            >
              {sidebarOpen ? (
                <svg
                  className="w-4 h-4 text-background"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
                  />
                </svg>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 text-foreground group-hover:hidden"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
                    />
                  </svg>
                  <svg
                    className="w-5 h-5 text-foreground hidden group-hover:block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <rect x="4" y="4" width="12" height="16" rx="1.5" />
                    <polygon fill="currentColor" points="9,10.5 11,12 9,13.5" />
                  </svg>
                </>
              )}
            </button>
            {sidebarOpen && (
              <span className="font-semibold text-base tracking-tight">
                Calibrate
              </span>
            )}
            {sidebarOpen && (
              <button
                onClick={onSidebarToggle}
                className="ml-auto h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                aria-label="Toggle sidebar"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        {sidebarOpen && (
          <>
            <nav className="flex-1 overflow-y-auto py-4 px-3">
              {navSections.map((section, index) => (
                <div key={section.title || index} className="mb-6">
                  {section.title && (
                    <h3 className="px-2 mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                      {section.title}
                    </h3>
                  )}
                  <ul className="space-y-0.5">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        {item.id === "docs" ? (
                          <a
                            href={process.env.NEXT_PUBLIC_DOCS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              // Close sidebar on mobile when clicking external link
                              if (window.innerWidth < 768 && sidebarOpen) {
                                onSidebarToggle();
                              }
                            }}
                            className="w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-base font-medium transition-colors cursor-pointer text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          >
                            {item.icon}
                            {item.label}
                            <svg
                              className="w-3 h-3 ml-auto text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                              />
                            </svg>
                          </a>
                        ) : (
                          <Link
                            href={`/${item.id}`}
                            onClick={() => {
                              // Close sidebar on mobile when clicking nav link
                              if (window.innerWidth < 768 && sidebarOpen) {
                                onSidebarToggle();
                              }
                            }}
                            className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-md text-base font-medium transition-colors cursor-pointer ${
                              activeItem === item.id
                                ? "bg-accent text-accent-foreground"
                                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            }`}
                          >
                            {item.icon}
                            {item.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </>
        )}
      </aside>

      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onSidebarToggle}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 md:px-6">
          {/* Mobile menu button */}
          <button
            onClick={onSidebarToggle}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors cursor-pointer"
            aria-label="Toggle menu"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
              />
            </svg>
          </button>

          <div className="hidden md:block">{customHeader}</div>

          {/* Header Actions and User Profile */}
          <div className="flex items-center gap-3">
            {headerActions}

            {/* User Profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white font-medium text-sm hover:bg-purple-700 transition-colors cursor-pointer overflow-hidden"
              >
                {userImage ? (
                  <img
                    src={userImage}
                    alt={userName}
                    className="w-full h-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  getFirstLetter(userName)
                )}
              </button>

              {/* Dropdown Menu */}
              {profileOpen && (
                <div className="absolute right-0 top-12 w-72 bg-background border border-border rounded-xl shadow-lg z-50 overflow-hidden">
                  {/* User Info */}
                  <div className="p-4 flex items-center gap-3 border-b border-border">
                    <div className="w-11 h-11 rounded-full bg-purple-600 flex items-center justify-center text-white font-medium text-base flex-shrink-0 overflow-hidden">
                      {userImage ? (
                        <img
                          src={userImage}
                          alt={userName}
                          className="w-full h-full rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        getFirstLetter(userName)
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {userName}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {userEmail}
                      </p>
                    </div>
                  </div>

                  {/* Theme Selector */}
                  <div className="p-4 border-b border-border">
                    <p className="text-sm font-medium text-foreground mb-3">
                      Theme
                    </p>
                    <div className="flex bg-muted border border-border rounded-lg p-1">
                      {(["light", "dark", "device"] as Theme[]).map((t) => (
                        <button
                          key={t}
                          onClick={() => handleThemeChange(t)}
                          className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer capitalize ${
                            theme === t
                              ? "bg-background text-foreground shadow-sm border border-border"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {t === "device"
                            ? "Device"
                            : t.charAt(0).toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Logout */}
                  <div className="p-2">
                    <button
                      onClick={() => {
                        // Clear localStorage
                        localStorage.removeItem("access_token");
                        localStorage.removeItem("user");
                        // Clear cookie
                        document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
                        // Sign out via NextAuth
                        signOut({ callbackUrl: "/login" });
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"
                        />
                      </svg>
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="w-full px-4 md:px-6 lg:px-8">{children}</div>
        </div>
      </main>

      {/* Talk to Us Floating Action Button - Hidden when dialogs are open */}
      {floatingButtonHideCount === 0 && (
        <div className="fixed bottom-6 right-6 z-50" ref={talkToUsRef}>
          {/* Popup */}
          {talkToUsOpen && (
            <div className="absolute bottom-14 right-0 w-56 bg-background border border-border rounded-xl shadow-lg overflow-hidden mb-2">
              <div className="p-2">
                <a
                  href={WHATSAPP_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  Join WhatsApp
                </a>
                <a
                  href={DISCORD_INVITE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <svg
                    className="w-5 h-5 text-indigo-500 flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                  </svg>
                  Join Discord
                </a>
              </div>
            </div>
          )}

          {/* FAB Button */}
          <button
            onClick={() => setTalkToUsOpen(!talkToUsOpen)}
            className={`h-10 rounded-full shadow-lg flex items-center gap-2 px-4 text-sm font-medium transition-all cursor-pointer ${
              talkToUsOpen
                ? "bg-muted-foreground text-background"
                : "bg-foreground text-background hover:opacity-90"
            }`}
          >
            {talkToUsOpen ? (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25z"
                />
              </svg>
            )}
            {talkToUsOpen ? "Close" : "Talk to us"}
          </button>
        </div>
      )}
    </div>
  );
}
