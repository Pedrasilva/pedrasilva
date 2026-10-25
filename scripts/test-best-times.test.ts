import { describe, it, expect } from 'vitest';
import { bestTimes, bestSlots, hourlySlot, MIN_POSTS, parseOnlineFollowers } from '../src/lib/marketing/best-times';
import type { PostRow } from '../src/lib/marketing/instagram-insights';
const now = new Date('2026-10-25T00:36:00Z');
const post = (id:string, extra:Partial<PostRow>={}):PostRow => ({media_id:`FIXTURE-${id}`,captured_on:'2026-10-24',media_type:'IMAGE',media_product_type:'FEED',caption:'DISPOSABLE FIXTURE',posted_at:'2026-10-20T18:00:00Z',draft_id:null,metrics:{reach:1240,likes:62},...extra});
describe('posting-time rules',()=>{
  it('Lisbon summer Tuesday 18 UTC is Tuesday 19',()=>expect(hourlySlot('2026-10-20T18:00:00Z')).toEqual({weekday:1,hour:19}));
  it('Lisbon winter Tuesday 19 UTC stays 19',()=>expect(hourlySlot('2026-11-03T19:00:00Z')).toEqual({weekday:1,hour:19}));
  it('summer midnight moves into next weekday',()=>expect(hourlySlot('2026-10-19T23:00:00Z')).toEqual({weekday:1,hour:0}));
  it('minimum is five, below it has no colours without followers',()=>{expect(MIN_POSTS).toBe(5); expect(bestTimes([post('1')],[],'feed',now).cells.every(c=>c.score===null)).toBe(true);});
  it('latest snapshot once per post and only last 90 days',()=>{ const map=bestTimes([post('1'),post('1',{captured_on:'2026-10-23',metrics:{reach:10}}),post('old',{posted_at:'2026-02-26T11:00:00Z'})],[],'feed',now); expect(map.postCount).toBe(1); expect(map.cells.find(c=>c.weekday===1&&c.hour===19)?.avgReach).toBe(1240); });
  it('feed excludes reels and stories; stories are separate',()=>{const rows=[post('feed'),post('story',{media_product_type:'STORY'}),post('reel',{media_product_type:'REELS',media_type:'VIDEO'})]; expect(bestTimes(rows,[],'feed',now).postCount).toBe(1);expect(bestTimes(rows,[],'story',now).postCount).toBe(1);});
  it('follower-only curve supplies best hour and top three without post evidence',()=>{const map=bestTimes([], [{captured_on:'2026-10-24',captured_at:'2026-10-24T20:00:00Z',status:'available',slots:[{weekday:1,hour:19,value:100},{weekday:1,hour:10,value:25},{weekday:2,hour:18,value:75},{weekday:3,hour:20,value:60}]}],'feed',now);expect(bestSlots(map,1,1)[0].hour).toBe(19); expect(bestSlots(map).map(c=>c.score)).toEqual([100,75,60]);});
  it('small post samples shrink towards neutral and scores stay 0–100',()=>{const map=bestTimes(Array.from({length:5},(_,i)=>post(String(i))),[],'feed',now); const cell=map.cells.find(c=>c.weekday===1&&c.hour===19);expect(cell?.score).toBe(50);expect(map.cells.every(c=>c.score!=null&&c.score>=0&&c.score<=100)).toBe(true);});
  it('missing and unsupported activity is not zero',()=>{expect(parseOnlineFollowers({data:[]})).toEqual([]);expect(bestTimes([], [{captured_on:'2026-10-24',captured_at:now.toISOString(),status:'unsupported',slots:[]}],'feed',now).cells.every(c=>c.score===null)).toBe(true);});
  it('parses UTC online hours to Lisbon and rejects malformed buckets',()=>expect(parseOnlineFollowers({data:[{name:'online_followers',values:[{end_time:'2026-10-21T00:00:00Z',value:{'18':100,'25':10,bad:20}}]}]})).toEqual([{weekday:1,hour:19,value:100}]));
  it('stale follower data is not recommended',()=>expect(bestTimes([], [{captured_on:'2026-10-01',captured_at:'2026-10-01T00:00:00Z',status:'available',slots:[{weekday:1,hour:19,value:100}]}],'feed',now).hasFollowers).toBe(false));
});