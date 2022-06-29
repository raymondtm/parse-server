"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PubSubAdapter = void 0;

/*eslint no-unused-vars: "off"*/

/**
 * @module Adapters
 */

/**
 * @interface PubSubAdapter
 */
class PubSubAdapter {
  /**
   * @returns {PubSubAdapter.Publisher}
   */
  static createPublisher() {}
  /**
   * @returns {PubSubAdapter.Subscriber}
   */


  static createSubscriber() {}

}
/**
 * @interface Publisher
 * @memberof PubSubAdapter
 */


exports.PubSubAdapter = PubSubAdapter;
var _default = PubSubAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQdWJTdWJBZGFwdGVyIiwiY3JlYXRlUHVibGlzaGVyIiwiY3JlYXRlU3Vic2NyaWJlciJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9QdWJTdWIvUHViU3ViQWRhcHRlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvKmVzbGludCBuby11bnVzZWQtdmFyczogXCJvZmZcIiovXG4vKipcbiAqIEBtb2R1bGUgQWRhcHRlcnNcbiAqL1xuLyoqXG4gKiBAaW50ZXJmYWNlIFB1YlN1YkFkYXB0ZXJcbiAqL1xuZXhwb3J0IGNsYXNzIFB1YlN1YkFkYXB0ZXIge1xuICAvKipcbiAgICogQHJldHVybnMge1B1YlN1YkFkYXB0ZXIuUHVibGlzaGVyfVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZVB1Ymxpc2hlcigpIHt9XG4gIC8qKlxuICAgKiBAcmV0dXJucyB7UHViU3ViQWRhcHRlci5TdWJzY3JpYmVyfVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZVN1YnNjcmliZXIoKSB7fVxufVxuXG4vKipcbiAqIEBpbnRlcmZhY2UgUHVibGlzaGVyXG4gKiBAbWVtYmVyb2YgUHViU3ViQWRhcHRlclxuICovXG5pbnRlcmZhY2UgUHVibGlzaGVyIHtcbiAgLyoqXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjaGFubmVsIHRoZSBjaGFubmVsIGluIHdoaWNoIHRvIHB1Ymxpc2hcbiAgICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2UgdGhlIG1lc3NhZ2UgdG8gcHVibGlzaFxuICAgKi9cbiAgcHVibGlzaChjaGFubmVsOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQ7XG59XG5cbi8qKlxuICogQGludGVyZmFjZSBTdWJzY3JpYmVyXG4gKiBAbWVtYmVyb2YgUHViU3ViQWRhcHRlclxuICovXG5pbnRlcmZhY2UgU3Vic2NyaWJlciB7XG4gIC8qKlxuICAgKiBjYWxsZWQgd2hlbiBhIG5ldyBzdWJzY3JpcHRpb24gdGhlIGNoYW5uZWwgaXMgcmVxdWlyZWRcbiAgICogQHBhcmFtIHtTdHJpbmd9IGNoYW5uZWwgdGhlIGNoYW5uZWwgdG8gc3Vic2NyaWJlXG4gICAqL1xuICBzdWJzY3JpYmUoY2hhbm5lbDogc3RyaW5nKTogdm9pZDtcblxuICAvKipcbiAgICogY2FsbGVkIHdoZW4gdGhlIHN1YnNjcmlwdGlvbiBmcm9tIHRoZSBjaGFubmVsIHNob3VsZCBiZSBzdG9wcGVkXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBjaGFubmVsXG4gICAqL1xuICB1bnN1YnNjcmliZShjaGFubmVsOiBzdHJpbmcpOiB2b2lkO1xufVxuXG5leHBvcnQgZGVmYXVsdCBQdWJTdWJBZGFwdGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7QUFDQTtBQUNBOztBQUNBO0FBQ0E7QUFDQTtBQUNPLE1BQU1BLGFBQU4sQ0FBb0I7RUFDekI7QUFDRjtBQUNBO0VBQ3dCLE9BQWZDLGVBQWUsR0FBRyxDQUFFO0VBQzNCO0FBQ0Y7QUFDQTs7O0VBQ3lCLE9BQWhCQyxnQkFBZ0IsR0FBRyxDQUFFOztBQVJIO0FBVzNCO0FBQ0E7QUFDQTtBQUNBOzs7O2VBMkJlRixhIn0=