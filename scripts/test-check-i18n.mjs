import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, tally, moduleFor } from './check-i18n.mjs';

test('detects own JSX text, expressions, conditional and interpolated text', () => {
  const findings = scanSource('const view=<><h1>Hello</h1><p>{"Olá"}</p><p>{ok ? "Yes" : "No"}</p><p>{`Hello ${name}`}</p></>;');
  assert.equal(findings.length, 5);
  assert.equal(findings[1].text, 'Olá');
});
test('detects all requested literal accessibility and label props', () => {
  const f=scanSource('const view=<Input placeholder="Search" title={"Title"} aria-label="Find" alt="Photo" label={ok?"One":"Two"}/>;');
  assert.equal(f.length, 6);
});
test('detects literal toasts and confirmations including options', () => {
  assert.equal(scanSource('toast.success("Saved"); toast({title:"Error",description:"Try again"}); window.confirm("Delete?");').length, 4);
});
test('ignores translations, dynamic data, comments, numbers and exact brands', () => {
  assert.equal(scanSource('const view=<><p>{t("hello")}</p><p>{name}</p><p>123 —</p>{/* ignored */}<p>Instagram</p></>; toast.error(t("error"));', 'fixture.tsx', {literals:['Instagram']}).length, 0);
  assert.equal(scanSource('const view=<p>Publish to Instagram</p>;', 'fixture.tsx', {literals:['Instagram']}).length, 1);
});
test('ratchet detects repeated literals independently of line movement', () => {
  const before=tally(scanSource('const v=<p>Hello</p>;'));
  const after=tally(scanSource('\nconst v=<><p>Hello</p><p>Hello</p></>;'));
  const key=Object.keys(before)[0];assert.equal(before[key],1);assert.equal(after[key],2);
});
test('maps project routes and editor modules consistently', () => {
  assert.equal(moduleFor('src/routes/_app.projects.index.tsx'),'projects');
  assert.equal(moduleFor('src/components/psa-composer/editor.tsx'),'psa-composer');
});