// 手动创建的 shadcn/ui 样式组件（基于 Radix + Tailwind）

import * as React from "react"
import { cn } from "../../lib/utils"

// ===== Button =====
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variants: Record<string, string> = {
      default: "bg-indigo-600 text-white hover:bg-indigo-700",
      destructive: "bg-red-600 text-white hover:bg-red-700",
      outline: "border border-white/10 bg-transparent text-white hover:bg-white/10",
      secondary: "bg-white/10 text-white hover:bg-white/20",
      ghost: "text-white hover:bg-white/10",
      link: "text-indigo-400 underline-offset-4 hover:underline",
    }
    const sizes: Record<string, string> = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      lg: "h-10 rounded-md px-8",
      icon: "h-9 w-9",
    }
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"
export { Button }

// ===== Badge =====
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
}
function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default: "bg-indigo-600/20 text-indigo-400 border-indigo-600/30",
    secondary: "bg-white/10 text-white/80 border-white/10",
    destructive: "bg-red-600/20 text-red-400 border-red-600/30",
    outline: "border border-white/10 text-white/60",
  }
  return (
    <div className={cn(
      "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
      variants[variant],
      className
    )} {...props} />
  )
}
export { Badge }

// ===== Card =====
function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(
      "rounded-xl border border-white/5 bg-white/5 backdrop-blur-xl shadow-sm",
      className
    )} {...props} />
  )
}
function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
}
function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold text-white", className)} {...props} />
}
function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />
}
export { Card, CardHeader, CardTitle, CardContent }

// ===== Table =====
function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  )
}
function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_tr]:border-b border-white/5", className)} {...props} />
}
function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}
function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-white/5 transition-colors hover:bg-white/5", className)} {...props} />
  )
}
function TableHead({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("h-10 px-4 text-left align-middle font-medium text-gray-400 text-xs", className)} {...props} />
  )
}
function TableCell({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("p-4 align-middle text-sm text-white", className)} {...props} />
  )
}
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }

// ===== Pagination =====
function Pagination({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <nav className={cn("mx-auto flex w-full justify-center", className)} {...props} />
}
function PaginationContent({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("flex flex-row items-center gap-1", className)} {...props} />
}
function PaginationItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("", className)} {...props} />
}
function PaginationButton({ className, children, disabled, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors",
        "h-8 w-8 text-white/60 hover:bg-white/10",
        disabled && "pointer-events-none opacity-30",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
export { Pagination, PaginationContent, PaginationItem, PaginationButton }
