// Basic admin panel with simple password protect (password: Timothy)
const ADMIN_PW = 'Timothy';
const POSTS_KEY = 'tj_posts';

function loadPosts(){ return JSON.parse(localStorage.getItem(POSTS_KEY) || '[]') }
function savePosts(p){ localStorage.setItem(POSTS_KEY, JSON.stringify(p)) }

function renderExisting(){
  const list = loadPosts();
  const div = document.getElementById('existing');
  div.innerHTML = '';
  list.slice().reverse().forEach(post=>{
    const el = document.createElement('div');
    el.className = 'post';
    el.innerHTML = `<strong>${escapeHtml(post.title||'')}</strong><div class="post-body">${escapeHtml(post.body||'')}</div>`;
    const del = document.createElement('button'); del.textContent = 'Delete'; del.style.marginTop='8px';
    del.addEventListener('click', ()=>{ if(confirm('Delete post?')){ deletePost(post.id) }});
    el.appendChild(del);
    div.appendChild(el);
  });
}

function deletePost(id){
  const p = loadPosts().filter(x=>x.id!==id);
  savePosts(p); renderExisting();
}

function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

document.getElementById('login').addEventListener('click', ()=>{
  const pw = document.getElementById('pw').value;
  if(pw === ADMIN_PW){ document.getElementById('login-row').style.display='none'; document.getElementById('panel').style.display='block'; renderExisting(); }
  else alert('Wrong password');
});

function genId(){ return 'p_'+Date.now()+'_'+Math.random().toString(36).slice(2,8) }

document.getElementById('savePost').addEventListener('click', ()=>{
  const title = document.getElementById('title').value;
  const body = document.getElementById('body').value;
  const postExpiry = (document.getElementById('postExpiry')||{}).value || '';
  const allowedPosters = ((document.getElementById('allowedPosters')||{}).value || '').split(',').map(s=>s.trim()).filter(Boolean);
  const postClue = (document.getElementById('postClue') && document.getElementById('postClue').value) ? document.getElementById('postClue').value.trim() : '';
  const postClueReveal = !!(document.getElementById('postClueReveal') && document.getElementById('postClueReveal').checked);
  const lockPasscode = (document.getElementById('lockPasscode') && document.getElementById('lockPasscode').value) ? document.getElementById('lockPasscode').value.trim() : '';
  const mediaType = document.getElementById('mediaType').value;
  const media = document.getElementById('media').value;
  const fileInput = document.getElementById('mediaFile');
  const posts = loadPosts();
  // support multiple files up to 100MB each
  function finishCreate(mediaVal, mediaT){
  const post = { id: genId(), title, body, media: mediaVal||'', mediaType: mediaT||mediaType||'', expiry: postExpiry||'', allowedPosters: allowedPosters.length ? allowedPosters : [] };
    posts.push(post); savePosts(posts); renderExisting();
    if(__aws && __aws.readyState===WebSocket.OPEN) __aws.send(JSON.stringify({ type:'update_data', data:{ posts }}));
  }

  if(fileInput && fileInput.files && fileInput.files.length){
    const files = Array.from(fileInput.files);
    let processed = 0;
    files.forEach(f=>{
      if(f.size > 100 * 1024 * 1024){ alert('One file exceeds 100MB. Skipping: '+f.name); processed++; if(processed === files.length){ document.getElementById('title').value=''; document.getElementById('body').value=''; document.getElementById('media').value=''; document.getElementById('mediaType').value=''; alert('Posts saved'); } return; }
      const reader = new FileReader(); reader.onload = function(){
        // attach lock metadata if present
        const mediaVal = reader.result;
      const postObj = { id: genId(), title, body, media: mediaVal||'', mediaType: f.type && f.type.indexOf('video/')===0 ? 'video' : 'image', clue: postClue||'', clueReveal: postClueReveal };
        if(lockPasscode){ try{ // simple hash using SubtleCrypto
            const enc = new TextEncoder();
            window.crypto.subtle.digest('SHA-256', enc.encode(lockPasscode)).then(buf=>{
              const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); postObj.locked = true; postObj.lockHash = hash; posts.push(postObj); savePosts(posts); processed++; if(processed === files.length){ document.getElementById('title').value=''; document.getElementById('body').value=''; document.getElementById('media').value=''; document.getElementById('mediaType').value=''; document.getElementById('lockPasscode').value=''; alert('Posts saved'); } });
          }catch(e){ console.warn('hash failed',e); }
        } else { posts.push(postObj); savePosts(posts); processed++; if(processed === files.length){ document.getElementById('title').value=''; document.getElementById('body').value=''; document.getElementById('media').value=''; document.getElementById('mediaType').value=''; alert('Posts saved'); } }
      };
      reader.readAsDataURL(f);
    });
  } else {
    // single media or none
  const post = { id: genId(), title, body, media: media||'', mediaType: mediaType||'', clue: postClue||'', clueReveal: postClueReveal, expiry: postExpiry||'', allowedPosters: allowedPosters.length ? allowedPosters : [] };
    if(lockPasscode){ try{ const enc = new TextEncoder(); window.crypto.subtle.digest('SHA-256', enc.encode(lockPasscode)).then(buf=>{ const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); post.locked = true; post.lockHash = hash; posts.push(post); savePosts(posts); document.getElementById('title').value=''; document.getElementById('body').value=''; document.getElementById('media').value=''; document.getElementById('mediaType').value=''; document.getElementById('lockPasscode').value=''; alert('Post saved'); }); }catch(e){ console.warn('hash failed', e); posts.push(post); savePosts(posts); alert('Post saved'); }
    } else { posts.push(post); savePosts(posts); document.getElementById('title').value=''; document.getElementById('body').value=''; document.getElementById('media').value=''; document.getElementById('mediaType').value=''; alert('Post saved'); }
  }
});

// Dashboard and memes
function loadFollowers(){ try{ return JSON.parse(localStorage.getItem('tj_followers')||'[]') }catch(e){return[]} }
function loadLoginRecords(){ try{ return JSON.parse(localStorage.getItem('tj_login_records')||'[]') }catch(e){return[]} }
function loadMemes(){ try{ return JSON.parse(localStorage.getItem('tj_memes')||'[]') }catch(e){return[]} }

// Users helpers with migration: ensure role, disabled, canPost fields
function loadUsers(){ try{ const raw = JSON.parse(localStorage.getItem('tj_users')||'[]'); const migrated = raw.map(u=> ({ username: u.username, password: u.password||'', avatar: u.avatar||'', role: u.role||'user', disabled: !!u.disabled, canPost: typeof u.canPost === 'undefined' ? true : !!u.canPost })); localStorage.setItem('tj_users', JSON.stringify(migrated)); return migrated; }catch(e){return[]} }
function saveUsers(arr){ localStorage.setItem('tj_users', JSON.stringify(arr)); }

function renderUserList(){ const users = loadUsers(); const div = document.getElementById('userList'); if(!div) return; div.innerHTML=''; if(!users.length){ div.innerHTML='<div style="color:var(--muted)">No users</div>'; return; } users.forEach(u=>{ const el = document.createElement('div'); el.style.display='flex'; el.style.alignItems='center'; el.style.justifyContent='space-between'; el.style.padding='6px'; el.style.borderBottom='1px dashed rgba(255,255,255,0.03)'; el.innerHTML = `<div><strong>${u.username}</strong> <span style="color:var(--muted);font-size:12px;margin-left:8px">role: ${u.role}</span></div>`; const ctrl = document.createElement('div'); ctrl.style.display='flex'; ctrl.style.gap='6px'; const roleSel = document.createElement('select'); ['user','mod','admin'].forEach(r=>{ const o = document.createElement('option'); o.value=r; o.textContent=r; if(u.role===r) o.selected=true; roleSel.appendChild(o); }); roleSel.addEventListener('change', ()=>{ const arr = loadUsers(); const target = arr.find(x=>x.username===u.username); if(target){ target.role = roleSel.value; saveUsers(arr); renderUserList(); alert('Role updated'); } }); const disableBtn = document.createElement('button'); disableBtn.textContent = u.disabled ? 'Enable' : 'Disable'; disableBtn.addEventListener('click', ()=>{ const arr = loadUsers(); const target = arr.find(x=>x.username===u.username); if(target){ target.disabled = !target.disabled; saveUsers(arr); renderUserList(); alert('User updated'); } }); const canPostChk = document.createElement('label'); canPostChk.style.display='flex'; canPostChk.style.alignItems='center'; const cp = document.createElement('input'); cp.type='checkbox'; cp.checked = !!u.canPost; cp.addEventListener('change', ()=>{ const arr = loadUsers(); const target = arr.find(x=>x.username===u.username); if(target){ target.canPost = !!cp.checked; saveUsers(arr); renderUserList(); alert('Posting permission updated'); } }); canPostChk.appendChild(cp); const cpText = document.createElement('span'); cpText.textContent=' Can Post'; canPostChk.appendChild(cpText);
  ctrl.appendChild(roleSel); ctrl.appendChild(disableBtn); ctrl.appendChild(canPostChk); el.appendChild(ctrl); div.appendChild(el); }); }

document.getElementById('createAdminBtn').addEventListener('click', ()=>{ const un = (document.getElementById('newAdminUsername')||{}).value.trim(); const pw = (document.getElementById('newAdminPassword')||{}).value; if(!un || !pw){ alert('Provide username and password'); return } const users = loadUsers(); if(users.find(u=>u.username===un)){ alert('User already exists'); return } const u = { username: un, password: pw, avatar: '', role: 'admin', disabled: false, canPost: true }; users.push(u); saveUsers(users); renderUserList(); document.getElementById('newAdminUsername').value=''; document.getElementById('newAdminPassword').value=''; alert('Admin account created (stored locally)'); });

// Announcements / notes
function loadNotes(){ try{ return localStorage.getItem('tj_notes')||'' }catch(e){return''} }
function saveNotes(n){ try{ localStorage.setItem('tj_notes', n||''); }catch(e){} }
document.getElementById('saveNotes').addEventListener('click', ()=>{ const t = (document.getElementById('adminNotes')||{}).value || ''; saveNotes(t); alert('Announcement saved'); });
document.getElementById('clearNotes').addEventListener('click', ()=>{ if(confirm('Clear announcement?')){ saveNotes(''); document.getElementById('adminNotes').value=''; alert('Cleared'); } });


function refreshDashboard(){
  const users = JSON.parse(localStorage.getItem('tj_users')||'[]');
  document.getElementById('dashUsers').textContent = users.length;
  document.getElementById('dashFollowers').textContent = loadFollowers().length;
  const reactions = JSON.parse(localStorage.getItem('tj_reactions')||'{}');
  let total = 0; Object.keys(reactions).forEach(pid=>{ Object.keys(reactions[pid]||{}).forEach(em=>{ total += (reactions[pid][em].count||0) }) });
  document.getElementById('dashReactions').textContent = total;
  document.getElementById('dashMemes').textContent = loadMemes().length;
  // comments
  const commentsMap = JSON.parse(localStorage.getItem('tj_comments')||'{}');
  let commentCount = 0; const commentersSet = new Set(); const recent = [];
  Object.keys(commentsMap).forEach(pid=>{ const arr = commentsMap[pid]||[]; commentCount += arr.length; arr.forEach(c=>{ commentersSet.add(c.author); recent.push(c); }); });
  document.getElementById('dashComments').textContent = commentCount;
  const commentersArr = Array.from(commentersSet).slice(0,10);
  document.getElementById('dashCommenters').textContent = commentersArr.length? commentersArr.join(', ') : '-';
  // followers list
  const followers = loadFollowers(); const fdiv = document.getElementById('followersList'); fdiv.innerHTML=''; followers.forEach(fn=>{ const el = document.createElement('div'); el.textContent = fn; fdiv.appendChild(el); });
  // recent comments list (sorted by date desc)
  recent.sort((a,b)=> new Date(b.at) - new Date(a.at));
  const cdiv = document.getElementById('commentsList'); cdiv.innerHTML=''; recent.slice(0,50).forEach(c=>{ const el = document.createElement('div'); el.style.padding='6px'; el.style.borderBottom='1px dashed rgba(255,255,255,0.03)'; el.innerHTML = `<strong>${c.author}</strong> <span style="color:var(--muted);font-size:12px">${new Date(c.at).toLocaleString()}</span><div>${c.text}</div>`; cdiv.appendChild(el); });
  // quiz stats
  try{
    const quiz = loadQuiz(); const subs = JSON.parse(localStorage.getItem('tj_quiz_submissions')||'{}');
    if(quiz && quiz.length){
      let totalRight = 0; let totalWrong = 0; const perQ = quiz.map(q=>{ const arr = (subs[q.id]||[]); const right = arr.filter(x=>x.correct).length; const wrong = arr.length - right; totalRight += right; totalWrong += wrong; return `${escapeHtml(q.question).slice(0,40)}: ✓${right} ✗${wrong}`; });
      document.getElementById('dashQuizStats').textContent = `Total correct: ${totalRight} | Total wrong: ${totalWrong}`;
    } else {
      document.getElementById('dashQuizStats').textContent = 'No quiz data';
    }
  }catch(e){ document.getElementById('dashQuizStats').textContent = 'No quiz data'; }
}

document.getElementById('refreshDash').addEventListener('click', refreshDashboard);
document.getElementById('openLeaderAdmin').addEventListener('click', ()=>{
  try{
    // open the same leaderboard modal used by the main UI if present
    if(window.openLeaderboard) { window.openLeaderboard(); return; }
    // fallback: compute simple top commenters and alert
    const commentsMap = JSON.parse(localStorage.getItem('tj_comments')||'{}'); const counts = {};
    Object.keys(commentsMap).forEach(pid=> (commentsMap[pid]||[]).forEach(c=> counts[c.author] = (counts[c.author]||0)+1));
    const arr = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10).map(x=>`${x[0]}: ${x[1]} comments`);
    alert('Top commenters:\n' + (arr.length ? arr.join('\n') : 'No comments'));
  }catch(e){ alert('Failed to open leaderboard') }
});

document.getElementById('exportAdminData').addEventListener('click', ()=>{
  try{
    const payload = { posts: loadPosts(), reactions: JSON.parse(localStorage.getItem('tj_reactions')||'{}'), comments: JSON.parse(localStorage.getItem('tj_comments')||'{}'), users: JSON.parse(localStorage.getItem('tj_users')||'[]'), clues: JSON.parse(localStorage.getItem('tj_clues_found')||'{}'), unlocked: JSON.parse(localStorage.getItem('tj_unlocked_users')||'{}') };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'tj-lexicore-admin-export.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }catch(e){ alert('Export failed') }
});

// Locked posts management
const UNLOCKED_KEY = 'tj_unlocked_users';
function listLockedPosts(){ const posts = loadPosts().filter(p=>p.locked); const div = document.getElementById('lockedList'); if(!div) return; div.innerHTML=''; if(!posts.length){ div.innerHTML = '<div style="color:var(--muted)">No locked posts</div>'; return; } posts.forEach(p=>{ const el = document.createElement('div'); el.style.padding='8px'; el.style.borderBottom='1px dashed rgba(255,255,255,0.03)'; el.innerHTML = `<strong>${escapeHtml(p.title||'')}</strong><div style="font-size:12px;color:var(--muted)">${escapeHtml(p.body||'')}</div>`; const btnRemove = document.createElement('button'); btnRemove.textContent='Remove Lock'; btnRemove.style.marginRight='6px'; btnRemove.addEventListener('click', ()=>{ if(confirm('Remove lock from post? This will make it public.')){ p.locked = false; delete p.lockHash; const all = loadPosts().map(x=> x.id===p.id ? p : x); savePosts(all); listLockedPosts(); refreshDashboard(); } }); const btnChange = document.createElement('button'); btnChange.textContent='Change Passcode'; btnChange.style.marginRight='6px'; btnChange.addEventListener('click', ()=>{ const np = prompt('Enter new passcode (leave blank to cancel)'); if(np){ try{ const enc = new TextEncoder(); window.crypto.subtle.digest('SHA-256', enc.encode(np)).then(buf=>{ const hash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); p.lockHash = hash; const all = loadPosts().map(x=> x.id===p.id ? p : x); savePosts(all); alert('Passcode updated'); listLockedPosts(); }); }catch(e){ alert('Failed to update passcode'); } } }); const btnDelete = document.createElement('button'); btnDelete.textContent='Delete Post'; btnDelete.style.background='linear-gradient(90deg,#ff4d4f,#d10000)'; btnDelete.addEventListener('click', ()=>{ if(confirm('Delete this post?')){ const remaining = loadPosts().filter(x=>x.id !== p.id); savePosts(remaining); listLockedPosts(); refreshDashboard(); } }); el.appendChild(btnRemove); el.appendChild(btnChange); el.appendChild(btnDelete); div.appendChild(el); }); }

// Trash helpers: store removed posts under tj_deleted_posts for recovery
const TRASH_KEY = 'tj_deleted_posts';
function loadTrash(){ try{ return JSON.parse(localStorage.getItem(TRASH_KEY)||'[]') }catch(e){return[]} }
function saveTrash(arr){ localStorage.setItem(TRASH_KEY, JSON.stringify(arr)); }

function renderTrashList(){ const div = document.getElementById('trashList'); if(!div) return; const trash = loadTrash(); div.innerHTML = ''; if(!trash.length){ div.innerHTML = '<div style="color:var(--muted)">Trash is empty</div>'; return; } trash.slice().reverse().forEach(p=>{ const el = document.createElement('div'); el.style.padding='8px'; el.style.borderBottom='1px dashed rgba(255,255,255,0.03)'; el.innerHTML = `<strong>${escapeHtml(p.title||'')}</strong> <div style="font-size:12px;color:var(--muted)">${escapeHtml(p.body||'')}</div><div style="font-size:12px;color:var(--muted)">Removed: ${new Date(p._removedAt||p.at||Date.now()).toLocaleString()}</div>`; const btnRestore = document.createElement('button'); btnRestore.textContent='Restore'; btnRestore.style.marginRight='6px'; btnRestore.addEventListener('click', ()=>{ const t = loadTrash(); const remaining = t.filter(x=>x.id !== p.id); saveTrash(remaining); const posts = loadPosts(); posts.push(p); savePosts(posts); renderTrashList(); renderExisting(); refreshDashboard(); alert('Post restored'); }); const btnDel = document.createElement('button'); btnDel.textContent='Delete Forever'; btnDel.style.background='linear-gradient(90deg,#ff4d4f,#d10000)'; btnDel.addEventListener('click', ()=>{ if(confirm('Permanently delete this post?')){ const t = loadTrash().filter(x=>x.id !== p.id); saveTrash(t); renderTrashList(); alert('Permanently deleted'); } }); el.appendChild(btnRestore); el.appendChild(btnDel); div.appendChild(el); }); }

document.getElementById('emptyTrashBtn') && document.getElementById('emptyTrashBtn').addEventListener('click', ()=>{ if(confirm('Empty trash permanently? This cannot be undone.')){ saveTrash([]); renderTrashList(); alert('Trash emptied'); } });
document.getElementById('restoreAllTrashBtn') && document.getElementById('restoreAllTrashBtn').addEventListener('click', ()=>{ if(confirm('Restore all items in trash?')){ const trash = loadTrash(); const posts = loadPosts(); trash.forEach(p=> posts.push(p)); savePosts(posts); saveTrash([]); renderTrashList(); renderExisting(); refreshDashboard(); alert('All restored'); } });

// Engagement graph: compute simple daily counts for last N days and render as SVG
function computeEngagementSeries(days = 30){ const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()-days+1); const dayCounts = []; for(let i=0;i<days;i++){ const d = new Date(start.getFullYear(), start.getMonth(), start.getDate()+i); dayCounts.push({ day: d.toISOString().slice(0,10), comments: 0, reactions: 0 }); }
  const comments = loadComments(); Object.keys(comments).forEach(pid=>{ (comments[pid]||[]).forEach(c=>{ const day = (new Date(c.at)).toISOString().slice(0,10); const idx = dayCounts.findIndex(x=>x.day === day); if(idx !== -1) dayCounts[idx].comments++; }); });
  const reactions = JSON.parse(localStorage.getItem('tj_reactions')||'{}'); Object.keys(reactions).forEach(pid=>{ Object.keys(reactions[pid]||{}).forEach(em=>{ const entry = reactions[pid][em]; (entry.users||[]).forEach(u=>{ // we don't have timestamps per reaction; approximate by counting reaction occurrence as present today if post exists - fallback: increment by count on the latest day
      // fall back: add total reaction count evenly to the last day
    }); dayCounts[dayCounts.length-1].reactions += (entry.count||0); }); });
  return dayCounts;
}

function renderEngagementGraph(){ const series = computeEngagementSeries(30); const w = 700; const h = 160; const pad = 24; const maxVal = Math.max(1, ...series.map(s=> Math.max(s.comments, s.reactions) )); let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`; // background
  svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="none"/>`;
  const plotW = w - pad*2; const plotH = h - pad*2; const step = plotW / (series.length-1 || 1);
  // comments polyline (blue)
  const ptsC = series.map((s,i)=> `${pad + i*step},${pad + plotH - (s.comments/maxVal)*plotH}`).join(' ');
  const ptsR = series.map((s,i)=> `${pad + i*step},${pad + plotH - (s.reactions/maxVal)*plotH}`).join(' ');
  svg += `<polyline points="${ptsC}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  svg += `<polyline points="${ptsR}" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  // x labels (every 5 days)
  series.forEach((s,i)=>{ if(i % 5 === 0){ const x = pad + i*step; svg += `<text x="${x}" y="${h-4}" font-size="10" fill="var(--muted)" text-anchor="middle">${s.day.slice(5)}</text>`; } });
  // legend
  svg += `<rect x="${w-pad-160}" y="${pad-6}" width="150" height="28" rx="4" fill="rgba(0,0,0,0.04)"/>`;
  svg += `<text x="${w-pad-150+8}" y="${pad+6}" font-size="12" fill="#3b82f6">● Comments</text>`;
  svg += `<text x="${w-pad-60}" y="${pad+6}" font-size="12" fill="#7c3aed">● Reactions</text>`;
  svg += `</svg>`;
  const el = document.getElementById('engagementGraph'); if(el) el.innerHTML = svg;
}

// initialize trash and graph on admin load
document.addEventListener('DOMContentLoaded', ()=>{ try{ renderTrashList(); renderEngagementGraph(); }catch(e){} });

function listUnlockedUsers(){ const obj = JSON.parse(localStorage.getItem(UNLOCKED_KEY)||'{}'); const div = document.getElementById('unlockedUsers'); if(!div) return; div.innerHTML=''; const keys = Object.keys(obj); if(!keys.length){ div.innerHTML = '<div style="color:var(--muted)">No unlocked users</div>'; return; } keys.forEach(k=>{ const el = document.createElement('div'); el.style.display='flex'; el.style.justifyContent='space-between'; el.style.alignItems='center'; el.style.padding='6px'; el.innerHTML = `<div><strong>${k}</strong> <span style="color:var(--muted);font-size:12px;margin-left:8px">${new Date(obj[k].at).toLocaleString()}</span></div>`; const btn = document.createElement('button'); btn.textContent='Revoke'; btn.addEventListener('click', ()=>{ if(confirm('Revoke unlocked access for '+k+'?')){ const s = JSON.parse(localStorage.getItem(UNLOCKED_KEY)||'{}'); delete s[k]; localStorage.setItem(UNLOCKED_KEY, JSON.stringify(s)); // also update user record
  const users = JSON.parse(localStorage.getItem('tj_users')||'[]'); const u = users.find(x=>x.username===k); if(u){ delete u.unlocked; localStorage.setItem('tj_users', JSON.stringify(users)); }
  listUnlockedUsers(); alert('Revoked'); listLockedPosts(); refreshDashboard(); } }); el.appendChild(btn); div.appendChild(el); }); }

// Initialize locked/unlocked lists at admin load
document.addEventListener('DOMContentLoaded', ()=>{ try{ listLockedPosts(); listUnlockedUsers(); }catch(e){} });

document.addEventListener('DOMContentLoaded', ()=>{ try{ renderUserList(); document.getElementById('adminNotes').value = loadNotes()||''; }catch(e){} });

// WebSocket for admin to broadcast memes or request data updates
let __aws = null;
function initAdminWS(){ try{ __aws = new WebSocket((location.protocol==='https:'?'wss://':'ws://') + location.hostname + ':8080'); }catch(e){return}
  __aws.addEventListener('open', ()=>{ console.log('admin ws open') });
  __aws.addEventListener('message', ev=>{ try{ const msg=JSON.parse(ev.data); if(msg.type==='init'&&msg.data){ if(msg.data.memes) localStorage.setItem('tj_memes', JSON.stringify(msg.data.memes)); if(msg.data.posts) localStorage.setItem('tj_posts', JSON.stringify(msg.data.posts)); refreshDashboard(); } if(msg.type==='data_updated'&&msg.data){ if(msg.data.memes) localStorage.setItem('tj_memes', JSON.stringify(msg.data.memes)); refreshDashboard(); } }catch(e){} });
}

document.getElementById('saveMemeAdmin').addEventListener('click', ()=>{
  const title = document.getElementById('memeTitleAdmin').value; const type=document.getElementById('memeTypeAdmin').value; const url=document.getElementById('memeUrlAdmin').value;
  const fileInput = document.getElementById('memeFileAdmin');
  const memes = loadMemes();
  function finishMeme(urlVal, t){ memes.push({ id: 'm_'+Date.now(), title, type: t||type, url: urlVal }); localStorage.setItem('tj_memes', JSON.stringify(memes)); if(__aws && __aws.readyState===WebSocket.OPEN) __aws.send(JSON.stringify({ type:'update_data', data:{ memes }})); }
  if(fileInput && fileInput.files && fileInput.files.length){ const files = Array.from(fileInput.files); let processed = 0; files.forEach(f=>{ if(f.size > 100 * 1024 * 1024){ alert('File too large (over 100MB): '+f.name); processed++; if(processed === files.length){ document.getElementById('memeTitleAdmin').value=''; document.getElementById('memeUrlAdmin').value=''; alert('Memes processed'); refreshDashboard(); } return; } const reader = new FileReader(); reader.onload = function(){ finishMeme(reader.result, f.type && f.type.indexOf('video/')===0 ? 'video' : 'image'); processed++; if(processed === files.length){ document.getElementById('memeTitleAdmin').value=''; document.getElementById('memeUrlAdmin').value=''; alert('Memes processed'); refreshDashboard(); } }; reader.readAsDataURL(f); }); }
  else { finishMeme(url, type); document.getElementById('memeTitleAdmin').value=''; document.getElementById('memeUrlAdmin').value=''; alert('Meme saved and broadcast'); refreshDashboard(); }
});

// try connect
(function(){ if(window && 'WebSocket' in window) initAdminWS(); refreshDashboard(); })();

// Poll storage: admin creates polls stored under tj_polls
const POLL_KEY = 'tj_polls';
function loadPolls(){ try{ return JSON.parse(localStorage.getItem(POLL_KEY)||'[]') }catch(e){return[]} }
function savePolls(p){ localStorage.setItem(POLL_KEY, JSON.stringify(p)); if(__aws && __aws.readyState===WebSocket.OPEN) __aws.send(JSON.stringify({ type:'update_polls', polls: p })); }

function renderPollList(){ const div = document.getElementById('pollList'); if(!div) return; const polls = loadPolls(); div.innerHTML=''; if(!polls.length) { div.innerHTML='<div style="color:var(--muted)">No polls</div>'; return; } polls.slice().reverse().forEach(p=>{ const el = document.createElement('div'); el.style.padding='8px'; el.style.borderBottom='1px dashed rgba(255,255,255,0.03)'; el.innerHTML = `<strong>${escapeHtml(p.title)}</strong> <div style="color:var(--muted);font-size:13px">Options: ${p.options.join(', ')}</div><div style="margin-top:6px">Active: ${p.active ? 'Yes' : 'No'}</div>`; const btnToggle = document.createElement('button'); btnToggle.textContent = p.active ? 'Deactivate' : 'Activate'; btnToggle.style.marginRight='6px'; btnToggle.addEventListener('click', ()=>{ p.active = !p.active; savePolls(loadPolls().map(x=> x.id===p.id ? p : x)); renderPollList(); }); const btnDelete = document.createElement('button'); btnDelete.textContent='Delete'; btnDelete.style.background='linear-gradient(90deg,#ff4d4f,#d10000)'; btnDelete.addEventListener('click', ()=>{ if(confirm('Delete poll?')){ const remaining = loadPolls().filter(x=>x.id !== p.id); savePolls(remaining); renderPollList(); } }); el.appendChild(btnToggle); el.appendChild(btnDelete); div.appendChild(el); }); }

document.getElementById('savePoll').addEventListener('click', ()=>{
  const title = (document.getElementById('pollTitle')||{}).value || '';
  const opts = ((document.getElementById('pollOptions')||{}).value || '').split(',').map(s=>s.trim()).filter(Boolean);
  const active = !!(document.getElementById('pollActive') && document.getElementById('pollActive').checked);
  if(!title || opts.length < 2){ alert('Provide a title and at least two options'); return }
  const polls = loadPolls(); const poll = { id: 'poll_'+Date.now(), title, options: opts, active, createdAt: new Date().toISOString() };
  polls.push(poll); savePolls(polls); renderPollList(); document.getElementById('pollTitle').value=''; document.getElementById('pollOptions').value=''; document.getElementById('pollActive').checked=false; alert('Poll saved and broadcast');
});

document.addEventListener('DOMContentLoaded', ()=>{ try{ renderPollList(); }catch(e){} });

// Meme battle storage: tj_battle { id, memes: [ids], active: bool, votes: { memeId: [usernames] } }
const BATTLE_KEY = 'tj_battle';
function loadBattle(){ try{ return JSON.parse(localStorage.getItem(BATTLE_KEY)||'null') }catch(e){return null} }
function saveBattle(b){ localStorage.setItem(BATTLE_KEY, JSON.stringify(b)); if(__aws && __aws.readyState===WebSocket.OPEN) __aws.send(JSON.stringify({ type:'update_data', data:{ battle: b } })); }

document.getElementById('startBattle').addEventListener('click', ()=>{
  const ids = (document.getElementById('battleMemeIds').value||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(ids.length < 2){ alert('Select at least two memes'); return }
  const b = { id: 'b_'+Date.now(), memes: ids, active: true, votes: {} };
  ids.forEach(i=> b.votes[i] = []);
  saveBattle(b);
  document.getElementById('battleStatus').textContent = 'Active battle: '+b.id;
  alert('Battle started');
});

document.getElementById('endBattle').addEventListener('click', ()=>{
  const b = loadBattle(); if(!b || !b.active){ alert('No active battle'); return }
  b.active = false; saveBattle(b); document.getElementById('battleStatus').textContent = 'No active battle'; alert('Battle ended');
});

// optional: require password in URL hash for quick access
(function(){ if(location.hash === '#admin:'+ADMIN_PW){ document.getElementById('pw').value = ADMIN_PW; document.getElementById('login').click(); } })();

// Quiz management
const QUIZ_KEY = 'tj_quiz';
function loadQuiz(){ try{ return JSON.parse(localStorage.getItem(QUIZ_KEY)||'[]') }catch(e){return[]} }
function saveQuiz(q){ localStorage.setItem(QUIZ_KEY, JSON.stringify(q)); if(__aws && __aws.readyState===WebSocket.OPEN) __aws.send(JSON.stringify({ type: 'update_data', data: { quiz: q } })); }

function renderQuizList(){ const list = loadQuiz(); const ul = document.getElementById('quizList'); if(!ul) return; ul.innerHTML=''; list.forEach(q=>{ const li=document.createElement('li'); li.innerHTML = `<strong>${escapeHtml(q.question)}</strong> (Correct: ${q.correct}) <button class="delq">Delete</button>`; li.querySelector('.delq').addEventListener('click', ()=>{ if(confirm('Delete question?')){ const n = loadQuiz().filter(x=>x.id!==q.id); saveQuiz(n); renderQuizList(); } }); ul.appendChild(li); }); }

document.getElementById('addQuizQ').addEventListener('click', ()=>{
  const question = document.getElementById('quizQuestion').value.trim(); const a=document.getElementById('quizOptionA').value.trim(); const b=document.getElementById('quizOptionB').value.trim(); const c=document.getElementById('quizOptionC').value.trim(); const d=document.getElementById('quizOptionD').value.trim(); const correct = document.getElementById('quizCorrect').value;
  if(!question || !a || !b){ alert('Provide question and at least options A and B'); return }
  const q = { id: 'q_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), question, options: [a,b,c||'',d||''], correct };
  const arr = loadQuiz(); arr.push(q); saveQuiz(arr); document.getElementById('quizQuestion').value=''; document.getElementById('quizOptionA').value=''; document.getElementById('quizOptionB').value=''; document.getElementById('quizOptionC').value=''; document.getElementById('quizOptionD').value=''; renderQuizList(); alert('Question added and broadcast');
});

// render initial list
renderQuizList();

// Bulk import handlers
document.getElementById('importBulkQuiz').addEventListener('click', ()=>{
  const text = document.getElementById('bulkQuizInput').value.trim();
  const fileInput = document.getElementById('bulkQuizFile');

  function processArray(arr){
    if(!Array.isArray(arr)){ alert('Invalid format: expected an array'); return }
    const cleaned = [];
    arr.forEach(item=>{
      try{
        const qtxt = (item.question||'').toString().trim();
        const opts = item.options || [];
        const correct = (item.correct||'').toString().trim().toUpperCase();
        if(!qtxt || !opts || opts.length < 2){ return }
        // normalize to 4 options array
        const norm = [opts[0]||'', opts[1]||'', opts[2]||'', opts[3]||''];
        cleaned.push({ id: 'q_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), question: qtxt, options: norm, correct: correct || 'A' });
      }catch(e){}
    });
    if(cleaned.length === 0){ alert('No valid questions found'); return }
    // append to existing
    const existing = loadQuiz(); const merged = existing.concat(cleaned); saveQuiz(merged); renderQuizList(); alert('Imported '+cleaned.length+' questions');
  }

  if(fileInput && fileInput.files && fileInput.files[0]){
    const f = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(){
      try{ const parsed = JSON.parse(reader.result); processArray(parsed); }catch(e){ alert('Failed to parse JSON file'); }
    };
    reader.readAsText(f);
    return;
  }

  if(text){
    try{ const parsed = JSON.parse(text); processArray(parsed); }catch(e){ alert('Invalid JSON input'); }
    return;
  }

  alert('Paste JSON into the textarea or select a .json file to import');
});

// Quick plain-text import: parse blocks of lines
document.getElementById('importQuickQuiz').addEventListener('click', ()=>{
  const text = document.getElementById('quickQuizInput').value || '';
  if(!text.trim()){ alert('Enter questions in the textarea'); return }
  const blocks = text.split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const parsed = [];
  blocks.forEach(b=>{
    const lines = b.split(/\n/).map(l=>l.trim()).filter(Boolean);
    if(lines.length < 3) return; // question + at least two options
    const question = lines[0];
    // find correct line if present
    let correct = 'A';
    const opts = [];
    for(let i=1;i<lines.length;i++){
      const ln = lines[i];
      const m = ln.match(/^Correct\s*[:\-]\s*([A-Da-d])$/i);
      if(m){ correct = m[1].toUpperCase(); continue }
      opts.push(ln);
    }
    // ensure at least 2 options
    if(opts.length < 2) return;
    // normalize to 4
    const norm = [opts[0]||'', opts[1]||'', opts[2]||'', opts[3]||''];
    parsed.push({ id: 'q_'+Date.now()+'_'+Math.random().toString(36).slice(2,6), question, options: norm, correct });
  });
  if(parsed.length === 0){ alert('No valid questions parsed'); return }
  const existing = loadQuiz(); const merged = existing.concat(parsed); saveQuiz(merged); renderQuizList(); alert('Imported '+parsed.length+' questions');
});

document.getElementById('clearQuickQuiz').addEventListener('click', ()=>{ document.getElementById('quickQuizInput').value = ''; });
