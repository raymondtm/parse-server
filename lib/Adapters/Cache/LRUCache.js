"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.LRUCache = void 0;

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _defaults = _interopRequireDefault(require("../../defaults"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class LRUCache {
  constructor({
    ttl = _defaults.default.cacheTTL,
    maxSize = _defaults.default.cacheMaxSize
  }) {
    this.cache = new _lruCache.default({
      max: maxSize,
      maxAge: ttl
    });
  }

  get(key) {
    return this.cache.get(key) || null;
  }

  put(key, value, ttl = this.ttl) {
    this.cache.set(key, value, ttl);
  }

  del(key) {
    this.cache.del(key);
  }

  clear() {
    this.cache.reset();
  }

}

exports.LRUCache = LRUCache;
var _default = LRUCache;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJMUlVDYWNoZSIsImNvbnN0cnVjdG9yIiwidHRsIiwiZGVmYXVsdHMiLCJjYWNoZVRUTCIsIm1heFNpemUiLCJjYWNoZU1heFNpemUiLCJjYWNoZSIsIkxSVSIsIm1heCIsIm1heEFnZSIsImdldCIsImtleSIsInB1dCIsInZhbHVlIiwic2V0IiwiZGVsIiwiY2xlYXIiLCJyZXNldCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9DYWNoZS9MUlVDYWNoZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5leHBvcnQgY2xhc3MgTFJVQ2FjaGUge1xuICBjb25zdHJ1Y3Rvcih7IHR0bCA9IGRlZmF1bHRzLmNhY2hlVFRMLCBtYXhTaXplID0gZGVmYXVsdHMuY2FjaGVNYXhTaXplIH0pIHtcbiAgICB0aGlzLmNhY2hlID0gbmV3IExSVSh7XG4gICAgICBtYXg6IG1heFNpemUsXG4gICAgICBtYXhBZ2U6IHR0bCxcbiAgICB9KTtcbiAgfVxuXG4gIGdldChrZXkpIHtcbiAgICByZXR1cm4gdGhpcy5jYWNoZS5nZXQoa2V5KSB8fCBudWxsO1xuICB9XG5cbiAgcHV0KGtleSwgdmFsdWUsIHR0bCA9IHRoaXMudHRsKSB7XG4gICAgdGhpcy5jYWNoZS5zZXQoa2V5LCB2YWx1ZSwgdHRsKTtcbiAgfVxuXG4gIGRlbChrZXkpIHtcbiAgICB0aGlzLmNhY2hlLmRlbChrZXkpO1xuICB9XG5cbiAgY2xlYXIoKSB7XG4gICAgdGhpcy5jYWNoZS5yZXNldCgpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IExSVUNhY2hlO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7Ozs7QUFFTyxNQUFNQSxRQUFOLENBQWU7RUFDcEJDLFdBQVcsQ0FBQztJQUFFQyxHQUFHLEdBQUdDLGlCQUFBLENBQVNDLFFBQWpCO0lBQTJCQyxPQUFPLEdBQUdGLGlCQUFBLENBQVNHO0VBQTlDLENBQUQsRUFBK0Q7SUFDeEUsS0FBS0MsS0FBTCxHQUFhLElBQUlDLGlCQUFKLENBQVE7TUFDbkJDLEdBQUcsRUFBRUosT0FEYztNQUVuQkssTUFBTSxFQUFFUjtJQUZXLENBQVIsQ0FBYjtFQUlEOztFQUVEUyxHQUFHLENBQUNDLEdBQUQsRUFBTTtJQUNQLE9BQU8sS0FBS0wsS0FBTCxDQUFXSSxHQUFYLENBQWVDLEdBQWYsS0FBdUIsSUFBOUI7RUFDRDs7RUFFREMsR0FBRyxDQUFDRCxHQUFELEVBQU1FLEtBQU4sRUFBYVosR0FBRyxHQUFHLEtBQUtBLEdBQXhCLEVBQTZCO0lBQzlCLEtBQUtLLEtBQUwsQ0FBV1EsR0FBWCxDQUFlSCxHQUFmLEVBQW9CRSxLQUFwQixFQUEyQlosR0FBM0I7RUFDRDs7RUFFRGMsR0FBRyxDQUFDSixHQUFELEVBQU07SUFDUCxLQUFLTCxLQUFMLENBQVdTLEdBQVgsQ0FBZUosR0FBZjtFQUNEOztFQUVESyxLQUFLLEdBQUc7SUFDTixLQUFLVixLQUFMLENBQVdXLEtBQVg7RUFDRDs7QUF0Qm1COzs7ZUF5QlBsQixRIn0=