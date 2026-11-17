import type { ComponentProps, ReactNode } from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type AppAlertTone = "info" | "warning" | "success" | "destructive";

const TONE_STYLES: Record<AppAlertTone, string> = {
  info: "border-info/30 bg-info/10 text-info *:data-[slot=alert-description]:text-info/90",
  warning: "border-warning/35 bg-warning/10 text-warning *:data-[slot=alert-description]:text-warning/90",
  success: "border-success/30 bg-success/10 text-success *:data-[slot=alert-description]:text-success/90",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive *:data-[slot=alert-description]:text-destructive/90",
};

interface AppAlertProps extends Omit<ComponentProps<typeof Alert>, "title"> {
  tone?: AppAlertTone;
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function AppAlert({
  tone = "info",
  icon,
  title,
  description,
  action,
  children,
  className,
  role = "note",
  ...props
}: AppAlertProps) {
  return (
    <Alert
      role={role}
      className={cn(TONE_STYLES[tone], className)}
      {...props}
    >
      {icon}
      {title && <AlertTitle>{title}</AlertTitle>}
      {(description || children) && (
        <AlertDescription>
          {description}
          {children}
        </AlertDescription>
      )}
      {action && <AlertAction>{action}</AlertAction>}
    </Alert>
  );
}
