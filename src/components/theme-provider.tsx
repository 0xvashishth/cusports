"use client"

import { createContext, useContext, useEffect, useRef } from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

interface OrgTheme {
  primaryColor: string
  secondaryColor: string
  accentColor: string
  logoUrl: string | null
  bannerUrl: string | null
}

const defaultOrgTheme: OrgTheme = {
  primaryColor: "#2563eb",
  secondaryColor: "#f1f5f9",
  accentColor: "#f1f5f9",
  logoUrl: null,
  bannerUrl: null,
}

const OrgThemeContext = createContext<OrgTheme>(defaultOrgTheme)

export function useOrgTheme() {
  return useContext(OrgThemeContext)
}

export function OrgThemeProvider({
  children,
  theme = defaultOrgTheme,
}: {
  children: React.ReactNode
  theme?: OrgTheme
}) {
  const prevRef = useRef<Record<string, string>>({})

  useEffect(() => {
    const root = document.documentElement
    const saved: Record<string, string> = {}

    const vars = [
      ["--primary", theme.primaryColor],
      ["--secondary", theme.secondaryColor],
      ["--accent", theme.accentColor],
    ]

    for (const [key, val] of vars) {
      saved[key] = getComputedStyle(root).getPropertyValue(key).trim() || ""
      const hue = extractHue(val)
      if (hue !== null) {
        root.style.setProperty(key, `${hue} 83.2% 53.3%`)
      }
    }

    prevRef.current = saved

    return () => {
      for (const [key, val] of Object.entries(prevRef.current)) {
        if (val) root.style.setProperty(key, val)
        else root.style.removeProperty(key)
      }
    }
  }, [theme])

  return (
    <OrgThemeContext.Provider value={theme}>
      {children}
    </OrgThemeContext.Provider>
  )
}

function extractHue(hex: string): number | null {
  const match = hex.match(/^#?([0-9a-f]{6})$/i)
  if (!match) return null
  const r = parseInt(match[1].slice(0, 2), 16) / 255
  const g = parseInt(match[1].slice(2, 4), 16) / 255
  const b = parseInt(match[1].slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max === min) return 0
  let h = 0
  if (max === r) h = 60 * ((g - b) / (max - min))
  else if (max === g) h = 60 * (2 + (b - r) / (max - min))
  else h = 60 * (4 + (r - g) / (max - min))
  if (h < 0) h += 360
  return Math.round(h)
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
