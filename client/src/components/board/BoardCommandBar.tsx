import type { ReactNode } from "react";
import { Bell, Filter, RefreshCw, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface BoardCommandAction {
  label: string;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost" | "secondary";
}

export interface BoardCommandTab {
  id: string;
  label: string;
  count?: number;
}

interface BoardCommandBarProps {
  title?: string;
  kicker?: string;
  statusLabel?: string;
  liveCount?: number;
  tabs?: BoardCommandTab[];
  activeTabId?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  actions?: BoardCommandAction[];
  density?: "default" | "compact";
  className?: string;
  children?: ReactNode;
  onTabChange?: (tabId: string) => void;
  onSearchChange?: (value: string) => void;
}

export function BoardCommandBar({
  title,
  kicker = "Story Board",
  statusLabel,
  liveCount,
  tabs,
  activeTabId,
  searchValue,
  searchPlaceholder = "Search stories",
  actions,
  density = "default",
  className,
  children,
  onTabChange,
  onSearchChange,
}: BoardCommandBarProps) {
  const isCompact = density === "compact";

  return (
    <section className={cn("board-command-bar max-w-full overflow-hidden rounded-md border border-border bg-card/90 shadow-[0_18px_48px_rgba(0,0,0,0.18)]", className)}>
      <div className={cn("flex max-w-full flex-wrap items-center gap-2 px-3 sm:gap-3 sm:px-4", isCompact ? "py-2 sm:py-2.5" : "py-2.5 sm:py-3")}>
        <div className="board-command-brand" aria-label="EdgeSetter sports intelligence">
          <span>ES</span>
          <strong>EdgeSetter</strong>
        </div>
        <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-auto">
          <div className="section-kicker mb-1">
            <span>{kicker}</span>
          </div>
          {title && <h2 className="truncate font-sans text-lg font-bold leading-tight text-foreground sm:text-xl">{title}</h2>}
        </div>

        {(statusLabel || liveCount != null) && (
          <div className="order-3 flex min-w-0 basis-full items-center gap-2 rounded border border-border bg-muted/20 px-2.5 py-1.5 sm:order-none sm:basis-auto">
            {liveCount != null && <span className="es-live-dot es-live-pulse" />}
            <span className="data-label min-w-0 truncate text-[0.68rem] text-muted-foreground">
              {statusLabel ?? `${liveCount} live`}
            </span>
          </div>
        )}

        <div className="order-2 flex shrink-0 items-center gap-2 sm:order-none">
          {actions?.map((action) => (
            <Button
              key={action.label}
              type="button"
              size="sm"
              variant={action.variant ?? "outline"}
              disabled={action.disabled}
              onClick={action.onClick}
              title={action.label}
            >
              {action.icon ?? defaultActionIcon(action.label)}
              <span className="hidden sm:inline">{action.label}</span>
            </Button>
          ))}
        </div>
      </div>

      {(tabs?.length || onSearchChange || children) && (
        <div className={cn("flex max-w-full flex-col overflow-hidden border-t border-border/70 px-3 sm:flex-row sm:items-center sm:px-4", isCompact ? "gap-1 py-1 sm:gap-1.5 sm:py-1.5" : "gap-1.5 py-1.5 sm:gap-2 sm:py-2")}>
          {tabs?.length ? (
            <div className="flex max-w-full gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] sm:flex-nowrap sm:[&::-webkit-scrollbar]:hidden">
              {tabs.map((tab) => {
                const active = tab.id === activeTabId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange?.(tab.id)}
                    aria-pressed={active}
                    className={cn(
                      "ux-tab-interactive flex min-w-0 max-w-[9.5rem] shrink-0 items-center justify-center gap-2 rounded border font-bold uppercase tracking-widest sm:max-w-full",
                      isCompact ? "h-6 px-2 text-[0.62rem] sm:h-7 sm:px-2.5 sm:text-[0.66rem]" : "h-7 px-2.5 text-[0.68rem] sm:h-8 sm:px-3 sm:text-[0.72rem]",
                      active ? "border-primary/60 bg-primary text-primary-foreground" : "border-border bg-muted/20 text-muted-foreground",
                    )}
                  >
                    <span className="truncate">{tab.label}</span>
                    {tab.count != null && <span className="font-mono tabular-nums">{tab.count}</span>}
                  </button>
                );
              })}
            </div>
          ) : null}

          {onSearchChange && (
            <label className="relative min-w-[190px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchValue ?? ""}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-8 border-border bg-muted/20 pl-8 text-sm"
              />
            </label>
          )}

          {children && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">{children}</div>}
        </div>
      )}
    </section>
  );
}

function defaultActionIcon(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("refresh")) return <RefreshCw className="h-4 w-4" />;
  if (normalized.includes("alert") || normalized.includes("notify")) return <Bell className="h-4 w-4" />;
  if (normalized.includes("filter")) return <Filter className="h-4 w-4" />;
  return <SlidersHorizontal className="h-4 w-4" />;
}
