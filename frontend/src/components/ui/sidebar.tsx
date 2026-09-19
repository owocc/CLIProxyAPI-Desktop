import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { PanelLeft } from "lucide-react"
import { useIsMobile } from "../../hooks/use-mobile"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_WIDTH = "14rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

interface SidebarContextProps {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void
  openMobile: boolean
  setOpenMobile: (open: boolean | ((value: boolean) => boolean)) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }
  return context
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // Internal open state with local storage fallback
  const [_open, _setOpen] = React.useState(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COOKIE_NAME)
      if (stored !== null) {
        return stored === "true"
      }
    } catch {
      // ignore local storage errors
    }
    return defaultOpen
  })

  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }
      try {
        localStorage.setItem(SIDEBAR_COOKIE_NAME, String(openState))
      } catch {
        // ignore local storage errors
      }
    },
    [setOpenProp, open]
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((prev) => !prev) : setOpen((prev) => !prev)
  }, [isMobile, setOpen, setOpenMobile])

  // Keyboard shortcut: Cmd+B / Ctrl+B
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey
      ) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delay={200}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              ...style,
            } as React.CSSProperties
          }
          className={cn(
            "group/sidebar-wrapper flex h-screen w-screen overflow-hidden bg-sidebar",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

export function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  if (collapsible === "none") {
    return (
      <div
        data-slot="sidebar"
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  return (
    <aside
      data-slot="sidebar"
      data-state={state}
      data-collapsible={isCollapsed ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      className={cn(
        "group peer relative flex flex-col shrink-0 h-full border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,opacity] duration-200 ease-in-out select-none overflow-hidden",
        isCollapsed
          ? "w-0 border-r-0 opacity-0 pointer-events-none"
          : "w-(--sidebar-width) opacity-100",
        className
      )}
      {...props}
    >
      <div
        data-sidebar="sidebar"
        className="flex h-full w-(--sidebar-width) flex-col overflow-hidden"
      >
        {children}
      </div>
    </aside>
  )
}

export function SidebarHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("flex flex-col shrink-0", className)}
      {...props}
    />
  )
}

export function SidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2",
        className
      )}
      {...props}
    />
  )
}

export function SidebarGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("relative flex w-full min-w-0 flex-col", className)}
      {...props}
    />
  )
}

export function SidebarGroupLabel({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        "flex h-7 shrink-0 items-center px-2 text-xs font-medium text-sidebar-foreground/60 outline-none",
        className
      )}
      {...props}
    />
  )
}

export function SidebarGroupContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("w-full text-sm", className)}
      {...props}
    />
  )
}

export function SidebarMenu({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("flex w-full min-w-0 flex-col gap-1 list-none m-0 p-0", className)}
      {...props}
    />
  )
}

export function SidebarMenuItem({
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("group/menu-item relative list-none", className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  "peer/menu-button flex w-full items-center gap-3 overflow-hidden rounded-lg p-2 text-left text-sm font-medium outline-none ring-sidebar-ring transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "",
        outline: "bg-background shadow-xs border border-sidebar-border",
      },
      size: {
        default: "h-9 text-sm",
        sm: "h-8 text-xs",
        lg: "h-11 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export function SidebarMenuButton({
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & {
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()

  const button = (
    <button
      type="button"
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        sidebarMenuButtonVariants({ variant, size }),
        isActive
          ? "bg-primary text-primary-foreground shadow-xs font-semibold hover:bg-primary/90 hover:text-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )

  if (!tooltip || state !== "collapsed") {
    return button
  }

  const tooltipProps = typeof tooltip === "string" ? { children: tooltip } : tooltip

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltipProps}
      />
    </Tooltip>
  )
}

export function SidebarMenuBadge({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "pointer-events-none absolute right-2 flex h-5 min-w-5 select-none items-center justify-center rounded-md px-1 text-xs font-medium text-sidebar-foreground tabular-nums",
        className
      )}
      {...props}
    />
  )
}

export function SidebarFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("flex flex-col shrink-0 p-2 border-t border-sidebar-border/40", className)}
      {...props}
    />
  )
}

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn("size-7 text-muted-foreground hover:text-foreground", className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      title="切换侧边栏 (Cmd+B / Ctrl+B)"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      {...props}
    >
      <PanelLeft className="size-4" />
      <span className="sr-only">切换侧边栏</span>
    </Button>
  )
}

export function SidebarInset({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sidebar-inset"
      className={cn(
        "relative flex flex-1 flex-col min-w-0 h-full overflow-hidden bg-background",
        className
      )}
      {...props}
    />
  )
}
