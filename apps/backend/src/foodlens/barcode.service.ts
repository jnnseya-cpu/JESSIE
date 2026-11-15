import { Injectable, Logger } from '@nestjs/common';

/**
 * Barcode lookup.
 *
 * A packet carries the truth already — the manufacturer measured it in a
 * lab, which no photograph can match. Open Food Facts is the open
 * database of those labels: free, no account, no key, no commercial
 * relationship, published under an open licence. A lookup either returns
 * a real label or returns nothing; it never guesses, because the entire
 * point of a barcode is that it does not have to.
 */

import { toLabelFacts, type LabelFacts } from './barcode.logic';

export { toLabelFacts, type LabelFacts };

interface FetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);
  private readonly cache = new Map<string, { at: number; facts: LabelFacts | null }>();
  private readonly ttlMs = 24 * 60 * 60 * 1000;

  async lookup(barcode: string): Promise<LabelFacts | null> {
    const code = barcode.replace(/\D/g, '');
    if (code.length < 6 || code.length > 14) return null;

    const cached = this.cache.get(code);
    if (cached && Date.now() - cached.at < this.ttlMs) return cached.facts;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const response = (await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json` +
        /*
         * Four more groups of fields than the panel alone.
         *
         * Each one answers a question Nutri-Score is explicit about not
         * answering: nova_group is how processed it is, additives_tags
         * is what has been put in, origins and manufacturing_places are
         * where it came from, and nutriscore_grade is the database's own
         * letter to check this platform's computation against.
         *
         * `categories_tags` is here to pick the scoring table — a drink
         * scored on the food table reads two grades better than it is,
         * and the category is the only thing that prevents it.
         */
        '?fields=product_name,brands,quantity,nutriments,allergens_tags,ingredients_text,' +
          'nova_group,additives_tags,origins,manufacturing_places,countries,' +
          'nutriscore_grade,categories_tags',
        {
          signal: controller.signal,
          headers: { 'user-agent': 'JessMove/1.0 (wellness platform; contact jess@jessmove.com)' },
        },
      )) as unknown as FetchResponse;
      clearTimeout(timer);

      if (!response.ok) {
        this.cache.set(code, { at: Date.now(), facts: null });
        return null;
      }

      const body = (await response.json()) as {
        status?: number;
        product?: Record<string, unknown>;
      };
      if (body.status !== 1 || !body.product) {
        this.cache.set(code, { at: Date.now(), facts: null });
        return null;
      }

      const facts = toLabelFacts(code, body.product);
      this.cache.set(code, { at: Date.now(), facts });
      return facts;
    } catch (error) {
      this.logger.warn(`barcode lookup failed for ${code}: ${(error as Error).message}`);
      return null;
    }
  }
}

