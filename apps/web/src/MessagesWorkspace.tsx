import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type TouchEvent } from 'react';
import type { User } from 'firebase/auth';
import {createPortal} from 'react-dom';
import {apiRequest,chatMediaBlob,uploadChatMedia} from './api';
import {decryptAttachment,decryptPayload,encryptAttachment,encryptPayload,type SecurePayload} from './cryptoEnvelope';
import {chatEncryption,ensureDeviceIdentity} from './secureChat';
import {ChatAttachmentStudio,validateChatFiles,type ChatFile} from './ChatAttachmentStudio';
import {ChatMediaGallery} from './ChatMediaGallery';

type ChatRow={booking_id:string;service_title:string;status:string;other_name:string;other_avatar:string;
  other_city:string;other_state:string;other_username:string;other_public_id:string|null;
  other_kind:string;other_online:number;last_body:string|null;last_kind:string|null;last_at:string|null;unread_count:number;
  last_cipher_version:number;last_client_id:string|null;last_sender_uid:string|null;secure:number};
type ChatDetail={booking:{bookingId:string;serviceTitle:string;status:string;otherName:string;otherAvatar:string;
  otherCity:string;otherState:string;otherUsername:string;otherPublicId:string|null;otherKind:string;otherOnline:number};
  preferences:{wallpaper:string;muted:number};otherReadAt:string|null;otherTyping:boolean;secure:boolean;secureSince:string|null};
type Reaction={message_id:string;reactor_uid:string;emoji:string};
type Message={id:string;sender_uid:string;client_id:string;kind:'text'|'image'|'video'|'audio'|'file'|'sticker';
  body:string;upload_id:string|null;reply_to:string|null;reply_body:string|null;reply_sender:string|null;
  reply_client_id:string|null;reply_kind:string|null;reply_cipher_version:number|null;cipher_version:number;
  pinned_by_uid:string|null;created_at:string;filename:string|null;mime_type:string|null;size_bytes:number|null;media_group_id:string|null;reactions:Reaction[]};
type MessagesPage={messages:Message[];hasMore:boolean};
type ChatUpdates={messages:Message[];hasMore:boolean;otherReadAt:string|null;otherTyping:boolean};
type Pending={bookingId:string;clientId:string;kind:Message['kind'];preview:string;wireText:string;uploadId:string|null;replyTo:string|null;groupId?:string|null;
  state:'sending'|'sent'|'failed'};
const pickerEmoji=['❤️','😂','👍','🔥','😮','😢','🙌','👏'];
const stickerEmoji=['💛','✨','🎉','🤝','🙏','💪','🥰','✅','🚀','💯'];
const wallpapers=['warm','doodle','gold','night','aurora'];
const time=(date:string|null)=>date?new Date(date).toLocaleTimeString('en-NG',{hour:'numeric',minute:'2-digit'}):'';
const short=(value:string,limit=70)=>value.length>limit?value.slice(0,limit)+'…':value;
function Avatar({name,src,size='normal'}:{name:string;src?:string|null;size?:'normal'|'small'|'large'}){
  return <span className={`cg-chat-avatar ${size}`}>{src?<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer"/>:name.slice(0,1).toUpperCase()}</span>;
}
const playerTime=(value:number)=>`${Math.floor(value/60)}:${String(Math.floor(value%60)).padStart(2,'0')}`;
const waves=[11,17,24,14,28,20,13,32,25,15,27,20,34,18,13,23,31,20,12,27,22,15,30,17];
function VoicePlayer({url}:{url:string}){
  const player=useRef<HTMLAudioElement>(null);
  const [playing,setPlaying]=useState(false);
  const [position,setPosition]=useState(0);
  const [duration,setDuration]=useState(0);
  async function toggle(){
    const current=player.current;if(!current)return;
    if(current.paused){try{await current.play();setPlaying(true);}catch{setPlaying(false);}}
    else{current.pause();setPlaying(false);}
  }
  return <div className="cg-voice-player">
    <audio ref={player} src={url} preload="metadata" aria-label="Voice note"
      onLoadedMetadata={event=>setDuration(Number.isFinite(event.currentTarget.duration)?event.currentTarget.duration:0)}
      onTimeUpdate={event=>setPosition(event.currentTarget.currentTime)}
      onEnded={()=>{setPlaying(false);setPosition(0);}} />
    <button type="button" className="cg-voice-play" aria-label={playing?'Pause voice note':'Play voice note'} onClick={()=>void toggle()}>
      {playing?'Ⅱ':'▶'}</button>
    <span className="cg-voice-track"><span className="cg-voice-waves" aria-hidden="true">{waves.map((height,index)=>
      <i key={index} className={duration&&index/waves.length<=position/duration?'played':''} style={{height}}/>)}</span>
      <input type="range" aria-label="Seek voice note" min="0" max={duration||1} step="0.1" value={Math.min(position,duration||1)}
        onChange={event=>{if(player.current){player.current.currentTime=Number(event.target.value);setPosition(player.current.currentTime);}}}/>
      <span className="cg-voice-meta"><span>Voice message</span><strong>{playerTime(playing?position:duration||position)}</strong></span>
    </span>
    <span className="cg-voice-mark" aria-hidden="true">✳</span>
  </div>;
}
function Media({user,bookingId,message,secretKey,meta,compact=false,onOpen}:{user:User;bookingId:string;message:Message;secretKey:CryptoKey|null;meta?:SecurePayload;compact?:boolean;onOpen?:(message:Message)=>void}){
  const [url,setUrl]=useState('');const [problem,setProblem]=useState(false);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    if(!message.upload_id)return;
    let cancelled=false;let resource='';
    setProblem(false);setUrl('');
    if(message.cipher_version===1&&!secretKey){setProblem(true);return;}
    chatMediaBlob(user,bookingId,message.upload_id).then(async blob=>{
      const plain=message.cipher_version===1&&secretKey?
        await decryptAttachment(secretKey,bookingId,message.kind,blob,meta?.mime||'application/octet-stream'):blob;
      if(cancelled)return;
      resource=URL.createObjectURL(plain);setUrl(resource);
    }).catch(()=>{if(!cancelled)setProblem(true);});
    return()=>{cancelled=true;if(resource)URL.revokeObjectURL(resource);};
  },[user,bookingId,message.upload_id,message.cipher_version,message.kind,secretKey,meta?.mime]);
  if(problem)return <span className="cg-media-error">Attachment unavailable</span>;
  if(!url)return <span className="cg-media-loading">Loading attachment…</span>;
  if(message.kind==='image'||message.kind==='video')return <>
    <button type="button" className={`cg-media-tile ${compact?'compact':''}`} onClick={()=>onOpen?onOpen(message):setExpanded(true)}
      aria-label={`Open ${message.kind==='video'?'video':'photo'} full size`}>
      {message.kind==='image'?<img className="cg-chat-image" src={url} alt={meta?.filename||message.filename||'Shared photo'} loading="lazy"/>
        :<><video className="cg-chat-video" src={url} muted playsInline preload="metadata"/><span className="cg-video-play">▶</span></>}
    </button>
    {expanded&&createPortal(<div className="cg-media-viewer" role="dialog" aria-modal="true" aria-label="View shared media">
      <button className="cg-media-viewer-close" onClick={()=>setExpanded(false)} aria-label="Close media">×</button>
      {message.kind==='image'?<img src={url} alt={meta?.filename||'Shared photo'}/>
        :<video src={url} controls autoPlay playsInline/>}
    </div>,document.body)}
  </>;
  if(message.kind==='audio')return <VoicePlayer url={url}/>;
  return onOpen?<button type="button" className="cg-file-bubble cg-file-open" onClick={()=>onOpen(message)} aria-label="Open shared file options"><span>▤</span><span>{short(meta?.filename||message.filename||'Shared file',32)}<small>{(meta?.size||message.size_bytes)?Math.round((meta?.size||message.size_bytes||0)/1024)+' KB':'File'}</small></span><span>↓</span></button>:
    <a className="cg-file-bubble" href={url} download={meta?.filename||message.filename||'attachment'}><span>▤</span><span>{short(meta?.filename||message.filename||'Download file',32)}<small>{(meta?.size||message.size_bytes)?Math.round((meta?.size||message.size_bytes||0)/1024)+' KB':'File'}</small></span><span>↓</span></a>;
}

export function MessagesWorkspace({user,initialBookingId,onLogin,onBack,onProfile,notice}:{
  user:User|null;initialBookingId:string;onLogin:()=>void;onBack:()=>void;onProfile:(id:string)=>void;notice:(message:string)=>void;
}){
  const [chats,setChats]=useState<ChatRow[]>([]);
  const [selected,setSelected]=useState(initialBookingId);
  const [detail,setDetail]=useState<ChatDetail|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const [query,setQuery]=useState('');
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [reply,setReply]=useState<Message|null>(null);
  const [actions,setActions]=useState<Message|null>(null);
  const [galleryMessage,setGalleryMessage]=useState<Message|null>(null);
  const [connectionLost,setConnectionLost]=useState(!navigator.onLine);
  const [picker,setPicker]=useState<'emoji'|'sticker'|null>(null);
  const [attachmentMenu,setAttachmentMenu]=useState(false);
  const [attachments,setAttachments]=useState<ChatFile[]>([]);
  const [composerTyping,setComposerTyping]=useState(false);
  const [listPreviews,setListPreviews]=useState<Record<string,string>>({});
  const [settings,setSettings]=useState(false);
  const [profile,setProfile]=useState(false);
  const [recording,setRecording]=useState(false);
  const [seconds,setSeconds]=useState(0);
  const [otherTyping,setOtherTyping]=useState(false);
  const [otherReadAt,setOtherReadAt]=useState<string|null>(null);
  const [identity,setIdentity]=useState<Awaited<ReturnType<typeof ensureDeviceIdentity>>|null>(null);
  const [secureKey,setSecureKey]=useState<CryptoKey|null>(null);
  const [securityError,setSecurityError]=useState('');
  const [decoded,setDecoded]=useState<Record<string,{payload:SecurePayload;replyText?:string}>>({});
  const [pending,setPending]=useState<Pending[]>([]);
  const [newMessageCount,setNewMessageCount]=useState(0);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const photoRef=useRef<HTMLInputElement>(null);
  const videoRef=useRef<HTMLInputElement>(null);
  const scrollRef=useRef<HTMLDivElement>(null);
  const recorder=useRef<MediaRecorder|null>(null);
  const voiceStream=useRef<MediaStream|null>(null);
  const lastTyped=useRef(0);
  const typingOff=useRef<ReturnType<typeof setTimeout>|null>(null);
  const typingVisualTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const previewCache=useRef<Map<string,string>>(new Map());
  const pendingRef=useRef<Pending[]>([]);
  useEffect(()=>{pendingRef.current=pending;},[pending]);
  const touchOrigin=useRef<{x:number;y:number;id:string}|null>(null);
  const swipeAmount=useRef(0);
  const [swipe,setSwipe]=useState<{id:string;pixels:number}|null>(null);
  const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const profileTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastMessageId=useRef('');
  const pollInFlight=useRef(false);
  const threadLoaded=useRef(false);
  const derivedCode=useRef('');
  const selectedRef=useRef(selected);
  useEffect(()=>{selectedRef.current=selected;},[selected]);
  useEffect(()=>{
    let alive=true;setIdentity(null);setSecurityError('');
    if(!user)return;
    void ensureDeviceIdentity(user).then(key=>{if(alive)setIdentity(key);}).catch(error=>{
      if(alive)setSecurityError(error instanceof Error?error.message:'Secure keys could not be opened');
    });
    return()=>{alive=false;};
  },[user]);
  const refreshChats=useCallback(async()=>{
    if(!user)return;
    try{const page=await apiRequest<{chats:ChatRow[]}>(user,'/v1/me/chats');setChats(page.chats);}
    catch(error){notice(error instanceof Error?error.message:'Could not load conversations');}
    finally{setLoading(false);}
  },[user,notice]);
  useEffect(()=>{void refreshChats();if(!user)return;const timer=setInterval(()=>{if(!document.hidden)void refreshChats();},16000);return()=>clearInterval(timer);},[refreshChats,user]);
  useEffect(()=>{
    if(!user||!identity||!chats.length)return;
    let alive=true;
    const remaining=chats.filter(chat=>chat.last_cipher_version===1&&chat.last_client_id&&chat.last_sender_uid&&chat.last_body)
      .slice(0,35).filter(chat=>!previewCache.current.has(`${chat.booking_id}:${chat.last_client_id}`));
    const preview=async(chat:ChatRow)=>{
      const key=`${chat.booking_id}:${chat.last_client_id}`;
      try{
        const secure=await chatEncryption(user,chat.booking_id,identity);
        if(!secure.key)return;
        const value=await decryptPayload(secure.key,chat.booking_id,chat.last_kind||'text',chat.last_sender_uid!,chat.last_client_id!,chat.last_body!);
        if(!alive)return;
        const content=value.text||value.filename||(chat.last_kind==='audio'?'Voice message':'Shared attachment');
        previewCache.current.set(key,content);setListPreviews(prev=>({...prev,[key]:content}));
      }catch{/* On an unknown or mismatched device, never display ciphertext as plaintext. */}
    };
    void (async()=>{for(let offset=0;offset<remaining.length&&alive;offset+=4)await Promise.all(remaining.slice(offset,offset+4).map(preview));})();
    return()=>{alive=false;};
  },[user,identity,chats]);
  useEffect(()=>{if(initialBookingId)setSelected(initialBookingId);},[initialBookingId]);
  useEffect(()=>{
    const update=()=>document.documentElement.style.setProperty('--cg-chat-viewport',
      `${Math.round(window.visualViewport?.height||window.innerHeight)}px`);
    update();window.visualViewport?.addEventListener('resize',update);window.addEventListener('resize',update);
    return()=>{window.visualViewport?.removeEventListener('resize',update);window.removeEventListener('resize',update);
      document.documentElement.style.removeProperty('--cg-chat-viewport');};
  },[]);
  const goToBottom=useCallback((smooth=false)=>{
    const container=scrollRef.current;if(!container)return;
    container.scrollTo({top:container.scrollHeight,behavior:smooth?'smooth':'instant'});
    setNewMessageCount(0);
  },[]);
  const refreshThread=useCallback(async(id:string,quiet=false)=>{
    if(!user||!id)return;
    try{
      const [chat,page]=await Promise.all([
        apiRequest<ChatDetail>(user,`/v1/chats/${id}`),
        apiRequest<MessagesPage>(user,`/v1/chats/${id}/messages`),
      ]);
      if(selectedRef.current!==id)return;
      setDetail(chat);setOtherTyping(chat.otherTyping);setOtherReadAt(chat.otherReadAt);
      setHasMore(page.hasMore);setMessages(page.messages);
      threadLoaded.current=true;
      const newest=page.messages.at(-1)?.id||'';
      if(newest&&newest!==lastMessageId.current){
        const last=page.messages.at(-1);
        if((!quiet||last?.sender_uid!==user.uid)&&document.visibilityState==='visible'){
          void apiRequest(user,`/v1/chats/${id}/read`,{method:'POST'}).then(refreshChats).catch(()=>{});
        }
        if(!quiet||!lastMessageId.current||last?.sender_uid===user.uid){
          requestAnimationFrame(()=>goToBottom(quiet));
        }
        lastMessageId.current=newest;
      }
    }catch(error){if(!quiet)notice(error instanceof Error?error.message:'Could not open chat');}
  },[user,refreshChats,notice,goToBottom]);
  const pollThread=useCallback(async(id:string)=>{
    if(!user||!id||!threadLoaded.current||pollInFlight.current)return;
    pollInFlight.current=true;
    try{
      const after=lastMessageId.current;
      const updates=await apiRequest<ChatUpdates>(user,`/v1/chats/${id}/updates${after?'?after='+encodeURIComponent(after):''}`);
      if(selectedRef.current!==id)return;
      setOtherTyping(updates.otherTyping);setOtherReadAt(updates.otherReadAt);
      if(updates.messages.length){
        const container=scrollRef.current;
        const atBottom=!container||container.scrollHeight-container.scrollTop-container.clientHeight<135;
        const latest=updates.messages.at(-1)!;
        lastMessageId.current=latest.id;
        setMessages(prev=>{
          const ids=new Set(prev.map(item=>item.id));return [...prev,...updates.messages.filter(item=>!ids.has(item.id))];
        });
        if(atBottom||latest.sender_uid===user.uid)requestAnimationFrame(()=>goToBottom());
        else setNewMessageCount(prev=>prev+updates.messages.length);
        if(updates.messages.some(message=>message.sender_uid!==user.uid)&&document.visibilityState==='visible'){
          void apiRequest(user,`/v1/chats/${id}/read`,{method:'POST'})
            .then(()=>setChats(prev=>prev.map(chat=>chat.booking_id===id?{...chat,unread_count:0}:chat))).catch(()=>{});
        }
        if(updates.hasMore)queueMicrotask(()=>{void pollThread(id);});
      }
    }catch(error){
      // An invalid cursor may indicate an earlier message was removed; reload safely.
      if(error instanceof Error&&/cursor/i.test(error.message))void refreshThread(id,true);
    }finally{pollInFlight.current=false;}
  },[user,goToBottom,refreshThread]);
  useEffect(()=>{
    lastMessageId.current='';threadLoaded.current=false;setDetail(null);setMessages([]);setReply(null);setPicker(null);setActions(null);setDecoded({});setPending([]);setGalleryMessage(null);setNewMessageCount(0);
    if(!selected||!user)return;
    void refreshThread(selected);
    const timer=setInterval(()=>{if(!document.hidden)void pollThread(selected);},1800);
    const catchUp=setInterval(()=>{if(!document.hidden)void refreshThread(selected,true);},30000);
    const onVisible=()=>{if(!document.hidden)void pollThread(selected);};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{clearInterval(timer);clearInterval(catchUp);document.removeEventListener('visibilitychange',onVisible);};
  },[selected,user,refreshThread,pollThread]);
  useEffect(()=>{
    if(!messages.length)return;
    const ids=new Set(messages.map(message=>message.client_id));
    setPending(prev=>prev.some(message=>ids.has(message.clientId))?prev.filter(message=>!ids.has(message.clientId)):prev);
  },[messages]);
  useEffect(()=>{
    let alive=true;setSecureKey(null);derivedCode.current='';
    if(!identity||!selected||!user)return;
    const load=async()=>{
      try{
        const state=await chatEncryption(user,selected,identity);
        if(!alive)return;
        if((state.code||'')!==derivedCode.current){
          derivedCode.current=state.code||'';setSecureKey(state.key);
        }
        setSecurityError('');
      }catch(error){if(alive){setSecureKey(null);setSecurityError(error instanceof Error?error.message:'Secure chat unavailable');}}
    };
    void load();const timer=setInterval(()=>{if(!document.hidden)void load();},15000);
    return()=>{alive=false;clearInterval(timer);};
  },[user,selected,identity]);
  useEffect(()=>{
    let alive=true;
    const encrypted=messages.filter(message=>message.cipher_version===1);
    if(!secureKey||!selected||!encrypted.length)return;
    void Promise.all(encrypted.map(async message=>{
      try{
        const payload=await decryptPayload(secureKey,selected,message.kind,message.sender_uid,message.client_id,message.body);
        let replyText:string|undefined;
        if(message.reply_cipher_version===1&&message.reply_body&&message.reply_sender&&message.reply_client_id&&message.reply_kind){
          const reply=await decryptPayload(secureKey,selected,message.reply_kind,message.reply_sender,message.reply_client_id,message.reply_body);
          replyText=reply.text||reply.filename||'Encrypted attachment';
        }
        return [message.id,{payload,replyText}] as const;
      }catch{return [message.id,{payload:{text:'Message unavailable on this device'}}] as const;}
    })).then(entries=>{if(alive)setDecoded(Object.fromEntries(entries));});
    return()=>{alive=false;};
  },[messages,secureKey,selected]);
  useEffect(()=>()=>{recorder.current?.state==='recording'&&recorder.current.stop();voiceStream.current?.getTracks().forEach(track=>track.stop());},[]);
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[recording]);
  useEffect(()=>{
    const input=inputRef.current;if(!input)return;
    input.style.height='auto';input.style.height=`${Math.min(input.scrollHeight,124)}px`;
  },[draft,selected]);
  useEffect(()=>()=>{if(typingOff.current)clearTimeout(typingOff.current);
    if(typingVisualTimer.current)clearTimeout(typingVisualTimer.current);},[]);

  function openChat(id:string){
    setSelected(id);window.history.replaceState(null,'',`/messages/${id}`);
  }
  function closeChat(){
    setSelected('');window.history.replaceState(null,'','/messages');
    setSettings(false);setProfile(false);lastMessageId.current='';
  }
  function notifyTyping(){
    if(!user||!selected)return;
    setComposerTyping(true);
    if(typingVisualTimer.current)clearTimeout(typingVisualTimer.current);
    typingVisualTimer.current=setTimeout(()=>setComposerTyping(false),1550);
    if(Date.now()-lastTyped.current>=2800){lastTyped.current=Date.now();
      void apiRequest(user,`/v1/chats/${selected}/typing`,{method:'POST',body:JSON.stringify({active:true})}).catch(()=>{});}
    if(typingOff.current)clearTimeout(typingOff.current);
    const bookingId=selected;
    typingOff.current=setTimeout(()=>void apiRequest(user,`/v1/chats/${bookingId}/typing`,{
      method:'POST',body:JSON.stringify({active:false})}).catch(()=>{}),2500);
  }
  const showText=(message:Message)=>message.cipher_version===1?
    decoded[message.id]?.payload.text||decoded[message.id]?.payload.filename||'':message.body;
  async function deliver(item:Pending){
    if(!user)return;
    setPending(prev=>prev.map(message=>message.clientId===item.clientId?{...message,state:'sending'}:message));
    try{
      await apiRequest(user,`/v1/chats/${item.bookingId}/messages`,{method:'POST',
        body:JSON.stringify({clientId:item.clientId,kind:item.kind,text:item.wireText,
          uploadId:item.uploadId,replyTo:item.replyTo,groupId:item.groupId||null})});
      setPending(prev=>prev.map(message=>message.clientId===item.clientId?{...message,state:'sent'}:message));
      void pollThread(item.bookingId);void refreshChats();
    }catch(error){
      setPending(prev=>prev.map(message=>message.clientId===item.clientId?{...message,state:'failed'}:message));
      notice(error instanceof Error?error.message:'Message not delivered. Tap to retry.');
    }
  }
  useEffect(()=>{
    if(!user||!selected)return;
    const recover=()=>{
      setConnectionLost(false);
      void refreshThread(selected,true);void refreshChats();
      pendingRef.current.filter(item=>item.bookingId===selected&&item.state==='failed')
        .forEach(item=>void deliver(item));
    };
    const offline=()=>setConnectionLost(true);
    window.addEventListener('online',recover);window.addEventListener('offline',offline);
    return()=>{window.removeEventListener('online',recover);window.removeEventListener('offline',offline);};
  },[selected,user,refreshThread,refreshChats]);
  function queueMessage(message:Omit<Pending,'state'>){
    const item:Pending={...message,state:'sending'};
    setPending(prev=>[...prev,item]);requestAnimationFrame(()=>goToBottom());
    void deliver(item);
  }
  async function send(kind:'text'|'sticker'|'image'|'video'|'file'|'audio'='text',text=draft,uploadId:string|null=null){
    if(!user||!selected||busy)return;
    if(kind==='text'&&!text.trim())return;
    if(detail?.secure&&!secureKey){notice('This chat needs your device encryption key before sending');return;}
    setBusy(true);
    try{
      const clientId=crypto.randomUUID();
      const body=detail?.secure?await encryptPayload(secureKey!,selected,kind,user.uid,clientId,{text:text.trim()}):text.trim();
      queueMessage({bookingId:selected,clientId,kind,preview:text.trim(),wireText:body,uploadId,replyTo:reply?.id||null});
      setDraft('');setReply(null);setPicker(null);setComposerTyping(false);
      inputRef.current?.focus();
    }catch(error){notice(error instanceof Error?error.message:'Message could not be sent');}
    finally{setBusy(false);}
  }
  function chooseAttachments(event:ChangeEvent<HTMLInputElement>,kind:ChatFile['kind']){
    const files=Array.from(event.target.files||[]).map(file=>({file,kind}));
    event.target.value='';
    const problem=validateChatFiles(files);
    if(problem){notice(problem);return;}
    setAttachmentMenu(false);setPicker(null);setAttachments(files);
  }
  async function sendAttachments(items:ChatFile[]){
    if(!user||!selected||busy)return;
    if(detail?.secure&&!secureKey)throw new Error('Secure device key unavailable. Attachment not sent.');
    const bookingId=selected,secure=!!detail?.secure,key=secureKey,replyId=reply?.id||null;
    const groupId=items.length>1?crypto.randomUUID():null;
    setBusy(true);
    try{
      for(const [index,item] of items.entries()){
        const {file,kind}=item,clientId=crypto.randomUUID();
        const content=secure?await encryptAttachment(key!,bookingId,kind,file):file;
        const upload=await uploadChatMedia(user,bookingId,content,secure?'Encrypted attachment':file.name,secure?kind:undefined);
        const body=secure?await encryptPayload(key!,bookingId,kind,user.uid,clientId,
          {text:'',filename:file.name,mime:file.type,size:file.size}):'';
        queueMessage({bookingId,clientId,kind:upload.kind,preview:file.name,
          wireText:body,uploadId:upload.id,replyTo:index===0?replyId:null,groupId});
      }
      setAttachments([]);setReply(null);
    }catch(error){throw error instanceof Error?error:new Error('Attachment failed');}
    finally{setBusy(false);}
  }
  async function startVoice(){
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){notice('Voice recording is unavailable on this device');return;}
    if(detail?.secure&&!secureKey){notice('Secure device key unavailable. Cannot record to this chat.');return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});voiceStream.current=stream;
      const options=['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(type=>MediaRecorder.isTypeSupported(type));
      const media=new MediaRecorder(stream,options?{mimeType:options}:undefined),chunks:Blob[]=[];
      media.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      media.onstop=async()=>{
        stream.getTracks().forEach(track=>track.stop());voiceStream.current=null;
        if((media as MediaRecorder & {datasetCancel?:boolean}).datasetCancel)return;
        const blob=new Blob(chunks,{type:media.mimeType.split(';')[0]||'audio/webm'});
        if(!user||!selected||!blob.size)return;
        setBusy(true);
        try{
          const secure=!!detail?.secure,clientId=crypto.randomUUID();
          if(secure&&!secureKey)throw new Error('Secure device key unavailable');
          const content=secure?await encryptAttachment(secureKey!,selected,'audio',blob):blob;
          const upload=await uploadChatMedia(user,selected,content,'Voice note',secure?'audio':undefined);
          const body=secure?await encryptPayload(secureKey!,selected,'audio',user.uid,clientId,
            {text:'',filename:'Voice note',mime:blob.type,size:blob.size}):'';
          queueMessage({bookingId:selected,clientId,kind:'audio',preview:'Voice message',
            wireText:body,uploadId:upload.id,replyTo:reply?.id||null});setReply(null);
        }catch(error){notice(error instanceof Error?error.message:'Voice note failed');}
        finally{setBusy(false);}
      };
      recorder.current=media;media.start();setSeconds(0);setRecording(true);
    }catch{notice('Allow microphone access to send a voice note');}
  }
  function stopVoice(cancel=false){
    const current=recorder.current;
    if(current?.state==='recording'){
      if(cancel)(current as MediaRecorder & {datasetCancel?:boolean}).datasetCancel=true;
      current.stop();
    }
    setRecording(false);setSeconds(0);
  }
  async function react(message:Message,emoji:string|null){
    if(!user||!selected)return;
    try{
      await apiRequest(user,`/v1/chats/${selected}/messages/${message.id}/reaction`,{
        method:emoji?'PUT':'DELETE',...(emoji?{body:JSON.stringify({emoji})}:{}),
      });setActions(null);await refreshThread(selected,true);
    }catch(error){notice(error instanceof Error?error.message:'Could not react');}
  }
  async function pin(message:Message){
    if(!user||!selected)return;
    try{
      await apiRequest(user,`/v1/chats/${selected}/messages/${message.id}/pin`,{method:message.pinned_by_uid?'DELETE':'PUT'});
      setActions(null);await refreshThread(selected,true);
    }catch(error){notice(error instanceof Error?error.message:'Could not pin message');}
  }
  async function copy(message:Message){
    if(message.cipher_version===1&&!decoded[message.id]){notice('This message is not decrypted');return;}
    try{await navigator.clipboard.writeText(showText(message));setActions(null);notice('Copied');}
    catch{notice('Copy is unavailable on this device');}
  }
  async function enableSecurity(){
    if(!selected||!user||detail?.secure||!secureKey||busy)return;
    if(!window.confirm('Enable encrypted messages and attachments for this chat? Older messages remain unencrypted. Only the original device can read new messages. Losing it could mean losing access.'))return;
    setBusy(true);
    try{
      await apiRequest(user,`/v1/chats/${selected}/secure/enable`,{method:'POST'});
      await refreshThread(selected);await refreshChats();setSettings(false);
      notice('New messages and attachments are encrypted on this device.');
    }catch(error){notice(error instanceof Error?error.message:'Could not enable encrypted chat');}
    finally{setBusy(false);}
  }
  async function saveSettings(wallpaper:string,muted:boolean){
    if(!user||!selected||!detail)return;
    try{
      await apiRequest(user,`/v1/chats/${selected}/preferences`,{method:'PUT',body:JSON.stringify({wallpaper,muted})});
      setDetail({...detail,preferences:{wallpaper,muted:Number(muted)}});setSettings(false);
    }catch(error){notice(error instanceof Error?error.message:'Could not save chat settings');}
  }
  async function older(){
    if(!selected||!user||!messages.length)return;
    try{
      const viewport=scrollRef.current,before=viewport?.scrollHeight||0,top=viewport?.scrollTop||0;
      const page=await apiRequest<MessagesPage>(user,`/v1/chats/${selected}/messages?before=${messages[0].id}`);
      setMessages(prev=>[...page.messages,...prev]);setHasMore(page.hasMore);
      requestAnimationFrame(()=>{if(viewport)viewport.scrollTop=top+viewport.scrollHeight-before;});
    }catch(error){notice(error instanceof Error?error.message:'Could not load older messages');}
  }
  const visible=chats.filter(item=>[item.other_name,item.other_username,item.service_title,item.other_city,item.other_state]
    .some(value=>value?.toLowerCase().includes(query.toLowerCase())));
  const lastOutgoingRead=messages.filter(m=>m.sender_uid===user?.uid&&otherReadAt&&m.created_at<=otherReadAt).at(-1)?.id;
  const pinned=messages.filter(message=>!!message.pinned_by_uid);
  const galleryItems=galleryMessage?(galleryMessage.media_group_id?
    messages.filter(item=>item.media_group_id===galleryMessage.media_group_id&&!!item.upload_id&&['image','video','file'].includes(item.kind)):
    messages.filter(item=>!!item.upload_id&&['image','video','file'].includes(item.kind))):[];
  return <section className="cg-messenger section-wrap" aria-label="CampusGigs Messenger">
    <div className="cg-msg-layout">
      <aside className={`cg-msg-sidebar ${selected?'cg-mobile-hide':''}`}>
        <div className="cg-msg-aside-head"><button type="button" className="cg-msg-list-back" onClick={onBack} aria-label="Leave messages">‹</button>
          <div><span className="eyebrow">YOUR CONNECTIONS</span><h1>Messages<span>.</span></h1></div><span className="cg-msg-head-symbol">✳</span></div>
        <div className="cg-msg-search"><span>⌕</span><input aria-label="Search conversations" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search people or gigs…"/></div>
        <div className="cg-msg-list" role="list">
          {loading?<p className="cg-msg-empty">Loading conversations…</p>
            :visible.length?visible.map(item=><button key={item.booking_id} role="listitem" type="button"
                className={`cg-thread-item ${selected===item.booking_id?'current':''}`} onClick={()=>openChat(item.booking_id)}>
              <Avatar name={item.other_name} src={item.other_avatar}/>
              <span className="cg-thread-center"><span className="cg-thread-top"><strong>{item.other_name}</strong><small>{time(item.last_at)}</small></span>
                <span className="cg-thread-sub">{item.other_username?'@'+item.other_username+' · ':''}{item.service_title}</span>
                <span className="cg-thread-preview">{item.last_cipher_version===1?(listPreviews[`${item.booking_id}:${item.last_client_id}`]||'New message'):
                  item.last_body|| (item.last_kind?'📎 '+item.last_kind:'Say hello 👋')}</span></span>
              {!!item.unread_count&&<span className="cg-chat-unread">{Math.min(99,item.unread_count)}</span>}
            </button>)
            :<div className="cg-msg-empty"><span>✦</span><h2>{query?'No matching chats':'Your conversations start here'}</h2><p>{query?'Try another name or gig':'Request a service to message its provider.'}</p><button onClick={onBack}>Find services ↗</button></div>}
        </div>
        <div className="cg-msg-aside-foot">Private booking chats · Enable encryption in chat settings</div>
      </aside>

      <div className={`cg-conversation ${selected?'cg-conversation-open':'cg-mobile-hide'}`}>
        {!selected?<div className="cg-msg-welcome"><span>✦</span><h2>Good conversations.<br/><em>Great work.</em></h2><p>Choose a conversation to connect.</p></div>
        :<><div className="cg-conversation-head">
          <button className="cg-chat-back" aria-label="Back to chats" onClick={closeChat}>‹</button>
          <button className="cg-chat-person" onTouchStart={()=>{profileTimer.current=setTimeout(()=>setProfile(true),520);}}
            onTouchEnd={()=>{if(profileTimer.current)clearTimeout(profileTimer.current);}}
            onContextMenu={event=>{event.preventDefault();setProfile(true);}}
            onClick={()=>setProfile(true)}>
            <Avatar name={detail?.booking.otherName||'C'} src={detail?.booking.otherAvatar}/>
            <span><strong>{detail?.booking.otherName||'Opening chat…'}</strong>
              <small>{otherTyping?<span className="cg-typing-status">● typing…</span>
                :detail?.booking.otherOnline?'● Active on CampusGigs':detail?.booking.otherCity||detail?.booking.otherState||detail?.booking.serviceTitle}</small></span>
          </button>
          <button className="cg-chat-head-btn" onClick={()=>setSettings(true)} aria-label="Chat settings">⚙</button>
        </div>
        {!!pinned.length&&<button className="cg-pin-bar" onClick={()=>{const node=document.getElementById('chat-'+pinned.at(-1)?.id);node?.scrollIntoView({block:'center',behavior:'smooth'});}}>📌 {short(showText(pinned.at(-1)!),55)}</button>}
        <div ref={scrollRef} className={`cg-chat-scroll cg-wallpaper-${detail?.preferences.wallpaper||'warm'}`} role="log" aria-label="Messages"
          onScroll={event=>{const box=event.currentTarget;if(box.scrollHeight-box.scrollTop-box.clientHeight<70)setNewMessageCount(0);}}>
          <div className={`cg-chat-security ${detail?.secure?'cg-chat-protected':''}`}>
            {detail?.secure?<strong>🔒 Encrypted on this device</strong>
              :<><strong>◈ Standard booking chat</strong><span>Not end-to-end encrypted.</span>
                {secureKey&&<button type="button" disabled={busy} onClick={()=>void enableSecurity()}>Enable encryption ↗</button>}</>}
            {securityError&&<span className="cg-security-warning" role="alert">⚠ {securityError}</span>}
          </div>
          {connectionLost&&<div className="cg-q-offline" role="status">Offline · Messages will retry when connected</div>}
          {hasMore&&<button className="cg-more-messages" onClick={()=>void older()}>↑ Load earlier messages</button>}
          {!messages.length&&<div className="cg-chat-first"><span>💛</span><h3>Say hello!</h3><p>Share what you need, ask questions, or send a voice note.</p></div>}
          {messages.map(message=>{
            const album=message.media_group_id?messages.filter(item=>item.media_group_id===message.media_group_id):[];
            if(album.length>1&&album[0].id!==message.id)return null;
            const mine=message.sender_uid===user?.uid;
            const text=showText(message);
            const meta=decoded[message.id]?.payload;
            return <div id={'chat-'+message.id} key={message.id} className={`cg-chat-row ${mine?'mine':'theirs'} ${swipe?.id===message.id?'cg-swiping':''}`}
              onTouchStart={(event:TouchEvent<HTMLDivElement>)=>{
                touchOrigin.current={id:message.id,x:event.touches[0].clientX,y:event.touches[0].clientY};swipeAmount.current=0;
                holdTimer.current=setTimeout(()=>{if(swipeAmount.current<10)setActions(message);},540);
              }}
              onTouchMove={event=>{
                const origin=touchOrigin.current;if(!origin||origin.id!==message.id)return;
                const dx=event.touches[0].clientX-origin.x,dy=event.touches[0].clientY-origin.y;
                if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)*1.2){
                  if(holdTimer.current)clearTimeout(holdTimer.current);touchOrigin.current=null;setSwipe(null);return;
                }
                if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.15){
                  if(holdTimer.current)clearTimeout(holdTimer.current);
                  swipeAmount.current=Math.min(91,Math.max(0,dx));setSwipe({id:message.id,pixels:swipeAmount.current});
                }
              }}
              onTouchEnd={()=>{
                if(holdTimer.current)clearTimeout(holdTimer.current);
                if(touchOrigin.current?.id===message.id&&swipeAmount.current>65){
                  setReply(message);inputRef.current?.focus();if(navigator.vibrate)navigator.vibrate(10);
                }
                swipeAmount.current=0;touchOrigin.current=null;setSwipe(null);
              }}
              onTouchCancel={()=>{if(holdTimer.current)clearTimeout(holdTimer.current);touchOrigin.current=null;setSwipe(null);}}
              onContextMenu={event=>{event.preventDefault();setActions(message);}}>
              <span className="cg-swipe-indicator" aria-hidden="true" style={{opacity:swipe?.id===message.id?Math.min(1,swipe.pixels/65):0}}>↪</span>
              <div className={`cg-chat-bubble ${message.kind==='sticker'?'cg-sticker-bubble':''} ${album.length>1?'cg-chat-album-bubble':''}`}
                style={{transform:`translate3d(${swipe?.id===message.id?swipe.pixels:0}px,0,0)`}}
                onDoubleClick={()=>{setReply(message);inputRef.current?.focus();}}>
                {message.reply_to&&<div className="cg-quoted"><small>{message.reply_sender===user?.uid?'You':'Reply'}</small>
                  <span>{short(message.reply_cipher_version===1?(decoded[message.id]?.replyText||'Reply'):
                    message.reply_body||'Attachment',100)}</span></div>}
                {album.length>1?<div className="cg-chat-album" aria-label={`${album.length} shared attachments`}>
                  {album.map(item=><div key={item.id} className="cg-chat-album-item">
                    {item.upload_id&&user&&(item.cipher_version!==1||decoded[item.id]?.payload)?
                      <Media user={user} bookingId={selected} message={item} secretKey={secureKey} meta={decoded[item.id]?.payload} compact onOpen={setGalleryMessage}/>:
                      <span className="cg-q-loading" aria-label="Loading attachment"/>}
                  </div>)}
                  <span className="cg-album-count">{album.length} files</span>
                </div>:<>
                  {message.upload_id&&user&&(message.cipher_version!==1||meta)&&<Media user={user} bookingId={selected} message={message} secretKey={secureKey} meta={meta} onOpen={setGalleryMessage}/>}
                  {message.cipher_version===1&&message.upload_id&&!meta&&<span className="cg-q-loading" aria-label="Loading attachment"/>}
                </>}
                {(message.kind==='text'||message.kind==='sticker'||(message.cipher_version===1&&!message.upload_id))&&
                  <span className="cg-message-text">{text||<span className="cg-q-text-skeleton" aria-label="Opening message"/>}</span>}
                <span className="cg-chat-time">{time(album.at(-1)?.created_at||message.created_at)} {mine?'✓':''} {message.pinned_by_uid?'📌':''}</span>
              </div>
              {!!message.reactions.length&&<div className="cg-reactions">{message.reactions.map(reaction=><button key={reaction.reactor_uid}
                onClick={()=>void react(message,reaction.emoji)} title={reaction.reactor_uid===user?.uid?'Remove reaction':'React'}>
                {reaction.emoji}</button>)}</div>}
              {(message.id===lastOutgoingRead||album.at(-1)?.id===lastOutgoingRead)&&<span className="cg-read-avatar" title="Seen"><Avatar size="small" name={detail?.booking.otherName||''} src={detail?.booking.otherAvatar}/></span>}
              <button type="button" className="cg-message-more" aria-label="Message actions" onClick={()=>setActions(message)}>•••</button>
            </div>;
          })}
          {pending.filter(item=>item.bookingId===selected&&!messages.some(message=>message.client_id===item.clientId)).map(item=><div
            key={item.clientId} className={`cg-chat-row mine cg-pending-row ${item.state==='failed'?'cg-pending-failed':''}`}>
            <div className="cg-chat-bubble"><span className="cg-message-text">{item.kind==='text'||item.kind==='sticker'?item.preview:
              `📎 ${short(item.preview,42)}`}</span><span className="cg-chat-time">{item.state==='sending'?'◷ Sending…':
              item.state==='sent'?'✓ Sent · syncing':'! Not delivered'}</span></div>
            {item.state==='failed'&&<button type="button" className="cg-pending-retry" onClick={()=>void deliver(item)}>↻ Retry</button>}
          </div>)}
          {otherTyping&&<div className="cg-floating-typing"><Avatar name={detail?.booking.otherName||'C'} src={detail?.booking.otherAvatar} size="small"/><span><i/><i/><i/></span></div>}
        </div>
        {newMessageCount>0&&<button type="button" className="cg-chat-jump" onClick={()=>goToBottom(true)}>
          ↓ {newMessageCount} new {newMessageCount===1?'message':'messages'}</button>}
        <div className="cg-composer-shell">
          {detail?.secure&&!secureKey&&<div className="cg-security-composer-warning" role="alert">🔒 Secure chat locked on this device. Messages cannot be sent.</div>}
          {reply&&<div className="cg-reply-preview"><div><strong>↪ Replying to {reply.sender_uid===user?.uid?'yourself':detail?.booking.otherName}</strong><span>{short(showText(reply),100)}</span></div><button onClick={()=>setReply(null)}>×</button></div>}
          {picker&&<div className="cg-picker" aria-label={picker==='emoji'?'Emojis':'Stickers'}>{(picker==='emoji'?pickerEmoji:stickerEmoji).map(emoji=>
            <button key={emoji} onClick={()=>{if(picker==='sticker')void send('sticker',emoji);else {setDraft(prev=>prev+emoji);inputRef.current?.focus();setPicker(null);}}}>{emoji}</button>)}</div>}
          {recording?<div className="cg-record-bar"><span className="cg-record-pulse">●</span><strong>Recording {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong><button onClick={()=>stopVoice(true)}>Discard</button><button className="cg-record-send" onClick={()=>stopVoice()}>Send ↗</button></div>
          :<form className={`cg-composer ${composerTyping?'is-typing':''}`} onSubmit={(event:FormEvent)=>{event.preventDefault();void send();}}>
            <button type="button" className="cg-tool-btn" title="Photos, videos and files" aria-label="Choose attachment type" aria-expanded={attachmentMenu}
              onClick={()=>{setAttachmentMenu(value=>!value);setPicker(null);}} disabled={busy||!!detail?.secure&&!secureKey}>＋</button>
            <input ref={photoRef} type="file" multiple className="cg-file-input" accept="image/jpeg,image/png,image/webp,image/gif" onChange={event=>chooseAttachments(event,'image')}/>
            <input ref={videoRef} type="file" multiple className="cg-file-input" accept="video/mp4,video/webm" onChange={event=>chooseAttachments(event,'video')}/>
            <input ref={fileRef} type="file" multiple className="cg-file-input" accept="application/pdf,text/plain,.doc,.docx,.xls,.xlsx" onChange={event=>chooseAttachments(event,'file')}/>
            <div className="cg-compose-field"><textarea ref={inputRef} aria-label="Message" value={draft} rows={1} maxLength={detail?.secure?1200:2000}
              placeholder="Write a message…" onChange={event=>{setDraft(event.target.value);notifyTyping();}}
              onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}}/>
              <button type="button" title="Emojis" aria-label="Emojis and stickers" onClick={()=>setPicker(picker==='emoji'?null:'emoji')}>☺</button>
              <button type="button" title="Stickers" aria-label="Stickers" onClick={()=>setPicker(picker==='sticker'?null:'sticker')}>✿</button>
            </div>
            {draft.trim()?<button type="submit" className="cg-send-btn" disabled={busy||!!detail?.secure&&!secureKey} aria-label="Send message">{busy?'…':'➤'}</button>
              :<button type="button" className="cg-send-btn cg-mic-btn" disabled={busy||!!detail?.secure&&!secureKey} onClick={()=>void startVoice()} aria-label="Record voice note">♩</button>}
          </form>}
          {attachmentMenu&&!recording&&<div className="cg-attachment-menu" role="group" aria-label="Choose attachment">
            <button type="button" onClick={()=>photoRef.current?.click()}><span>▣</span> Photos</button>
            <button type="button" onClick={()=>videoRef.current?.click()}><span>▶</span> Videos</button>
            <button type="button" onClick={()=>fileRef.current?.click()}><span>▤</span> Files</button>
          </div>}
        </div>
        </>}
      </div>
    </div>
    {galleryMessage&&user&&selected&&galleryItems.length>0&&<ChatMediaGallery user={user} bookingId={selected}
      items={galleryItems} initialId={galleryMessage.id} secretKey={secureKey}
      metaFor={id=>decoded[id]?.payload} onClose={()=>setGalleryMessage(null)}
      onReply={id=>{const item=messages.find(message=>message.id===id);if(item){setReply(item);requestAnimationFrame(()=>inputRef.current?.focus());}}}
      onActions={id=>{const item=messages.find(message=>message.id===id);if(item)setActions(item);}}/>}
    {!user&&<div className="cg-msg-auth"><h2>Sign in to chat</h2><button className="button button-dark" onClick={onLogin}>Sign in ↗</button></div>}
    {actions&&selected&&<div className="cg-action-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setActions(null);}}>
      <div className="cg-action-sheet" role="dialog" aria-label="Message actions">
        <div className="cg-sheet-drag"/>
        <div className="cg-q-sheet-heading"><strong>{actions.sender_uid===user?.uid?'Your message':detail?.booking.otherName||'Message'}</strong><span>{time(actions.created_at)}</span></div>
        <div className="cg-sheet-preview">{short(showText(actions)||((actions.upload_id&&actions.kind==='image')?'Photo':actions.upload_id?'Attachment':'Message'),95)}</div>
        <div className="cg-reaction-options" aria-label="React to message">{pickerEmoji.map(emoji=><button key={emoji} title={'React '+emoji} aria-label={'React '+emoji} onClick={()=>void react(actions,emoji)}>{emoji}</button>)}</div>
        <div className="cg-action-grid">
          <button onClick={()=>{setReply(actions);setActions(null);inputRef.current?.focus();}}>↪ <span>Reply</span></button>
          {(actions.kind==='text'||actions.kind==='sticker')&&<button onClick={()=>void copy(actions)}>▣ <span>Copy</span></button>}
          <button onClick={()=>void pin(actions)}>📌 <span>{actions.pinned_by_uid?'Unpin':'Pin'}</span></button>
          <button onClick={()=>void react(actions,null)}>♡ <span>Remove reaction</span></button>
        </div>
        <button className="cg-sheet-close" onClick={()=>setActions(null)}>Done</button>
      </div>
    </div>}
    {settings&&detail&&<div className="cg-action-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setSettings(false);}}>
      <div className="cg-settings-card" role="dialog" aria-label="Chat settings">
        <div className="cg-settings-top"><h2>Chat settings</h2><button onClick={()=>setSettings(false)}>×</button></div>
        <p>Wallpaper</p><div className="cg-wallpaper-picker">{wallpapers.map(wallpaper=><button key={wallpaper}
          className={`cg-wallpaper-choice cg-wallpaper-${wallpaper} ${detail.preferences.wallpaper===wallpaper?'selected':''}`}
          onClick={()=>void saveSettings(wallpaper,!!detail.preferences.muted)}>{wallpaper}</button>)}</div>
        <button className="cg-mute-option" onClick={()=>void saveSettings(detail.preferences.wallpaper,!detail.preferences.muted)}>
          {detail.preferences.muted?'🔕 Unmute conversation':'🔔 Mute conversation'}</button>
        <div className="cg-secure-settings">
          <strong>{detail.secure?'🔒 Device-encrypted chat':'◈ Standard chat (not end-to-end encrypted)'}</strong>
          {detail.secure?<><p>New messages and files are device-encrypted. Older messages remain unencrypted.</p>
            <small>Your private key stays on this device. Switching or losing the device may prevent access to these messages.</small></>
            :<><p>Both people must first open Messages on their own device.</p>
              <button type="button" disabled={!secureKey||busy} onClick={()=>void enableSecurity()}>
                {secureKey?'Enable encrypted chat ↗':'Waiting for both device keys'}</button></>}
          {securityError&&<small className="cg-security-warning">{securityError}</small>}
        </div>
        <span className="cg-settings-hint">Your wallpaper and mute preference are private to you.</span>
      </div>
    </div>}
    {profile&&detail&&<div className="cg-action-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setProfile(false);}}>
      <div className="cg-settings-card cg-profile-card" role="dialog" aria-label="Chat member profile">
        <button className="cg-profile-close" onClick={()=>setProfile(false)}>×</button>
        <Avatar size="large" name={detail.booking.otherName} src={detail.booking.otherAvatar}/>
        <h2>{detail.booking.otherName}</h2><strong>{detail.booking.otherUsername?'@'+detail.booking.otherUsername:'CampusGigs member'}</strong>
        <p>{[detail.booking.otherCity,detail.booking.otherState].filter(Boolean).join(', ')||'Nigeria'}</p>
        <span>{detail.booking.otherKind==='provider'?'✦ Service provider':'◉ CampusGigs member'}</span>
        {!!detail.booking.otherPublicId&&<button className="button button-dark" onClick={()=>{onProfile(detail.booking.otherPublicId!);setProfile(false);}}>View public profile ↗</button>}
      </div>
    </div>}
    {!!attachments.length&&<ChatAttachmentStudio files={attachments} onCancel={()=>setAttachments([])} onSend={sendAttachments} busy={busy}/>}
  </section>;
}
