"""
Parse every migration with PostgreSQL's own grammar before it is run.

WHY THIS EXISTS. 0087 shipped with a CTE named `window`, which is a reserved
word, and the only thing that noticed was the production database -- one
error at a time, by hand, with the schema half-applied in between. The real
parser is available offline, so there is no reason for a syntax error to
reach a database at all.

WHAT IT CHECKS, AND WHAT IT DOES NOT. Dollar-quoted bodies are just string
literals to the outer parser, so they are pulled out and parsed separately --
that is where the `window` bug was, and without this second pass the check
would happily pass a file that cannot be run. Nothing here resolves names: a
typo'd column, a missing table or a wrong argument type still only shows up
against a real schema.

    python scripts/check-sql.py [file ...]      (default: migrations/*.sql)
"""
import io
import re
import sys
import glob

try:
    from pglast import parse_sql, parse_plpgsql
    from pglast.parser import ParseError
except ImportError:
    sys.exit('pglast is not installed:  pip install pglast')

# $tag$ ... $tag$ -- the tag can be empty ($$) or a word ($fn$).
BODY = re.compile(r'\$([A-Za-z_][A-Za-z0-9_]*)?\$(.*?)\$\1?\$', re.S)


def line_of(text, offset):
    return text[:offset].count('\n') + 1 if isinstance(offset, int) else '?'


def wrapper_return_type(sql, body, start):
    """
    What to declare the throwaway wrapper as returning.

    Getting this wrong makes the checker cry wolf on correct SQL, which is
    worse than not having a checker at all. Three cases:

      DO block     -- an anonymous procedure returning nothing, so a bare
                      `RETURN;` is legal and `RETURNS void` is required.
      trigger      -- `RETURN NEW;` only parses where NEW is a known variable,
                      which it is under `RETURNS trigger` and nowhere else.
      anything else - `RETURNS text`, so `RETURN <value>;` parses. The real
                      return type is a runtime concern, not a parser one.
    """
    if re.search(r'\bDO\s*$', sql[max(0, start - 40):start], re.I):
        return 'void'
    if re.search(r'\b(NEW|OLD)\s*\.', body):
        return 'trigger'
    return 'text'


def check(path):
    sql = io.open(path, encoding='utf-8').read()
    problems = []

    try:
        parse_sql(sql)
    except ParseError as e:
        problems.append((line_of(sql, getattr(e, 'location', None)), str(e)))
    except Exception as e:
        problems.append(('?', f'{type(e).__name__}: {e}'))

    # The bodies. A CREATE FUNCTION whose body is nonsense parses perfectly at
    # the level above, because to the outer grammar the body is one long
    # string literal.
    for m in BODY.finditer(sql):
        body = m.group(2)
        if not body.strip():
            continue
        base = sql[:m.start(2)].count('\n') + 1

        # plpgsql is not SQL and will not parse as SQL, so it goes to its own
        # parser. Everything else is a LANGUAGE sql body.
        plpgsql = re.search(r'\bBEGIN\b', body, re.I) and \
                  re.search(r'\bEND\b', body, re.I)
        try:
            if plpgsql:
                rt = wrapper_return_type(sql, body, m.start())
                parse_plpgsql(f'CREATE FUNCTION _x() RETURNS {rt} '
                              f'LANGUAGE plpgsql AS $b${body}$b$;')
            else:
                parse_sql(body)
        except ParseError as e:
            off = getattr(e, 'location', None)
            at = base + line_of(body, off) - 1 if isinstance(off, int) else base
            problems.append((at, f'in a function body: {e}'))
        except Exception as e:
            if 'syntax error' in str(e).lower() or 'not a known' in str(e):
                problems.append((base, f'in a function body: {e}'))

    return problems


def main():
    files = sys.argv[1:] or sorted(glob.glob('migrations/*.sql'))
    bad = 0
    for f in files:
        problems = check(f)
        if problems:
            bad += 1
            print(f'FAIL {f}')
            for line, msg in problems:
                print(f'       line {line}: {msg}')
        else:
            print(f'ok   {f}')

    print()
    if bad:
        print(f'{bad} file(s) will not run.')
        return 1
    print(f'{len(files)} file(s) parse cleanly.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
