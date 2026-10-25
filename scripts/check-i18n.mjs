#!/usr/bin/env node
import ts from 'typescript';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const props = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);
const normalize = s => s.replace(/\s+/g, ' ').trim();

export function scanSource(source, file = 'fixture.tsx', allowlist = { literals: [] }) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];
  const allowed = new Set(allowlist.literals ?? []);
  function add(node, kind, raw) {
    const text = normalize(raw);
    if (!/\p{L}/u.test(text) || allowed.has(text)) return;
    const { line, character } = tree.getLineAndCharacterOfPosition(node.getStart(tree));
    findings.push({ file, line: line + 1, column: character + 1, kind, text });
  }
  function literals(node, kind) {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) add(node, kind, node.text);
    else if (ts.isTemplateExpression(node)) {
      if (!/\p{L}/u.test([node.head.text, ...node.templateSpans.map(s => s.literal.text)].join(''))) return;
      const text = [node.head.text, ...node.templateSpans.map(s => s.literal.text)].join(' {{value}} ');
      add(node, kind, text);
    } else if (ts.isConditionalExpression(node)) {
      literals(node.whenTrue, kind); literals(node.whenFalse, kind);
    } else if (ts.isBinaryExpression(node)) {
      literals(node.left, kind); literals(node.right, kind);
    } else if (ts.isParenthesizedExpression(node)) literals(node.expression, kind);
    // Calls, identifiers and property access are dynamic; t() keys are not UI literals.
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name && (allowlist.documentScopes ?? []).some(rule => rule.path === file && rule.name === node.name.text)) return;
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'SelectItem') {
      const value = node.openingElement.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(tree) === 'value');
      if (value?.initializer && ts.isStringLiteral(value.initializer) && (allowlist.documentLanguageOptions ?? []).some(rule => rule.path === file && rule.values.includes(value.initializer.text))) return;
    }
    if (ts.isJsxElement(node) && ['style', 'script'].includes(node.openingElement.tagName.getText(tree))) return;
    if (ts.isJsxText(node)) add(node, 'jsxText', node.text);
    if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
      const expression = node.expression;
      const documentBranch = expression && ts.isConditionalExpression(expression) && (allowlist.documentLanguageBranches ?? []).some(rule => rule.path === file && new RegExp(`\\b${rule.variable}\\b`).test(expression.condition.getText(tree)));
      if (!documentBranch) literals(expression, 'jsxExpression');
    }
    if (ts.isJsxAttribute(node) && props.has(node.name.getText(tree))) {
      const value = node.initializer;
      literals(value && ts.isJsxExpression(value) ? value.expression : value, `prop:${node.name.getText(tree)}`);
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isToast = ts.isIdentifier(callee) && callee.text === 'toast' ||
        ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'toast';
      const isConfirmation = ts.isIdentifier(callee) && ['confirm', 'alert'].includes(callee.text) ||
        ts.isPropertyAccessExpression(callee) && callee.expression.getText(tree) === 'window' && ['confirm', 'alert'].includes(callee.name.text);
      if (isToast || isConfirmation) {
        literals(node.arguments[0], isToast ? 'toast' : 'confirmation');
        for (const arg of node.arguments) if (ts.isObjectLiteralExpression(arg)) {
          for (const p of arg.properties) if (ts.isPropertyAssignment(p) && ['title', 'description', 'message'].includes(p.name.getText(tree).replace(/["']/g, ''))) literals(p.initializer, 'toast');
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return findings;
}

export function moduleFor(file) {
  if (file === 'src/routes/__root.tsx') return 'shell/shared';
  if (file === 'src/routes/_app.tsx') return 'shell/shared';
  if (file.includes('/routes/[')) return 'other';
  const route = file.match(/^src\/routes\/(?:_app\.)?([^./]+)/);
  if (route) return route[1] === 'index' ? 'home' : route[1];
  const component = file.match(/^src\/(?:components|lib)\/([^/]+)\//);
  if (component) return component[1];
  return file.startsWith('src/components/') ? 'shell/shared' : 'other';
}

export function scanProject(root = ROOT) {
  const allowlist = JSON.parse(readFileSync(resolve(root, 'scripts/i18n-allowlist.json'), 'utf8'));
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name);
      const file = relative(root, path).replaceAll('\\', '/');
      if (file === 'src/integrations' || file === 'src/i18n') continue;
      if (entry.isDirectory()) walk(path);
      else if (file.endsWith('.tsx') && !(allowlist.files ?? []).some(e => (typeof e === 'string' ? e : e.path) === file) && !(allowlist.prefixes ?? []).some(e => file.startsWith(typeof e === 'string' ? e : e.path))) files.push(file);
    }
  }
  walk(resolve(root, 'src'));
  return files.sort().flatMap(file => scanSource(readFileSync(resolve(root, file), 'utf8'), file, allowlist));
}

export function tally(findings) {
  const counts = {};
  for (const f of findings) {
    const key = JSON.stringify([f.file, f.kind, f.text]);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const findings = scanProject();
  const byFile = {}, byModule = {};
  for (const f of findings) {
    byFile[f.file] = (byFile[f.file] ?? 0) + 1;
    const module = moduleFor(f.file); byModule[module] = (byModule[module] ?? 0) + 1;
  }
  const counts = tally(findings);
  const baselinePath = resolve(ROOT, 'scripts/i18n-baseline.json');
  if (process.argv.includes('--write-baseline')) writeFileSync(baselinePath, JSON.stringify({ counts }, null, 2) + '\n');
  if (process.argv.includes('--json')) console.log(JSON.stringify({ total: findings.length, byModule, byFile, findings }, null, 2));
  else {
    console.log('Hardcoded UI candidates per file:');
    for (const [file, count] of Object.entries(byFile)) console.log(`${count}\t${file}`);
    console.log('\nModule totals:');
    for (const [module, count] of Object.entries(byModule).sort((a,b) => b[1]-a[1])) console.log(`${count}\t${module}`);
    console.log(`Total: ${findings.length} candidates in ${Object.keys(byFile).length} files.`);
  }
  if (process.argv.includes('--strict')) process.exitCode = findings.length ? 1 : 0;
  else if (!process.argv.includes('--write-baseline')) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).counts;
    const added = Object.entries(counts).filter(([key, count]) => count > (baseline[key] ?? 0));
    if (added.length) {
      console.error(`${added.length} new/increased literal signatures; translate them rather than refreshing the baseline.`);
      for (const [key] of added) console.error(key);
      process.exitCode = 1;
    }
  }
}