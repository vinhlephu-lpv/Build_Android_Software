const adbService = require('./adbService');
const { spawn } = require('child_process');

class StreamerService {
  constructor() {
    this.activeStreams = new Map(); // serial -> streamState
  }

  startStream(serial, ws, options = {}) {
    this.stopStream(ws);

    const targetFps = options.fps || 15;
    const intervalMs = Math.round(1000 / targetFps);

    const streamState = {
      serial,
      ws,
      isRunning: true,
      isCapturing: false,
      timer: null,
      deviceWidth: 1080,
      deviceHeight: 2400
    };

    this.activeStreams.set(ws, streamState);

    // Fetch initial device size
    adbService.getDeviceInfo(serial).then(info => {
      if (info && info.width && info.height) {
        streamState.deviceWidth = info.width;
        streamState.deviceHeight = info.height;
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'device_info',
            data: info
          }));
        }
      }
    }).catch(() => {});

    // Frame capture loop
    const captureLoop = async () => {
      if (!streamState.isRunning || ws.readyState !== 1) {
        this.stopStream(ws);
        return;
      }

      if (streamState.isCapturing) {
        streamState.timer = setTimeout(captureLoop, intervalMs);
        return;
      }

      streamState.isCapturing = true;
      try {
        const result = await adbService.takeScreenshot(serial);
        if (result.success && result.buffer && streamState.isRunning && ws.readyState === 1) {
          ws.send(result.buffer);
        }
      } catch (err) {
        // Silent error or retry
      } finally {
        streamState.isCapturing = false;
        if (streamState.isRunning) {
          streamState.timer = setTimeout(captureLoop, intervalMs);
        }
      }
    };

    captureLoop();
  }

  stopStream(ws) {
    const streamState = this.activeStreams.get(ws);
    if (streamState) {
      streamState.isRunning = false;
      if (streamState.timer) {
        clearTimeout(streamState.timer);
      }
      this.activeStreams.delete(ws);
    }
  }

  async handleInputMessage(ws, message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      return;
    }

    const streamState = this.activeStreams.get(ws);
    const serial = data.serial || (streamState ? streamState.serial : '');

    switch (data.type) {
      case 'start_stream':
        this.startStream(data.serial, ws, { fps: data.fps || 15 });
        break;

      case 'stop_stream':
        this.stopStream(ws);
        break;

      case 'tap':
        if (data.x !== undefined && data.y !== undefined) {
          await adbService.sendTap(serial, data.x, data.y);
        }
        break;

      case 'swipe':
        if (data.x1 !== undefined && data.y1 !== undefined && data.x2 !== undefined && data.y2 !== undefined) {
          await adbService.sendSwipe(serial, data.x1, data.y1, data.x2, data.y2, data.duration || 200);
        }
        break;

      case 'key':
        if (data.keycode !== undefined) {
          await adbService.sendKeyEvent(serial, data.keycode);
        }
        break;

      case 'text':
        if (data.text) {
          await adbService.sendText(serial, data.text);
        }
        break;

      default:
        break;
    }
  }
}

module.exports = new StreamerService();
