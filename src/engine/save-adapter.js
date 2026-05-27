// SaveAdapter — abstraction layer for character/account storage.
//
// Today: local browser only (LocalSaveAdapter).
// Later: when you add a backend, implement ApiSaveAdapter and swap one line
// in main.jsx. Nothing else in the game needs to change.
//
// The interface every adapter must implement:
//   async getAccount(username)         -> { passHash, character } | null
//   async setAccount(username, data)   -> void
//   async deleteAccount(username)      -> void
//   async listAccounts()               -> [username, ...]   (for debug only)
//   async authenticate(username, pw)   -> { ok: bool, account?: {...}, error?: string }
//   async register(username, pw)       -> { ok: bool, error?: string }
//   async saveCharacter(username, c)   -> void
//   async loadCharacter(username)      -> character | null
//
// The "shape" of an account is identical across adapters:
//   { passHash: string, character: Character | null }
//
// Adapters handle their own hashing/auth, so the game code never sees raw passwords.

import { simpleHash } from './helpers.js';

// ---------------- LocalSaveAdapter ----------------
// Stores accounts in browser localStorage. One device = one save world.
// Works offline, no network, no backend needed.
class LocalSaveAdapter {
  constructor() {
    this.prefix = 'kq_acct:';
    this.kind = 'local';
  }

  _key(username) { return this.prefix + username.toLowerCase(); }

  async getAccount(username) {
    if (!username) return null;
    const raw = localStorage.getItem(this._key(username));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  async setAccount(username, data) {
    localStorage.setItem(this._key(username), JSON.stringify(data));
  }

  async deleteAccount(username) {
    localStorage.removeItem(this._key(username));
  }

  async listAccounts() {
    const names = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.prefix)) names.push(k.slice(this.prefix.length));
    }
    return names;
  }

  async authenticate(username, password) {
    if (!username || !password) return { ok: false, error: 'Enter username and password' };
    const acct = await this.getAccount(username);
    if (!acct) return { ok: false, error: 'No account with that name' };
    if (acct.passHash !== simpleHash(password)) return { ok: false, error: 'Wrong password' };
    return { ok: true, account: acct };
  }

  async register(username, password) {
    if (!username || username.length < 3) return { ok: false, error: 'Username must be 3+ characters' };
    if (!password || password.length < 4) return { ok: false, error: 'Password must be 4+ characters' };
    const existing = await this.getAccount(username);
    if (existing) return { ok: false, error: 'Username already taken' };
    await this.setAccount(username, { passHash: simpleHash(password), character: null });
    return { ok: true };
  }

  async saveCharacter(username, character) {
    const acct = await this.getAccount(username);
    if (!acct) return;
    acct.character = character;
    await this.setAccount(username, acct);
  }

  async loadCharacter(username) {
    const acct = await this.getAccount(username);
    return acct?.character || null;
  }

  // Verify a plaintext password against the stored account hash.
  async verifyPassword(username, password) {
    const acct = await this.getAccount(username);
    if (!acct) return false;
    return acct.passHash === simpleHash(password);
  }

  // Delete just the character, keeping the account so the player can re-create.
  async deleteCharacter(username) {
    const acct = await this.getAccount(username);
    if (!acct) return;
    acct.character = null;
    await this.setAccount(username, acct);
  }
}

// ---------------- ApiSaveAdapter (stub) ----------------
// Placeholder for when you spin up a backend (Node/Express, Supabase, Firebase,
// Cloudflare Workers — your choice). When the day comes:
//   1. Stand up a server with these endpoints:
//      POST /auth/register   { username, password }
//      POST /auth/login      { username, password }  ->  { token, account }
//      GET  /character       (auth header)           ->  { character }
//      PUT  /character       { character }           ->  void
//   2. Uncomment the body of these methods and point `BASE_URL` at your server.
//   3. In main.jsx change ONE line: `const adapter = new LocalSaveAdapter()`
//      becomes `const adapter = new ApiSaveAdapter('https://your-server.com')`.
//
// Until then this class exists only so the structure is in place.
class ApiSaveAdapter {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.token = null; // set after login
    this.kind = 'api';
    this.username = null;
  }

  // Future implementation sketch:
  //
  // async authenticate(username, password) {
  //   const r = await fetch(`${this.baseUrl}/auth/login`, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({ username, password }),
  //   });
  //   if (!r.ok) return { ok: false, error: 'Login failed' };
  //   const data = await r.json();
  //   this.token = data.token; this.username = username;
  //   return { ok: true, account: data.account };
  // }
  //
  // async saveCharacter(username, character) {
  //   await fetch(`${this.baseUrl}/character`, {
  //     method: 'PUT',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       'Authorization': `Bearer ${this.token}`,
  //     },
  //     body: JSON.stringify({ character }),
  //   });
  // }
  // ...etc

  async getAccount() { throw new Error('ApiSaveAdapter not implemented yet'); }
  async setAccount() { throw new Error('ApiSaveAdapter not implemented yet'); }
  async deleteAccount() { throw new Error('ApiSaveAdapter not implemented yet'); }
  async listAccounts() { return []; }
  async authenticate() { return { ok: false, error: 'Online mode not enabled' }; }
  async register() { return { ok: false, error: 'Online mode not enabled' }; }
  async saveCharacter() { throw new Error('ApiSaveAdapter not implemented yet'); }
  async loadCharacter() { return null; }
  async verifyPassword() { return false; }
  async deleteCharacter() { throw new Error('ApiSaveAdapter not implemented yet'); }
}

// ---------------- The active adapter ----------------
// THIS IS THE ONE LINE TO CHANGE LATER when you go online.
// Today: local browser storage.
// Tomorrow: new ApiSaveAdapter('https://your-server.com')
export const SaveAdapter = new LocalSaveAdapter();

// Export the classes too so future-you can construct them explicitly if needed.
export { LocalSaveAdapter, ApiSaveAdapter };