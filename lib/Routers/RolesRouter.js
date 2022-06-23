"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.RolesRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _FunctionsRouter = require("./FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class RolesRouter extends _ClassesRouter.default {
  className() {
    return '_Role';
  }

  mountRoutes() {
    this.route('GET', '/roles', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/roles/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/roles', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/roles/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/roles/:objectId', req => {
      return this.handleDelete(req);
    }); // NOTE: An alias of cloud function

    this.route('POST', '/roles/:functionName', req => {
      req.params.functionName = `${this.className()}.${req.params.functionName}`;
      return _FunctionsRouter.FunctionsRouter.handleCloudFunction(req);
    });
  }

}

exports.RolesRouter = RolesRouter;
var _default = RolesRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSb2xlc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwicmVxIiwiaGFuZGxlRmluZCIsImhhbmRsZUdldCIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSIsInBhcmFtcyIsImZ1bmN0aW9uTmFtZSIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9Sb2xlc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9GdW5jdGlvbnNSb3V0ZXInO1xuXG5leHBvcnQgY2xhc3MgUm9sZXNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1JvbGUnO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9yb2xlcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9yb2xlcy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcm9sZXMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy9yb2xlcy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy9yb2xlcy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG5cbiAgICAvLyBOT1RFOiBBbiBhbGlhcyBvZiBjbG91ZCBmdW5jdGlvblxuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JvbGVzLzpmdW5jdGlvbk5hbWUnLCByZXEgPT4ge1xuICAgICAgcmVxLnBhcmFtcy5mdW5jdGlvbk5hbWUgPSBgJHt0aGlzLmNsYXNzTmFtZSgpfS4ke3JlcS5wYXJhbXMuZnVuY3Rpb25OYW1lfWA7XG4gICAgICByZXR1cm4gRnVuY3Rpb25zUm91dGVyLmhhbmRsZUNsb3VkRnVuY3Rpb24ocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBSb2xlc1JvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOzs7O0FBRU8sTUFBTUEsV0FBTixTQUEwQkMsc0JBQTFCLENBQXdDO0VBQzdDQyxTQUFTLEdBQUc7SUFDVixPQUFPLE9BQVA7RUFDRDs7RUFFREMsV0FBVyxHQUFHO0lBQ1osS0FBS0MsS0FBTCxDQUFXLEtBQVgsRUFBa0IsUUFBbEIsRUFBNEJDLEdBQUcsSUFBSTtNQUNqQyxPQUFPLEtBQUtDLFVBQUwsQ0FBZ0JELEdBQWhCLENBQVA7SUFDRCxDQUZEO0lBR0EsS0FBS0QsS0FBTCxDQUFXLEtBQVgsRUFBa0Isa0JBQWxCLEVBQXNDQyxHQUFHLElBQUk7TUFDM0MsT0FBTyxLQUFLRSxTQUFMLENBQWVGLEdBQWYsQ0FBUDtJQUNELENBRkQ7SUFHQSxLQUFLRCxLQUFMLENBQVcsTUFBWCxFQUFtQixRQUFuQixFQUE2QkMsR0FBRyxJQUFJO01BQ2xDLE9BQU8sS0FBS0csWUFBTCxDQUFrQkgsR0FBbEIsQ0FBUDtJQUNELENBRkQ7SUFHQSxLQUFLRCxLQUFMLENBQVcsS0FBWCxFQUFrQixrQkFBbEIsRUFBc0NDLEdBQUcsSUFBSTtNQUMzQyxPQUFPLEtBQUtJLFlBQUwsQ0FBa0JKLEdBQWxCLENBQVA7SUFDRCxDQUZEO0lBR0EsS0FBS0QsS0FBTCxDQUFXLFFBQVgsRUFBcUIsa0JBQXJCLEVBQXlDQyxHQUFHLElBQUk7TUFDOUMsT0FBTyxLQUFLSyxZQUFMLENBQWtCTCxHQUFsQixDQUFQO0lBQ0QsQ0FGRCxFQWJZLENBaUJaOztJQUNBLEtBQUtELEtBQUwsQ0FBVyxNQUFYLEVBQW1CLHNCQUFuQixFQUEyQ0MsR0FBRyxJQUFJO01BQ2hEQSxHQUFHLENBQUNNLE1BQUosQ0FBV0MsWUFBWCxHQUEyQixHQUFFLEtBQUtWLFNBQUwsRUFBaUIsSUFBR0csR0FBRyxDQUFDTSxNQUFKLENBQVdDLFlBQWEsRUFBekU7TUFDQSxPQUFPQyxnQ0FBQSxDQUFnQkMsbUJBQWhCLENBQW9DVCxHQUFwQyxDQUFQO0lBQ0QsQ0FIRDtFQUlEOztBQTNCNEM7OztlQThCaENMLFcifQ==