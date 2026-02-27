"use client";

import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: string;
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
    return (
        <Card className="bg-card/50">
            <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-muted-foreground/60">{icon}</span>
                    {trend && (
                        <span className="text-[10px] font-mono text-primary/60">{trend}</span>
                    )}
                </div>
                <p className="text-2xl font-bold tracking-tight font-mono">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
        </Card>
    );
}
