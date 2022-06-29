"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
const general = {
  title: 'General request schema',
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: ['connect', 'subscribe', 'unsubscribe', 'update']
    }
  },
  required: ['op']
};
const connect = {
  title: 'Connect operation schema',
  type: 'object',
  properties: {
    op: 'connect',
    applicationId: {
      type: 'string'
    },
    javascriptKey: {
      type: 'string'
    },
    masterKey: {
      type: 'string'
    },
    clientKey: {
      type: 'string'
    },
    windowsKey: {
      type: 'string'
    },
    restAPIKey: {
      type: 'string'
    },
    sessionToken: {
      type: 'string'
    },
    installationId: {
      type: 'string'
    }
  },
  required: ['op', 'applicationId'],
  additionalProperties: false
};
const subscribe = {
  title: 'Subscribe operation schema',
  type: 'object',
  properties: {
    op: 'subscribe',
    requestId: {
      type: 'number'
    },
    query: {
      title: 'Query field schema',
      type: 'object',
      properties: {
        className: {
          type: 'string'
        },
        where: {
          type: 'object'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string'
          },
          minItems: 1,
          uniqueItems: true
        }
      },
      required: ['where', 'className'],
      additionalProperties: false
    },
    sessionToken: {
      type: 'string'
    }
  },
  required: ['op', 'requestId', 'query'],
  additionalProperties: false
};
const update = {
  title: 'Update operation schema',
  type: 'object',
  properties: {
    op: 'update',
    requestId: {
      type: 'number'
    },
    query: {
      title: 'Query field schema',
      type: 'object',
      properties: {
        className: {
          type: 'string'
        },
        where: {
          type: 'object'
        },
        fields: {
          type: 'array',
          items: {
            type: 'string'
          },
          minItems: 1,
          uniqueItems: true
        }
      },
      required: ['where', 'className'],
      additionalProperties: false
    },
    sessionToken: {
      type: 'string'
    }
  },
  required: ['op', 'requestId', 'query'],
  additionalProperties: false
};
const unsubscribe = {
  title: 'Unsubscribe operation schema',
  type: 'object',
  properties: {
    op: 'unsubscribe',
    requestId: {
      type: 'number'
    }
  },
  required: ['op', 'requestId'],
  additionalProperties: false
};
const RequestSchema = {
  general: general,
  connect: connect,
  subscribe: subscribe,
  update: update,
  unsubscribe: unsubscribe
};
var _default = RequestSchema;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZW5lcmFsIiwidGl0bGUiLCJ0eXBlIiwicHJvcGVydGllcyIsIm9wIiwiZW51bSIsInJlcXVpcmVkIiwiY29ubmVjdCIsImFwcGxpY2F0aW9uSWQiLCJqYXZhc2NyaXB0S2V5IiwibWFzdGVyS2V5IiwiY2xpZW50S2V5Iiwid2luZG93c0tleSIsInJlc3RBUElLZXkiLCJzZXNzaW9uVG9rZW4iLCJpbnN0YWxsYXRpb25JZCIsImFkZGl0aW9uYWxQcm9wZXJ0aWVzIiwic3Vic2NyaWJlIiwicmVxdWVzdElkIiwicXVlcnkiLCJjbGFzc05hbWUiLCJ3aGVyZSIsImZpZWxkcyIsIml0ZW1zIiwibWluSXRlbXMiLCJ1bmlxdWVJdGVtcyIsInVwZGF0ZSIsInVuc3Vic2NyaWJlIiwiUmVxdWVzdFNjaGVtYSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9MaXZlUXVlcnkvUmVxdWVzdFNjaGVtYS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBnZW5lcmFsID0ge1xuICB0aXRsZTogJ0dlbmVyYWwgcmVxdWVzdCBzY2hlbWEnLFxuICB0eXBlOiAnb2JqZWN0JyxcbiAgcHJvcGVydGllczoge1xuICAgIG9wOiB7XG4gICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgIGVudW06IFsnY29ubmVjdCcsICdzdWJzY3JpYmUnLCAndW5zdWJzY3JpYmUnLCAndXBkYXRlJ10sXG4gICAgfSxcbiAgfSxcbiAgcmVxdWlyZWQ6IFsnb3AnXSxcbn07XG5cbmNvbnN0IGNvbm5lY3QgPSB7XG4gIHRpdGxlOiAnQ29ubmVjdCBvcGVyYXRpb24gc2NoZW1hJyxcbiAgdHlwZTogJ29iamVjdCcsXG4gIHByb3BlcnRpZXM6IHtcbiAgICBvcDogJ2Nvbm5lY3QnLFxuICAgIGFwcGxpY2F0aW9uSWQ6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gICAgamF2YXNjcmlwdEtleToge1xuICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgfSxcbiAgICBtYXN0ZXJLZXk6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gICAgY2xpZW50S2V5OiB7XG4gICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICB9LFxuICAgIHdpbmRvd3NLZXk6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gICAgcmVzdEFQSUtleToge1xuICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgfSxcbiAgICBzZXNzaW9uVG9rZW46IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gIH0sXG4gIHJlcXVpcmVkOiBbJ29wJywgJ2FwcGxpY2F0aW9uSWQnXSxcbiAgYWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxufTtcblxuY29uc3Qgc3Vic2NyaWJlID0ge1xuICB0aXRsZTogJ1N1YnNjcmliZSBvcGVyYXRpb24gc2NoZW1hJyxcbiAgdHlwZTogJ29iamVjdCcsXG4gIHByb3BlcnRpZXM6IHtcbiAgICBvcDogJ3N1YnNjcmliZScsXG4gICAgcmVxdWVzdElkOiB7XG4gICAgICB0eXBlOiAnbnVtYmVyJyxcbiAgICB9LFxuICAgIHF1ZXJ5OiB7XG4gICAgICB0aXRsZTogJ1F1ZXJ5IGZpZWxkIHNjaGVtYScsXG4gICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgY2xhc3NOYW1lOiB7XG4gICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgIH0sXG4gICAgICAgIHdoZXJlOiB7XG4gICAgICAgICAgdHlwZTogJ29iamVjdCcsXG4gICAgICAgIH0sXG4gICAgICAgIGZpZWxkczoge1xuICAgICAgICAgIHR5cGU6ICdhcnJheScsXG4gICAgICAgICAgaXRlbXM6IHtcbiAgICAgICAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgbWluSXRlbXM6IDEsXG4gICAgICAgICAgdW5pcXVlSXRlbXM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcmVxdWlyZWQ6IFsnd2hlcmUnLCAnY2xhc3NOYW1lJ10sXG4gICAgICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG4gICAgfSxcbiAgICBzZXNzaW9uVG9rZW46IHtcbiAgICAgIHR5cGU6ICdzdHJpbmcnLFxuICAgIH0sXG4gIH0sXG4gIHJlcXVpcmVkOiBbJ29wJywgJ3JlcXVlc3RJZCcsICdxdWVyeSddLFxuICBhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG59O1xuXG5jb25zdCB1cGRhdGUgPSB7XG4gIHRpdGxlOiAnVXBkYXRlIG9wZXJhdGlvbiBzY2hlbWEnLFxuICB0eXBlOiAnb2JqZWN0JyxcbiAgcHJvcGVydGllczoge1xuICAgIG9wOiAndXBkYXRlJyxcbiAgICByZXF1ZXN0SWQ6IHtcbiAgICAgIHR5cGU6ICdudW1iZXInLFxuICAgIH0sXG4gICAgcXVlcnk6IHtcbiAgICAgIHRpdGxlOiAnUXVlcnkgZmllbGQgc2NoZW1hJyxcbiAgICAgIHR5cGU6ICdvYmplY3QnLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBjbGFzc05hbWU6IHtcbiAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgfSxcbiAgICAgICAgd2hlcmU6IHtcbiAgICAgICAgICB0eXBlOiAnb2JqZWN0JyxcbiAgICAgICAgfSxcbiAgICAgICAgZmllbGRzOiB7XG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBtaW5JdGVtczogMSxcbiAgICAgICAgICB1bmlxdWVJdGVtczogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICByZXF1aXJlZDogWyd3aGVyZScsICdjbGFzc05hbWUnXSxcbiAgICAgIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbiAgICB9LFxuICAgIHNlc3Npb25Ub2tlbjoge1xuICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgfSxcbiAgfSxcbiAgcmVxdWlyZWQ6IFsnb3AnLCAncmVxdWVzdElkJywgJ3F1ZXJ5J10sXG4gIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbn07XG5cbmNvbnN0IHVuc3Vic2NyaWJlID0ge1xuICB0aXRsZTogJ1Vuc3Vic2NyaWJlIG9wZXJhdGlvbiBzY2hlbWEnLFxuICB0eXBlOiAnb2JqZWN0JyxcbiAgcHJvcGVydGllczoge1xuICAgIG9wOiAndW5zdWJzY3JpYmUnLFxuICAgIHJlcXVlc3RJZDoge1xuICAgICAgdHlwZTogJ251bWJlcicsXG4gICAgfSxcbiAgfSxcbiAgcmVxdWlyZWQ6IFsnb3AnLCAncmVxdWVzdElkJ10sXG4gIGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcbn07XG5cbmNvbnN0IFJlcXVlc3RTY2hlbWEgPSB7XG4gIGdlbmVyYWw6IGdlbmVyYWwsXG4gIGNvbm5lY3Q6IGNvbm5lY3QsXG4gIHN1YnNjcmliZTogc3Vic2NyaWJlLFxuICB1cGRhdGU6IHVwZGF0ZSxcbiAgdW5zdWJzY3JpYmU6IHVuc3Vic2NyaWJlLFxufTtcblxuZXhwb3J0IGRlZmF1bHQgUmVxdWVzdFNjaGVtYTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsTUFBTUEsT0FBTyxHQUFHO0VBQ2RDLEtBQUssRUFBRSx3QkFETztFQUVkQyxJQUFJLEVBQUUsUUFGUTtFQUdkQyxVQUFVLEVBQUU7SUFDVkMsRUFBRSxFQUFFO01BQ0ZGLElBQUksRUFBRSxRQURKO01BRUZHLElBQUksRUFBRSxDQUFDLFNBQUQsRUFBWSxXQUFaLEVBQXlCLGFBQXpCLEVBQXdDLFFBQXhDO0lBRko7RUFETSxDQUhFO0VBU2RDLFFBQVEsRUFBRSxDQUFDLElBQUQ7QUFUSSxDQUFoQjtBQVlBLE1BQU1DLE9BQU8sR0FBRztFQUNkTixLQUFLLEVBQUUsMEJBRE87RUFFZEMsSUFBSSxFQUFFLFFBRlE7RUFHZEMsVUFBVSxFQUFFO0lBQ1ZD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