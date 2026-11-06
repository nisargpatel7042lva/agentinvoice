import { Fragment, type Ref } from "react";

/** One line of display text: plain parts and highlighted parts. */
export type Line = (string | { hl: string })[];

/**
 * Renders lines as per-character spans (words kept whole with inline-block + nowrap) so `paint()` can reveal them.
 * The full sentence is also given to screen readers as plain text; the character spans are hidden from them.
 */
export function RevealText({ lines, as: Tag = "p", className, innerRef, id }: { lines: Line[]; as?: "h1" | "h2" | "p"; className?: string; innerRef?: Ref<HTMLElement>; id?: string }) {
  const plain = lines.map((l) => l.map((part) => (typeof part === "string" ? part : part.hl)).join("")).join(" ");
  return (
    <Tag id={id} className={className} ref={innerRef as never}>
      <span className="sr-only">{plain}</span>
      <span aria-hidden="true">
        {lines.map((line, li) => (
          <Fragment key={li}>
            {li > 0 && (
              <>
                <br />{" "}
              </>
            )}
            {line.map((part, pi) => {
              const text = typeof part === "string" ? part : part.hl;
              const hl = typeof part !== "string";
              return text.split(/(\s+)/).map((word, wi) =>
                /^\s+$/.test(word) || word === "" ? (
                  word
                ) : (
                  <span key={`${pi}-${wi}`} className="inline-block whitespace-nowrap">
                    {[...word].map((ch, ci) => (
                      <span key={ci} data-ch="" data-hl={hl ? "1" : undefined} style={{ color: "transparent" }}>
                        {ch}
                      </span>
                    ))}
                  </span>
                ),
              );
            })}
          </Fragment>
        ))}
      </span>
    </Tag>
  );
}
