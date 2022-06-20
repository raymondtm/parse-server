"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.definitions = void 0;

var _graphqlTag = _interopRequireDefault(require("graphql-tag"));

var _utils = require("@graphql-tools/utils");

var _FunctionsRouter = require("../../Routers/FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const definitions = (0, _graphqlTag.default)`
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;
exports.definitions = definitions;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  class ResolveDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = async (_source, args, context) => {
        try {
          const {
            config,
            auth,
            info
          } = context;
          let functionName = field.name;

          if (this.args.to) {
            functionName = this.args.to;
          }

          return (await _FunctionsRouter.FunctionsRouter.handleCloudFunction({
            params: {
              functionName
            },
            config,
            auth,
            info,
            body: args
          })).response.result;
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.resolve = ResolveDirectiveVisitor;

  class MockDirectiveVisitor extends _utils.SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => {
        return this.args.with;
      };
    }

  }

  parseGraphQLSchema.graphQLSchemaDirectives.mock = MockDirectiveVisitor;
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJkZWZpbml0aW9ucyIsImdxbCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiUmVzb2x2ZURpcmVjdGl2ZVZpc2l0b3IiLCJTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIiwidmlzaXRGaWVsZERlZmluaXRpb24iLCJmaWVsZCIsInJlc29sdmUiLCJfc291cmNlIiwiYXJncyIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsImZ1bmN0aW9uTmFtZSIsIm5hbWUiLCJ0byIsIkZ1bmN0aW9uc1JvdXRlciIsImhhbmRsZUNsb3VkRnVuY3Rpb24iLCJwYXJhbXMiLCJib2R5IiwicmVzcG9uc2UiLCJyZXN1bHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlcyIsIk1vY2tEaXJlY3RpdmVWaXNpdG9yIiwid2l0aCIsIm1vY2siXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL3NjaGVtYURpcmVjdGl2ZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGdxbCBmcm9tICdncmFwaHFsLXRhZyc7XG5pbXBvcnQgeyBTY2hlbWFEaXJlY3RpdmVWaXNpdG9yIH0gZnJvbSAnQGdyYXBocWwtdG9vbHMvdXRpbHMnO1xuaW1wb3J0IHsgRnVuY3Rpb25zUm91dGVyIH0gZnJvbSAnLi4vLi4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuXG5leHBvcnQgY29uc3QgZGVmaW5pdGlvbnMgPSBncWxgXG4gIGRpcmVjdGl2ZSBAcmVzb2x2ZSh0bzogU3RyaW5nKSBvbiBGSUVMRF9ERUZJTklUSU9OXG4gIGRpcmVjdGl2ZSBAbW9jayh3aXRoOiBBbnkhKSBvbiBGSUVMRF9ERUZJTklUSU9OXG5gO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBkZWZpbml0aW9ucztcblxuICBjbGFzcyBSZXNvbHZlRGlyZWN0aXZlVmlzaXRvciBleHRlbmRzIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3Ige1xuICAgIHZpc2l0RmllbGREZWZpbml0aW9uKGZpZWxkKSB7XG4gICAgICBmaWVsZC5yZXNvbHZlID0gYXN5bmMgKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpID0+IHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICAgIGxldCBmdW5jdGlvbk5hbWUgPSBmaWVsZC5uYW1lO1xuICAgICAgICAgIGlmICh0aGlzLmFyZ3MudG8pIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uTmFtZSA9IHRoaXMuYXJncy50bztcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgYXdhaXQgRnVuY3Rpb25zUm91dGVyLmhhbmRsZUNsb3VkRnVuY3Rpb24oe1xuICAgICAgICAgICAgICBwYXJhbXM6IHtcbiAgICAgICAgICAgICAgICBmdW5jdGlvbk5hbWUsXG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgICAgYm9keTogYXJncyxcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKS5yZXNwb25zZS5yZXN1bHQ7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzLnJlc29sdmUgPSBSZXNvbHZlRGlyZWN0aXZlVmlzaXRvcjtcblxuICBjbGFzcyBNb2NrRGlyZWN0aXZlVmlzaXRvciBleHRlbmRzIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3Ige1xuICAgIHZpc2l0RmllbGREZWZpbml0aW9uKGZpZWxkKSB7XG4gICAgICBmaWVsZC5yZXNvbHZlID0gKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5hcmdzLndpdGg7XG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlcy5tb2NrID0gTW9ja0RpcmVjdGl2ZVZpc2l0b3I7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7OztBQUVPLE1BQU1BLFdBQVcsR0FBRyxJQUFBQyxtQkFBQSxDQUFJO0FBQy9CO0FBQ0E7QUFDQSxDQUhPOzs7QUFLUCxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0VBQ2pDQSxrQkFBa0IsQ0FBQ0Msa0NBQW5CLEdBQXdESixXQUF4RDs7RUFFQSxNQUFNSyx1QkFBTixTQUFzQ0MsNkJBQXRDLENBQTZEO0lBQzNEQyxvQkFBb0IsQ0FBQ0MsS0FBRCxFQUFRO01BQzFCQSxLQUFLLENBQUNDLE9BQU4sR0FBZ0IsT0FBT0MsT0FBUCxFQUFnQkMsSUFBaEIsRUFBc0JDLE9BQXRCLEtBQWtDO1FBQ2hELElBQUk7VUFDRixNQUFNO1lBQUVDLE1BQUY7WUFBVUMsSUFBVjtZQUFnQkM7VUFBaEIsSUFBeUJILE9BQS9CO1VBRUEsSUFBSUksWUFBWSxHQUFHUixLQUFLLENBQUNTLElBQXpCOztVQUNBLElBQUksS0FBS04sSUFBTCxDQUFVTyxFQUFkLEVBQWtCO1lBQ2hCRixZQUFZLEdBQUcsS0FBS0wsSUFBTCxDQUFVTyxFQUF6QjtVQUNEOztVQUVELE9BQU8sQ0FDTCxNQUFNQyxnQ0FBQSxDQUFnQkMsbUJBQWhCLENBQW9DO1lBQ3hDQyxNQUFNLEVBQUU7Y0FDTkw7WUFETSxDQURnQztZQUl4Q0gsTUFKd0M7WUFLeENDLElBTHdDO1lBTXhDQyxJQU53QztZQU94Q08sSUFBSSxFQUFFWDtVQVBrQyxDQUFwQyxDQURELEVBVUxZLFFBVkssQ0FVSUMsTUFWWDtRQVdELENBbkJELENBbUJFLE9BQU9DLENBQVAsRUFBVTtVQUNWdEIsa0JBQWtCLENBQUN1QixXQUFuQixDQUErQkQsQ0FBL0I7UUFDRDtNQUNGLENBdkJEO0lBd0JEOztFQTFCMEQ7O0VBNkI3RHRCLGtCQUFrQixDQUFDd0IsdUJBQW5CLENBQTJDbEIsT0FBM0MsR0FBcURKLHVCQUFyRDs7RUFFQSxNQUFNdUIsb0JBQU4sU0FBbUN0Qiw2QkFBbkMsQ0FBMEQ7SUFDeERDLG9CQUFvQixDQUFDQyxLQUFELEVBQVE7TUFDMUJBLEtBQUssQ0FBQ0MsT0FBTixHQUFnQixNQUFNO1FBQ3BCLE9BQU8sS0FBS0UsSUFBTCxDQUFVa0IsSUFBakI7TUFDRCxDQUZEO0lBR0Q7O0VBTHVEOztFQVExRDFCLGtCQUFrQixDQUFDd0IsdUJBQW5CLENBQTJDRyxJQUEzQyxHQUFrREYsb0JBQWxEO0FBQ0QsQ0EzQ0QifQ==