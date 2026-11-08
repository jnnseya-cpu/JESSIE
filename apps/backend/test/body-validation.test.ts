/**
 * Every request body is validated by a class, because nothing else is.
 *
 * This generalises a defect rather than restating it. `POST
 * /foodlens/basket` typed its body inline — `@Body() body: { products?:
 * BasketProduct[] }` — and TypeScript erases an inline type at compile
 * time, so the global ValidationPipe had no class to validate against.
 * A string got through, `basketFrom` walked its characters, and the
 * platform told somebody their shopping held two hundred items. Of 750
 * adversarial payloads that was the only one the pipe did not stop, and
 * of fifty endpoints that was the only one without a DTO. Those are the
 * same fact.
 *
 * Fixing that one endpoint and pinning it with one test left the defect
 * class open, and two more instances of it were in the tree the whole
 * time: `POST /movements` typed its body `Movement`, an interface, and
 * `PUT /state/:key` typed its body `{ value: unknown }`. Neither was
 * found by the sweep because the sweep probed the surfaces it had been
 * pointed at.
 *
 * So the rule is structural: a `@Body()` must bind to a class this
 * repository defines with validators on it. A type, an interface, an
 * inline object literal and `any` are all the same thing to the pipe —
 * nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');

/** Every controller, with its source. */
function controllers(): { rel: string; source: string }[] {
  const out: { rel: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.controller.ts')) {
        out.push({ rel: path.slice(SRC.length + 1), source: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(SRC);
  return out;
}

/** Every DTO class this repository declares, by name. */
function declaredDtoClasses(): Set<string> {
  const names = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(path, 'utf8');
        // `export` is optional: several controllers declare their DTO in
        // the controller file itself, unexported, which is fine — the
        // pipe needs a class, not a module boundary. An earlier version
        // of this scan required `export` and reported sixteen validated
        // endpoints as unvalidated.
        for (const m of source.matchAll(/(?:export )?class (\w+)/g)) names.add(m[1]!);
      }
    }
  };
  walk(SRC);
  return names;
}

/** `@Body()` bindings, as `{ handler, binding }` pairs. */
function bodyBindings(source: string): { line: string; type: string }[] {
  const out: { line: string; type: string }[] = [];
  // Matches `@Body() name: Type` through to the next comma or closing
  // paren, which is enough to capture an inline object literal too.
  for (const m of source.matchAll(/@Body\(\)\s*\w+\s*:\s*([^,)]+)/g)) {
    out.push({ line: m[0]!, type: m[1]!.trim() });
  }
  return out;
}

test('the scan found the controllers and their bodies', () => {
  /*
   * Asserted before anything is asserted clean. Five controls in this
   * repository were found passing while measuring nothing, and three more
   * were introduced while fixing those; a scan that silently matches zero
   * files is the most common shape of it.
   */
  const found = controllers();
  assert.ok(
    found.length >= 20,
    `expected the backend's controllers, found ${found.length}`,
  );

  const bindings = found.flatMap((c) => bodyBindings(c.source));
  assert.ok(
    bindings.length >= 40,
    `expected at least forty @Body() bindings, found ${bindings.length}. ` +
      'If the decorator spelling changed, this scan is measuring nothing.',
  );

  const classes = declaredDtoClasses();
  assert.ok(
    classes.size >= 40,
    `expected the DTO classes, found ${classes.size}`,
  );
});

test('every @Body() binds to a class this repository declares', () => {
  const classes = declaredDtoClasses();
  const offenders: string[] = [];

  for (const { rel, source } of controllers()) {
    for (const { type } of bodyBindings(source)) {
      // An inline object literal is the original defect, verbatim.
      if (type.startsWith('{')) {
        offenders.push(`${rel}: @Body() is an inline object type \`${type}\``);
        continue;
      }
      if (/\b(any|unknown|object|Record<)/.test(type)) {
        offenders.push(`${rel}: @Body() is \`${type}\`, which the pipe cannot check`);
        continue;
      }
      // A bare name must be a class declared here. An interface or type
      // alias imported from @jessmove/shared is erased and validates
      // nothing, which is how POST /movements went unvalidated.
      const bare = type.replace(/\[\]$/, '');
      if (!classes.has(bare)) {
        offenders.push(
          `${rel}: @Body() is \`${type}\`, which is not a class declared in ` +
            'apps/backend/src — a type or interface is erased at compile time ' +
            'and the ValidationPipe has nothing to validate against',
        );
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'request bodies without a validating class:\n' +
      offenders.map((o) => `  ${o}`).join('\n'),
  );
});

test('a DTO class carries at least one validator, not just fields', () => {
  /*
   * A class satisfies the check above by existing. A class with no
   * decorators satisfies the pipe too — `whitelist` strips every
   * unvalidated property, so a DTO with no validators forwards an empty
   * object and the handler sees nothing. That failure is quiet and looks
   * like a client bug.
   */
  const VALIDATOR = /@(Is[A-Z]\w*|Min|Max|MinLength|MaxLength|Matches|Length|ValidateNested|ArrayMaxSize|ArrayMinSize|Allow)\(/;
  const classes = declaredDtoClasses();
  const bound = new Set<string>();
  for (const { source } of controllers()) {
    for (const { type } of bodyBindings(source)) bound.add(type.replace(/\[\]$/, ''));
  }

  const bare: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts')) {
        const source = readFileSync(path, 'utf8');
        for (const m of source.matchAll(/(?:export )?class (\w+)[^{]*\{([\s\S]*?)\n\}/g)) {
          const [, name, body] = m;
          if (!bound.has(name!)) continue;
          if (!VALIDATOR.test(body!)) bare.push(name!);
        }
      }
    }
  };
  walk(SRC);

  assert.ok(classes.size > 0, 'no DTO classes were found to check');
  assert.deepEqual(
    bare,
    [],
    'these classes are bound to a @Body() but declare no validator, so the ' +
      'pipe strips every property off them: ' + bare.join(', '),
  );
});
