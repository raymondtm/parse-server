"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseGraphQLSchema = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphql = require("graphql");

var _stitch = require("@graphql-tools/stitch");

var _util = require("util");

var _utils = require("@graphql-tools/utils");

var _requiredParameter = _interopRequireDefault(require("../requiredParameter"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./loaders/defaultGraphQLTypes"));

var parseClassTypes = _interopRequireWildcard(require("./loaders/parseClassTypes"));

var parseClassQueries = _interopRequireWildcard(require("./loaders/parseClassQueries"));

var parseClassMutations = _interopRequireWildcard(require("./loaders/parseClassMutations"));

var defaultGraphQLQueries = _interopRequireWildcard(require("./loaders/defaultGraphQLQueries"));

var defaultGraphQLMutations = _interopRequireWildcard(require("./loaders/defaultGraphQLMutations"));

var _ParseGraphQLController = _interopRequireWildcard(require("../Controllers/ParseGraphQLController"));

var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

var _parseGraphQLUtils = require("./parseGraphQLUtils");

var schemaDirectives = _interopRequireWildcard(require("./loaders/schemaDirectives"));

var schemaTypes = _interopRequireWildcard(require("./loaders/schemaTypes"));

var _triggers = require("../triggers");

var defaultRelaySchema = _interopRequireWildcard(require("./loaders/defaultRelaySchema"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const RESERVED_GRAPHQL_TYPE_NAMES = ['String', 'Boolean', 'Int', 'Float', 'ID', 'ArrayResult', 'Query', 'Mutation', 'Subscription', 'CreateFileInput', 'CreateFilePayload', 'Viewer', 'SignUpInput', 'SignUpPayload', 'LogInInput', 'LogInPayload', 'LogOutInput', 'LogOutPayload', 'CloudCodeFunction', 'CallCloudCodeInput', 'CallCloudCodePayload', 'CreateClassInput', 'CreateClassPayload', 'UpdateClassInput', 'UpdateClassPayload', 'DeleteClassInput', 'DeleteClassPayload', 'PageInfo'];
const RESERVED_GRAPHQL_QUERY_NAMES = ['health', 'viewer', 'class', 'classes'];
const RESERVED_GRAPHQL_MUTATION_NAMES = ['signUp', 'logIn', 'logOut', 'createFile', 'callCloudCode', 'createClass', 'updateClass', 'deleteClass'];

class ParseGraphQLSchema {
  constructor(params = {}) {
    this.parseGraphQLController = params.parseGraphQLController || (0, _requiredParameter.default)('You must provide a parseGraphQLController instance!');
    this.databaseController = params.databaseController || (0, _requiredParameter.default)('You must provide a databaseController instance!');
    this.log = params.log || (0, _requiredParameter.default)('You must provide a log instance!');
    this.graphQLCustomTypeDefs = params.graphQLCustomTypeDefs;
    this.appId = params.appId || (0, _requiredParameter.default)('You must provide the appId!');
    this.schemaCache = _SchemaCache.default;
  }

  async load() {
    const {
      parseGraphQLConfig
    } = await this._initializeSchemaAndConfig();
    const parseClasses = await this._getClassesForSchema(parseGraphQLConfig);
    const functionNames = await this._getFunctionNames();
    const functionNamesString = JSON.stringify(functionNames);

    if (!this._hasSchemaInputChanged({
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    })) {
      return this.graphQLSchema;
    }

    this.parseClasses = parseClasses;
    this.parseGraphQLConfig = parseGraphQLConfig;
    this.functionNames = functionNames;
    this.functionNamesString = functionNamesString;
    this.parseClassTypes = {};
    this.viewerType = null;
    this.graphQLAutoSchema = null;
    this.graphQLSchema = null;
    this.graphQLTypes = [];
    this.graphQLQueries = {};
    this.graphQLMutations = {};
    this.graphQLSubscriptions = {};
    this.graphQLSchemaDirectivesDefinitions = null;
    this.graphQLSchemaDirectives = {};
    this.relayNodeInterface = null;
    defaultGraphQLTypes.load(this);
    defaultRelaySchema.load(this);
    schemaTypes.load(this);

    this._getParseClassesWithConfig(parseClasses, parseGraphQLConfig).forEach(([parseClass, parseClassConfig]) => {
      // Some times schema return the _auth_data_ field
      // it will lead to unstable graphql generation order
      if (parseClass.className === '_User') {
        Object.keys(parseClass.fields).forEach(fieldName => {
          if (fieldName.startsWith('_auth_data_')) {
            delete parseClass.fields[fieldName];
          }
        });
      } // Fields order inside the schema seems to not be consistent across
      // restart so we need to ensure an alphabetical order
      // also it's better for the playground documentation


      const orderedFields = {};
      Object.keys(parseClass.fields).sort().forEach(fieldName => {
        orderedFields[fieldName] = parseClass.fields[fieldName];
      });
      parseClass.fields = orderedFields;
      parseClassTypes.load(this, parseClass, parseClassConfig);
      parseClassQueries.load(this, parseClass, parseClassConfig);
      parseClassMutations.load(this, parseClass, parseClassConfig);
    });

    defaultGraphQLTypes.loadArrayResult(this, parseClasses);
    defaultGraphQLQueries.load(this);
    defaultGraphQLMutations.load(this);
    let graphQLQuery = undefined;

    if (Object.keys(this.graphQLQueries).length > 0) {
      graphQLQuery = new _graphql.GraphQLObjectType({
        name: 'Query',
        description: 'Query is the top level type for queries.',
        fields: this.graphQLQueries
      });
      this.addGraphQLType(graphQLQuery, true, true);
    }

    let graphQLMutation = undefined;

    if (Object.keys(this.graphQLMutations).length > 0) {
      graphQLMutation = new _graphql.GraphQLObjectType({
        name: 'Mutation',
        description: 'Mutation is the top level type for mutations.',
        fields: this.graphQLMutations
      });
      this.addGraphQLType(graphQLMutation, true, true);
    }

    let graphQLSubscription = undefined;

    if (Object.keys(this.graphQLSubscriptions).length > 0) {
      graphQLSubscription = new _graphql.GraphQLObjectType({
        name: 'Subscription',
        description: 'Subscription is the top level type for subscriptions.',
        fields: this.graphQLSubscriptions
      });
      this.addGraphQLType(graphQLSubscription, true, true);
    }

    this.graphQLAutoSchema = new _graphql.GraphQLSchema({
      types: this.graphQLTypes,
      query: graphQLQuery,
      mutation: graphQLMutation,
      subscription: graphQLSubscription
    });

    if (this.graphQLCustomTypeDefs) {
      schemaDirectives.load(this);

      if (typeof this.graphQLCustomTypeDefs.getTypeMap === 'function') {
        // In following code we use underscore attr to avoid js var un ref
        const customGraphQLSchemaTypeMap = this.graphQLCustomTypeDefs._typeMap;

        const findAndReplaceLastType = (parent, key) => {
          if (parent[key].name) {
            if (this.graphQLAutoSchema._typeMap[parent[key].name] && this.graphQLAutoSchema._typeMap[parent[key].name] !== parent[key]) {
              // To avoid unresolved field on overloaded schema
              // replace the final type with the auto schema one
              parent[key] = this.graphQLAutoSchema._typeMap[parent[key].name];
            }
          } else {
            if (parent[key].ofType) {
              findAndReplaceLastType(parent[key], 'ofType');
            }
          }
        }; // Add non shared types from custom schema to auto schema
        // note: some non shared types can use some shared types
        // so this code need to be ran before the shared types addition
        // we use sort to ensure schema consistency over restarts


        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];

          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }

          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];

          if (!autoGraphQLSchemaType) {
            this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name] = customGraphQLSchemaType;
          }
        }); // Handle shared types
        // We pass through each type and ensure that all sub field types are replaced
        // we use sort to ensure schema consistency over restarts

        Object.keys(customGraphQLSchemaTypeMap).sort().forEach(customGraphQLSchemaTypeKey => {
          const customGraphQLSchemaType = customGraphQLSchemaTypeMap[customGraphQLSchemaTypeKey];

          if (!customGraphQLSchemaType || !customGraphQLSchemaType.name || customGraphQLSchemaType.name.startsWith('__')) {
            return;
          }

          const autoGraphQLSchemaType = this.graphQLAutoSchema._typeMap[customGraphQLSchemaType.name];

          if (autoGraphQLSchemaType && typeof customGraphQLSchemaType.getFields === 'function') {
            Object.keys(customGraphQLSchemaType._fields).sort().forEach(fieldKey => {
              const field = customGraphQLSchemaType._fields[fieldKey];
              findAndReplaceLastType(field, 'type');
              autoGraphQLSchemaType._fields[field.name] = field;
            });
          }
        });
        this.graphQLSchema = this.graphQLAutoSchema;
      } else if (typeof this.graphQLCustomTypeDefs === 'function') {
        this.graphQLSchema = await this.graphQLCustomTypeDefs({
          directivesDefinitionsSchema: this.graphQLSchemaDirectivesDefinitions,
          autoSchema: this.graphQLAutoSchema,
          stitchSchemas: _stitch.stitchSchemas
        });
      } else {
        this.graphQLSchema = (0, _stitch.stitchSchemas)({
          schemas: [this.graphQLSchemaDirectivesDefinitions, this.graphQLAutoSchema, this.graphQLCustomTypeDefs],
          mergeDirectives: true
        });
      } // Only merge directive when string schema provided


      const graphQLSchemaTypeMap = this.graphQLSchema.getTypeMap();
      Object.keys(graphQLSchemaTypeMap).forEach(graphQLSchemaTypeName => {
        const graphQLSchemaType = graphQLSchemaTypeMap[graphQLSchemaTypeName];

        if (typeof graphQLSchemaType.getFields === 'function' && this.graphQLCustomTypeDefs.definitions) {
          const graphQLCustomTypeDef = this.graphQLCustomTypeDefs.definitions.find(definition => definition.name.value === graphQLSchemaTypeName);

          if (graphQLCustomTypeDef) {
            const graphQLSchemaTypeFieldMap = graphQLSchemaType.getFields();
            Object.keys(graphQLSchemaTypeFieldMap).forEach(graphQLSchemaTypeFieldName => {
              const graphQLSchemaTypeField = graphQLSchemaTypeFieldMap[graphQLSchemaTypeFieldName];

              if (!graphQLSchemaTypeField.astNode) {
                const astNode = graphQLCustomTypeDef.fields.find(field => field.name.value === graphQLSchemaTypeFieldName);

                if (astNode) {
                  graphQLSchemaTypeField.astNode = astNode;
                }
              }
            });
          }
        }
      });

      _utils.SchemaDirectiveVisitor.visitSchemaDirectives(this.graphQLSchema, this.graphQLSchemaDirectives);
    } else {
      this.graphQLSchema = this.graphQLAutoSchema;
    }

    return this.graphQLSchema;
  }

  addGraphQLType(type, throwError = false, ignoreReserved = false, ignoreConnection = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_TYPE_NAMES.includes(type.name) || this.graphQLTypes.find(existingType => existingType.name === type.name) || !ignoreConnection && type.name.endsWith('Connection')) {
      const message = `Type ${type.name} could not be added to the auto schema because it collided with an existing type.`;

      if (throwError) {
        throw new Error(message);
      }

      this.log.warn(message);
      return undefined;
    }

    this.graphQLTypes.push(type);
    return type;
  }

  addGraphQLQuery(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_QUERY_NAMES.includes(fieldName) || this.graphQLQueries[fieldName]) {
      const message = `Query ${fieldName} could not be added to the auto schema because it collided with an existing field.`;

      if (throwError) {
        throw new Error(message);
      }

      this.log.warn(message);
      return undefined;
    }

    this.graphQLQueries[fieldName] = field;
    return field;
  }

  addGraphQLMutation(fieldName, field, throwError = false, ignoreReserved = false) {
    if (!ignoreReserved && RESERVED_GRAPHQL_MUTATION_NAMES.includes(fieldName) || this.graphQLMutations[fieldName]) {
      const message = `Mutation ${fieldName} could not be added to the auto schema because it collided with an existing field.`;

      if (throwError) {
        throw new Error(message);
      }

      this.log.warn(message);
      return undefined;
    }

    this.graphQLMutations[fieldName] = field;
    return field;
  }

  handleError(error) {
    if (error instanceof _node.default.Error) {
      this.log.error('Parse error: ', error);
    } else {
      this.log.error('Uncaught internal server error.', error, error.stack);
    }

    throw (0, _parseGraphQLUtils.toGraphQLError)(error);
  }

  async _initializeSchemaAndConfig() {
    const [schemaController, parseGraphQLConfig] = await Promise.all([this.databaseController.loadSchema(), this.parseGraphQLController.getGraphQLConfig()]);
    this.schemaController = schemaController;
    return {
      parseGraphQLConfig
    };
  }
  /**
   * Gets all classes found by the `schemaController`
   * minus those filtered out by the app's parseGraphQLConfig.
   */


  async _getClassesForSchema(parseGraphQLConfig) {
    const {
      enabledForClasses,
      disabledForClasses
    } = parseGraphQLConfig;
    const allClasses = await this.schemaController.getAllClasses();

    if (Array.isArray(enabledForClasses) || Array.isArray(disabledForClasses)) {
      let includedClasses = allClasses;

      if (enabledForClasses) {
        includedClasses = allClasses.filter(clazz => {
          return enabledForClasses.includes(clazz.className);
        });
      }

      if (disabledForClasses) {
        // Classes included in `enabledForClasses` that
        // are also present in `disabledForClasses` will
        // still be filtered out
        includedClasses = includedClasses.filter(clazz => {
          return !disabledForClasses.includes(clazz.className);
        });
      }

      this.isUsersClassDisabled = !includedClasses.some(clazz => {
        return clazz.className === '_User';
      });
      return includedClasses;
    } else {
      return allClasses;
    }
  }
  /**
   * This method returns a list of tuples
   * that provide the parseClass along with
   * its parseClassConfig where provided.
   */


  _getParseClassesWithConfig(parseClasses, parseGraphQLConfig) {
    const {
      classConfigs
    } = parseGraphQLConfig; // Make sures that the default classes and classes that
    // starts with capitalized letter will be generated first.

    const sortClasses = (a, b) => {
      a = a.className;
      b = b.className;

      if (a[0] === '_') {
        if (b[0] !== '_') {
          return -1;
        }
      }

      if (b[0] === '_') {
        if (a[0] !== '_') {
          return 1;
        }
      }

      if (a === b) {
        return 0;
      } else if (a < b) {
        return -1;
      } else {
        return 1;
      }
    };

    return parseClasses.sort(sortClasses).map(parseClass => {
      let parseClassConfig;

      if (classConfigs) {
        parseClassConfig = classConfigs.find(c => c.className === parseClass.className);
      }

      return [parseClass, parseClassConfig];
    });
  }

  async _getFunctionNames() {
    return await (0, _triggers.getFunctionNames)(this.appId).filter(functionName => {
      if (/^[_a-zA-Z][_a-zA-Z0-9]*$/.test(functionName)) {
        return true;
      } else {
        this.log.warn(`Function ${functionName} could not be added to the auto schema because GraphQL names must match /^[_a-zA-Z][_a-zA-Z0-9]*$/.`);
        return false;
      }
    });
  }
  /**
   * Checks for changes to the parseClasses
   * objects (i.e. database schema) or to
   * the parseGraphQLConfig object. If no
   * changes are found, return true;
   */


  _hasSchemaInputChanged(params) {
    const {
      parseClasses,
      parseGraphQLConfig,
      functionNamesString
    } = params; // First init

    if (!this.parseCachedClasses || !this.graphQLSchema) {
      const thisParseClassesObj = parseClasses.reduce((acc, clzz) => {
        acc[clzz.className] = clzz;
        return acc;
      }, {});
      this.parseCachedClasses = thisParseClassesObj;
      return true;
    }

    const newParseCachedClasses = parseClasses.reduce((acc, clzz) => {
      acc[clzz.className] = clzz;
      return acc;
    }, {});

    if ((0, _util.isDeepStrictEqual)(this.parseGraphQLConfig, parseGraphQLConfig) && this.functionNamesString === functionNamesString && (0, _util.isDeepStrictEqual)(this.parseCachedClasses, newParseCachedClasses)) {
      return false;
    }

    this.parseCachedClasses = newParseCachedClasses;
    return true;
  }

}

exports.ParseGraphQLSchema = ParseGraphQLSchema;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMiLCJSRVNFUlZFRF9HUkFQSFFMX1FVRVJZX05BTUVTIiwiUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyIsIlBhcnNlR3JhcGhRTFNjaGVtYSIsImNvbnN0cnVjdG9yIiwicGFyYW1zIiwicGFyc2VHcmFwaFFMQ29udHJvbGxlciIsInJlcXVpcmVkUGFyYW1ldGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwibG9nIiwiZ3JhcGhRTEN1c3RvbVR5cGVEZWZzIiwiYXBwSWQiLCJzY2hlbWFDYWNoZSIsIlNjaGVtYUNhY2hlIiwibG9hZCIsInBhcnNlR3JhcGhRTENvbmZpZyIsIl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnIiwicGFyc2VDbGFzc2VzIiwiX2dldENsYXNzZXNGb3JTY2hlbWEiLCJmdW5jdGlvbk5hbWVzIiwiX2dldEZ1bmN0aW9uTmFtZXMiLCJmdW5jdGlvbk5hbWVzU3RyaW5nIiwiSlNPTiIsInN0cmluZ2lmeSIsIl9oYXNTY2hlbWFJbnB1dENoYW5nZWQiLCJncmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc1R5cGVzIiwidmlld2VyVHlwZSIsImdyYXBoUUxBdXRvU2NoZW1hIiwiZ3JhcGhRTFR5cGVzIiwiZ3JhcGhRTFF1ZXJpZXMiLCJncmFwaFFMTXV0YXRpb25zIiwiZ3JhcGhRTFN1YnNjcmlwdGlvbnMiLCJncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zIiwiZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMiLCJyZWxheU5vZGVJbnRlcmZhY2UiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiZGVmYXVsdFJlbGF5U2NoZW1hIiwic2NoZW1hVHlwZXMiLCJfZ2V0UGFyc2VDbGFzc2VzV2l0aENvbmZpZyIsImZvckVhY2giLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc0NvbmZpZyIsImNsYXNzTmFtZSIsIk9iamVjdCIsImtleXMiLCJmaWVsZHMiLCJmaWVsZE5hbWUiLCJzdGFydHNXaXRoIiwib3JkZXJlZEZpZWxkcyIsInNvcnQiLCJwYXJzZUNsYXNzUXVlcmllcyIsInBhcnNlQ2xhc3NNdXRhdGlvbnMiLCJsb2FkQXJyYXlSZXN1bHQiLCJkZWZhdWx0R3JhcGhRTFF1ZXJpZXMiLCJkZWZhdWx0R3JhcGhRTE11dGF0aW9ucyIsImdyYXBoUUxRdWVyeSIsInVuZGVmaW5lZCIsImxlbmd0aCIsIkdyYXBoUUxPYmplY3RUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiYWRkR3JhcGhRTFR5cGUiLCJncmFwaFFMTXV0YXRpb24iLCJncmFwaFFMU3Vic2NyaXB0aW9uIiwiR3JhcGhRTFNjaGVtYSIsInR5cGVzIiwicXVlcnkiLCJtdXRhdGlvbiIsInN1YnNjcmlwdGlvbiIsInNjaGVtYURpcmVjdGl2ZXMiLCJnZXRUeXBlTWFwIiwiY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAiLCJfdHlwZU1hcCIsImZpbmRBbmRSZXBsYWNlTGFzdFR5cGUiLCJwYXJlbnQiLCJrZXkiLCJvZlR5cGUiLCJjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleSIsImN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlIiwiYXV0b0dyYXBoUUxTY2hlbWFUeXBlIiwiZ2V0RmllbGRzIiwiX2ZpZWxkcyIsImZpZWxkS2V5IiwiZmllbGQiLCJkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWEiLCJhdXRvU2NoZW1hIiwic3RpdGNoU2NoZW1hcyIsInNjaGVtYXMiLCJtZXJnZURpcmVjdGl2ZXMiLCJncmFwaFFMU2NoZW1hVHlwZU1hcCIsImdyYXBoUUxTY2hlbWFUeXBlTmFtZSIsImdyYXBoUUxTY2hlbWFUeXBlIiwiZGVmaW5pdGlvbnMiLCJncmFwaFFMQ3VzdG9tVHlwZURlZiIsImZpbmQiLCJkZWZpbml0aW9uIiwidmFsdWUiLCJncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwIiwiZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWUiLCJncmFwaFFMU2NoZW1hVHlwZUZpZWxkIiwiYXN0Tm9kZSIsIlNjaGVtYURpcmVjdGl2ZVZpc2l0b3IiLCJ2aXNpdFNjaGVtYURpcmVjdGl2ZXMiLCJ0eXBlIiwidGhyb3dFcnJvciIsImlnbm9yZVJlc2VydmVkIiwiaWdub3JlQ29ubmVjdGlvbiIsImluY2x1ZGVzIiwiZXhpc3RpbmdUeXBlIiwiZW5kc1dpdGgiLCJtZXNzYWdlIiwiRXJyb3IiLCJ3YXJuIiwicHVzaCIsImFkZEdyYXBoUUxRdWVyeSIsImFkZEdyYXBoUUxNdXRhdGlvbiIsImhhbmRsZUVycm9yIiwiZXJyb3IiLCJQYXJzZSIsInN0YWNrIiwidG9HcmFwaFFMRXJyb3IiLCJzY2hlbWFDb250cm9sbGVyIiwiUHJvbWlzZSIsImFsbCIsImxvYWRTY2hlbWEiLCJnZXRHcmFwaFFMQ29uZmlnIiwiZW5hYmxlZEZvckNsYXNzZXMiLCJkaXNhYmxlZEZvckNsYXNzZXMiLCJhbGxDbGFzc2VzIiwiZ2V0QWxsQ2xhc3NlcyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVkQ2xhc3NlcyIsImZpbHRlciIsImNsYXp6IiwiaXNVc2Vyc0NsYXNzRGlzYWJsZWQiLCJzb21lIiwiY2xhc3NDb25maWdzIiwic29ydENsYXNzZXMiLCJhIiwiYiIsIm1hcCIsImMiLCJnZXRGdW5jdGlvbk5hbWVzIiwiZnVuY3Rpb25OYW1lIiwidGVzdCIsInBhcnNlQ2FjaGVkQ2xhc3NlcyIsInRoaXNQYXJzZUNsYXNzZXNPYmoiLCJyZWR1Y2UiLCJhY2MiLCJjbHp6IiwibmV3UGFyc2VDYWNoZWRDbGFzc2VzIiwiaXNEZWVwU3RyaWN0RXF1YWwiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvR3JhcGhRTC9QYXJzZUdyYXBoUUxTY2hlbWEuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgR3JhcGhRTFNjaGVtYSwgR3JhcGhRTE9iamVjdFR5cGUsIERvY3VtZW50Tm9kZSwgR3JhcGhRTE5hbWVkVHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgc3RpdGNoU2NoZW1hcyB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3N0aXRjaCc7XG5pbXBvcnQgeyBpc0RlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ3V0aWwnO1xuaW1wb3J0IHsgU2NoZW1hRGlyZWN0aXZlVmlzaXRvciB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL3V0aWxzJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTFR5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NUeXBlcyBmcm9tICcuL2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzJztcbmltcG9ydCAqIGFzIHBhcnNlQ2xhc3NRdWVyaWVzIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9wYXJzZUNsYXNzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMUXVlcmllcyBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRHcmFwaFFMTXV0YXRpb25zIGZyb20gJy4vbG9hZGVycy9kZWZhdWx0R3JhcGhRTE11dGF0aW9ucyc7XG5pbXBvcnQgUGFyc2VHcmFwaFFMQ29udHJvbGxlciwgeyBQYXJzZUdyYXBoUUxDb25maWcgfSBmcm9tICcuLi9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgeyB0b0dyYXBoUUxFcnJvciB9IGZyb20gJy4vcGFyc2VHcmFwaFFMVXRpbHMnO1xuaW1wb3J0ICogYXMgc2NoZW1hRGlyZWN0aXZlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hRGlyZWN0aXZlcyc7XG5pbXBvcnQgKiBhcyBzY2hlbWFUeXBlcyBmcm9tICcuL2xvYWRlcnMvc2NoZW1hVHlwZXMnO1xuaW1wb3J0IHsgZ2V0RnVuY3Rpb25OYW1lcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCAqIGFzIGRlZmF1bHRSZWxheVNjaGVtYSBmcm9tICcuL2xvYWRlcnMvZGVmYXVsdFJlbGF5U2NoZW1hJztcblxuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9UWVBFX05BTUVTID0gW1xuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnSW50JyxcbiAgJ0Zsb2F0JyxcbiAgJ0lEJyxcbiAgJ0FycmF5UmVzdWx0JyxcbiAgJ1F1ZXJ5JyxcbiAgJ011dGF0aW9uJyxcbiAgJ1N1YnNjcmlwdGlvbicsXG4gICdDcmVhdGVGaWxlSW5wdXQnLFxuICAnQ3JlYXRlRmlsZVBheWxvYWQnLFxuICAnVmlld2VyJyxcbiAgJ1NpZ25VcElucHV0JyxcbiAgJ1NpZ25VcFBheWxvYWQnLFxuICAnTG9nSW5JbnB1dCcsXG4gICdMb2dJblBheWxvYWQnLFxuICAnTG9nT3V0SW5wdXQnLFxuICAnTG9nT3V0UGF5bG9hZCcsXG4gICdDbG91ZENvZGVGdW5jdGlvbicsXG4gICdDYWxsQ2xvdWRDb2RlSW5wdXQnLFxuICAnQ2FsbENsb3VkQ29kZVBheWxvYWQnLFxuICAnQ3JlYXRlQ2xhc3NJbnB1dCcsXG4gICdDcmVhdGVDbGFzc1BheWxvYWQnLFxuICAnVXBkYXRlQ2xhc3NJbnB1dCcsXG4gICdVcGRhdGVDbGFzc1BheWxvYWQnLFxuICAnRGVsZXRlQ2xhc3NJbnB1dCcsXG4gICdEZWxldGVDbGFzc1BheWxvYWQnLFxuICAnUGFnZUluZm8nLFxuXTtcbmNvbnN0IFJFU0VSVkVEX0dSQVBIUUxfUVVFUllfTkFNRVMgPSBbJ2hlYWx0aCcsICd2aWV3ZXInLCAnY2xhc3MnLCAnY2xhc3NlcyddO1xuY29uc3QgUkVTRVJWRURfR1JBUEhRTF9NVVRBVElPTl9OQU1FUyA9IFtcbiAgJ3NpZ25VcCcsXG4gICdsb2dJbicsXG4gICdsb2dPdXQnLFxuICAnY3JlYXRlRmlsZScsXG4gICdjYWxsQ2xvdWRDb2RlJyxcbiAgJ2NyZWF0ZUNsYXNzJyxcbiAgJ3VwZGF0ZUNsYXNzJyxcbiAgJ2RlbGV0ZUNsYXNzJyxcbl07XG5cbmNsYXNzIFBhcnNlR3JhcGhRTFNjaGVtYSB7XG4gIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb250cm9sbGVyOiBQYXJzZUdyYXBoUUxDb250cm9sbGVyO1xuICBwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZztcbiAgbG9nOiBhbnk7XG4gIGFwcElkOiBzdHJpbmc7XG4gIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhzdHJpbmcgfCBHcmFwaFFMU2NoZW1hIHwgRG9jdW1lbnROb2RlIHwgR3JhcGhRTE5hbWVkVHlwZVtdKTtcbiAgc2NoZW1hQ2FjaGU6IGFueTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgcGFyc2VHcmFwaFFMQ29udHJvbGxlcjogUGFyc2VHcmFwaFFMQ29udHJvbGxlcixcbiAgICAgIGxvZzogYW55LFxuICAgICAgYXBwSWQ6IHN0cmluZyxcbiAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmczogPyhzdHJpbmcgfCBHcmFwaFFMU2NoZW1hIHwgRG9jdW1lbnROb2RlIHwgR3JhcGhRTE5hbWVkVHlwZVtdKSxcbiAgICB9ID0ge31cbiAgKSB7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5wYXJzZUdyYXBoUUxDb250cm9sbGVyIHx8XG4gICAgICByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHBhcnNlR3JhcGhRTENvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5kYXRhYmFzZUNvbnRyb2xsZXIgPVxuICAgICAgcGFyYW1zLmRhdGFiYXNlQ29udHJvbGxlciB8fFxuICAgICAgcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBkYXRhYmFzZUNvbnRyb2xsZXIgaW5zdGFuY2UhJyk7XG4gICAgdGhpcy5sb2cgPSBwYXJhbXMubG9nIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbG9nIGluc3RhbmNlIScpO1xuICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyYW1zLmdyYXBoUUxDdXN0b21UeXBlRGVmcztcbiAgICB0aGlzLmFwcElkID0gcGFyYW1zLmFwcElkIHx8IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIHRoZSBhcHBJZCEnKTtcbiAgICB0aGlzLnNjaGVtYUNhY2hlID0gU2NoZW1hQ2FjaGU7XG4gIH1cblxuICBhc3luYyBsb2FkKCkge1xuICAgIGNvbnN0IHsgcGFyc2VHcmFwaFFMQ29uZmlnIH0gPSBhd2FpdCB0aGlzLl9pbml0aWFsaXplU2NoZW1hQW5kQ29uZmlnKCk7XG4gICAgY29uc3QgcGFyc2VDbGFzc2VzID0gYXdhaXQgdGhpcy5fZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWcpO1xuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZXMgPSBhd2FpdCB0aGlzLl9nZXRGdW5jdGlvbk5hbWVzKCk7XG4gICAgY29uc3QgZnVuY3Rpb25OYW1lc1N0cmluZyA9IEpTT04uc3RyaW5naWZ5KGZ1bmN0aW9uTmFtZXMpO1xuXG4gICAgaWYgKFxuICAgICAgIXRoaXMuX2hhc1NjaGVtYUlucHV0Q2hhbmdlZCh7XG4gICAgICAgIHBhcnNlQ2xhc3NlcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMQ29uZmlnLFxuICAgICAgICBmdW5jdGlvbk5hbWVzU3RyaW5nLFxuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0aGlzLmdyYXBoUUxTY2hlbWE7XG4gICAgfVxuXG4gICAgdGhpcy5wYXJzZUNsYXNzZXMgPSBwYXJzZUNsYXNzZXM7XG4gICAgdGhpcy5wYXJzZUdyYXBoUUxDb25maWcgPSBwYXJzZUdyYXBoUUxDb25maWc7XG4gICAgdGhpcy5mdW5jdGlvbk5hbWVzID0gZnVuY3Rpb25OYW1lcztcbiAgICB0aGlzLmZ1bmN0aW9uTmFtZXNTdHJpbmcgPSBmdW5jdGlvbk5hbWVzU3RyaW5nO1xuICAgIHRoaXMucGFyc2VDbGFzc1R5cGVzID0ge307XG4gICAgdGhpcy52aWV3ZXJUeXBlID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hID0gbnVsbDtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWEgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFR5cGVzID0gW107XG4gICAgdGhpcy5ncmFwaFFMUXVlcmllcyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9ucyA9IHt9O1xuICAgIHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMgPSB7fTtcbiAgICB0aGlzLmdyYXBoUUxTY2hlbWFEaXJlY3RpdmVzRGVmaW5pdGlvbnMgPSBudWxsO1xuICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXMgPSB7fTtcbiAgICB0aGlzLnJlbGF5Tm9kZUludGVyZmFjZSA9IG51bGw7XG5cbiAgICBkZWZhdWx0R3JhcGhRTFR5cGVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdFJlbGF5U2NoZW1hLmxvYWQodGhpcyk7XG4gICAgc2NoZW1hVHlwZXMubG9hZCh0aGlzKTtcblxuICAgIHRoaXMuX2dldFBhcnNlQ2xhc3Nlc1dpdGhDb25maWcocGFyc2VDbGFzc2VzLCBwYXJzZUdyYXBoUUxDb25maWcpLmZvckVhY2goXG4gICAgICAoW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddKSA9PiB7XG4gICAgICAgIC8vIFNvbWUgdGltZXMgc2NoZW1hIHJldHVybiB0aGUgX2F1dGhfZGF0YV8gZmllbGRcbiAgICAgICAgLy8gaXQgd2lsbCBsZWFkIHRvIHVuc3RhYmxlIGdyYXBocWwgZ2VuZXJhdGlvbiBvcmRlclxuICAgICAgICBpZiAocGFyc2VDbGFzcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICBPYmplY3Qua2V5cyhwYXJzZUNsYXNzLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5zdGFydHNXaXRoKCdfYXV0aF9kYXRhXycpKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmllbGRzIG9yZGVyIGluc2lkZSB0aGUgc2NoZW1hIHNlZW1zIHRvIG5vdCBiZSBjb25zaXN0ZW50IGFjcm9zc1xuICAgICAgICAvLyByZXN0YXJ0IHNvIHdlIG5lZWQgdG8gZW5zdXJlIGFuIGFscGhhYmV0aWNhbCBvcmRlclxuICAgICAgICAvLyBhbHNvIGl0J3MgYmV0dGVyIGZvciB0aGUgcGxheWdyb3VuZCBkb2N1bWVudGF0aW9uXG4gICAgICAgIGNvbnN0IG9yZGVyZWRGaWVsZHMgPSB7fTtcbiAgICAgICAgT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBvcmRlcmVkRmllbGRzW2ZpZWxkTmFtZV0gPSBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIH0pO1xuICAgICAgICBwYXJzZUNsYXNzLmZpZWxkcyA9IG9yZGVyZWRGaWVsZHM7XG4gICAgICAgIHBhcnNlQ2xhc3NUeXBlcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzUXVlcmllcy5sb2FkKHRoaXMsIHBhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWcpO1xuICAgICAgICBwYXJzZUNsYXNzTXV0YXRpb25zLmxvYWQodGhpcywgcGFyc2VDbGFzcywgcGFyc2VDbGFzc0NvbmZpZyk7XG4gICAgICB9XG4gICAgKTtcblxuICAgIGRlZmF1bHRHcmFwaFFMVHlwZXMubG9hZEFycmF5UmVzdWx0KHRoaXMsIHBhcnNlQ2xhc3Nlcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmxvYWQodGhpcyk7XG4gICAgZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMubG9hZCh0aGlzKTtcblxuICAgIGxldCBncmFwaFFMUXVlcnkgPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTFF1ZXJpZXMpLmxlbmd0aCA+IDApIHtcbiAgICAgIGdyYXBoUUxRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICAgIG5hbWU6ICdRdWVyeScsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnUXVlcnkgaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBxdWVyaWVzLicsXG4gICAgICAgIGZpZWxkczogdGhpcy5ncmFwaFFMUXVlcmllcyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMUXVlcnksIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMTXV0YXRpb24gPSB1bmRlZmluZWQ7XG4gICAgaWYgKE9iamVjdC5rZXlzKHRoaXMuZ3JhcGhRTE11dGF0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgZ3JhcGhRTE11dGF0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ011dGF0aW9uJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIG11dGF0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTE11dGF0aW9ucyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRHcmFwaFFMVHlwZShncmFwaFFMTXV0YXRpb24sIHRydWUsIHRydWUpO1xuICAgIH1cblxuICAgIGxldCBncmFwaFFMU3Vic2NyaXB0aW9uID0gdW5kZWZpbmVkO1xuICAgIGlmIChPYmplY3Qua2V5cyh0aGlzLmdyYXBoUUxTdWJzY3JpcHRpb25zKS5sZW5ndGggPiAwKSB7XG4gICAgICBncmFwaFFMU3Vic2NyaXB0aW9uID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgICAgICAgbmFtZTogJ1N1YnNjcmlwdGlvbicsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3Vic2NyaXB0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igc3Vic2NyaXB0aW9ucy4nLFxuICAgICAgICBmaWVsZHM6IHRoaXMuZ3JhcGhRTFN1YnNjcmlwdGlvbnMsXG4gICAgICB9KTtcbiAgICAgIHRoaXMuYWRkR3JhcGhRTFR5cGUoZ3JhcGhRTFN1YnNjcmlwdGlvbiwgdHJ1ZSwgdHJ1ZSk7XG4gICAgfVxuXG4gICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSA9IG5ldyBHcmFwaFFMU2NoZW1hKHtcbiAgICAgIHR5cGVzOiB0aGlzLmdyYXBoUUxUeXBlcyxcbiAgICAgIHF1ZXJ5OiBncmFwaFFMUXVlcnksXG4gICAgICBtdXRhdGlvbjogZ3JhcGhRTE11dGF0aW9uLFxuICAgICAgc3Vic2NyaXB0aW9uOiBncmFwaFFMU3Vic2NyaXB0aW9uLFxuICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKSB7XG4gICAgICBzY2hlbWFEaXJlY3RpdmVzLmxvYWQodGhpcyk7XG5cbiAgICAgIGlmICh0eXBlb2YgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZ2V0VHlwZU1hcCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAvLyBJbiBmb2xsb3dpbmcgY29kZSB3ZSB1c2UgdW5kZXJzY29yZSBhdHRyIHRvIGF2b2lkIGpzIHZhciB1biByZWZcbiAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXAgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5fdHlwZU1hcDtcbiAgICAgICAgY29uc3QgZmluZEFuZFJlcGxhY2VMYXN0VHlwZSA9IChwYXJlbnQsIGtleSkgPT4ge1xuICAgICAgICAgIGlmIChwYXJlbnRba2V5XS5uYW1lKSB7XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWEuX3R5cGVNYXBbcGFyZW50W2tleV0ubmFtZV0gJiZcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXSAhPT0gcGFyZW50W2tleV1cbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyBUbyBhdm9pZCB1bnJlc29sdmVkIGZpZWxkIG9uIG92ZXJsb2FkZWQgc2NoZW1hXG4gICAgICAgICAgICAgIC8vIHJlcGxhY2UgdGhlIGZpbmFsIHR5cGUgd2l0aCB0aGUgYXV0byBzY2hlbWEgb25lXG4gICAgICAgICAgICAgIHBhcmVudFtrZXldID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtwYXJlbnRba2V5XS5uYW1lXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHBhcmVudFtrZXldLm9mVHlwZSkge1xuICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKHBhcmVudFtrZXldLCAnb2ZUeXBlJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgICAvLyBBZGQgbm9uIHNoYXJlZCB0eXBlcyBmcm9tIGN1c3RvbSBzY2hlbWEgdG8gYXV0byBzY2hlbWFcbiAgICAgICAgLy8gbm90ZTogc29tZSBub24gc2hhcmVkIHR5cGVzIGNhbiB1c2Ugc29tZSBzaGFyZWQgdHlwZXNcbiAgICAgICAgLy8gc28gdGhpcyBjb2RlIG5lZWQgdG8gYmUgcmFuIGJlZm9yZSB0aGUgc2hhcmVkIHR5cGVzIGFkZGl0aW9uXG4gICAgICAgIC8vIHdlIHVzZSBzb3J0IHRvIGVuc3VyZSBzY2hlbWEgY29uc2lzdGVuY3kgb3ZlciByZXN0YXJ0c1xuICAgICAgICBPYmplY3Qua2V5cyhjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcClcbiAgICAgICAgICAuc29ydCgpXG4gICAgICAgICAgLmZvckVhY2goY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXkgPT4ge1xuICAgICAgICAgICAgY29uc3QgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZU1hcFtjdXN0b21HcmFwaFFMU2NoZW1hVHlwZUtleV07XG4gICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICFjdXN0b21HcmFwaFFMU2NoZW1hVHlwZSB8fFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZSB8fFxuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lLnN0YXJ0c1dpdGgoJ19fJylcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBhdXRvR3JhcGhRTFNjaGVtYVR5cGUgPSB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLl90eXBlTWFwW1xuICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICBdO1xuICAgICAgICAgICAgaWYgKCFhdXRvR3JhcGhRTFNjaGVtYVR5cGUpIHtcbiAgICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgICBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZS5uYW1lXG4gICAgICAgICAgICAgIF0gPSBjdXN0b21HcmFwaFFMU2NoZW1hVHlwZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgLy8gSGFuZGxlIHNoYXJlZCB0eXBlc1xuICAgICAgICAvLyBXZSBwYXNzIHRocm91Z2ggZWFjaCB0eXBlIGFuZCBlbnN1cmUgdGhhdCBhbGwgc3ViIGZpZWxkIHR5cGVzIGFyZSByZXBsYWNlZFxuICAgICAgICAvLyB3ZSB1c2Ugc29ydCB0byBlbnN1cmUgc2NoZW1hIGNvbnNpc3RlbmN5IG92ZXIgcmVzdGFydHNcbiAgICAgICAgT2JqZWN0LmtleXMoY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXApXG4gICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgIC5mb3JFYWNoKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlS2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVNYXBbY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGVLZXldO1xuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAhY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUgfHxcbiAgICAgICAgICAgICAgIWN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLm5hbWUgfHxcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZS5zdGFydHNXaXRoKCdfXycpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3QgYXV0b0dyYXBoUUxTY2hlbWFUeXBlID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYS5fdHlwZU1hcFtcbiAgICAgICAgICAgICAgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUubmFtZVxuICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgaWYgKGF1dG9HcmFwaFFMU2NoZW1hVHlwZSAmJiB0eXBlb2YgY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIE9iamVjdC5rZXlzKGN1c3RvbUdyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHMpXG4gICAgICAgICAgICAgICAgLnNvcnQoKVxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKGZpZWxkS2V5ID0+IHtcbiAgICAgICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gY3VzdG9tR3JhcGhRTFNjaGVtYVR5cGUuX2ZpZWxkc1tmaWVsZEtleV07XG4gICAgICAgICAgICAgICAgICBmaW5kQW5kUmVwbGFjZUxhc3RUeXBlKGZpZWxkLCAndHlwZScpO1xuICAgICAgICAgICAgICAgICAgYXV0b0dyYXBoUUxTY2hlbWFUeXBlLl9maWVsZHNbZmllbGQubmFtZV0gPSBmaWVsZDtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gdGhpcy5ncmFwaFFMQXV0b1NjaGVtYTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IGF3YWl0IHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzKHtcbiAgICAgICAgICBkaXJlY3RpdmVzRGVmaW5pdGlvbnNTY2hlbWE6IHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNEZWZpbml0aW9ucyxcbiAgICAgICAgICBhdXRvU2NoZW1hOiB0aGlzLmdyYXBoUUxBdXRvU2NoZW1hLFxuICAgICAgICAgIHN0aXRjaFNjaGVtYXMsXG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hID0gc3RpdGNoU2NoZW1hcyh7XG4gICAgICAgICAgc2NoZW1hczogW1xuICAgICAgICAgICAgdGhpcy5ncmFwaFFMU2NoZW1hRGlyZWN0aXZlc0RlZmluaXRpb25zLFxuICAgICAgICAgICAgdGhpcy5ncmFwaFFMQXV0b1NjaGVtYSxcbiAgICAgICAgICAgIHRoaXMuZ3JhcGhRTEN1c3RvbVR5cGVEZWZzLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgbWVyZ2VEaXJlY3RpdmVzOiB0cnVlLFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgLy8gT25seSBtZXJnZSBkaXJlY3RpdmUgd2hlbiBzdHJpbmcgc2NoZW1hIHByb3ZpZGVkXG4gICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZU1hcCA9IHRoaXMuZ3JhcGhRTFNjaGVtYS5nZXRUeXBlTWFwKCk7XG4gICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZU1hcCkuZm9yRWFjaChncmFwaFFMU2NoZW1hVHlwZU5hbWUgPT4ge1xuICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZSA9IGdyYXBoUUxTY2hlbWFUeXBlTWFwW2dyYXBoUUxTY2hlbWFUeXBlTmFtZV07XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0eXBlb2YgZ3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzID09PSAnZnVuY3Rpb24nICYmXG4gICAgICAgICAgdGhpcy5ncmFwaFFMQ3VzdG9tVHlwZURlZnMuZGVmaW5pdGlvbnNcbiAgICAgICAgKSB7XG4gICAgICAgICAgY29uc3QgZ3JhcGhRTEN1c3RvbVR5cGVEZWYgPSB0aGlzLmdyYXBoUUxDdXN0b21UeXBlRGVmcy5kZWZpbml0aW9ucy5maW5kKFxuICAgICAgICAgICAgZGVmaW5pdGlvbiA9PiBkZWZpbml0aW9uLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgICAgaWYgKGdyYXBoUUxDdXN0b21UeXBlRGVmKSB7XG4gICAgICAgICAgICBjb25zdCBncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwID0gZ3JhcGhRTFNjaGVtYVR5cGUuZ2V0RmllbGRzKCk7XG4gICAgICAgICAgICBPYmplY3Qua2V5cyhncmFwaFFMU2NoZW1hVHlwZUZpZWxkTWFwKS5mb3JFYWNoKGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZCA9IGdyYXBoUUxTY2hlbWFUeXBlRmllbGRNYXBbZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoIWdyYXBoUUxTY2hlbWFUeXBlRmllbGQuYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFzdE5vZGUgPSBncmFwaFFMQ3VzdG9tVHlwZURlZi5maWVsZHMuZmluZChcbiAgICAgICAgICAgICAgICAgIGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09IGdyYXBoUUxTY2hlbWFUeXBlRmllbGROYW1lXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICBpZiAoYXN0Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgZ3JhcGhRTFNjaGVtYVR5cGVGaWVsZC5hc3ROb2RlID0gYXN0Tm9kZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIFNjaGVtYURpcmVjdGl2ZVZpc2l0b3IudmlzaXRTY2hlbWFEaXJlY3RpdmVzKFxuICAgICAgICB0aGlzLmdyYXBoUUxTY2hlbWEsXG4gICAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYURpcmVjdGl2ZXNcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZ3JhcGhRTFNjaGVtYSA9IHRoaXMuZ3JhcGhRTEF1dG9TY2hlbWE7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuZ3JhcGhRTFNjaGVtYTtcbiAgfVxuXG4gIGFkZEdyYXBoUUxUeXBlKHR5cGUsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSwgaWdub3JlQ29ubmVjdGlvbiA9IGZhbHNlKSB7XG4gICAgaWYgKFxuICAgICAgKCFpZ25vcmVSZXNlcnZlZCAmJiBSRVNFUlZFRF9HUkFQSFFMX1RZUEVfTkFNRVMuaW5jbHVkZXModHlwZS5uYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTFR5cGVzLmZpbmQoZXhpc3RpbmdUeXBlID0+IGV4aXN0aW5nVHlwZS5uYW1lID09PSB0eXBlLm5hbWUpIHx8XG4gICAgICAoIWlnbm9yZUNvbm5lY3Rpb24gJiYgdHlwZS5uYW1lLmVuZHNXaXRoKCdDb25uZWN0aW9uJykpXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFR5cGUgJHt0eXBlLm5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBpdCBjb2xsaWRlZCB3aXRoIGFuIGV4aXN0aW5nIHR5cGUuYDtcbiAgICAgIGlmICh0aHJvd0Vycm9yKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubG9nLndhcm4obWVzc2FnZSk7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB0aGlzLmdyYXBoUUxUeXBlcy5wdXNoKHR5cGUpO1xuICAgIHJldHVybiB0eXBlO1xuICB9XG5cbiAgYWRkR3JhcGhRTFF1ZXJ5KGZpZWxkTmFtZSwgZmllbGQsIHRocm93RXJyb3IgPSBmYWxzZSwgaWdub3JlUmVzZXJ2ZWQgPSBmYWxzZSkge1xuICAgIGlmIChcbiAgICAgICghaWdub3JlUmVzZXJ2ZWQgJiYgUkVTRVJWRURfR1JBUEhRTF9RVUVSWV9OQU1FUy5pbmNsdWRlcyhmaWVsZE5hbWUpKSB8fFxuICAgICAgdGhpcy5ncmFwaFFMUXVlcmllc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYFF1ZXJ5ICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTFF1ZXJpZXNbZmllbGROYW1lXSA9IGZpZWxkO1xuICAgIHJldHVybiBmaWVsZDtcbiAgfVxuXG4gIGFkZEdyYXBoUUxNdXRhdGlvbihmaWVsZE5hbWUsIGZpZWxkLCB0aHJvd0Vycm9yID0gZmFsc2UsIGlnbm9yZVJlc2VydmVkID0gZmFsc2UpIHtcbiAgICBpZiAoXG4gICAgICAoIWlnbm9yZVJlc2VydmVkICYmIFJFU0VSVkVEX0dSQVBIUUxfTVVUQVRJT05fTkFNRVMuaW5jbHVkZXMoZmllbGROYW1lKSkgfHxcbiAgICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdXG4gICAgKSB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYE11dGF0aW9uICR7ZmllbGROYW1lfSBjb3VsZCBub3QgYmUgYWRkZWQgdG8gdGhlIGF1dG8gc2NoZW1hIGJlY2F1c2UgaXQgY29sbGlkZWQgd2l0aCBhbiBleGlzdGluZyBmaWVsZC5gO1xuICAgICAgaWYgKHRocm93RXJyb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1lc3NhZ2UpO1xuICAgICAgfVxuICAgICAgdGhpcy5sb2cud2FybihtZXNzYWdlKTtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHRoaXMuZ3JhcGhRTE11dGF0aW9uc1tmaWVsZE5hbWVdID0gZmllbGQ7XG4gICAgcmV0dXJuIGZpZWxkO1xuICB9XG5cbiAgaGFuZGxlRXJyb3IoZXJyb3IpIHtcbiAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgdGhpcy5sb2cuZXJyb3IoJ1BhcnNlIGVycm9yOiAnLCBlcnJvcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMubG9nLmVycm9yKCdVbmNhdWdodCBpbnRlcm5hbCBzZXJ2ZXIgZXJyb3IuJywgZXJyb3IsIGVycm9yLnN0YWNrKTtcbiAgICB9XG4gICAgdGhyb3cgdG9HcmFwaFFMRXJyb3IoZXJyb3IpO1xuICB9XG5cbiAgYXN5bmMgX2luaXRpYWxpemVTY2hlbWFBbmRDb25maWcoKSB7XG4gICAgY29uc3QgW3NjaGVtYUNvbnRyb2xsZXIsIHBhcnNlR3JhcGhRTENvbmZpZ10gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5sb2FkU2NoZW1hKCksXG4gICAgICB0aGlzLnBhcnNlR3JhcGhRTENvbnRyb2xsZXIuZ2V0R3JhcGhRTENvbmZpZygpLFxuICAgIF0pO1xuXG4gICAgdGhpcy5zY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcblxuICAgIHJldHVybiB7XG4gICAgICBwYXJzZUdyYXBoUUxDb25maWcsXG4gICAgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBHZXRzIGFsbCBjbGFzc2VzIGZvdW5kIGJ5IHRoZSBgc2NoZW1hQ29udHJvbGxlcmBcbiAgICogbWludXMgdGhvc2UgZmlsdGVyZWQgb3V0IGJ5IHRoZSBhcHAncyBwYXJzZUdyYXBoUUxDb25maWcuXG4gICAqL1xuICBhc3luYyBfZ2V0Q2xhc3Nlc0ZvclNjaGVtYShwYXJzZUdyYXBoUUxDb25maWc6IFBhcnNlR3JhcGhRTENvbmZpZykge1xuICAgIGNvbnN0IHsgZW5hYmxlZEZvckNsYXNzZXMsIGRpc2FibGVkRm9yQ2xhc3NlcyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuICAgIGNvbnN0IGFsbENsYXNzZXMgPSBhd2FpdCB0aGlzLnNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpIHx8IEFycmF5LmlzQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgbGV0IGluY2x1ZGVkQ2xhc3NlcyA9IGFsbENsYXNzZXM7XG4gICAgICBpZiAoZW5hYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgaW5jbHVkZWRDbGFzc2VzID0gYWxsQ2xhc3Nlcy5maWx0ZXIoY2xhenogPT4ge1xuICAgICAgICAgIHJldHVybiBlbmFibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmIChkaXNhYmxlZEZvckNsYXNzZXMpIHtcbiAgICAgICAgLy8gQ2xhc3NlcyBpbmNsdWRlZCBpbiBgZW5hYmxlZEZvckNsYXNzZXNgIHRoYXRcbiAgICAgICAgLy8gYXJlIGFsc28gcHJlc2VudCBpbiBgZGlzYWJsZWRGb3JDbGFzc2VzYCB3aWxsXG4gICAgICAgIC8vIHN0aWxsIGJlIGZpbHRlcmVkIG91dFxuICAgICAgICBpbmNsdWRlZENsYXNzZXMgPSBpbmNsdWRlZENsYXNzZXMuZmlsdGVyKGNsYXp6ID0+IHtcbiAgICAgICAgICByZXR1cm4gIWRpc2FibGVkRm9yQ2xhc3Nlcy5pbmNsdWRlcyhjbGF6ei5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5pc1VzZXJzQ2xhc3NEaXNhYmxlZCA9ICFpbmNsdWRlZENsYXNzZXMuc29tZShjbGF6eiA9PiB7XG4gICAgICAgIHJldHVybiBjbGF6ei5jbGFzc05hbWUgPT09ICdfVXNlcic7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIGluY2x1ZGVkQ2xhc3NlcztcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGFsbENsYXNzZXM7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgbWV0aG9kIHJldHVybnMgYSBsaXN0IG9mIHR1cGxlc1xuICAgKiB0aGF0IHByb3ZpZGUgdGhlIHBhcnNlQ2xhc3MgYWxvbmcgd2l0aFxuICAgKiBpdHMgcGFyc2VDbGFzc0NvbmZpZyB3aGVyZSBwcm92aWRlZC5cbiAgICovXG4gIF9nZXRQYXJzZUNsYXNzZXNXaXRoQ29uZmlnKHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpIHtcbiAgICBjb25zdCB7IGNsYXNzQ29uZmlncyB9ID0gcGFyc2VHcmFwaFFMQ29uZmlnO1xuXG4gICAgLy8gTWFrZSBzdXJlcyB0aGF0IHRoZSBkZWZhdWx0IGNsYXNzZXMgYW5kIGNsYXNzZXMgdGhhdFxuICAgIC8vIHN0YXJ0cyB3aXRoIGNhcGl0YWxpemVkIGxldHRlciB3aWxsIGJlIGdlbmVyYXRlZCBmaXJzdC5cbiAgICBjb25zdCBzb3J0Q2xhc3NlcyA9IChhLCBiKSA9PiB7XG4gICAgICBhID0gYS5jbGFzc05hbWU7XG4gICAgICBiID0gYi5jbGFzc05hbWU7XG4gICAgICBpZiAoYVswXSA9PT0gJ18nKSB7XG4gICAgICAgIGlmIChiWzBdICE9PSAnXycpIHtcbiAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChiWzBdID09PSAnXycpIHtcbiAgICAgICAgaWYgKGFbMF0gIT09ICdfJykge1xuICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0gZWxzZSBpZiAoYSA8IGIpIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIDE7XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBwYXJzZUNsYXNzZXMuc29ydChzb3J0Q2xhc3NlcykubWFwKHBhcnNlQ2xhc3MgPT4ge1xuICAgICAgbGV0IHBhcnNlQ2xhc3NDb25maWc7XG4gICAgICBpZiAoY2xhc3NDb25maWdzKSB7XG4gICAgICAgIHBhcnNlQ2xhc3NDb25maWcgPSBjbGFzc0NvbmZpZ3MuZmluZChjID0+IGMuY2xhc3NOYW1lID09PSBwYXJzZUNsYXNzLmNsYXNzTmFtZSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gW3BhcnNlQ2xhc3MsIHBhcnNlQ2xhc3NDb25maWddO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgX2dldEZ1bmN0aW9uTmFtZXMoKSB7XG4gICAgcmV0dXJuIGF3YWl0IGdldEZ1bmN0aW9uTmFtZXModGhpcy5hcHBJZCkuZmlsdGVyKGZ1bmN0aW9uTmFtZSA9PiB7XG4gICAgICBpZiAoL15bX2EtekEtWl1bX2EtekEtWjAtOV0qJC8udGVzdChmdW5jdGlvbk5hbWUpKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5sb2cud2FybihcbiAgICAgICAgICBgRnVuY3Rpb24gJHtmdW5jdGlvbk5hbWV9IGNvdWxkIG5vdCBiZSBhZGRlZCB0byB0aGUgYXV0byBzY2hlbWEgYmVjYXVzZSBHcmFwaFFMIG5hbWVzIG11c3QgbWF0Y2ggL15bX2EtekEtWl1bX2EtekEtWjAtOV0qJC8uYFxuICAgICAgICApO1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ2hlY2tzIGZvciBjaGFuZ2VzIHRvIHRoZSBwYXJzZUNsYXNzZXNcbiAgICogb2JqZWN0cyAoaS5lLiBkYXRhYmFzZSBzY2hlbWEpIG9yIHRvXG4gICAqIHRoZSBwYXJzZUdyYXBoUUxDb25maWcgb2JqZWN0LiBJZiBub1xuICAgKiBjaGFuZ2VzIGFyZSBmb3VuZCwgcmV0dXJuIHRydWU7XG4gICAqL1xuICBfaGFzU2NoZW1hSW5wdXRDaGFuZ2VkKHBhcmFtczoge1xuICAgIHBhcnNlQ2xhc3NlczogYW55LFxuICAgIHBhcnNlR3JhcGhRTENvbmZpZzogP1BhcnNlR3JhcGhRTENvbmZpZyxcbiAgICBmdW5jdGlvbk5hbWVzU3RyaW5nOiBzdHJpbmcsXG4gIH0pOiBib29sZWFuIHtcbiAgICBjb25zdCB7IHBhcnNlQ2xhc3NlcywgcGFyc2VHcmFwaFFMQ29uZmlnLCBmdW5jdGlvbk5hbWVzU3RyaW5nIH0gPSBwYXJhbXM7XG5cbiAgICAvLyBGaXJzdCBpbml0XG4gICAgaWYgKCF0aGlzLnBhcnNlQ2FjaGVkQ2xhc3NlcyB8fCAhdGhpcy5ncmFwaFFMU2NoZW1hKSB7XG4gICAgICBjb25zdCB0aGlzUGFyc2VDbGFzc2VzT2JqID0gcGFyc2VDbGFzc2VzLnJlZHVjZSgoYWNjLCBjbHp6KSA9PiB7XG4gICAgICAgIGFjY1tjbHp6LmNsYXNzTmFtZV0gPSBjbHp6O1xuICAgICAgICByZXR1cm4gYWNjO1xuICAgICAgfSwge30pO1xuICAgICAgdGhpcy5wYXJzZUNhY2hlZENsYXNzZXMgPSB0aGlzUGFyc2VDbGFzc2VzT2JqO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgbmV3UGFyc2VDYWNoZWRDbGFzc2VzID0gcGFyc2VDbGFzc2VzLnJlZHVjZSgoYWNjLCBjbHp6KSA9PiB7XG4gICAgICBhY2NbY2x6ei5jbGFzc05hbWVdID0gY2x6ejtcbiAgICAgIHJldHVybiBhY2M7XG4gICAgfSwge30pO1xuXG4gICAgaWYgKFxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUdyYXBoUUxDb25maWcsIHBhcnNlR3JhcGhRTENvbmZpZykgJiZcbiAgICAgIHRoaXMuZnVuY3Rpb25OYW1lc1N0cmluZyA9PT0gZnVuY3Rpb25OYW1lc1N0cmluZyAmJlxuICAgICAgaXNEZWVwU3RyaWN0RXF1YWwodGhpcy5wYXJzZUNhY2hlZENsYXNzZXMsIG5ld1BhcnNlQ2FjaGVkQ2xhc3NlcylcbiAgICApIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB0aGlzLnBhcnNlQ2FjaGVkQ2xhc3NlcyA9IG5ld1BhcnNlQ2FjaGVkQ2xhc3NlcztcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufVxuXG5leHBvcnQgeyBQYXJzZUdyYXBoUUxTY2hlbWEgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLDJCQUEyQixHQUFHLENB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