import { describe, it, expect } from 'vitest';
import { letterParagraphHtml } from '../src/lib/psa-proposal/document-rhythm';
import { parseDocument } from 'htmlparser2';
import { getElementsByTagName, textContent } from 'domutils';

const paragraphs=(source:string,plain=false)=>getElementsByTagName('p',parseDocument(letterParagraphHtml(source,plain)).children,true).map(textContent);
describe('letter source paragraphs',()=>{
  it('splits each plain source line and strips empty lines',()=>expect(paragraphs('Primeiro\n\nSegundo\nTerceiro',true)).toEqual(['Primeiro','Segundo','Terceiro']));
  it('splits hard breaks without losing bold/link text',()=>expect(paragraphs('<p><strong>Um<br>Dois</strong><br><a href="https://example.org">Três</a></p>')).toEqual(['Um','Dois','Três']));
  it('splits bare inline HTML and preserves escaped text',()=>expect(paragraphs('A &amp; B<br>C &lt; D')).toEqual(['A & B','C < D']));
});