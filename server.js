const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 8080;

function readData(){
  try{ return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')) }catch(e){ return { reactions: {} } }
}
function writeData(d){ fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8') }

const data = readData();
const wss = new WebSocket.Server({ port: PORT });
console.log('WebSocket server listening on', PORT);

function broadcast(msg, exclude){
  const raw = JSON.stringify(msg);
  wss.clients.forEach(c=>{ if(c.readyState === WebSocket.OPEN && c !== exclude) c.send(raw); });
}

wss.on('connection', ws => {
  // send full current data
  ws.send(JSON.stringify({ type: 'init', data }));

  ws.on('message', raw => {
    let msg;
    try{ msg = JSON.parse(raw.toString()) }catch(e){ return }
    // Accept several message types: update_reactions, update_followers, update_logins, update_posts, or generic update_data
    if(msg.type === 'update_reactions' && msg.reactions){
      data.reactions = msg.reactions;
      writeData(data);
      broadcast({ type: 'reactions_updated', reactions: data.reactions }, ws);
    }
    if(msg.type === 'update_followers' && msg.followers){
      data.followers = msg.followers;
      writeData(data);
      broadcast({ type: 'followers_updated', followers: data.followers }, ws);
    }
    if(msg.type === 'update_logins' && msg.login_records){
      data.login_records = msg.login_records;
      writeData(data);
      broadcast({ type: 'logins_updated', login_records: data.login_records }, ws);
    }
    if(msg.type === 'update_data' && msg.data){
      // shallow merge
      Object.assign(data, msg.data);
      writeData(data);
      broadcast({ type: 'data_updated', data }, ws);
    }
    // Relay comments without persisting: clients send 'new_comment' and server broadcasts
    if(msg.type === 'new_comment' && msg.comment){
      broadcast({ type: 'new_comment', comment: msg.comment }, ws);
    }
  });
});

process.on('SIGINT', ()=>{ console.log('shutting down'); wss.close(()=>process.exit(0)); });
