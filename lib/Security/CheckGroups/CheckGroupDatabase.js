"use strict";

var _Check = require("../Check");

var _CheckGroup = _interopRequireDefault(require("../CheckGroup"));

var _Config = _interopRequireDefault(require("../../Config"));

var _node = _interopRequireDefault(require("parse/node"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/**
 * @module SecurityCheck
 */

/**
* The security checks group for Parse Server configuration.
* Checks common Parse Server parameters such as access keys.
*/
class CheckGroupDatabase extends _CheckGroup.default {
  setName() {
    return 'Database';
  }

  setChecks() {
    const config = _Config.default.get(_node.default.applicationId);

    const databaseAdapter = config.database.adapter;
    const databaseUrl = databaseAdapter._uri;
    return [new _Check.Check({
      title: 'Secure database password',
      warning: 'The database password is insecure and vulnerable to brute force attacks.',
      solution: 'Choose a longer and/or more complex password with a combination of upper- and lowercase characters, numbers and special characters.',
      check: () => {
        const password = databaseUrl.match(/\/\/\S+:(\S+)@/)[1];
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasNonAlphasNumerics = /\W/.test(password); // Ensure length

        if (password.length < 14) {
          throw 1;
        } // Ensure at least 3 out of 4 requirements passed


        if (hasUpperCase + hasLowerCase + hasNumbers + hasNonAlphasNumerics < 3) {
          throw 1;
        }
      }
    })];
  }

}

module.exports = CheckGroupDatabase;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDaGVja0dyb3VwRGF0YWJhc2UiLCJDaGVja0dyb3VwIiwic2V0TmFtZSIsInNldENoZWNrcyIsImNvbmZpZyIsIkNvbmZpZyIsImdldCIsIlBhcnNlIiwiYXBwbGljYXRpb25JZCIsImRhdGFiYXNlQWRhcHRlciIsImRhdGFiYXNlIiwiYWRhcHRlciIsImRhdGFiYXNlVXJsIiwiX3VyaSIsIkNoZWNrIiwidGl0bGUiLCJ3YXJuaW5nIiwic29sdXRpb24iLCJjaGVjayIsInBhc3N3b3JkIiwibWF0Y2giLCJoYXNVcHBlckNhc2UiLCJ0ZXN0IiwiaGFzTG93ZXJDYXNlIiwiaGFzTnVtYmVycyIsImhhc05vbkFscGhhc051bWVyaWNzIiwibGVuZ3RoIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9TZWN1cml0eS9DaGVja0dyb3Vwcy9DaGVja0dyb3VwRGF0YWJhc2UuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbW9kdWxlIFNlY3VyaXR5Q2hlY2tcbiAqL1xuXG5pbXBvcnQgeyBDaGVjayB9IGZyb20gJy4uL0NoZWNrJztcbmltcG9ydCBDaGVja0dyb3VwIGZyb20gJy4uL0NoZWNrR3JvdXAnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi8uLi9Db25maWcnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG4vKipcbiogVGhlIHNlY3VyaXR5IGNoZWNrcyBncm91cCBmb3IgUGFyc2UgU2VydmVyIGNvbmZpZ3VyYXRpb24uXG4qIENoZWNrcyBjb21tb24gUGFyc2UgU2VydmVyIHBhcmFtZXRlcnMgc3VjaCBhcyBhY2Nlc3Mga2V5cy5cbiovXG5jbGFzcyBDaGVja0dyb3VwRGF0YWJhc2UgZXh0ZW5kcyBDaGVja0dyb3VwIHtcbiAgc2V0TmFtZSgpIHtcbiAgICByZXR1cm4gJ0RhdGFiYXNlJztcbiAgfVxuICBzZXRDaGVja3MoKSB7XG4gICAgY29uc3QgY29uZmlnID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICBjb25zdCBkYXRhYmFzZUFkYXB0ZXIgPSBjb25maWcuZGF0YWJhc2UuYWRhcHRlcjtcbiAgICBjb25zdCBkYXRhYmFzZVVybCA9IGRhdGFiYXNlQWRhcHRlci5fdXJpO1xuICAgIHJldHVybiBbXG4gICAgICBuZXcgQ2hlY2soe1xuICAgICAgICB0aXRsZTogJ1NlY3VyZSBkYXRhYmFzZSBwYXNzd29yZCcsXG4gICAgICAgIHdhcm5pbmc6ICdUaGUgZGF0YWJhc2UgcGFzc3dvcmQgaXMgaW5zZWN1cmUgYW5kIHZ1bG5lcmFibGUgdG8gYnJ1dGUgZm9yY2UgYXR0YWNrcy4nLFxuICAgICAgICBzb2x1dGlvbjogJ0Nob29zZSBhIGxvbmdlciBhbmQvb3IgbW9yZSBjb21wbGV4IHBhc3N3b3JkIHdpdGggYSBjb21iaW5hdGlvbiBvZiB1cHBlci0gYW5kIGxvd2VyY2FzZSBjaGFyYWN0ZXJzLCBudW1iZXJzIGFuZCBzcGVjaWFsIGNoYXJhY3RlcnMuJyxcbiAgICAgICAgY2hlY2s6ICgpID0+IHtcbiAgICAgICAgICBjb25zdCBwYXNzd29yZCA9IGRhdGFiYXNlVXJsLm1hdGNoKC9cXC9cXC9cXFMrOihcXFMrKUAvKVsxXTtcbiAgICAgICAgICBjb25zdCBoYXNVcHBlckNhc2UgPSAvW0EtWl0vLnRlc3QocGFzc3dvcmQpO1xuICAgICAgICAgIGNvbnN0IGhhc0xvd2VyQ2FzZSA9IC9bYS16XS8udGVzdChwYXNzd29yZCk7XG4gICAgICAgICAgY29uc3QgaGFzTnVtYmVycyA9IC9cXGQvLnRlc3QocGFzc3dvcmQpO1xuICAgICAgICAgIGNvbnN0IGhhc05vbkFscGhhc051bWVyaWNzID0gL1xcVy8udGVzdChwYXNzd29yZCk7XG4gICAgICAgICAgLy8gRW5zdXJlIGxlbmd0aFxuICAgICAgICAgIGlmIChwYXNzd29yZC5sZW5ndGggPCAxNCkge1xuICAgICAgICAgICAgdGhyb3cgMTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gRW5zdXJlIGF0IGxlYXN0IDMgb3V0IG9mIDQgcmVxdWlyZW1lbnRzIHBhc3NlZFxuICAgICAgICAgIGlmIChoYXNVcHBlckNhc2UgKyBoYXNMb3dlckNhc2UgKyBoYXNOdW1iZXJzICsgaGFzTm9uQWxwaGFzTnVtZXJpY3MgPCAzKSB7XG4gICAgICAgICAgICB0aHJvdyAxO1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIF07XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaGVja0dyb3VwRGF0YWJhc2U7XG4iXSwibWFwcGluZ3MiOiI7O0FBSUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFQQTtBQUNBO0FBQ0E7O0FBT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSxNQUFNQSxrQkFBTixTQUFpQ0MsbUJBQWpDLENBQTRDO0VBQzFDQyxPQUFPLEdBQUc7SUFDUixPQUFPLFVBQVA7RUFDRDs7RUFDREMsU0FBUyxHQUFHO0lBQ1YsTUFBTUMsTUFBTSxHQUFHQyxlQUFBLENBQU9DLEdBQVAsQ0FBV0MsYUFBQSxDQUFNQyxhQUFqQixDQUFmOztJQUNBLE1BQU1DLGVBQWUsR0FBR0wsTUFBTSxDQUFDTSxRQUFQLENBQWdCQyxPQUF4QztJQUNBLE1BQU1DLFdBQVcsR0FBR0gsZUFBZSxDQUFDSSxJQUFwQztJQUNBLE9BQU8sQ0FDTCxJQUFJQyxZQUFKLENBQVU7TUFDUkMsS0FBSyxFQUFFLDBCQURDO01BRVJDLE9BQU8sRUFBRSwwRUFGRDtNQUdSQyxRQUFRLEVBQUUscUlBSEY7TUFJUkMsS0FBSyxFQUFFLE1BQU07UUFDWCxNQUFNQyxRQUFRLEdBQUdQLFdBQVcsQ0FBQ1EsS0FBWixDQUFrQixnQkFBbEIsRUFBb0MsQ0FBcEMsQ0FBakI7UUFDQSxNQUFNQyxZQUFZLEdBQUcsUUFBUUMsSUFBUixDQUFhSCxRQUFiLENBQXJCO1FBQ0EsTUFBTUksWUFBWSxHQUFHLFFBQVFELElBQVIsQ0FBYUgsUUFBYixDQUFyQjtRQUNBLE1BQU1LLFVBQVUsR0FBRyxLQUFLRixJQUFMLENBQVVILFFBQVYsQ0FBbkI7UUFDQSxNQUFNTSxvQkFBb0IsR0FBRyxLQUFLSCxJQUFMLENBQVVILFFBQVYsQ0FBN0IsQ0FMVyxDQU1YOztRQUNBLElBQUlBLFFBQVEsQ0FBQ08sTUFBVCxHQUFrQixFQUF0QixFQUEwQjtVQUN4QixNQUFNLENBQU47UUFDRCxDQVRVLENBVVg7OztRQUNBLElBQUlMLFlBQVksR0FBR0UsWUFBZixHQUE4QkMsVUFBOUIsR0FBMkNDLG9CQUEzQyxHQUFrRSxDQUF0RSxFQUF5RTtVQUN2RSxNQUFNLENBQU47UUFDRDtNQUNGO0lBbEJPLENBQVYsQ0FESyxDQUFQO0VBc0JEOztBQTlCeUM7O0FBaUM1Q0UsTUFBTSxDQUFDQyxPQUFQLEdBQWlCNUIsa0JBQWpCIn0=