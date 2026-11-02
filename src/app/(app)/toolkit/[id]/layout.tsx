// Lets the app prepare a placeholder copy of this kind of page ("/toolkit/_") that
// the phone can keep and open with no signal (see public/sw.js). Real ids are
// still served normally when there is signal.
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
