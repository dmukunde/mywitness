"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/app-context";
import {
  Button,
  Card,
  EmptyState,
  Input,
  PageHeader,
  SectionTitle,
  Textarea,
} from "@/components/ui";
import { InterestBadge } from "@/components/InterestBadge";
import { formatDisplayDate } from "@/lib/utils";

export default function AreaDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { areas, people, returnVisits, bibleStudies, saveArea } = useApp();
  const area = areas.find((a) => a.id === params.id);

  const [editing, setEditing] = useState(false);
  const [landmarkNotes, setLandmarkNotes] = useState("");
  const [mapLink, setMapLink] = useState("");
  const [saving, setSaving] = useState(false);

  const areaPeople = useMemo(
    () => people.filter((p) => p.area_id === params.id),
    [people, params.id]
  );
  const areaPeopleIds = useMemo(
    () => new Set(areaPeople.map((p) => p.id)),
    [areaPeople]
  );
  const areaReturnVisits = useMemo(
    () =>
      returnVisits.filter(
        (rv) => rv.status === "planned" && areaPeopleIds.has(rv.person_id)
      ),
    [returnVisits, areaPeopleIds]
  );
  const areaBibleStudies = useMemo(
    () => bibleStudies.filter((s) => areaPeopleIds.has(s.person_id)),
    [bibleStudies, areaPeopleIds]
  );

  if (!area) {
    return (
      <EmptyState
        title="Area not found"
        action={
          <Link href="/areas">
            <Button>Back to Areas</Button>
          </Link>
        }
      />
    );
  }

  const startEdit = () => {
    setLandmarkNotes(area.landmark_notes || "");
    setMapLink(area.map_link || "");
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveArea(area.id, {
        landmark_notes: landmarkNotes.trim() || null,
        map_link: mapLink.trim() || null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-up space-y-5">
      <PageHeader title={area.name} subtitle="Area overview" />

      {editing ? (
        <Card className="space-y-3">
          <Textarea
            label="Landmark / directions notes"
            value={landmarkNotes}
            onChange={(e) => setLandmarkNotes(e.target.value)}
            placeholder="Enter off the main road at the blue kiosk…"
          />
          <Input
            label="Map link (optional)"
            value={mapLink}
            onChange={(e) => setMapLink(e.target.value)}
            placeholder="https://maps.google.com/…"
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="space-y-2 text-sm">
          {area.landmark_notes && <p className="text-stone-700">{area.landmark_notes}</p>}
          {area.map_link && (
            <a
              href={area.map_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex text-sm font-medium text-emerald-800 underline decoration-emerald-200 underline-offset-2"
            >
              Open map link
            </a>
          )}
          {!area.landmark_notes && !area.map_link && (
            <p className="text-stone-400">No directions or map link added yet.</p>
          )}
          <Button variant="secondary" size="sm" onClick={startEdit}>
            Edit area details
          </Button>
        </Card>
      )}

      <section>
        <SectionTitle title={`People (${areaPeople.length})`} />
        {areaPeople.length === 0 ? (
          <EmptyState title="No people in this area yet" />
        ) : (
          <div className="space-y-2">
            {areaPeople.map((p) => (
              <Link key={p.id} href={`/people/${p.id}`}>
                <Card className="flex items-center justify-between gap-2">
                  <p className="font-medium text-stone-900">{p.name}</p>
                  <InterestBadge level={p.interest_level} />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title={`Return visits (${areaReturnVisits.length})`} />
        {areaReturnVisits.length === 0 ? (
          <EmptyState title="No planned return visits here" />
        ) : (
          <div className="space-y-2">
            {areaReturnVisits.map((rv) => (
              <Link key={rv.id} href={`/return-visits/${rv.id}`}>
                <Card className="flex items-center justify-between gap-2">
                  <p className="font-medium text-stone-900">
                    {people.find((p) => p.id === rv.person_id)?.name || "Person"}
                  </p>
                  <span className="text-sm text-stone-500">
                    {formatDisplayDate(rv.scheduled_date)}
                  </span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title={`Bible studies (${areaBibleStudies.length})`} />
        {areaBibleStudies.length === 0 ? (
          <EmptyState title="No Bible studies here" />
        ) : (
          <div className="space-y-2">
            {areaBibleStudies.map((s) => (
              <Link key={s.id} href={`/bible-studies/${s.id}`}>
                <Card className="flex items-center justify-between gap-2">
                  <p className="font-medium text-stone-900">
                    {people.find((p) => p.id === s.person_id)?.name || "Student"}
                  </p>
                  <span className="text-sm text-stone-500">{s.publication}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Button variant="ghost" className="w-full" onClick={() => router.back()}>
        Back
      </Button>
    </div>
  );
}
