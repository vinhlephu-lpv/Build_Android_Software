// Universal Safe Mock for native RN modules in Web Simulator
export class BleManager {
  constructor() {}
  startDeviceScan(uuids, options, listener) {}
  stopDeviceScan() {}
  connectToDevice(id) {
    return Promise.resolve({
      discoverAllServicesAndCharacteristics: () => Promise.resolve(),
      monitorCharacteristicForService: () => ({ remove: () => {} }),
      writeCharacteristicWithResponseForService: () => Promise.resolve(),
      writeCharacteristicWithoutResponseForService: () => Promise.resolve(),
      readCharacteristicForService: () => Promise.resolve({ value: '' }),
      cancelConnection: () => Promise.resolve()
    });
  }
  destroy() {}
  onStateChange(listener, emitCurrentState) {
    if (listener) listener('PoweredOn');
    return { remove: () => {} };
  }
}

export const State = { PoweredOn: 'PoweredOn', PoweredOff: 'PoweredOff', Resetting: 'Resetting', Unauthorized: 'Unauthorized', Unsupported: 'Unsupported', Unknown: 'Unknown' };
export class Device {}
export class Service {}
export class Characteristic {}
export const BleErrorCode = {};

export const Orientation = {
  lockToPortrait: () => {
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: 'set_orientation', orientation: 'PORTRAIT' }, '*');
    }
  },
  lockToLandscape: () => {
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: 'set_orientation', orientation: 'LANDSCAPE' }, '*');
    }
  },
  lockToLandscapeLeft: () => {
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: 'set_orientation', orientation: 'LANDSCAPE' }, '*');
    }
  },
  lockToLandscapeRight: () => {
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: 'set_orientation', orientation: 'LANDSCAPE' }, '*');
    }
  },
  unlockAllOrientations: () => {},
  getOrientation: (cb) => cb && cb('LANDSCAPE-LEFT'),
  getSpecificOrientation: (cb) => cb && cb('LANDSCAPE-LEFT'),
  addOrientationListener: () => {},
  removeOrientationListener: () => {},
  addDeviceOrientationListener: () => {},
  removeDeviceOrientationListener: () => {},
  getInitialOrientation: () => 'LANDSCAPE-LEFT'
};

export const NetInfo = {
  fetch: () => Promise.resolve({
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: { isConnectionExpensive: false, ssid: 'Virtual-WiFi', ipAddress: '192.168.1.100' }
  }),
  addEventListener: (listener) => {
    if (listener) listener({ type: 'wifi', isConnected: true, isInternetReachable: true });
    return () => {};
  },
  useNetInfo: () => ({ type: 'wifi', isConnected: true, isInternetReachable: true })
};

export const NetworkInfo = {
  getIPAddress: () => Promise.resolve('192.168.1.100'),
  getIPV4Address: () => Promise.resolve('192.168.1.100'),
  getBroadcast: () => Promise.resolve('192.168.1.255'),
  getSSID: () => Promise.resolve('Virtual-WiFi'),
  getBSSID: () => Promise.resolve('00:11:22:33:44:55'),
  getSubnet: () => Promise.resolve('255.255.255.0'),
  getGatewayIPAddress: () => Promise.resolve('192.168.1.1')
};

const handler = {
  get(target, prop) {
    if (prop === '__esModule') return true;
    if (prop === 'default') return mockProxy;
    if (prop === 'BleManager') return BleManager;
    if (prop === 'State') return State;
    if (prop === 'Device') return Device;
    if (prop === 'Service') return Service;
    if (prop === 'Characteristic') return Characteristic;
    if (prop === 'BleErrorCode') return BleErrorCode;
    if (prop === 'Orientation') return Orientation;
    if (prop === 'NetInfo') return NetInfo;
    if (prop === 'NetworkInfo') return NetworkInfo;
    if (prop in Orientation) return Orientation[prop];
    if (prop in NetInfo) return NetInfo[prop];
    return (...args) => Promise.resolve({});
  }
};

const mockProxy = new Proxy({
  ...Orientation,
  ...NetInfo,
  ...NetworkInfo
}, handler);

export default mockProxy;
