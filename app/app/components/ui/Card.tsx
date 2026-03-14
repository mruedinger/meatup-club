import type { ReactNode, HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  children: ReactNode;
}

/**
 * Surface container for grouped content.
 * @example <Card className="p-6">...</Card>
 */
export function Card({ hover = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`card-shell ${hover ? "card-hover" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
