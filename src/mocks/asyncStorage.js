const AsyncStorage = {
  getItem: async (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem: async (key, value) => {
    try {
      window.localStorage.setItem(key, String(value));
    } catch (e) {}
  },
  removeItem: async (key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {}
  },
  clear: async () => {
    try {
      window.localStorage.clear();
    } catch (e) {}
  },
  getAllKeys: async () => {
    try {
      return Object.keys(window.localStorage);
    } catch (e) {
      return [];
    }
  },
  multiGet: async (keys) => {
    return keys.map(k => [k, window.localStorage.getItem(k)]);
  },
  multiSet: async (keyValuePairs) => {
    keyValuePairs.forEach(([k, v]) => window.localStorage.setItem(k, String(v)));
  },
  multiRemove: async (keys) => {
    keys.forEach(k => window.localStorage.removeItem(k));
  }
};

export default AsyncStorage;
