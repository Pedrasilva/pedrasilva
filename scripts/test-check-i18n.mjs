import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, scanProject, tally, moduleFor } from './check-i18n.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('detects own JSX text, expressions, conditional and interpolated text', () => {
  const findings = scanSource('const view=<><h1>Hello</h1><p>{"Olá"}</p><p>{ok ? "Yes" : "No"}</p><p>{`Hello ${name}`}</p></>;');
  assert.equal(findings.length, 5);
  assert.equal(findings[1].text, 'Olá');
});
test('detects all requested literal accessibility and label props', () => {
  const f=scanSource('const view=<Input placeholder="Search" title={"Title"} aria-label="Find" alt="Photo" label={ok?"One":"Two"}/>;');
  assert.equal(f.length, 6);
});
test('skips comparison predicates but catches emitted logical and concatenated text', () => {
  const source='const v=<>{status === "failed" && <p>Retry</p>}{status !== "draft"}{flag && "Visible"}{name || "Fallback"}{"Hello " + name}</>;';
  assert.deepEqual(scanSource(source).map(f=>f.text), ['Retry','Visible','Fallback','Hello']);
});
test('technical exclusions match exact path, kind and complete literal only', () => {
  const rules={scopedLiterals:[{path:'bank.tsx',kind:'jsxText',text:'IBAN'}]};
  assert.deepEqual(scanSource('const v=<><p>IBAN</p><p>Enter IBAN</p><Input title="IBAN"/></>;','bank.tsx',rules).map(f=>f.text), ['Enter IBAN','IBAN']);
  assert.equal(scanSource('const v=<p>IBAN</p>;','other.tsx',rules).length,1);
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
test('preserves document-language prose exceptions but still checks editor props', () => {
  const f=scanSource('const view=<><p>{lang === "en" ? "Terms" : "Condições"}</p><Input placeholder={lang === "en" ? "Write" : "Escreva"}/></>;', 'document.tsx', {documentLanguageBranches:[{path:'document.tsx',variable:'lang'}]});
  assert.equal(f.length,2);assert.equal(f[0].kind,'prop:placeholder');
});
test('does not count CSS or templates containing only variable values', () => {
  assert.equal(scanSource('const v=<><style>{`body { color: red; }`}</style><p>{`${name}`}</p></>;').length,0);
});
test('document scope exceptions are exact by file and function; editor siblings remain scanned', () => {
  const source='function PrintedTerms(){return <p>Contract terms</p>} function Editor(){return <button>Save</button>}';
  const rules={documentScopes:[{path:'mixed.tsx',name:'PrintedTerms'}]};
  assert.deepEqual(scanSource(source,'mixed.tsx',rules).map(f=>f.text),['Save']);
  assert.equal(scanSource(source,'other.tsx',rules).length,2);
});
test('document-language autonyms exclude only named SelectItem values in the exact file', () => {
  const source='const v=<><SelectItem value="pt-PT">Português (Portugal)</SelectItem><Label>Document language</Label><SelectItem value="draft">Draft</SelectItem></>';
  const rules={documentLanguageOptions:[{path:'style.tsx',values:['pt-PT','en']}]};
  assert.deepEqual(scanSource(source,'style.tsx',rules).map(f=>f.text),['Document language','Draft']);
  assert.equal(scanSource(source,'other.tsx',rules).length,3);
});
test('project scan excludes only integrations, locales and explicit document files', () => {
  const root=mkdtempSync(join(tmpdir(),'i18n-check-'));
  try {
    for(const dir of ['scripts','src/integrations','src/i18n','src/components'])mkdirSync(join(root,dir),{recursive:true});
    writeFileSync(join(root,'scripts/i18n-allowlist.json'),JSON.stringify({files:[{path:'src/components/document.tsx'}],literals:[]}));
    for(const file of ['src/integrations/client.tsx','src/i18n/locale.tsx','src/components/document.tsx','src/components/editor.tsx'])writeFileSync(join(root,file),'const v=<p>Hello</p>;');
    const result=scanProject(root);assert.equal(result.length,1);assert.equal(result[0].file,'src/components/editor.tsx');
  } finally {rmSync(root,{recursive:true,force:true});}
});