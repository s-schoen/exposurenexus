import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface MetadataSidebarProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  description?: string;
}

export function MetadataSidebar({
  title,
  icon: Icon,
  children,
  description,
}: MetadataSidebarProps) {
  return (
    <Card className="sticky top-0 min-w-80">
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          <Icon className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}
