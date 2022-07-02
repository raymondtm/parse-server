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
      req.params.className = this.className();
      return _FunctionsRouter.FunctionsRouter.handleCloudFunction(req);
    });
  }

}

exports.RolesRouter = RolesRouter;
var _default = RolesRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSb2xlc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwicmVxIiwiaGFuZGxlRmluZCIsImhhbmRsZUdldCIsImhhbmRsZUNyZWF0ZSIsImhhbmRsZVVwZGF0ZSIsImhhbmRsZURlbGV0ZSIsInBhcmFtcyIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iXSwic291cmNlcyI6WyIuLi8uLi9zcmMvUm91dGVycy9Sb2xlc1JvdXRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi9GdW5jdGlvbnNSb3V0ZXInO1xuXG5leHBvcnQgY2xhc3MgUm9sZXNSb3V0ZXIgZXh0ZW5kcyBDbGFzc2VzUm91dGVyIHtcbiAgY2xhc3NOYW1lKCkge1xuICAgIHJldHVybiAnX1JvbGUnO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9yb2xlcycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9yb2xlcy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcm9sZXMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQ3JlYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy9yb2xlcy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVXBkYXRlKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnREVMRVRFJywgJy9yb2xlcy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRGVsZXRlKHJlcSk7XG4gICAgfSk7XG5cbiAgICAvLyBOT1RFOiBBbiBhbGlhcyBvZiBjbG91ZCBmdW5jdGlvblxuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3JvbGVzLzpmdW5jdGlvbk5hbWUnLCByZXEgPT4ge1xuICAgICAgcmVxLnBhcmFtcy5jbGFzc05hbWUgPSB0aGlzLmNsYXNzTmFtZSgpO1xuICAgICAgcmV0dXJuIEZ1bmN0aW9uc1JvdXRlci5oYW5kbGVDbG91ZEZ1bmN0aW9uKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgUm9sZXNSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7OztBQUVPLE1BQU1BLFdBQU4sU0FBMEJDLHNCQUExQixDQUF3QztFQUM3Q0MsU0FBUyxHQUFHO0lBQ1YsT0FBTyxPQUFQO0VBQ0Q7O0VBRURDLFdBQVcsR0FBRztJQUNaLEtBQUtDLEtBQUwsQ0FBVyxLQUFYLEVBQWtCLFFBQWxCLEVBQTRCQyxHQUFHLElBQUk7TUFDakMsT0FBTyxLQUFLQyxVQUFMLENBQWdCRCxHQUFoQixDQUFQO0lBQ0QsQ0FGRDtJQUdBLEtBQUtELEtBQUwsQ0FBVyxLQUFYLEVBQWtCLGtCQUFsQixFQUFzQ0MsR0FBRyxJQUFJO01BQzNDLE9BQU8sS0FBS0UsU0FBTCxDQUFlRixHQUFmLENBQVA7SUFDRCxDQUZEO0lBR0EsS0FBS0QsS0FBTCxDQUFXLE1BQVgsRUFBbUIsUUFBbkIsRUFBNkJDLEdBQUcsSUFBSTtNQUNsQyxPQUFPLEtBQUtHLFlBQUwsQ0FBa0JILEdBQWxCLENBQVA7SUFDRCxDQUZEO0lBR0EsS0FBS0QsS0FBTCxDQUFXLEtBQVgsRUFBa0Isa0JBQWxCLEVBQXNDQyxHQUFHLElBQUk7TUFDM0MsT0FBTyxLQUFLSSxZQUFMLENBQWtCSixHQUFsQixDQUFQO0lBQ0QsQ0FGRDtJQUdBLEtBQUtELEtBQUwsQ0FBVyxRQUFYLEVBQXFCLGtCQUFyQixFQUF5Q0MsR0FBRyxJQUFJO01BQzlDLE9BQU8sS0FBS0ssWUFBTCxDQUFrQkwsR0FBbEIsQ0FBUDtJQUNELENBRkQsRUFiWSxDQWlCWjs7SUFDQSxLQUFLRCxLQUFMLENBQVcsTUFBWCxFQUFtQixzQkFBbkIsRUFBMkNDLEdBQUcsSUFBSTtNQUNoREEsR0FBRyxDQUFDTSxNQUFKLENBQVdULFNBQVgsR0FBdUIsS0FBS0EsU0FBTCxFQUF2QjtNQUNBLE9BQU9VLGdDQUFBLENBQWdCQyxtQkFBaEIsQ0FBb0NSLEdBQXBDLENBQVA7SUFDRCxDQUhEO0VBSUQ7O0FBM0I0Qzs7O2VBOEJoQ0wsVyJ9