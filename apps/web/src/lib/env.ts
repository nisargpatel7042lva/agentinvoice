// Safe to import from client and server code. Literal process.env reads so Next inlines them at build time.
export const isMock = process.env.NEXT_PUBLIC_MOCK === "1";
