import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';

export type ChatFile={file:File;kind:'image'|'video'|'file'};
type Marker='black'|'gold'|'grey'|'red';
type Stroke={color:Marker;points:{x:number;y:number}[]};
const colors:Record<Marker,string>={black:'#191919',gold:'#e8b700',grey:'#858585',red:'#d73339'};
export const MAX_CHAT_VIDEO=10*1024*1024;
export const MAX_CHAT_IMAGE=8*1024*1024;
export const MAX_CHAT_FILE=8*1024*1024;
export function validateChatFiles(files:ChatFile[]):string|null{
  if(!files.length)return 'Choose a photo, video or file';
  if(files.length>6)return 'Choose up to 6 attachments at once';
  for(const item of files){
    const limit=item.kind==='video'?MAX_CHAT_VIDEO:item.kind==='image'?MAX_CHAT_IMAGE:MAX_CHAT_FILE;
    if(item.file.size>limit)return `${item.file.name} exceeds the ${limit/1024/1024} MB limit`;
    if(!item.file.size)return `${item.file.name} is empty`;
  }
  return null;
}
function loadPhoto(url:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not open image'));
    image.src=url;
  });
}
function renderPhoto(canvas:HTMLCanvasElement,image:HTMLImageElement,crop:boolean,strokes:Stroke[]){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  const w=canvas.width,h=canvas.height;ctx.fillStyle='#f3f0e5';ctx.fillRect(0,0,w,h);
  const scale=crop?Math.max(w/image.width,h/image.height):Math.min(w/image.width,h/image.height);
  const iw=image.width*scale,ih=image.height*scale;
  ctx.drawImage(image,(w-iw)/2,(h-ih)/2,iw,ih);
  ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=6;
  for(const stroke of strokes){if(!stroke.points.length)continue;
    ctx.strokeStyle=colors[stroke.color];ctx.beginPath();
    ctx.moveTo(stroke.points[0].x*w,stroke.points[0].y*h);
    for(const point of stroke.points.slice(1))ctx.lineTo(point.x*w,point.y*h);
    if(stroke.points.length===1)ctx.lineTo(stroke.points[0].x*w+.1,stroke.points[0].y*h+.1);
    ctx.stroke();
  }
}

export function ChatAttachmentStudio({files,onCancel,onSend,busy}:{files:ChatFile[];onCancel:()=>void;
  onSend:(items:ChatFile[])=>Promise<void>;busy:boolean}){
  const [current,setCurrent]=useState(0);
  const [color,setColor]=useState<Marker|null>(null);
  const [cropped,setCropped]=useState<Record<number,boolean>>({});
  const [marks,setMarks]=useState<Record<number,Stroke[]>>({});
  const [error,setError]=useState('');
  const [sending,setSending]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  const drawing=useRef(false);
  const urls=useMemo(()=>files.map(item=>URL.createObjectURL(item.file)),[files]);
  useEffect(()=>()=>urls.forEach(url=>URL.revokeObjectURL(url)),[urls]);
  const item=files[current];
  useEffect(()=>{
    if(item?.kind!=='image'||!canvas.current)return;
    let alive=true;
    void loadPhoto(urls[current]).then(image=>{
      if(alive&&canvas.current)renderPhoto(canvas.current,image,cropped[current]!==false,marks[current]||[]);
    }).catch(()=>{if(alive)setError('Image could not be opened');});
    return()=>{alive=false;};
  },[item,current,urls,cropped,marks]);
  function coordinates(event:PointerEvent<HTMLCanvasElement>){
    const box=event.currentTarget.getBoundingClientRect();
    return {x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),
      y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};
  }
  function start(event:PointerEvent<HTMLCanvasElement>){
    if(!color||busy||sending)return;
    event.currentTarget.setPointerCapture(event.pointerId);drawing.current=true;
    setMarks(prev=>({...prev,[current]:[...(prev[current]||[]),{color,points:[coordinates(event)]}]}));
  }
  function move(event:PointerEvent<HTMLCanvasElement>){
    if(!drawing.current||!color)return;
    const point=coordinates(event);
    setMarks(prev=>{const strokes=[...(prev[current]||[])];const last=strokes.at(-1);if(!last)return prev;
      strokes[strokes.length-1]={...last,points:[...last.points,point]};return {...prev,[current]:strokes};});
  }
  async function prepare():Promise<ChatFile[]>{
    const result:ChatFile[]=[];
    for(let i=0;i<files.length;i++){
      const original=files[i];
      if(original.kind!=='image'){result.push(original);continue;}
      const image=await loadPhoto(urls[i]);const surface=document.createElement('canvas');
      surface.width=800;surface.height=600;
      renderPhoto(surface,image,cropped[i]!==false,marks[i]||[]);
      const blob=await new Promise<Blob>((resolve,reject)=>surface.toBlob(value=>value?resolve(value):reject(new Error('Photo could not be prepared')),'image/jpeg',.86));
      result.push({kind:'image',file:new File([blob],original.file.name.replace(/\.[^.]+$/, '')+'.jpg',{type:'image/jpeg'})});
    }
    return result;
  }
  async function submit(){
    if(sending||busy)return;setError('');setSending(true);
    try{
      const processed=await prepare();const problem=validateChatFiles(processed);
      if(problem)throw new Error(problem);
      await onSend(processed);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not prepare attachments');}
    finally{setSending(false);}
  }
  return <div className="cg-media-editor-scrim" role="dialog" aria-modal="true" aria-label="Prepare chat attachments">
    <div className="cg-media-editor">
      <header><button type="button" onClick={onCancel} disabled={sending||busy} aria-label="Close attachment editor">‹</button>
        <div><strong>Ready to share</strong><small>{files.length} {files.length===1?'attachment':'attachments'} · Private to this chat</small></div>
        <span>{current+1}/{files.length}</span></header>
      <div className="cg-media-stage">
        {item.kind==='image'?<canvas ref={canvas} width={800} height={600} className={color?'is-drawing':''}
          aria-label="Photo preview and drawing canvas" onPointerDown={start} onPointerMove={move}
          onPointerUp={()=>{drawing.current=false;}} onPointerCancel={()=>{drawing.current=false;}}/>
          :item.kind==='video'?<video src={urls[current]} controls playsInline preload="metadata"/>
            :<div className="cg-media-document"><span>▤</span><strong>{item.file.name}</strong><small>File attachment</small></div>}
      </div>
      {item.kind==='image'&&<div className="cg-editor-controls">
        <button type="button" className={cropped[current]!==false?'selected':''} onClick={()=>setCropped(prev=>({...prev,[current]:true}))}>Crop to frame</button>
        <button type="button" className={cropped[current]===false?'selected':''} onClick={()=>setCropped(prev=>({...prev,[current]:false}))}>Fit entire photo</button>
        <span className="cg-editor-colors">{(Object.keys(colors) as Marker[]).map(value=><button key={value} type="button"
          className={color===value?'selected':''} title={`Mark ${value}`} aria-label={`Mark ${value}`}
          style={{background:colors[value]}} onClick={()=>setColor(previous=>previous===value?null:value)}/>)}</span>
        <button type="button" onClick={()=>setMarks(prev=>({...prev,[current]:(prev[current]||[]).slice(0,-1)}))}>Undo</button>
      </div>}
      <div className="cg-media-filmstrip">{files.map((entry,index)=><button key={index} type="button" onClick={()=>{setCurrent(index);setColor(null);}}
        className={current===index?'selected':''}>{entry.kind==='image'?<img src={urls[index]} alt={`Photo ${index+1}`}/>:
          entry.kind==='video'?<span>▶</span>:<span>▤</span>}</button>)}</div>
      {error&&<p className="cg-media-editor-error" role="alert">{error}</p>}
      <footer><small>Photos up to 8 MB · Videos up to 10 MB · Up to 6 files</small>
        <button type="button" disabled={busy||sending} onClick={()=>void submit()}>{busy||sending?'Preparing…':`Send ${files.length===1?'file':`${files.length} files`} ➤`}</button></footer>
    </div>
  </div>;
}
