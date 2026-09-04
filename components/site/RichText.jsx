'use client';

import React from 'react';
import { parseInline } from '../../lib/domain/richtext';

export default function RichText({ text }) {
  const tokens = parseInline(text);
  return (
    <>
      {tokens.map((token, i) => {
        if (token.type === 'bold') return <strong key={i}>{token.value}</strong>;
        if (token.type === 'italic') return <em key={i}>{token.value}</em>;
        if (token.type === 'underline') return <u key={i}>{token.value}</u>;
        if (token.type === 'link') {
          return (
            <a
              key={i}
              href={token.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brick underline underline-offset-2"
            >
              {token.value}
            </a>
          );
        }
        return <React.Fragment key={i}>{token.value}</React.Fragment>;
      })}
    </>
  );
}
