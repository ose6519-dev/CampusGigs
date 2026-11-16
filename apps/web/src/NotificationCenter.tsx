import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { apiRequest, type NotificationInbox, type InboxNotification } from './api';

type InboxFilter='all'|'unread'|'archived';
const emptyInbox:NotificationInbox={notifications:[],unreadCount:0,archivedCount:0};
function relativeTime(date:string){
  const minutes=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/60000));
  if(minutes<1)return 'Now';if(minutes<60)return `${minutes}m`;
  if(minutes<1440)return `${Math.floor(minutes/60)}h`;
  return `${Math.floor(minutes/1440)}d`;
}
function notificationIcon(kind:InboxNotification['kind']){
  return kind==='follow'?'♡':kind==='provider_review'?'✦':kind==='booking_requested'?'＋':'✓';
}

export function NotificationCenter({user,onNavigate}:{user:User|null;onNavigate:(path:string)=>void}){
  const [open,setOpen]=useState(false);
  const [filter,setFilter]=useState<InboxFilter>('all');
  const [inbox,setInbox]=useState<NotificationInbox>(emptyInbox);
  const [loading,setLoading]=useState(false);
  const [busyId,setBusyId]=useState('');
  const [error,setError]=useState('');
  const [toast,setToast]=useState<InboxNotification|null>(null);
  const seen=useRef<Set<string>|null>(null);
  const requestNumber=useRef(0);
  const refresh=useCallback(async()=>{
    if(!user){setInbox(emptyInbox);return;}
    const requestId=++requestNumber.current;
    try{
      const active=await apiRequest<NotificationInbox>(user,'/v1/me/notifications');
      const data=filter==='all'?active:await apiRequest<NotificationInbox>(user,`/v1/me/notifications?filter=${filter}`);
      if(requestId!==requestNumber.current)return;
      const newestUnread=active.notifications.filter(item=>!item.is_read);
      if(seen.current!==null){
        const newAlert=newestUnread.find(item=>!seen.current?.has(item.id));
        if(newAlert)setToast(newAlert);
      }
      if(seen.current===null)seen.current=new Set();
      active.notifications.forEach(item=>seen.current?.add(item.id));
      setInbox({...data,unreadCount:active.unreadCount,archivedCount:active.archivedCount});
      setError('');
    }catch(err){if(requestId===requestNumber.current)setError(err instanceof Error?err.message:'Could not load updates');}
  },[user,filter]);
  useEffect(()=>{
    seen.current=null;
    setToast(null);setFilter('all');setOpen(false);setInbox(emptyInbox);
  },[user?.uid]);
  useEffect(()=>{
    if(!user)return;
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
  useEffect(()=>{
    if(!toast)return;
    const timer=window.setTimeout(()=>setToast(null),5500);
    return()=>window.clearTimeout(timer);
  },[toast]);

  async function openNotification(item:InboxNotification){
    if(!user||item.archived_at)return;
    if(!item.is_read){
      try{
        await apiRequest(user,`/v1/me/notifications/${item.id}/read`,{method:'POST'});
        setInbox(previous=>({
          ...previous,unreadCount:Math.max(0,previous.unreadCount-1),
          notifications:previous.notifications.map(entry=>entry.id===item.id?{...entry,is_read:1}:entry),
        }));
      }catch{void refresh();}
    }
    setToast(null);setOpen(false);onNavigate(item.target_path);
  }
  async function archive(item:InboxNotification){
    if(!user||busyId)return;
    setBusyId(item.id);
    try{
      const action=item.archived_at?'restore':'archive';
      await apiRequest(user,`/v1/me/notifications/${item.id}/${action}`,{method:'POST'});
      await refresh();
    }catch(err){setError(err instanceof Error?err.message:'Could not update notification');}
    finally{setBusyId('');}
  }
  async function markAll(){
    if(!user||loading)return;setLoading(true);
    try{await apiRequest(user,'/v1/me/notifications/read-all',{method:'POST'});await refresh();}
    catch(err){setError(err instanceof Error?err.message:'Could not mark updates read');}
    finally{setLoading(false);}
  }

  if(!user)return null;
  return <div className="notification-center">
    <button type="button" className={`notification-bell ${open?'is-open':''}`} aria-label={`Notifications${inbox.unreadCount?`, ${inbox.unreadCount} unread`:''}`} aria-expanded={open} aria-controls="campus-notification-panel" onClick={()=>{setOpen(!open);if(!open)void refresh();}}><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>{inbox.unreadCount>0&&<strong>{inbox.unreadCount>99?'99+':inbox.unreadCount}</strong>}</button>
    {toast&&!open&&<button className="notification-live-toast" type="button" onClick={()=>void openNotification(toast)}><span aria-hidden="true">✦</span><span><strong>{toast.title}</strong><small>{toast.body}</small></span><b aria-hidden="true">↗</b></button>}
    {open&&<><button type="button" className="notification-backdrop" aria-label="Close notifications" onClick={()=>setOpen(false)} />
      <section id="campus-notification-panel" className="notification-panel" aria-label="Your notifications">
        <div className="notification-panel-head"><div><span className="eyebrow">YOUR ACTIVITY</span><h2>Updates <small>{inbox.unreadCount?`${inbox.unreadCount} new`:''}</small></h2></div><button className="notification-close" type="button" aria-label="Close" onClick={()=>setOpen(false)}>×</button></div>
        <div className="notification-tabs" role="group" aria-label="Filter notifications">
          {(['all','unread','archived'] as const).map(tab=><button type="button" key={tab} aria-pressed={filter===tab} className={filter===tab?'selected':''} onClick={()=>setFilter(tab)}>{tab==='all'?'All':tab==='unread'?`Unread ${inbox.unreadCount||''}`:`Archived ${inbox.archivedCount||''}`}</button>)}
        </div>
        <div className="notification-panel-actions"><button type="button" disabled={loading} onClick={()=>void refresh()}>↻ Refresh</button><button type="button" disabled={!inbox.unreadCount||loading} onClick={()=>void markAll()}>✓ Mark all read</button></div>
        {error&&<p className="notification-error" role="alert">{error}</p>}
        <div className="notification-list">{inbox.notifications.length?inbox.notifications.map(item=><div key={item.id} className={`notification-item ${item.is_read?'':'unread'}`}>
          <span className="notification-kind" aria-hidden="true">{notificationIcon(item.kind)}</span>
          <button type="button" className="notification-open" disabled={!!item.archived_at} onClick={()=>void openNotification(item)}><strong>{item.title}</strong><small>{item.body}</small></button>
          <div className="notification-meta"><span className="notification-time">{relativeTime(item.created_at)}{!item.is_read&&!item.archived_at&&<i/>}</span><button type="button" disabled={busyId===item.id} className="notification-archive" aria-label={`${item.archived_at?'Restore':'Archive'}: ${item.title}`} title={item.archived_at?'Restore':'Archive'} onClick={()=>void archive(item)}>{item.archived_at?'↶':'▱'}</button></div>
        </div>):<div className="notification-empty"><span>✉</span><strong>{filter==='archived'?'Archive is empty':filter==='unread'?'All caught up':'No updates yet'}</strong><small>{filter==='archived'?'Archived alerts will appear here.':filter==='unread'?'You have no unread updates.':'Follows, bookings and approvals appear here.'}</small></div>}</div>
      </section></>}
  </div>;
}
