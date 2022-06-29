"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.serializeDateIso = exports.parseValue = exports.parseStringValue = exports.parseObjectFields = exports.parseListValues = exports.parseIntValue = exports.parseFloatValue = exports.parseFileValue = exports.parseDateIsoValue = exports.parseBooleanValue = exports.options = exports.notInQueryKey = exports.notIn = exports.notEqualTo = exports.matchesRegex = exports.loadArrayResult = exports.load = exports.lessThanOrEqualTo = exports.lessThan = exports.inQueryKey = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.exists = exports.equalTo = exports.WITHIN_INPUT = exports.WHERE_ATT = exports.USER_ACL_INPUT = exports.USER_ACL = exports.UPDATE_RESULT_FIELDS = exports.UPDATED_AT_ATT = exports.TypeValidationError = exports.TEXT_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.SUBQUERY_INPUT = exports.STRING_WHERE_INPUT = exports.SKIP_ATT = exports.SESSION_TOKEN_ATT = exports.SELECT_INPUT = exports.SEARCH_INPUT = exports.ROLE_ACL_INPUT = exports.ROLE_ACL = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.READ_OPTIONS_INPUT = exports.READ_OPTIONS_ATT = exports.PUBLIC_ACL_INPUT = exports.PUBLIC_ACL = exports.POLYGON_WHERE_INPUT = exports.POLYGON_INPUT = exports.POLYGON = exports.PARSE_OBJECT_FIELDS = exports.PARSE_OBJECT = exports.OBJECT_WHERE_INPUT = exports.OBJECT_ID_ATT = exports.OBJECT_ID = exports.OBJECT = exports.NUMBER_WHERE_INPUT = exports.LIMIT_ATT = exports.KEY_VALUE_INPUT = exports.INPUT_FIELDS = exports.INCLUDE_READ_PREFERENCE_ATT = exports.ID_WHERE_INPUT = exports.GLOBAL_OR_OBJECT_ID_ATT = exports.GEO_WITHIN_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.GEO_POINT = exports.GEO_INTERSECTS_INPUT = exports.FILE_WHERE_INPUT = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.ELEMENT = exports.DATE_WHERE_INPUT = exports.DATE = exports.CREATE_RESULT_FIELDS = exports.CREATED_AT_ATT = exports.COUNT_ATT = exports.CLASS_NAME_ATT = exports.CENTER_SPHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.BYTES = exports.BOX_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.ARRAY_WHERE_INPUT = exports.ARRAY_RESULT = exports.ANY = exports.ACL_INPUT = exports.ACL = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _links = require("@graphql-tools/links");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class TypeValidationError extends Error {
  constructor(value, type) {
    super(`${value} is not a valid ${type}`);
  }

}

exports.TypeValidationError = TypeValidationError;

const parseStringValue = value => {
  if (typeof value === 'string') {
    return value;
  }

  throw new TypeValidationError(value, 'String');
};

exports.parseStringValue = parseStringValue;

const parseIntValue = value => {
  if (typeof value === 'string') {
    const int = Number(value);

    if (Number.isInteger(int)) {
      return int;
    }
  }

  throw new TypeValidationError(value, 'Int');
};

exports.parseIntValue = parseIntValue;

const parseFloatValue = value => {
  if (typeof value === 'string') {
    const float = Number(value);

    if (!isNaN(float)) {
      return float;
    }
  }

  throw new TypeValidationError(value, 'Float');
};

exports.parseFloatValue = parseFloatValue;

const parseBooleanValue = value => {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new TypeValidationError(value, 'Boolean');
};

exports.parseBooleanValue = parseBooleanValue;

const parseValue = value => {
  switch (value.kind) {
    case _graphql.Kind.STRING:
      return parseStringValue(value.value);

    case _graphql.Kind.INT:
      return parseIntValue(value.value);

    case _graphql.Kind.FLOAT:
      return parseFloatValue(value.value);

    case _graphql.Kind.BOOLEAN:
      return parseBooleanValue(value.value);

    case _graphql.Kind.LIST:
      return parseListValues(value.values);

    case _graphql.Kind.OBJECT:
      return parseObjectFields(value.fields);

    default:
      return value.value;
  }
};

exports.parseValue = parseValue;

const parseListValues = values => {
  if (Array.isArray(values)) {
    return values.map(value => parseValue(value));
  }

  throw new TypeValidationError(values, 'List');
};

exports.parseListValues = parseListValues;

const parseObjectFields = fields => {
  if (Array.isArray(fields)) {
    return fields.reduce((object, field) => _objectSpread(_objectSpread({}, object), {}, {
      [field.name.value]: parseValue(field.value)
    }), {});
  }

  throw new TypeValidationError(fields, 'Object');
};

exports.parseObjectFields = parseObjectFields;
const ANY = new _graphql.GraphQLScalarType({
  name: 'Any',
  description: 'The Any scalar type is used in operations and types that involve any type of value.',
  parseValue: value => value,
  serialize: value => value,
  parseLiteral: ast => parseValue(ast)
});
exports.ANY = ANY;
const OBJECT = new _graphql.GraphQLScalarType({
  name: 'Object',
  description: 'The Object scalar type is used in operations and types that involve objects.',

  parseValue(value) {
    if (typeof value === 'object') {
      return value;
    }

    throw new TypeValidationError(value, 'Object');
  },

  serialize(value) {
    if (typeof value === 'object') {
      return value;
    }

    throw new TypeValidationError(value, 'Object');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.OBJECT) {
      return parseObjectFields(ast.fields);
    }

    throw new TypeValidationError(ast.kind, 'Object');
  }

});
exports.OBJECT = OBJECT;

const parseDateIsoValue = value => {
  if (typeof value === 'string') {
    const date = new Date(value);

    if (!isNaN(date)) {
      return date;
    }
  } else if (value instanceof Date) {
    return value;
  }

  throw new TypeValidationError(value, 'Date');
};

exports.parseDateIsoValue = parseDateIsoValue;

const serializeDateIso = value => {
  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  throw new TypeValidationError(value, 'Date');
};

exports.serializeDateIso = serializeDateIso;

const parseDateIsoLiteral = ast => {
  if (ast.kind === _graphql.Kind.STRING) {
    return parseDateIsoValue(ast.value);
  }

  throw new TypeValidationError(ast.kind, 'Date');
};

const DATE = new _graphql.GraphQLScalarType({
  name: 'Date',
  description: 'The Date scalar type is used in operations and types that involve dates.',

  parseValue(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return {
        __type: 'Date',
        iso: parseDateIsoValue(value)
      };
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return {
        __type: value.__type,
        iso: parseDateIsoValue(value.iso)
      };
    }

    throw new TypeValidationError(value, 'Date');
  },

  serialize(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return serializeDateIso(value);
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return serializeDateIso(value.iso);
    }

    throw new TypeValidationError(value, 'Date');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Date',
        iso: parseDateIsoLiteral(ast)
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');

      const iso = ast.fields.find(field => field.name.value === 'iso');

      if (__type && __type.value && __type.value.value === 'Date' && iso) {
        return {
          __type: __type.value.value,
          iso: parseDateIsoLiteral(iso.value)
        };
      }
    }

    throw new TypeValidationError(ast.kind, 'Date');
  }

});
exports.DATE = DATE;
const BYTES = new _graphql.GraphQLScalarType({
  name: 'Bytes',
  description: 'The Bytes scalar type is used in operations and types that involve base 64 binary data.',

  parseValue(value) {
    if (typeof value === 'string') {
      return {
        __type: 'Bytes',
        base64: value
      };
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value;
    }

    throw new TypeValidationError(value, 'Bytes');
  },

  serialize(value) {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value.base64;
    }

    throw new TypeValidationError(value, 'Bytes');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Bytes',
        base64: ast.value
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');

      const base64 = ast.fields.find(field => field.name.value === 'base64');

      if (__type && __type.value && __type.value.value === 'Bytes' && base64 && base64.value && typeof base64.value.value === 'string') {
        return {
          __type: __type.value.value,
          base64: base64.value.value
        };
      }
    }

    throw new TypeValidationError(ast.kind, 'Bytes');
  }

});
exports.BYTES = BYTES;

const parseFileValue = value => {
  if (typeof value === 'string') {
    return {
      __type: 'File',
      name: value
    };
  } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
    return value;
  }

  throw new TypeValidationError(value, 'File');
};

exports.parseFileValue = parseFileValue;
const FILE = new _graphql.GraphQLScalarType({
  name: 'File',
  description: 'The File scalar type is used in operations and types that involve files.',
  parseValue: parseFileValue,
  serialize: value => {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
      return value.name;
    }

    throw new TypeValidationError(value, 'File');
  },

  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return parseFileValue(ast.value);
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');

      const name = ast.fields.find(field => field.name.value === 'name');
      const url = ast.fields.find(field => field.name.value === 'url');

      if (__type && __type.value && name && name.value) {
        return parseFileValue({
          __type: __type.value.value,
          name: name.value.value,
          url: url && url.value ? url.value.value : undefined
        });
      }
    }

    throw new TypeValidationError(ast.kind, 'File');
  }

});
exports.FILE = FILE;
const FILE_INFO = new _graphql.GraphQLObjectType({
  name: 'FileInfo',
  description: 'The FileInfo object type is used to return the information about files.',
  fields: {
    name: {
      description: 'This is the file name.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    url: {
      description: 'This is the url in which the file can be downloaded.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
exports.FILE_INFO = FILE_INFO;
const FILE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  description: 'If this field is set to null the file will be unlinked (the file will not be deleted on cloud storage).',
  fields: {
    file: {
      description: 'A File Scalar can be an url or a FileInfo object.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: _links.GraphQLUpload
    }
  }
});
exports.FILE_INPUT = FILE_INPUT;
const GEO_POINT_FIELDS = {
  latitude: {
    description: 'This is the latitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  },
  longitude: {
    description: 'This is the longitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  }
};
exports.GEO_POINT_FIELDS = GEO_POINT_FIELDS;
const GEO_POINT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointInput',
  description: 'The GeoPointInput type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT_INPUT = GEO_POINT_INPUT;
const GEO_POINT = new _graphql.GraphQLObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT = GEO_POINT;
const POLYGON_INPUT = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT_INPUT));
exports.POLYGON_INPUT = POLYGON_INPUT;
const POLYGON = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT));
exports.POLYGON = POLYGON;
const USER_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'UserACLInput',
  description: 'Allow to manage users in ACL.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.USER_ACL_INPUT = USER_ACL_INPUT;
const ROLE_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'RoleACLInput',
  description: 'Allow to manage roles in ACL.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.ROLE_ACL_INPUT = ROLE_ACL_INPUT;
const PUBLIC_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PublicACLInput',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.PUBLIC_ACL_INPUT = PUBLIC_ACL_INPUT;
const ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ACLInput',
  description: 'Allow to manage access rights. If not provided object will be publicly readable and writable',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL_INPUT))
    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL_INPUT))
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL_INPUT
    }
  }
});
exports.ACL_INPUT = ACL_INPUT;
const USER_ACL = new _graphql.GraphQLObjectType({
  name: 'UserACL',
  description: 'Allow to manage users in ACL. If read and write are null the users have read and write rights.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.USER_ACL = USER_ACL;
const ROLE_ACL = new _graphql.GraphQLObjectType({
  name: 'RoleACL',
  description: 'Allow to manage roles in ACL. If read and write are null the role have read and write rights.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.ROLE_ACL = ROLE_ACL;
const PUBLIC_ACL = new _graphql.GraphQLObjectType({
  name: 'PublicACL',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: _graphql.GraphQLBoolean
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: _graphql.GraphQLBoolean
    }
  }
});
exports.PUBLIC_ACL = PUBLIC_ACL;
const ACL = new _graphql.GraphQLObjectType({
  name: 'ACL',
  description: 'Current access control list of the current object.',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL)),

      resolve(p) {
        const users = [];
        Object.keys(p).forEach(rule => {
          if (rule !== '*' && rule.indexOf('role:') !== 0) {
            users.push({
              userId: (0, _graphqlRelay.toGlobalId)('_User', rule),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return users.length ? users : null;
      }

    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL)),

      resolve(p) {
        const roles = [];
        Object.keys(p).forEach(rule => {
          if (rule.indexOf('role:') === 0) {
            roles.push({
              roleName: rule.replace('role:', ''),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return roles.length ? roles : null;
      }

    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL,

      resolve(p) {
        /* eslint-disable */
        return p['*'] ? {
          read: p['*'].read ? true : false,
          write: p['*'].write ? true : false
        } : null;
      }

    }
  }
});
exports.ACL = ACL;
const OBJECT_ID = new _graphql.GraphQLNonNull(_graphql.GraphQLID);
exports.OBJECT_ID = OBJECT_ID;
const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.CLASS_NAME_ATT = CLASS_NAME_ATT;
const GLOBAL_OR_OBJECT_ID_ATT = {
  description: 'This is the object id. You can use either the global or the object id.',
  type: OBJECT_ID
};
exports.GLOBAL_OR_OBJECT_ID_ATT = GLOBAL_OR_OBJECT_ID_ATT;
const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID
};
exports.OBJECT_ID_ATT = OBJECT_ID_ATT;
const CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.CREATED_AT_ATT = CREATED_AT_ATT;
const UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.UPDATED_AT_ATT = UPDATED_AT_ATT;
const INPUT_FIELDS = {
  ACL: {
    type: ACL
  }
};
exports.INPUT_FIELDS = INPUT_FIELDS;
const CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
exports.CREATE_RESULT_FIELDS = CREATE_RESULT_FIELDS;
const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
exports.UPDATE_RESULT_FIELDS = UPDATE_RESULT_FIELDS;

const PARSE_OBJECT_FIELDS = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, CREATE_RESULT_FIELDS), UPDATE_RESULT_FIELDS), INPUT_FIELDS), {}, {
  ACL: {
    type: new _graphql.GraphQLNonNull(ACL),
    resolve: ({
      ACL
    }) => ACL ? ACL : {
      '*': {
        read: true,
        write: true
      }
    }
  }
});

exports.PARSE_OBJECT_FIELDS = PARSE_OBJECT_FIELDS;
const PARSE_OBJECT = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  description: 'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS
});
exports.PARSE_OBJECT = PARSE_OBJECT;
const SESSION_TOKEN_ATT = {
  description: 'The current user session token.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.SESSION_TOKEN_ATT = SESSION_TOKEN_ATT;
const READ_PREFERENCE = new _graphql.GraphQLEnumType({
  name: 'ReadPreference',
  description: 'The ReadPreference enum type is used in queries in order to select in which database replica the operation must run.',
  values: {
    PRIMARY: {
      value: 'PRIMARY'
    },
    PRIMARY_PREFERRED: {
      value: 'PRIMARY_PREFERRED'
    },
    SECONDARY: {
      value: 'SECONDARY'
    },
    SECONDARY_PREFERRED: {
      value: 'SECONDARY_PREFERRED'
    },
    NEAREST: {
      value: 'NEAREST'
    }
  }
});
exports.READ_PREFERENCE = READ_PREFERENCE;
const READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed.',
  type: READ_PREFERENCE
};
exports.READ_PREFERENCE_ATT = READ_PREFERENCE_ATT;
const INCLUDE_READ_PREFERENCE_ATT = {
  description: 'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE
};
exports.INCLUDE_READ_PREFERENCE_ATT = INCLUDE_READ_PREFERENCE_ATT;
const SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE
};
exports.SUBQUERY_READ_PREFERENCE_ATT = SUBQUERY_READ_PREFERENCE_ATT;
const READ_OPTIONS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ReadOptionsInput',
  description: 'The ReadOptionsInputt type is used in queries in order to set the read preferences.',
  fields: {
    readPreference: READ_PREFERENCE_ATT,
    includeReadPreference: INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: SUBQUERY_READ_PREFERENCE_ATT
  }
});
exports.READ_OPTIONS_INPUT = READ_OPTIONS_INPUT;
const READ_OPTIONS_ATT = {
  description: 'The read options for the query to be executed.',
  type: READ_OPTIONS_INPUT
};
exports.READ_OPTIONS_ATT = READ_OPTIONS_ATT;
const WHERE_ATT = {
  description: 'These are the conditions that the objects need to match in order to be found',
  type: OBJECT
};
exports.WHERE_ATT = WHERE_ATT;
const SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return.',
  type: _graphql.GraphQLInt
};
exports.SKIP_ATT = SKIP_ATT;
const LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned.',
  type: _graphql.GraphQLInt
};
exports.LIMIT_ATT = LIMIT_ATT;
const COUNT_ATT = {
  description: 'This is the total matched objecs count that is returned when the count flag is set.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
};
exports.COUNT_ATT = COUNT_ATT;
const SEARCH_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SearchInput',
  description: 'The SearchInput type is used to specifiy a search operation on a full text search.',
  fields: {
    term: {
      description: 'This is the term to be searched.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    language: {
      description: 'This is the language to tetermine the list of stop words and the rules for tokenizer.',
      type: _graphql.GraphQLString
    },
    caseSensitive: {
      description: 'This is the flag to enable or disable case sensitive search.',
      type: _graphql.GraphQLBoolean
    },
    diacriticSensitive: {
      description: 'This is the flag to enable or disable diacritic sensitive search.',
      type: _graphql.GraphQLBoolean
    }
  }
});
exports.SEARCH_INPUT = SEARCH_INPUT;
const TEXT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a text operation on a constraint.',
  fields: {
    search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_INPUT)
    }
  }
});
exports.TEXT_INPUT = TEXT_INPUT;
const BOX_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BoxInput',
  description: 'The BoxInput type is used to specifiy a box operation on a within geo query.',
  fields: {
    bottomLeft: {
      description: 'This is the bottom left coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    upperRight: {
      description: 'This is the upper right coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    }
  }
});
exports.BOX_INPUT = BOX_INPUT;
const WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'WithinInput',
  description: 'The WithinInput type is used to specify a within operation on a constraint.',
  fields: {
    box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_INPUT)
    }
  }
});
exports.WITHIN_INPUT = WITHIN_INPUT;
const CENTER_SPHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'CenterSphereInput',
  description: 'The CenterSphereInput type is used to specifiy a centerSphere operation on a geoWithin query.',
  fields: {
    center: {
      description: 'This is the center of the sphere.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    distance: {
      description: 'This is the radius of the sphere.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
    }
  }
});
exports.CENTER_SPHERE_INPUT = CENTER_SPHERE_INPUT;
const GEO_WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoWithinInput',
  description: 'The GeoWithinInput type is used to specify a geoWithin operation on a constraint.',
  fields: {
    polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON_INPUT
    },
    centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_INPUT
    }
  }
});
exports.GEO_WITHIN_INPUT = GEO_WITHIN_INPUT;
const GEO_INTERSECTS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description: 'The GeoIntersectsInput type is used to specify a geoIntersects operation on a constraint.',
  fields: {
    point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT
    }
  }
});
exports.GEO_INTERSECTS_INPUT = GEO_INTERSECTS_INPUT;

const equalTo = type => ({
  description: 'This is the equalTo operator to specify a constraint to select the objects where the value of a field equals to a specified value.',
  type
});

exports.equalTo = equalTo;

const notEqualTo = type => ({
  description: 'This is the notEqualTo operator to specify a constraint to select the objects where the value of a field do not equal to a specified value.',
  type
});

exports.notEqualTo = notEqualTo;

const lessThan = type => ({
  description: 'This is the lessThan operator to specify a constraint to select the objects where the value of a field is less than a specified value.',
  type
});

exports.lessThan = lessThan;

const lessThanOrEqualTo = type => ({
  description: 'This is the lessThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is less than or equal to a specified value.',
  type
});

exports.lessThanOrEqualTo = lessThanOrEqualTo;

const greaterThan = type => ({
  description: 'This is the greaterThan operator to specify a constraint to select the objects where the value of a field is greater than a specified value.',
  type
});

exports.greaterThan = greaterThan;

const greaterThanOrEqualTo = type => ({
  description: 'This is the greaterThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is greater than or equal to a specified value.',
  type
});

exports.greaterThanOrEqualTo = greaterThanOrEqualTo;

const inOp = type => ({
  description: 'This is the in operator to specify a constraint to select the objects where the value of a field equals any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});

exports.inOp = inOp;

const notIn = type => ({
  description: 'This is the notIn operator to specify a constraint to select the objects where the value of a field do not equal any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});

exports.notIn = notIn;
const exists = {
  description: 'This is the exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: _graphql.GraphQLBoolean
};
exports.exists = exists;
const matchesRegex = {
  description: 'This is the matchesRegex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: _graphql.GraphQLString
};
exports.matchesRegex = matchesRegex;
const options = {
  description: 'This is the options operator to specify optional flags (such as "i" and "m") to be added to a matchesRegex operation in the same set of constraints.',
  type: _graphql.GraphQLString
};
exports.options = options;
const SUBQUERY_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SubqueryInput',
  description: 'The SubqueryInput type is used to specify a sub query to another class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new _graphql.GraphQLNonNull(WHERE_ATT.type)
    })
  }
});
exports.SUBQUERY_INPUT = SUBQUERY_INPUT;
const SELECT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SelectInput',
  description: 'The SelectInput type is used to specify an inQueryKey or a notInQueryKey operation on a constraint.',
  fields: {
    query: {
      description: 'This is the subquery to be executed.',
      type: new _graphql.GraphQLNonNull(SUBQUERY_INPUT)
    },
    key: {
      description: 'This is the key in the result of the subquery that must match (not match) the field.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
exports.SELECT_INPUT = SELECT_INPUT;
const inQueryKey = {
  description: 'This is the inQueryKey operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.inQueryKey = inQueryKey;
const notInQueryKey = {
  description: 'This is the notInQueryKey operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.notInQueryKey = notInQueryKey;
const ID_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'IdWhereInput',
  description: 'The IdWhereInput input type is used in operations that involve filtering objects by an id.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLID),
    notEqualTo: notEqualTo(_graphql.GraphQLID),
    lessThan: lessThan(_graphql.GraphQLID),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLID),
    greaterThan: greaterThan(_graphql.GraphQLID),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLID),
    in: inOp(_graphql.GraphQLID),
    notIn: notIn(_graphql.GraphQLID),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.ID_WHERE_INPUT = ID_WHERE_INPUT;
const STRING_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'StringWhereInput',
  description: 'The StringWhereInput input type is used in operations that involve filtering objects by a field of type String.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLString),
    notEqualTo: notEqualTo(_graphql.GraphQLString),
    lessThan: lessThan(_graphql.GraphQLString),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLString),
    greaterThan: greaterThan(_graphql.GraphQLString),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLString),
    in: inOp(_graphql.GraphQLString),
    notIn: notIn(_graphql.GraphQLString),
    exists,
    matchesRegex,
    options,
    text: {
      description: 'This is the $text operator to specify a full text search constraint.',
      type: TEXT_INPUT
    },
    inQueryKey,
    notInQueryKey
  }
});
exports.STRING_WHERE_INPUT = STRING_WHERE_INPUT;
const NUMBER_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'NumberWhereInput',
  description: 'The NumberWhereInput input type is used in operations that involve filtering objects by a field of type Number.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLFloat),
    notEqualTo: notEqualTo(_graphql.GraphQLFloat),
    lessThan: lessThan(_graphql.GraphQLFloat),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLFloat),
    greaterThan: greaterThan(_graphql.GraphQLFloat),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLFloat),
    in: inOp(_graphql.GraphQLFloat),
    notIn: notIn(_graphql.GraphQLFloat),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.NUMBER_WHERE_INPUT = NUMBER_WHERE_INPUT;
const BOOLEAN_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BooleanWhereInput',
  description: 'The BooleanWhereInput input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLBoolean),
    notEqualTo: notEqualTo(_graphql.GraphQLBoolean),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.BOOLEAN_WHERE_INPUT = BOOLEAN_WHERE_INPUT;
const ARRAY_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ArrayWhereInput',
  description: 'The ArrayWhereInput input type is used in operations that involve filtering objects by a field of type Array.',
  fields: {
    equalTo: equalTo(ANY),
    notEqualTo: notEqualTo(ANY),
    lessThan: lessThan(ANY),
    lessThanOrEqualTo: lessThanOrEqualTo(ANY),
    greaterThan: greaterThan(ANY),
    greaterThanOrEqualTo: greaterThanOrEqualTo(ANY),
    in: inOp(ANY),
    notIn: notIn(ANY),
    exists,
    containedBy: {
      description: 'This is the containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    contains: {
      description: 'This is the contains operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    inQueryKey,
    notInQueryKey
  }
});
exports.ARRAY_WHERE_INPUT = ARRAY_WHERE_INPUT;
const KEY_VALUE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'KeyValueInput',
  description: 'An entry from an object, i.e., a pair of key and value.',
  fields: {
    key: {
      description: 'The key used to retrieve the value of this entry.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    value: {
      description: 'The value of the entry. Could be any type of scalar data.',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
});
exports.KEY_VALUE_INPUT = KEY_VALUE_INPUT;
const OBJECT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ObjectWhereInput',
  description: 'The ObjectWhereInput input type is used in operations that involve filtering result by a field of type Object.',
  fields: {
    equalTo: equalTo(KEY_VALUE_INPUT),
    notEqualTo: notEqualTo(KEY_VALUE_INPUT),
    in: inOp(KEY_VALUE_INPUT),
    notIn: notIn(KEY_VALUE_INPUT),
    lessThan: lessThan(KEY_VALUE_INPUT),
    lessThanOrEqualTo: lessThanOrEqualTo(KEY_VALUE_INPUT),
    greaterThan: greaterThan(KEY_VALUE_INPUT),
    greaterThanOrEqualTo: greaterThanOrEqualTo(KEY_VALUE_INPUT),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.OBJECT_WHERE_INPUT = OBJECT_WHERE_INPUT;
const DATE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'DateWhereInput',
  description: 'The DateWhereInput input type is used in operations that involve filtering objects by a field of type Date.',
  fields: {
    equalTo: equalTo(DATE),
    notEqualTo: notEqualTo(DATE),
    lessThan: lessThan(DATE),
    lessThanOrEqualTo: lessThanOrEqualTo(DATE),
    greaterThan: greaterThan(DATE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(DATE),
    in: inOp(DATE),
    notIn: notIn(DATE),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.DATE_WHERE_INPUT = DATE_WHERE_INPUT;
const BYTES_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BytesWhereInput',
  description: 'The BytesWhereInput input type is used in operations that involve filtering objects by a field of type Bytes.',
  fields: {
    equalTo: equalTo(BYTES),
    notEqualTo: notEqualTo(BYTES),
    lessThan: lessThan(BYTES),
    lessThanOrEqualTo: lessThanOrEqualTo(BYTES),
    greaterThan: greaterThan(BYTES),
    greaterThanOrEqualTo: greaterThanOrEqualTo(BYTES),
    in: inOp(BYTES),
    notIn: notIn(BYTES),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.BYTES_WHERE_INPUT = BYTES_WHERE_INPUT;
const FILE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileWhereInput',
  description: 'The FileWhereInput input type is used in operations that involve filtering objects by a field of type File.',
  fields: {
    equalTo: equalTo(FILE),
    notEqualTo: notEqualTo(FILE),
    lessThan: lessThan(FILE),
    lessThanOrEqualTo: lessThanOrEqualTo(FILE),
    greaterThan: greaterThan(FILE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(FILE),
    in: inOp(FILE),
    notIn: notIn(FILE),
    exists,
    matchesRegex,
    options,
    inQueryKey,
    notInQueryKey
  }
});
exports.FILE_WHERE_INPUT = FILE_WHERE_INPUT;
const GEO_POINT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointWhereInput',
  description: 'The GeoPointWhereInput input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    exists,
    nearSphere: {
      description: 'This is the nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT_INPUT
    },
    maxDistance: {
      description: 'This is the maxDistance operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInRadians: {
      description: 'This is the maxDistanceInRadians operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInMiles: {
      description: 'This is the maxDistanceInMiles operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in miles) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInKilometers: {
      description: 'This is the maxDistanceInKilometers operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in kilometers) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    within: {
      description: 'This is the within operator to specify a constraint to select the objects where the values of a geo point field is within a specified box.',
      type: WITHIN_INPUT
    },
    geoWithin: {
      description: 'This is the geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_INPUT
    }
  }
});
exports.GEO_POINT_WHERE_INPUT = GEO_POINT_WHERE_INPUT;
const POLYGON_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PolygonWhereInput',
  description: 'The PolygonWhereInput input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    exists,
    geoIntersects: {
      description: 'This is the geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
      type: GEO_INTERSECTS_INPUT
    }
  }
});
exports.POLYGON_WHERE_INPUT = POLYGON_WHERE_INPUT;
const ELEMENT = new _graphql.GraphQLObjectType({
  name: 'Element',
  description: "The Element object type is used to return array items' value.",
  fields: {
    value: {
      description: 'Return the value of the element in the array',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
}); // Default static union type, we update types and resolveType function later

exports.ELEMENT = ELEMENT;
let ARRAY_RESULT;
exports.ARRAY_RESULT = ARRAY_RESULT;

const loadArrayResult = (parseGraphQLSchema, parseClasses) => {
  const classTypes = parseClasses.filter(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false).map(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType);
  exports.ARRAY_RESULT = ARRAY_RESULT = new _graphql.GraphQLUnionType({
    name: 'ArrayResult',
    description: 'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className].classGraphQLOutputType;
        } else {
          return ELEMENT;
        }
      } else {
        return ELEMENT;
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};

exports.loadArrayResult = loadArrayResult;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(_links.GraphQLUpload, true);
  parseGraphQLSchema.addGraphQLType(ANY, true);
  parseGraphQLSchema.addGraphQLType(OBJECT, true);
  parseGraphQLSchema.addGraphQLType(DATE, true);
  parseGraphQLSchema.addGraphQLType(BYTES, true);
  parseGraphQLSchema.addGraphQLType(FILE, true);
  parseGraphQLSchema.addGraphQLType(FILE_INFO, true);
  parseGraphQLSchema.addGraphQLType(FILE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT, true);
  parseGraphQLSchema.addGraphQLType(PARSE_OBJECT, true);
  parseGraphQLSchema.addGraphQLType(READ_PREFERENCE, true);
  parseGraphQLSchema.addGraphQLType(READ_OPTIONS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SEARCH_INPUT, true);
  parseGraphQLSchema.addGraphQLType(TEXT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOX_INPUT, true);
  parseGraphQLSchema.addGraphQLType(WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(CENTER_SPHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_INTERSECTS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ID_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(STRING_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(NUMBER_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOOLEAN_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ARRAY_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(KEY_VALUE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(OBJECT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(DATE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BYTES_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(FILE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(POLYGON_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ELEMENT, true);
  parseGraphQLSchema.addGraphQLType(ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ACL, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL, true);
  parseGraphQLSchema.addGraphQLType(SUBQUERY_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SELECT_INPUT, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9JU09TdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiRklMRV9JTlBVVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJmaWxlIiwidXBsb2FkIiwiR3JhcGhRTFVwbG9hZCIsIkdFT19QT0lOVF9GSUVMRFMiLCJsYXRpdHVkZSIsIkdyYXBoUUxGbG9hdCIsImxvbmdpdHVkZSIsIkdFT19QT0lOVF9JTlBVVCIsIkdFT19QT0lOVCIsIlBPTFlHT05fSU5QVVQiLCJHcmFwaFFMTGlzdCIsIlBPTFlHT04iLCJVU0VSX0FDTF9JTlBVVCIsInVzZXJJZCIsIkdyYXBoUUxJRCIsInJlYWQiLCJHcmFwaFFMQm9vbGVhbiIsIndyaXRlIiwiUk9MRV9BQ0xfSU5QVVQiLCJyb2xlTmFtZSIsIlBVQkxJQ19BQ0xfSU5QVVQiLCJBQ0xfSU5QVVQiLCJ1c2VycyIsInJvbGVzIiwicHVibGljIiwiVVNFUl9BQ0wiLCJST0xFX0FDTCIsIlBVQkxJQ19BQ0wiLCJBQ0wiLCJyZXNvbHZlIiwicCIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwicnVsZSIsImluZGV4T2YiLCJwdXNoIiwidG9HbG9iYWxJZCIsImxlbmd0aCIsInJlcGxhY2UiLCJPQkpFQ1RfSUQiLCJDTEFTU19OQU1FX0FUVCIsIkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUIiwiT0JKRUNUX0lEX0FUVCIsIkNSRUFURURfQVRfQVRUIiwiVVBEQVRFRF9BVF9BVFQiLCJJTlBVVF9GSUVMRFMiLCJDUkVBVEVfUkVTVUxUX0ZJRUxEUyIsIm9iamVjdElkIiwiY3JlYXRlZEF0IiwiVVBEQVRFX1JFU1VMVF9GSUVMRFMiLCJ1cGRhdGVkQXQiLCJQQVJTRV9PQkpFQ1RfRklFTERTIiwiUEFSU0VfT0JKRUNUIiwiR3JhcGhRTEludGVyZmFjZVR5cGUiLCJTRVNTSU9OX1RPS0VOX0FUVCIsIlJFQURfUFJFRkVSRU5DRSIsIkdyYXBoUUxFbnVtVHlwZSIsIlBSSU1BUlkiLCJQUklNQVJZX1BSRUZFUlJFRCIsIlNFQ09OREFSWSIsIlNFQ09OREFSWV9QUkVGRVJSRUQiLCJORUFSRVNUIiwiUkVBRF9QUkVGRVJFTkNFX0FUVCIsIklOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJSRUFEX09QVElPTlNfSU5QVVQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJSRUFEX09QVElPTlNfQVRUIiwiV0hFUkVfQVRUIiwiU0tJUF9BVFQiLCJHcmFwaFFMSW50IiwiTElNSVRfQVRUIiwiQ09VTlRfQVRUIiwiU0VBUkNIX0lOUFVUIiwidGVybSIsImxhbmd1YWdlIiwiY2FzZVNlbnNpdGl2ZSIsImRpYWNyaXRpY1NlbnNpdGl2ZSIsIlRFWFRfSU5QVVQiLCJzZWFyY2giLCJCT1hfSU5QVVQiLCJib3R0b21MZWZ0IiwidXBwZXJSaWdodCIsIldJVEhJTl9JTlBVVCIsImJveCIsIkNFTlRFUl9TUEhFUkVfSU5QVVQiLCJjZW50ZXIiLCJkaXN0YW5jZSIsIkdFT19XSVRISU5fSU5QVVQiLCJwb2x5Z29uIiwiY2VudGVyU3BoZXJlIiwiR0VPX0lOVEVSU0VDVFNfSU5QVVQiLCJwb2ludCIsImVxdWFsVG8iLCJub3RFcXVhbFRvIiwibGVzc1RoYW4iLCJsZXNzVGhhbk9yRXF1YWxUbyIsImdyZWF0ZXJUaGFuIiwiZ3JlYXRlclRoYW5PckVxdWFsVG8iLCJpbk9wIiwibm90SW4iLCJleGlzdHMiLCJtYXRjaGVzUmVnZXgiLCJvcHRpb25zIiwiU1VCUVVFUllfSU5QVVQiLCJjbGFzc05hbWUiLCJ3aGVyZSIsImFzc2lnbiIsIlNFTEVDVF9JTlBVVCIsInF1ZXJ5Iiwia2V5IiwiaW5RdWVyeUtleSIsIm5vdEluUXVlcnlLZXkiLCJJRF9XSEVSRV9JTlBVVCIsImluIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwidGV4dCIsIk5VTUJFUl9XSEVSRV9JTlBVVCIsIkJPT0xFQU5fV0hFUkVfSU5QVVQiLCJBUlJBWV9XSEVSRV9JTlBVVCIsImNvbnRhaW5lZEJ5IiwiY29udGFpbnMiLCJLRVlfVkFMVUVfSU5QVVQiLCJPQkpFQ1RfV0hFUkVfSU5QVVQiLCJEQVRFX1dIRVJFX0lOUFVUIiwiQllURVNfV0hFUkVfSU5QVVQiLCJGSUxFX1dIRVJFX0lOUFVUIiwiR0VPX1BPSU5UX1dIRVJFX0lOUFVUIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImdlb1dpdGhpbiIsIlBPTFlHT05fV0hFUkVfSU5QVVQiLCJnZW9JbnRlcnNlY3RzIiwiRUxFTUVOVCIsIkFSUkFZX1JFU1VMVCIsImxvYWRBcnJheVJlc3VsdCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3NlcyIsImNsYXNzVHlwZXMiLCJmaWx0ZXIiLCJwYXJzZUNsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxVbmlvblR5cGUiLCJ0eXBlcyIsInJlc29sdmVUeXBlIiwiZ3JhcGhRTFR5cGVzIiwibG9hZCIsImFkZEdyYXBoUUxUeXBlIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvbG9hZGVycy9kZWZhdWx0R3JhcGhRTFR5cGVzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEtpbmQsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMU2NhbGFyVHlwZSxcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTEludGVyZmFjZVR5cGUsXG4gIEdyYXBoUUxFbnVtVHlwZSxcbiAgR3JhcGhRTEludCxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxVbmlvblR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgdG9HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgR3JhcGhRTFVwbG9hZCB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL2xpbmtzJztcblxuY2xhc3MgVHlwZVZhbGlkYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IodmFsdWUsIHR5cGUpIHtcbiAgICBzdXBlcihgJHt2YWx1ZX0gaXMgbm90IGEgdmFsaWQgJHt0eXBlfWApO1xuICB9XG59XG5cbmNvbnN0IHBhcnNlU3RyaW5nVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdTdHJpbmcnKTtcbn07XG5cbmNvbnN0IHBhcnNlSW50VmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgaW50ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoTnVtYmVyLmlzSW50ZWdlcihpbnQpKSB7XG4gICAgICByZXR1cm4gaW50O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnSW50Jyk7XG59O1xuXG5jb25zdCBwYXJzZUZsb2F0VmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZmxvYXQgPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZmxvYXQpKSB7XG4gICAgICByZXR1cm4gZmxvYXQ7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGbG9hdCcpO1xufTtcblxuY29uc3QgcGFyc2VCb29sZWFuVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQm9vbGVhbicpO1xufTtcblxuY29uc3QgcGFyc2VWYWx1ZSA9IHZhbHVlID0+IHtcbiAgc3dpdGNoICh2YWx1ZS5raW5kKSB7XG4gICAgY2FzZSBLaW5kLlNUUklORzpcbiAgICAgIHJldHVybiBwYXJzZVN0cmluZ1ZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5JTlQ6XG4gICAgICByZXR1cm4gcGFyc2VJbnRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuRkxPQVQ6XG4gICAgICByZXR1cm4gcGFyc2VGbG9hdFZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5CT09MRUFOOlxuICAgICAgcmV0dXJuIHBhcnNlQm9vbGVhblZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5MSVNUOlxuICAgICAgcmV0dXJuIHBhcnNlTGlzdFZhbHVlcyh2YWx1ZS52YWx1ZXMpO1xuXG4gICAgY2FzZSBLaW5kLk9CSkVDVDpcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdEZpZWxkcyh2YWx1ZS5maWVsZHMpO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB2YWx1ZS52YWx1ZTtcbiAgfVxufTtcblxuY29uc3QgcGFyc2VMaXN0VmFsdWVzID0gdmFsdWVzID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgIHJldHVybiB2YWx1ZXMubWFwKHZhbHVlID0+IHBhcnNlVmFsdWUodmFsdWUpKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlcywgJ0xpc3QnKTtcbn07XG5cbmNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0gZmllbGRzID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRzKSkge1xuICAgIHJldHVybiBmaWVsZHMucmVkdWNlKFxuICAgICAgKG9iamVjdCwgZmllbGQpID0+ICh7XG4gICAgICAgIC4uLm9iamVjdCxcbiAgICAgICAgW2ZpZWxkLm5hbWUudmFsdWVdOiBwYXJzZVZhbHVlKGZpZWxkLnZhbHVlKSxcbiAgICAgIH0pLFxuICAgICAge31cbiAgICApO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoZmllbGRzLCAnT2JqZWN0Jyk7XG59O1xuXG5jb25zdCBBTlkgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnQW55JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBBbnkgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgYW55IHR5cGUgb2YgdmFsdWUuJyxcbiAgcGFyc2VWYWx1ZTogdmFsdWUgPT4gdmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4gdmFsdWUsXG4gIHBhcnNlTGl0ZXJhbDogYXN0ID0+IHBhcnNlVmFsdWUoYXN0KSxcbn0pO1xuXG5jb25zdCBPQkpFQ1QgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgT2JqZWN0IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIG9iamVjdHMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKGFzdC5maWVsZHMpO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnT2JqZWN0Jyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VEYXRlSXNvVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZGF0ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBzZXJpYWxpemVEYXRlSXNvID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvSVNPU3RyaW5nKCk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb0xpdGVyYWwgPSBhc3QgPT4ge1xuICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgcmV0dXJuIHBhcnNlRGF0ZUlzb1ZhbHVlKGFzdC52YWx1ZSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IERBVEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRGF0ZScsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIERhdGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZGF0ZXMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvVmFsdWUodmFsdWUpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnRGF0ZScgJiYgdmFsdWUuaXNvKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6IHZhbHVlLl9fdHlwZSxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZS5pc28pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmIHZhbHVlLmlzbykge1xuICAgICAgcmV0dXJuIHNlcmlhbGl6ZURhdGVJc28odmFsdWUuaXNvKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb0xpdGVyYWwoYXN0KSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBpc28gPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2lzbycpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgX190eXBlLnZhbHVlLnZhbHVlID09PSAnRGF0ZScgJiYgaXNvKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGlzby52YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdEYXRlJyk7XG4gIH0sXG59KTtcblxuY29uc3QgQllURVMgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnQnl0ZXMnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGJhc2UgNjQgYmluYXJ5IGRhdGEuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogdmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5iYXNlNjQgPT09ICdzdHJpbmcnXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCeXRlcycpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5iYXNlNjQgPT09ICdzdHJpbmcnXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWUuYmFzZTY0O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgICAgYmFzZTY0OiBhc3QudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgYmFzZTY0ID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdiYXNlNjQnKTtcbiAgICAgIGlmIChcbiAgICAgICAgX190eXBlICYmXG4gICAgICAgIF9fdHlwZS52YWx1ZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdCeXRlcycgJiZcbiAgICAgICAgYmFzZTY0ICYmXG4gICAgICAgIGJhc2U2NC52YWx1ZSAmJlxuICAgICAgICB0eXBlb2YgYmFzZTY0LnZhbHVlLnZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgYmFzZTY0OiBiYXNlNjQudmFsdWUudmFsdWUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdCeXRlcycpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRmlsZVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgIG5hbWU6IHZhbHVlLFxuICAgIH07XG4gIH0gZWxzZSBpZiAoXG4gICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgKHZhbHVlLnVybCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2YWx1ZS51cmwgPT09ICdzdHJpbmcnKVxuICApIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ZpbGUnKTtcbn07XG5cbmNvbnN0IEZJTEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRmlsZScsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEZpbGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZmlsZXMuJyxcbiAgcGFyc2VWYWx1ZTogcGFyc2VGaWxlVmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKGFzdC52YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBuYW1lID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICduYW1lJyk7XG4gICAgICBjb25zdCB1cmwgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ3VybCcpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgbmFtZSAmJiBuYW1lLnZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZSh7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgbmFtZTogbmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB1cmw6IHVybCAmJiB1cmwudmFsdWUgPyB1cmwudmFsdWUudmFsdWUgOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRmlsZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5GTyA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5mbycsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEZpbGVJbmZvIG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIHRoZSBpbmZvcm1hdGlvbiBhYm91dCBmaWxlcy4nLFxuICBmaWVsZHM6IHtcbiAgICBuYW1lOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZpbGUgbmFtZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgdXJsOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVybCBpbiB3aGljaCB0aGUgZmlsZSBjYW4gYmUgZG93bmxvYWRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdJZiB0aGlzIGZpZWxkIGlzIHNldCB0byBudWxsIHRoZSBmaWxlIHdpbGwgYmUgdW5saW5rZWQgKHRoZSBmaWxlIHdpbGwgbm90IGJlIGRlbGV0ZWQgb24gY2xvdWQgc3RvcmFnZSkuJyxcbiAgZmllbGRzOiB7XG4gICAgZmlsZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBIEZpbGUgU2NhbGFyIGNhbiBiZSBhbiB1cmwgb3IgYSBGaWxlSW5mbyBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEZJTEUsXG4gICAgfSxcbiAgICB1cGxvYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlIHRoaXMgZmllbGQgaWYgeW91IHdhbnQgdG8gY3JlYXRlIGEgbmV3IGZpbGUuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxVcGxvYWQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfRklFTERTID0ge1xuICBsYXRpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGF0aXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbiAgbG9uZ2l0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsb25naXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbn07XG5cbmNvbnN0IEdFT19QT0lOVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50SW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBmaWVsZHMgb2YgdHlwZSBnZW8gcG9pbnQuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEdlb1BvaW50IG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIHRoZSBpbmZvcm1hdGlvbiBhYm91dCBnZW8gcG9pbnQgZmllbGRzLicsXG4gIGZpZWxkczogR0VPX1BPSU5UX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBQT0xZR09OX0lOUFVUID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpKTtcblxuY29uc3QgUE9MWUdPTiA9IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UKSk7XG5cbmNvbnN0IFVTRVJfQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVXNlckFDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgdXNlcnMgaW4gQUNMLicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJJZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgdGFyZ2V0dGVkIFVzZXIuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJPTEVfQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUm9sZUFDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2Ugcm9sZXMgaW4gQUNMLicsXG4gIGZpZWxkczoge1xuICAgIHJvbGVOYW1lOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIHRhcmdldHRlZCBSb2xlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQVUJMSUNfQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUHVibGljQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSBwdWJsaWMgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEFDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FDTElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0FsbG93IHRvIG1hbmFnZSBhY2Nlc3MgcmlnaHRzLiBJZiBub3QgcHJvdmlkZWQgb2JqZWN0IHdpbGwgYmUgcHVibGljbHkgcmVhZGFibGUgYW5kIHdyaXRhYmxlJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3IgdXNlcnMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoVVNFUl9BQ0xfSU5QVVQpKSxcbiAgICB9LFxuICAgIHJvbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHJvbGVzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFJPTEVfQUNMX0lOUFVUKSksXG4gICAgfSxcbiAgICBwdWJsaWM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBjb250cm9sIGxpc3QuJyxcbiAgICAgIHR5cGU6IFBVQkxJQ19BQ0xfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBVU0VSX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdVc2VyQUNMJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0FsbG93IHRvIG1hbmFnZSB1c2VycyBpbiBBQ0wuIElmIHJlYWQgYW5kIHdyaXRlIGFyZSBudWxsIHRoZSB1c2VycyBoYXZlIHJlYWQgYW5kIHdyaXRlIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2VySWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIHRhcmdldHRlZCBVc2VyLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBST0xFX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSb2xlQUNMJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0FsbG93IHRvIG1hbmFnZSByb2xlcyBpbiBBQ0wuIElmIHJlYWQgYW5kIHdyaXRlIGFyZSBudWxsIHRoZSByb2xlIGhhdmUgcmVhZCBhbmQgd3JpdGUgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJvbGVOYW1lOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIHRhcmdldHRlZCBSb2xlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBVQkxJQ19BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUHVibGljQUNMJyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgcHVibGljIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEFDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBQ0wnLFxuICBkZXNjcmlwdGlvbjogJ0N1cnJlbnQgYWNjZXNzIGNvbnRyb2wgbGlzdCBvZiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3IgdXNlcnMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoVVNFUl9BQ0wpKSxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICBjb25zdCB1c2VycyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhwKS5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICAgIGlmIChydWxlICE9PSAnKicgJiYgcnVsZS5pbmRleE9mKCdyb2xlOicpICE9PSAwKSB7XG4gICAgICAgICAgICB1c2Vycy5wdXNoKHtcbiAgICAgICAgICAgICAgdXNlcklkOiB0b0dsb2JhbElkKCdfVXNlcicsIHJ1bGUpLFxuICAgICAgICAgICAgICByZWFkOiBwW3J1bGVdLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwW3J1bGVdLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHVzZXJzLmxlbmd0aCA/IHVzZXJzIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgICByb2xlczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciByb2xlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChST0xFX0FDTCkpLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIGNvbnN0IHJvbGVzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHApLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgICAgaWYgKHJ1bGUuaW5kZXhPZigncm9sZTonKSA9PT0gMCkge1xuICAgICAgICAgICAgcm9sZXMucHVzaCh7XG4gICAgICAgICAgICAgIHJvbGVOYW1lOiBydWxlLnJlcGxhY2UoJ3JvbGU6JywgJycpLFxuICAgICAgICAgICAgICByZWFkOiBwW3J1bGVdLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwW3J1bGVdLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJvbGVzLmxlbmd0aCA/IHJvbGVzIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwdWJsaWM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBjb250cm9sIGxpc3QuJyxcbiAgICAgIHR5cGU6IFBVQkxJQ19BQ0wsXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgKi9cbiAgICAgICAgcmV0dXJuIHBbJyonXVxuICAgICAgICAgID8ge1xuICAgICAgICAgICAgICByZWFkOiBwWycqJ10ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbJyonXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX0lEID0gbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCk7XG5cbmNvbnN0IENMQVNTX05BTUVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNsYXNzIG5hbWUgb2YgdGhlIG9iamVjdC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3QgaWQuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuJyxcbiAgdHlwZTogT0JKRUNUX0lELFxufTtcblxuY29uc3QgT0JKRUNUX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3QgaWQuJyxcbiAgdHlwZTogT0JKRUNUX0lELFxufTtcblxuY29uc3QgQ1JFQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBjcmVhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IFVQREFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgbGFzIHVwZGF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgSU5QVVRfRklFTERTID0ge1xuICBBQ0w6IHtcbiAgICB0eXBlOiBBQ0wsXG4gIH0sXG59O1xuXG5jb25zdCBDUkVBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgb2JqZWN0SWQ6IE9CSkVDVF9JRF9BVFQsXG4gIGNyZWF0ZWRBdDogQ1JFQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBVUERBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgdXBkYXRlZEF0OiBVUERBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFBBUlNFX09CSkVDVF9GSUVMRFMgPSB7XG4gIC4uLkNSRUFURV9SRVNVTFRfRklFTERTLFxuICAuLi5VUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uSU5QVVRfRklFTERTLFxuICBBQ0w6IHtcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQUNMKSxcbiAgICByZXNvbHZlOiAoeyBBQ0wgfSkgPT4gKEFDTCA/IEFDTCA6IHsgJyonOiB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH0gfSksXG4gIH0sXG59O1xuXG5jb25zdCBQQVJTRV9PQkpFQ1QgPSBuZXcgR3JhcGhRTEludGVyZmFjZVR5cGUoe1xuICBuYW1lOiAnUGFyc2VPYmplY3QnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBhcnNlT2JqZWN0IGludGVyZmFjZSB0eXBlIGlzIHVzZWQgYXMgYSBiYXNlIHR5cGUgZm9yIHRoZSBhdXRvIGdlbmVyYXRlZCBvYmplY3QgdHlwZXMuJyxcbiAgZmllbGRzOiBQQVJTRV9PQkpFQ1RfRklFTERTLFxufSk7XG5cbmNvbnN0IFNFU1NJT05fVE9LRU5fQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSBjdXJyZW50IHVzZXIgc2Vzc2lvbiB0b2tlbi4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0UgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgbmFtZTogJ1JlYWRQcmVmZXJlbmNlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkUHJlZmVyZW5jZSBlbnVtIHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNlbGVjdCBpbiB3aGljaCBkYXRhYmFzZSByZXBsaWNhIHRoZSBvcGVyYXRpb24gbXVzdCBydW4uJyxcbiAgdmFsdWVzOiB7XG4gICAgUFJJTUFSWTogeyB2YWx1ZTogJ1BSSU1BUlknIH0sXG4gICAgUFJJTUFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdQUklNQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBTRUNPTkRBUlk6IHsgdmFsdWU6ICdTRUNPTkRBUlknIH0sXG4gICAgU0VDT05EQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1NFQ09OREFSWV9QUkVGRVJSRUQnIH0sXG4gICAgTkVBUkVTVDogeyB2YWx1ZTogJ05FQVJFU1QnIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgbWFpbiBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHF1ZXJpZXMgdG8gYmUgZXhlY3V0ZWQgdG8gaW5jbHVkZSBmaWVsZHMuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgc3VicXVlcmllcyB0aGF0IG1heSBiZSByZXF1aXJlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBSRUFEX09QVElPTlNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSZWFkT3B0aW9uc0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkT3B0aW9uc0lucHV0dCB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZXQgdGhlIHJlYWQgcHJlZmVyZW5jZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZFByZWZlcmVuY2U6IFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlOiBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZTogU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX09QVElPTlNfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIG9wdGlvbnMgZm9yIHRoZSBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX09QVElPTlNfSU5QVVQsXG59O1xuXG5jb25zdCBXSEVSRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZCcsXG4gIHR5cGU6IE9CSkVDVCxcbn07XG5cbmNvbnN0IFNLSVBfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG51bWJlciBvZiBvYmplY3RzIHRoYXQgbXVzdCBiZSBza2lwcGVkIHRvIHJldHVybi4nLFxuICB0eXBlOiBHcmFwaFFMSW50LFxufTtcblxuY29uc3QgTElNSVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxpbWl0IG51bWJlciBvZiBvYmplY3RzIHRoYXQgbXVzdCBiZSByZXR1cm5lZC4nLFxuICB0eXBlOiBHcmFwaFFMSW50LFxufTtcblxuY29uc3QgQ09VTlRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgdG90YWwgbWF0Y2hlZCBvYmplY3MgY291bnQgdGhhdCBpcyByZXR1cm5lZCB3aGVuIHRoZSBjb3VudCBmbGFnIGlzIHNldC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEludCksXG59O1xuXG5jb25zdCBTRUFSQ0hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWFyY2hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFNlYXJjaElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIHNlYXJjaCBvcGVyYXRpb24gb24gYSBmdWxsIHRleHQgc2VhcmNoLicsXG4gIGZpZWxkczoge1xuICAgIHRlcm06IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdGVybSB0byBiZSBzZWFyY2hlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgbGFuZ3VhZ2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbGFuZ3VhZ2UgdG8gdGV0ZXJtaW5lIHRoZSBsaXN0IG9mIHN0b3Agd29yZHMgYW5kIHRoZSBydWxlcyBmb3IgdG9rZW5pemVyLicsXG4gICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgY2FzZVNlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGNhc2Ugc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICBkaWFjcml0aWNTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBkaWFjcml0aWMgc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBURVhUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVGV4dElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgVGV4dElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgdGV4dCBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHNlYXJjaDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzZWFyY2ggdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChTRUFSQ0hfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQk9YX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQm94SW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBCb3hJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBib3ggb3BlcmF0aW9uIG9uIGEgd2l0aGluIGdlbyBxdWVyeS4nLFxuICBmaWVsZHM6IHtcbiAgICBib3R0b21MZWZ0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGJvdHRvbSBsZWZ0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gICAgdXBwZXJSaWdodDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cHBlciByaWdodCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFdJVEhJTl9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1dpdGhpbklucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB3aXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBib3g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm94IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEJPWF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBDRU5URVJfU1BIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQ2VudGVyU3BoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENlbnRlclNwaGVyZUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIGNlbnRlclNwaGVyZSBvcGVyYXRpb24gb24gYSBnZW9XaXRoaW4gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgY2VudGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNlbnRlciBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIGRpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHJhZGl1cyBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19XSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9XaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEdlb1dpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgZ2VvV2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcG9seWdvbjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwb2x5Z29uIHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogUE9MWUdPTl9JTlBVVCxcbiAgICB9LFxuICAgIGNlbnRlclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzcGhlcmUgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBDRU5URVJfU1BIRVJFX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX0lOVEVSU0VDVFNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9JbnRlcnNlY3RzSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb0ludGVyc2VjdHNJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIGdlb0ludGVyc2VjdHMgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBwb2ludDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwb2ludCB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IGVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBlcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBub3RFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90RXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgbGVzc1RoYW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBsZXNzVGhhbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgbGVzc1RoYW5PckVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBsZXNzVGhhbk9yRXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgZ3JlYXRlclRoYW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBncmVhdGVyVGhhbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgZ3JlYXRlclRoYW5PckVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBncmVhdGVyVGhhbk9yRXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgaW5PcCA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IG5vdEluID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90SW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCBhbnkgdmFsdWUgaW4gdGhlIHNwZWNpZmllZCBhcnJheS4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG59KTtcblxuY29uc3QgZXhpc3RzID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZXhpc3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGV4aXN0cyAob3IgZG8gbm90IGV4aXN0KS4nLFxuICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbn07XG5cbmNvbnN0IG1hdGNoZXNSZWdleCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG1hdGNoZXNSZWdleCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgbWF0Y2hlcyBhIHNwZWNpZmllZCByZWd1bGFyIGV4cHJlc3Npb24uJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IG9wdGlvbnMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBvcHRpb25zIG9wZXJhdG9yIHRvIHNwZWNpZnkgb3B0aW9uYWwgZmxhZ3MgKHN1Y2ggYXMgXCJpXCIgYW5kIFwibVwiKSB0byBiZSBhZGRlZCB0byBhIG1hdGNoZXNSZWdleCBvcGVyYXRpb24gaW4gdGhlIHNhbWUgc2V0IG9mIGNvbnN0cmFpbnRzLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N1YnF1ZXJ5SW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBTdWJxdWVyeUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgc3ViIHF1ZXJ5IHRvIGFub3RoZXIgY2xhc3MuJyxcbiAgZmllbGRzOiB7XG4gICAgY2xhc3NOYW1lOiBDTEFTU19OQU1FX0FUVCxcbiAgICB3aGVyZTogT2JqZWN0LmFzc2lnbih7fSwgV0hFUkVfQVRULCB7XG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoV0hFUkVfQVRULnR5cGUpLFxuICAgIH0pLFxuICB9LFxufSk7XG5cbmNvbnN0IFNFTEVDVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1NlbGVjdElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTZWxlY3RJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhbiBpblF1ZXJ5S2V5IG9yIGEgbm90SW5RdWVyeUtleSBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHF1ZXJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHN1YnF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU1VCUVVFUllfSU5QVVQpLFxuICAgIH0sXG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGtleSBpbiB0aGUgcmVzdWx0IG9mIHRoZSBzdWJxdWVyeSB0aGF0IG11c3QgbWF0Y2ggKG5vdCBtYXRjaCkgdGhlIGZpZWxkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBpblF1ZXJ5S2V5ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgaW5RdWVyeUtleSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBlcXVhbHMgdG8gYSBrZXkgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICB0eXBlOiBTRUxFQ1RfSU5QVVQsXG59O1xuXG5jb25zdCBub3RJblF1ZXJ5S2V5ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90SW5RdWVyeUtleSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYSBrZXkgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICB0eXBlOiBTRUxFQ1RfSU5QVVQsXG59O1xuXG5jb25zdCBJRF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0lkV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgSWRXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhbiBpZC4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMSUQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihHcmFwaFFMSUQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxJRCksXG4gICAgbm90SW46IG5vdEluKEdyYXBoUUxJRCksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTVFJJTkdfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdHJpbmdXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTdHJpbmdXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgU3RyaW5nLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTFN0cmluZyksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihHcmFwaFFMU3RyaW5nKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgaW46IGluT3AoR3JhcGhRTFN0cmluZyksXG4gICAgbm90SW46IG5vdEluKEdyYXBoUUxTdHJpbmcpLFxuICAgIGV4aXN0cyxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICB0ZXh0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlICR0ZXh0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBmdWxsIHRleHQgc2VhcmNoIGNvbnN0cmFpbnQuJyxcbiAgICAgIHR5cGU6IFRFWFRfSU5QVVQsXG4gICAgfSxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgTlVNQkVSX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnTnVtYmVyV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgTnVtYmVyV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIE51bWJlci4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMRmxvYXQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihHcmFwaFFMRmxvYXQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxGbG9hdCksXG4gICAgbm90SW46IG5vdEluKEdyYXBoUUxGbG9hdCksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT09MRUFOX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQm9vbGVhbldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJvb2xlYW5XaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQm9vbGVhbi4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxCb29sZWFuKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxCb29sZWFuKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEFSUkFZX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQXJyYXlXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBBcnJheVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBBcnJheS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEFOWSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhBTlkpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihBTlkpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhBTlkpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihBTlkpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhBTlkpLFxuICAgIGluOiBpbk9wKEFOWSksXG4gICAgbm90SW46IG5vdEluKEFOWSksXG4gICAgZXhpc3RzLFxuICAgIGNvbnRhaW5lZEJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGNvbnRhaW5lZEJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGlzIGNvbnRhaW5lZCBieSBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgICBjb250YWluczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWlucyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBjb250YWluIGFsbCBlbGVtZW50cyBvZiBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgS0VZX1ZBTFVFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnS2V5VmFsdWVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQW4gZW50cnkgZnJvbSBhbiBvYmplY3QsIGkuZS4sIGEgcGFpciBvZiBrZXkgYW5kIHZhbHVlLicsXG4gIGZpZWxkczoge1xuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUga2V5IHVzZWQgdG8gcmV0cmlldmUgdGhlIHZhbHVlIG9mIHRoaXMgZW50cnkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHZhbHVlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSB2YWx1ZSBvZiB0aGUgZW50cnkuIENvdWxkIGJlIGFueSB0eXBlIG9mIHNjYWxhciBkYXRhLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQU5ZKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE9CSkVDVF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ09iamVjdFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE9iamVjdFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyByZXN1bHQgYnkgYSBmaWVsZCBvZiB0eXBlIE9iamVjdC4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGluOiBpbk9wKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbm90SW46IG5vdEluKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBEQVRFX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRGF0ZVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIERhdGVXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRGF0ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKERBVEUpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oREFURSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKERBVEUpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhEQVRFKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oREFURSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKERBVEUpLFxuICAgIGluOiBpbk9wKERBVEUpLFxuICAgIG5vdEluOiBub3RJbihEQVRFKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQnl0ZXNXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlc1doZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCeXRlcy4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEJZVEVTKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEJZVEVTKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oQllURVMpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhCWVRFUyksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEJZVEVTKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oQllURVMpLFxuICAgIGluOiBpbk9wKEJZVEVTKSxcbiAgICBub3RJbjogbm90SW4oQllURVMpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGaWxlV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEZpbGUuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhGSUxFKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEZJTEUpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihGSUxFKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oRklMRSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEZJTEUpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhGSUxFKSxcbiAgICBpbjogaW5PcChGSUxFKSxcbiAgICBub3RJbjogbm90SW4oRklMRSksXG4gICAgZXhpc3RzLFxuICAgIG1hdGNoZXNSZWdleCxcbiAgICBvcHRpb25zLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEdlb1BvaW50LicsXG4gIGZpZWxkczoge1xuICAgIGV4aXN0cyxcbiAgICBuZWFyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG5lYXJTcGhlcmUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgbmVhciB0byBhbm90aGVyIGdlbyBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5UX0lOUFVULFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2Ugb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluUmFkaWFuczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluUmFkaWFucyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5NaWxlczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluTWlsZXMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIG1pbGVzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJbktpbG9tZXRlcnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIGtpbG9tZXRlcnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICB3aXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgd2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBib3guJyxcbiAgICAgIHR5cGU6IFdJVEhJTl9JTlBVVCxcbiAgICB9LFxuICAgIGdlb1dpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBnZW9XaXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIHBvbHlnb24gb3Igc3BoZXJlLicsXG4gICAgICB0eXBlOiBHRU9fV0lUSElOX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUE9MWUdPTl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1BvbHlnb25XaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBQb2x5Z29uV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFBvbHlnb24uJyxcbiAgZmllbGRzOiB7XG4gICAgZXhpc3RzLFxuICAgIGdlb0ludGVyc2VjdHM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZ2VvSW50ZXJzZWN0cyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIHBvbHlnb24gZmllbGQgaW50ZXJzZWN0IGEgc3BlY2lmaWVkIHBvaW50LicsXG4gICAgICB0eXBlOiBHRU9fSU5URVJTRUNUU19JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEVMRU1FTlQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRWxlbWVudCcsXG4gIGRlc2NyaXB0aW9uOiBcIlRoZSBFbGVtZW50IG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIGFycmF5IGl0ZW1zJyB2YWx1ZS5cIixcbiAgZmllbGRzOiB7XG4gICAgdmFsdWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmV0dXJuIHRoZSB2YWx1ZSBvZiB0aGUgZWxlbWVudCBpbiB0aGUgYXJyYXknLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG4vLyBEZWZhdWx0IHN0YXRpYyB1bmlvbiB0eXBlLCB3ZSB1cGRhdGUgdHlwZXMgYW5kIHJlc29sdmVUeXBlIGZ1bmN0aW9uIGxhdGVyXG5sZXQgQVJSQVlfUkVTVUxUO1xuXG5jb25zdCBsb2FkQXJyYXlSZXN1bHQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzZXMpID0+IHtcbiAgY29uc3QgY2xhc3NUeXBlcyA9IHBhcnNlQ2xhc3Nlc1xuICAgIC5maWx0ZXIocGFyc2VDbGFzcyA9PlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1twYXJzZUNsYXNzLmNsYXNzTmFtZV0uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA/IHRydWUgOiBmYWxzZVxuICAgIClcbiAgICAubWFwKFxuICAgICAgcGFyc2VDbGFzcyA9PiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgKTtcbiAgQVJSQVlfUkVTVUxUID0gbmV3IEdyYXBoUUxVbmlvblR5cGUoe1xuICAgIG5hbWU6ICdBcnJheVJlc3VsdCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzJyxcbiAgICB0eXBlczogKCkgPT4gW0VMRU1FTlQsIC4uLmNsYXNzVHlwZXNdLFxuICAgIHJlc29sdmVUeXBlOiB2YWx1ZSA9PiB7XG4gICAgICBpZiAodmFsdWUuX190eXBlID09PSAnT2JqZWN0JyAmJiB2YWx1ZS5jbGFzc05hbWUgJiYgdmFsdWUub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXSkge1xuICAgICAgICAgIHJldHVybiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3ZhbHVlLmNsYXNzTmFtZV0uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gRUxFTUVOVDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIEVMRU1FTlQ7XG4gICAgICB9XG4gICAgfSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChBUlJBWV9SRVNVTFQpO1xufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHcmFwaFFMVXBsb2FkLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFOWSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFUywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5GTywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fUE9JTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUEFSU0VfT0JKRUNULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfUFJFRkVSRU5DRSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShSRUFEX09QVElPTlNfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU0VBUkNIX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFRFWFRfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQk9YX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFdJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShDRU5URVJfU1BIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19XSVRISU5fSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX0lOVEVSU0VDVFNfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoSURfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU1RSSU5HX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE5VTUJFUl9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT09MRUFOX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFSUkFZX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEtFWV9WQUxVRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1RfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURV9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFU19XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQT0xZR09OX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEVMRU1FTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFVTRVJfQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJPTEVfQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBVQkxJQ19BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFVTRVJfQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJPTEVfQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBVQkxJQ19BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU1VCUVVFUllfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU0VMRUNUX0lOUFVULCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7XG4gIFR5cGVWYWxpZGF0aW9uRXJyb3IsXG4gIHBhcnNlU3RyaW5nVmFsdWUsXG4gIHBhcnNlSW50VmFsdWUsXG4gIHBhcnNlRmxvYXRWYWx1ZSxcbiAgcGFyc2VCb29sZWFuVmFsdWUsXG4gIHBhcnNlVmFsdWUsXG4gIHBhcnNlTGlzdFZhbHVlcyxcbiAgcGFyc2VPYmplY3RGaWVsZHMsXG4gIEFOWSxcbiAgT0JKRUNULFxuICBwYXJzZURhdGVJc29WYWx1ZSxcbiAgc2VyaWFsaXplRGF0ZUlzbyxcbiAgREFURSxcbiAgQllURVMsXG4gIHBhcnNlRmlsZVZhbHVlLFxuICBTVUJRVUVSWV9JTlBVVCxcbiAgU0VMRUNUX0lOUFVULFxuICBGSUxFLFxuICBGSUxFX0lORk8sXG4gIEZJTEVfSU5QVVQsXG4gIEdFT19QT0lOVF9GSUVMRFMsXG4gIEdFT19QT0lOVF9JTlBVVCxcbiAgR0VPX1BPSU5ULFxuICBQT0xZR09OX0lOUFVULFxuICBQT0xZR09OLFxuICBPQkpFQ1RfSUQsXG4gIENMQVNTX05BTUVfQVRULFxuICBHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgT0JKRUNUX0lEX0FUVCxcbiAgVVBEQVRFRF9BVF9BVFQsXG4gIENSRUFURURfQVRfQVRULFxuICBJTlBVVF9GSUVMRFMsXG4gIENSRUFURV9SRVNVTFRfRklFTERTLFxuICBVUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbiAgUEFSU0VfT0JKRUNULFxuICBTRVNTSU9OX1RPS0VOX0FUVCxcbiAgUkVBRF9QUkVGRVJFTkNFLFxuICBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFJFQURfT1BUSU9OU19JTlBVVCxcbiAgUkVBRF9PUFRJT05TX0FUVCxcbiAgV0hFUkVfQVRULFxuICBTS0lQX0FUVCxcbiAgTElNSVRfQVRULFxuICBDT1VOVF9BVFQsXG4gIFNFQVJDSF9JTlBVVCxcbiAgVEVYVF9JTlBVVCxcbiAgQk9YX0lOUFVULFxuICBXSVRISU5fSU5QVVQsXG4gIENFTlRFUl9TUEhFUkVfSU5QVVQsXG4gIEdFT19XSVRISU5fSU5QVVQsXG4gIEdFT19JTlRFUlNFQ1RTX0lOUFVULFxuICBlcXVhbFRvLFxuICBub3RFcXVhbFRvLFxuICBsZXNzVGhhbixcbiAgbGVzc1RoYW5PckVxdWFsVG8sXG4gIGdyZWF0ZXJUaGFuLFxuICBncmVhdGVyVGhhbk9yRXF1YWxUbyxcbiAgaW5PcCxcbiAgbm90SW4sXG4gIGV4aXN0cyxcbiAgbWF0Y2hlc1JlZ2V4LFxuICBvcHRpb25zLFxuICBpblF1ZXJ5S2V5LFxuICBub3RJblF1ZXJ5S2V5LFxuICBJRF9XSEVSRV9JTlBVVCxcbiAgU1RSSU5HX1dIRVJFX0lOUFVULFxuICBOVU1CRVJfV0hFUkVfSU5QVVQsXG4gIEJPT0xFQU5fV0hFUkVfSU5QVVQsXG4gIEFSUkFZX1dIRVJFX0lOUFVULFxuICBLRVlfVkFMVUVfSU5QVVQsXG4gIE9CSkVDVF9XSEVSRV9JTlBVVCxcbiAgREFURV9XSEVSRV9JTlBVVCxcbiAgQllURVNfV0hFUkVfSU5QVVQsXG4gIEZJTEVfV0hFUkVfSU5QVVQsXG4gIEdFT19QT0lOVF9XSEVSRV9JTlBVVCxcbiAgUE9MWUdPTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfUkVTVUxULFxuICBFTEVNRU5ULFxuICBBQ0xfSU5QVVQsXG4gIFVTRVJfQUNMX0lOUFVULFxuICBST0xFX0FDTF9JTlBVVCxcbiAgUFVCTElDX0FDTF9JTlBVVCxcbiAgQUNMLFxuICBVU0VSX0FDTCxcbiAgUk9MRV9BQ0wsXG4gIFBVQkxJQ19BQ0wsXG4gIGxvYWQsXG4gIGxvYWRBcnJheVJlc3VsdCxcbn07XG4i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