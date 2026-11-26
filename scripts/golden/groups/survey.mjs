// Customer survey goldens: CSV import results, directory validation and match
// results for fictional, adversarial inputs. Pure Node, no browser.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot, stableJson } from '../lib/util.mjs';

const surveyLib = (file) => import(pathToFileURL(resolve(repoRoot, 'prototype/customer-survey/lib', file)).href);

const utf16 = (text, bigEndian = false) => {
  const le = Buffer.from(text, 'utf16le');
  if (bigEndian) le.swap16();
  return Buffer.concat([Buffer.from(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]), le]);
};

const csvCases = [
  ['utf8-comma-quoted-multiline', Buffer.from('Name,Email\r\n"Example, Alex",alex@example.com\r\n"Jamie\n""Q"" Example",jamie@example.com\r\n')],
  ['utf8-bom-semicolon', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Name;Email;Department\nJosé Example;jose@example.com;Finance\n李明 Example;li@example.com;Support\n')])],
  ['utf16le-bom-tab', utf16('Name\tEmail\nAlex Example\talex@example.com\n')],
  ['utf16be-bom-semicolon', utf16('Name;Email\nSam Example;sam@example.com\n', true)],
  ['windows-1252-requested', Buffer.from([...Buffer.from('Name,Email\nRen'), 0xe9, ...Buffer.from(' Example,rene@example.com\n')]), 'windows-1252'],
  ['windows-1252-bytes-auto', Buffer.from([...Buffer.from('Name,Email\nRen'), 0xe9, ...Buffer.from(' Example,rene@example.com\n')])],
  ['trailing-blank-column', Buffer.from('Name,Email,\nAlex Example,alex@example.com,\n')],
  ['malformed-quote', Buffer.from('Name,Email\n"Alex"bad,alex@example.com\n')],
  ['extra-values', Buffer.from('Name,Email\nAlex,alex@example.com,unexpected\n')],
  ['cr-only-line-endings', Buffer.from('Name,Email\rAlex,alex@example.com\rJamie,jamie@example.com\r')],
];

const directoryRows = [
  ['Alex Example', 'alex@example.com', 'Example Co', 'Support', ''],
  ['Alex Example', 'alex@example.com', 'Example Co', 'Support', ''],
  ['Chris Example', 'chris.one@example.com', 'Example Co', 'Support', ''],
  ['Chris Example', 'chris.two@example.com', 'Example Co', 'Finance', ''],
  ['Tan Wei Ming', 'weiming@example.com', 'Example Co', 'Finance', ''],
  ['Tan Wei Min', 'weimin@example.com', 'Example Co', 'Finance', ''],
  ['Tan Wei Ming Jason', 'jason@example.com', 'Example Co', 'Support', ''],
  ['Jamie Q Example', 'jamie@example.com', 'Example Co', 'Finance', 'Jamie Example; Example, Jamie'],
  ['Sam Example', 'not-an-email', 'Example Co', 'Support', ''],
  ['Pat Example', 'shared@example.com', 'Example Co', 'Support', ''],
  ['Lee Example', 'shared@example.com', 'Example Co', 'Support', ''],
  ['Example, Morgan', 'morgan@example.com', 'Example Co Pte Ltd', 'Information Technology', ''],
  ['Ravi Example', 'ravi@example.com', 'Example Co', 'Support', ''],
  ['Rana Example', 'rana@example.com', 'Example Co', 'Support', ''],
  ['José Example', 'jose@example.com', 'Example Co', 'Finance', ''],
  ['李明 Example', 'li@example.com', 'Example Co', 'Support', ''],
  ['Ahmad Example bin Hassan', 'mah@example.com', 'Example Co', 'Support', ''],
  ['Ahmad Example bin Rahman', 'mar@example.com', 'Example Co', 'Support', ''],
  ["O'Brien Alex", 'obrien@example.com', 'Example Co', 'Support', ''],
  ['Robin Example', 'Robin Example <robin@example.com>', 'Example Co', 'Support', ''],
  ['Blank Email Example', '', 'Example Co', 'Support', ''],
  ['<img src=x onerror=alert(1)>', 'hostile@example.com', 'Example Co', 'Support', ''],
  ['Mei-Ling Example', 'meiling@example.com', 'Example Co', 'Support', ''],
];

const requesterRows = [
  ['INC-1', 'Alex Example', 'Example Co', 'Support'],
  ['inc-1', 'alex example', 'Example Co', ''],
  ['INC-2', 'Chris Example', 'Example Co', ''],
  ['INC-3', 'Tan Wei Ming', 'Example Co', 'Finance'],
  ['INC-4', 'Tan Wei Min', 'Example Co', 'Finance'],
  ['INC-5', 'Wei Ming Tan', 'Example Co', ''],
  ['INC-6', 'Example Jamie', 'Example Co', ''],
  ['INC-7', 'Jamie Example', 'Example Co', ''],
  ['INC-8', 'Sam Example', 'Example Co', ''],
  ['INC-9', 'Pat Example', 'Example Co', ''],
  ['INC-10', 'Morgan Example', 'Example Co', 'IT'],
  ['INC-11', 'R Example', 'Example Co', ''],
  ['INC-12', 'Jose Example', 'Example Co', ''],
  ['INC-13', '李明 Example', 'Example Co', ''],
  ['INC-14', 'Ahmad Example', 'Example Co', ''],
  ['INC-15', 'O‘Brien Alex', 'Example Co', ''],
  ['INC-16', 'Alex​ Example', 'Example Co', ''],
  ['INC-17', 'Robin Example', 'Example Co', ''],
  ['INC-18', '', 'Example Co', ''],
  ['INC-19', '<script>alert(1)</script>', 'Example Co', ''],
  ['INC-20', 'Meiling Example', 'Example Co', ''],
  ['INC-21', 'Dr Alex Example', 'Example Co', ''],
  ['INC-22', 'Unknown Person', 'Example Co', ''],
  ['', 'Alex Example', 'Example Co', 'Support'],
];

// Entries are referenced by id in match results so each record appears once.
const compactResult = (result) => JSON.parse(JSON.stringify(result, (key, value) => (key === 'entry' && value && typeof value === 'object' ? { id: value.id, name: value.name, email: value.email } : value)));

export async function generate() {
  const { decodeCsv, csvRows, tableFromRows } = await surveyLib('import.mjs');
  const { directory, matchBatch, requestsFromRows } = await surveyLib('match.mjs');

  const imports = {};
  for (const [name, bytes, encoding] of csvCases) {
    try {
      const text = decodeCsv(bytes, encoding);
      const rows = csvRows(text);
      let table;
      try { table = tableFromRows(rows); } catch (error) { table = { error: error.message }; }
      imports[name] = { rows, table };
    } catch (error) {
      imports[name] = { error: error.message };
    }
  }

  const dirMap = { name: 'Name', email: 'Email', company: 'Company', department: 'Department', alias: 'Aliases' };
  const dir = directory(directoryRows.map(([Name, Email, Company, Department, Aliases]) => ({ Name, Email, Company, Department, Aliases })), dirMap);
  const ticketMap = { ticket: 'Ticket ID', name: 'Customer Name', company: 'Customer Company', department: 'Department' };
  const ticketRows = requesterRows.map(([id, name, company, department]) => ({ 'Ticket ID': id, 'Customer Name': name, 'Customer Company': company, Department: department }));
  const requests = requestsFromRows(ticketRows, ticketMap, ticketRows.map((_, i) => i + 2));
  const results = matchBatch(requests, dir.entries).map(compactResult);

  return new Map([
    ['survey/import.json', stableJson(imports)],
    ['survey/directory.json', stableJson(dir)],
    ['survey/match.json', stableJson({ requests, results })],
  ]);
}
