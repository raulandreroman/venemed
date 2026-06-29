/**
 * A2 queue skeleton (shown while the RSC list resolves). Static markup only —
 * no client hooks, so no risk of the set-state-in-effect lint rule.
 */
export default function AdminQueueLoading() {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-neutral-100 bg-surface">
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="h-9 w-9" />
          <div className="flex flex-col items-center gap-1">
            <span className="h-4 w-24 rounded bg-neutral-100" />
            <span className="h-3 w-20 rounded bg-neutral-100" />
          </div>
          <span className="h-9 w-9" />
        </div>
        <div className="flex border-b border-neutral-100">
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex flex-1 justify-center py-3">
              <span className="h-4 w-16 rounded bg-neutral-100" />
            </span>
          ))}
        </div>
      </header>

      <ul className="flex flex-col gap-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <li
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-surface p-4"
          >
            <span className="h-10 w-10 shrink-0 rounded-full bg-neutral-100" />
            <div className="flex-1 space-y-2">
              <span className="block h-4 w-2/3 rounded bg-neutral-100" />
              <span className="block h-3 w-1/2 rounded bg-neutral-100" />
              <span className="block h-3 w-1/3 rounded bg-neutral-100" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
