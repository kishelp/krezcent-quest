export const StorageMgr = {
  async getAccount(u) {
    try {
      const r = localStorage.getItem(`kq_acct:${u}`);
      return r ? JSON.parse(r) : null;
    } catch { return null; }
  },
  async setAccount(u, d) {
    try {
      localStorage.setItem(`kq_acct:${u}`, JSON.stringify(d));
      return true;
    } catch { return false; }
  }
};