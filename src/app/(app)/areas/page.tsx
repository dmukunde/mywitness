"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MapPinned } from "lucide-react";
import { useApp } from "@/lib/app-context";
import { Card, EmptyState, PageHeader } from "@/components/ui";

export default function AreasPage() {
  const { areas, people } = useApp();

  const enriched = useMemo(() => {
    return [...areas]
      .map((area) => ({
        area,
        count: people.filter((p) => p.area_id === area.id).length,
      }))
      .sort((a, b) => a.area.name.localeCompare(b.area.name));
  }, [areas, people]);

  return (
    <div className="animate-fade-up space-y-4">
      <PageHeader title="Areas" subtitle="Ministry organized by neighbourhood" />

      {enriched.length === 0 ? (
        <EmptyState
          title="No areas yet"
          description="Areas are created from a person's profile — add or edit a person and set their area."
        />
      ) : (
        <div className="space-y-2">
          {enriched.map(({ area, count }) => (
            <Link key={area.id} href={`/areas/${area.id}`}>
              <Card className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-stone-400" />
                  <p className="font-medium text-stone-900">{area.name}</p>
                </div>
                <span className="text-sm text-stone-500">
                  {count} {count === 1 ? "person" : "people"}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
