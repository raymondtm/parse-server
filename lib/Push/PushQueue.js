"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushQueue = void 0;

var _ParseMessageQueue = require("../ParseMessageQueue");

var _rest = _interopRequireDefault(require("../rest"));

var _utils = require("./utils");

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const PUSH_CHANNEL = 'parse-server-push';
const DEFAULT_BATCH_SIZE = 100;

class PushQueue {
  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config = {}) {
    this.channel = config.channel || PushQueue.defaultPushChannel();
    this.batchSize = config.batchSize || DEFAULT_BATCH_SIZE;
    this.parsePublisher = _ParseMessageQueue.ParseMessageQueue.createPublisher(config);
  }

  static defaultPushChannel() {
    return `${_node.default.applicationId}-${PUSH_CHANNEL}`;
  }

  enqueue(body, where, config, auth, pushStatus) {
    const limit = this.batchSize;
    where = (0, _utils.applyDeviceTokenExists)(where); // Order by objectId so no impact on the DB

    const order = 'objectId';
    return Promise.resolve().then(() => {
      return _rest.default.find(config, auth, '_Installation', where, {
        limit: 0,
        count: true
      });
    }).then(({
      results,
      count
    }) => {
      if (!results || count == 0) {
        return pushStatus.complete();
      }

      pushStatus.setRunning(Math.ceil(count / limit));
      let skip = 0;

      while (skip < count) {
        const query = {
          where,
          limit,
          skip,
          order
        };
        const pushWorkItem = {
          body,
          query,
          pushStatus: {
            objectId: pushStatus.objectId
          },
          applicationId: config.applicationId
        };
        this.parsePublisher.publish(this.channel, JSON.stringify(pushWorkItem));
        skip += limit;
      }
    });
  }

}

exports.PushQueue = PushQueue;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQVVNIX0NIQU5ORUwiLCJERUZBVUxUX0JBVENIX1NJWkUiLCJQdXNoUXVldWUiLCJjb25zdHJ1Y3RvciIsImNvbmZpZyIsImNoYW5uZWwiLCJkZWZhdWx0UHVzaENoYW5uZWwiLCJiYXRjaFNpemUiLCJwYXJzZVB1Ymxpc2hlciIsIlBhcnNlTWVzc2FnZVF1ZXVlIiwiY3JlYXRlUHVibGlzaGVyIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwiZW5xdWV1ZSIsImJvZHkiLCJ3aGVyZSIsImF1dGgiLCJwdXNoU3RhdHVzIiwibGltaXQiLCJhcHBseURldmljZVRva2VuRXhpc3RzIiwib3JkZXIiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJyZXN0IiwiZmluZCIsImNvdW50IiwicmVzdWx0cyIsImNvbXBsZXRlIiwic2V0UnVubmluZyIsIk1hdGgiLCJjZWlsIiwic2tpcCIsInF1ZXJ5IiwicHVzaFdvcmtJdGVtIiwib2JqZWN0SWQiLCJwdWJsaXNoIiwiSlNPTiIsInN0cmluZ2lmeSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9QdXNoL1B1c2hRdWV1ZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBQYXJzZU1lc3NhZ2VRdWV1ZSB9IGZyb20gJy4uL1BhcnNlTWVzc2FnZVF1ZXVlJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IHsgYXBwbHlEZXZpY2VUb2tlbkV4aXN0cyB9IGZyb20gJy4vdXRpbHMnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG5jb25zdCBQVVNIX0NIQU5ORUwgPSAncGFyc2Utc2VydmVyLXB1c2gnO1xuY29uc3QgREVGQVVMVF9CQVRDSF9TSVpFID0gMTAwO1xuXG5leHBvcnQgY2xhc3MgUHVzaFF1ZXVlIHtcbiAgcGFyc2VQdWJsaXNoZXI6IE9iamVjdDtcbiAgY2hhbm5lbDogU3RyaW5nO1xuICBiYXRjaFNpemU6IE51bWJlcjtcblxuICAvLyBjb25maWcgb2JqZWN0IG9mIHRoZSBwdWJsaXNoZXIsIHJpZ2h0IG5vdyBpdCBvbmx5IGNvbnRhaW5zIHRoZSByZWRpc1VSTCxcbiAgLy8gYnV0IHdlIG1heSBleHRlbmQgaXQgbGF0ZXIuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLmNoYW5uZWwgPSBjb25maWcuY2hhbm5lbCB8fCBQdXNoUXVldWUuZGVmYXVsdFB1c2hDaGFubmVsKCk7XG4gICAgdGhpcy5iYXRjaFNpemUgPSBjb25maWcuYmF0Y2hTaXplIHx8IERFRkFVTFRfQkFUQ0hfU0laRTtcbiAgICB0aGlzLnBhcnNlUHVibGlzaGVyID0gUGFyc2VNZXNzYWdlUXVldWUuY3JlYXRlUHVibGlzaGVyKGNvbmZpZyk7XG4gIH1cblxuICBzdGF0aWMgZGVmYXVsdFB1c2hDaGFubmVsKCkge1xuICAgIHJldHVybiBgJHtQYXJzZS5hcHBsaWNhdGlvbklkfS0ke1BVU0hfQ0hBTk5FTH1gO1xuICB9XG5cbiAgZW5xdWV1ZShib2R5LCB3aGVyZSwgY29uZmlnLCBhdXRoLCBwdXNoU3RhdHVzKSB7XG4gICAgY29uc3QgbGltaXQgPSB0aGlzLmJhdGNoU2l6ZTtcblxuICAgIHdoZXJlID0gYXBwbHlEZXZpY2VUb2tlbkV4aXN0cyh3aGVyZSk7XG5cbiAgICAvLyBPcmRlciBieSBvYmplY3RJZCBzbyBubyBpbXBhY3Qgb24gdGhlIERCXG4gICAgY29uc3Qgb3JkZXIgPSAnb2JqZWN0SWQnO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcmVzdC5maW5kKGNvbmZpZywgYXV0aCwgJ19JbnN0YWxsYXRpb24nLCB3aGVyZSwge1xuICAgICAgICAgIGxpbWl0OiAwLFxuICAgICAgICAgIGNvdW50OiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoeyByZXN1bHRzLCBjb3VudCB9KSA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0cyB8fCBjb3VudCA9PSAwKSB7XG4gICAgICAgICAgcmV0dXJuIHB1c2hTdGF0dXMuY29tcGxldGUoKTtcbiAgICAgICAgfVxuICAgICAgICBwdXNoU3RhdHVzLnNldFJ1bm5pbmcoTWF0aC5jZWlsKGNvdW50IC8gbGltaXQpKTtcbiAgICAgICAgbGV0IHNraXAgPSAwO1xuICAgICAgICB3aGlsZSAoc2tpcCA8IGNvdW50KSB7XG4gICAgICAgICAgY29uc3QgcXVlcnkgPSB7XG4gICAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgIG9yZGVyLFxuICAgICAgICAgIH07XG5cbiAgICAgICAgICBjb25zdCBwdXNoV29ya0l0ZW0gPSB7XG4gICAgICAgICAgICBib2R5LFxuICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICBwdXNoU3RhdHVzOiB7IG9iamVjdElkOiBwdXNoU3RhdHVzLm9iamVjdElkIH0sXG4gICAgICAgICAgICBhcHBsaWNhdGlvbklkOiBjb25maWcuYXBwbGljYXRpb25JZCxcbiAgICAgICAgICB9O1xuICAgICAgICAgIHRoaXMucGFyc2VQdWJsaXNoZXIucHVibGlzaCh0aGlzLmNoYW5uZWwsIEpTT04uc3RyaW5naWZ5KHB1c2hXb3JrSXRlbSkpO1xuICAgICAgICAgIHNraXAgKz0gbGltaXQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUVBLE1BQU1BLFlBQVksR0FBRyxtQkFBckI7QUFDQSxNQUFNQyxrQkFBa0IsR0FBRyxHQUEzQjs7QUFFTyxNQUFNQyxTQUFOLENBQWdCO0VBS3JCO0VBQ0E7RUFDQUMsV0FBVyxDQUFDQyxNQUFXLEdBQUcsRUFBZixFQUFtQjtJQUM1QixLQUFLQyxPQUFMLEdBQWVELE1BQU0sQ0FBQ0MsT0FBUCxJQUFrQkgsU0FBUyxDQUFDSSxrQkFBVixFQUFqQztJQUNBLEtBQUtDLFNBQUwsR0FBaUJILE1BQU0sQ0FBQ0csU0FBUCxJQUFvQk4sa0JBQXJDO0lBQ0EsS0FBS08sY0FBTCxHQUFzQkMsb0NBQUEsQ0FBa0JDLGVBQWxCLENBQWtDTixNQUFsQyxDQUF0QjtFQUNEOztFQUV3QixPQUFsQkUsa0JBQWtCLEdBQUc7SUFDMUIsT0FBUSxHQUFFSyxhQUFBLENBQU1DLGFBQWMsSUFBR1osWUFBYSxFQUE5QztFQUNEOztFQUVEYSxPQUFPLENBQUNDLElBQUQsRUFBT0MsS0FBUCxFQUFjWCxNQUFkLEVBQXNCWSxJQUF0QixFQUE0QkMsVUFBNUIsRUFBd0M7SUFDN0MsTUFBTUMsS0FBSyxHQUFHLEtBQUtYLFNBQW5CO0lBRUFRLEtBQUssR0FBRyxJQUFBSSw2QkFBQSxFQUF1QkosS0FBdkIsQ0FBUixDQUg2QyxDQUs3Qzs7SUFDQSxNQUFNSyxLQUFLLEdBQUcsVUFBZDtJQUNBLE9BQU9DLE9BQU8sQ0FBQ0MsT0FBUixHQUNKQyxJQURJLENBQ0MsTUFBTTtNQUNWLE9BQU9DLGFBQUEsQ0FBS0MsSUFBTCxDQUFVckIsTUFBVixFQUFrQlksSUFBbEIsRUFBd0IsZUFBeEIsRUFBeUNELEtBQXpDLEVBQWdEO1FBQ3JERyxLQUFLLEVBQUUsQ0FEOEM7UUFFckRRLEtBQUssRUFBRTtNQUY4QyxDQUFoRCxDQUFQO0lBSUQsQ0FOSSxFQU9KSCxJQVBJLENBT0MsQ0FBQztNQUFFSSxPQUFGO01BQVdEO0lBQVgsQ0FBRCxLQUF3QjtNQUM1QixJQUFJLENBQUNDLE9BQUQsSUFBWUQsS0FBSyxJQUFJLENBQXpCLEVBQTRCO1FBQzFCLE9BQU9ULFVBQVUsQ0FBQ1csUUFBWCxFQUFQO01BQ0Q7O01BQ0RYLFVBQVUsQ0FBQ1ksVUFBWCxDQUFzQkMsSUFBSSxDQUFDQyxJQUFMLENBQVVMLEtBQUssR0FBR1IsS0FBbEIsQ0FBdEI7TUFDQSxJQUFJYyxJQUFJLEdBQUcsQ0FBWDs7TUFDQSxPQUFPQSxJQUFJLEdBQUdOLEtBQWQsRUFBcUI7UUFDbkIsTUFBTU8sS0FBSyxHQUFHO1VBQ1psQixLQURZO1VBRVpHLEtBRlk7VUFHWmMsSUFIWTtVQUlaWjtRQUpZLENBQWQ7UUFPQSxNQUFNYyxZQUFZLEdBQUc7VUFDbkJwQixJQURtQjtVQUVuQm1CLEtBRm1CO1VBR25CaEIsVUFBVSxFQUFFO1lBQUVrQixRQUFRLEVBQUVsQixVQUFVLENBQUNrQjtVQUF2QixDQUhPO1VBSW5CdkIsYUFBYSxFQUFFUixNQUFNLENBQUNRO1FBSkgsQ0FBckI7UUFNQSxLQUFLSixjQUFMLENBQW9CNEIsT0FBcEIsQ0FBNEIsS0FBSy9CLE9BQWpDLEVBQTBDZ0MsSUFBSSxDQUFDQyxTQUFMLENBQWVKLFlBQWYsQ0FBMUM7UUFDQUYsSUFBSSxJQUFJZCxLQUFSO01BQ0Q7SUFDRixDQTlCSSxDQUFQO0VBK0JEOztBQXZEb0IifQ==