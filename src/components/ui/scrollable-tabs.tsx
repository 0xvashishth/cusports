"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface ScrollableTabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  showArrows?: boolean
}

const ScrollableTabsList = React.forwardRef<HTMLDivElement, ScrollableTabsListProps>(
  ({ className, children, showArrows = true, ...props }, ref) => {
    const scrollRef = React.useRef<HTMLDivElement>(null)
    const [canScrollLeft, setCanScrollLeft] = React.useState(false)
    const [canScrollRight, setCanScrollRight] = React.useState(false)

    const checkScroll = React.useCallback(() => {
      const el = scrollRef.current
      if (!el) return

      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
    }, [])

    React.useEffect(() => {
      checkScroll()
      const el = scrollRef.current
      if (!el) return

      const resizeObserver = new ResizeObserver(checkScroll)
      resizeObserver.observe(el)
      el.addEventListener("scroll", checkScroll, { passive: true })

      const mutationObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === "attributes" &&
            mutation.attributeName === "data-state"
          ) {
            const target = mutation.target as HTMLElement
            if (target.getAttribute("data-state") === "active") {
              target.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" })
            }
          }
        }
      })
      mutationObserver.observe(el, { attributes: true, subtree: true, attributeFilter: ["data-state"] })

      return () => {
        resizeObserver.disconnect()
        el.removeEventListener("scroll", checkScroll)
        mutationObserver.disconnect()
      }
    }, [checkScroll])

    const scroll = React.useCallback((direction: "left" | "right") => {
      const el = scrollRef.current
      if (!el) return
      const amount = el.clientWidth / 2
      el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" })
    }, [])

    if (!showArrows) {
      return (
        <TabsPrimitive.List
          ref={ref}
          className={cn("inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground", className)}
          {...props}
        >
          {children}
        </TabsPrimitive.List>
      )
    }

    return (
      <div ref={ref} className={cn("relative flex items-center", className)} {...props}>
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 z-10 flex h-full w-8 items-center justify-center bg-gradient-to-r from-muted via-muted/80 to-transparent"
            aria-label="Scroll left"
            type="button"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <TabsPrimitive.List
          ref={scrollRef}
          className={cn(
            "flex flex-1 min-w-0 h-10 items-center rounded-md bg-muted p-1 text-muted-foreground gap-1 overflow-x-auto scrollbar-none",
            canScrollLeft ? "pl-8" : "pl-1",
            canScrollRight ? "pr-8" : "pr-1"
          )}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {children}
        </TabsPrimitive.List>
        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 z-10 flex h-full w-8 items-center justify-center bg-gradient-to-l from-muted via-muted/80 to-transparent"
            aria-label="Scroll right"
            type="button"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }
)
ScrollableTabsList.displayName = "ScrollableTabsList"

export { ScrollableTabsList }
