"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.GLOBAL_ID_ATT = void 0;

var _graphqlRelay = require("graphql-relay");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("../helpers/objectsQueries"));

var _parseClassTypes = require("./parseClassTypes");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const GLOBAL_ID_ATT = {
  description: 'This is the global id.',
  type: defaultGraphQLTypes.OBJECT_ID
};
exports.GLOBAL_ID_ATT = GLOBAL_ID_ATT;

const load = parseGraphQLSchema => {
  const {
    nodeInterface,
    nodeField
  } = (0, _graphqlRelay.nodeDefinitions)(async (globalId, context, queryInfo) => {
    try {
      const {
        type,
        id
      } = (0, _graphqlRelay.fromGlobalId)(globalId);
      const {
        config,
        auth,
        info
      } = context;
      const selectedFields = (0, _graphqlListFields.default)(queryInfo);
      const {
        keys,
        include
      } = (0, _parseClassTypes.extractKeysAndInclude)(selectedFields);
      return _objectSpread({
        className: type
      }, await objectsQueries.getObject(type, id, keys, include, undefined, undefined, config, auth, info, parseGraphQLSchema.parseClasses));
    } catch (e) {
      parseGraphQLSchema.handleError(e);
    }
  }, obj => {
    return parseGraphQLSchema.parseClassTypes[obj.className].classGraphQLOutputType;
  });
  parseGraphQLSchema.addGraphQLType(nodeInterface, true);
  parseGraphQLSchema.relayNodeInterface = nodeInterface;
  parseGraphQLSchema.addGraphQLQuery('node', nodeField, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJHTE9CQUxfSURfQVRUIiwiZGVzY3JpcHRpb24iLCJ0eXBlIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIk9CSkVDVF9JRCIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJub2RlSW50ZXJmYWNlIiwibm9kZUZpZWxkIiwibm9kZURlZmluaXRpb25zIiwiZ2xvYmFsSWQiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwiaWQiLCJmcm9tR2xvYmFsSWQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInNlbGVjdGVkRmllbGRzIiwiZ2V0RmllbGROYW1lcyIsImtleXMiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwiY2xhc3NOYW1lIiwib2JqZWN0c1F1ZXJpZXMiLCJnZXRPYmplY3QiLCJ1bmRlZmluZWQiLCJwYXJzZUNsYXNzZXMiLCJlIiwiaGFuZGxlRXJyb3IiLCJvYmoiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiYWRkR3JhcGhRTFR5cGUiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJhZGRHcmFwaFFMUXVlcnkiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL2RlZmF1bHRSZWxheVNjaGVtYS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBub2RlRGVmaW5pdGlvbnMsIGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IGdldEZpZWxkTmFtZXMgZnJvbSAnZ3JhcGhxbC1saXN0LWZpZWxkcyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzUXVlcmllcyBmcm9tICcuLi9oZWxwZXJzL29iamVjdHNRdWVyaWVzJztcbmltcG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSB9IGZyb20gJy4vcGFyc2VDbGFzc1R5cGVzJztcblxuY29uc3QgR0xPQkFMX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBnbG9iYWwgaWQuJyxcbiAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSUQsXG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgeyBub2RlSW50ZXJmYWNlLCBub2RlRmllbGQgfSA9IG5vZGVEZWZpbml0aW9ucyhcbiAgICBhc3luYyAoZ2xvYmFsSWQsIGNvbnRleHQsIHF1ZXJ5SW5mbykgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB0eXBlLCBpZCB9ID0gZnJvbUdsb2JhbElkKGdsb2JhbElkKTtcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzTmFtZTogdHlwZSxcbiAgICAgICAgICAuLi4oYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZ2V0T2JqZWN0KFxuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIGlkLFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgICBhdXRoLFxuICAgICAgICAgICAgaW5mbyxcbiAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzZXNcbiAgICAgICAgICApKSxcbiAgICAgICAgfTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gICAgb2JqID0+IHtcbiAgICAgIHJldHVybiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW29iai5jbGFzc05hbWVdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGU7XG4gICAgfVxuICApO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShub2RlSW50ZXJmYWNlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLnJlbGF5Tm9kZUludGVyZmFjZSA9IG5vZGVJbnRlcmZhY2U7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMUXVlcnkoJ25vZGUnLCBub2RlRmllbGQsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgR0xPQkFMX0lEX0FUVCwgbG9hZCB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsYUFBYSxHQUFHO0VBQ3BCQyxXQUFXLEVBQUUsd0JBRE87RUFFcEJDLElBQUksRUFBRUMsbUJBQW1CLENBQUNDO0FBRk4sQ0FBdEI7OztBQUtBLE1BQU1DLElBQUksR0FBR0Msa0JBQWtCLElBQUk7RUFDakMsTUFBTTtJQUFFQyxhQUFGO0lBQWlCQztFQUFqQixJQUErQixJQUFBQyw2QkFBQSxFQUNuQyxPQUFPQyxRQUFQLEVBQWlCQyxPQUFqQixFQUEwQkMsU0FBMUIsS0FBd0M7SUFDdEMsSUFBSTtNQUNGLE1BQU07UUFBRVYsSUFBRjtRQUFRVztNQUFSLElBQWUsSUFBQUMsMEJBQUEsRUFBYUosUUFBYixDQUFyQjtNQUNBLE1BQU07UUFBRUssTUFBRjtRQUFVQyxJQUFWO1FBQWdCQztNQUFoQixJQUF5Qk4sT0FBL0I7TUFDQSxNQUFNTyxjQUFjLEdBQUcsSUFBQUMsMEJBQUEsRUFBY1AsU0FBZCxDQUF2QjtNQUVBLE1BQU07UUFBRVEsSUFBRjtRQUFRQztNQUFSLElBQW9CLElBQUFDLHNDQUFBLEVBQXNCSixjQUF0QixDQUExQjtNQUVBO1FBQ0VLLFNBQVMsRUFBRXJCO01BRGIsR0FFTSxNQUFNc0IsY0FBYyxDQUFDQyxTQUFmLENBQ1J2QixJQURRLEVBRVJXLEVBRlEsRUFHUk8sSUFIUSxFQUlSQyxPQUpRLEVBS1JLLFNBTFEsRUFNUkEsU0FOUSxFQU9SWCxNQVBRLEVBUVJDLElBUlEsRUFTUkMsSUFUUSxFQVVSWCxrQkFBa0IsQ0FBQ3FCLFlBVlgsQ0FGWjtJQWVELENBdEJELENBc0JFLE9BQU9DLENBQVAsRUFBVTtNQUNWdEIsa0JBQWtCLENBQUN1QixXQUFuQixDQUErQkQsQ0FBL0I7SUFDRDtFQUNGLENBM0JrQyxFQTRCbkNFLEdBQUcsSUFBSTtJQUNMLE9BQU94QixrQkFBa0IsQ0FBQ3lCLGVBQW5CLENBQW1DRCxHQUFHLENBQUNQLFNBQXZDLEVBQWtEUyxzQkFBekQ7RUFDRCxDQTlCa0MsQ0FBckM7RUFpQ0ExQixrQkFBa0IsQ0FBQzJCLGNBQW5CLENBQWtDMUIsYUFBbEMsRUFBaUQsSUFBakQ7RUFDQUQsa0JBQWtCLENBQUM0QixrQkFBbkIsR0FBd0MzQixhQUF4QztFQUNBRCxrQkFBa0IsQ0FBQzZCLGVBQW5CLENBQW1DLE1BQW5DLEVBQTJDM0IsU0FBM0MsRUFBc0QsSUFBdEQ7QUFDRCxDQXJDRCJ9