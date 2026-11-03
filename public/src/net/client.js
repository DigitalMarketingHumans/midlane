// WebSocket client for the LAN server (lobby + relay).
export class NetClient {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.id = null;
    this.lan = [];
    this.open = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      let ws;
      try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch (e) { reject(e); return; }
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('Could not reach the game server.')), 5000);
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') { this.id = m.id; this.lan = m.lan || []; this.open = true; clearTimeout(timer); resolve(this); }
        const hs = this.handlers.get(m.t);
        if (hs) for (const h of [...hs]) h(m);
        const any = this.handlers.get('*');
        if (any) for (const h of [...any]) h(m);
      };
      ws.onclose = () => {
        this.open = false;
        clearTimeout(timer);
        const hs = this.handlers.get('close');
        if (hs) for (const h of [...hs]) h({ t: 'close' });
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Connection to the game server failed.')); };
    });
  }
  on(t, fn) {
    if (!this.handlers.has(t)) this.handlers.set(t, new Set());
    this.handlers.get(t).add(fn);
    return () => this.handlers.get(t).delete(fn);
  }
  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }
  close() {
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
    this.ws = null; this.open = false;
  }
}
