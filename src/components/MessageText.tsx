import React from "react";

interface MessageTextProps {
  text: string;
}

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${idx}`} className="font-semibold text-[#181A17]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={`${keyPrefix}-${idx}`}
          className="px-1.5 py-0.5 rounded bg-[#EFECE3] text-[13px] font-mono text-[#2C2F2A]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${idx}`}>{part}</React.Fragment>;
  });
}

export function MessageText({ text }: MessageTextProps) {
  const blocks = text.split(/\n{2,}/);

  return (
    <div dir="auto" className="space-y-3 text-[15px] leading-[1.68] text-[#1E201D]">
      {blocks.map((block, blockIdx) => {
        const lines = block.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length === 0) return null;

        const isBulletList = lines.every((l) => /^[-*•]\s+/.test(l.trim()));
        if (isBulletList) {
          return (
            <ul key={blockIdx} className="list-disc ps-5 space-y-1.5">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>
                  {renderInline(line.trim().replace(/^[-*•]\s+/, ""), `${blockIdx}-${lineIdx}`)}
                </li>
              ))}
            </ul>
          );
        }

        const isOrderedList = lines.every((l) => /^\d+[.)]\s+/.test(l.trim()));
        if (isOrderedList) {
          return (
            <ol key={blockIdx} className="list-decimal ps-5 space-y-1.5">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>
                  {renderInline(line.trim().replace(/^\d+[.)]\s+/, ""), `${blockIdx}-${lineIdx}`)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={blockIdx} className="whitespace-pre-wrap">
            {lines.map((line, lineIdx) => (
              <React.Fragment key={lineIdx}>
                {lineIdx > 0 && <br />}
                {renderInline(line, `${blockIdx}-${lineIdx}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
