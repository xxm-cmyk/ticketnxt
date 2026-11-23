const fs = require("node:fs");
const path = require("node:path");
const session = require("express-session");

class FileSessionStore extends session.Store {
  constructor(filePath) {
    super();
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try { this.sessions = JSON.parse(fs.readFileSync(filePath, "utf8")); }
    catch { this.sessions = {}; }
    this.prune();
  }
  persist() {
    const temp = this.filePath + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(this.sessions));
    fs.renameSync(temp, this.filePath);
  }
  prune() {
    const now = Date.now();
    for (const [id, value] of Object.entries(this.sessions)) {
      const expires = value?.cookie?.expires ? new Date(value.cookie.expires).getTime() : 0;
      if (expires && expires <= now) delete this.sessions[id];
    }
    this.persist();
  }
  get(id, callback) {
    const value = this.sessions[id];
    if (!value) return callback(null, null);
    const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : 0;
    if (expires && expires <= Date.now()) {
      delete this.sessions[id];
      this.persist();
      return callback(null, null);
    }
    callback(null, JSON.parse(JSON.stringify(value)));
  }
  set(id, value, callback = () => {}) {
    this.sessions[id] = JSON.parse(JSON.stringify(value));
    try { this.persist(); callback(null); } catch (error) { callback(error); }
  }
  touch(id, value, callback = () => {}) {
    if (this.sessions[id]) {
      this.sessions[id].cookie = value.cookie;
      try { this.persist(); callback(null); } catch (error) { callback(error); }
    } else callback(null);
  }
  destroy(id, callback = () => {}) {
    delete this.sessions[id];
    try { this.persist(); callback(null); } catch (error) { callback(error); }
  }
  clear(callback = () => {}) {
    this.sessions = {};
    try { this.persist(); callback(null); } catch (error) { callback(error); }
  }
}
module.exports = FileSessionStore;
