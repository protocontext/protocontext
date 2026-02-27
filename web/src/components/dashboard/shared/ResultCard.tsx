"use client";

import { Clock, Globe, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SearchResult } from "@/lib/api";

const CONTENT_TYPE_COLORS: Record<string, string> = {
  website: "border-border/40 text-muted-foreground",
  other: "border-border/40 text-muted-foreground",
  hospitality: "border-orange-500/30 text-orange-600 dark:text-orange-400",
  ecommerce: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  tours: "border-cyan-500/30 text-cyan-600 dark:text-cyan-400",
  product: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  room: "border-blue-500/30 text-blue-600 dark:text-blue-400",
  tour: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  action: "border-violet-500/30 text-violet-600 dark:text-violet-400",
  policy: "border-rose-500/30 text-rose-600 dark:text-rose-400",
};

interface ResultCardProps {
  result: SearchResult;
  index: number;
}

export function ResultCard({ result, index }: ResultCardProps) {
  const showTypeBadge = result.content_type && result.content_type !== "website";
  const typeColor = CONTENT_TYPE_COLORS[result.content_type] || CONTENT_TYPE_COLORS.website;

  return (
    <Card
      className="animate-fade-up hover:border-primary/20 transition-colors bg-card/50"
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: "backwards" }}
    >
      <CardContent className="pt-3 pb-3">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h3 className="text-sm font-medium truncate">{result.section}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {showTypeBadge && (
              <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-mono shrink-0 ${typeColor}`}>
                {result.content_type}
              </Badge>
            )}
            {result.lang && result.lang !== "en" && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono border-primary/30 text-primary shrink-0">
                {result.lang}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono border-border/40 shrink-0">
              {result.domain}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{result.body}</p>
        <div className="flex items-center gap-3 mt-1.5">
          {result.location && (
            <span className="text-[10px] text-muted-foreground/60 font-mono flex items-center gap-1">
              <Globe className="w-2.5 h-2.5" />
              {result.location}
            </span>
          )}
          {result.action_url && (
            <a
              href={result.action_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary/70 hover:text-primary font-mono flex items-center gap-1 transition-colors"
            >
              <Zap className="w-2.5 h-2.5" />
              Action URL
            </a>
          )}
          {result.updated && (
            <span className="text-[10px] text-muted-foreground/40 font-mono flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" />
              {result.updated}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
