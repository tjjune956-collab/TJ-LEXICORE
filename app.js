// Simple frontend-only posts + emoji reactions saved to localStorage
const POSTS_KEY = 'tj_posts';
const REACTIONS_KEY = 'tj_reactions';
const USERS_KEY = 'tj_users';
const CUR_USER_KEY = 'tj_current_user';

function loadPosts(){
  try{
    const raw = localStorage.getItem(POSTS_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){console.error('failed read posts',e); return []}
}
function savePosts(posts){
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

function loadReactions(){
  try{ return JSON.parse(localStorage.getItem(REACTIONS_KEY) || '{}') }catch(e){return {}}
}
function saveReactions(r){ localStorage.setItem(REACTIONS_KEY, JSON.stringify(r)) }
// WebSocket sync (optional): if server available, sync reactions across clients
let __ws = null;
function initWS(){
  try{
    __ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.hostname + ':8080');
  }catch(e){ console.warn('WS init failed', e); return }
  __ws.addEventListener('open', ()=>{ console.log('ws connected'); });
  __ws.addEventListener('message', ev=>{
    try{
      const msg = JSON.parse(ev.data);
      if(msg.type === 'init' && msg.data){
        // init contains full data object
        if(msg.data.reactions) localStorage.setItem(REACTIONS_KEY, JSON.stringify(msg.data.reactions));
        if(msg.data.followers) localStorage.setItem('tj_followers', JSON.stringify(msg.data.followers));
        if(msg.data.login_records) localStorage.setItem('tj_login_records', JSON.stringify(msg.data.login_records));
        if(msg.data.memes) localStorage.setItem('tj_memes', JSON.stringify(msg.data.memes));
        if(msg.data.posts) localStorage.setItem(POSTS_KEY, JSON.stringify(msg.data.posts));
        render();
      }
      if(msg.type === 'reactions_updated' && msg.reactions){ localStorage.setItem(REACTIONS_KEY, JSON.stringify(msg.reactions)); render(); }
      if(msg.type === 'followers_updated' && msg.followers){ localStorage.setItem('tj_followers', JSON.stringify(msg.followers)); }
      if(msg.type === 'logins_updated' && msg.login_records){ localStorage.setItem('tj_login_records', JSON.stringify(msg.login_records)); }
      if(msg.type === 'data_updated' && msg.data){ if(msg.data.posts) localStorage.setItem(POSTS_KEY, JSON.stringify(msg.data.posts)); if(msg.data.memes) localStorage.setItem('tj_memes', JSON.stringify(msg.data.memes)); render(); }
  // poll updates and votes
  if(msg.type === 'update_polls' || msg.type === 'poll_vote'){ try{ handleIncomingPollUpdate(msg); }catch(e){} }
      if(msg.type === 'direct_message' && msg.data){
        // expected: { from, to, text, at }
        try{ const d = msg.data; const from = d.from; const to = d.to; const text = d.text; const at = d.at || new Date().toISOString(); sendDirectMessage(from, to, text); // save locally
          // mark unread for recipient if this client is recipient
          const cur = getCurrentUser(); const me = cur && cur.username ? cur.username : null; if(me === to){ markUnreadForConversation(convoId(from,to));
            // trigger browser notification
            try{ if(Notification && Notification.permission === 'granted'){ new Notification(`New message from ${from}`, { body: text }); } }catch(e){}
          }
        }catch(e){}
      }
  if(msg.type === 'new_comment' && msg.comment){
        // merge incoming comment into local store
        try{
          const c = msg.comment; const all = loadComments(); const arr = all[c.postId] || [];
          // prevent duplicates by id
          if(!arr.find(x=>x.id === c.id)){
            // ensure postId present on comment
            if(!c.postId) c.postId = c.postId || c.post || c.pid || 'unknown';
            arr.push(c);
            all[c.postId] = arr;
            saveComments(all);
            render();
          }
        }catch(e){}
      }
  // chat/typing/presence messages intentionally ignored in simple mode
    }catch(e){ }
  });
  __ws.addEventListener('close', ()=>{ console.log('ws closed') });
}

function sendReactionsToServer(r){
  if(__ws && __ws.readyState === WebSocket.OPEN){ __ws.send(JSON.stringify({ type: 'update_reactions', reactions: r })); }
}

const emojiList = ['👍','❤️','😂','😮','😢','🔥'];
const advancedEmojiList = ['🤩','🎉','💯','👏','😍','🤯','🎈','🔥','😎','🤝','💥','✨'];

function render(){
  let posts = loadPosts();
  // remove expired posts (auto-delete) and enforce allowed-posters
  try{
    const now = Date.now();
    const raw = posts.slice();
    const remaining = [];
    const cur = getCurrentUser(); const uname = cur && cur.username ? cur.username : null;
    const users = loadUsers(); const meRec = uname ? users.find(u=>u.username === uname) : null; const meRole = (meRec && meRec.role) ? meRec.role : 'user';
    raw.forEach(p=>{
      // expiry check: move expired to trash instead of permanent delete
      if(p.expiry){ try{ const ex = new Date(p.expiry).getTime(); if(!isNaN(ex) && ex <= now){ // move to trash
            const t = JSON.parse(localStorage.getItem('tj_deleted_posts')||'[]'); p._removedAt = new Date().toISOString(); t.push(p); localStorage.setItem('tj_deleted_posts', JSON.stringify(t)); return; } }catch(e){} }
      // allowed posters check
      if(p.allowedPosters && Array.isArray(p.allowedPosters) && p.allowedPosters.length){ // admins/mods bypass
        if(!(uname && (meRole === 'admin' || meRole === 'mod' || p.allowedPosters.indexOf(uname)!==-1))){ return; }
      }
      remaining.push(p);
    });
    if(remaining.length !== posts.length){ savePosts(remaining); }
    posts = remaining.slice().sort((a,b)=>{ if(!!a.locked !== !!b.locked) return a.locked ? -1 : 1; return new Date(b.id.split('_')[1]||0) - new Date(a.id.split('_')[1]||0); });
  }catch(e){ posts = posts.slice().sort((a,b)=>{ if(!!a.locked !== !!b.locked) return a.locked ? -1 : 1; return new Date(b.id.split('_')[1]||0) - new Date(a.id.split('_')[1]||0); }); }
  const reactions = loadReactions();
  const container = document.getElementById('posts');
  container.innerHTML = '';
  const tpl = document.getElementById('post-template');

  posts.forEach(post => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.post-title').textContent = post.title || 'Untitled';
    node.querySelector('.post-body').textContent = post.body || '';
    const media = node.querySelector('.post-media');
  if(post.media){
      if(post.mediaType === 'image'){
  const img = document.createElement('img'); img.src = post.media; media.appendChild(img);
  // download/share
  const dl = document.createElement('a'); dl.textContent = 'Download'; dl.style.marginLeft='8px'; dl.href = post.media; dl.download = (post.title || 'image') + '.png'; media.appendChild(dl);
  const sh = document.createElement('button'); sh.textContent = 'Share'; sh.style.marginLeft='6px'; sh.addEventListener('click', async ()=>{ try{ if(navigator.share){ await navigator.share({ title: post.title, text: post.body, url: post.media }); } else { alert('Share not supported on this browser; you can download the file.'); } }catch(e){ alert('Share failed') } }); media.appendChild(sh);
      }else if(post.mediaType === 'video'){
  const v = document.createElement('video'); v.src = post.media; v.controls = true; media.appendChild(v);
  const dlv = document.createElement('a'); dlv.textContent = 'Download'; dlv.style.marginLeft='8px'; dlv.href = post.media; dlv.download = (post.title || 'video') + '.mp4'; media.appendChild(dlv);
  const shv = document.createElement('button'); shv.textContent = 'Share'; shv.style.marginLeft='6px'; shv.addEventListener('click', async ()=>{ try{ if(navigator.share){ await navigator.share({ title: post.title, text: post.body, url: post.media }); } else { alert('Share not supported on this browser; you can download the file.'); } }catch(e){ alert('Share failed') } }); media.appendChild(shv);
      }else if(post.mediaType === 'link'){
        const a = document.createElement('a'); a.href = post.media; a.textContent = post.media; a.target = '_blank'; media.appendChild(a);
      }
    }

    // locked post handling
    if(post.locked){
      const lockDiv = document.createElement('div'); lockDiv.className = 'locked-post';
      const cur = getCurrentUser(); if(!cur || !cur.username){ lockDiv.innerHTML = '<em>This post is locked. Login required to attempt unlock.</em>'; } else { lockDiv.innerHTML = `<div><strong>Locked post</strong> — enter passcode to unlock:</div><input placeholder="Enter passcode" class="lock-input"><button class="attempt-unlock">Unlock</button>`; }
      node.querySelector('.post').insertBefore(lockDiv, node.querySelector('.post').firstChild);
      // wire unlock handler
      setTimeout(()=>{
        const btn = node.querySelector('.attempt-unlock'); if(!btn) return; btn.addEventListener('click', async ()=>{
          const input = node.querySelector('.lock-input'); const val = input && input.value ? input.value.trim() : '';
          if(!val){ alert('Enter passcode'); return }
          const curUser = getCurrentUser(); if(!curUser || !curUser.username){ alert('You must be logged in to unlock'); return }
          const ok = await verifyPasscodeForPost(post.id, val);
          if(ok){ // grant unlocked access
            grantUnlockedToUser(curUser.username);
            // shoutout: create a special post announcing unlock
            const shout = { id: 'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), title: 'Shoutout', body: `${curUser.username} unlocked a secret post!`, media: '', mediaType: '' };
            const all = loadPosts(); // remove locked post
            const remaining = all.filter(x=>x.id !== post.id);
            remaining.push(shout);
            savePosts(remaining);
            alert('Unlocked! You now have access to the secret area. Redirecting...');
            // open secret area
            location.href = 'secret.html';
            render();
          } else { alert('Incorrect passcode'); }
        });
      }, 20);
    }

    // Secret clue hunt UI
    if(post.clue){
      const clueDiv = document.createElement('div'); clueDiv.className = 'post-clue'; clueDiv.style.marginTop='8px';
      const curUser = getCurrentUser(); const uname = curUser && curUser.username ? curUser.username : null;
      if(post.clueReveal){ // show hint publicly
        clueDiv.innerHTML = `<strong>Clue:</strong> ${escapeHtml(post.clue)} `;
      } else {
        clueDiv.innerHTML = `<strong>Clue hidden</strong> — <small>Find it in the post content</small> `;
      }
      // mark found button for logged-in users
      if(uname){ const mf = document.createElement('button'); mf.textContent = isClueFound(uname, post.id) ? 'Found' : 'Mark Found'; mf.style.marginLeft='8px'; mf.addEventListener('click', ()=>{ if(isClueFound(uname, post.id)){ alert('You already marked this clue as found'); return } markClueFound(uname, post.id); mf.textContent = 'Found'; alert('Clue marked found'); }); clueDiv.appendChild(mf); }
      node.querySelector('.post').appendChild(clueDiv);
    }

    const rdiv = node.querySelector('.reactions');
    // base emoji buttons
    emojiList.forEach(e => {
      const btn = document.createElement('button'); btn.className = 'react-btn'; btn.innerHTML = `${e} <span class="react-count"></span>`;
      const entry = (reactions[post.id] && reactions[post.id][e]); const count = entry ? (entry.count || 0) : 0; btn.querySelector('.react-count').textContent = count;
      const uid = getReactiveId(); const reacted = entry && entry.users && entry.users.indexOf(uid) !== -1; if(reacted) btn.classList.add('reacted');
      btn.addEventListener('click', (ev)=>{ btn.classList.add('pop'); setTimeout(()=> btn.classList.remove('pop'), 260); toggleReaction(post.id, e); render(); }); rdiv.appendChild(btn);
    });
    // If current user unlocked, show advanced reactions palette button
    const cur = getCurrentUser(); const unlockedMap = JSON.parse(localStorage.getItem('tj_unlocked_users')||'{}'); const curUserKey = cur && cur.username ? cur.username : null;
    if(curUserKey && unlockedMap[curUserKey]){
      const advBtn = document.createElement('button'); advBtn.className='react-btn advanced-btn'; advBtn.textContent = '✨ More';
      const palette = document.createElement('div'); palette.className = 'advanced-palette'; palette.style.display='none';
      advancedEmojiList.forEach(ae=>{ const b = document.createElement('button'); b.className='adv-emoji'; b.textContent = ae; b.addEventListener('click', ()=>{ animateAdvancedReact(node, ae); toggleReaction(post.id, ae); render(); palette.style.display='none'; }); palette.appendChild(b); });
      advBtn.addEventListener('click', ()=>{ palette.style.display = palette.style.display === 'none' ? 'flex' : 'none'; });
      rdiv.appendChild(advBtn); rdiv.appendChild(palette);
    }

      // Comments section
      const commentsDiv = document.createElement('div'); commentsDiv.className='comments';
      const comments = loadCommentsForPost(post.id);
      comments.forEach(c=>{
        const ce = document.createElement('div'); ce.className='comment';
  const meta = document.createElement('div'); meta.className='meta';
  // attempt to show avatar if available
  const users = loadUsers(); const authorRecord = users.find(u=>u.username === c.author);
  if(authorRecord && authorRecord.avatar){ const av = document.createElement('img'); av.src = authorRecord.avatar; av.style.width='28px'; av.style.height='28px'; av.style.borderRadius='50%'; av.style.verticalAlign='middle'; av.style.marginRight='8px'; meta.appendChild(av); }
  meta.appendChild(document.createTextNode(`${c.author} • ${new Date(c.at).toLocaleString()}`));
        const body = document.createElement('div'); body.textContent = c.text;
        // comment management UI (edit/delete) if current user is author or admin
        const curUser = getCurrentUser(); const isAuthor = curUser && curUser.username && (curUser.username === c.author);
        const isAdmin = (()=>{ try{ const u = getCurrentUser(); return u && u.username === 'admin'; }catch(e){return false} })();
        if(isAuthor || isAdmin){ const tools = document.createElement('div'); tools.className='comment-tools'; tools.style.marginTop='6px'; const edit = document.createElement('button'); edit.textContent='Edit'; edit.style.marginRight='6px'; edit.addEventListener('click', ()=>{ const newText = prompt('Edit comment', c.text); if(newText !== null){ c.text = newText; c.editedAt = new Date().toISOString(); const map = loadComments(); const arr = map[post.id] || []; const idx = arr.findIndex(x=>x.id === c.id); if(idx !== -1){ arr[idx] = c; map[post.id] = arr; saveComments(map); render(); } } }); const del = document.createElement('button'); del.textContent='Delete'; del.style.background='linear-gradient(90deg,#ff4d4f,#d10000)'; del.addEventListener('click', ()=>{ if(confirm('Delete this comment?')){ const map = loadComments(); map[post.id] = (map[post.id]||[]).filter(x=>x.id !== c.id); saveComments(map); render(); } }); tools.appendChild(edit); tools.appendChild(del); ce.appendChild(tools); }
        if(c.audio){ const a = document.createElement('audio'); a.controls = true; a.src = c.audio; ce.appendChild(a); }
        ce.appendChild(meta); ce.appendChild(body); commentsDiv.appendChild(ce);
      });
      // comment form
      const form = document.createElement('div'); form.className='comment-form';
      const input = document.createElement('input'); input.placeholder='Write a comment...';
      const btn = document.createElement('button'); btn.textContent='Comment';
      btn.addEventListener('click', ()=>{
        const text = input.value && input.value.trim(); if(!text) return; const created = addComment(post.id, text); sendCommentToServer(created); input.value=''; render();
      });
      const rec = document.createElement('button'); rec.textContent = '🎤'; rec.title = 'Record voice comment'; rec.addEventListener('click', async ()=>{ rec.disabled = true; const res = await recordVoiceComment(post.id); rec.disabled = false; if(res){ sendCommentToServer(res); render(); } });
      form.appendChild(input); form.appendChild(btn);
      form.appendChild(rec);
      commentsDiv.appendChild(form);
      node.querySelector('.post').appendChild(commentsDiv);

    container.appendChild(node);
  });

  // render active poll (single poll UI area)
  try{
    const polls = JSON.parse(localStorage.getItem('tj_polls')||'[]');
    const active = (polls||[]).find(p=>p.active);
    const pollContainer = document.getElementById('pollArea');
    if(pollContainer){
      if(!active){ pollContainer.innerHTML = '<div style="color:var(--muted)">No active polls</div>'; }
      else {
        const votes = JSON.parse(localStorage.getItem('tj_poll_votes')||'{}');
        const user = getCurrentUser(); const uname = user && user.username ? user.username : getReactiveId();
        const myVote = (votes[active.id]||{}).voters ? (votes[active.id].voters[uname] || null) : null;
        let html = `<h3>${escapeHtml(active.title)}</h3><div>`;
        active.options.forEach(opt=>{ const count = (votes[active.id] && votes[active.id].counts && votes[active.id].counts[opt]) ? votes[active.id].counts[opt] : 0; const disabled = myVote && myVote !== opt ? 'disabled' : ''; const votedClass = myVote === opt ? 'reacted' : ''; html += `<button class="poll-option ${votedClass}" data-opt="${escapeHtml(opt)}" ${disabled}>${escapeHtml(opt)} — ${count}</button>`; });
        html += '</div>';
        if(!myVote) html += '<div style="color:var(--muted);font-size:13px">You may vote once.</div>'; else html += `<div style="color:var(--muted);font-size:13px">You voted for <strong>${escapeHtml(myVote)}</strong></div>`;
        pollContainer.innerHTML = html;
        // wire buttons
        Array.from(pollContainer.querySelectorAll('.poll-option')).forEach(b=>{ b.addEventListener('click', ()=>{ const opt = b.getAttribute('data-opt'); castPollVote(active.id, opt); render(); }); });
      }
    }
  }catch(e){}
}

function castPollVote(pollId, option){
  if(!pollId || !option) return;
  const user = getCurrentUser(); const uname = user && user.username ? user.username : getReactiveId();
  const votes = JSON.parse(localStorage.getItem('tj_poll_votes')||'{}');
  votes[pollId] = votes[pollId] || { counts: {}, voters: {} };
  // prevent duplicate voting: if user already voted, ignore
  if(votes[pollId].voters[uname]){ alert('You already voted on this poll'); return }
  votes[pollId].voters[uname] = option;
  votes[pollId].counts[option] = (votes[pollId].counts[option]||0) + 1;
  localStorage.setItem('tj_poll_votes', JSON.stringify(votes));
  // broadcast via WS
  try{ if(__ws && __ws.readyState === WebSocket.OPEN) __ws.send(JSON.stringify({ type: 'poll_vote', pollId, option, by: uname })); }catch(e){}
  // Inform current user
  try{ if(Notification && Notification.permission === 'granted'){ new Notification('Vote recorded', { body: `You voted for ${option}` }); } }catch(e){}
}

// Handle incoming poll updates from server
function handleIncomingPollUpdate(msg){
  try{
    if(msg.type === 'update_polls' && msg.polls){ localStorage.setItem('tj_polls', JSON.stringify(msg.polls)); render(); notifyUsers('Polls updated', 'A poll was updated by admin'); }
    if(msg.type === 'poll_vote' && msg.pollId){
      // merge incoming vote into local votes if not already present
      const votes = JSON.parse(localStorage.getItem('tj_poll_votes')||'{}');
      votes[msg.pollId] = votes[msg.pollId] || { counts: {}, voters: {} };
      if(!votes[msg.pollId].voters[msg.by]){
        votes[msg.pollId].voters[msg.by] = msg.option;
        votes[msg.pollId].counts[msg.option] = (votes[msg.pollId].counts[msg.option]||0) + 1;
        localStorage.setItem('tj_poll_votes', JSON.stringify(votes));
        render();
        notifyUsers('Poll update', `${msg.by} voted on a poll`);
      }
    }
  }catch(e){}
}

function notifyUsers(title, body){ try{ if(Notification && Notification.permission === 'granted'){ new Notification(title, { body }); } }catch(e){} }

function toggleReaction(postId, emoji){
  const r = loadReactions();
  r[postId] = r[postId] || {};
  // normalize structure: { count: number, users: [ids] }
  if(!r[postId][emoji]) r[postId][emoji] = { count: 0, users: [] };
  const uid = getReactiveId();
  const users = r[postId][emoji].users || [];
  // Enforce single emoji per user per post: remove user from other emoji entries for this post
  Object.keys(r[postId]).forEach(em => {
    if(em === emoji) return;
    const entry = r[postId][em];
    if(entry && entry.users){
      const i = entry.users.indexOf(uid);
      if(i !== -1){ entry.users.splice(i,1); entry.count = Math.max(0,(entry.count||0)-1); }
    }
  });
  const idx = users.indexOf(uid);
  if(idx === -1){
    // add reaction
    users.push(uid);
    r[postId][emoji].count = (r[postId][emoji].count || 0) + 1;
  }else{
    // remove reaction (toggle off)
    users.splice(idx,1);
    r[postId][emoji].count = Math.max(0,(r[postId][emoji].count||0) - 1);
  }
  r[postId][emoji].users = users;
  saveReactions(r);
  // push to server if connected
  sendReactionsToServer(r);
}

function getReactiveId(){
  // Use logged-in username if present, else a persistent client id
  const cur = getCurrentUser();
  if(cur && cur.username) return `u:${cur.username}`;
  let cid = localStorage.getItem('tj_client_id');
  if(!cid){ cid = 'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); localStorage.setItem('tj_client_id', cid); }
  return `c:${cid}`;
}

// Comments (local only)
const COMMENTS_KEY = 'tj_comments';
function loadComments(){ try{ return JSON.parse(localStorage.getItem(COMMENTS_KEY) || '{}') }catch(e){return {}} }
function saveComments(c){ localStorage.setItem(COMMENTS_KEY, JSON.stringify(c)) }
function loadCommentsForPost(postId){ const c = loadComments(); return c[postId] || [] }
function addComment(postId, text){ const all = loadComments(); const user = getCurrentUser(); const author = user && user.username ? user.username : (getReactiveId()); const arr = all[postId] || []; const comment = { id: 'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), postId, author, text, at: new Date().toISOString() }; arr.push(comment); all[postId] = arr; saveComments(all); return comment; }

// Clue hunt helpers: per-user map username -> [postId]
const CLUES_KEY = 'tj_clues_found';
function loadCluesFound(){ try{ return JSON.parse(localStorage.getItem(CLUES_KEY)||'{}') }catch(e){return{}} }
function saveCluesFound(m){ localStorage.setItem(CLUES_KEY, JSON.stringify(m)); }
function isClueFound(username, postId){ const m = loadCluesFound(); return !!(m[username] && m[username].indexOf(postId) !== -1); }
function markClueFound(username, postId){ if(!username || !postId) return; const m = loadCluesFound(); m[username] = m[username] || []; if(m[username].indexOf(postId) === -1) m[username].push(postId); saveCluesFound(m); }

// Voice comments: record short audio and attach as dataURL to comment object
async function recordVoiceComment(postId, maxMs = 15000){
  if(!navigator.mediaDevices || !window.MediaRecorder){ alert('Voice recording not supported in this browser'); return null; }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    const chunks = [];
    mr.ondataavailable = e=> chunks.push(e.data);
    mr.start();
    // stop after maxMs
    await new Promise(res=> setTimeout(()=>{ try{ mr.stop(); }catch(e){}; res(); }, maxMs));
    const blob = new Blob(chunks, { type: 'audio/webm' });
    const reader = new FileReader();
    const dataUrl = await new Promise((res,rej)=>{ reader.onload = ()=> res(reader.result); reader.onerror = rej; reader.readAsDataURL(blob); });
    // create comment with audio
    const all = loadComments(); const user = getCurrentUser(); const author = user && user.username ? user.username : getReactiveId(); const arr = all[postId] || []; const comment = { id: 'c_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), postId, author, text: '', audio: dataUrl, at: new Date().toISOString() }; arr.push(comment); all[postId] = arr; saveComments(all); return comment;
  }catch(e){ alert('Recording failed'); return null }
}

// Broadcast comment to server (server will relay to other clients)
function sendCommentToServer(comment){ if(__ws && __ws.readyState === WebSocket.OPEN){ __ws.send(JSON.stringify({ type: 'new_comment', comment })); } }

// Chat removed: site runs simple comments + reactions stored locally
// Followers utils
function loadFollowers(){ try{ return JSON.parse(localStorage.getItem('tj_followers')||'[]') }catch(e){return[]} }
function saveFollowers(f){ localStorage.setItem('tj_followers', JSON.stringify(f)); if(__ws && __ws.readyState===WebSocket.OPEN) __ws.send(JSON.stringify({ type: 'update_followers', followers: f })); }

function isFollowing(){ const u = getCurrentUser(); if(!u) return false; const f = loadFollowers(); return f.indexOf(u.username) !== -1; }
function follow(){ const u = getCurrentUser(); if(!u){ alert('Please login to follow'); return } const f=loadFollowers(); if(f.indexOf(u.username)===-1){ f.push(u.username); saveFollowers(f); alert('Followed'); updateFollowBtn(); } }
function unfollow(){ const u = getCurrentUser(); if(!u) return; let f=loadFollowers(); f = f.filter(x=>x!==u.username); saveFollowers(f); alert('Unfollowed'); updateFollowBtn(); }
function updateFollowBtn(){ const btn = document.getElementById('followBtn'); if(!btn) return; if(isFollowing()) { btn.textContent='Unfollow'; } else { btn.textContent='Follow'; } }

// If no posts exist, add a sample
(function init(){
  if(!localStorage.getItem(POSTS_KEY)){
    const sample = [{id: 'p1', title:'Welcome to TJ LEXICORE', body:'This is the public feed. Admin can add posts via Admin Panel. Reactions are stored locally.'}];
    savePosts(sample);
  }
  render();
  initAuth();
  // try websocket connection for real-time sync
  if('WebSocket' in window) initWS();
  // register service worker for PWA
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/service-worker.js').then(()=>console.log('sw registered')).catch(()=>{});
  }
})();

function applyTheme(t){
  // simple theme toggles via data-theme on body
  try{
    if(!t || t === 'system'){
      document.body.removeAttribute('data-theme');
      return;
    }
    document.body.setAttribute('data-theme', t);
  }catch(e){}
}

// ---------------- Leaderboard & data sync ----------------
function computeLeaderboards(){
  // top commenters, top likers (reactions), streaks (consecutive days with comments)
  const users = loadUsers(); const allUsers = users.map(u=>u.username);
  const registeredSet = new Set(allUsers);
  const comments = loadComments();
  const reactions = loadReactions();
  // top commenters: count comments per user
  const commentCounts = {};
  Object.keys(comments).forEach(pid => { (comments[pid]||[]).forEach(c=>{ if(registeredSet.has(c.author)) commentCounts[c.author] = (commentCounts[c.author]||0)+1; }); });
  // top likers: count total reactions performed (unique user actions in reactions.users)
  const likeCounts = {};
  Object.keys(reactions).forEach(pid=>{ Object.keys(reactions[pid]).forEach(emoji=>{ const entry = reactions[pid][emoji]; (entry.users||[]).forEach(uid=>{ // uid is u:username or c:clientid
      const uname = uid && uid.startsWith('u:') ? uid.slice(2) : uid;
      if(registeredSet.has(uname)) likeCounts[uname] = (likeCounts[uname]||0)+1;
    }); }); });
  // streaks: compute number of distinct consecutive days with activity (comments) per user
  const streaks = {};
  Object.keys(comments).forEach(pid=>{ (comments[pid]||[]).forEach(c=>{ try{ if(registeredSet.has(c.author)){ const day = (new Date(c.at)).toISOString().slice(0,10); streaks[c.author] = streaks[c.author] || {}; streaks[c.author][day] = true; } }catch(e){} }); });
  const streakScores = {};
  Object.keys(streaks).forEach(u=>{ const days = Object.keys(streaks[u]).sort(); // compute current consecutive days ending today
    // naive: count total unique days as a simple proxy for streaks
    streakScores[u] = days.length;
  });
  // post popularity: highest comment count and highest reaction count
  const postCommentCounts = {};
  Object.keys(comments).forEach(pid=>{ postCommentCounts[pid] = (comments[pid]||[]).length; });
  const postReactionCounts = {};
  Object.keys(reactions).forEach(pid=>{ postReactionCounts[pid] = Object.keys(reactions[pid]||{}).reduce((s,em)=> s + ((reactions[pid][em] && reactions[pid][em].count)||0), 0); });

  return { commentCounts, likeCounts, streakScores, postCommentCounts, postReactionCounts };
}

function openLeaderboard(){
  const modal = document.getElementById('leaderboardModal'); const content = document.getElementById('leaderboardContent'); if(!modal || !content) return; const lb = computeLeaderboards();
  // compute quiz percentages
  try{
    const quiz = loadQuiz(); const subs = loadQuizSubmissions();
    const totalQuestions = (quiz && quiz.length) ? quiz.length : 0;
    const quizScores = {}; // user -> { correct, total }
    const regUsers = loadUsers().map(u=>u.username); const regSet = new Set(regUsers);
    if(totalQuestions > 0){
      Object.keys(subs).forEach(qid => {
        (subs[qid]||[]).forEach(rec => {
          const u = rec.user || 'unknown'; if(!regSet.has(u)) return; quizScores[u] = quizScores[u] || { correct:0, total:0 }; quizScores[u].total += 1; if(rec.correct) quizScores[u].correct += 1;
        });
      });
    }
    // compute percent per user
    const quizPercents = {};
    Object.keys(quizScores).forEach(u=>{ const s = quizScores[u]; quizPercents[u] = totalQuestions > 0 ? Math.round((s.correct / totalQuestions) * 100) : 0; });
    lb.quizPercents = quizPercents;
  }catch(e){ lb.quizPercents = {}; }
  // top commenters
  const topComments = Object.entries(lb.commentCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const topLikers = Object.entries(lb.likeCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const topStreaks = Object.entries(lb.streakScores).sort((a,b)=>b[1]-a[1]).slice(0,10);
  // top posts
  const topPostsByComments = Object.entries(lb.postCommentCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const topPostsByReactions = Object.entries(lb.postReactionCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  let html = '<h4>Top Commenters</h4><ol>' + topComments.map(x=>`<li>${escapeHtml(x[0]||'anon')} — ${x[1]} comments</li>`).join('') + '</ol>';
  html += '<h4>Top Likers</h4><ol>' + topLikers.map(x=>`<li>${escapeHtml(x[0]||'anon')} — ${x[1]} reactions</li>`).join('') + '</ol>';
  html += '<h4>Top Streaks (days with activity)</h4><ol>' + topStreaks.map(x=>`<li>${escapeHtml(x[0]||'anon')} — ${x[1]} days</li>`).join('') + '</ol>';
  html += '<h4>Top Posts by Comments</h4><ol>' + topPostsByComments.map(x=>{ const post = (loadPosts().find(p=>p.id === x[0])||{title:'(deleted)'}); return `<li>${escapeHtml(post.title)} — ${x[1]} comments</li>` }).join('') + '</ol>';
  html += '<h4>Top Posts by Reactions</h4><ol>' + topPostsByReactions.map(x=>{ const post = (loadPosts().find(p=>p.id === x[0])||{title:'(deleted)'}); return `<li>${escapeHtml(post.title)} — ${x[1]} reactions</li>` }).join('') + '</ol>';
  // quiz performers
  try{
    const qp = lb.quizPercents || {};
    const qpEntries = Object.entries(qp).sort((a,b)=>b[1]-a[1]).slice(0,10);
    if(qpEntries.length){
      html += '<h4>Top Quiz Performers (percent correct)</h4><ol>' + qpEntries.map(x=>`<li>${escapeHtml(x[0]||'anon')} — ${x[1]}%</li>`).join('') + '</ol>';
    } else {
      html += '<h4>Top Quiz Performers (percent correct)</h4><div style="color:var(--muted)">No quiz data</div>';
    }
  }catch(e){ html += '<h4>Top Quiz Performers</h4><div style="color:var(--muted)">N/A</div>'; }
  content.innerHTML = html;
  modal.style.display = 'block';
}

function closeLeaderboard(){ const modal = document.getElementById('leaderboardModal'); if(modal) modal.style.display='none'; }

// Export/import data helpers (merge mode)
function exportProgress(){
  const payload = {
    posts: loadPosts(),
    reactions: loadReactions(),
    comments: loadComments(),
    users: loadUsers(),
    clues: loadCluesFound(),
    unlocked: JSON.parse(localStorage.getItem('tj_unlocked_users')||'{}')
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'tj-lexicore-export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function importProgressFile(file){
  const reader = new FileReader(); reader.onload = ()=>{
    try{
      const data = JSON.parse(reader.result);
      // merge posts (avoid id collisions by skipping existing ids)
      const existingPosts = loadPosts(); const existingIds = new Set(existingPosts.map(p=>p.id));
      if(Array.isArray(data.posts)){
        data.posts.forEach(p=>{ if(!existingIds.has(p.id)) existingPosts.push(p); }); savePosts(existingPosts);
      }
      // merge reactions (union)
      const r = loadReactions(); if(data.reactions){ Object.keys(data.reactions).forEach(pid=>{ r[pid] = r[pid] || {}; Object.keys(data.reactions[pid]).forEach(em=>{ r[pid][em] = r[pid][em] || { count:0, users:[] }; const src = data.reactions[pid][em]; (src.users||[]).forEach(u=>{ if(r[pid][em].users.indexOf(u)===-1){ r[pid][em].users.push(u); r[pid][em].count = (r[pid][em].count||0)+1; } }); }); }); saveReactions(r); }
      // merge comments
      const cmap = loadComments(); if(data.comments){ Object.keys(data.comments).forEach(pid=>{ cmap[pid] = cmap[pid] || []; (data.comments[pid]||[]).forEach(comm=>{ if(!cmap[pid].find(x=>x.id === comm.id)) cmap[pid].push(comm); }); }); saveComments(cmap); }
      // merge users
      const us = loadUsers(); const uMap = {}; us.forEach(u=> uMap[u.username] = u); if(data.users){ (data.users||[]).forEach(u=>{ if(!uMap[u.username]){ us.push(u); } }); saveUsers(us); }
      // merge clues
      const clues = loadCluesFound(); if(data.clues){ Object.keys(data.clues).forEach(un=>{ clues[un] = clues[un] || []; data.clues[un].forEach(pid=>{ if(clues[un].indexOf(pid)===-1) clues[un].push(pid); }); }); saveCluesFound(clues); }
      // merge unlocked
      const unl = JSON.parse(localStorage.getItem('tj_unlocked_users')||'{}'); if(data.unlocked){ Object.keys(data.unlocked).forEach(k=>{ unl[k] = data.unlocked[k]; }); localStorage.setItem('tj_unlocked_users', JSON.stringify(unl)); }
      alert('Import complete (merged).');
      render();
    }catch(e){ alert('Import failed: ' + e.message); }
  };
  reader.readAsText(file);
}

function syncToServer(){
  if(__ws && __ws.readyState === WebSocket.OPEN){
    const payload = { type: 'sync_data', data: { posts: loadPosts(), reactions: loadReactions(), comments: loadComments(), clues: loadCluesFound(), unlocked: JSON.parse(localStorage.getItem('tj_unlocked_users')||'{}') } };
    __ws.send(JSON.stringify(payload));
    alert('Data sent to server (if server supports sync)');
  } else { alert('No active server connection'); }
}


// apply theme from settings at startup
try{ applyTheme(loadSettings().theme); }catch(e){}

// PWA install prompt handling
let _deferredInstallEvent = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  _deferredInstallEvent = e;
  const banner = document.getElementById('installBanner'); if(banner) banner.style.display = 'flex';
});
document.addEventListener('DOMContentLoaded', ()=>{
  const installBtn = document.getElementById('installBtn');
  const dismiss = document.getElementById('dismissInstall');
  if(installBtn) installBtn.addEventListener('click', async ()=>{
    if(!_deferredInstallEvent) return; _deferredInstallEvent.prompt(); const choice = await _deferredInstallEvent.userChoice; if(choice && choice.outcome === 'accepted'){ document.getElementById('installBanner').style.display='none'; _deferredInstallEvent = null; } else { document.getElementById('installBanner').style.display='none'; }
  });
  if(dismiss) dismiss.addEventListener('click', ()=>{ document.getElementById('installBanner').style.display='none'; });
  // inbox badge wiring
  try{ const inbox = document.getElementById('inboxBtn'); if(inbox){ inbox.addEventListener('click', ()=>{ location.href='messages.html'; }); } updateInboxBadge(); }catch(e){}
  // notifications request
  // notification request button removed; notifications are now controlled via Settings checkbox
  // anonymous toggle
  try{ const atTop = document.getElementById('anonToggleTop'); if(atTop){ atTop.addEventListener('click', ()=>{ const cur = getCurrentUser(); if(cur) { clearCurrentUser(); alert('You are now browsing anonymously. Some features disabled.'); location.reload(); } else { alert('Already in anonymous mode'); } }); } }catch(e){}
  // donate float wiring
  try{ const df = document.getElementById('donateFloat'); if(df){ df.addEventListener('click', ()=>{ document.getElementById('mpesaModal').style.display='block'; }); } }catch(e){}
  // leaderboards and settings data actions
  try{ const lb = document.getElementById('leaderboardBtn'); if(lb) lb.addEventListener('click', (e)=>{ e.preventDefault(); openLeaderboard(); }); const lclose = document.getElementById('leaderboardClose'); if(lclose) lclose.addEventListener('click', ()=> closeLeaderboard()); }catch(e){}
  try{ const exp = document.getElementById('exportDataBtn'); if(exp) exp.addEventListener('click', ()=> exportProgress()); const impBtn = document.getElementById('importDataBtn'); const impInput = document.getElementById('importDataFile'); if(impBtn && impInput){ impBtn.addEventListener('click', ()=> impInput.click()); impInput.addEventListener('change', ()=>{ const f = impInput.files && impInput.files[0]; if(f) importProgressFile(f); }); } const syncBtn = document.getElementById('syncDataBtn'); if(syncBtn) syncBtn.addEventListener('click', ()=> syncToServer()); }catch(e){}
});

// ---------------- Quiz features (client) ----------------
const QUIZ_KEY = 'tj_quiz';
const QUIZ_ANS_KEY = 'tj_quiz_answers';
function loadQuiz(){ try{ return JSON.parse(localStorage.getItem(QUIZ_KEY)||'[]') }catch(e){return[]} }
function saveQuiz(q){ localStorage.setItem(QUIZ_KEY, JSON.stringify(q)); if(__ws && __ws.readyState===WebSocket.OPEN) __ws.send(JSON.stringify({ type: 'update_data', data: { quiz: q } })); }
function loadQuizAnswers(){ try{ return JSON.parse(localStorage.getItem(QUIZ_ANS_KEY)||'{}') }catch(e){return{}} }
function saveQuizAnswers(a){ localStorage.setItem(QUIZ_ANS_KEY, JSON.stringify(a)); }

// Quiz submissions: records of answers per question for admin stats
const QUIZ_SUB_KEY = 'tj_quiz_submissions';
function loadQuizSubmissions(){ try{ return JSON.parse(localStorage.getItem(QUIZ_SUB_KEY)||'{}') }catch(e){return{}} }
function saveQuizSubmissions(s){ localStorage.setItem(QUIZ_SUB_KEY, JSON.stringify(s)); }
function recordQuizAnswer(qid, username, answer, correct){
  try{
    const subs = loadQuizSubmissions();
    subs[qid] = subs[qid] || [];
    // replace if same user already answered
    const idx = subs[qid].findIndex(x=>x.user === username);
    const rec = { user: username, answer, correct: !!correct, at: new Date().toISOString() };
    if(idx !== -1) subs[qid][idx] = rec; else subs[qid].push(rec);
    saveQuizSubmissions(subs);
  }catch(e){}
}

// User relations (followers/following) and messaging (localStorage)
const REL_KEY = 'tj_user_relations'; // map username -> { followers:[], following:[] }
function loadRelations(){ try{ return JSON.parse(localStorage.getItem(REL_KEY)||'{}') }catch(e){return{}} }
function saveRelations(r){ localStorage.setItem(REL_KEY, JSON.stringify(r)); }
function ensureRelationsFor(un){ const r = loadRelations(); if(!r[un]) r[un] = { followers: [], following: [] }; saveRelations(r); }
function followUser(me, target){ if(!me || !target) return; ensureRelationsFor(me); ensureRelationsFor(target); const r = loadRelations(); if(r[me].following.indexOf(target)===-1) r[me].following.push(target); if(r[target].followers.indexOf(me)===-1) r[target].followers.push(me); saveRelations(r); }
function unfollowUser(me, target){ if(!me || !target) return; const r = loadRelations(); if(r[me]) r[me].following = (r[me].following||[]).filter(x=>x!==target); if(r[target]) r[target].followers = (r[target].followers||[]).filter(x=>x!==me); saveRelations(r); }
function getFollowersOf(un){ const r = loadRelations(); return (r[un] && r[un].followers) ? r[un].followers : []; }
function getFollowingOf(un){ const r = loadRelations(); return (r[un] && r[un].following) ? r[un].following : []; }

// Messages: stored per conversation id (sorted usernames joined)
const MSG_KEY = 'tj_messages';
function loadMessages(){ try{ return JSON.parse(localStorage.getItem(MSG_KEY)||'{}') }catch(e){return{}} }
function saveMessages(m){ localStorage.setItem(MSG_KEY, JSON.stringify(m)); }
function convoId(a,b){ return [a,b].sort().join('::'); }
function sendDirectMessage(from, to, text){ if(!from || !to || !text) return; const m = loadMessages(); const id = convoId(from,to); m[id] = m[id] || []; m[id].push({ from, to, text, at: new Date().toISOString() }); saveMessages(m); }
function loadConversation(a,b){ const m = loadMessages(); return m[convoId(a,b)] || []; }

// Unread messages tracking
const UNREAD_KEY = 'tj_unread_convos';
function loadUnread(){ try{ return JSON.parse(localStorage.getItem(UNREAD_KEY)||'{}') }catch(e){return{}} }
function saveUnread(u){ localStorage.setItem(UNREAD_KEY, JSON.stringify(u)); }
function markUnreadForConversation(cid){ const u = loadUnread(); u[cid] = (u[cid]||0) + 1; saveUnread(u); updateInboxBadge(); }
function clearUnreadForConversation(cid){ const u = loadUnread(); if(u[cid]) delete u[cid]; saveUnread(u); updateInboxBadge(); }
function unreadTotal(){ const u = loadUnread(); return Object.values(u).reduce((s,n)=>s+(n||0),0); }
function updateInboxBadge(){ try{ const el = document.getElementById('inboxBadge'); if(!el) return; const n = unreadTotal(); if(n>0){ el.style.display='inline-block'; el.textContent = n; } else { el.style.display='none'; } }catch(e){}
}

// Broadcast direct message via WS when available
function sendDirectMessageAndBroadcast(from,to,text){ sendDirectMessage(from,to,text); if(__ws && __ws.readyState === WebSocket.OPEN){ __ws.send(JSON.stringify({ type: 'direct_message', data: { from, to, text, at: new Date().toISOString() } })); }
  // mark unread locally for recipient if current client is sender
  const cur = getCurrentUser(); const me = cur && cur.username ? cur.username : null; if(me === to) markUnreadForConversation(convoId(from,to)); }


// quiz page initializer used by quiz.html
function initQuizPage(){
  const questions = loadQuiz();
  const qArea = document.getElementById('questionArea'); if(!qArea) return;
  if(!questions || questions.length === 0){ qArea.innerHTML = '<p>No quiz questions yet. Come back later.</p>'; return; }
  let idx = 0; const answers = loadQuizAnswers();

  function renderQuestion(){ const q = questions[idx]; qArea.innerHTML = `<div class="quiz-q"><h3>Q${idx+1}. ${escapeHtml(q.question)}</h3><div class="quiz-options"></div></div>`; const opts = q.options || []; const optsDiv = qArea.querySelector('.quiz-options'); ['A','B','C','D'].forEach((label,i)=>{ if(!opts[i]) return; const b = document.createElement('button'); b.textContent = `${label}. ${opts[i]}`; b.className='quiz-option'; if(answers[q.id] === label) b.classList.add('selected'); b.addEventListener('click', ()=>{ answers[q.id] = label; saveQuizAnswers(answers); // visual
      Array.from(optsDiv.querySelectorAll('.quiz-option')).forEach(x=>x.classList.remove('selected')); b.classList.add('selected');
      // record user answer for admin stats
      const cur = getCurrentUser(); const uname = cur && cur.username ? cur.username : getReactiveId();
      const isCorrect = (q.correct === label);
      recordQuizAnswer(q.id, uname, label, isCorrect);
    }); optsDiv.appendChild(b); }); document.getElementById('quizResult').textContent=''; }

  document.getElementById('prevQ').addEventListener('click', ()=>{ if(idx>0) idx--; renderQuestion(); });
  document.getElementById('nextQ').addEventListener('click', ()=>{ if(idx<questions.length-1) idx++; renderQuestion(); });
  document.getElementById('submitQuiz').addEventListener('click', ()=>{
    // score
    const a = loadQuizAnswers(); let score = 0; questions.forEach(q=>{ if(a[q.id] && a[q.id] === q.correct) score++; }); document.getElementById('quizResult').textContent = `Score: ${score} / ${questions.length}`;
  // record final answers also by ensuring submissions exist for any unanswered that user may have set
  const cur = getCurrentUser(); const uname = cur && cur.username ? cur.username : getReactiveId();
  questions.forEach(q=>{ const ans = a[q.id] || null; const correct = ans === q.correct; if(ans) recordQuizAnswer(q.id, uname, ans, correct); });
  });
  renderQuestion();
}

// --- Simple client-side auth (localStorage)
function loadUsers(){
  try{ return JSON.parse(localStorage.getItem(USERS_KEY) || '[]') }catch(e){ return [] }
}
function saveUsers(u){ localStorage.setItem(USERS_KEY, JSON.stringify(u)) }
function getCurrentUser(){ try{ const base = JSON.parse(localStorage.getItem(CUR_USER_KEY) || 'null'); if(!base || !base.username) return base; // enrich with user record
  const users = loadUsers(); const rec = users.find(x=>x.username === base.username); if(!rec) return base; // merge, prefer stored record fields
  return Object.assign({}, base, { avatar: rec.avatar||'', role: rec.role||'user', disabled: !!rec.disabled, canPost: typeof rec.canPost === 'undefined' ? true : !!rec.canPost }); }catch(e){ return null } }
function setCurrentUser(u){ localStorage.setItem(CUR_USER_KEY, JSON.stringify(u)) }
function clearCurrentUser(){ localStorage.removeItem(CUR_USER_KEY) }

// Centralized login helper
function loginUser(username, password){ try{
  console.debug('[auth] login attempt for', username);
  const users = loadUsers(); console.debug('[auth] users count', (users||[]).length);
  try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'started', username, usersCount: (users||[]).length, ts: Date.now() })); }catch(e){}
  if(!(users && users.length)){
    try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'no_users', message: 'No users registered', usersCount: 0 })); }catch(e){}
    console.warn('[auth] no users present'); alert('No users found — please register first'); return false;
  }
  const found = users.find(x=>x.username === username);
  if(!found){ try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'no_user', message: 'Username not found', username, usersCount: users.length })); }catch(e){}; console.warn('[auth] username not found', username); alert('Invalid credentials — check username/password.'); return false }
  if(found.password !== password){ try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'bad_password', message: 'Password mismatch', username })); }catch(e){}; console.warn('[auth] password mismatch for', username); alert('Invalid credentials — check username/password.'); return false }
  if(found.disabled){ try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'disabled', message: 'Account disabled', username })); }catch(e){}; console.warn('[auth] disabled account', username); alert('This account is disabled. Contact an admin.'); return false }
  // store minimal current user, enrich occurs via getCurrentUser
  try{ setCurrentUser({ username }); sessionStorage.setItem('welcome_pending', username); sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'logged_in', username, ts: Date.now() })); }catch(e){ console.error('[auth] failed to persist current user', e); try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'storage_error', message: ''+e })); }catch(e){}; alert('Login failed (storage error)'); return false }
  recordLogin(username);
  console.debug('[auth] login successful for', username);
  return true;
}catch(e){ console.warn('login failed', e); try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'exception', error: ''+e })); }catch(ee){}; alert('Login error'); return false }}

function initAuth(){
  const userDisplay = document.getElementById('userDisplay');
  const logoutBtn = document.getElementById('logoutBtn');
  const showLogin = document.getElementById('showLogin');
  const showReg = document.getElementById('showRegister');
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');

  function refreshUI(){
    const u = getCurrentUser();
    if(u){ userDisplay.textContent = `Hello, ${u.username}`; logoutBtn.style.display='inline-block'; showLogin.style.display='none'; showReg.style.display='none'; }
    else { userDisplay.textContent=''; logoutBtn.style.display='none'; showLogin.style.display='inline-block'; showReg.style.display='inline-block'; }
  }

  if(showLogin) showLogin.addEventListener('click', ()=>{ if(loginForm) loginForm.style.display='block'; if(regForm) regForm.style.display='none'; });
  if(showReg) showReg.addEventListener('click', ()=>{ if(regForm) regForm.style.display='block'; if(loginForm) loginForm.style.display='none'; });
  if(logoutBtn) logoutBtn.addEventListener('click', ()=>{ clearCurrentUser(); refreshUI(); alert('Logged out'); });

  const regBtn = document.getElementById('registerSubmit');
  if(regBtn) regBtn.addEventListener('click', ()=>{
    const usernameEl = document.getElementById('regUsername'); const passwordEl = document.getElementById('regPassword'); const avatarInput = document.getElementById('regAvatar');
    const username = usernameEl ? usernameEl.value.trim() : ''; const password = passwordEl ? passwordEl.value : '';
    if(!username || !password){ alert('Enter username and password'); return }
    const users = loadUsers();
    if(users.find(x=>x.username === username)){ alert('Username taken'); return }
    function finishRegister(avatarData){ users.push({ username, password, avatar: avatarData || '' }); saveUsers(users); // do not auto-login; send user to login page with prefilled username
      try{ sessionStorage.setItem('prefill_login_username', username); }catch(e){}
      if(usernameEl) usernameEl.value=''; if(passwordEl) passwordEl.value=''; if(avatarInput) avatarInput.value=''; alert('Registered — please sign in');
      // If in-page login form exists, show it and prefill username instead of redirecting
      try{
        if(loginForm){ loginForm.style.display = 'block'; if(regForm) regForm.style.display = 'none'; const lu = document.getElementById('loginUsername'); if(lu) lu.value = username; const lp = document.getElementById('loginPassword'); if(lp) lp.focus(); } else { location.href = 'login.html'; }
      }catch(e){ try{ location.href = 'login.html'; }catch(_){} }
    }
    if(avatarInput && avatarInput.files && avatarInput.files[0]){ const f = avatarInput.files[0]; const r = new FileReader(); r.onload = function(){ finishRegister(r.result); }; r.readAsDataURL(f); } else { finishRegister(null); }
  });

  const loginBtn = document.getElementById('loginSubmit');
  if(loginBtn) loginBtn.addEventListener('click', ()=>{
  const uel = document.getElementById('loginUsername'); const pel = document.getElementById('loginPassword'); const username = uel ? (uel.value.trim()) : ''; const password = pel ? pel.value : '';
  if(!username || !password){ alert('Enter username and password'); return }
  const ok = loginUser(username, password);
  if(ok){ if(uel) uel.value=''; if(pel) pel.value=''; refreshUI(); // if we're on the main page with forms, hide them instead of redirecting
    try{ if(loginForm){ loginForm.style.display='none'; if(regForm) regForm.style.display='none'; showWelcomeIfPending(); } else { location.href='index.html'; } }catch(e){ location.href='index.html'; }
  }
  });

  refreshUI();
}

// verify a passcode against stored post lockHash
async function verifyPasscodeForPost(postId, passcode){
  try{
    const posts = loadPosts(); const p = posts.find(x=>x.id === postId); if(!p || !p.lockHash) return false;
    const enc = new TextEncoder(); const buf = await window.crypto.subtle.digest('SHA-256', enc.encode(passcode)); const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); return hash === p.lockHash;
  }catch(e){ return false }
}

function grantUnlockedToUser(username){ if(!username) return; const key = 'tj_unlocked_users'; const obj = JSON.parse(localStorage.getItem(key)||'{}'); obj[username] = { at: new Date().toISOString() }; localStorage.setItem(key, JSON.stringify(obj)); // enable advanced reactions in settings for this user
  const users = loadUsers(); const u = users.find(x=>x.username === username); if(u){ u.unlocked = true; saveUsers(users); }
}

function animateAdvancedReact(postNode, emoji){
  try{
    const el = document.createElement('div'); el.className = 'adv-burst'; el.textContent = emoji; el.style.position='absolute'; el.style.left='50%'; el.style.top='10%'; el.style.transform='translateX(-50%)'; el.style.pointerEvents='none'; postNode.querySelector('.post').appendChild(el);
    setTimeout(()=>{ el.classList.add('pop-burst'); },10);
    setTimeout(()=>{ try{ el.remove(); }catch(e){} }, 1600);
  }catch(e){ }
}

// External messages from separate pages (register.html & login.html)
window.addEventListener('external-register', async (ev)=>{
  try{
    const { username, password, avatarInput } = ev.detail || {};
    if(!username || !password) { alert('Enter username and password'); return }
    const users = loadUsers(); if(users.find(x=>x.username === username)){ alert('Username taken'); return }
    function finishRegister(avatarData){ users.push({ username, password, avatar: avatarData || '' }); saveUsers(users); // redirect to login with username prefilled
      try{ sessionStorage.setItem('prefill_login_username', username); sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'external_registered', username })); }catch(e){}
      alert('Registered — please sign in'); try{ location.href = 'login.html'; }catch(e){}
    }
    if(avatarInput && avatarInput.files && avatarInput.files[0]){ const f = avatarInput.files[0]; const r = new FileReader(); r.onload = function(){ finishRegister(r.result); }; r.readAsDataURL(f); } else { finishRegister(null); }
  }catch(e){ console.warn(e); }
});

window.addEventListener('external-login', (ev)=>{
  try{
  const { username, password } = ev.detail || {};
  if(!username || !password){ alert('Enter username and password'); return }
  const ok = loginUser(username, password);
  try{ sessionStorage.setItem('auth_debug', JSON.stringify({ step: 'external_login_attempt', username, ok: !!ok })); }catch(e){}
  if(ok){ alert('Logged in'); try{ location.href = 'index.html'; }catch(e){} }
  }catch(e){ console.warn(e); }
});

// Show a temporary welcome banner on site if welcome_pending exists
function showWelcomeIfPending(){ try{ const w = sessionStorage.getItem('welcome_pending'); if(!w) return; sessionStorage.removeItem('welcome_pending'); const el = document.createElement('div'); el.className = 'welcome-banner'; el.textContent = `Welcome, ${w}!`; el.style.position='fixed'; el.style.left='50%'; el.style.transform='translateX(-50%)'; el.style.top='14px'; el.style.background='linear-gradient(90deg,#7c3aed,#5b21b6)'; el.style.padding='10px 16px'; el.style.borderRadius='10px'; el.style.boxShadow='0 8px 24px rgba(0,0,0,0.4)'; el.style.zIndex = '600'; el.style.color='white'; document.body.appendChild(el); setTimeout(()=>{ try{ el.style.transition='opacity 400ms'; el.style.opacity = '0'; setTimeout(()=> el.remove(), 420); }catch(e){} }, 3000); }catch(e){} }

// Run welcome check after DOM ready
document.addEventListener('DOMContentLoaded', ()=>{ try{ showWelcomeIfPending(); }catch(e){} });

// Settings
const SETTINGS_KEY = 'tj_settings';
function loadSettings(){ try{return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')}catch(e){return{}} }
function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) }

// Search
function applySearchFilter(term){ const q = (term||'').toLowerCase(); const posts = loadPosts(); if(!q){ render(); return } ; const filtered = posts.filter(p => ((p.title||'')+" "+(p.body||'')).toLowerCase().indexOf(q) !== -1); renderFiltered(filtered); }
function renderFiltered(posts){ const reactions = loadReactions(); const container = document.getElementById('posts'); container.innerHTML=''; const tpl = document.getElementById('post-template'); posts.slice().reverse().forEach(post=>{ const node = tpl.content.cloneNode(true); node.querySelector('.post-title').textContent = post.title||'Untitled'; node.querySelector('.post-body').textContent = post.body||''; const media = node.querySelector('.post-media'); if(post.media){ if(post.mediaType==='image'){ const img=document.createElement('img'); img.src=post.media; media.appendChild(img);}else if(post.mediaType==='video'){ const v=document.createElement('video'); v.src=post.media; v.controls=true; media.appendChild(v);}else if(post.mediaType==='link'){ const a=document.createElement('a'); a.href=post.media; a.textContent=post.media; a.target='_blank'; media.appendChild(a);} } const rdiv = node.querySelector('.reactions'); emojiList.forEach(e=>{ const btn=document.createElement('button'); btn.className='react-btn'; btn.innerHTML=`${e} <span class="react-count"></span>`; const entry = (reactions[post.id] && reactions[post.id][e]); const count = entry ? (entry.count||0) : 0; btn.querySelector('.react-count').textContent = count; const uid = getReactiveId(); const reacted = entry && entry.users && entry.users.indexOf(uid)!==-1; if(reacted) btn.classList.add('reacted'); btn.addEventListener('click', ()=>{ if(loadSettings().animate !== false) { btn.classList.add('pop'); setTimeout(()=>btn.classList.remove('pop'),260); } toggleReaction(post.id,e); renderFiltered(posts); }); rdiv.appendChild(btn); }); // comments
    const commentsDiv = document.createElement('div'); commentsDiv.className='comments'; const comments = loadCommentsForPost(post.id); comments.forEach(c=>{ const ce=document.createElement('div'); ce.className='comment'; const meta=document.createElement('div'); meta.className='meta'; meta.textContent = `${c.author} • ${new Date(c.at).toLocaleString()}`; const body=document.createElement('div'); body.textContent = c.text; ce.appendChild(meta); ce.appendChild(body); commentsDiv.appendChild(ce); }); const form=document.createElement('div'); form.className='comment-form'; const input=document.createElement('input'); input.placeholder='Write a comment...'; const btn=document.createElement('button'); btn.textContent='Comment'; btn.addEventListener('click', ()=>{ const text=input.value && input.value.trim(); if(!text) return; const created = addComment(post.id, text); if(loadSettings().sync !== false) sendCommentToServer(created); input.value=''; renderFiltered(posts); }); form.appendChild(input); form.appendChild(btn); commentsDiv.appendChild(form); node.querySelector('.post').appendChild(commentsDiv);
    container.appendChild(node); }); }

// wire search and settings UI
document.addEventListener('DOMContentLoaded', ()=>{
  const search = document.getElementById('searchInput');
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const settingsClose = document.getElementById('settingsClose');
  const settingsSave = document.getElementById('settingsSave');
  const settingAnimate = document.getElementById('setting_animate');
  const settingSync = document.getElementById('setting_sync');
  const settingTheme = document.getElementById('setting_theme');
  const settingNotify = document.getElementById('setting_notify');
  const settingLanguage = document.getElementById('setting_language');
  const settingPrivacy = document.getElementById('setting_privacy');
  const settingLayout = document.getElementById('setting_layout');
  const pwCurrent = document.getElementById('pw_current');
  const pwNew = document.getElementById('pw_new');
  const pwConfirm = document.getElementById('pw_confirm');
  const changePasswordBtn = document.getElementById('changePasswordBtn');

  const s = loadSettings(); settingAnimate.checked = s.animate !== false; settingSync.checked = s.sync !== false;
  // new settings
  settingTheme.value = s.theme || 'system';
  settingNotify.checked = s.notify === true;
  settingLanguage.value = s.language || 'en';
  settingPrivacy.value = s.privacy || 'public';
  settingLayout.value = s.layout || 'list';

  if(search){ search.addEventListener('input', (e)=>{ applySearchFilter(e.target.value) }); }
  if(settingsBtn) settingsBtn.addEventListener('click', ()=>{ settingsModal.style.display='block'; });
  if(settingsClose) settingsClose.addEventListener('click', ()=>{ settingsModal.style.display='none' });
  if(settingsSave) settingsSave.addEventListener('click', async ()=>{ const ns = { animate: !!settingAnimate.checked, sync: !!settingSync.checked, theme: settingTheme.value, notify: !!settingNotify.checked, language: settingLanguage.value, privacy: settingPrivacy.value, layout: settingLayout.value }; saveSettings(ns); // if user enabled notifications, request permission now
    if(ns.notify && 'Notification' in window && Notification.permission !== 'granted'){ try{ const p = await Notification.requestPermission(); if(p === 'granted'){ alert('Notifications enabled'); } else { alert('Notifications not enabled'); } }catch(e){ alert('Notification permission request failed'); } }
    alert('Settings saved'); settingsModal.style.display='none'; if(ns.sync && !__ws) initWS(); if(!ns.sync && __ws){ __ws.close(); __ws = null; } applyTheme(ns.theme); });

  // chat removed in simple mode

  // change password handler (local users stored in tj_users)
  if(changePasswordBtn) changePasswordBtn.addEventListener('click', ()=>{
    const cur = getCurrentUser(); if(!cur || !cur.username){ alert('You must be logged in to change your password'); return }
    const curPw = pwCurrent.value || ''; const newPw = pwNew.value || ''; const confirmPw = pwConfirm.value || '';
    if(!curPw || !newPw){ alert('Enter current and new password'); return }
    if(newPw !== confirmPw){ alert('New password and confirmation do not match'); return }
    const users = loadUsers(); const user = users.find(x=>x.username === cur.username);
    if(!user){ alert('User record not found'); return }
    if(user.password !== curPw){ alert('Current password is incorrect'); return }
    user.password = newPw; saveUsers(users); // update stored password
    pwCurrent.value=''; pwNew.value=''; pwConfirm.value=''; alert('Password updated');
  });

  // populate announcement area if present
  try{ const ann = document.getElementById('announcementArea'); if(ann){ ann.textContent = localStorage.getItem('tj_notes') || ''; } }catch(e){}
});

// M-Pesa donation modal handlers
function loadDonations(){ try{ return JSON.parse(localStorage.getItem('tj_donations')||'[]') }catch(e){return[]} }
function saveDonations(d){ localStorage.setItem('tj_donations', JSON.stringify(d)); if(__ws && __ws.readyState===WebSocket.OPEN) __ws.send(JSON.stringify({ type:'update_data', data:{ donations: d } })); }

document.addEventListener('DOMContentLoaded', ()=>{
  const donateBtn = document.getElementById('donateBtn');
  const modal = document.getElementById('mpesaModal');
  const close = document.getElementById('donationClose');
  const confirm = document.getElementById('donationConfirm');
  if(donateBtn){ donateBtn.addEventListener('click', ()=>{ modal.style.display='block'; }); }
  if(close){ close.addEventListener('click', ()=>{ modal.style.display='none'; }); }
  if(confirm){ confirm.addEventListener('click', ()=>{
    const name = document.getElementById('donorName').value || 'Anonymous';
    const amount = Number(document.getElementById('donationAmount').value) || 0;
    if(amount <= 0){ alert('Enter amount'); return }
    const donations = loadDonations(); const rec = { id: 'd_'+Date.now(), name, amount, at: new Date().toISOString() };
    donations.push(rec); saveDonations(donations);
    alert('Thanks! Donation recorded locally.');
    modal.style.display='none';
  }); }
});

// login records (stored locally and sent to server)
function loadLoginRecords(){ try{ return JSON.parse(localStorage.getItem('tj_login_records')||'[]') }catch(e){return[]} }
function saveLoginRecords(r){ localStorage.setItem('tj_login_records', JSON.stringify(r)); if(__ws && __ws.readyState===WebSocket.OPEN) __ws.send(JSON.stringify({ type: 'update_logins', login_records: r })); }
function recordLogin(username){ const rec = loadLoginRecords(); rec.push({ username, at: new Date().toISOString() }); saveLoginRecords(rec); }

// hook follow button
document.addEventListener('DOMContentLoaded', ()=>{
  const fb = document.getElementById('followBtn');
  if(fb){
    fb.addEventListener('click', ()=>{
      if(isFollowing()) unfollow(); else follow();
      updateFollowBtn();
    });
    updateFollowBtn();
  }
});
