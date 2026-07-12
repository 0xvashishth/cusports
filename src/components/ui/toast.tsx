"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, dispatch] = React.useReducer(toastReducer, [])
  const addToast = React.useCallback(
    (toast: Omit<ToasterToast, "id">) => {
      dispatch({ type: "ADD_TOAST", toast: { ...toast, id: genId() } })
    },
    []
  )
  const removeToast = React.useCallback((id: string) => {
    dispatch({ type: "DISMISS_TOAST", toastId: id })
  }, [])

  const contextValue = React.useMemo(
    () => ({ addToast, removeToast }),
    [addToast, removeToast]
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <Toaster toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}
ToastProvider.displayName = "ToastProvider"

type ToastActionElement = React.ReactElement<{
  className?: string
  altText: string
  children?: React.ReactNode
  onClick?: () => void
}>

type ToastProps = React.HTMLAttributes<HTMLDivElement>

type ToasterToast = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  variant?: "default" | "destructive"
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

type ToastAction =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "DISMISS_TOAST"; toastId: string }

let count = 0
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

function toastReducer(state: ToasterToast[], action: ToastAction): ToasterToast[] {
  switch (action.type) {
    case "ADD_TOAST":
      return [...state, action.toast]
    case "DISMISS_TOAST":
      return state.filter((t) => t.id !== action.toastId)
    default:
      return state
  }
}

interface ToastContextValue {
  addToast: (toast: Omit<ToasterToast, "id">) => void
  removeToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

function useToast() {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }

  const toast = React.useCallback(
    (props: Omit<ToasterToast, "id">) => {
      context.addToast(props)
    },
    [context]
  )

  const dismiss = React.useCallback(
    (id: string) => {
      context.removeToast(id)
    },
    [context]
  )

  return { toast, dismiss }
}

const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full",
  {
    variants: {
      variant: {
        default: "border bg-background text-foreground",
        destructive:
          "destructive group border-destructive bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const ToastViewport = React.forwardRef<
  HTMLOListElement,
  React.HTMLAttributes<HTMLOListElement>
>(({ className, ...props }, ref) => (
  <ol
    ref={ref}
    className={cn(
      "fixed bottom-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:max-w-[420px]",
      className
    )}
    {...props}
  />
))
ToastViewport.displayName = "ToastViewport"

interface ToasterProps {
  toasts: ToasterToast[]
  removeToast: (id: string) => void
}

const Toaster: React.FC<ToasterProps> = ({ toasts, removeToast }) => {
  return (
    <ToastViewport>
      {toasts.map((toast) => (
        <Toast key={toast.id} variant={toast.variant}>
          <div className="grid gap-1">
            {toast.title && (
              <ToastTitle>{toast.title}</ToastTitle>
            )}
            {toast.description && (
              <ToastDescription>{toast.description}</ToastDescription>
            )}
          </div>
          {toast.action}
          <ToastClose onClick={() => removeToast(toast.id)} />
        </Toast>
      ))}
    </ToastViewport>
  )
}
Toaster.displayName = "Toaster"

const Toast = React.forwardRef<
  HTMLDivElement,
  ToastProps & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  )
})
Toast.displayName = "Toast"

const ToastTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
))
ToastTitle.displayName = "ToastTitle"

const ToastDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm opacity-90", className)}
    {...props}
  />
))
ToastDescription.displayName = "ToastDescription"

const ToastClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" />
  </button>
))
ToastClose.displayName = "ToastClose"

export type { ToastActionElement, ToastProps }

export {
  ToastProvider,
  ToastViewport,
  Toaster,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  useToast,
}
