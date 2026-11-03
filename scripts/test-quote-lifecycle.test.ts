import {describe,it,expect} from 'vitest';
import {canConvertQuote,nextQuoteAction} from '../src/lib/quotes/quote-lifecycle';
describe('quote next action',()=>{
 it('draft sends',()=>expect(nextQuoteAction('draft')).toBe('send'));
 it('sent registers acceptance',()=>expect(nextQuoteAction('sent')).toBe('accept'));
 it('approved signs',()=>expect(nextQuoteAction('approved')).toBe('signature'));
 it('signed converts',()=>expect(nextQuoteAction('signed')).toBe('convert'));
 it('project opens',()=>expect(nextQuoteAction('converted')).toBe('open'));
 it('approved may convert without signature',()=>expect(canConvertQuote('approved')).toBe(true));
 it('signed may convert',()=>expect(canConvertQuote('signed')).toBe(true));
 it('sent may not convert',()=>expect(canConvertQuote('sent')).toBe(false));
 it('lost may not convert',()=>expect(canConvertQuote('lost')).toBe(false));
});
