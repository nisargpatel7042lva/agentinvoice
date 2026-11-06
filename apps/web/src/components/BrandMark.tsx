/** AgentInvoice mark: a periwinkle disc with two invoice lines and a forward tick (invoice → paid). */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="11" fill="var(--color-highlight)" />
      <path d="M6 8.2h7.5M6 11.6h5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12.6 14.4 14.6 16.3 17.4 12.4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
