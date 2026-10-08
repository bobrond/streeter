// Journal de bord du vault (second cerveau, privé : dossier local ignoré par git) : `npm run journal [AAAA-MM-JJ]`.
// - crée vault/journal/AAAA-MM-JJ.md depuis le modèle s'il n'existe pas ;
// - régénère la liste des commits du jour (heure locale) ;
// - régénère la navigation (Index · jour précédent · jour suivant) de tous les journaux ;
// - ajoute à l'index une ligne pour chaque journal qui n'en a pas (résumé à écrire).
// Les sections rédigées (En bref, Actions, Décisions…) ne sont jamais touchées.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = join(ROOT, 'vault');
const JOURNAL = join(VAULT, 'journal');
const TEMPLATE = join(VAULT, 'templates', 'journal.md');
const INDEX = join(VAULT, 'index.md');
const NAV_PREFIX = '[Index](../index.md)';

const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const atNoon = (iso) => new Date(`${iso}T12:00:00`);
const nextDay = (iso) => {
  const d = atNoon(iso);
  d.setDate(d.getDate() + 1);
  return localDate(d);
};
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const longDate = (iso) => capitalize(new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(atNoon(iso)));
const shortDate = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(atNoon(iso));

function replaceBetween(text, start, end, lines) {
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i < 0 || j < i) throw new Error(`Repères « ${start} » et « ${end} » introuvables.`);
  const body = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  return `${text.slice(0, i + start.length)}\n${body}${text.slice(j)}`;
}

function commitsOf(day) {
  const out = execFileSync(
    'git',
    ['log', '--reverse', `--since=${day} 00:00`, `--until=${nextDay(day)} 00:00`, '--date=format:%H:%M', '--format=%ad|%h|%s'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [time, hash, ...subject] = line.split('|');
      return `- ${time} \`${hash}\` ${subject.join('|')}`;
    });
}

if (!existsSync(INDEX) || !existsSync(TEMPLATE)) {
  console.error('Vault introuvable : vault/ est un dossier privé, gardé sur ce PC et ignoré par git (voir CLAUDE.md).');
  process.exit(1);
}

const date = process.argv[2] ?? localDate(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error('Date attendue au format AAAA-MM-JJ.');
  process.exit(1);
}

// 1. Journal du jour.
mkdirSync(JOURNAL, { recursive: true });
const file = join(JOURNAL, `${date}.md`);
const created = !existsSync(file);
if (created) {
  const template = readFileSync(TEMPLATE, 'utf8');
  writeFileSync(file, template.replaceAll('{{date}}', date).replaceAll('{{titre}}', `Journal de bord · ${longDate(date)}`));
}

// 2. Commits du jour.
const commits = commitsOf(date);
writeFileSync(file, replaceBetween(readFileSync(file, 'utf8'), '<!-- commits:début -->', '<!-- commits:fin -->', commits));

// 3. Navigation entre les journaux.
const days = readdirSync(JOURNAL)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .map((f) => f.slice(0, 10))
  .sort();
days.forEach((day, i) => {
  const path = join(JOURNAL, `${day}.md`);
  const parts = [NAV_PREFIX];
  if (i > 0) parts.push(`← [${shortDate(days[i - 1])}](${days[i - 1]}.md)`);
  if (i < days.length - 1) parts.push(`[${shortDate(days[i + 1])}](${days[i + 1]}.md) →`);
  const lines = readFileSync(path, 'utf8').split('\n');
  const nav = lines.findIndex((l) => l.startsWith(NAV_PREFIX));
  if (nav >= 0) {
    lines[nav] = parts.join(' · ');
    writeFileSync(path, lines.join('\n'));
  }
});

// 4. Une ligne d'index par journal (les plus récents en haut).
const index = readFileSync(INDEX, 'utf8');
const start = '<!-- journaux:début -->';
const end = '<!-- journaux:fin -->';
const current = index.slice(index.indexOf(start) + start.length, index.indexOf(end)).split('\n').filter((l) => l.trim());
const byDay = new Map();
for (const line of current) {
  const m = line.match(/\(journal\/(\d{4}-\d{2}-\d{2})\.md\)/);
  if (m) byDay.set(m[1], line);
}
const added = days.filter((day) => !byDay.has(day));
for (const day of added) byDay.set(day, `- [${longDate(day)}](journal/${day}.md) — _à résumer_`);
const lines = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, line]) => line);
writeFileSync(INDEX, replaceBetween(index, start, end, lines));

console.log(`Journal du ${date} : ${created ? 'créé' : 'mis à jour'}, ${commits.length} commit${commits.length > 1 ? 's' : ''}.`);
if (added.length > 0) console.log(`Index : ${added.length} ligne${added.length > 1 ? 's' : ''} à résumer (${added.join(', ')}).`);
