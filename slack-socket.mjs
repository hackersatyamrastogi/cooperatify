// Socket Mode client for local dev — receives Slack slash commands + interactions over WSS.
// Requires Node 22+ (native WebSocket) and SLACK_APP_TOKEN.
import { handleSlashCommand, handleBlockActions, handleDirectMessage, handleAppHomeOpened, handleAppMention } from './api/_slack.js';

let ws = null;
let reconnectAttempts = 0;

async function openConnection() {
  const r = await fetch('https://slack.com/api/apps.connections.open', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SLACK_APP_TOKEN}` },
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`apps.connections.open failed: ${data.error}`);
  return data.url;
}

async function connect() {
  if (!process.env.SLACK_APP_TOKEN) return;
  if (!globalThis.WebSocket) {
    console.error('[slack] Node 22+ required for native WebSocket (running ' + process.version + ')');
    return;
  }
  try {
    const url = await openConnection();
    ws = new WebSocket(url);
    ws.addEventListener('open', () => {
      reconnectAttempts = 0;
      console.log('[slack] socket-mode connected');
    });
    ws.addEventListener('message', onMessage);
    ws.addEventListener('close', () => {
      console.log('[slack] socket closed, reconnecting…');
      setTimeout(connect, Math.min(30000, 500 * 2 ** reconnectAttempts++));
    });
    ws.addEventListener('error', (e) => { console.error('[slack] ws error', e?.message || e); });
  } catch (e) {
    console.error('[slack] connect failed:', e.message);
    setTimeout(connect, Math.min(30000, 1000 * 2 ** reconnectAttempts++));
  }
}

async function onMessage(evt) {
  let msg;
  try { msg = JSON.parse(evt.data); } catch { return; }

  if (msg.type === 'hello') return;                       // greeting
  if (msg.type === 'disconnect') { try { ws?.close(); } catch {} return; }

  const { envelope_id, payload, type } = msg;
  if (!envelope_id) return;

  let response = null;
  let ackOnly = false;
  try {
    if (type === 'slash_commands') {
      response = await handleSlashCommand(payload);
    } else if (type === 'interactive' && payload?.type === 'block_actions') {
      response = await handleBlockActions(payload);
    } else if (type === 'events_api') {
      ackOnly = true; // events must be acked immediately, responses sent via Web API
      const event = payload?.event;
      if (event?.type === 'message' && event?.channel_type === 'im') {
        handleDirectMessage(event).catch((e) => console.error('[slack] DM error', e));
      } else if (event?.type === 'app_home_opened') {
        handleAppHomeOpened(event).catch((e) => console.error('[slack] home error', e));
      } else if (event?.type === 'app_mention') {
        handleAppMention(event).catch((e) => console.error('[slack] mention error', e));
      }
    }
  } catch (e) {
    console.error('[slack] handler error', e);
    response = { response_type: 'ephemeral', text: `⚠️ ${e.message}` };
  }
  // Ack — events need a plain ack, commands/interactions can include response payload
  try {
    ws.send(JSON.stringify(ackOnly || !response ? { envelope_id } : { envelope_id, payload: response }));
  } catch (e) { console.error('[slack] ack send failed', e); }
}

export function start() { connect(); }
