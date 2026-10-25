import { describe,it,expect } from 'vitest';
import {validateVideo,reelPortraitWarning,REEL_MAX_BYTES} from '../src/lib/marketing/video-validation';
import {containerBody} from '../src/lib/marketing/instagram-publish';
const v={duration:10,fps:30,width:1080,height:1920,codec:'avc1',bitrate:1000000,audio:[{codec:'mp4a',sampleRate:48000,channels:2}]};
describe('finished reel rules',()=>{
 it('accepts H264 and HEVC',()=>{for(const codec of ['avc1','avc3','hvc1','hev1'])expect(()=>validateVideo({...v,codec},1000,'reel')).not.toThrow();expect(()=>validateVideo({...v,codec:'vp09'},1000,'reel')).toThrow();});
 it('accepts at most one GiB',()=>{expect(REEL_MAX_BYTES).toBe(1073741824);expect(()=>validateVideo(v,REEL_MAX_BYTES,'reel')).not.toThrow();expect(()=>validateVideo(v,REEL_MAX_BYTES+1,'reel')).toThrow();});
 it('bounds duration to 3–900 seconds',()=>{for(const duration of [3,900])expect(()=>validateVideo({...v,duration},1000,'reel')).not.toThrow();for(const duration of [2.99,900.01])expect(()=>validateVideo({...v,duration},1000,'reel')).toThrow();});
 it('bounds fps to 23–60',()=>{for(const fps of [23,60])expect(()=>validateVideo({...v,fps},1000,'reel')).not.toThrow();for(const fps of [22.99,60.01,NaN])expect(()=>validateVideo({...v,fps},1000,'reel')).toThrow();});
 it('bounds width to 1920',()=>{expect(()=>validateVideo({...v,width:1920,height:3413},1000,'reel')).not.toThrow();expect(()=>validateVideo({...v,width:1921,height:3415},1000,'reel')).toThrow();});
 it('rejects landscape and square',()=>{for(const height of [600,1080])expect(()=>validateVideo({...v,height},1000,'reel')).toThrow();});
 it('warns without blocking non9:16 portrait',()=>{expect(reelPortraitWarning(v)).toBe(false);expect(reelPortraitWarning({...v,height:1440})).toBe(true);expect(()=>validateVideo({...v,height:1440},1000,'reel')).not.toThrow();});
 it('requires AAC ≤48kHz mono/stereo',()=>{for(const audio of [[{codec:'opus',sampleRate:48000,channels:2}],[{codec:'mp4a',sampleRate:48001,channels:2}],[{codec:'mp4a',sampleRate:48000,channels:3}]])expect(()=>validateVideo({...v,audio},1000,'reel')).toThrow();});
 it('sends the selected JPEG cover and feed choice',()=>{expect(containerBody('reel',{url:'https://test.invalid/video',video:true},'caption',false,{coverUrl:'https://test.invalid/cover',shareToFeed:false})).toEqual({media_type:'REELS',video_url:'https://test.invalid/video',caption:'caption',cover_url:'https://test.invalid/cover',share_to_feed:'false'});});
});