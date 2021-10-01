import { AppMap, Event, EventNavigator, getSqlLabelFromString, SqlQuery } from '@appland/models';
import { Level } from 'src/types';
import Assertion from '../assertion';
import { obfuscate } from '../database';

function findRootEvent(event: Event): Event {
  let evt = event;
  while (evt.parent) {
    evt = evt.parent;
  }
  return evt;
}

function sqlNormalized(query: SqlQuery): string {
  return obfuscate(query.sql, query.database_type);
}

class Options {
  constructor(public warningLimit = 2, public errorLimit = 10, public whitelist: string[] = []) {}
}

function scanner(options: Options = new Options()): Assertion {
  const uniqueSQL = new Set<string>();
  const matchedSQL = new Set<string>();

  const findDuplicates = (event: Event, appMap: AppMap): number => {
    const sql = sqlNormalized(event.sql!);
    const rootEvent = findRootEvent(event);

    const sqlKey = [appMap.name, rootEvent.id, sql].join('\n');

    // Short circuit if we've already flagged this SQL.
    if (matchedSQL.has(sqlKey)) {
      return 0;
    }
    matchedSQL.add(sqlKey);

    let matches = 0;
    const iter = new EventNavigator(rootEvent).descendants();
    let curr = iter.next();

    function isMatch(descendant: Event): boolean {
      if (descendant.id <= event.id) {
        return false;
      }
      if (!descendant.sql) {
        return false;
      }
      return sqlNormalized(descendant.sql!) === sql;
    }

    while (!curr.done) {
      if (isMatch(curr.value.event)) {
        matches += 1;
      }
      curr = iter.next();
    }
    return matches;
  };

  // TODO: Ensure that the duplicate queries happen within a single command context.
  return Assertion.assert(
    'n-plus-one-query',
    'Duplicate SQL queries',
    'sql_query',
    (event: Event, appMap: AppMap) => {
      const duplicateCount = findDuplicates(event, appMap);
      let level: Level | undefined;
      if (duplicateCount >= options.errorLimit) {
        level = 'warning';
      } else if (duplicateCount >= options.warningLimit) {
        level = 'error';
      }
      if (level) {
        return [
          {
            level: level,
            message: `${duplicateCount} occurrances of SQL "${event.sqlQuery}"`,
          },
        ];
      }
    },
    (assertion: Assertion): void => {
      assertion.where = (e: Event, appMap: AppMap) => {
        if (getSqlLabelFromString(e.sqlQuery!) !== 'SQL Select') {
          return false;
        }

        const rootEvent: Event = findRootEvent(e);
        const sql = sqlNormalized(e.sql!);
        if (options.whitelist.includes(sql)) {
          return false;
        }

        const sqlKey = [appMap.name, rootEvent.id, sql].join('\n');
        if (uniqueSQL.has(sqlKey)) {
          return false;
        }

        uniqueSQL.add(sqlKey);
        return true;
      };
      assertion.description = `SQL query should not be repeated within the same command`;
    }
  );
}

export default { Options, scanner };
