const Clipboard = {
  getString: async () => {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      return '';
    }
  },
  setString: (content) => {
    try {
      navigator.clipboard.writeText(String(content));
    } catch (e) {}
  },
  hasString: async () => {
    try {
      const text = await navigator.clipboard.readText();
      return !!text;
    } catch (e) {
      return false;
    }
  },
  hasURL: async () => false,
  hasNumber: async () => false,
  getImage: async () => '',
  setImage: () => {},
  useClipboard: () => {
    const [data, setData] = React.useState('');
    return [data, (text) => { setData(text); Clipboard.setString(text); }];
  }
};

export default Clipboard;
