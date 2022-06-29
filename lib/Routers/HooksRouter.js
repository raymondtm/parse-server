"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.HooksRouter = void 0;

var _node = require("parse/node");

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class HooksRouter extends _PromiseRouter.default {
  createHook(aHook, config) {
    return config.hooksController.createHook(aHook).then(hook => ({
      response: hook
    }));
  }

  updateHook(aHook, config) {
    return config.hooksController.updateHook(aHook).then(hook => ({
      response: hook
    }));
  }

  handlePost(req) {
    return this.createHook(req.body, req.config);
  }

  handleGetFunctions(req) {
    var hooksController = req.config.hooksController;

    if (req.params.functionName) {
      return hooksController.getFunction(req.params.functionName).then(foundFunction => {
        if (!foundFunction) {
          throw new _node.Parse.Error(143, `no function named: ${req.params.functionName} is defined`);
        }

        return Promise.resolve({
          response: foundFunction
        });
      });
    }

    return hooksController.getFunctions().then(functions => {
      return {
        response: functions || []
      };
    }, err => {
      throw err;
    });
  }

  handleGetTriggers(req) {
    var hooksController = req.config.hooksController;

    if (req.params.className && req.params.triggerName) {
      return hooksController.getTrigger(req.params.className, req.params.triggerName).then(foundTrigger => {
        if (!foundTrigger) {
          throw new _node.Parse.Error(143, `class ${req.params.className} does not exist`);
        }

        return Promise.resolve({
          response: foundTrigger
        });
      });
    }

    return hooksController.getTriggers().then(triggers => ({
      response: triggers || []
    }));
  }

  handleDelete(req) {
    var hooksController = req.config.hooksController;

    if (req.params.functionName) {
      return hooksController.deleteFunction(req.params.functionName).then(() => ({
        response: {}
      }));
    } else if (req.params.className && req.params.triggerName) {
      return hooksController.deleteTrigger(req.params.className, req.params.triggerName).then(() => ({
        response: {}
      }));
    }

    return Promise.resolve({
      response: {}
    });
  }

  handleUpdate(req) {
    var hook;

    if (req.params.functionName && req.body.url) {
      hook = {};
      hook.functionName = req.params.functionName;
      hook.url = req.body.url;
    } else if (req.params.className && req.params.triggerName && req.body.url) {
      hook = {};
      hook.className = req.params.className;
      hook.triggerName = req.params.triggerName;
      hook.url = req.body.url;
    } else {
      throw new _node.Parse.Error(143, 'invalid hook declaration');
    }

    return this.updateHook(hook, req.config);
  }

  handlePut(req) {
    var body = req.body;

    if (body.__op == 'Delete') {
      return this.handleDelete(req);
    } else {
      return this.handleUpdate(req);
    }
  }

  mountRoutes() {
    this.route('GET', '/hooks/functions', middleware.promiseEnforceMasterKeyAccess, this.handleGetFunctions.bind(this));
    this.route('GET', '/hooks/triggers', middleware.promiseEnforceMasterKeyAccess, this.handleGetTriggers.bind(this));
    this.route('GET', '/hooks/functions/:functionName', middleware.promiseEnforceMasterKeyAccess, this.handleGetFunctions.bind(this));
    this.route('GET', '/hooks/triggers/:className/:triggerName', middleware.promiseEnforceMasterKeyAccess, this.handleGetTriggers.bind(this));
    this.route('POST', '/hooks/functions', middleware.promiseEnforceMasterKeyAccess, this.handlePost.bind(this));
    this.route('POST', '/hooks/triggers', middleware.promiseEnforceMasterKeyAccess, this.handlePost.bind(this));
    this.route('PUT', '/hooks/functions/:functionName', middleware.promiseEnforceMasterKeyAccess, this.handlePut.bind(this));
    this.route('PUT', '/hooks/triggers/:className/:triggerName', middleware.promiseEnforceMasterKeyAccess, this.handlePut.bind(this));
  }

}

exports.HooksRouter = HooksRouter;
var _default = HooksRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJIb29rc1JvdXRlciIsIlByb21pc2VSb3V0ZXIiLCJjcmVhdGVIb29rIiwiYUhvb2siLCJjb25maWciLCJob29rc0NvbnRyb2xsZXIiLCJ0aGVuIiwiaG9vayIsInJlc3BvbnNlIiwidXBkYXRlSG9vayIsImhhbmRsZVBvc3QiLCJyZXEiLCJib2R5IiwiaGFuZGxlR2V0RnVuY3Rpb25zIiwicGFyYW1zIiwiZnVuY3Rpb25OYW1lIiwiZ2V0RnVuY3Rpb24iLCJmb3VuZEZ1bmN0aW9uIiwiUGFyc2UiLCJFcnJvciIsIlByb21pc2UiLCJyZXNvbHZlIiwiZ2V0RnVuY3Rpb25zIiwiZnVuY3Rpb25zIiwiZXJyIiwiaGFuZGxlR2V0VHJpZ2dlcnMiLCJjbGFzc05hbWUiLCJ0cmlnZ2VyTmFtZSIsImdldFRyaWdnZXIiLCJmb3VuZFRyaWdnZXIiLCJnZXRUcmlnZ2VycyIsInRyaWdnZXJzIiwiaGFuZGxlRGVsZXRlIiwiZGVsZXRlRnVuY3Rpb24iLCJkZWxldGVUcmlnZ2VyIiwiaGFuZGxlVXBkYXRlIiwidXJsIiwiaGFuZGxlUHV0IiwiX19vcCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJtaWRkbGV3YXJlIiwicHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MiLCJiaW5kIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvSG9va3NSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgUGFyc2UgfSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4uL1Byb21pc2VSb3V0ZXInO1xuaW1wb3J0ICogYXMgbWlkZGxld2FyZSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5cbmV4cG9ydCBjbGFzcyBIb29rc1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBjcmVhdGVIb29rKGFIb29rLCBjb25maWcpIHtcbiAgICByZXR1cm4gY29uZmlnLmhvb2tzQ29udHJvbGxlci5jcmVhdGVIb29rKGFIb29rKS50aGVuKGhvb2sgPT4gKHsgcmVzcG9uc2U6IGhvb2sgfSkpO1xuICB9XG5cbiAgdXBkYXRlSG9vayhhSG9vaywgY29uZmlnKSB7XG4gICAgcmV0dXJuIGNvbmZpZy5ob29rc0NvbnRyb2xsZXIudXBkYXRlSG9vayhhSG9vaykudGhlbihob29rID0+ICh7IHJlc3BvbnNlOiBob29rIH0pKTtcbiAgfVxuXG4gIGhhbmRsZVBvc3QocmVxKSB7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlSG9vayhyZXEuYm9keSwgcmVxLmNvbmZpZyk7XG4gIH1cblxuICBoYW5kbGVHZXRGdW5jdGlvbnMocmVxKSB7XG4gICAgdmFyIGhvb2tzQ29udHJvbGxlciA9IHJlcS5jb25maWcuaG9va3NDb250cm9sbGVyO1xuICAgIGlmIChyZXEucGFyYW1zLmZ1bmN0aW9uTmFtZSkge1xuICAgICAgcmV0dXJuIGhvb2tzQ29udHJvbGxlci5nZXRGdW5jdGlvbihyZXEucGFyYW1zLmZ1bmN0aW9uTmFtZSkudGhlbihmb3VuZEZ1bmN0aW9uID0+IHtcbiAgICAgICAgaWYgKCFmb3VuZEZ1bmN0aW9uKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDE0MywgYG5vIGZ1bmN0aW9uIG5hbWVkOiAke3JlcS5wYXJhbXMuZnVuY3Rpb25OYW1lfSBpcyBkZWZpbmVkYCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHJlc3BvbnNlOiBmb3VuZEZ1bmN0aW9uIH0pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhvb2tzQ29udHJvbGxlci5nZXRGdW5jdGlvbnMoKS50aGVuKFxuICAgICAgZnVuY3Rpb25zID0+IHtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IGZ1bmN0aW9ucyB8fCBbXSB9O1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgaGFuZGxlR2V0VHJpZ2dlcnMocmVxKSB7XG4gICAgdmFyIGhvb2tzQ29udHJvbGxlciA9IHJlcS5jb25maWcuaG9va3NDb250cm9sbGVyO1xuICAgIGlmIChyZXEucGFyYW1zLmNsYXNzTmFtZSAmJiByZXEucGFyYW1zLnRyaWdnZXJOYW1lKSB7XG4gICAgICByZXR1cm4gaG9va3NDb250cm9sbGVyXG4gICAgICAgIC5nZXRUcmlnZ2VyKHJlcS5wYXJhbXMuY2xhc3NOYW1lLCByZXEucGFyYW1zLnRyaWdnZXJOYW1lKVxuICAgICAgICAudGhlbihmb3VuZFRyaWdnZXIgPT4ge1xuICAgICAgICAgIGlmICghZm91bmRUcmlnZ2VyKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTQzLCBgY2xhc3MgJHtyZXEucGFyYW1zLmNsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3RgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHJlc3BvbnNlOiBmb3VuZFRyaWdnZXIgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBob29rc0NvbnRyb2xsZXIuZ2V0VHJpZ2dlcnMoKS50aGVuKHRyaWdnZXJzID0+ICh7IHJlc3BvbnNlOiB0cmlnZ2VycyB8fCBbXSB9KSk7XG4gIH1cblxuICBoYW5kbGVEZWxldGUocmVxKSB7XG4gICAgdmFyIGhvb2tzQ29udHJvbGxlciA9IHJlcS5jb25maWcuaG9va3NDb250cm9sbGVyO1xuICAgIGlmIChyZXEucGFyYW1zLmZ1bmN0aW9uTmFtZSkge1xuICAgICAgcmV0dXJuIGhvb2tzQ29udHJvbGxlci5kZWxldGVGdW5jdGlvbihyZXEucGFyYW1zLmZ1bmN0aW9uTmFtZSkudGhlbigoKSA9PiAoeyByZXNwb25zZToge30gfSkpO1xuICAgIH0gZWxzZSBpZiAocmVxLnBhcmFtcy5jbGFzc05hbWUgJiYgcmVxLnBhcmFtcy50cmlnZ2VyTmFtZSkge1xuICAgICAgcmV0dXJuIGhvb2tzQ29udHJvbGxlclxuICAgICAgICAuZGVsZXRlVHJpZ2dlcihyZXEucGFyYW1zLmNsYXNzTmFtZSwgcmVxLnBhcmFtcy50cmlnZ2VyTmFtZSlcbiAgICAgICAgLnRoZW4oKCkgPT4gKHsgcmVzcG9uc2U6IHt9IH0pKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IHJlc3BvbnNlOiB7fSB9KTtcbiAgfVxuXG4gIGhhbmRsZVVwZGF0ZShyZXEpIHtcbiAgICB2YXIgaG9vaztcbiAgICBpZiAocmVxLnBhcmFtcy5mdW5jdGlvbk5hbWUgJiYgcmVxLmJvZHkudXJsKSB7XG4gICAgICBob29rID0ge307XG4gICAgICBob29rLmZ1bmN0aW9uTmFtZSA9IHJlcS5wYXJhbXMuZnVuY3Rpb25OYW1lO1xuICAgICAgaG9vay51cmwgPSByZXEuYm9keS51cmw7XG4gICAgfSBlbHNlIGlmIChyZXEucGFyYW1zLmNsYXNzTmFtZSAmJiByZXEucGFyYW1zLnRyaWdnZXJOYW1lICYmIHJlcS5ib2R5LnVybCkge1xuICAgICAgaG9vayA9IHt9O1xuICAgICAgaG9vay5jbGFzc05hbWUgPSByZXEucGFyYW1zLmNsYXNzTmFtZTtcbiAgICAgIGhvb2sudHJpZ2dlck5hbWUgPSByZXEucGFyYW1zLnRyaWdnZXJOYW1lO1xuICAgICAgaG9vay51cmwgPSByZXEuYm9keS51cmw7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxNDMsICdpbnZhbGlkIGhvb2sgZGVjbGFyYXRpb24nKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudXBkYXRlSG9vayhob29rLCByZXEuY29uZmlnKTtcbiAgfVxuXG4gIGhhbmRsZVB1dChyZXEpIHtcbiAgICB2YXIgYm9keSA9IHJlcS5ib2R5O1xuICAgIGlmIChib2R5Ll9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2hvb2tzL2Z1bmN0aW9ucycsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5oYW5kbGVHZXRGdW5jdGlvbnMuYmluZCh0aGlzKVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9ob29rcy90cmlnZ2VycycsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5oYW5kbGVHZXRUcmlnZ2Vycy5iaW5kKHRoaXMpXG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2hvb2tzL2Z1bmN0aW9ucy86ZnVuY3Rpb25OYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmhhbmRsZUdldEZ1bmN0aW9ucy5iaW5kKHRoaXMpXG4gICAgKTtcbiAgICB0aGlzLnJvdXRlKFxuICAgICAgJ0dFVCcsXG4gICAgICAnL2hvb2tzL3RyaWdnZXJzLzpjbGFzc05hbWUvOnRyaWdnZXJOYW1lJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmhhbmRsZUdldFRyaWdnZXJzLmJpbmQodGhpcylcbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICAnL2hvb2tzL2Z1bmN0aW9ucycsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5oYW5kbGVQb3N0LmJpbmQodGhpcylcbiAgICApO1xuICAgIHRoaXMucm91dGUoXG4gICAgICAnUE9TVCcsXG4gICAgICAnL2hvb2tzL3RyaWdnZXJzJyxcbiAgICAgIG1pZGRsZXdhcmUucHJvbWlzZUVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MsXG4gICAgICB0aGlzLmhhbmRsZVBvc3QuYmluZCh0aGlzKVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQVVQnLFxuICAgICAgJy9ob29rcy9mdW5jdGlvbnMvOmZ1bmN0aW9uTmFtZScsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5oYW5kbGVQdXQuYmluZCh0aGlzKVxuICAgICk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQVVQnLFxuICAgICAgJy9ob29rcy90cmlnZ2Vycy86Y2xhc3NOYW1lLzp0cmlnZ2VyTmFtZScsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgdGhpcy5oYW5kbGVQdXQuYmluZCh0aGlzKVxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgSG9va3NSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7RUFDN0NDLFVBQVUsQ0FBQ0MsS0FBRCxFQUFRQyxNQUFSLEVBQWdCO0lBQ3hCLE9BQU9BLE1BQU0sQ0FBQ0MsZUFBUCxDQUF1QkgsVUFBdkIsQ0FBa0NDLEtBQWxDLEVBQXlDRyxJQUF6QyxDQUE4Q0MsSUFBSSxLQUFLO01BQUVDLFFBQVEsRUFBRUQ7SUFBWixDQUFMLENBQWxELENBQVA7RUFDRDs7RUFFREUsVUFBVSxDQUFDTixLQUFELEVBQVFDLE1BQVIsRUFBZ0I7SUFDeEIsT0FBT0EsTUFBTSxDQUFDQyxlQUFQLENBQXVCSSxVQUF2QixDQUFrQ04sS0FBbEMsRUFBeUNHLElBQXpDLENBQThDQyxJQUFJLEtBQUs7TUFBRUMsUUFBUSxFQUFFRDtJQUFaLENBQUwsQ0FBbEQsQ0FBUDtFQUNEOztFQUVERyxVQUFVLENBQUNDLEdBQUQsRUFBTTtJQUNkLE9BQU8sS0FBS1QsVUFBTCxDQUFnQlMsR0FBRyxDQUFDQyxJQUFwQixFQUEwQkQsR0FBRyxDQUFDUCxNQUE5QixDQUFQO0VBQ0Q7O0VBRURTLGtCQUFrQixDQUFDRixHQUFELEVBQU07SUFDdEIsSUFBSU4sZUFBZSxHQUFHTSxHQUFHLENBQUNQLE1BQUosQ0FBV0MsZUFBakM7O0lBQ0EsSUFBSU0sR0FBRyxDQUFDRyxNQUFKLENBQVdDLFlBQWYsRUFBNkI7TUFDM0IsT0FBT1YsZUFBZSxDQUFDVyxXQUFoQixDQUE0QkwsR0FBRyxDQUFDRyxNQUFKLENBQVdDLFlBQXZDLEVBQXFEVCxJQUFyRCxDQUEwRFcsYUFBYSxJQUFJO1FBQ2hGLElBQUksQ0FBQ0EsYUFBTCxFQUFvQjtVQUNsQixNQUFNLElBQUlDLFdBQUEsQ0FBTUMsS0FBVixDQUFnQixHQUFoQixFQUFzQixzQkFBcUJSLEdBQUcsQ0FBQ0csTUFBSixDQUFXQyxZQUFhLGFBQW5FLENBQU47UUFDRDs7UUFDRCxPQUFPSyxPQUFPLENBQUNDLE9BQVIsQ0FBZ0I7VUFBRWIsUUFBUSxFQUFFUztRQUFaLENBQWhCLENBQVA7TUFDRCxDQUxNLENBQVA7SUFNRDs7SUFFRCxPQUFPWixlQUFlLENBQUNpQixZQUFoQixHQUErQmhCLElBQS9CLENBQ0xpQixTQUFTLElBQUk7TUFDWCxPQUFPO1FBQUVmLFFBQVEsRUFBRWUsU0FBUyxJQUFJO01BQXpCLENBQVA7SUFDRCxDQUhJLEVBSUxDLEdBQUcsSUFBSTtNQUNMLE1BQU1BLEdBQU47SUFDRCxDQU5JLENBQVA7RUFRRDs7RUFFREMsaUJBQWlCLENBQUNkLEdBQUQsRUFBTTtJQUNyQixJQUFJTixlQUFlLEdBQUdNLEdBQUcsQ0FBQ1AsTUFBSixDQUFXQyxlQUFqQzs7SUFDQSxJQUFJTSxHQUFHLENBQUNHLE1BQUosQ0FBV1ksU0FBWCxJQUF3QmYsR0FBRyxDQUFDRyxNQUFKLENBQVdhLFdBQXZDLEVBQW9EO01BQ2xELE9BQU90QixlQUFlLENBQ25CdUIsVUFESSxDQUNPakIsR0FBRyxDQUFDRyxNQUFKLENBQVdZLFNBRGxCLEVBQzZCZixHQUFHLENBQUNHLE1BQUosQ0FBV2EsV0FEeEMsRUFFSnJCLElBRkksQ0FFQ3VCLFlBQVksSUFBSTtRQUNwQixJQUFJLENBQUNBLFlBQUwsRUFBbUI7VUFDakIsTUFBTSxJQUFJWCxXQUFBLENBQU1DLEtBQVYsQ0FBZ0IsR0FBaEIsRUFBc0IsU0FBUVIsR0FBRyxDQUFDRyxNQUFKLENBQVdZLFNBQVUsaUJBQW5ELENBQU47UUFDRDs7UUFDRCxPQUFPTixPQUFPLENBQUNDLE9BQVIsQ0FBZ0I7VUFBRWIsUUFBUSxFQUFFcUI7UUFBWixDQUFoQixDQUFQO01BQ0QsQ0FQSSxDQUFQO0lBUUQ7O0lBRUQsT0FBT3hCLGVBQWUsQ0FBQ3lCLFdBQWhCLEdBQThCeEIsSUFBOUIsQ0FBbUN5QixRQUFRLEtBQUs7TUFBRXZCLFFBQVEsRUFBRXVCLFFBQVEsSUFBSTtJQUF4QixDQUFMLENBQTNDLENBQVA7RUFDRDs7RUFFREMsWUFBWSxDQUFDckIsR0FBRCxFQUFNO0lBQ2hCLElBQUlOLGVBQWUsR0FBR00sR0FBRyxDQUFDUCxNQUFKLENBQVdDLGVBQWpDOztJQUNBLElBQUlNLEdBQUcsQ0FBQ0csTUFBSixDQUFXQyxZQUFmLEVBQTZCO01BQzNCLE9BQU9WLGVBQWUsQ0FBQzRCLGNBQWhCLENBQStCdEIsR0FBRyxDQUFDRyxNQUFKLENBQVdDLFlBQTFDLEVBQXdEVCxJQUF4RCxDQUE2RCxPQUFPO1FBQUVFLFFBQVEsRUFBRTtNQUFaLENBQVAsQ0FBN0QsQ0FBUDtJQUNELENBRkQsTUFFTyxJQUFJRyxHQUFHLENBQUNHLE1BQUosQ0FBV1ksU0FBWCxJQUF3QmYsR0FBRyxDQUFDRyxNQUFKLENBQVdhLFdBQXZDLEVBQW9EO01BQ3pELE9BQU90QixlQUFlLENBQ25CNkIsYUFESSxDQUNVdkIsR0FBRyxDQUFDRyxNQUFKLENBQVdZLFNBRHJCLEVBQ2dDZixHQUFHLENBQUNHLE1BQUosQ0FBV2EsV0FEM0MsRUFFSnJCLElBRkksQ0FFQyxPQUFPO1FBQUVFLFFBQVEsRUFBRTtNQUFaLENBQVAsQ0FGRCxDQUFQO0lBR0Q7O0lBQ0QsT0FBT1ksT0FBTyxDQUFDQyxPQUFSLENBQWdCO01BQUViLFFBQVEsRUFBRTtJQUFaLENBQWhCLENBQVA7RUFDRDs7RUFFRDJCLFlBQVksQ0FBQ3hCLEdBQUQsRUFBTTtJQUNoQixJQUFJSixJQUFKOztJQUNBLElBQUlJLEdBQUcsQ0FBQ0csTUFBSixDQUFXQyxZQUFYLElBQTJCSixHQUFHLENBQUNDLElBQUosQ0FBU3dCLEdBQXhDLEVBQTZDO01BQzNDN0IsSUFBSSxHQUFHLEVBQVA7TUFDQUEsSUFBSSxDQUFDUSxZQUFMLEdBQW9CSixHQUFHLENBQUNHLE1BQUosQ0FBV0MsWUFBL0I7TUFDQVIsSUFBSSxDQUFDNkIsR0FBTCxHQUFXekIsR0FBRyxDQUFDQyxJQUFKLENBQVN3QixHQUFwQjtJQUNELENBSkQsTUFJTyxJQUFJekIsR0FBRyxDQUFDRyxNQUFKLENBQVdZLFNBQVgsSUFBd0JmLEdBQUcsQ0FBQ0csTUFBSixDQUFXYSxXQUFuQyxJQUFrRGhCLEdBQUcsQ0FBQ0MsSUFBSixDQUFTd0IsR0FBL0QsRUFBb0U7TUFDekU3QixJQUFJLEdBQUcsRUFBUDtNQUNBQSxJQUFJLENBQUNtQixTQUFMLEdBQWlCZixHQUFHLENBQUNHLE1BQUosQ0FBV1ksU0FBNUI7TUFDQW5CLElBQUksQ0FBQ29CLFdBQUwsR0FBbUJoQixHQUFHLENBQUNHLE1BQUosQ0FBV2EsV0FBOUI7TUFDQXBCLElBQUksQ0FBQzZCLEdBQUwsR0FBV3pCLEdBQUcsQ0FBQ0MsSUFBSixDQUFTd0IsR0FBcEI7SUFDRCxDQUxNLE1BS0E7TUFDTCxNQUFNLElBQUlsQixXQUFBLENBQU1DLEtBQVYsQ0FBZ0IsR0FBaEIsRUFBcUIsMEJBQXJCLENBQU47SUFDRDs7SUFDRCxPQUFPLEtBQUtWLFVBQUwsQ0FBZ0JGLElBQWhCLEVBQXNCSSxHQUFHLENBQUNQLE1BQTFCLENBQVA7RUFDRDs7RUFFRGlDLFNBQVMsQ0FBQzFCLEdBQUQsRUFBTTtJQUNiLElBQUlDLElBQUksR0FBR0QsR0FBRyxDQUFDQyxJQUFmOztJQUNBLElBQUlBLElBQUksQ0FBQzBCLElBQUwsSUFBYSxRQUFqQixFQUEyQjtNQUN6QixPQUFPLEtBQUtOLFlBQUwsQ0FBa0JyQixHQUFsQixDQUFQO0lBQ0QsQ0FGRCxNQUVPO01BQ0wsT0FBTyxLQUFLd0IsWUFBTCxDQUFrQnhCLEdBQWxCLENBQVA7SUFDRDtFQUNGOztFQUVENEIsV0FBVyxHQUFHO0lBQ1osS0FBS0MsS0FBTCxDQUNFLEtBREYsRUFFRSxrQkFGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUUsS0FBSzdCLGtCQUFMLENBQXdCOEIsSUFBeEIsQ0FBNkIsSUFBN0IsQ0FKRjtJQU1BLEtBQUtILEtBQUwsQ0FDRSxLQURGLEVBRUUsaUJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFLEtBQUtqQixpQkFBTCxDQUF1QmtCLElBQXZCLENBQTRCLElBQTVCLENBSkY7SUFNQSxLQUFLSCxLQUFMLENBQ0UsS0FERixFQUVFLGdDQUZGLEVBR0VDLFVBQVUsQ0FBQ0MsNkJBSGIsRUFJRSxLQUFLN0Isa0JBQUwsQ0FBd0I4QixJQUF4QixDQUE2QixJQUE3QixDQUpGO0lBTUEsS0FBS0gsS0FBTCxDQUNFLEtBREYsRUFFRSx5Q0FGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUUsS0FBS2pCLGlCQUFMLENBQXVCa0IsSUFBdkIsQ0FBNEIsSUFBNUIsQ0FKRjtJQU1BLEtBQUtILEtBQUwsQ0FDRSxNQURGLEVBRUUsa0JBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFLEtBQUtoQyxVQUFMLENBQWdCaUMsSUFBaEIsQ0FBcUIsSUFBckIsQ0FKRjtJQU1BLEtBQUtILEtBQUwsQ0FDRSxNQURGLEVBRUUsaUJBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFLEtBQUtoQyxVQUFMLENBQWdCaUMsSUFBaEIsQ0FBcUIsSUFBckIsQ0FKRjtJQU1BLEtBQUtILEtBQUwsQ0FDRSxLQURGLEVBRUUsZ0NBRkYsRUFHRUMsVUFBVSxDQUFDQyw2QkFIYixFQUlFLEtBQUtMLFNBQUwsQ0FBZU0sSUFBZixDQUFvQixJQUFwQixDQUpGO0lBTUEsS0FBS0gsS0FBTCxDQUNFLEtBREYsRUFFRSx5Q0FGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUUsS0FBS0wsU0FBTCxDQUFlTSxJQUFmLENBQW9CLElBQXBCLENBSkY7RUFNRDs7QUF6STRDOzs7ZUE0SWhDM0MsVyJ9