import type { Person } from "@/lib/types";

/**
 * Finding people who are probably the same person.
 *
 * Names alone never decide anything — two people can share a name — so this
 * only ever *suggests*. Callers show the candidates and let the user answer.
 */

export type MatchLevel = "exact" | "similar";

export interface PersonMatch {
  person: Person;
  level: MatchLevel;
}

/** Lower-case, no accents or punctuation, single spaces. */
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "lillian" -> "lilian": a doubled letter is the commonest spelling slip. */
function squeeze(value: string): string {
  return value.replace(/(.)\1+/g, "$1");
}

/** Edit distance counting a swap of two neighbouring letters as one change. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/** One word of a name against another: the same, or a plausible misspelling. */
function wordsClose(a: string, b: string): boolean {
  if (a === b) return true;
  const longest = Math.max(a.length, b.length);
  // Short words must match exactly; "Eve" and "Eva" are different people.
  if (longest < 4) return false;
  // A misspelling rarely changes the first letter ("Ronald" is not "Donald").
  if (a[0] !== b[0]) return false;
  if (squeeze(a) === squeeze(b)) return true;
  const allowed = longest <= 7 ? 1 : 2;
  return distance(a, b) <= allowed;
}

/** How alike two names are, or null if they are not alike enough to suggest. */
export function compareNames(a: string, b: string): MatchLevel | null {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return null;
  if (na === nb) return "exact";

  const ta = na.split(" ");
  const tb = nb.split(" ");

  if (ta.length === tb.length) {
    return ta.every((w, i) => wordsClose(w, tb[i])) ? "similar" : null;
  }

  // "Ronald" and "Ronald Mukasa": a lone first name against a full name.
  const [short, long] = ta.length < tb.length ? [ta, tb] : [tb, ta];
  if (short.length === 1 && wordsClose(short[0], long[0])) return "similar";

  // "Mary Ann Smith" and "Mary Smith": the first and last words agree.
  if (
    short.length >= 2 &&
    wordsClose(short[0], long[0]) &&
    wordsClose(short[short.length - 1], long[long.length - 1])
  ) {
    return "similar";
  }
  return null;
}

/** People already in the list who could be `name`, exact matches first. */
export function findPersonMatches(
  people: Person[],
  name: string,
  opts: { excludeId?: string } = {}
): PersonMatch[] {
  const matches: PersonMatch[] = [];
  for (const person of people) {
    if (person.archived_at || person.id === opts.excludeId) continue;
    const level = compareNames(name, person.name);
    if (level) matches.push({ person, level });
  }
  return matches.sort((x, y) => {
    if (x.level !== y.level) return x.level === "exact" ? -1 : 1;
    return y.person.updated_at.localeCompare(x.person.updated_at);
  });
}

export interface DuplicatePair {
  a: Person;
  b: Person;
  level: MatchLevel;
}

/** Every pair of active contacts whose names suggest they may be one person. */
export function findDuplicatePairs(people: Person[]): DuplicatePair[] {
  const active = people.filter((p) => !p.archived_at);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const level = compareNames(active[i].name, active[j].name);
      if (level) pairs.push({ a: active[i], b: active[j], level });
    }
  }
  return pairs.sort((x, y) =>
    x.level === y.level ? 0 : x.level === "exact" ? -1 : 1
  );
}
