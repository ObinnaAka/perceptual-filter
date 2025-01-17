import { cn } from "../../lib/utils"

interface LogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

const sizeClasses = {
  sm: "w-8 h-8 text-lg",
  md: "w-12 h-12 text-2xl",
  lg: "w-16 h-16 text-3xl"
}

export function Logo({ className, size = "sm" }: LogoProps) {
  return (
    <div
      className={cn(
        "bg-primary rounded-lg flex items-center justify-center font-semibold text-primary-foreground",
        sizeClasses[size],
        className
      )}>
      Fi
    </div>
  )
}
