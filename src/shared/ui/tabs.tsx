import { cn } from '@/shared/lib/cn';

export function Tabs({
  label,
  items,
}: {
  label: string;
  items: Array<{ id: string; label: string; selected: boolean; onSelect: () => void }>;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="neu-inset flex gap-1 overflow-x-auto rounded-xl p-1"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.selected}
          tabIndex={item.selected ? 0 : -1}
          onClick={item.onSelect}
          className={cn(
            'min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition-all focus-visible:outline focus-visible:outline-2',
            item.selected
              ? 'neu-raised-sm text-primary'
              : 'text-muted hover:bg-raised/80 hover:text-ink',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
