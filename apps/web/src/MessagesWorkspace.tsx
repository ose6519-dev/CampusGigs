import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type TouchEvent } from 'react';
import type { User } from 'firebase/auth';
import {apiRequest,chatMediaBlob,uploadChatMedia} from './api';

type ChatRow={booking_id:string;service_title:string;status:string;other_name:string;other_avatar:string;
  other_city:string;other_state:string;other_username:string;other_public_id:string|null;
  other_kind:string;other_online:number;last_body:string|null;last_kind:string|null;last_at:string|null;unread_count:number};
type ChatDetail={booking:{bookingId:string;serviceTitle:string;status:string;otherName:string;otherAvatar:string;
  otherCity:string;otherState:string;otherUsername:string;otherPublicId:string|null;otherKind:string;otherOnline:number};
  preferences:{wallpaper:string;muted:number};otherReadAt:string|null;otherTyping:boolean};
type Reaction={message_id:string;reactor_uid:string;emoji:string};
type Message={id:string;sender_uid:string;client_id:string;kind:'text'|'image'|'video'|'audio'|'file'|'sticker';
  body:string;upload_id:string|null;reply_to:string|null;reply_body:string|null;reply_sender:string|null;
  pinned_by_uid:string|null;created_at:string;filename:string|null;mime_type:string|null;size_bytes:number|null;reactions:Reaction[]};
type MessagesPage={messages:Message[];hasMore:boolean};
const pickerEmoji=['❤️','😂','👍','🔥','😮','😢','🙌','👏'];
const stickerEmoji=['💛','✨','🎉','🤝','🙏','💪','🥰','✅','🚀','💯'];
const wallpapers=['warm','doodle','gold','night','aurora'];
const time=(date:string|null)=>date?new Date(date).toLocaleTimeString('en-NG',{hour:'numeric',minute:'2-digit'}):'';
const short=(value:string,limit=70)=>value.length>limit?value.slice(0,limit)+'…':value;
function Avatar({name,src,size='normal'}:{name:string;src?:string|null;size?:'normal'|'small'|'large'}){
  return <span className={`cg-chat-avatar ${size}`}>{src?<img src={src} alt="" loading="lazy" referrerPolicy="no-referrer"/>:name.slice(0,1).toUpperCase()}</span>;
}
function Media({user,bookingId,message}:{user:User;bookingId:string;message:Message}){
  const [url,setUrl]=useState('');const [problem,setProblem]=useState(false);
  useEffect(()=>{
    if(!message.upload_id)return;
    let cancelled=false;let resource='';
    chatMediaBlob(user,bookingId,message.upload_id).then(blob=>{
      if(cancelled)return;resource=URL.createObjectURL(blob);setUrl(resource);
    }).catch(()=>{if(!cancelled)setProblem(true);});
    return()=>{cancelled=true;if(resource)URL.revokeObjectURL(resource);};
  },[user,bookingId,message.upload_id]);
  if(problem)return <span className="cg-media-error">Attachment unavailable</span>;
  if(!url)return <span className="cg-media-loading">Loading attachment…</span>;
  if(message.kind==='image')return <a href={url} target="_blank" rel="noreferrer" aria-label="Open image"><img className="cg-chat-image" src={url} alt={message.filename||'Shared photo'} loading="lazy"/></a>;
  if(message.kind==='video')return <video className="cg-chat-video" src={url} controls playsInline preload="metadata"/>;
  if(message.kind==='audio')return <div className="cg-voice-bubble"><span aria-hidden="true">♫</span><audio controls preload="metadata" src={url} aria-label="Voice note"/></div>;
  return <a className="cg-file-bubble" href={url} download={message.filename||'attachment'}><span>▤</span><span>{short(message.filename||'Download file',32)}<small>{message.size_bytes?Math.round(message.size_bytes/1024)+' KB':'File'}</small></span><span>↓</span></a>;
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
  const [picker,setPicker]=useState<'emoji'|'sticker'|null>(null);
  const [settings,setSettings]=useState(false);
  const [profile,setProfile]=useState(false);
  const [recording,setRecording]=useState(false);
  const [seconds,setSeconds]=useState(0);
  const [otherTyping,setOtherTyping]=useState(false);
  const [otherReadAt,setOtherReadAt]=useState<string|null>(null);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const bottomRef=useRef<HTMLDivElement>(null);
  const recorder=useRef<MediaRecorder|null>(null);
  const voiceStream=useRef<MediaStream|null>(null);
  const lastTyped=useRef(0);
  const touchX=useRef<number|null>(null);
  const holdTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const profileTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastMessageId=useRef('');
  const selectedRef=useRef(selected);
  useEffect(()=>{selectedRef.current=selected;},[selected]);
  const refreshChats=useCallback(async()=>{
    if(!user)return;
    try{const page=await apiRequest<{chats:ChatRow[]}>(user,'/v1/me/chats');setChats(page.chats);}
    catch(error){notice(error instanceof Error?error.message:'Could not load conversations');}
    finally{setLoading(false);}
  },[user,notice]);
  useEffect(()=>{void refreshChats();if(!user)return;const timer=setInterval(()=>{if(!document.hidden)void refreshChats();},16000);return()=>clearInterval(timer);},[refreshChats,user]);
  useEffect(()=>{if(initialBookingId)setSelected(initialBookingId);},[initialBookingId]);
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
      const newest=page.messages.at(-1)?.id||'';
      if(newest&&newest!==lastMessageId.current){
        const last=page.messages.at(-1);
        if(last?.sender_uid!==user.uid&&document.visibilityState==='visible'){
          void apiRequest(user,`/v1/chats/${id}/read`,{method:'POST'}).then(refreshChats).catch(()=>{});
        }
        if(!quiet||!lastMessageId.current||last?.sender_uid===user.uid){
          requestAnimationFrame(()=>bottomRef.current?.scrollIntoView({block:'end',behavior:quiet?'smooth':'instant'}));
        }
        lastMessageId.current=newest;
      }
    }catch(error){if(!quiet)notice(error instanceof Error?error.message:'Could not open chat');}
  },[user,refreshChats,notice]);
  useEffect(()=>{
    lastMessageId.current='';setDetail(null);setMessages([]);setReply(null);setPicker(null);setActions(null);
    if(!selected||!user)return;
    void refreshThread(selected);
    const timer=setInterval(()=>{if(!document.hidden)void refreshThread(selected,true);},3500);
    return()=>clearInterval(timer);
  },[selected,user,refreshThread]);
  useEffect(()=>()=>{recorder.current?.state==='recording'&&recorder.current.stop();voiceStream.current?.getTracks().forEach(track=>track.stop());},[]);
  useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(timer);},[recording]);

  function openChat(id:string){
    setSelected(id);window.history.replaceState(null,'',`/messages/${id}`);
  }
  function closeChat(){
    setSelected('');window.history.replaceState(null,'','/messages');
    setSettings(false);setProfile(false);lastMessageId.current='';
  }
  function notifyTyping(){
    if(!user||!selected||Date.now()-lastTyped.current<3000)return;
    lastTyped.current=Date.now();
    void apiRequest(user,`/v1/chats/${selected}/typing`,{method:'POST',body:JSON.stringify({active:true})}).catch(()=>{});
  }
  async function send(kind:'text'|'sticker'|'image'|'video'|'file'|'audio'='text',text=draft,uploadId:string|null=null){
    if(!user||!selected||busy)return;
    if(kind==='text'&&!text.trim())return;
    setBusy(true);
    try{
      await apiRequest(user,`/v1/chats/${selected}/messages`,{
        method:'POST',body:JSON.stringify({clientId:crypto.randomUUID(),kind,text:text.trim(),uploadId,replyTo:reply?.id||null}),
      });
      setDraft('');setReply(null);setPicker(null);
      await refreshThread(selected);
      await refreshChats();
      inputRef.current?.focus();
    }catch(error){notice(error instanceof Error?error.message:'Message could not be sent');}
    finally{setBusy(false);}
  }
  async function attach(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];
    if(!file||!user||!selected)return;
    event.target.value='';
    setBusy(true);
    try{
      const upload=await uploadChatMedia(user,selected,file,file.name);
      await apiRequest(user,`/v1/chats/${selected}/messages`,{method:'POST',
        body:JSON.stringify({clientId:crypto.randomUUID(),kind:upload.kind,text:'',uploadId:upload.id,replyTo:reply?.id||null})});
      setReply(null);await refreshThread(selected);await refreshChats();
    }catch(error){notice(error instanceof Error?error.message:'Attachment failed');}
    finally{setBusy(false);}
  }
  async function startVoice(){
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){notice('Voice recording is unavailable on this device');return;}
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
          const upload=await uploadChatMedia(user,selected,blob,'Voice note');
          await apiRequest(user,`/v1/chats/${selected}/messages`,{method:'POST',
            body:JSON.stringify({clientId:crypto.randomUUID(),kind:'audio',uploadId:upload.id,text:'',replyTo:reply?.id||null})});
          setReply(null);await refreshThread(selected);await refreshChats();
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
    try{await navigator.clipboard.writeText(message.body);setActions(null);notice('Copied');}
    catch{notice('Copy is unavailable on this device');}
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
      const page=await apiRequest<MessagesPage>(user,`/v1/chats/${selected}/messages?before=${messages[0].id}`);
      setMessages(prev=>[...page.messages,...prev]);setHasMore(page.hasMore);
    }catch(error){notice(error instanceof Error?error.message:'Could not load older messages');}
  }
  const visible=chats.filter(item=>[item.other_name,item.other_username,item.service_title,item.other_city,item.other_state]
    .some(value=>value?.toLowerCase().includes(query.toLowerCase())));
  const lastOutgoingRead=messages.filter(m=>m.sender_uid===user?.uid&&otherReadAt&&m.created_at<=otherReadAt).at(-1)?.id;
  const pinned=messages.filter(message=>!!message.pinned_by_uid);
  return <section className="cg-messenger section-wrap" aria-label="CampusGigs Messenger">
    <div className="cg-msg-layout">
      <aside className={`cg-msg-sidebar ${selected?'cg-mobile-hide':''}`}>
        <div className="cg-msg-aside-head"><div><span className="eyebrow">YOUR CONNECTIONS</span><h1>Messages<span>.</span></h1></div><span className="cg-msg-head-symbol">✳</span></div>
        <div className="cg-msg-search"><span>⌕</span><input aria-label="Search conversations" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search people or gigs…"/></div>
        <div className="cg-msg-list" role="list">
          {loading?<p className="cg-msg-empty">Loading conversations…</p>
            :visible.length?visible.map(item=><button key={item.booking_id} role="listitem" type="button"
                className={`cg-thread-item ${selected===item.booking_id?'current':''}`} onClick={()=>openChat(item.booking_id)}>
              <Avatar name={item.other_name} src={item.other_avatar}/>
              <span className="cg-thread-center"><span className="cg-thread-top"><strong>{item.other_name}</strong><small>{time(item.last_at)}</small></span>
                <span className="cg-thread-sub">{item.other_username?'@'+item.other_username+' · ':''}{item.service_title}</span>
                <span className="cg-thread-preview">{item.last_body|| (item.last_kind?'📎 '+item.last_kind:'Say hello 👋')}</span></span>
              {!!item.unread_count&&<span className="cg-chat-unread">{Math.min(99,item.unread_count)}</span>}
            </button>)
            :<div className="cg-msg-empty"><span>✦</span><h2>{query?'No matching chats':'Your conversations start here'}</h2><p>{query?'Try another name or gig':'Request a service to message its provider.'}</p><button onClick={onBack}>Find services ↗</button></div>}
        </div>
        <div className="cg-msg-aside-foot">🔒 &nbsp;Private chats between customers and providers</div>
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
        {!!pinned.length&&<button className="cg-pin-bar" onClick={()=>{const node=document.getElementById('chat-'+pinned.at(-1)?.id);node?.scrollIntoView({block:'center',behavior:'smooth'});}}>📌 {short(pinned.at(-1)?.body||'Pinned attachment',55)}</button>}
        <div className={`cg-chat-scroll cg-wallpaper-${detail?.preferences.wallpaper||'warm'}`} role="log" aria-label="Messages">
          <div className="cg-chat-security">✦ &nbsp;This conversation is private to your booking.</div>
          {hasMore&&<button className="cg-more-messages" onClick={()=>void older()}>↑ Load earlier messages</button>}
          {!messages.length&&<div className="cg-chat-first"><span>💛</span><h3>Say hello!</h3><p>Share what you need, ask questions, or send a voice note.</p></div>}
          {messages.map(message=>{
            const mine=message.sender_uid===user?.uid;
            return <div id={'chat-'+message.id} key={message.id} className={`cg-chat-row ${mine?'mine':'theirs'}`}
              onTouchStart={(event:TouchEvent<HTMLDivElement>)=>{touchX.current=event.touches[0].clientX;holdTimer.current=setTimeout(()=>setActions(message),540);}}
              onTouchMove={event=>{if(touchX.current!==null&&Math.abs(event.touches[0].clientX-touchX.current)>15&&holdTimer.current)clearTimeout(holdTimer.current);}}
              onTouchEnd={event=>{if(holdTimer.current)clearTimeout(holdTimer.current);
                if(touchX.current!==null&&event.changedTouches[0].clientX-touchX.current>68){setReply(message);inputRef.current?.focus();}
                touchX.current=null;}}
              onContextMenu={event=>{event.preventDefault();setActions(message);}}>
              <div className={`cg-chat-bubble ${message.kind==='sticker'?'cg-sticker-bubble':''}`}
                onDoubleClick={()=>{setReply(message);inputRef.current?.focus();}}>
                {message.reply_to&&<div className="cg-quoted"><small>{message.reply_sender===user?.uid?'You':'Reply'}</small><span>{short(message.reply_body||'Attachment',100)}</span></div>}
                {message.upload_id&&user&&<Media user={user} bookingId={selected} message={message}/>}
                {!!message.body&&<span className="cg-message-text">{message.body}</span>}
                <span className="cg-chat-time">{time(message.created_at)} {mine?'✓':''} {message.pinned_by_uid?'📌':''}</span>
              </div>
              {!!message.reactions.length&&<div className="cg-reactions">{message.reactions.map(reaction=><button key={reaction.reactor_uid}
                onClick={()=>void react(message,reaction.emoji)} title={reaction.reactor_uid===user?.uid?'Remove reaction':'React'}>
                {reaction.emoji}</button>)}</div>}
              {message.id===lastOutgoingRead&&<span className="cg-read-avatar" title="Seen"><Avatar size="small" name={detail?.booking.otherName||''} src={detail?.booking.otherAvatar}/></span>}
              <button type="button" className="cg-message-more" aria-label="Message actions" onClick={()=>setActions(message)}>•••</button>
            </div>;
          })}
          {otherTyping&&<div className="cg-floating-typing"><Avatar name={detail?.booking.otherName||'C'} src={detail?.booking.otherAvatar} size="small"/><span><i/><i/><i/></span></div>}
          <div ref={bottomRef}/>
        </div>
        <div className="cg-composer-shell">
          {reply&&<div className="cg-reply-preview"><div><strong>↪ Replying to {reply.sender_uid===user?.uid?'yourself':detail?.booking.otherName}</strong><span>{short(reply.body||'Attachment',100)}</span></div><button onClick={()=>setReply(null)}>×</button></div>}
          {picker&&<div className="cg-picker" aria-label={picker==='emoji'?'Emojis':'Stickers'}>{(picker==='emoji'?pickerEmoji:stickerEmoji).map(emoji=>
            <button key={emoji} onClick={()=>{if(picker==='sticker')void send('sticker',emoji);else {setDraft(prev=>prev+emoji);inputRef.current?.focus();setPicker(null);}}}>{emoji}</button>)}</div>}
          {recording?<div className="cg-record-bar"><span className="cg-record-pulse">●</span><strong>Recording {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</strong><button onClick={()=>stopVoice(true)}>Discard</button><button className="cg-record-send" onClick={()=>stopVoice()}>Send ↗</button></div>
          :<form className="cg-composer" onSubmit={(event:FormEvent)=>{event.preventDefault();void send();}}>
            <button type="button" className="cg-tool-btn" title="Attach photo, video or file" aria-label="Attach file" onClick={()=>fileRef.current?.click()} disabled={busy}>＋</button>
            <input ref={fileRef} type="file" className="cg-file-input" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/webm,audio/ogg,audio/mpeg,audio/mp4,application/pdf,text/plain" onChange={event=>void attach(event)}/>
            <div className="cg-compose-field"><textarea ref={inputRef} aria-label="Message" value={draft} rows={1} maxLength={2000}
              placeholder="Write a message…" onChange={event=>{setDraft(event.target.value);notifyTyping();}}
              onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();}}}/>
              <button type="button" title="Emojis" aria-label="Emojis and stickers" onClick={()=>setPicker(picker==='emoji'?null:'emoji')}>☺</button>
              <button type="button" title="Stickers" aria-label="Stickers" onClick={()=>setPicker(picker==='sticker'?null:'sticker')}>✿</button>
            </div>
            {draft.trim()?<button type="submit" className="cg-send-btn" disabled={busy} aria-label="Send message">{busy?'…':'➤'}</button>
              :<button type="button" className="cg-send-btn cg-mic-btn" disabled={busy} onClick={()=>void startVoice()} aria-label="Record voice note">♩</button>}
          </form>}
        </div>
        </>}
      </div>
    </div>
    {!user&&<div className="cg-msg-auth"><h2>Sign in to chat</h2><button className="button button-dark" onClick={onLogin}>Sign in ↗</button></div>}
    {actions&&selected&&<div className="cg-action-scrim" onMouseDown={event=>{if(event.target===event.currentTarget)setActions(null);}}>
      <div className="cg-action-sheet" role="dialog" aria-label="Message actions">
        <div className="cg-sheet-drag"/>
        <div className="cg-sheet-preview">{short(actions.body||actions.filename||'Attachment',95)}</div>
        <div className="cg-reaction-options">{pickerEmoji.map(emoji=><button key={emoji} onClick={()=>void react(actions,emoji)}>{emoji}</button>)}</div>
        <div className="cg-action-grid">
          <button onClick={()=>{setReply(actions);setActions(null);inputRef.current?.focus();}}>↪ <span>Reply</span></button>
          {!!actions.body&&<button onClick={()=>void copy(actions)}>▣ <span>Copy</span></button>}
          <button onClick={()=>void pin(actions)}>📌 <span>{actions.pinned_by_uid?'Unpin':'Pin'}</span></button>
          <button onClick={()=>void react(actions,null)}>♡ <span>Remove reaction</span></button>
        </div>
        <button className="cg-sheet-close" onClick={()=>setActions(null)}>Close</button>
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
  </section>;
}
