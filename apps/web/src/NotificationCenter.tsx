import { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, type NotificationInbox, type InboxNotification } from './api';

const emptyInbox:NotificationInbox={notifications:[],unreadCount:0};
function relativeTime(date:string){
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/60000));
  if(minutes<1)return 'Now';if(minutes<60)return `${minutes}m`;
  if(minutes<1440)return `${Math.floor(minutes/60)}h`;
  return `${Math.floor(minutes/1440)}d`;
}

export function NotificationCenter({user,onNavigate}:{user:User|null;onNavigate:(path:string)=>void}){
  const [open,setOpen]=useState(false);
  const [inbox,setInbox]=useState<NotificationInbox>(emptyInbox);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    if(!user){setInbox(emptyInbox);return;}
    try{const data=await apiRequest<NotificationInbox>(user,'/v1/me/notifications');setInbox(data);setError('');}
    catch(err){setError(err instanceof Error?err.message:'Could not load updates');}
  },[user]);
  useEffect(()=>{
    if(!user){setOpen(false);setInbox(emptyInbox);return;}
    void refresh();
    const onVisible=()=>{if(!document.hidden)void refresh();};
    document.addEventListener('visibilitychange',onVisible);
    const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},45_000);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
  },[user,refresh]);
  useEffect(()=>{
    if(!open)return;
    const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('keydown',onEscape);
    return()=>document.removeEventListener('keydown',onEscape);
  },[open]);

  async function openNotification(item:InboxNotification){
    if(!user)return;
    if(!item.is_read){
      try{await apiRequest(user,`/v1/me/notifications/${item.id}/read`,{method:'POST'});
        setInbox(previous=>({unreadCount:Math.max(0,previous.unreadCount-1),notifications:previous.notifications.map(entry=>entry.id===item.id?{...entry,is_read:1}:entry)}));}
      catch{void refresh();}
    }
    setOpen(false);onNavigate(item.target_path);
  }
  async function markAll(){
    if(!user)return;setLoading(true);
    try{await apiRequest(user,'/v1/me/notifications/read-all',{method:'POST'});await refresh();}
    catch(err){setError(err instanceof Error?err.message:'Could not mark updates read');}
    finally{setLoading(false);}
  }

  if(!user)return null;
  return <div className="notification-center">
    <button type="button" className={`notification-bell ${open?'is-open':''}`} aria-label={`Notifications${inbox.unreadCount?`, ${inbox.unreadCount} unread`:''}`} aria-expanded={open} aria-controls="campus-notification-panel" onClick={()=>{setOpen(!open);if(!open)void refresh();}}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{inbox.unreadCount>0&&<strong>{inbox.unreadCount>99?'99+':inbox.unreadCount}</strong>}</button>
    {open&&<><button type="button" className="notification-backdrop" aria-label="Close notifications" onClick={()=>setOpen(false)} />
      <section id="campus-notification-panel" className="notification-panel" aria-label="Your notifications">
        <div className="notification-panel-head"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Updates <small>{inbox.unreadCount?`${inbox.unreadCount} new`:''}</small></h2></div><button className="notification-close" type="button" aria-label="Close" onClick={()=>setOpen(false)}>×</button></div>
        <div className="notification-panel-actions"><button type="button" onClick={()=>void refresh()}>↻ Refresh</button><button type="button" disabled={!inbox.unreadCount||loading} onClick={()=>void markAll()}>✓ Mark all read</button></div>
        {error&&<p className="notification-error" role="alert">{error}</p>}
        <div className="notification-list">{inbox.notifications.length?inbox.notifications.map(item=><button key={item.id} type="button" className={`notification-item ${item.is_read?'':'unread'}`} onClick={()=>void openNotification(item)}><span className="notification-kind" aria-hidden="true">{item.kind==='follow'?'♡':item.kind==='provider_review'?'✦':'◷'}</span><span className="notification-copy"><strong>{item.title}</strong><small>{item.body}</small></span><span className="notification-time">{relativeTime(item.created_at)}{!item.is_read&&<i/>}</span></button>):<div className="notification-empty"><span>✉</span><strong>All caught up.</strong><small>Follows, booking requests and approvals appear here.</small></div>}</div>
      </section></>}
  </div>;
}
