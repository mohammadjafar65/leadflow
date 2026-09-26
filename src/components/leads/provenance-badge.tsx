import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EnrichmentRecord } from "@/types/lead";

const SOURCE_LABEL: Record<EnrichmentRecord["source"], string> = {
  openstreetmap:"OpenStreetMap",
  directory:"Business directory",
  places_api: "Google Places",
  site_scrape: "Website scrape",
  whois: "WHOIS",
  manual: "Manually entered",
};

/**
 * Shows provenance + confidence for a field so scraped/uncertain data is
 * never presented as verified fact (design.md Principle 2).
 */
export function ProvenanceBadge({ record }: { record: EnrichmentRecord }) {
  const low = record.confidence < 0.6;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={low ? "outline" : "secondary"} className="cursor-help">
          {SOURCE_LABEL[record.source]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">
          Confidence {(record.confidence * 100).toFixed(0)}% · observed{" "}
          {new Date(record.observedAt).toLocaleDateString()}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
