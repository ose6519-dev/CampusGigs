import {useEffect,useRef,useState, type PointerEvent, type TouchEvent} from 'react';
import type {User} from 'firebase/auth';
import {chatMediaBlob} from './api';
import {decryptAttachment, type SecurePayload} from './cryptoEnvelope';

export type GalleryItem={
  id:string;upload_id:string|null;kind:'text'|'image'|'video'|'audio'|'file'|'sticker';
  cipher_version:number;filename:string|null;mime_type:string|null;size_bytes:number|null;media_group_id:string|null;
};
type Point={x:number;y:number};
type CropRect={x:number;y:number;w:number;h:number};
type Stroke={color:string;points:Point[];width:number};
const markerColors=[{name:'Black',value:'#20201b'},{name:'Gold',value:'#e6b82e'},
  {name:'Grey',value:'#939393'},{name:'Red',value:'#d74340'}];
const displayName=(item:GalleryItem,meta?:SecurePayload)=>meta?.filename||item.filename||'Shared attachment';

export function ChatMediaGallery({user,bookingId,items,initialId,secretKey,metaFor,onClose,onReply,onActions}:{
  user:User;bookingId:string;items:GalleryItem[];initialId:string;secretKey:CryptoKey|null;
  metaFor:(id:string)=>SecurePayload|undefined;onClose:()=>void;onReply:(id:string)=>void;onActions:(id:string)=>void;
}){
  const [index,setIndex]=useState(()=>Math.max(0,items.findIndex(item=>item.id===initialId)));
  const [url,setUrl]=useState('');
  const [loading,setLoading]=useState(true);
  const [problem,setProblem]=useState('');
  const [editing,setEditing]=useState(false);
  const [crop,setCrop]=useState(false);
  const [cropRect,setCropRect]=useState<CropRect|null>(null);
  const [rotation,setRotation]=useState(0);
  const rotationRef=useRef(0);
  const [brush,setBrush]=useState(7);
  const brushRef=useRef(7);
  const [marker,setMarker]=useState('');
  const cropMove=useRef<{corner:string;start:Point;initial:CropRect}|null>(null);
  const workspaceRef=useRef<HTMLDivElement>(null);
  const [imageReady,setImageReady]=useState(false);
  const strokesRef=useRef<Stroke[]>([]);
  const pictureRef=useRef<HTMLImageElement|null>(null);
  const [saving,setSaving]=useState(false);
  const [downloadError,setDownloadError]=useState('');
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  const touchX=useRef(0);
  const current=items[index]||items[0];
  const meta=current?metaFor(current.id):undefined;
  const next=(movement:number)=>setIndex(old=>Math.max(0,Math.min(items.length-1,old+movement)));
  useEffect(()=>{
    if(!current?.upload_id)return;
    let cancelled=false;let resource='';
    setLoading(true);setProblem('');setUrl('');setEditing(false);setMarker('');strokesRef.current=[];pictureRef.current=null;setImageReady(false);setCrop(false);setCropRect(null);setRotation(0);rotationRef.current=0;
    if(current.cipher_version===1&&!secretKey){setProblem('This attachment cannot be opened on this device.');setLoading(false);return;}
    void chatMediaBlob(user,bookingId,current.upload_id).then(async encrypted=>{
      const data=current.cipher_version===1&&secretKey?
        await decryptAttachment(secretKey,bookingId,current.kind,encrypted,meta?.mime||'application/octet-stream'):encrypted;
      if(cancelled)return;
      resource=URL.createObjectURL(data);setUrl(resource);setLoading(false);
    }).catch(()=>{if(!cancelled){setProblem('Could not open this attachment. Try again later.');setLoading(false);}});
    return()=>{cancelled=true;if(resource)URL.revokeObjectURL(resource);};
  },[user,bookingId,current?.id,current?.upload_id,current?.cipher_version,current?.kind,secretKey,meta?.mime]);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onClose();
      else if(event.key==='ArrowRight'&&!editing)next(1);
      else if(event.key==='ArrowLeft'&&!editing)next(-1);
    };
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[onClose,editing,items.length]);
  function redraw(){
    const canvas=canvasRef.current,photo=pictureRef.current;
    if(!canvas||!photo?.complete||!photo.naturalWidth)return;
    const scale=Math.min(1,1200/Math.max(photo.naturalWidth,photo.naturalHeight));
    const baseWidth=Math.max(1,Math.round(photo.naturalWidth*scale));
    const baseHeight=Math.max(1,Math.round(photo.naturalHeight*scale));
    const turned=rotationRef.current%180!==0;
    const w=turned?baseHeight:baseWidth,h=turned?baseWidth:baseHeight;
    if(canvas.width!==w)canvas.width=w;
    if(canvas.height!==h)canvas.height=h;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.clearRect(0,0,w,h);
    ctx.save();ctx.translate(w/2,h/2);
    ctx.rotate(rotationRef.current*Math.PI/180);
    ctx.drawImage(photo,-baseWidth/2,-baseHeight/2,baseWidth,baseHeight);
    ctx.restore();
    ctx.lineCap='round';ctx.lineJoin='round';
    for(const stroke of strokesRef.current){
      if(!stroke.points.length)continue;
      ctx.strokeStyle=stroke.color;ctx.fillStyle=stroke.color;ctx.lineWidth=stroke.width;
      ctx.beginPath();const first=stroke.points[0];
      if(stroke.points.length===1){ctx.arc(first.x*w,first.y*h,stroke.width/2,0,Math.PI*2);ctx.fill();continue;}
      ctx.moveTo(first.x*w,first.y*h);
      for(const point of stroke.points.slice(1))ctx.lineTo(point.x*w,point.y*h);
      ctx.stroke();
    }
  }
  function rotatePhoto(){
    rotationRef.current=(rotationRef.current+90)%360;
    setRotation(rotationRef.current);
    redraw();
  }
  function frameCrop(){
    setMarker('');setCrop(true);
    setCropRect(previous=>previous||{x:.08,y:.08,w:.84,h:.84});
  }
  function resetFrame(){setCrop(false);setCropRect(null);setMarker('');}
  function cropPoint(event:PointerEvent<HTMLElement>):Point{
    const rect=workspaceRef.current?.getBoundingClientRect();
    if(!rect||!rect.width||!rect.height)return{x:0,y:0};
    return{x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height};
  }
  function cropDragStart(event:PointerEvent<HTMLElement>,corner:string){
    if(!cropRect)return;
    event.stopPropagation();
    cropMove.current={corner,start:cropPoint(event),initial:{...cropRect}};
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* Pointer capture may not be supported. */}
  }
  function cropDragMove(event:PointerEvent<HTMLElement>){
    const drag=cropMove.current;if(!drag)return;
    const p=cropPoint(event),dx=p.x-drag.start.x,dy=p.y-drag.start.y;
    const old=drag.initial;
    let x=old.x,y=old.y,w=old.w,h=old.h;
    if(drag.corner==='move'){
      x=Math.max(0,Math.min(1-w,old.x+dx));y=Math.max(0,Math.min(1-h,old.y+dy));
    }else{
      if(drag.corner.includes('l')){x=Math.max(0,Math.min(old.x+old.w-.1,old.x+dx));w=old.w+(old.x-x);}
      if(drag.corner.includes('r'))w=Math.max(.1,Math.min(1-old.x,old.w+dx));
      if(drag.corner.includes('t')){y=Math.max(0,Math.min(old.y+old.h-.1,old.y+dy));h=old.h+(old.y-y);}
      if(drag.corner.includes('b'))h=Math.max(.1,Math.min(1-old.y,old.h+dy));
    }
    setCropRect({x,y,w,h});
  }
  function cropDragEnd(event:PointerEvent<HTMLElement>){
    cropMove.current=null;
    try{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
    catch{/* Already released by browser. */}
  }
  useEffect(()=>{
    if(!editing||!url||current?.kind!=='image')return;
    let cancelled=false;
    setImageReady(false);
    const photo=new Image();
    photo.onload=()=>{
      if(cancelled)return;
      pictureRef.current=photo;setImageReady(true);redraw();
    };
    photo.onerror=()=>{if(!cancelled){setImageReady(false);setProblem('Could not prepare photo for editing.');}};
    photo.src=url;
    return()=>{cancelled=true;};
  },[editing,url,current?.kind]);
  function point(event:PointerEvent<HTMLCanvasElement>):Point{
    const rect=event.currentTarget.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),
      y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  }
  function markStart(event:PointerEvent<HTMLCanvasElement>){
    if(!marker||!imageReady||!pictureRef.current)return;
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{/* The brush remains usable if capture is unavailable. */}
    drawing.current=true;
    const p=point(event);strokesRef.current.push({color:marker,points:[p],width:brushRef.current});
    const ctx=event.currentTarget.getContext('2d');
    if(ctx){ctx.fillStyle=marker;ctx.beginPath();ctx.arc(p.x*event.currentTarget.width,p.y*event.currentTarget.height,brushRef.current/2,0,Math.PI*2);ctx.fill();}
  }
  function markMove(event:PointerEvent<HTMLCanvasElement>){
    if(!drawing.current||!imageReady)return;
    const stroke=strokesRef.current.at(-1);if(!stroke)return;
    const previous=stroke.points.at(-1),next=point(event);
    if(!previous)return;
    stroke.points.push(next);
    const ctx=event.currentTarget.getContext('2d');if(!ctx)return;
    ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.width;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(previous.x*event.currentTarget.width,previous.y*event.currentTarget.height);
    ctx.lineTo(next.x*event.currentTarget.width,next.y*event.currentTarget.height);ctx.stroke();
  }
  function markEnd(event:PointerEvent<HTMLCanvasElement>){
    drawing.current=false;
    try{if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
    catch{/* Some mobile browsers release capture automatically. */}
  }
  function undoMark(){strokesRef.current=strokesRef.current.slice(0,-1);redraw();}
  function clearMarks(){strokesRef.current=[];redraw();}
  function onTouchStart(event:TouchEvent<HTMLDivElement>){touchX.current=event.touches[0]?.clientX||0;}
  function onTouchEnd(event:TouchEvent<HTMLDivElement>){
    if(editing)return;
    const difference=(event.changedTouches[0]?.clientX||0)-touchX.current;
    if(Math.abs(difference)>55)next(difference<0?1:-1);
  }
  async function download(){
    if(!url||saving||!current)return;
    setSaving(true);setDownloadError('');
    try{
      let target=url;let temporary='';
      if(editing&&current.kind==='image'&&canvasRef.current){
        const original=canvasRef.current;
        let outputCanvas:HTMLCanvasElement=original;
        if(crop&&cropRect){
          const edit=document.createElement('canvas');
          edit.width=Math.max(1,Math.round(original.width*cropRect.w));
          edit.height=Math.max(1,Math.round(original.height*cropRect.h));
          edit.getContext('2d')?.drawImage(original,
            original.width*cropRect.x,original.height*cropRect.y,
            original.width*cropRect.w,original.height*cropRect.h,
            0,0,edit.width,edit.height);
          outputCanvas=edit;
        }
        const blob=await new Promise<Blob>((resolve,reject)=>outputCanvas.toBlob(
          result=>result?resolve(result):reject(new Error('Could not export image')),'image/png'));
        temporary=URL.createObjectURL(blob);target=temporary;
      }
      const link=document.createElement('a');link.href=target;
      const filename=displayName(current,meta);
      link.download=editing&&current.kind==='image'?filename.replace(/\.[^.]+$/,'')+'-edited.png':filename;
      document.body.appendChild(link);link.click();link.remove();
      if(temporary)setTimeout(()=>URL.revokeObjectURL(temporary),5000);
    }catch{setDownloadError('Unable to save this photo. Please try again.');}
    finally{setSaving(false);}
  }
  if(!current)return null;
  return <div className="cg-q-gallery" role="dialog" aria-modal="true" aria-label="Shared media gallery">
    <header className="cg-q-gallery-header">
      <button type="button" onClick={onClose} aria-label="Close gallery">‹</button>
      <div><strong>{displayName(current,meta)}</strong><small>{index+1} of {items.length} · CampusGigs</small></div>
      <button type="button" disabled={!url} onClick={()=>void download()} aria-label="Download attachment">↓</button>
    </header>
    <div className="cg-q-gallery-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {loading?<div className="cg-q-gallery-wait" role="status"><i/><span>Opening attachment…</span></div>:
        problem?<div className="cg-q-gallery-wait">{problem}</div>:
        editing&&current.kind==='image'?<div className="cg-r-editor-workspace" ref={workspaceRef}>
          <canvas className={marker?'cg-q-drawing':''} ref={canvasRef}
            width={900} height={700} onPointerDown={markStart} onPointerMove={markMove}
            onPointerUp={markEnd} onPointerCancel={markEnd}
            aria-label="Mark photo using the chosen brush"/>
          {crop&&cropRect&&<div className="cg-r-crop-box"
            style={{left:(cropRect.x*100)+'%',top:(cropRect.y*100)+'%',width:(cropRect.w*100)+'%',height:(cropRect.h*100)+'%'}}
            onPointerDown={event=>cropDragStart(event,'move')} onPointerMove={cropDragMove}
            onPointerUp={cropDragEnd} onPointerCancel={cropDragEnd}>
            <span className="cg-r-crop-grid"/>
            {(['tl','tr','bl','br'] as const).map(corner=><span key={corner} className={'cg-r-crop-handle '+corner}
              onPointerDown={event=>{event.stopPropagation();cropMove.current={corner,start:cropPoint(event),initial:{...cropRect}};try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}}}
              onPointerMove={cropDragMove} onPointerUp={cropDragEnd} onPointerCancel={cropDragEnd}/>)}
          </div>}
        </div>:
        current.kind==='image'?<img src={url} alt={displayName(current,meta)}/>:
        current.kind==='video'?<video src={url} controls playsInline preload="metadata"/>:
        <div className="cg-q-gallery-document"><span>▤</span><strong>{displayName(current,meta)}</strong>
          <small>File · Use Download to save it</small></div>}
      {index>0&&!editing&&<button type="button" className="cg-q-gallery-arrow left" onClick={()=>next(-1)} aria-label="Previous attachment">‹</button>}
      {index<items.length-1&&!editing&&<button type="button" className="cg-q-gallery-arrow right" onClick={()=>next(1)} aria-label="Next attachment">›</button>}
    </div>
    {editing&&current.kind==='image'&&<div className="cg-q-gallery-edit cg-r-editor-dock">
      <div className="cg-r-editor-dock-title"><strong>Photo editor</strong><small>{crop?'Drag the gold corners to crop':marker?'Draw directly on the picture':'Choose a tool to edit'}</small></div>
      <div className="cg-r-tools-row cg-r-editor-main-tools">
        <button type="button" className={crop?'active':''} onClick={frameCrop}>▣ <span>Crop</span></button>
        <button type="button" onClick={rotatePhoto}>↻ <span>Rotate</span></button>
        <button type="button" onClick={resetFrame}>⛶ <span>Full image</span></button>
        <button type="button" onClick={()=>{setCrop(false);setCropRect(null);setMarker(marker||markerColors[0].value);}}>✎ <span>Draw</span></button>
      </div>
      <div className="cg-r-tools-row cg-r-editor-pen-row">
        <span className="cg-r-tools-label">Ink</span>
        {markerColors.map(color=><button key={color.value} type="button"
          className={marker===color.value?'active cg-r-color':'cg-r-color'}
          title={color.name+' marker'} aria-label={color.name+' marker'} aria-pressed={marker===color.value}
          style={{background:color.value}} onClick={()=>{setCrop(false);setCropRect(null);setMarker(color.value);}}/>)}
        <label className="cg-r-pen-size" aria-label="Marker thickness">Size
          <input type="range" min="3" max="22" step="1" value={brush} onChange={event=>{brushRef.current=Number(event.target.value);setBrush(brushRef.current);}}/>
        </label>
        <button type="button" className="cg-r-tool-undo" onClick={undoMark}>↶ <span>Undo</span></button>
        <button type="button" className="cg-r-tool-clear" onClick={clearMarks}>Clear</button>
      </div>
    </div>}
    <div className="cg-q-gallery-filmstrip" aria-label="Attachments in conversation">{items.map((item,i)=>
      <button type="button" key={item.id} aria-label={'Attachment '+(i+1)} aria-current={index===i?'true':undefined}
        className={index===i?'selected':''} onClick={()=>setIndex(i)}>{item.kind==='image'?'▧':item.kind==='video'?'▶':'▤'}</button>)}</div>
    <footer className="cg-q-gallery-actions">
      {editing?<><button disabled={!url||saving||!imageReady} onClick={()=>void download()}>↓ <span>{saving?'Saving…':'Save edited photo'}</span></button>
        <button onClick={()=>{setEditing(false);setCrop(false);setCropRect(null);setMarker('');}}>× <span>Cancel edit</span></button></>:
        <><button disabled={!url||saving} onClick={()=>void download()}>↓ <span>{saving?'Saving…':'Download'}</span></button>
        {current.kind==='image'&&<button disabled={!url} onClick={()=>setEditing(true)}>✎ <span>Edit photo</span></button>}
        <button onClick={()=>{onReply(current.id);onClose();}}>↪ <span>Reply</span></button>
        <button onClick={()=>{onActions(current.id);onClose();}}>♡ <span>React</span></button></>}
    </footer>
    {downloadError&&<p className="cg-q-gallery-hint" role="alert">{downloadError}</p>}
    {editing&&<p className="cg-q-gallery-hint">Edits are saved as a new image. The original photo remains unchanged.</p>}
  </div>;
}
