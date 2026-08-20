const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

class WatcherService extends EventEmitter {
  constructor() {
    super();
    this.watcher = null;
    this.currentProjectPath = null;
    this.debounceTimer = null;
    this.isRebuilding = false;
    this.enabled = true;
  }

  startWatching(projectPath, onFileChanged) {
    if (!projectPath || !fs.existsSync(projectPath)) return;

    if (this.currentProjectPath === projectPath && this.watcher) {
      return;
    }

    this.stopWatching();
    this.currentProjectPath = projectPath;

    try {
      this.watcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
        if (!this.enabled || !filename) return;

        // Normalize path separators
        const normFile = filename.replace(/\//g, '\\');

        // Ignore node_modules, build artifacts, git, temp files
        if (
          normFile.includes('node_modules') ||
          normFile.includes('.git') ||
          normFile.includes('android\\build') ||
          normFile.includes('android\\app\\build') ||
          normFile.includes('android\\.gradle') ||
          normFile.includes('ios\\build') ||
          normFile.includes('.temp') ||
          normFile.endsWith('~') ||
          normFile.startsWith('.')
        ) {
          return;
        }

        // Only watch source files
        if (!/\.(jsx?|tsx?|json|css)$/i.test(normFile)) {
          return;
        }

        // Debounce rapid changes (e.g. format on save or multiple file writes)
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(async () => {
          if (this.isRebuilding) return;
          this.isRebuilding = true;

          try {
            if (onFileChanged) {
              await onFileChanged(normFile, projectPath);
            }
          } catch (e) {
            console.error('[Watcher] Rebuild error on change:', e);
          } finally {
            this.isRebuilding = false;
          }
        }, 200);
      });

      console.log(`[Watcher] Đang theo dõi thay đổi mã nguồn tại: ${projectPath}`);
    } catch (err) {
      console.warn(`[Watcher] Could not start recursive watcher on ${projectPath}:`, err.message);
    }
  }

  stopWatching() {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (e) {}
      this.watcher = null;
    }
    clearTimeout(this.debounceTimer);
    this.currentProjectPath = null;
  }

  toggleEnabled(state) {
    this.enabled = state !== undefined ? state : !this.enabled;
    return this.enabled;
  }

  getStatus() {
    return {
      watching: !!this.watcher,
      enabled: this.enabled,
      projectPath: this.currentProjectPath
    };
  }
}

module.exports = new WatcherService();
