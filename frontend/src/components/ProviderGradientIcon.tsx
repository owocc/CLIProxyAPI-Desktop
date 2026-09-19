import { useId } from "react"
import claudeColor from "@lobehub/icons-static-svg/icons/claude-color.svg"
import antigravityColor from "@lobehub/icons-static-svg/icons/antigravity-color.svg"
import kimiColor from "@lobehub/icons-static-svg/icons/kimi-color.svg"
import devinColor from "@lobehub/icons-static-svg/icons/devin-color.svg"
import grokSvg from "@lobehub/icons-static-svg/icons/grok.svg"

export type SupportedProviderId = "codex" | "claude" | "antigravity" | "kimi" | "xai" | "devin"

export interface ProviderGradientConfig {
  id: SupportedProviderId
  name: string
  pillTag: string
  dotColor: string
  bgLight: string
  bgDark: string
  borderLight: string
  borderDark: string
  glowRgba: string
  accentColor: string
  desc: string
}

export const PROVIDER_GRADIENTS: Record<SupportedProviderId, ProviderGradientConfig> = {
  codex: {
    id: "codex",
    name: "Codex OAuth",
    pillTag: "原生授权 · 推荐",
    dotColor: "bg-emerald-500",
    bgLight: "bg-[#F3FAF6]",
    bgDark: "dark:bg-emerald-950/20",
    borderLight: "border-emerald-600/15",
    borderDark: "dark:border-emerald-500/20",
    glowRgba: "rgba(16, 185, 129, 0.25)",
    accentColor: "#10B981",
    desc: "OpenAI / ChatGPT 平台原生开发者授权，提供官方全系模型直连支持。",
  },
  claude: {
    id: "claude",
    name: "Claude OAuth",
    pillTag: "官方直连 · 稳定",
    dotColor: "bg-orange-500",
    bgLight: "bg-[#FAF4EE]",
    bgDark: "dark:bg-orange-950/20",
    borderLight: "border-orange-600/15",
    borderDark: "dark:border-orange-500/20",
    glowRgba: "rgba(217, 119, 87, 0.25)",
    accentColor: "#D97757",
    desc: "Anthropic Claude Code 官方安全授权登录，畅享 Claude 3.5 / 3.7 系列能力。",
  },
  antigravity: {
    id: "antigravity",
    name: "Antigravity OAuth",
    pillTag: "开发者渠道",
    dotColor: "bg-blue-500",
    bgLight: "bg-[#F3F7FD]",
    bgDark: "dark:bg-blue-950/20",
    borderLight: "border-blue-600/15",
    borderDark: "dark:border-blue-500/20",
    glowRgba: "rgba(49, 134, 255, 0.25)",
    accentColor: "#3186FF",
    desc: "Google Cloud Code / Gemini 开发者授权接入，提供超长上下文与多模态支持。",
  },
  kimi: {
    id: "kimi",
    name: "Kimi OAuth",
    pillTag: "网页授权",
    dotColor: "bg-sky-500",
    bgLight: "bg-[#F0F7FB]",
    bgDark: "dark:bg-sky-950/20",
    borderLight: "border-sky-600/15",
    borderDark: "dark:border-sky-500/20",
    glowRgba: "rgba(23, 131, 255, 0.25)",
    accentColor: "#1783FF",
    desc: "Moonshot Kimi 网页授权链路，支持自动循环接收与长文本推理模型调用。",
  },
  xai: {
    id: "xai",
    name: "xAI OAuth",
    pillTag: "订阅授权",
    dotColor: "bg-zinc-700 dark:bg-zinc-300",
    bgLight: "bg-[#F5F5F7]",
    bgDark: "dark:bg-zinc-900/40",
    borderLight: "border-zinc-400/20",
    borderDark: "dark:border-zinc-700/30",
    glowRgba: "rgba(100, 116, 139, 0.22)",
    accentColor: "#475569",
    desc: "xAI Grok CLI 订阅开发者授权，原生适配 Grok 2 及超快视觉与推理模式。",
  },
  devin: {
    id: "devin",
    name: "Devin OAuth",
    pillTag: "代码助手",
    dotColor: "bg-teal-500",
    bgLight: "bg-[#F0F8F6]",
    bgDark: "dark:bg-teal-950/20",
    borderLight: "border-teal-600/15",
    borderDark: "dark:border-teal-500/20",
    glowRgba: "rgba(33, 193, 154, 0.25)",
    accentColor: "#21C19A",
    desc: "Cognition Devin 全自主代码助手官方授权，支持端到端编码会话透传。",
  },
}

const PROVIDER_ICONS: Record<Exclude<SupportedProviderId, "codex">, string> = {
  claude: claudeColor,
  antigravity: antigravityColor,
  kimi: kimiColor,
  xai: grokSvg,
  devin: devinColor,
}

interface ProviderGradientIconProps {
  provider: SupportedProviderId
  size?: number
  className?: string
  withGlow?: boolean
}

export function ProviderGradientIcon({
  provider,
  size = 180,
  className = "",
  withGlow = true,
}: ProviderGradientIconProps) {
  const rawId = useId()
  const gradientId = `p-grad-codex-${rawId.replace(/:/g, "")}`
  const config = PROVIDER_GRADIENTS[provider] || PROVIDER_GRADIENTS.codex

  return (
    <div
      className={`relative flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Soft blurred radial glow behind the icon */}
      {withGlow && (
        <div
          className="absolute inset-0 rounded-full blur-2xl transition-opacity duration-500"
          style={{
            background: config.glowRgba,
            transform: "scale(1.1)",
          }}
        />
      )}

      {/* Codex: Initial linear gradient vector icon */}
      {provider === "codex" ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-sm transition-transform duration-500 group-hover:scale-105"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
            fill={`url(#${gradientId})`}
          />
        </svg>
      ) : provider === "xai" ? (
        // For Grok: adapt gracefully in both light (dark slate) and dark mode (bright zinc)
        <div className="relative w-full h-full flex items-center justify-center text-zinc-800 dark:text-zinc-100 drop-shadow-md transition-transform duration-500 group-hover:scale-105">
          <img
            src={PROVIDER_ICONS.xai}
            alt={config.name}
            className="w-full h-full object-contain filter invert-0 dark:invert"
            draggable={false}
          />
        </div>
      ) : (
        <img
          src={PROVIDER_ICONS[provider]}
          alt={config.name}
          className="relative w-full h-full object-contain drop-shadow-md transition-transform duration-500 group-hover:scale-105"
          draggable={false}
        />
      )}
    </div>
  )
}
