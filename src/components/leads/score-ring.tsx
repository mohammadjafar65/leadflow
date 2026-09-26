import { scoreColor } from "@/store/leads-store";
import type { Lead } from "@/types/lead";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

const COLOR_MAP = {
  success: "stroke-success",
  warning: "stroke-warning",
  destructive: "stroke-destructive",
} as const;

/** Circular 0-100 score indicator with a hover breakdown (design.md §7). */
export function ScoreRing({ lead, size = 36 }: { lead: Lead; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - lead.score / 100);
  const colorClass = COLOR_MAP[scoreColor(lead)];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={3} className="stroke-muted fill-none" />
            <circle
              cx={size / 2} cy={size / 2} r={radius} strokeWidth={3}
              className={`${colorClass} fill-none transition-[stroke-dashoffset] duration-500 ease-out`}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-xs font-medium">{lead.score}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {lead.scoreBreakdown ? (
          <dl className="text-xs space-y-1">
            <div className="flex justify-between gap-4"><dt>Data completeness</dt><dd>{lead.scoreBreakdown.completeness}/25</dd></div>
            <div className="flex justify-between gap-4"><dt>Industry match</dt><dd>{lead.scoreBreakdown.industryMatch}/25</dd></div>
            <div className="flex justify-between gap-4"><dt>Website quality</dt><dd>{lead.scoreBreakdown.websiteQuality}/20</dd></div>
            <div className="flex justify-between gap-4"><dt>Engagement</dt><dd>{lead.scoreBreakdown.engagement}/30</dd></div>
          </dl>
        ) : "No score breakdown available"}
      </TooltipContent>
    </Tooltip>
  );
}
