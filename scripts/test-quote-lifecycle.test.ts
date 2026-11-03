import {describe,it,expect} from 'vitest';
import {canConvertQuote,nextQuoteAction,needsRevisionSend,constructionMonthRange} from '../src/lib/quotes/quote-lifecycle';
describe('quote next action',()=>{
 it('draft sends',()=>expect(nextQuoteAction('draft')).toBe('send'));
 it('sent registers acceptance',()=>expect(nextQuoteAction('sent')).toBe('accept'));
 it('approved converts as primary',()=>expect(nextQuoteAction('approved')).toBe('convert'));
 it('signed converts',()=>expect(nextQuoteAction('signed')).toBe('convert'));
 it('project opens',()=>expect(nextQuoteAction('converted')).toBe('open'));
 it('approved may convert without signature',()=>expect(canConvertQuote('approved')).toBe(true));
 it('signed may convert',()=>expect(canConvertQuote('signed')).toBe(true));
 it('sent may not convert',()=>expect(canConvertQuote('sent')).toBe(false));
 it('draft may not convert before acceptance',()=>expect(canConvertQuote('draft')).toBe(false));
 it('lost may not convert',()=>expect(canConvertQuote('lost')).toBe(false));
 it('sent Rev 00 with changed current content needs sending',()=>expect(needsRevisionSend({state:'sent',latestSentSnapshotId:'rev00',latestSentMatchesCurrent:false})).toBe(true));
 it('matching sent revision does not need sending',()=>expect(needsRevisionSend({state:'sent',latestSentSnapshotId:'rev01',latestSentMatchesCurrent:true})).toBe(false));
 it('four months of assistance remain relative months 1–4',()=>expect(constructionMonthRange(4)).toEqual({start:1,end:4}));
});
