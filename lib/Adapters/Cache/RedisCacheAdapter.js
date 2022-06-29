"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.RedisCacheAdapter = void 0;

var _redis = _interopRequireDefault(require("redis"));

var _logger = _interopRequireDefault(require("../../logger"));

var _KeyPromiseQueue = require("../../KeyPromiseQueue");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const DEFAULT_REDIS_TTL = 30 * 1000; // 30 seconds in milliseconds

const FLUSH_DB_KEY = '__flush_db__';

function debug(...args) {
  const message = ['RedisCacheAdapter: ' + arguments[0]].concat(args.slice(1, args.length));

  _logger.default.debug.apply(_logger.default, message);
}

const isValidTTL = ttl => typeof ttl === 'number' && ttl > 0;

class RedisCacheAdapter {
  constructor(redisCtx, ttl = DEFAULT_REDIS_TTL) {
    this.ttl = isValidTTL(ttl) ? ttl : DEFAULT_REDIS_TTL;
    this.client = _redis.default.createClient(redisCtx);
    this.queue = new _KeyPromiseQueue.KeyPromiseQueue();
  }

  handleShutdown() {
    if (!this.client) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      this.client.quit(err => {
        if (err) {
          _logger.default.error('RedisCacheAdapter error on shutdown', {
            error: err
          });
        }

        resolve();
      });
    });
  }

  get(key) {
    debug('get', {
      key
    });
    return this.queue.enqueue(key, () => new Promise(resolve => {
      this.client.get(key, function (err, res) {
        debug('-> get', {
          key,
          res
        });

        if (!res) {
          return resolve(null);
        }

        resolve(JSON.parse(res));
      });
    }));
  }

  put(key, value, ttl = this.ttl) {
    value = JSON.stringify(value);
    debug('put', {
      key,
      value,
      ttl
    });

    if (ttl === 0) {
      // ttl of zero is a logical no-op, but redis cannot set expire time of zero
      return this.queue.enqueue(key, () => Promise.resolve());
    }

    if (ttl === Infinity) {
      return this.queue.enqueue(key, () => new Promise(resolve => {
        this.client.set(key, value, function () {
          resolve();
        });
      }));
    }

    if (!isValidTTL(ttl)) {
      ttl = this.ttl;
    }

    return this.queue.enqueue(key, () => new Promise(resolve => {
      this.client.psetex(key, ttl, value, function () {
        resolve();
      });
    }));
  }

  del(key) {
    debug('del', {
      key
    });
    return this.queue.enqueue(key, () => new Promise(resolve => {
      this.client.del(key, function () {
        resolve();
      });
    }));
  }

  clear() {
    debug('clear');
    return this.queue.enqueue(FLUSH_DB_KEY, () => new Promise(resolve => {
      this.client.flushdb(function () {
        resolve();
      });
    }));
  } // Used for testing


  async getAllKeys() {
    return new Promise((resolve, reject) => {
      this.client.keys('*', (err, keys) => {
        if (err) {
          reject(err);
        } else {
          resolve(keys);
        }
      });
    });
  }

}

exports.RedisCacheAdapter = RedisCacheAdapter;
var _default = RedisCacheAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJERUZBVUxUX1JFRElTX1RUTCIsIkZMVVNIX0RCX0tFWSIsImRlYnVnIiwiYXJncyIsIm1lc3NhZ2UiLCJhcmd1bWVudHMiLCJjb25jYXQiLCJzbGljZSIsImxlbmd0aCIsImxvZ2dlciIsImFwcGx5IiwiaXNWYWxpZFRUTCIsInR0bCIsIlJlZGlzQ2FjaGVBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJyZWRpc0N0eCIsImNsaWVudCIsInJlZGlzIiwiY3JlYXRlQ2xpZW50IiwicXVldWUiLCJLZXlQcm9taXNlUXVldWUiLCJoYW5kbGVTaHV0ZG93biIsIlByb21pc2UiLCJyZXNvbHZlIiwicXVpdCIsImVyciIsImVycm9yIiwiZ2V0Iiwia2V5IiwiZW5xdWV1ZSIsInJlcyIsIkpTT04iLCJwYXJzZSIsInB1dCIsInZhbHVlIiwic3RyaW5naWZ5IiwiSW5maW5pdHkiLCJzZXQiLCJwc2V0ZXgiLCJkZWwiLCJjbGVhciIsImZsdXNoZGIiLCJnZXRBbGxLZXlzIiwicmVqZWN0Iiwia2V5cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9SZWRpc0NhY2hlQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcmVkaXMgZnJvbSAncmVkaXMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi9sb2dnZXInO1xuaW1wb3J0IHsgS2V5UHJvbWlzZVF1ZXVlIH0gZnJvbSAnLi4vLi4vS2V5UHJvbWlzZVF1ZXVlJztcblxuY29uc3QgREVGQVVMVF9SRURJU19UVEwgPSAzMCAqIDEwMDA7IC8vIDMwIHNlY29uZHMgaW4gbWlsbGlzZWNvbmRzXG5jb25zdCBGTFVTSF9EQl9LRVkgPSAnX19mbHVzaF9kYl9fJztcblxuZnVuY3Rpb24gZGVidWcoLi4uYXJnczogYW55KSB7XG4gIGNvbnN0IG1lc3NhZ2UgPSBbJ1JlZGlzQ2FjaGVBZGFwdGVyOiAnICsgYXJndW1lbnRzWzBdXS5jb25jYXQoYXJncy5zbGljZSgxLCBhcmdzLmxlbmd0aCkpO1xuICBsb2dnZXIuZGVidWcuYXBwbHkobG9nZ2VyLCBtZXNzYWdlKTtcbn1cblxuY29uc3QgaXNWYWxpZFRUTCA9IHR0bCA9PiB0eXBlb2YgdHRsID09PSAnbnVtYmVyJyAmJiB0dGwgPiAwO1xuXG5leHBvcnQgY2xhc3MgUmVkaXNDYWNoZUFkYXB0ZXIge1xuICBjb25zdHJ1Y3RvcihyZWRpc0N0eCwgdHRsID0gREVGQVVMVF9SRURJU19UVEwpIHtcbiAgICB0aGlzLnR0bCA9IGlzVmFsaWRUVEwodHRsKSA/IHR0bCA6IERFRkFVTFRfUkVESVNfVFRMO1xuICAgIHRoaXMuY2xpZW50ID0gcmVkaXMuY3JlYXRlQ2xpZW50KHJlZGlzQ3R4KTtcbiAgICB0aGlzLnF1ZXVlID0gbmV3IEtleVByb21pc2VRdWV1ZSgpO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICB0aGlzLmNsaWVudC5xdWl0KGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1JlZGlzQ2FjaGVBZGFwdGVyIGVycm9yIG9uIHNodXRkb3duJywgeyBlcnJvcjogZXJyIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgZ2V0KGtleSkge1xuICAgIGRlYnVnKCdnZXQnLCB7IGtleSB9KTtcbiAgICByZXR1cm4gdGhpcy5xdWV1ZS5lbnF1ZXVlKFxuICAgICAga2V5LFxuICAgICAgKCkgPT5cbiAgICAgICAgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdGhpcy5jbGllbnQuZ2V0KGtleSwgZnVuY3Rpb24gKGVyciwgcmVzKSB7XG4gICAgICAgICAgICBkZWJ1ZygnLT4gZ2V0JywgeyBrZXksIHJlcyB9KTtcbiAgICAgICAgICAgIGlmICghcmVzKSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXNvbHZlKG51bGwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmVzb2x2ZShKU09OLnBhcnNlKHJlcykpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICk7XG4gIH1cblxuICBwdXQoa2V5LCB2YWx1ZSwgdHRsID0gdGhpcy50dGwpIHtcbiAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICBkZWJ1ZygncHV0JywgeyBrZXksIHZhbHVlLCB0dGwgfSk7XG5cbiAgICBpZiAodHRsID09PSAwKSB7XG4gICAgICAvLyB0dGwgb2YgemVybyBpcyBhIGxvZ2ljYWwgbm8tb3AsIGJ1dCByZWRpcyBjYW5ub3Qgc2V0IGV4cGlyZSB0aW1lIG9mIHplcm9cbiAgICAgIHJldHVybiB0aGlzLnF1ZXVlLmVucXVldWUoa2V5LCAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSk7XG4gICAgfVxuXG4gICAgaWYgKHR0bCA9PT0gSW5maW5pdHkpIHtcbiAgICAgIHJldHVybiB0aGlzLnF1ZXVlLmVucXVldWUoXG4gICAgICAgIGtleSxcbiAgICAgICAgKCkgPT5cbiAgICAgICAgICBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICAgIHRoaXMuY2xpZW50LnNldChrZXksIHZhbHVlLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghaXNWYWxpZFRUTCh0dGwpKSB7XG4gICAgICB0dGwgPSB0aGlzLnR0bDtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5xdWV1ZS5lbnF1ZXVlKFxuICAgICAga2V5LFxuICAgICAgKCkgPT5cbiAgICAgICAgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICAgICAgdGhpcy5jbGllbnQucHNldGV4KGtleSwgdHRsLCB2YWx1ZSwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICk7XG4gIH1cblxuICBkZWwoa2V5KSB7XG4gICAgZGVidWcoJ2RlbCcsIHsga2V5IH0pO1xuICAgIHJldHVybiB0aGlzLnF1ZXVlLmVucXVldWUoXG4gICAgICBrZXksXG4gICAgICAoKSA9PlxuICAgICAgICBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICB0aGlzLmNsaWVudC5kZWwoa2V5LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXNvbHZlKCk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIGNsZWFyKCkge1xuICAgIGRlYnVnKCdjbGVhcicpO1xuICAgIHJldHVybiB0aGlzLnF1ZXVlLmVucXVldWUoXG4gICAgICBGTFVTSF9EQl9LRVksXG4gICAgICAoKSA9PlxuICAgICAgICBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcbiAgICAgICAgICB0aGlzLmNsaWVudC5mbHVzaGRiKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZ1xuICBhc3luYyBnZXRBbGxLZXlzKCkge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICB0aGlzLmNsaWVudC5rZXlzKCcqJywgKGVyciwga2V5cykgPT4ge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgcmVqZWN0KGVycik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzb2x2ZShrZXlzKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUmVkaXNDYWNoZUFkYXB0ZXI7XG4iXSwibWFwcGluZ3Mi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