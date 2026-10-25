/** Bounded ISO-BMFF metadata reader: no decoding, subprocesses or native dependency. */
export type VideoMetadata={duration:number;fps:number;width:number;height:number;codec:string;bitrate:number;audio:{codec:string;sampleRate:number;channels:number}[]};
type Box={type:string;start:number;end:number};
export function mp4Metadata(bytes:Uint8Array,size:number):VideoMetadata|null{
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const word=(p:number)=>v.getUint32(p);const str=(p:number)=>String.fromCharCode(...bytes.slice(p,p+4));
 function boxes(start:number,end:number):Box[]{const out:Box[]=[];while(start+8<=end){let n=word(start);let h=8;if(n===1){if(start+16>end)break;n=Number(v.getBigUint64(start+8));h=16;}if(n===0)n=end-start;if(n<h||start+n>end)break;out.push({type:str(start+4),start:start+h,end:start+n});start+=n;}return out;}
 const moov=boxes(0,bytes.length).find(b=>b.type==='moov');if(!moov)return null;
 const tracks=boxes(moov.start,moov.end).filter(b=>b.type==='trak');let result:VideoMetadata|null=null;const audio:VideoMetadata['audio']=[];
 for(const track of tracks){const mdia=boxes(track.start,track.end).find(b=>b.type==='mdia');if(!mdia)continue;const parts=boxes(mdia.start,mdia.end);const mdhd=parts.find(b=>b.type==='mdhd');const hdlr=parts.find(b=>b.type==='hdlr');const minf=parts.find(b=>b.type==='minf');if(!mdhd||!hdlr||!minf)continue;
  const type=str(hdlr.start+8);const version=bytes[mdhd.start];const timescale=word(mdhd.start+(version===1?20:12));const ticks=version===1?Number(v.getBigUint64(mdhd.start+24)):word(mdhd.start+16);const duration=ticks/timescale;
  const stbl=boxes(minf.start,minf.end).find(b=>b.type==='stbl');if(!stbl)continue;const tables=boxes(stbl.start,stbl.end);const stsd=tables.find(b=>b.type==='stsd');if(!stsd)continue;const entry=boxes(stsd.start+8,stsd.end)[0];if(!entry)continue;
  if(type==='vide'){if(result)throw new Error('Only one video track is supported');const stsz=tables.find(b=>b.type==='stsz');if(!stsz)throw new Error('Video sample table unavailable');const count=word(stsz.start+8);let width=v.getUint16(entry.start+24),height=v.getUint16(entry.start+26);const tkhd=boxes(track.start,track.end).find(b=>b.type==='tkhd');if(tkhd){const matrix=tkhd.start+(bytes[tkhd.start]===1?52:40);if(matrix+20<=tkhd.end&&v.getInt32(matrix)===0&&Math.abs(v.getInt32(matrix+4))===65536&&Math.abs(v.getInt32(matrix+12))===65536){[width,height]=[height,width];}}result={duration,fps:count/duration,width,height,codec:entry.type,bitrate:size*8/duration,audio};}
  if(type==='soun')audio.push({codec:entry.type,channels:v.getUint16(entry.start+16),sampleRate:word(entry.start+24)/65536});
 }
 if(!result)throw new Error('Video track missing');return result;
}
