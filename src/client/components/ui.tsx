// Kleine, barrierearme Bausteine der Oberfläche.
import { forwardRef, useId, useState, type ReactNode } from 'react';
import * as RSwitch from '@radix-ui/react-switch';
import * as RSlider from '@radix-ui/react-slider';
import * as RDialog from '@radix-ui/react-dialog';
import * as RTooltip from '@radix-ui/react-tooltip';
import { AlertCircle, AlertTriangle, Eye, EyeOff, X } from 'lucide-react';
import { ICONS } from '@shared/icons.generated';
import type { Issue } from '@shared/content';

export function Glyph({ id, size = 18, color }: { id: string; size?: number; color?: string }) {
  const icon = ICONS[id] ?? ICONS.globe;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: 'none' }}>
      {icon.kind === 'fill'
        ? <path d={icon.d.join('')} fill={color ?? 'currentColor'} />
        : <path d={icon.d.join('')} fill="none" stroke={color ?? 'currentColor'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

export function IssueLine({ issue }: { issue: Issue }) {
  return (
    <div className={`field-issue ${issue.level}`} role={issue.level === 'error' ? 'alert' : undefined}>
      {issue.level === 'error' ? <AlertCircle size={14} style={{ marginTop: 2, flex: 'none' }} /> : <AlertTriangle size={14} style={{ marginTop: 2, flex: 'none' }} />}
      <span>{issue.message}</span>
    </div>
  );
}

export function Field({ label, help, issues, children, htmlFor, aside, className }: {
  label: ReactNode; help?: ReactNode; issues?: Issue[]; children: ReactNode; htmlFor?: string; aside?: ReactNode; className?: string;
}) {
  return (
    <div className={`field ${className ?? ''}`}>
      <label className="field-label" htmlFor={htmlFor}><span>{label}</span>{aside}</label>
      {children}
      {issues?.map((i, k) => <IssueLine key={k} issue={i} />)}
      {help && !issues?.length ? <div className="field-help">{help}</div> : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  ({ invalid, className, ...rest }, ref) => <input ref={ref} className={`input ${className ?? ''}`} aria-invalid={invalid || undefined} {...rest} />,
);

export function SecretInput({ value, onChange, id, placeholder, invalid }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string; invalid?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-group">
      <input id={id} className="input" type={show ? 'text' : 'password'} value={value} placeholder={placeholder} autoComplete="new-password"
        spellCheck={false} aria-invalid={invalid || undefined} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="btn btn-ghost btn-icon" onClick={() => setShow(!show)} aria-label={show ? 'Passwort verbergen' : 'Passwort anzeigen'}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function Switch({ checked, onChange, label, help, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; help?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="switch">
      <label htmlFor={id} style={{ cursor: 'pointer', minWidth: 0 }}>
        <div style={{ fontWeight: 550, fontSize: 13.5 }}>{label}</div>
        {help && <div className="field-help">{help}</div>}
      </label>
      <RSwitch.Root id={id} className="switch-track" checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="label-row"><span>{label}</span><output>{format ? format(value) : value}</output></div>
      <RSlider.Root className="slider" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])}>
        <RSlider.Track className="slider-track"><RSlider.Range className="slider-range" /></RSlider.Track>
        <RSlider.Thumb className="slider-thumb" aria-label={label} />
      </RSlider.Root>
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, full, label }: {
  value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; full?: boolean; label?: string;
}) {
  return (
    <div className={`seg ${full ? 'full' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} title={o.title} aria-label={o.title} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;
export function ColorInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="color-field">
      <label className="swatch" style={{ background: value }} title={label}>
        <span className="sr-only">{label}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <input className="input" aria-label={`${label} als Hex-Wert`} value={draft ?? value.toUpperCase()} maxLength={7} spellCheck={false}
        onChange={(e) => {
          let v = e.target.value.trim();
          if (v && !v.startsWith('#')) v = '#' + v;
          setDraft(v);
          if (HEX.test(v)) onChange(v.toLowerCase());
        }}
        onBlur={() => setDraft(null)} />
    </div>
  );
}

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="overlay" />
        <RDialog.Content className={`dialog ${wide ? 'wide' : ''}`} {...(description ? {} : { 'aria-describedby': undefined })}>
          <div className="dialog-head">
            <div>
              <RDialog.Title asChild><h2>{title}</h2></RDialog.Title>
              {description && <RDialog.Description className="muted" style={{ marginTop: 4 }}>{description}</RDialog.Description>}
            </div>
            <RDialog.Close className="btn btn-ghost btn-icon btn-sm" aria-label="Schließen"><X size={16} /></RDialog.Close>
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-foot">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content className="tooltip" sideOffset={6}>{label}</RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-label="Tessera" role="img">
      <rect x="3" y="3" width="15" height="15" rx="3.5" fill="currentColor" />
      <rect x="22" y="3" width="15" height="15" rx="7.5" fill="currentColor" opacity=".45" />
      <rect x="3" y="22" width="15" height="15" rx="3.5" fill="currentColor" opacity=".45" />
      <rect x="24.5" y="24.5" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  );
}

export function Confirm({ open, onOpenChange, title, body, confirmLabel, danger, onConfirm }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}
      footer={<>
        <button className="btn" onClick={() => onOpenChange(false)}>Abbrechen</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onConfirm(); onOpenChange(false); }} autoFocus>{confirmLabel}</button>
      </>}>
      <div className="muted">{body}</div>
    </Dialog>
  );
}
