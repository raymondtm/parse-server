"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Client = void 0;

var _logger = _interopRequireDefault(require("../logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const dafaultFields = ['className', 'objectId', 'updatedAt', 'createdAt', 'ACL'];

class Client {
  constructor(id, parseWebSocket, hasMasterKey = false, sessionToken, installationId) {
    this.id = id;
    this.parseWebSocket = parseWebSocket;
    this.hasMasterKey = hasMasterKey;
    this.sessionToken = sessionToken;
    this.installationId = installationId;
    this.roles = [];
    this.subscriptionInfos = new Map();
    this.pushConnect = this._pushEvent('connected');
    this.pushSubscribe = this._pushEvent('subscribed');
    this.pushUnsubscribe = this._pushEvent('unsubscribed');
    this.pushCreate = this._pushEvent('create');
    this.pushEnter = this._pushEvent('enter');
    this.pushUpdate = this._pushEvent('update');
    this.pushDelete = this._pushEvent('delete');
    this.pushLeave = this._pushEvent('leave');
  }

  static pushResponse(parseWebSocket, message) {
    _logger.default.verbose('Push Response : %j', message);

    parseWebSocket.send(message);
  }

  static pushError(parseWebSocket, code, error, reconnect = true, requestId = null) {
    Client.pushResponse(parseWebSocket, JSON.stringify({
      op: 'error',
      error,
      code,
      reconnect,
      requestId
    }));
  }

  addSubscriptionInfo(requestId, subscriptionInfo) {
    this.subscriptionInfos.set(requestId, subscriptionInfo);
  }

  getSubscriptionInfo(requestId) {
    return this.subscriptionInfos.get(requestId);
  }

  deleteSubscriptionInfo(requestId) {
    return this.subscriptionInfos.delete(requestId);
  }

  _pushEvent(type) {
    return function (subscriptionId, parseObjectJSON, parseOriginalObjectJSON) {
      const response = {
        op: type,
        clientId: this.id,
        installationId: this.installationId
      };

      if (typeof subscriptionId !== 'undefined') {
        response['requestId'] = subscriptionId;
      }

      if (typeof parseObjectJSON !== 'undefined') {
        let fields;

        if (this.subscriptionInfos.has(subscriptionId)) {
          fields = this.subscriptionInfos.get(subscriptionId).fields;
        }

        response['object'] = this._toJSONWithFields(parseObjectJSON, fields);

        if (parseOriginalObjectJSON) {
          response['original'] = this._toJSONWithFields(parseOriginalObjectJSON, fields);
        }
      }

      Client.pushResponse(this.parseWebSocket, JSON.stringify(response));
    };
  }

  _toJSONWithFields(parseObjectJSON, fields) {
    if (!fields) {
      return parseObjectJSON;
    }

    const limitedParseObject = {};

    for (const field of dafaultFields) {
      limitedParseObject[field] = parseObjectJSON[field];
    }

    for (const field of fields) {
      if (field in parseObjectJSON) {
        limitedParseObject[field] = parseObjectJSON[field];
      }
    }

    return limitedParseObject;
  }

}

exports.Client = Client;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJkYWZhdWx0RmllbGRzIiwiQ2xpZW50IiwiY29uc3RydWN0b3IiLCJpZCIsInBhcnNlV2ViU29ja2V0IiwiaGFzTWFzdGVyS2V5Iiwic2Vzc2lvblRva2VuIiwiaW5zdGFsbGF0aW9uSWQiLCJyb2xlcyIsInN1YnNjcmlwdGlvbkluZm9zIiwiTWFwIiwicHVzaENvbm5lY3QiLCJfcHVzaEV2ZW50IiwicHVzaFN1YnNjcmliZSIsInB1c2hVbnN1YnNjcmliZSIsInB1c2hDcmVhdGUiLCJwdXNoRW50ZXIiLCJwdXNoVXBkYXRlIiwicHVzaERlbGV0ZSIsInB1c2hMZWF2ZSIsInB1c2hSZXNwb25zZSIsIm1lc3NhZ2UiLCJsb2dnZXIiLCJ2ZXJib3NlIiwic2VuZCIsInB1c2hFcnJvciIsImNvZGUiLCJlcnJvciIsInJlY29ubmVjdCIsInJlcXVlc3RJZCIsIkpTT04iLCJzdHJpbmdpZnkiLCJvcCIsImFkZFN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvIiwic2V0IiwiZ2V0U3Vic2NyaXB0aW9uSW5mbyIsImdldCIsImRlbGV0ZVN1YnNjcmlwdGlvbkluZm8iLCJkZWxldGUiLCJ0eXBlIiwic3Vic2NyaXB0aW9uSWQiLCJwYXJzZU9iamVjdEpTT04iLCJwYXJzZU9yaWdpbmFsT2JqZWN0SlNPTiIsInJlc3BvbnNlIiwiY2xpZW50SWQiLCJmaWVsZHMiLCJoYXMiLCJfdG9KU09OV2l0aEZpZWxkcyIsImxpbWl0ZWRQYXJzZU9iamVjdCIsImZpZWxkIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0xpdmVRdWVyeS9DbGllbnQuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuXG5pbXBvcnQgdHlwZSB7IEZsYXR0ZW5lZE9iamVjdERhdGEgfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5leHBvcnQgdHlwZSBNZXNzYWdlID0geyBbYXR0cjogc3RyaW5nXTogYW55IH07XG5cbmNvbnN0IGRhZmF1bHRGaWVsZHMgPSBbJ2NsYXNzTmFtZScsICdvYmplY3RJZCcsICd1cGRhdGVkQXQnLCAnY3JlYXRlZEF0JywgJ0FDTCddO1xuXG5jbGFzcyBDbGllbnQge1xuICBpZDogbnVtYmVyO1xuICBwYXJzZVdlYlNvY2tldDogYW55O1xuICBoYXNNYXN0ZXJLZXk6IGJvb2xlYW47XG4gIHNlc3Npb25Ub2tlbjogc3RyaW5nO1xuICBpbnN0YWxsYXRpb25JZDogc3RyaW5nO1xuICB1c2VySWQ6IHN0cmluZztcbiAgcm9sZXM6IEFycmF5PHN0cmluZz47XG4gIHN1YnNjcmlwdGlvbkluZm9zOiBPYmplY3Q7XG4gIHB1c2hDb25uZWN0OiBGdW5jdGlvbjtcbiAgcHVzaFN1YnNjcmliZTogRnVuY3Rpb247XG4gIHB1c2hVbnN1YnNjcmliZTogRnVuY3Rpb247XG4gIHB1c2hDcmVhdGU6IEZ1bmN0aW9uO1xuICBwdXNoRW50ZXI6IEZ1bmN0aW9uO1xuICBwdXNoVXBkYXRlOiBGdW5jdGlvbjtcbiAgcHVzaERlbGV0ZTogRnVuY3Rpb247XG4gIHB1c2hMZWF2ZTogRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3IoXG4gICAgaWQ6IG51bWJlcixcbiAgICBwYXJzZVdlYlNvY2tldDogYW55LFxuICAgIGhhc01hc3RlcktleTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHNlc3Npb25Ub2tlbjogc3RyaW5nLFxuICAgIGluc3RhbGxhdGlvbklkOiBzdHJpbmdcbiAgKSB7XG4gICAgdGhpcy5pZCA9IGlkO1xuICAgIHRoaXMucGFyc2VXZWJTb2NrZXQgPSBwYXJzZVdlYlNvY2tldDtcbiAgICB0aGlzLmhhc01hc3RlcktleSA9IGhhc01hc3RlcktleTtcbiAgICB0aGlzLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25Ub2tlbjtcbiAgICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gICAgdGhpcy5yb2xlcyA9IFtdO1xuICAgIHRoaXMuc3Vic2NyaXB0aW9uSW5mb3MgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5wdXNoQ29ubmVjdCA9IHRoaXMuX3B1c2hFdmVudCgnY29ubmVjdGVkJyk7XG4gICAgdGhpcy5wdXNoU3Vic2NyaWJlID0gdGhpcy5fcHVzaEV2ZW50KCdzdWJzY3JpYmVkJyk7XG4gICAgdGhpcy5wdXNoVW5zdWJzY3JpYmUgPSB0aGlzLl9wdXNoRXZlbnQoJ3Vuc3Vic2NyaWJlZCcpO1xuICAgIHRoaXMucHVzaENyZWF0ZSA9IHRoaXMuX3B1c2hFdmVudCgnY3JlYXRlJyk7XG4gICAgdGhpcy5wdXNoRW50ZXIgPSB0aGlzLl9wdXNoRXZlbnQoJ2VudGVyJyk7XG4gICAgdGhpcy5wdXNoVXBkYXRlID0gdGhpcy5fcHVzaEV2ZW50KCd1cGRhdGUnKTtcbiAgICB0aGlzLnB1c2hEZWxldGUgPSB0aGlzLl9wdXNoRXZlbnQoJ2RlbGV0ZScpO1xuICAgIHRoaXMucHVzaExlYXZlID0gdGhpcy5fcHVzaEV2ZW50KCdsZWF2ZScpO1xuICB9XG5cbiAgc3RhdGljIHB1c2hSZXNwb25zZShwYXJzZVdlYlNvY2tldDogYW55LCBtZXNzYWdlOiBNZXNzYWdlKTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ1B1c2ggUmVzcG9uc2UgOiAlaicsIG1lc3NhZ2UpO1xuICAgIHBhcnNlV2ViU29ja2V0LnNlbmQobWVzc2FnZSk7XG4gIH1cblxuICBzdGF0aWMgcHVzaEVycm9yKFxuICAgIHBhcnNlV2ViU29ja2V0OiBhbnksXG4gICAgY29kZTogbnVtYmVyLFxuICAgIGVycm9yOiBzdHJpbmcsXG4gICAgcmVjb25uZWN0OiBib29sZWFuID0gdHJ1ZSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlciB8IHZvaWQgPSBudWxsXG4gICk6IHZvaWQge1xuICAgIENsaWVudC5wdXNoUmVzcG9uc2UoXG4gICAgICBwYXJzZVdlYlNvY2tldCxcbiAgICAgIEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgb3A6ICdlcnJvcicsXG4gICAgICAgIGVycm9yLFxuICAgICAgICBjb2RlLFxuICAgICAgICByZWNvbm5lY3QsXG4gICAgICAgIHJlcXVlc3RJZCxcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIGFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkOiBudW1iZXIsIHN1YnNjcmlwdGlvbkluZm86IGFueSk6IHZvaWQge1xuICAgIHRoaXMuc3Vic2NyaXB0aW9uSW5mb3Muc2V0KHJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG4gIH1cblxuICBnZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZDogbnVtYmVyKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5zdWJzY3JpcHRpb25JbmZvcy5nZXQocmVxdWVzdElkKTtcbiAgfVxuXG4gIGRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkOiBudW1iZXIpOiB2b2lkIHtcbiAgICByZXR1cm4gdGhpcy5zdWJzY3JpcHRpb25JbmZvcy5kZWxldGUocmVxdWVzdElkKTtcbiAgfVxuXG4gIF9wdXNoRXZlbnQodHlwZTogc3RyaW5nKTogRnVuY3Rpb24ge1xuICAgIHJldHVybiBmdW5jdGlvbiAoXG4gICAgICBzdWJzY3JpcHRpb25JZDogbnVtYmVyLFxuICAgICAgcGFyc2VPYmplY3RKU09OOiBhbnksXG4gICAgICBwYXJzZU9yaWdpbmFsT2JqZWN0SlNPTjogYW55XG4gICAgKTogdm9pZCB7XG4gICAgICBjb25zdCByZXNwb25zZTogTWVzc2FnZSA9IHtcbiAgICAgICAgb3A6IHR5cGUsXG4gICAgICAgIGNsaWVudElkOiB0aGlzLmlkLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH07XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbklkICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXNwb25zZVsncmVxdWVzdElkJ10gPSBzdWJzY3JpcHRpb25JZDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgcGFyc2VPYmplY3RKU09OICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBsZXQgZmllbGRzO1xuICAgICAgICBpZiAodGhpcy5zdWJzY3JpcHRpb25JbmZvcy5oYXMoc3Vic2NyaXB0aW9uSWQpKSB7XG4gICAgICAgICAgZmllbGRzID0gdGhpcy5zdWJzY3JpcHRpb25JbmZvcy5nZXQoc3Vic2NyaXB0aW9uSWQpLmZpZWxkcztcbiAgICAgICAgfVxuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSB0aGlzLl90b0pTT05XaXRoRmllbGRzKHBhcnNlT2JqZWN0SlNPTiwgZmllbGRzKTtcbiAgICAgICAgaWYgKHBhcnNlT3JpZ2luYWxPYmplY3RKU09OKSB7XG4gICAgICAgICAgcmVzcG9uc2VbJ29yaWdpbmFsJ10gPSB0aGlzLl90b0pTT05XaXRoRmllbGRzKHBhcnNlT3JpZ2luYWxPYmplY3RKU09OLCBmaWVsZHMpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBDbGllbnQucHVzaFJlc3BvbnNlKHRoaXMucGFyc2VXZWJTb2NrZXQsIEpTT04uc3RyaW5naWZ5KHJlc3BvbnNlKSk7XG4gICAgfTtcbiAgfVxuXG4gIF90b0pTT05XaXRoRmllbGRzKHBhcnNlT2JqZWN0SlNPTjogYW55LCBmaWVsZHM6IGFueSk6IEZsYXR0ZW5lZE9iamVjdERhdGEge1xuICAgIGlmICghZmllbGRzKSB7XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RKU09OO1xuICAgIH1cbiAgICBjb25zdCBsaW1pdGVkUGFyc2VPYmplY3QgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGRhZmF1bHRGaWVsZHMpIHtcbiAgICAgIGxpbWl0ZWRQYXJzZU9iamVjdFtmaWVsZF0gPSBwYXJzZU9iamVjdEpTT05bZmllbGRdO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIGZpZWxkcykge1xuICAgICAgaWYgKGZpZWxkIGluIHBhcnNlT2JqZWN0SlNPTikge1xuICAgICAgICBsaW1pdGVkUGFyc2VPYmplY3RbZmllbGRdID0gcGFyc2VPYmplY3RKU09OW2ZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJu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