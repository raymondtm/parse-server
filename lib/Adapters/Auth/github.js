"use strict";

// Helper functions for accessing the github API.
var Parse = require('parse/node').Parse;

const httpsRequest = require('./httpsRequest'); // Returns a promise that fulfills iff this user id is valid.


function validateAuthData(authData) {
  return request('user', authData.access_token).then(data => {
    if (data && data.id == authData.id) {
      return;
    }

    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Github auth is invalid for this user.');
  });
} // Returns a promise that fulfills iff this app id is valid.


function validateAppId() {
  return Promise.resolve();
} // A promisey wrapper for api requests


function request(path, access_token) {
  return httpsRequest.get({
    host: 'api.github.com',
    path: '/' + path,
    headers: {
      Authorization: 'bearer ' + access_token,
      'User-Agent': 'parse-server'
    }
  });
}

module.exports = {
  validateAppId: validateAppId,
  validateAuthData: validateAuthData
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJodHRwc1JlcXVlc3QiLCJ2YWxpZGF0ZUF1dGhEYXRhIiwiYXV0aERhdGEiLCJyZXF1ZXN0IiwiYWNjZXNzX3Rva2VuIiwidGhlbiIsImRhdGEiLCJpZCIsIkVycm9yIiwiT0JKRUNUX05PVF9GT1VORCIsInZhbGlkYXRlQXBwSWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsInBhdGgiLCJnZXQiLCJob3N0IiwiaGVhZGVycyIsIkF1dGhvcml6YXRpb24iLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0F1dGgvZ2l0aHViLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEhlbHBlciBmdW5jdGlvbnMgZm9yIGFjY2Vzc2luZyB0aGUgZ2l0aHViIEFQSS5cbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IGh0dHBzUmVxdWVzdCA9IHJlcXVpcmUoJy4vaHR0cHNSZXF1ZXN0Jyk7XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgaWZmIHRoaXMgdXNlciBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGEpIHtcbiAgcmV0dXJuIHJlcXVlc3QoJ3VzZXInLCBhdXRoRGF0YS5hY2Nlc3NfdG9rZW4pLnRoZW4oZGF0YSA9PiB7XG4gICAgaWYgKGRhdGEgJiYgZGF0YS5pZCA9PSBhdXRoRGF0YS5pZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0dpdGh1YiBhdXRoIGlzIGludmFsaWQgZm9yIHRoaXMgdXNlci4nKTtcbiAgfSk7XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgZnVsZmlsbHMgaWZmIHRoaXMgYXBwIGlkIGlzIHZhbGlkLlxuZnVuY3Rpb24gdmFsaWRhdGVBcHBJZCgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG4vLyBBIHByb21pc2V5IHdyYXBwZXIgZm9yIGFwaSByZXF1ZXN0c1xuZnVuY3Rpb24gcmVxdWVzdChwYXRoLCBhY2Nlc3NfdG9rZW4pIHtcbiAgcmV0dXJuIGh0dHBzUmVxdWVzdC5nZXQoe1xuICAgIGhvc3Q6ICdhcGkuZ2l0aHViLmNvbScsXG4gICAgcGF0aDogJy8nICsgcGF0aCxcbiAgICBoZWFkZXJzOiB7XG4gICAgICBBdXRob3JpemF0aW9uOiAnYmVhcmVyICcgKyBhY2Nlc3NfdG9rZW4sXG4gICAgICAnVXNlci1BZ2VudCc6ICdwYXJzZS1zZXJ2ZXInLFxuICAgIH0sXG4gIH0pO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgdmFsaWRhdGVBcHBJZDogdmFsaWRhdGVBcHBJZCxcbiAgdmFsaWRhdGVBdXRoRGF0YTogdmFsaWRhdGVBdXRoRGF0YSxcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQSxJQUFJQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JELEtBQWxDOztBQUNBLE1BQU1FLFlBQVksR0FBR0QsT0FBTyxDQUFDLGdCQUFELENBQTVCLEMsQ0FFQTs7O0FBQ0EsU0FBU0UsZ0JBQVQsQ0FBMEJDLFFBQTFCLEVBQW9DO0VBQ2xDLE9BQU9DLE9BQU8sQ0FBQyxNQUFELEVBQVNELFFBQVEsQ0FBQ0UsWUFBbEIsQ0FBUCxDQUF1Q0MsSUFBdkMsQ0FBNENDLElBQUksSUFBSTtJQUN6RCxJQUFJQSxJQUFJLElBQUlBLElBQUksQ0FBQ0MsRUFBTCxJQUFXTCxRQUFRLENBQUNLLEVBQWhDLEVBQW9DO01BQ2xDO0lBQ0Q7O0lBQ0QsTUFBTSxJQUFJVCxLQUFLLENBQUNVLEtBQVYsQ0FBZ0JWLEtBQUssQ0FBQ1UsS0FBTixDQUFZQyxnQkFBNUIsRUFBOEMsdUNBQTlDLENBQU47RUFDRCxDQUxNLENBQVA7QUFNRCxDLENBRUQ7OztBQUNBLFNBQVNDLGFBQVQsR0FBeUI7RUFDdkIsT0FBT0MsT0FBTyxDQUFDQyxPQUFSLEVBQVA7QUFDRCxDLENBRUQ7OztBQUNBLFNBQVNULE9BQVQsQ0FBaUJVLElBQWpCLEVBQXVCVCxZQUF2QixFQUFxQztFQUNuQyxPQUFPSixZQUFZLENBQUNjLEdBQWIsQ0FBaUI7SUFDdEJDLElBQUksRUFBRSxnQkFEZ0I7SUFFdEJGLElBQUksRUFBRSxNQUFNQSxJQUZVO0lBR3RCRyxPQUFPLEVBQUU7TUFDUEMsYUFBYSxFQUFFLFlBQVliLFlBRHBCO01BRVAsY0FBYztJQUZQO0VBSGEsQ0FBakIsQ0FBUDtBQVFEOztBQUVEYyxNQUFNLENBQUNDLE9BQVAsR0FBaUI7RUFDZlQsYUFBYSxFQUFFQSxhQURBO0VBRWZULGdCQUFnQixFQUFFQTtBQUZILENBQWpCIn0=