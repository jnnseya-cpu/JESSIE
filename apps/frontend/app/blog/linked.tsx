import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { autoLinksFor } from '@jessmove/shared';

/**
 * A paragraph that links itself.
 *
 * Until now every internal link on an article lived in a list at the
 * bottom headed "Referenced here", which is the least valuable place a
 * link can be: readers do not reach it and it carries no context about why
 * one page relates to another. A link inside the sentence that already
 * mentions the subject does both jobs — it tells a reader where to go next
 * at the moment they wonder, and it tells a crawler what the destination
 * is about using the words around it.
 *
 * The linking is bounded and deliberate rather than greedy. The rules live
 * in `autoLinksFor`: one link per destination, first mention only, longest
 * phrase wins, never inside an existing link or a heading, never a link to
 * the page you are on. A paragraph where every other phrase is blue reads
 * as a link farm, and the value of each link falls as the count rises.
 *
 * A budget is carried across the whole article rather than applied per
 * paragraph, because five links in one article is the point — five links
 * in *each of twenty* paragraphs is not.
 */

export interface LinkBudget {
  /** Mutable on purpose: the article shares one budget across paragraphs. */
  remaining: number;
  /** Destinations already linked, so no page is pointed at twice. */
  used: Set<string>;
}

export function newLinkBudget(max: number): LinkBudget {
  return { remaining: max, used: new Set() };
}

export function Linked({
  text,
  selfPath,
  budget,
}: {
  text: string;
  selfPath: string;
  budget: LinkBudget;
}) {
  if (budget.remaining <= 0) return <>{text}</>;

  const links = autoLinksFor(text, {
    selfPath,
    max: budget.remaining,
    exclude: [...budget.used],
  });
  if (links.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;

  for (const link of links) {
    if (link.at < cursor) continue; // overlapping match, already consumed
    budget.used.add(link.path);
    budget.remaining -= 1;
    if (link.at > cursor) parts.push(text.slice(cursor, link.at));
    parts.push(
      <Link key={`${link.path}-${link.at}`} href={link.path}>
        {link.phrase}
      </Link>,
    );
    cursor = link.at + link.phrase.length;
    if (budget.remaining <= 0) break;
  }
  parts.push(text.slice(cursor));

  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}
