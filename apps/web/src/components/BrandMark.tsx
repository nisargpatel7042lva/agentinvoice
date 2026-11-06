/** Invoice Agent mark: an ink tile with two invoice lines and a coral tick (invoice → paid). */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <rect width="22" height="22" rx="6" fill="var(--color-ink)" />
      <path d="M5.5 8h8M5.5 11.4h5" stroke="var(--color-canvas)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.4 14.4 14.4 16.3 17.2 12.4" stroke="var(--color-hot)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
