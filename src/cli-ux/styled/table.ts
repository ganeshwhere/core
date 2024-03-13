import chalk from 'chalk';
import { safeDump } from 'js-yaml';
import { orderBy } from 'natural-orderby';
import sliceAnsi from 'slice-ansi';
import sw from 'string-width';
import { stdtermwidth } from '../../screen';
import { capitalize, sumBy } from '../../util/util';
import write from '../write';

class Table {
  constructor(data = [], columns = {}, options = {}) {
    this.data = data;
    this.columns = Object.entries(columns).map(([key, col]) => ({
      extended: col.extended || false,
      get: col.get || ((row) => row[key] || ''),
      header: typeof col.header === 'string' ? col.header : capitalize(key.replaceAll('_', ' ')),
      minWidth: Math.max(col.minWidth || 0, sw(col.header) + 1),
    }));
    this.options = {
      columns: options.columns,
      extended: options.extended,
      filter: options.filter,
      'no-header': options['no-header'] || false,
      'no-truncate': options['no-truncate'] || false,
      output: options.csv ? 'csv' : options.output,
      printLine: options.printLine || ((s) => write.stdout(s + '\n')),
      rowStart: ' ',
      sort: options.sort,
      title: options.title,
    };
  }

  display() {
    let rows = this.data.map((d) => {
      const row = {};
      for (const col of this.columns) {
        let val = col.get(d);
        if (typeof val !== 'string') val = inspect(val, { breakLength: Number.POSITIVE_INFINITY });
        row[col.key] = val;
      }
      return row;
    });

    if (this.options.filter) {
      const [header, regex] = this.options.filter.split('=');
      const isNot = header[0] === '-';
      const col = this.columns.find((c) => c.header.toLowerCase() === header.toLowerCase());
      if (!col || !regex) throw new Error('Filter flag has an invalid value');
      rows = rows.filter((d) => {
        const re = new RegExp(regex);
        const val = d[col.key];
        const match = val.match(re);
        return isNot ? !match : match;
      });
    }

    if (this.options.sort) {
      const sorters = this.options.sort.split(',');
      const sortHeaders = sorters.map((k) => (k[0] === '-' ? k.slice(1) : k));
      const sortKeys = this.columns
        .filter((col) => sortHeaders.includes(col.header))
        .map((col) => (v) => v[col.key]);
      const sortKeysOrder = sorters.map((k) => (k[0] === '-' ? 'desc' : 'asc'));
      rows = orderBy(rows, sortKeys, sortKeysOrder);
    }

    if (this.options.columns) {
      const filters = this.options.columns.split(',');
      this.columns = this.columns.filter((c) => filters.includes(c.header));
    } else if (!this.options.extended) {
      this.columns = this.columns.filter((c) => !c.extended);
    }

    switch (this.options.output) {
      case 'csv':
        this.outputCSV();
        break;
      case 'json':
        this.outputJSON();
        break;
      case 'yaml':
        this.outputYAML();
        break;
      default:
        this.outputTable();
    }
  }

  outputCSV() {
    if (!this.options['no-header']) {
      this.options.printLine(this.columns.map((c) => c.header).join(','));
    }
    for (const d of this.data) {
      const row = this.getCSVRow(d);
      this.options.printLine(row.join(','));
    }
  }

  outputJSON() {
    this.options.printLine(JSON.stringify(this.resolveColumnsToObjectArray(), undefined, 2));
  }

  outputTable() {
    // Implementation for outputTable method
  }

  outputYAML() {
    this.options.printLine(safeDump(this.resolveColumnsToObjectArray()));
  }

  resolveColumnsToObjectArray() {
    return this.data.map((d) => Object.fromEntries(this.columns.map((col) => [col.key, d[col.key] || ''])));
  }

  getCSVRow(d) {
    const values = this.columns.map((col) => d[col.key] || '');
    const lineToBeEscaped = values.find(
      (e) => e.includes('"') || e.includes('\n') || e.includes('\r\n') || e.includes('\r') || e.includes(',')
    );
    return values.map((e) => (lineToBeEscaped ? `"${e.replaceAll('"', '""')}"` : e));
  }
}

export function table(data, columns, options) {
  new Table(data, columns, options).display();
}

export namespace table {
  export const Flags = {
    columns: F.string({ description: 'only show provided columns (comma-separated)', exclusive: ['extended'] }),
    csv: F.boolean({ description: 'output is csv format [alias: --output=csv]', exclusive: ['no-truncate'] }),
    extended: F.boolean({ char: 'x', description: 'show extra columns', exclusive: ['columns'] }),
    filter: F.string({ description: 'filter property by partial string matching, ex: name=foo' }),
    'no-header': F.boolean({ description: 'hide table header from output', exclusive: ['csv'] }),
    'no-truncate': F.boolean({ description: 'do not truncate output to fit screen', exclusive: ['csv'] }),
    output: F.string({
      description: 'output in a more machine friendly format',
      exclusive: ['no-truncate', 'csv'],
      options: ['csv', 'json', 'yaml'],
    }),
    sort: F.string({ description: "property to sort by (prepend '-' for descending)" }),
  };

  // Implementation for flags function

  export interface Column {
    extended: boolean;
    get(row: Record<string, unknown>): any;
    header: string;
    minWidth: number;
  }

  export type Columns<T extends Record<string, unknown>> = { [key: string]: Partial<Column> };

  export interface Options {
    [key: string]: any;
    columns?: string;
    extended?: boolean;
    filter?: string;
    'no-header'?: boolean;
    'no-truncate'?: boolean;
    output?: string;
    printLine?(s: any): any;
    sort?: string;
    title?: string;
  }
}

const getWidestColumnWith = (data, columnKey) =>
  data.reduce((previous, current) => {
    const d = current[columnKey];
    const manyLines = (d as string).split('\n');
    return Math.max(previous, manyLines.length > 1 ? Math.max(...manyLines.map((r: string) => sw(r))) : sw(d));
  }, 0);
