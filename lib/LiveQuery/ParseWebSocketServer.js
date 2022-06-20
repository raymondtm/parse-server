"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseWebSocketServer = exports.ParseWebSocket = void 0;

var _AdapterLoader = require("../Adapters/AdapterLoader");

var _WSAdapter = require("../Adapters/WebSocketServer/WSAdapter");

var _logger = _interopRequireDefault(require("../logger"));

var _events = _interopRequireDefault(require("events"));

var _util = require("util");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseWebSocketServer {
  constructor(server, onConnect, config) {
    config.server = server;
    const wss = (0, _AdapterLoader.loadAdapter)(config.wssAdapter, _WSAdapter.WSAdapter, config);

    wss.onListen = () => {
      _logger.default.info('Parse LiveQuery Server started running');
    };

    wss.onConnection = ws => {
      ws.on('error', error => {
        _logger.default.error(error.message);

        _logger.default.error((0, _util.inspect)(ws, false));
      });
      onConnect(new ParseWebSocket(ws)); // Send ping to client periodically

      const pingIntervalId = setInterval(() => {
        if (ws.readyState == ws.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingIntervalId);
        }
      }, config.websocketTimeout || 10 * 1000);
    };

    wss.onError = error => {
      _logger.default.error(error);
    };

    wss.start();
    this.server = wss;
  }

  close() {
    if (this.server && this.server.close) {
      this.server.close();
    }
  }

}

exports.ParseWebSocketServer = ParseWebSocketServer;

class ParseWebSocket extends _events.default.EventEmitter {
  constructor(ws) {
    super();

    ws.onmessage = request => this.emit('message', request && request.data ? request.data : request);

    ws.onclose = () => this.emit('disconnect');

    this.ws = ws;
  }

  send(message) {
    this.ws.send(message);
  }

}

exports.ParseWebSocket = ParseWebSocket;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZVdlYlNvY2tldFNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwib25Db25uZWN0IiwiY29uZmlnIiwid3NzIiwibG9hZEFkYXB0ZXIiLCJ3c3NBZGFwdGVyIiwiV1NBZGFwdGVyIiwib25MaXN0ZW4iLCJsb2dnZXIiLCJpbmZvIiwib25Db25uZWN0aW9uIiwid3MiLCJvbiIsImVycm9yIiwibWVzc2FnZSIsImluc3BlY3QiLCJQYXJzZVdlYlNvY2tldCIsInBpbmdJbnRlcnZhbElkIiwic2V0SW50ZXJ2YWwiLCJyZWFkeVN0YXRlIiwiT1BFTiIsInBpbmciLCJjbGVhckludGVydmFsIiwid2Vic29ja2V0VGltZW91dCIsIm9uRXJyb3IiLCJzdGFydCIsImNsb3NlIiwiZXZlbnRzIiwiRXZlbnRFbWl0dGVyIiwib25tZXNzYWdlIiwicmVxdWVzdCIsImVtaXQiLCJkYXRhIiwib25jbG9zZSIsInNlbmQiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlV2ViU29ja2V0U2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGxvYWRBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvQWRhcHRlckxvYWRlcic7XG5pbXBvcnQgeyBXU0FkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9XZWJTb2NrZXRTZXJ2ZXIvV1NBZGFwdGVyJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBldmVudHMgZnJvbSAnZXZlbnRzJztcbmltcG9ydCB7IGluc3BlY3QgfSBmcm9tICd1dGlsJztcblxuZXhwb3J0IGNsYXNzIFBhcnNlV2ViU29ja2V0U2VydmVyIHtcbiAgc2VydmVyOiBPYmplY3Q7XG5cbiAgY29uc3RydWN0b3Ioc2VydmVyOiBhbnksIG9uQ29ubmVjdDogRnVuY3Rpb24sIGNvbmZpZykge1xuICAgIGNvbmZpZy5zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgY29uc3Qgd3NzID0gbG9hZEFkYXB0ZXIoY29uZmlnLndzc0FkYXB0ZXIsIFdTQWRhcHRlciwgY29uZmlnKTtcbiAgICB3c3Mub25MaXN0ZW4gPSAoKSA9PiB7XG4gICAgICBsb2dnZXIuaW5mbygnUGFyc2UgTGl2ZVF1ZXJ5IFNlcnZlciBzdGFydGVkIHJ1bm5pbmcnKTtcbiAgICB9O1xuICAgIHdzcy5vbkNvbm5lY3Rpb24gPSB3cyA9PiB7XG4gICAgICB3cy5vbignZXJyb3InLCBlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihlcnJvci5tZXNzYWdlKTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGluc3BlY3Qod3MsIGZhbHNlKSk7XG4gICAgICB9KTtcbiAgICAgIG9uQ29ubmVjdChuZXcgUGFyc2VXZWJTb2NrZXQod3MpKTtcbiAgICAgIC8vIFNlbmQgcGluZyB0byBjbGllbnQgcGVyaW9kaWNhbGx5XG4gICAgICBjb25zdCBwaW5nSW50ZXJ2YWxJZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgICAgaWYgKHdzLnJlYWR5U3RhdGUgPT0gd3MuT1BFTikge1xuICAgICAgICAgIHdzLnBpbmcoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjbGVhckludGVydmFsKHBpbmdJbnRlcnZhbElkKTtcbiAgICAgICAgfVxuICAgICAgfSwgY29uZmlnLndlYnNvY2tldFRpbWVvdXQgfHwgMTAgKiAxMDAwKTtcbiAgICB9O1xuICAgIHdzcy5vbkVycm9yID0gZXJyb3IgPT4ge1xuICAgICAgbG9nZ2VyLmVycm9yKGVycm9yKTtcbiAgICB9O1xuICAgIHdzcy5zdGFydCgpO1xuICAgIHRoaXMuc2VydmVyID0gd3NzO1xuICB9XG5cbiAgY2xvc2UoKSB7XG4gICAgaWYgKHRoaXMuc2VydmVyICYmIHRoaXMuc2VydmVyLmNsb3NlKSB7XG4gICAgICB0aGlzLnNlcnZlci5jbG9zZSgpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgUGFyc2VXZWJTb2NrZXQgZXh0ZW5kcyBldmVudHMuRXZlbnRFbWl0dGVyIHtcbiAgd3M6IGFueTtcblxuICBjb25zdHJ1Y3Rvcih3czogYW55KSB7XG4gICAgc3VwZXIoKTtcbiAgICB3cy5vbm1lc3NhZ2UgPSByZXF1ZXN0ID0+XG4gICAgICB0aGlzLmVtaXQoJ21lc3NhZ2UnLCByZXF1ZXN0ICYmIHJlcXVlc3QuZGF0YSA/IHJlcXVlc3QuZGF0YSA6IHJlcXVlc3QpO1xuICAgIHdzLm9uY2xvc2UgPSAoKSA9PiB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKTtcbiAgICB0aGlzLndzID0gd3M7XG4gIH1cblxuICBzZW5kKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIHRoaXMud3Muc2VuZChtZXNzYWdlKTtcbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFFTyxNQUFNQSxvQkFBTixDQUEyQjtFQUdoQ0MsV0FBVyxDQUFDQyxNQUFELEVBQWNDLFNBQWQsRUFBbUNDLE1BQW5DLEVBQTJDO0lBQ3BEQSxNQUFNLENBQUNGLE1BQVAsR0FBZ0JBLE1BQWhCO0lBQ0EsTUFBTUcsR0FBRyxHQUFHLElBQUFDLDBCQUFBLEVBQVlGLE1BQU0sQ0FBQ0csVUFBbkIsRUFBK0JDLG9CQUEvQixFQUEwQ0osTUFBMUMsQ0FBWjs7SUFDQUMsR0FBRyxDQUFDSSxRQUFKLEdBQWUsTUFBTTtNQUNuQkMsZUFBQSxDQUFPQyxJQUFQLENBQVksd0NBQVo7SUFDRCxDQUZEOztJQUdBTixHQUFHLENBQUNPLFlBQUosR0FBbUJDLEVBQUUsSUFBSTtNQUN2QkEsRUFBRSxDQUFDQyxFQUFILENBQU0sT0FBTixFQUFlQyxLQUFLLElBQUk7UUFDdEJMLGVBQUEsQ0FBT0ssS0FBUCxDQUFhQSxLQUFLLENBQUNDLE9BQW5COztRQUNBTixlQUFBLENBQU9LLEtBQVAsQ0FBYSxJQUFBRSxhQUFBLEVBQVFKLEVBQVIsRUFBWSxLQUFaLENBQWI7TUFDRCxDQUhEO01BSUFWLFNBQVMsQ0FBQyxJQUFJZSxjQUFKLENBQW1CTCxFQUFuQixDQUFELENBQVQsQ0FMdUIsQ0FNdkI7O01BQ0EsTUFBTU0sY0FBYyxHQUFHQyxXQUFXLENBQUMsTUFBTTtRQUN2QyxJQUFJUCxFQUFFLENBQUNRLFVBQUgsSUFBaUJSLEVBQUUsQ0FBQ1MsSUFBeEIsRUFBOEI7VUFDNUJULEVBQUUsQ0FBQ1UsSUFBSDtRQUNELENBRkQsTUFFTztVQUNMQyxhQUFhLENBQUNMLGNBQUQsQ0FBYjtRQUNEO01BQ0YsQ0FOaUMsRUFNL0JmLE1BQU0sQ0FBQ3FCLGdCQUFQLElBQTJCLEtBQUssSUFORCxDQUFsQztJQU9ELENBZEQ7O0lBZUFwQixHQUFHLENBQUNxQixPQUFKLEdBQWNYLEtBQUssSUFBSTtNQUNyQkwsZUFBQSxDQUFPSyxLQUFQLENBQWFBLEtBQWI7SUFDRCxDQUZEOztJQUdBVixHQUFHLENBQUNzQixLQUFKO0lBQ0EsS0FBS3pCLE1BQUwsR0FBY0csR0FBZDtFQUNEOztFQUVEdUIsS0FBSyxHQUFHO0lBQ04sSUFBSSxLQUFLMUIsTUFBTCxJQUFlLEtBQUtBLE1BQUwsQ0FBWTBCLEtBQS9CLEVBQXNDO01BQ3BDLEtBQUsxQixNQUFMLENBQVkwQixLQUFaO0lBQ0Q7RUFDRjs7QUFuQytCOzs7O0FBc0MzQixNQUFNVixjQUFOLFNBQTZCVyxlQUFBLENBQU9DLFlBQXBDLENBQWlEO0VBR3REN0IsV0FBVyxDQUFDWSxFQUFELEVBQVU7SUFDbkI7O0lBQ0FBLEVBQUUsQ0FBQ2tCLFNBQUgsR0FBZUMsT0FBTyxJQUNwQixLQUFLQyxJQUFMLENBQVUsU0FBVixFQUFxQkQsT0FBTyxJQUFJQSxPQUFPLENBQUNFLElBQW5CLEdBQTBCRixPQUFPLENBQUNFLElBQWxDLEdBQXlDRixPQUE5RCxDQURGOztJQUVBbkIsRUFBRSxDQUFDc0IsT0FBSCxHQUFhLE1BQU0sS0FBS0YsSUFBTCxDQUFVLFlBQVYsQ0FBbkI7O0lBQ0EsS0FBS3BCLEVBQUwsR0FBVUEsRUFBVjtFQUNEOztFQUVEdUIsSUFBSSxDQUFDcEIsT0FBRCxFQUFxQjtJQUN2QixLQUFLSCxFQUFMLENBQVF1QixJQUFSLENBQWFwQixPQUFiO0VBQ0Q7O0FBYnFEIn0=