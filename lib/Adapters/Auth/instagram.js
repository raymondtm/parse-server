"use strict";

// Helper functions for accessing the instagram API.
var Parse = require('parse/node').Parse;

const httpsRequest = require('./httpsRequest');

const defaultURL = 'https://graph.instagram.com/'; // Returns a promise that fulfills if this user id is valid.

function validateAuthData(authData) {
  const apiURL = authData.apiURL || defaultURL;
  const path = `${apiURL}me?fields=id&access_token=${authData.access_token}`;
  return httpsRequest.get(path).then(response => {
    const user = response.data ? response.data : response;

    if (user && user.id == authData.id) {
      return;
    }

    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Instagram auth is invalid for this user.');
  });
} // Returns a promise that fulfills iff this app id is valid.


function validateAppId() {
  return Promise.resolve();
}

module.exports = {
  validateAppId,
  validateAuthData
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJodHRwc1JlcXVlc3QiLCJkZWZhdWx0VVJMIiwidmFsaWRhdGVBdXRoRGF0YSIsImF1dGhEYXRhIiwiYXBpVVJMIiwicGF0aCIsImFjY2Vzc190b2tlbiIsImdldCIsInRoZW4iLCJyZXNwb25zZSIsInVzZXIiLCJkYXRhIiwiaWQiLCJFcnJvciIsIk9CSkVDVF9OT1RfRk9VTkQiLCJ2YWxpZGF0ZUFwcElkIiwiUHJvbWlzZSIsInJlc29sdmUiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FkYXB0ZXJzL0F1dGgvaW5zdGFncmFtLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEhlbHBlciBmdW5jdGlvbnMgZm9yIGFjY2Vzc2luZyB0aGUgaW5zdGFncmFtIEFQSS5cbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmNvbnN0IGh0dHBzUmVxdWVzdCA9IHJlcXVpcmUoJy4vaHR0cHNSZXF1ZXN0Jyk7XG5jb25zdCBkZWZhdWx0VVJMID0gJ2h0dHBzOi8vZ3JhcGguaW5zdGFncmFtLmNvbS8nO1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IGZ1bGZpbGxzIGlmIHRoaXMgdXNlciBpZCBpcyB2YWxpZC5cbmZ1bmN0aW9uIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGEpIHtcbiAgY29uc3QgYXBpVVJMID0gYXV0aERhdGEuYXBpVVJMIHx8IGRlZmF1bHRVUkw7XG4gIGNvbnN0IHBhdGggPSBgJHthcGlVUkx9bWU/ZmllbGRzPWlkJmFjY2Vzc190b2tlbj0ke2F1dGhEYXRhLmFjY2Vzc190b2tlbn1gO1xuICByZXR1cm4gaHR0cHNSZXF1ZXN0LmdldChwYXRoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICBjb25zdCB1c2VyID0gcmVzcG9uc2UuZGF0YSA/IHJlc3BvbnNlLmRhdGEgOiByZXNwb25zZTtcbiAgICBpZiAodXNlciAmJiB1c2VyLmlkID09IGF1dGhEYXRhLmlkKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW5zdGFncmFtIGF1dGggaXMgaW52YWxpZCBmb3IgdGhpcyB1c2VyLicpO1xuICB9KTtcbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCBmdWxmaWxscyBpZmYgdGhpcyBhcHAgaWQgaXMgdmFsaWQuXG5mdW5jdGlvbiB2YWxpZGF0ZUFwcElkKCkge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICB2YWxpZGF0ZUFwcElkLFxuICB2YWxpZGF0ZUF1dGhEYXRhLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBLElBQUlBLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQUQsQ0FBUCxDQUFzQkQsS0FBbEM7O0FBQ0EsTUFBTUUsWUFBWSxHQUFHRCxPQUFPLENBQUMsZ0JBQUQsQ0FBNUI7O0FBQ0EsTUFBTUUsVUFBVSxHQUFHLDhCQUFuQixDLENBRUE7O0FBQ0EsU0FBU0MsZ0JBQVQsQ0FBMEJDLFFBQTFCLEVBQW9DO0VBQ2xDLE1BQU1DLE1BQU0sR0FBR0QsUUFBUSxDQUFDQyxNQUFULElBQW1CSCxVQUFsQztFQUNBLE1BQU1JLElBQUksR0FBSSxHQUFFRCxNQUFPLDZCQUE0QkQsUUFBUSxDQUFDRyxZQUFhLEVBQXpFO0VBQ0EsT0FBT04sWUFBWSxDQUFDTyxHQUFiLENBQWlCRixJQUFqQixFQUF1QkcsSUFBdkIsQ0FBNEJDLFFBQVEsSUFBSTtJQUM3QyxNQUFNQyxJQUFJLEdBQUdELFFBQVEsQ0FBQ0UsSUFBVCxHQUFnQkYsUUFBUSxDQUFDRSxJQUF6QixHQUFnQ0YsUUFBN0M7O0lBQ0EsSUFBSUMsSUFBSSxJQUFJQSxJQUFJLENBQUNFLEVBQUwsSUFBV1QsUUFBUSxDQUFDUyxFQUFoQyxFQUFvQztNQUNsQztJQUNEOztJQUNELE1BQU0sSUFBSWQsS0FBSyxDQUFDZSxLQUFWLENBQWdCZixLQUFLLENBQUNlLEtBQU4sQ0FBWUMsZ0JBQTVCLEVBQThDLDBDQUE5QyxDQUFOO0VBQ0QsQ0FOTSxDQUFQO0FBT0QsQyxDQUVEOzs7QUFDQSxTQUFTQyxhQUFULEdBQXlCO0VBQ3ZCLE9BQU9DLE9BQU8sQ0FBQ0MsT0FBUixFQUFQO0FBQ0Q7O0FBRURDLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQjtFQUNmSixhQURlO0VBRWZiO0FBRmUsQ0FBakIifQ==