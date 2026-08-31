import Link from "next/link";
import { Button } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="animate-fade-up">
        <p className="font-display text-4xl font-semibold tracking-tight text-emerald-900">
          MyWitness
        </p>
      </div>

      <div className="mt-10 space-y-4 rounded-3xl bg-white/90 p-5 shadow-sm ring-1 ring-stone-200/70">
        <h1 className="font-display text-xl font-semibold text-stone-900">
          Page not found
        </h1>
        <p className="text-sm text-stone-600">
          That page doesn&rsquo;t exist, or may have moved.
        </p>
        <Link href="/today">
          <Button className="w-full">Go to Today</Button>
        </Link>
      </div>
    </div>
  );
}
