import { useEffect, useRef, useState } from 'react';

export interface IconSelectOption {
  value: string;
  label: string;
  icon?: string;
  fallback?: string;
}

interface Props {
  value: string;
  options: IconSelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
}

function OptionIcon({ file, fallback }: { file?: string; fallback?: string }) {
  const [failed, setFailed] = useState(false);
  if (!file || failed) return <span className="icon-select-fallback" aria-hidden="true">{fallback ?? '·'}</span>;
  const url = `https://oldschool.runescape.wiki/images/${encodeURIComponent(file.replace(/ /g, '_'))}`;
  return <img className="icon-select-image" src={url} alt="" onError={() => setFailed(true)} />;
}

export default function IconSelect({ value, options, onChange, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('.icon-select-trigger')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const focusOption = (current: HTMLButtonElement, direction: number) => {
    const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])];
    const index = buttons.indexOf(current);
    buttons[(index + direction + buttons.length) % buttons.length]?.focus();
  };

  return <div className="icon-select" ref={root}>
    <button type="button" className="icon-select-trigger" aria-label={`${ariaLabel}: ${selected?.label ?? ''}`}
      aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          setOpen(true);
          window.setTimeout(() => root.current?.querySelector<HTMLButtonElement>('[role="option"]')?.focus(), 0);
        }
      }}>
      <span className="icon-select-leading"><OptionIcon file={selected?.icon} fallback={selected?.fallback} /></span>
      <span className="icon-select-value">{selected?.label ?? ''}</span>
      <span className="icon-select-caret" aria-hidden="true">▾</span>
    </button>
    {open && <div className="icon-select-menu" role="listbox" aria-label={ariaLabel}>
      {options.map((option) => <button type="button" role="option" aria-selected={option.value === value}
        className={`icon-select-option${option.value === value ? ' selected' : ''}`} key={option.value}
        onClick={() => { onChange(option.value); setOpen(false); root.current?.querySelector<HTMLButtonElement>('.icon-select-trigger')?.focus(); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); focusOption(event.currentTarget, 1); }
          if (event.key === 'ArrowUp') { event.preventDefault(); focusOption(event.currentTarget, -1); }
          if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const buttons = root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
            (event.key === 'Home' ? buttons?.[0] : buttons?.[buttons.length - 1])?.focus();
          }
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
        }}>
        <span className="icon-select-leading"><OptionIcon file={option.icon} fallback={option.fallback} /></span>
        <span className="icon-select-value">{option.label}</span>
      </button>)}
    </div>}
  </div>;
}
