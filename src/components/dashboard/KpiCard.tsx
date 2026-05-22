import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
};

const toneClasses: Record<NonNullable<Props["tone"]>, string> = {
  good: "text-green-600 bg-green-100 dark:bg-green-950/40",
  warn: "text-amber-600 bg-amber-100 dark:bg-amber-950/40",
  bad: "text-red-600 bg-red-100 dark:bg-red-950/40",
  neutral: "text-primary bg-primary/10",
};

export default function KpiCard({ icon: Icon, label, value, hint, tone = "neutral" }: Props) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground leading-tight break-words">{label}</p>
            <p className="text-lg sm:text-2xl font-bold tracking-tight mt-1 tabular-nums break-words">{value}</p>
            {hint && <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 break-words leading-tight">{hint}</p>}
          </div>
          <div className={cn("rounded-md p-1.5 sm:p-2 shrink-0", toneClasses[tone])}>
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
