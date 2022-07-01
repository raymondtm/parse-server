"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var _Utils = _interopRequireDefault(require("../Utils"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));

var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and


  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and


  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
} // Transforms a REST API formatted ACL object to our two-field mongo format.


const transformObjectACL = _ref => {
  let {
    ACL
  } = _ref,
      result = _objectWithoutProperties(_ref, ["ACL"]);

  if (!ACL) {
    return result;
  }

  result._wperm = [];
  result._rperm = [];

  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }

    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }

  return result;
};

const specialQuerykeys = ['$and', '$or', '$nor', '_rperm', '_wperm', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count'];

const isSpecialQueryKey = key => {
  return specialQuerykeys.indexOf(key) >= 0;
};

const validateQuery = query => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(validateQuery);
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }

  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }

    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, auth, operation, schema, className, protectedFields, object) => {
  let userId = null;
  if (auth && auth.user) userId = auth.user.id; // replace protectedFields when using pointer-permissions

  const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : {};

  if (perms) {
    const isReadOperation = ['get', 'find'].indexOf(operation) > -1;

    if (isReadOperation && perms.protectedFields) {
      // extract protectedFields added with the pointer-permission prefix
      const protectedFieldsPointerPerm = Object.keys(perms.protectedFields).filter(key => key.startsWith('userField:')).map(key => {
        return {
          key: key.substring(10),
          value: perms.protectedFields[key]
        };
      });
      const newProtectedFields = [];
      let overrideProtectedFields = false; // check if the object grants the current user access based on the extracted fields

      protectedFieldsPointerPerm.forEach(pointerPerm => {
        let pointerPermIncludesUser = false;
        const readUserFieldValue = object[pointerPerm.key];

        if (readUserFieldValue) {
          if (Array.isArray(readUserFieldValue)) {
            pointerPermIncludesUser = readUserFieldValue.some(user => user.objectId && user.objectId === userId);
          } else {
            pointerPermIncludesUser = readUserFieldValue.objectId && readUserFieldValue.objectId === userId;
          }
        }

        if (pointerPermIncludesUser) {
          overrideProtectedFields = true;
          newProtectedFields.push(pointerPerm.value);
        }
      }); // if at least one pointer-permission affected the current user
      // intersect vs protectedFields from previous stage (@see addProtectedFields)
      // Sets theory (intersections): A x (B x C) == (A x B) x C

      if (overrideProtectedFields && protectedFields) {
        newProtectedFields.push(protectedFields);
      } // intersect all sets of protectedFields


      newProtectedFields.forEach(fields => {
        if (fields) {
          // if there're no protctedFields by other criteria ( id / role / auth)
          // then we must intersect each set (per userField)
          if (!protectedFields) {
            protectedFields = fields;
          } else {
            protectedFields = protectedFields.filter(v => fields.includes(v));
          }
        }
      });
    }
  }

  const isUserClass = className === '_User';
  /* special treat for the user class: don't filter protectedFields if currently loggedin user is
  the retrieved user */

  if (!(isUserClass && userId && object.objectId === userId)) {
    protectedFields && protectedFields.forEach(k => delete object[k]); // fields not requested by client (excluded),
    //but were needed to apply protecttedFields

    perms.protectedFields && perms.protectedFields.temporaryKeys && perms.protectedFields.temporaryKeys.forEach(k => delete object[k]);
  }

  if (!isUserClass) {
    return object;
  }

  object.password = object._hashed_password;
  delete object._hashed_password;
  delete object.sessionToken;

  if (isMaster) {
    return object;
  }

  delete object._email_verify_token;
  delete object._perishable_token;
  delete object._perishable_token_expires_at;
  delete object._tombstone;
  delete object._email_verify_token_expires_at;
  delete object._failed_login_count;
  delete object._account_lockout_expires_at;
  delete object._password_changed_at;
  delete object._password_history;

  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }

  delete object.authData;
  return object;
}; // Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.


const specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];

const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].amount;
          break;

        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = [];
          break;

        case 'Delete':
          delete object[key];
          break;

        default:
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
};

const transformAuthData = (className, object, schema) => {
  if (object.authData && className === '_User') {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;

      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = {
          type: 'Object'
        };
      }
    });
    delete object.authData;
  }
}; // Transforms a Database format ACL to a REST API format ACL


const untransformObjectACL = _ref2 => {
  let {
    _rperm,
    _wperm
  } = _ref2,
      output = _objectWithoutProperties(_ref2, ["_rperm", "_wperm"]);

  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          write: true
        };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }

  return output;
};
/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */


const getRootFieldName = fieldName => {
  return fieldName.split('.')[0];
};

const relationSchema = {
  fields: {
    relatedId: {
      type: 'String'
    },
    owningId: {
      type: 'String'
    }
  }
};

class DatabaseController {
  constructor(adapter, options) {
    this.adapter = adapter;
    this.options = options || {};
    this.idempotencyOptions = this.options.idempotencyOptions || {}; // Prevent mutable this.schema, otherwise one request could use
    // multiple schemas, so instead use loadSchema to get a schema.

    this.schemaPromise = null;
    this._transactionalSession = null;
    this.options = options;
  }

  collectionExists(className) {
    return this.adapter.classExists(className);
  }

  purgeCollection(className) {
    return this.loadSchema().then(schemaController => schemaController.getOneSchema(className)).then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }

  validateClassName(className) {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
    }

    return Promise.resolve();
  } // Returns a promise for a schemaController.


  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }

    this.schemaPromise = SchemaController.load(this.adapter, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }

  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  } // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface


  redirectClassNameForKey(className, key) {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);

      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }

      return className;
    });
  } // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.


  validateObject(className, object, query, runOptions) {
    let schema;
    const acl = runOptions.acl;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;

      if (isMaster) {
        return Promise.resolve();
      }

      return this.canAddField(schema, className, object, aclGroup, runOptions);
    }).then(() => {
      return schema.validateObject(className, object, query);
    });
  }

  update(className, query, update, {
    acl,
    many,
    upsert,
    addsField
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update; // Make a copy of the object, so we don't mutate the incoming data.

    update = (0, _deepcopy.default)(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);

        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);

          if (addsField) {
            query = {
              $and: [query, this.addPointerPermissions(schemaController, className, 'addField', query, aclGroup)]
            };
          }
        }

        if (!query) {
          return Promise.resolve();
        }

        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query);
        return schemaController.getOneSchema(className, true).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(schema => {
          Object.keys(update).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }

            const rootFieldName = getRootFieldName(fieldName);

            if (!SchemaController.fieldNameIsValid(rootFieldName, className) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });

          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }

          update = transformObjectACL(update);
          transformAuthData(className, update, schema);

          if (validateOnly) {
            return this.adapter.find(className, schema, query, {}).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }

              return {};
            });
          }

          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update, this._transactionalSession);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update, this._transactionalSession);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update, this._transactionalSession);
          }
        });
      }).then(result => {
        if (!result) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }

        if (validateOnly) {
          return result;
        }

        return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
          return result;
        });
      }).then(result => {
        if (skipSanitization) {
          return Promise.resolve(result);
        }

        return this._sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  } // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.


  collectRelationUpdates(className, objectId, update) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;

    var process = (op, key) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'RemoveRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };

    for (const key in update) {
      process(update[key], key);
    }

    for (const key of deleteMe) {
      delete update[key];
    }

    return ops;
  } // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed


  handleRelationUpdates(className, objectId, update, ops) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({
      key,
      op
    }) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }

      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });
    return Promise.all(pending);
  } // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.


  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc, this._transactionalSession);
  } // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.


  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc, this._transactionalSession).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }

      throw error;
    });
  } // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.


  destroy(className, query, {
    acl
  } = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);

          if (!query) {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        } // delete by query


        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query, this._transactionalSession)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }

          throw error;
        });
      });
    });
  } // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.


  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    object.createdAt = {
      iso: object.createdAt,
      __type: 'Date'
    };
    object.updatedAt = {
      iso: object.updatedAt,
      __type: 'Date'
    };
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);
    return this.validateClassName(className).then(() => this.loadSchemaIfNeeded(validSchemaController)).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(() => schemaController.enforceClassExists(className)).then(() => schemaController.getOneSchema(className, true)).then(schema => {
        transformAuthData(className, object, schema);
        flattenUpdateOperatorsForCreate(object);

        if (validateOnly) {
          return {};
        }

        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object, this._transactionalSession);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }

        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return this._sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }

  canAddField(schema, className, object, aclGroup, runOptions) {
    const classSchema = schema.schemaData[className];

    if (!classSchema) {
      return Promise.resolve();
    }

    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }

      return schemaFields.indexOf(getRootFieldName(field)) < 0;
    });

    if (newKeys.length > 0) {
      // adds a marker that new field is being adding during update
      runOptions.addsField = true;
      const action = runOptions.action;
      return schema.validatePermission(className, aclGroup, 'addField', action);
    }

    return Promise.resolve();
  } // Won't delete collections in the system namespace

  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */


  deleteEverything(fast = false) {
    this.schemaPromise = null;

    _SchemaCache.default.clear();

    return this.adapter.deleteAllClasses(fast);
  } // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.


  relatedIds(className, key, owningId, queryOptions) {
    const {
      skip,
      limit,
      sort
    } = queryOptions;
    const findOptions = {};

    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = {
        _id: sort.createdAt
      };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }

    return this.adapter.find(joinTableName(className, key), relationSchema, {
      owningId
    }, findOptions).then(results => results.map(result => result.relatedId));
  } // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.


  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {
      keys: ['owningId']
    }).then(results => results.map(result => result.owningId));
  } // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated


  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    if (query['$or']) {
      const ors = query['$or'];
      return Promise.all(ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      })).then(() => {
        return Promise.resolve(query);
      });
    }

    if (query['$and']) {
      const ands = query['$and'];
      return Promise.all(ands.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$and'][index] = aQuery;
        });
      })).then(() => {
        return Promise.resolve(query);
      });
    }

    const promises = Object.keys(query).map(key => {
      const t = schema.getExpectedType(className, key);

      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }

      let queries = null;

      if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;

          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }

          return {
            isNegation,
            relatedIds
          };
        });
      } else {
        queries = [{
          isNegation: false,
          relatedIds: []
        }];
      } // remove the current queryKey as we don,t need it anymore


      delete query[key]; // execute each query independently to build the list of
      // $in / $nin

      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }

        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }

          return Promise.resolve();
        });
      });
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });
    return Promise.all(promises).then(() => {
      return Promise.resolve(query);
    });
  } // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated


  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }

    if (query['$and']) {
      return Promise.all(query['$and'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }

    var relatedTo = query['$relatedTo'];

    if (relatedTo) {
      return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query, queryOptions);
      }).then(() => {});
    }
  }

  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null; // -disable-next

    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];

    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    } // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.


    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$in'] = idsIntersection;
    return query;
  }

  addNotInObjectIdsIds(ids = [], query) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null); // make a set and spread to remove duplicates

    allIds = [...new Set(allIds)]; // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.

    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$nin'] = allIds;
    return query;
  } // Runs a query on the database.
  // Returns a promise that resolves to a list of items.
  // Options:
  //   skip    number of results to skip.
  //   limit   limit to this number of results.
  //   sort    an object where keys are the fields to sort by.
  //           the value is +1 for ascending, -1 for descending.
  //   count   run a count instead of returning results.
  //   acl     restrict this operation with an ACL for the provided array
  //           of user objectIds and roles. acl: null means no user.
  //           when this field is not present, don't do anything regarding ACLs.
  //  caseInsensitive make string comparisons case insensitive
  // TODO: make userIds not needed here. The db adapter shouldn't know
  // anything about users, ideally. Then, improve the format of the ACL
  // arg to work like the others.


  find(className, query, {
    skip,
    limit,
    acl,
    sort = {},
    count,
    keys,
    op,
    distinct,
    pipeline,
    readPreference,
    hint,
    caseInsensitive = false,
    explain
  } = {}, auth = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find'); // Count operation if counting

    op = count === true ? 'count' : op;
    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster).catch(error => {
        // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
        // For now, pretend the class exists but has no objects,
        if (error === undefined) {
          classExists = false;
          return {
            fields: {}
          };
        }

        throw error;
      }).then(schema => {
        // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
        // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
        // use the one that appears first in the sort list.
        if (sort._created_at) {
          sort.createdAt = sort._created_at;
          delete sort._created_at;
        }

        if (sort._updated_at) {
          sort.updatedAt = sort._updated_at;
          delete sort._updated_at;
        }

        const queryOptions = {
          skip,
          limit,
          sort,
          keys,
          readPreference,
          hint,
          caseInsensitive,
          explain
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }

          const rootFieldName = getRootFieldName(fieldName);

          if (!SchemaController.fieldNameIsValid(rootFieldName, className)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;

          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup);
            /* Don't use projections to optimize the protectedFields since the protectedFields
              based on pointer-permissions are determined after querying. The filtering can
              overwrite the protected fields. */

            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth, queryOptions);
          }

          if (!query) {
            if (op === 'get') {
              throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            } else {
              return [];
            }
          }

          if (!isMaster) {
            if (op === 'update' || op === 'delete') {
              query = addWriteACL(query, aclGroup);
            } else {
              query = addReadACL(query, aclGroup);
            }
          }

          validateQuery(query);

          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference, undefined, hint);
            }
          } else if (distinct) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.distinct(className, schema, query, distinct);
            }
          } else if (pipeline) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.aggregate(className, schema, pipeline, readPreference, hint, explain);
            }
          } else if (explain) {
            return this.adapter.find(className, schema, query, queryOptions);
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, aclGroup, auth, op, schemaController, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
            });
          }
        });
      });
    });
  }

  deleteSchema(className) {
    let schemaController;
    return this.loadSchema({
      clearCache: true
    }).then(s => {
      schemaController = s;
      return schemaController.getOneSchema(className, true);
    }).catch(error => {
      if (error === undefined) {
        return {
          fields: {}
        };
      } else {
        throw error;
      }
    }).then(schema => {
      return this.collectionExists(className).then(() => this.adapter.count(className, {
        fields: {}
      }, null, '', false)).then(count => {
        if (count > 0) {
          throw new _node.Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
        }

        return this.adapter.deleteClass(className);
      }).then(wasParseCollection => {
        if (wasParseCollection) {
          const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
          return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name)))).then(() => {
            _SchemaCache.default.del(className);

            return schemaController.reloadData();
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  } // This helps to create intermediate objects for simpler comparison of
  // key value pairs used in query objects. Each key value pair will represented
  // in a similar way to json


  objectToEntriesStrings(query) {
    return Object.entries(query).map(a => a.map(s => JSON.stringify(s)).join(':'));
  } // Naive logic reducer for OR operations meant to be used only for pointer permissions.


  reduceOrOperation(query) {
    if (!query.$or) {
      return query;
    }

    const queries = query.$or.map(q => this.objectToEntriesStrings(q));
    let repeat = false;

    do {
      repeat = false;

      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;

          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the longer query.
            query.$or.splice(longer, 1);
            queries.splice(longer, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);

    if (query.$or.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$or[0]);
      delete query.$or;
    }

    return query;
  } // Naive logic reducer for AND operations meant to be used only for pointer permissions.


  reduceAndOperation(query) {
    if (!query.$and) {
      return query;
    }

    const queries = query.$and.map(q => this.objectToEntriesStrings(q));
    let repeat = false;

    do {
      repeat = false;

      for (let i = 0; i < queries.length - 1; i++) {
        for (let j = i + 1; j < queries.length; j++) {
          const [shorter, longer] = queries[i].length > queries[j].length ? [j, i] : [i, j];
          const foundEntries = queries[shorter].reduce((acc, entry) => acc + (queries[longer].includes(entry) ? 1 : 0), 0);
          const shorterEntries = queries[shorter].length;

          if (foundEntries === shorterEntries) {
            // If the shorter query is completely contained in the longer one, we can strike
            // out the shorter query.
            query.$and.splice(shorter, 1);
            queries.splice(shorter, 1);
            repeat = true;
            break;
          }
        }
      }
    } while (repeat);

    if (query.$and.length === 1) {
      query = _objectSpread(_objectSpread({}, query), query.$and[0]);
      delete query.$and;
    }

    return query;
  } // Constraints query using CLP's pointer permissions (PP) if any.
  // 1. Etract the user id from caller's ACLgroup;
  // 2. Exctract a list of field names that are PP for target collection and operation;
  // 3. Constraint the original query so that each PP field must
  // point to caller's id (or contain it in case of PP field being an array)


  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }

    const perms = schema.getClassLevelPermissions(className);
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    });
    const groupKey = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const permFields = [];

    if (perms[operation] && perms[operation].pointerFields) {
      permFields.push(...perms[operation].pointerFields);
    }

    if (perms[groupKey]) {
      for (const field of perms[groupKey]) {
        if (!permFields.includes(field)) {
          permFields.push(field);
        }
      }
    } // the ACL should have exactly 1 user


    if (permFields.length > 0) {
      // the ACL should have exactly 1 user
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }

      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId
      };
      const queries = permFields.map(key => {
        const fieldDescriptor = schema.getExpectedType(className, key);
        const fieldType = fieldDescriptor && typeof fieldDescriptor === 'object' && Object.prototype.hasOwnProperty.call(fieldDescriptor, 'type') ? fieldDescriptor.type : null;
        let queryClause;

        if (fieldType === 'Pointer') {
          // constraint for single pointer setup
          queryClause = {
            [key]: userPointer
          };
        } else if (fieldType === 'Array') {
          // constraint for users-array setup
          queryClause = {
            [key]: {
              $all: [userPointer]
            }
          };
        } else if (fieldType === 'Object') {
          // constraint for object setup
          queryClause = {
            [key]: userPointer
          };
        } else {
          // This means that there is a CLP field of an unexpected type. This condition should not happen, which is
          // why is being treated as an error.
          throw Error(`An unexpected condition occurred when resolving pointer permissions: ${className} ${key}`);
        } // if we already have a constraint on the key, use the $and


        if (Object.prototype.hasOwnProperty.call(query, key)) {
          return this.reduceAndOperation({
            $and: [queryClause, query]
          });
        } // otherwise just add the constaint


        return Object.assign({}, query, queryClause);
      });
      return queries.length === 1 ? queries[0] : this.reduceOrOperation({
        $or: queries
      });
    } else {
      return query;
    }
  }

  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}, queryOptions = {}) {
    const perms = schema && schema.getClassLevelPermissions ? schema.getClassLevelPermissions(className) : schema;
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null; // for queries where "keys" are set and do not include all 'userField':{field},
    // we have to transparently include it, and then remove before returning to client
    // Because if such key not projected the permission won't be enforced properly
    // PS this is called when 'excludeKeys' already reduced to 'keys'

    const preserveKeys = queryOptions.keys; // these are keys that need to be included only
    // to be able to apply protectedFields by pointer
    // and then unset before returning to client (later in  filterSensitiveFields)

    const serverOnlyKeys = [];
    const authenticated = auth.user; // map to allow check without array search

    const roles = (auth.userRoles || []).reduce((acc, r) => {
      acc[r] = protectedFields[r];
      return acc;
    }, {}); // array of sets of protected fields. separate item for each applicable criteria

    const protectedKeysSets = [];

    for (const key in protectedFields) {
      // skip userFields
      if (key.startsWith('userField:')) {
        if (preserveKeys) {
          const fieldName = key.substring(10);

          if (!preserveKeys.includes(fieldName)) {
            // 1. put it there temporarily
            queryOptions.keys && queryOptions.keys.push(fieldName); // 2. preserve it delete later

            serverOnlyKeys.push(fieldName);
          }
        }

        continue;
      } // add public tier


      if (key === '*') {
        protectedKeysSets.push(protectedFields[key]);
        continue;
      }

      if (authenticated) {
        if (key === 'authenticated') {
          // for logged in users
          protectedKeysSets.push(protectedFields[key]);
          continue;
        }

        if (roles[key] && key.startsWith('role:')) {
          // add applicable roles
          protectedKeysSets.push(roles[key]);
        }
      }
    } // check if there's a rule for current user's id


    if (authenticated) {
      const userId = auth.user.id;

      if (perms.protectedFields[userId]) {
        protectedKeysSets.push(perms.protectedFields[userId]);
      }
    } // preserve fields to be removed before sending response to client


    if (serverOnlyKeys.length > 0) {
      perms.protectedFields.temporaryKeys = serverOnlyKeys;
    }

    let protectedKeys = protectedKeysSets.reduce((acc, next) => {
      if (next) {
        acc.push(...next);
      }

      return acc;
    }, []); // intersect all sets of protectedFields

    protectedKeysSets.forEach(fields => {
      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  }

  createTransactionalSession() {
    return this.adapter.createTransactionalSession().then(transactionalSession => {
      this._transactionalSession = transactionalSession;
    });
  }

  commitTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to commit');
    }

    return this.adapter.commitTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  }

  abortTransactionalSession() {
    if (!this._transactionalSession) {
      throw new Error('There is no transactional session to abort');
    }

    return this.adapter.abortTransactionalSession(this._transactionalSession).then(() => {
      this._transactionalSession = null;
    });
  } // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.


  async performInitialization() {
    await this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    const requiredUserFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Role)
    };
    const requiredIdempotencyFields = {
      fields: _objectSpread(_objectSpread({}, SchemaController.defaultColumns._Default), SchemaController.defaultColumns._Idempotency)
    };
    await this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    await this.loadSchema().then(schema => schema.enforceClassExists('_Idempotency'));
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['username']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['username'], 'case_insensitive_username', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive username index: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_User', requiredUserFields, ['email']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    await this.adapter.ensureIndex('_User', requiredUserFields, ['email'], 'case_insensitive_email', true).catch(error => {
      _logger.default.warn('Unable to create case insensitive email index: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });
    await this.adapter.ensureUniqueness('_Idempotency', requiredIdempotencyFields, ['reqId']).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for idempotency request ID: ', error);

      throw error;
    });
    const isMongoAdapter = this.adapter instanceof _MongoStorageAdapter.default;
    const isPostgresAdapter = this.adapter instanceof _PostgresStorageAdapter.default;

    if (isMongoAdapter || isPostgresAdapter) {
      let options = {};

      if (isMongoAdapter) {
        options = {
          ttl: 0
        };
      } else if (isPostgresAdapter) {
        options = this.idempotencyOptions;
        options.setIdempotencyFunction = true;
      }

      await this.adapter.ensureIndex('_Idempotency', requiredIdempotencyFields, ['expire'], 'ttl', false, options).catch(error => {
        _logger.default.warn('Unable to create TTL index for idempotency expire date: ', error);

        throw error;
      });
    }

    await this.adapter.updateSchemaWithIndexes();
  }

  _expandResultOnKeyPath(object, key, value) {
    if (key.indexOf('.') < 0) {
      object[key] = value[key];
      return object;
    }

    const path = key.split('.');
    const firstKey = path[0];
    const nextPath = path.slice(1).join('.'); // Scan request data for denied keywords

    if (this.options && this.options.requestKeywordDenylist) {
      // Scan request data for denied keywords
      for (const keyword of this.options.requestKeywordDenylist) {
        const match = _Utils.default.objectContainsKeyValue({
          firstKey: undefined
        }, keyword.key, undefined);

        if (match) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
        }
      }
    }

    object[firstKey] = this._expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
    delete object[key];
    return object;
  }

  _sanitizeDatabaseResult(originalObject, result) {
    const response = {};

    if (!result) {
      return Promise.resolve(response);
    }

    Object.keys(originalObject).forEach(key => {
      const keyUpdate = originalObject[key]; // determine if that was an op

      if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
        // only valid ops that produce an actionable result
        // the op may have happened on a keypath
        this._expandResultOnKeyPath(response, key, result);
      }
    });
    return Promise.resolve(response);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
module.exports.filterSensitiveData = filterSensitiveData;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJhZGRXcml0ZUFDTCIsInF1ZXJ5IiwiYWNsIiwibmV3UXVlcnkiLCJfIiwiY2xvbmVEZWVwIiwiX3dwZXJtIiwiJGluIiwiYWRkUmVhZEFDTCIsIl9ycGVybSIsInRyYW5zZm9ybU9iamVjdEFDTCIsIkFDTCIsInJlc3VsdCIsImVudHJ5IiwicmVhZCIsInB1c2giLCJ3cml0ZSIsInNwZWNpYWxRdWVyeWtleXMiLCJpc1NwZWNpYWxRdWVyeUtleSIsImtleSIsImluZGV4T2YiLCJ2YWxpZGF0ZVF1ZXJ5IiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCIkYW5kIiwiJG5vciIsImxlbmd0aCIsIk9iamVjdCIsImtleXMiLCIkcmVnZXgiLCIkb3B0aW9ucyIsIm1hdGNoIiwiSU5WQUxJRF9LRVlfTkFNRSIsImZpbHRlclNlbnNpdGl2ZURhdGEiLCJpc01hc3RlciIsImFjbEdyb3VwIiwiYXV0aCIsIm9wZXJhdGlvbiIsInNjaGVtYSIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsInVzZXJJZCIsInVzZXIiLCJpZCIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNSZWFkT3BlcmF0aW9uIiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0iLCJmaWx0ZXIiLCJzdGFydHNXaXRoIiwibWFwIiwic3Vic3RyaW5nIiwidmFsdWUiLCJuZXdQcm90ZWN0ZWRGaWVsZHMiLCJvdmVycmlkZVByb3RlY3RlZEZpZWxkcyIsInBvaW50ZXJQZXJtIiwicG9pbnRlclBlcm1JbmNsdWRlc1VzZXIiLCJyZWFkVXNlckZpZWxkVmFsdWUiLCJpc0FycmF5Iiwic29tZSIsIm9iamVjdElkIiwiZmllbGRzIiwidiIsImluY2x1ZGVzIiwiaXNVc2VyQ2xhc3MiLCJrIiwidGVtcG9yYXJ5S2V5cyIsInBhc3N3b3JkIiwiX2hhc2hlZF9wYXNzd29yZCIsInNlc3Npb25Ub2tlbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbiIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCJfdG9tYnN0b25lIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwiX2ZhaWxlZF9sb2dpbl9jb3VudCIsIl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5Iiwiam9pblRhYmxlTmFtZSIsImZsYXR0ZW5VcGRhdGVPcGVyYXRvcnNGb3JDcmVhdGUiLCJfX29wIiwiYW1vdW50IiwiSU5WQUxJRF9KU09OIiwib2JqZWN0cyIsIkNPTU1BTkRfVU5BVkFJTEFCTEUiLCJ0cmFuc2Zvcm1BdXRoRGF0YSIsInByb3ZpZGVyIiwicHJvdmlkZXJEYXRhIiwiZmllbGROYW1lIiwidHlwZSIsInVudHJhbnNmb3JtT2JqZWN0QUNMIiwib3V0cHV0IiwiZ2V0Um9vdEZpZWxkTmFtZSIsInNwbGl0IiwicmVsYXRpb25TY2hlbWEiLCJyZWxhdGVkSWQiLCJvd25pbmdJZCIsIkRhdGFiYXNlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsIm9wdGlvbnMiLCJpZGVtcG90ZW5jeU9wdGlvbnMiLCJzY2hlbWFQcm9taXNlIiwiX3RyYW5zYWN0aW9uYWxTZXNzaW9uIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwiUHJvbWlzZSIsInJlamVjdCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsInJlc29sdmUiLCJjbGVhckNhY2hlIiwibG9hZCIsImxvYWRTY2hlbWFJZk5lZWRlZCIsInJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IiwidCIsImdldEV4cGVjdGVkVHlwZSIsInRhcmdldENsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJydW5PcHRpb25zIiwidW5kZWZpbmVkIiwicyIsImNhbkFkZEZpZWxkIiwidXBkYXRlIiwibWFueSIsInVwc2VydCIsImFkZHNGaWVsZCIsInNraXBTYW5pdGl6YXRpb24iLCJ2YWxpZGF0ZU9ubHkiLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJvcmlnaW5hbFF1ZXJ5Iiwib3JpZ2luYWxVcGRhdGUiLCJkZWVwY29weSIsInJlbGF0aW9uVXBkYXRlcyIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNvbGxlY3RSZWxhdGlvblVwZGF0ZXMiLCJhZGRQb2ludGVyUGVybWlzc2lvbnMiLCJjYXRjaCIsImVycm9yIiwicm9vdEZpZWxkTmFtZSIsImZpZWxkTmFtZUlzVmFsaWQiLCJ1cGRhdGVPcGVyYXRpb24iLCJpbm5lcktleSIsIklOVkFMSURfTkVTVEVEX0tFWSIsImZpbmQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cHNlcnRPbmVPYmplY3QiLCJmaW5kT25lQW5kVXBkYXRlIiwiaGFuZGxlUmVsYXRpb25VcGRhdGVzIiwiX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQiLCJvcHMiLCJkZWxldGVNZSIsInByb2Nlc3MiLCJvcCIsIngiLCJwZW5kaW5nIiwiYWRkUmVsYXRpb24iLCJyZW1vdmVSZWxhdGlvbiIsImFsbCIsImZyb21DbGFzc05hbWUiLCJmcm9tSWQiLCJ0b0lkIiwiZG9jIiwiY29kZSIsImRlc3Ryb3kiLCJwYXJzZUZvcm1hdFNjaGVtYSIsImNyZWF0ZSIsIm9yaWdpbmFsT2JqZWN0IiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWVsZCIsImFjdGlvbiIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiU2NoZW1hQ2FjaGUiLCJjbGVhciIsImRlbGV0ZUFsbENsYXNzZXMiLCJyZWxhdGVkSWRzIiwicXVlcnlPcHRpb25zIiwic2tpcCIsImxpbWl0Iiwic29ydCIsImZpbmRPcHRpb25zIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsIl9pZCIsInJlc3VsdHMiLCJvd25pbmdJZHMiLCJyZWR1Y2VJblJlbGF0aW9uIiwib3JzIiwiYVF1ZXJ5IiwiaW5kZXgiLCJhbmRzIiwicHJvbWlzZXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwiZXhwbGFpbiIsIl9jcmVhdGVkX2F0IiwiX3VwZGF0ZWRfYXQiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJhZ2dyZWdhdGUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJkZWxldGVTY2hlbWEiLCJkZWxldGVDbGFzcyIsIndhc1BhcnNlQ29sbGVjdGlvbiIsInJlbGF0aW9uRmllbGROYW1lcyIsIm5hbWUiLCJkZWwiLCJyZWxvYWREYXRhIiwib2JqZWN0VG9FbnRyaWVzU3RyaW5ncyIsImVudHJpZXMiLCJhIiwiSlNPTiIsInN0cmluZ2lmeSIsImpvaW4iLCJyZWR1Y2VPck9wZXJhdGlvbiIsInJlcGVhdCIsImkiLCJqIiwic2hvcnRlciIsImxvbmdlciIsImZvdW5kRW50cmllcyIsImFjYyIsInNob3J0ZXJFbnRyaWVzIiwic3BsaWNlIiwicmVkdWNlQW5kT3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwidXNlckFDTCIsImdyb3VwS2V5IiwicGVybUZpZWxkcyIsInBvaW50ZXJGaWVsZHMiLCJ1c2VyUG9pbnRlciIsImZpZWxkRGVzY3JpcHRvciIsImZpZWxkVHlwZSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInF1ZXJ5Q2xhdXNlIiwiJGFsbCIsImFzc2lnbiIsInByZXNlcnZlS2V5cyIsInNlcnZlck9ubHlLZXlzIiwiYXV0aGVudGljYXRlZCIsInJvbGVzIiwidXNlclJvbGVzIiwicHJvdGVjdGVkS2V5c1NldHMiLCJwcm90ZWN0ZWRLZXlzIiwibmV4dCIsImNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uIiwidHJhbnNhY3Rpb25hbFNlc3Npb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24iLCJwZXJmb3JtSW5pdGlhbGl6YXRpb24iLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJyZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzIiwiX0lkZW1wb3RlbmN5IiwiZW5zdXJlVW5pcXVlbmVzcyIsImxvZ2dlciIsIndhcm4iLCJlbnN1cmVJbmRleCIsImlzTW9uZ29BZGFwdGVyIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImlzUG9zdGdyZXNBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInR0bCIsInNldElkZW1wb3RlbmN5RnVuY3Rpb24iLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsIl9leHBhbmRSZXN1bHRPbktleVBhdGgiLCJwYXRoIiwiZmlyc3RLZXkiLCJuZXh0UGF0aCIsInNsaWNlIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJVdGlscyIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJyZXNwb25zZSIsImtleVVwZGF0ZSIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgKiBhcyBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4vU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IE1vbmdvU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IHR5cGUgeyBMb2FkU2NoZW1hT3B0aW9ucyB9IGZyb20gJy4vdHlwZXMnO1xuaW1wb3J0IHR5cGUgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCB0eXBlIHsgUXVlcnlPcHRpb25zLCBGdWxsUXVlcnlPcHRpb25zIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5a2V5cyA9IFtcbiAgJyRhbmQnLFxuICAnJG9yJyxcbiAgJyRub3InLFxuICAnX3JwZXJtJyxcbiAgJ193cGVybScsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxRdWVyeUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsUXVlcnlrZXlzLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChxdWVyeTogYW55KTogdm9pZCA9PiB7XG4gIGlmIChxdWVyeS5BQ0wpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0Nhbm5vdCBxdWVyeSBvbiBBQ0wuJyk7XG4gIH1cblxuICBpZiAocXVlcnkuJG9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRvciBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICBxdWVyeS4kb3IuZm9yRWFjaCh2YWxpZGF0ZVF1ZXJ5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJG9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaCh2YWxpZGF0ZVF1ZXJ5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdCYWQgJGFuZCBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKHF1ZXJ5LiRub3IpIHtcbiAgICBpZiAocXVlcnkuJG5vciBpbnN0YW5jZW9mIEFycmF5ICYmIHF1ZXJ5LiRub3IubGVuZ3RoID4gMCkge1xuICAgICAgcXVlcnkuJG5vci5mb3JFYWNoKHZhbGlkYXRlUXVlcnkpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICdCYWQgJG5vciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgb2YgYXQgbGVhc3QgMSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIE9iamVjdC5rZXlzKHF1ZXJ5KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5W2tleV0gJiYgcXVlcnlba2V5XS4kcmVnZXgpIHtcbiAgICAgIGlmICh0eXBlb2YgcXVlcnlba2V5XS4kb3B0aW9ucyA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFxdWVyeVtrZXldLiRvcHRpb25zLm1hdGNoKC9eW2lteHNdKyQvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICBgQmFkICRvcHRpb25zIHZhbHVlIGZvciBxdWVyeTogJHtxdWVyeVtrZXldLiRvcHRpb25zfWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghaXNTcGVjaWFsUXVlcnlLZXkoa2V5KSAmJiAha2V5Lm1hdGNoKC9eW2EtekEtWl1bYS16QS1aMC05X1xcLl0qJC8pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWApO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGaWx0ZXJzIG91dCBhbnkgZGF0YSB0aGF0IHNob3VsZG4ndCBiZSBvbiB0aGlzIFJFU1QtZm9ybWF0dGVkIG9iamVjdC5cbmNvbnN0IGZpbHRlclNlbnNpdGl2ZURhdGEgPSAoXG4gIGlzTWFzdGVyOiBib29sZWFuLFxuICBhY2xHcm91cDogYW55W10sXG4gIGF1dGg6IGFueSxcbiAgb3BlcmF0aW9uOiBhbnksXG4gIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyIHwgYW55LFxuICBjbGFzc05hbWU6IHN0cmluZyxcbiAgcHJvdGVjdGVkRmllbGRzOiBudWxsIHwgQXJyYXk8YW55PixcbiAgb2JqZWN0OiBhbnlcbikgPT4ge1xuICBsZXQgdXNlcklkID0gbnVsbDtcbiAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB1c2VySWQgPSBhdXRoLnVzZXIuaWQ7XG5cbiAgLy8gcmVwbGFjZSBwcm90ZWN0ZWRGaWVsZHMgd2hlbiB1c2luZyBwb2ludGVyLXBlcm1pc3Npb25zXG4gIGNvbnN0IHBlcm1zID1cbiAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSA6IHt9O1xuICBpZiAocGVybXMpIHtcbiAgICBjb25zdCBpc1JlYWRPcGVyYXRpb24gPSBbJ2dldCcsICdmaW5kJ10uaW5kZXhPZihvcGVyYXRpb24pID4gLTE7XG5cbiAgICBpZiAoaXNSZWFkT3BlcmF0aW9uICYmIHBlcm1zLnByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gZXh0cmFjdCBwcm90ZWN0ZWRGaWVsZHMgYWRkZWQgd2l0aCB0aGUgcG9pbnRlci1wZXJtaXNzaW9uIHByZWZpeFxuICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclBlcm0gPSBPYmplY3Qua2V5cyhwZXJtcy5wcm90ZWN0ZWRGaWVsZHMpXG4gICAgICAgIC5maWx0ZXIoa2V5ID0+IGtleS5zdGFydHNXaXRoKCd1c2VyRmllbGQ6JykpXG4gICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICByZXR1cm4geyBrZXk6IGtleS5zdWJzdHJpbmcoMTApLCB2YWx1ZTogcGVybXMucHJvdGVjdGVkRmllbGRzW2tleV0gfTtcbiAgICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IG5ld1Byb3RlY3RlZEZpZWxkczogQXJyYXk8c3RyaW5nPltdID0gW107XG4gICAgICBsZXQgb3ZlcnJpZGVQcm90ZWN0ZWRGaWVsZHMgPSBmYWxzZTtcblxuICAgICAgLy8gY2hlY2sgaWYgdGhlIG9iamVjdCBncmFudHMgdGhlIGN1cnJlbnQgdXNlciBhY2Nlc3MgYmFzZWQgb24gdGhlIGV4dHJhY3RlZCBmaWVsZHNcbiAgICAgIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJQZXJtLmZvckVhY2gocG9pbnRlclBlcm0gPT4ge1xuICAgICAgICBsZXQgcG9pbnRlclBlcm1JbmNsdWRlc1VzZXIgPSBmYWxzZTtcbiAgICAgICAgY29uc3QgcmVhZFVzZXJGaWVsZFZhbHVlID0gb2JqZWN0W3BvaW50ZXJQZXJtLmtleV07XG4gICAgICAgIGlmIChyZWFkVXNlckZpZWxkVmFsdWUpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyZWFkVXNlckZpZWxkVmFsdWUpKSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9IHJlYWRVc2VyRmllbGRWYWx1ZS5zb21lKFxuICAgICAgICAgICAgICB1c2VyID0+IHVzZXIub2JqZWN0SWQgJiYgdXNlci5vYmplY3RJZCA9PT0gdXNlcklkXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwb2ludGVyUGVybUluY2x1ZGVzVXNlciA9XG4gICAgICAgICAgICAgIHJlYWRVc2VyRmllbGRWYWx1ZS5vYmplY3RJZCAmJiByZWFkVXNlckZpZWxkVmFsdWUub2JqZWN0SWQgPT09IHVzZXJJZDtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocG9pbnRlclBlcm1JbmNsdWRlc1VzZXIpIHtcbiAgICAgICAgICBvdmVycmlkZVByb3RlY3RlZEZpZWxkcyA9IHRydWU7XG4gICAgICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLnB1c2gocG9pbnRlclBlcm0udmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gaWYgYXQgbGVhc3Qgb25lIHBvaW50ZXItcGVybWlzc2lvbiBhZmZlY3RlZCB0aGUgY3VycmVudCB1c2VyXG4gICAgICAvLyBpbnRlcnNlY3QgdnMgcHJvdGVjdGVkRmllbGRzIGZyb20gcHJldmlvdXMgc3RhZ2UgKEBzZWUgYWRkUHJvdGVjdGVkRmllbGRzKVxuICAgICAgLy8gU2V0cyB0aGVvcnkgKGludGVyc2VjdGlvbnMpOiBBIHggKEIgeCBDKSA9PSAoQSB4IEIpIHggQ1xuICAgICAgaWYgKG92ZXJyaWRlUHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICBuZXdQcm90ZWN0ZWRGaWVsZHMucHVzaChwcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgfVxuICAgICAgLy8gaW50ZXJzZWN0IGFsbCBzZXRzIG9mIHByb3RlY3RlZEZpZWxkc1xuICAgICAgbmV3UHJvdGVjdGVkRmllbGRzLmZvckVhY2goZmllbGRzID0+IHtcbiAgICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICAgIC8vIGlmIHRoZXJlJ3JlIG5vIHByb3RjdGVkRmllbGRzIGJ5IG90aGVyIGNyaXRlcmlhICggaWQgLyByb2xlIC8gYXV0aClcbiAgICAgICAgICAvLyB0aGVuIHdlIG11c3QgaW50ZXJzZWN0IGVhY2ggc2V0IChwZXIgdXNlckZpZWxkKVxuICAgICAgICAgIGlmICghcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBmaWVsZHM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9XG5cbiAgY29uc3QgaXNVc2VyQ2xhc3MgPSBjbGFzc05hbWUgPT09ICdfVXNlcic7XG5cbiAgLyogc3BlY2lhbCB0cmVhdCBmb3IgdGhlIHVzZXIgY2xhc3M6IGRvbid0IGZpbHRlciBwcm90ZWN0ZWRGaWVsZHMgaWYgY3VycmVudGx5IGxvZ2dlZGluIHVzZXIgaXNcbiAgdGhlIHJldHJpZXZlZCB1c2VyICovXG4gIGlmICghKGlzVXNlckNsYXNzICYmIHVzZXJJZCAmJiBvYmplY3Qub2JqZWN0SWQgPT09IHVzZXJJZCkpIHtcbiAgICBwcm90ZWN0ZWRGaWVsZHMgJiYgcHJvdGVjdGVkRmllbGRzLmZvckVhY2goayA9PiBkZWxldGUgb2JqZWN0W2tdKTtcblxuICAgIC8vIGZpZWxkcyBub3QgcmVxdWVzdGVkIGJ5IGNsaWVudCAoZXhjbHVkZWQpLFxuICAgIC8vYnV0IHdlcmUgbmVlZGVkIHRvIGFwcGx5IHByb3RlY3R0ZWRGaWVsZHNcbiAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMgJiZcbiAgICAgIHBlcm1zLnByb3RlY3RlZEZpZWxkcy50ZW1wb3JhcnlLZXlzICYmXG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG4gIH1cblxuICBpZiAoIWlzVXNlckNsYXNzKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICBkZWxldGUgb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG5cbiAgZGVsZXRlIG9iamVjdC5zZXNzaW9uVG9rZW47XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW47XG4gIGRlbGV0ZSBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW47XG4gIGRlbGV0ZSBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fdG9tYnN0b25lO1xuICBkZWxldGUgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fZmFpbGVkX2xvZ2luX2NvdW50O1xuICBkZWxldGUgb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcbiAgZGVsZXRlIG9iamVjdC5fcGFzc3dvcmRfaGlzdG9yeTtcblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG4vLyBSdW5zIGFuIHVwZGF0ZSBvbiB0aGUgZGF0YWJhc2UuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gb2JqZWN0IHdpdGggdGhlIG5ldyB2YWx1ZXMgZm9yIGZpZWxkXG4vLyBtb2RpZmljYXRpb25zIHRoYXQgZG9uJ3Qga25vdyB0aGVpciByZXN1bHRzIGFoZWFkIG9mIHRpbWUsIGxpa2Vcbi8vICdpbmNyZW1lbnQnLlxuLy8gT3B0aW9uczpcbi8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuLy8gICAgICAgICBvbmUgb2YgdGhlIHByb3ZpZGVkIHN0cmluZ3MgbXVzdCBwcm92aWRlIHRoZSBjYWxsZXIgd2l0aFxuLy8gICAgICAgICB3cml0ZSBwZXJtaXNzaW9ucy5cbmNvbnN0IHNwZWNpYWxLZXlzRm9yVXBkYXRlID0gW1xuICAnX2hhc2hlZF9wYXNzd29yZCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19wYXNzd29yZF9jaGFuZ2VkX2F0JyxcbiAgJ19wYXNzd29yZF9oaXN0b3J5Jyxcbl07XG5cbmNvbnN0IGlzU3BlY2lhbFVwZGF0ZUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsS2V5c0ZvclVwZGF0ZS5pbmRleE9mKGtleSkgPj0gMDtcbn07XG5cbmZ1bmN0aW9uIGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIGBfSm9pbjoke2tleX06JHtjbGFzc05hbWV9YDtcbn1cblxuY29uc3QgZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSA9IG9iamVjdCA9PiB7XG4gIGZvciAoY29uc3Qga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChvYmplY3Rba2V5XSAmJiBvYmplY3Rba2V5XS5fX29wKSB7XG4gICAgICBzd2l0Y2ggKG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldLmFtb3VudCAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0uYW1vdW50O1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGQnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5Jyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheScpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IG9iamVjdFtrZXldLm9iamVjdHM7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBbXTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgICBkZWxldGUgb2JqZWN0W2tleV07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuQ09NTUFORF9VTkFWQUlMQUJMRSxcbiAgICAgICAgICAgIGBUaGUgJHtvYmplY3Rba2V5XS5fX29wfSBvcGVyYXRvciBpcyBub3Qgc3VwcG9ydGVkIHlldC5gXG4gICAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbmNvbnN0IHRyYW5zZm9ybUF1dGhEYXRhID0gKGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpID0+IHtcbiAgaWYgKG9iamVjdC5hdXRoRGF0YSAmJiBjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIF90cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueTtcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBpZGVtcG90ZW5jeU9wdGlvbnM6IGFueTtcblxuICBjb25zdHJ1Y3RvcihhZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuaWRlbXBvdGVuY3lPcHRpb25zID0gdGhpcy5vcHRpb25zLmlkZW1wb3RlbmN5T3B0aW9ucyB8fCB7fTtcbiAgICAvLyBQcmV2ZW50IG11dGFibGUgdGhpcy5zY2hlbWEsIG90aGVyd2lzZSBvbmUgcmVxdWVzdCBjb3VsZCB1c2VcbiAgICAvLyBtdWx0aXBsZSBzY2hlbWFzLCBzbyBpbnN0ZWFkIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uID0gbnVsbDtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuICB9XG5cbiAgY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgfVxuXG4gIHB1cmdlQ29sbGVjdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwge30pKTtcbiAgfVxuXG4gIHZhbGlkYXRlQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKCFTY2hlbWFDb250cm9sbGVyLmNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWUpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBzY2hlbWFDb250cm9sbGVyLlxuICBsb2FkU2NoZW1hKFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hUHJvbWlzZSAhPSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5zY2hlbWFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBTY2hlbWFDb250cm9sbGVyLmxvYWQodGhpcy5hZGFwdGVyLCBvcHRpb25zKTtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UudGhlbihcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2UsXG4gICAgICAoKSA9PiBkZWxldGUgdGhpcy5zY2hlbWFQcm9taXNlXG4gICAgKTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgbG9hZFNjaGVtYUlmTmVlZGVkKFxuICAgIHNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpIDogdGhpcy5sb2FkU2NoZW1hKG9wdGlvbnMpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHRoZSBjbGFzc25hbWUgdGhhdCBpcyByZWxhdGVkIHRvIHRoZSBnaXZlblxuICAvLyBjbGFzc25hbWUgdGhyb3VnaCB0aGUga2V5LlxuICAvLyBUT0RPOiBtYWtlIHRoaXMgbm90IGluIHRoZSBEYXRhYmFzZUNvbnRyb2xsZXIgaW50ZXJmYWNlXG4gIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KGNsYXNzTmFtZTogc3RyaW5nLCBrZXk6IHN0cmluZyk6IFByb21pc2U8P3N0cmluZz4ge1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PiB7XG4gICAgICB2YXIgdCA9IHNjaGVtYS5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBrZXkpO1xuICAgICAgaWYgKHQgIT0gbnVsbCAmJiB0eXBlb2YgdCAhPT0gJ3N0cmluZycgJiYgdC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiB0LnRhcmdldENsYXNzO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGNsYXNzTmFtZTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIFVzZXMgdGhlIHNjaGVtYSB0byB2YWxpZGF0ZSB0aGUgb2JqZWN0IChSRVNUIEFQSSBmb3JtYXQpLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hLlxuICAvLyBUaGlzIGRvZXMgbm90IHVwZGF0ZSB0aGlzLnNjaGVtYSwgYmVjYXVzZSBpbiBhIHNpdHVhdGlvbiBsaWtlIGFcbiAgLy8gYmF0Y2ggcmVxdWVzdCwgdGhhdCBjb3VsZCBjb25mdXNlIG90aGVyIHVzZXJzIG9mIHRoZSBzY2hlbWEuXG4gIHZhbGlkYXRlT2JqZWN0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGxldCBzY2hlbWE7XG4gICAgY29uc3QgYWNsID0gcnVuT3B0aW9ucy5hY2w7XG4gICAgY29uc3QgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXA6IHN0cmluZ1tdID0gYWNsIHx8IFtdO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4ocyA9PiB7XG4gICAgICAgIHNjaGVtYSA9IHM7XG4gICAgICAgIGlmIChpc01hc3Rlcikge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5jYW5BZGRGaWVsZChzY2hlbWEsIGNsYXNzTmFtZSwgb2JqZWN0LCBhY2xHcm91cCwgcnVuT3B0aW9ucyk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHsgYWNsLCBtYW55LCB1cHNlcnQsIGFkZHNGaWVsZCB9OiBGdWxsUXVlcnlPcHRpb25zID0ge30sXG4gICAgc2tpcFNhbml0aXphdGlvbjogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkYXRlT25seTogYm9vbGVhbiA9IGZhbHNlLFxuICAgIHZhbGlkU2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgY29uc3Qgb3JpZ2luYWxRdWVyeSA9IHF1ZXJ5O1xuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0gdXBkYXRlO1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICB1cGRhdGUgPSBkZWVwY29weSh1cGRhdGUpO1xuICAgIHZhciByZWxhdGlvblVwZGF0ZXMgPSBbXTtcbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ3VwZGF0ZScpXG4gICAgICApXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICByZWxhdGlvblVwZGF0ZXMgPSB0aGlzLmNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lLCBvcmlnaW5hbFF1ZXJ5Lm9iamVjdElkLCB1cGRhdGUpO1xuICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gdGhpcy5hZGRQb2ludGVyUGVybWlzc2lvbnMoXG4gICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgJ3VwZGF0ZScsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgaWYgKGFkZHNGaWVsZCkge1xuICAgICAgICAgICAgICBxdWVyeSA9IHtcbiAgICAgICAgICAgICAgICAkYW5kOiBbXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICdhZGRGaWVsZCcsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgdHJ1ZSlcbiAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgLy8gd2lsbCBsaWtlbHkgbmVlZCByZXZpc2l0aW5nLlxuICAgICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgICBPYmplY3Qua2V5cyh1cGRhdGUpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lLCBjbGFzc05hbWUpICYmXG4gICAgICAgICAgICAgICAgICAhaXNTcGVjaWFsVXBkYXRlS2V5KHJvb3RGaWVsZE5hbWUpXG4gICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IHVwZGF0ZU9wZXJhdGlvbiBpbiB1cGRhdGUpIHtcbiAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgdHlwZW9mIHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0pLnNvbWUoXG4gICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+IGlubmVyS2V5LmluY2x1ZGVzKCckJykgfHwgaW5uZXJLZXkuaW5jbHVkZXMoJy4nKVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgdXBkYXRlID0gdHJhbnNmb3JtT2JqZWN0QUNMKHVwZGF0ZSk7XG4gICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwge30pLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgIGlmICghcmVzdWx0IHx8ICFyZXN1bHQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZmluZE9uZUFuZFVwZGF0ZShcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb25cbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgIHVwZGF0ZSxcbiAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmIChza2lwU2FuaXRpemF0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsVXBkYXRlLCByZXN1bHQpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvbGxlY3QgYWxsIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIGxpc3Qgb2YgYWxsIHJlbGF0aW9uIHVwZGF0ZXMgdG8gcGVyZm9ybVxuICAvLyBUaGlzIG11dGF0ZXMgdXBkYXRlLlxuICBjb2xsZWN0UmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogP3N0cmluZywgdXBkYXRlOiBhbnkpIHtcbiAgICB2YXIgb3BzID0gW107XG4gICAgdmFyIGRlbGV0ZU1lID0gW107XG4gICAgb2JqZWN0SWQgPSB1cGRhdGUub2JqZWN0SWQgfHwgb2JqZWN0SWQ7XG5cbiAgICB2YXIgcHJvY2VzcyA9IChvcCwga2V5KSA9PiB7XG4gICAgICBpZiAoIW9wKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChvcC5fX29wID09ICdBZGRSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgb3BzLnB1c2goeyBrZXksIG9wIH0pO1xuICAgICAgICBkZWxldGVNZS5wdXNoKGtleSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdCYXRjaCcpIHtcbiAgICAgICAgZm9yICh2YXIgeCBvZiBvcC5vcHMpIHtcbiAgICAgICAgICBwcm9jZXNzKHgsIGtleSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgZm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG4gICAgICBwcm9jZXNzKHVwZGF0ZVtrZXldLCBrZXkpO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGtleSBvZiBkZWxldGVNZSkge1xuICAgICAgZGVsZXRlIHVwZGF0ZVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gb3BzO1xuICB9XG5cbiAgLy8gUHJvY2Vzc2VzIHJlbGF0aW9uLXVwZGF0aW5nIG9wZXJhdGlvbnMgZnJvbSBhIFJFU1QtZm9ybWF0IHVwZGF0ZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIGFsbCB1cGRhdGVzIGhhdmUgYmVlbiBwZXJmb3JtZWRcbiAgaGFuZGxlUmVsYXRpb25VcGRhdGVzKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3RJZDogc3RyaW5nLCB1cGRhdGU6IGFueSwgb3BzOiBhbnkpIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2godGhpcy5hZGRSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZCkpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5fX29wID09ICdSZW1vdmVSZWxhdGlvbicpIHtcbiAgICAgICAgZm9yIChjb25zdCBvYmplY3Qgb2Ygb3Aub2JqZWN0cykge1xuICAgICAgICAgIHBlbmRpbmcucHVzaCh0aGlzLnJlbW92ZVJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBQcm9taXNlLmFsbChwZW5kaW5nKTtcbiAgfVxuXG4gIC8vIEFkZHMgYSByZWxhdGlvbi5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBhZGQgd2FzIHN1Y2Nlc3NmdWwuXG4gIGFkZFJlbGF0aW9uKGtleTogc3RyaW5nLCBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsIGZyb21JZDogc3RyaW5nLCB0b0lkOiBzdHJpbmcpIHtcbiAgICBjb25zdCBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cHNlcnRPbmVPYmplY3QoXG4gICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICBkb2MsXG4gICAgICBkb2MsXG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihrZXk6IHN0cmluZywgZnJvbUNsYXNzTmFtZTogc3RyaW5nLCBmcm9tSWQ6IHN0cmluZywgdG9JZDogc3RyaW5nKSB7XG4gICAgdmFyIGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICBkb2MsXG4gICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgJ2RlbGV0ZScpXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAnZGVsZXRlJyxcbiAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgIGlmIChhY2wpIHtcbiAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpO1xuICAgICAgICB9XG4gICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAvLyBJZiB0aGUgc2NoZW1hIGRvZXNuJ3QgZXhpc3QsIHByZXRlbmQgaXQgZXhpc3RzIHdpdGggbm8gZmllbGRzLiBUaGlzIGJlaGF2aW9yXG4gICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvblxuICAgICAgICAgICAgKVxuICAgICAgICAgIClcbiAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gSW5zZXJ0cyBhbiBvYmplY3QgaW50byB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgb2JqZWN0IHNhdmVkLlxuICBjcmVhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0OiBhbnksXG4gICAgeyBhY2wgfTogUXVlcnlPcHRpb25zID0ge30sXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBNYWtlIGEgY29weSBvZiB0aGUgb2JqZWN0LCBzbyB3ZSBkb24ndCBtdXRhdGUgdGhlIGluY29taW5nIGRhdGEuXG4gICAgY29uc3Qgb3JpZ2luYWxPYmplY3QgPSBvYmplY3Q7XG4gICAgb2JqZWN0ID0gdHJhbnNmb3JtT2JqZWN0QUNMKG9iamVjdCk7XG5cbiAgICBvYmplY3QuY3JlYXRlZEF0ID0geyBpc286IG9iamVjdC5jcmVhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG4gICAgb2JqZWN0LnVwZGF0ZWRBdCA9IHsgaXNvOiBvYmplY3QudXBkYXRlZEF0LCBfX3R5cGU6ICdEYXRlJyB9O1xuXG4gICAgdmFyIGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwID0gYWNsIHx8IFtdO1xuICAgIGNvbnN0IHJlbGF0aW9uVXBkYXRlcyA9IHRoaXMuY29sbGVjdFJlbGF0aW9uVXBkYXRlcyhjbGFzc05hbWUsIG51bGwsIG9iamVjdCk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsT2JqZWN0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgb2JqZWN0LFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLl9zYW5pdGl6ZURhdGFiYXNlUmVzdWx0KG9yaWdpbmFsT2JqZWN0LCByZXN1bHQub3BzWzBdKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfSk7XG4gIH1cblxuICBjYW5BZGRGaWVsZChcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgcnVuT3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNsYXNzU2NoZW1hID0gc2NoZW1hLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNsYXNzU2NoZW1hKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IGZpZWxkcyA9IE9iamVjdC5rZXlzKG9iamVjdCk7XG4gICAgY29uc3Qgc2NoZW1hRmllbGRzID0gT2JqZWN0LmtleXMoY2xhc3NTY2hlbWEuZmllbGRzKTtcbiAgICBjb25zdCBuZXdLZXlzID0gZmllbGRzLmZpbHRlcihmaWVsZCA9PiB7XG4gICAgICAvLyBTa2lwIGZpZWxkcyB0aGF0IGFyZSB1bnNldFxuICAgICAgaWYgKG9iamVjdFtmaWVsZF0gJiYgb2JqZWN0W2ZpZWxkXS5fX29wICYmIG9iamVjdFtmaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNjaGVtYUZpZWxkcy5pbmRleE9mKGdldFJvb3RGaWVsZE5hbWUoZmllbGQpKSA8IDA7XG4gICAgfSk7XG4gICAgaWYgKG5ld0tleXMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYWRkcyBhIG1hcmtlciB0aGF0IG5ldyBmaWVsZCBpcyBiZWluZyBhZGRpbmcgZHVyaW5nIHVwZGF0ZVxuICAgICAgcnVuT3B0aW9ucy5hZGRzRmllbGQgPSB0cnVlO1xuXG4gICAgICBjb25zdCBhY3Rpb24gPSBydW5PcHRpb25zLmFjdGlvbjtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcsIGFjdGlvbik7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIFdvbid0IGRlbGV0ZSBjb2xsZWN0aW9ucyBpbiB0aGUgc3lzdGVtIG5hbWVzcGFjZVxuICAvKipcbiAgICogRGVsZXRlIGFsbCBjbGFzc2VzIGFuZCBjbGVhcnMgdGhlIHNjaGVtYSBjYWNoZVxuICAgKlxuICAgKiBAcGFyYW0ge2Jvb2xlYW59IGZhc3Qgc2V0IHRvIHRydWUgaWYgaXQncyBvayB0byBqdXN0IGRlbGV0ZSByb3dzIGFuZCBub3QgaW5kZXhlc1xuICAgKiBAcmV0dXJucyB7UHJvbWlzZTx2b2lkPn0gd2hlbiB0aGUgZGVsZXRpb25zIGNvbXBsZXRlc1xuICAgKi9cbiAgZGVsZXRlRXZlcnl0aGluZyhmYXN0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPGFueT4ge1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZSA9IG51bGw7XG4gICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRlbGV0ZUFsbENsYXNzZXMoZmFzdCk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIHJlbGF0ZWQgaWRzIGdpdmVuIGFuIG93bmluZyBpZC5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIHJlbGF0ZWRJZHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAga2V5OiBzdHJpbmcsXG4gICAgb3duaW5nSWQ6IHN0cmluZyxcbiAgICBxdWVyeU9wdGlvbnM6IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPEFycmF5PHN0cmluZz4+IHtcbiAgICBjb25zdCB7IHNraXAsIGxpbWl0LCBzb3J0IH0gPSBxdWVyeU9wdGlvbnM7XG4gICAgY29uc3QgZmluZE9wdGlvbnMgPSB7fTtcbiAgICBpZiAoc29ydCAmJiBzb3J0LmNyZWF0ZWRBdCAmJiB0aGlzLmFkYXB0ZXIuY2FuU29ydE9uSm9pblRhYmxlcykge1xuICAgICAgZmluZE9wdGlvbnMuc29ydCA9IHsgX2lkOiBzb3J0LmNyZWF0ZWRBdCB9O1xuICAgICAgZmluZE9wdGlvbnMubGltaXQgPSBsaW1pdDtcbiAgICAgIGZpbmRPcHRpb25zLnNraXAgPSBza2lwO1xuICAgICAgcXVlcnlPcHRpb25zLnNraXAgPSAwO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSwgcmVsYXRpb25TY2hlbWEsIHsgb3duaW5nSWQgfSwgZmluZE9wdGlvbnMpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVsYXRlZElkKSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBsaXN0IG9mIG93bmluZyBpZHMgZ2l2ZW4gc29tZSByZWxhdGVkIGlkcy5cbiAgLy8gY2xhc3NOYW1lIGhlcmUgaXMgdGhlIG93bmluZyBjbGFzc05hbWUuXG4gIG93bmluZ0lkcyhjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcsIHJlbGF0ZWRJZHM6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgcmVsYXRlZElkOiB7ICRpbjogcmVsYXRlZElkcyB9IH0sXG4gICAgICAgIHsga2V5czogWydvd25pbmdJZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5vd25pbmdJZCkpO1xuICB9XG5cbiAgLy8gTW9kaWZpZXMgcXVlcnkgc28gdGhhdCBpdCBubyBsb25nZXIgaGFzICRpbiBvbiByZWxhdGlvbiBmaWVsZHMsIG9yXG4gIC8vIGVxdWFsLXRvLXBvaW50ZXIgY29uc3RyYWludHMgb24gcmVsYXRpb24gZmllbGRzLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZTogc3RyaW5nLCBxdWVyeTogYW55LCBzY2hlbWE6IGFueSk6IFByb21pc2U8YW55PiB7XG4gICAgLy8gU2VhcmNoIGZvciBhbiBpbi1yZWxhdGlvbiBvciBlcXVhbC10by1yZWxhdGlvblxuICAgIC8vIE1ha2UgaXQgc2VxdWVudGlhbCBmb3Igbm93LCBub3Qgc3VyZSBvZiBwYXJhbGxlaXphdGlvbiBzaWRlIGVmZmVjdHNcbiAgICBpZiAocXVlcnlbJyRvciddKSB7XG4gICAgICBjb25zdCBvcnMgPSBxdWVyeVsnJG9yJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIG9ycy5tYXAoKGFRdWVyeSwgaW5kZXgpID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgYVF1ZXJ5LCBzY2hlbWEpLnRoZW4oYVF1ZXJ5ID0+IHtcbiAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH0pXG4gICAgICApLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHF1ZXJ5KTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBpZiAocXVlcnlbJyRhbmQnXSkge1xuICAgICAgY29uc3QgYW5kcyA9IHF1ZXJ5WyckYW5kJ107XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIGFuZHMubWFwKChhUXVlcnksIGluZGV4KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlSW5SZWxhdGlvbihjbGFzc05hbWUsIGFRdWVyeSwgc2NoZW1hKS50aGVuKGFRdWVyeSA9PiB7XG4gICAgICAgICAgICBxdWVyeVsnJGFuZCddW2luZGV4XSA9IGFRdWVyeTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHF1ZXJ5T3B0aW9uczogYW55KTogP1Byb21pc2U8dm9pZD4ge1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgcXVlcnlbJyRvciddLm1hcChhUXVlcnkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZVJlbGF0aW9uS2V5cyhjbGFzc05hbWUsIGFRdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChxdWVyeVsnJGFuZCddKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgIHF1ZXJ5WyckYW5kJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gICAgdmFyIHJlbGF0ZWRUbyA9IHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgaWYgKHJlbGF0ZWRUbykge1xuICAgICAgcmV0dXJuIHRoaXMucmVsYXRlZElkcyhcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHJlbGF0ZWRUby5rZXksXG4gICAgICAgIHJlbGF0ZWRUby5vYmplY3Qub2JqZWN0SWQsXG4gICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgKVxuICAgICAgICAudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGRlbGV0ZSBxdWVyeVsnJHJlbGF0ZWRUbyddO1xuICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucyk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHt9KTtcbiAgICB9XG4gIH1cblxuICBhZGRJbk9iamVjdElkc0lkcyhpZHM6ID9BcnJheTxzdHJpbmc+ID0gbnVsbCwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGlkc0Zyb21TdHJpbmc6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZycgPyBbcXVlcnkub2JqZWN0SWRdIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tRXE6ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckZXEnXSA/IFtxdWVyeS5vYmplY3RJZFsnJGVxJ11dIDogbnVsbDtcbiAgICBjb25zdCBpZHNGcm9tSW46ID9BcnJheTxzdHJpbmc+ID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckaW4nXSA6IG51bGw7XG5cbiAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICBjb25zdCBhbGxJZHM6IEFycmF5PEFycmF5PHN0cmluZz4+ID0gW2lkc0Zyb21TdHJpbmcsIGlkc0Zyb21FcSwgaWRzRnJvbUluLCBpZHNdLmZpbHRlcihcbiAgICAgIGxpc3QgPT4gbGlzdCAhPT0gbnVsbFxuICAgICk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID0gcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA/IHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gOiBbXTtcbiAgICBsZXQgYWxsSWRzID0gWy4uLmlkc0Zyb21OaW4sIC4uLmlkc10uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG5cbiAgICAvLyBtYWtlIGEgc2V0IGFuZCBzcHJlYWQgdG8gcmVtb3ZlIGR1cGxpY2F0ZXNcbiAgICBhbGxJZHMgPSBbLi4ubmV3IFNldChhbGxJZHMpXTtcblxuICAgIC8vIE5lZWQgdG8gbWFrZSBzdXJlIHdlIGRvbid0IGNsb2JiZXIgZXhpc3Rpbmcgc2hvcnRoYW5kICRlcSBjb25zdHJhaW50cyBvbiBvYmplY3RJZC5cbiAgICBpZiAoISgnb2JqZWN0SWQnIGluIHF1ZXJ5KSkge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJG5pbjogdW5kZWZpbmVkLFxuICAgICAgICAkZXE6IHF1ZXJ5Lm9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBxdWVyeS5vYmplY3RJZFsnJG5pbiddID0gYWxsSWRzO1xuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIFJ1bnMgYSBxdWVyeSBvbiB0aGUgZGF0YWJhc2UuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYSBsaXN0IG9mIGl0ZW1zLlxuICAvLyBPcHRpb25zOlxuICAvLyAgIHNraXAgICAgbnVtYmVyIG9mIHJlc3VsdHMgdG8gc2tpcC5cbiAgLy8gICBsaW1pdCAgIGxpbWl0IHRvIHRoaXMgbnVtYmVyIG9mIHJlc3VsdHMuXG4gIC8vICAgc29ydCAgICBhbiBvYmplY3Qgd2hlcmUga2V5cyBhcmUgdGhlIGZpZWxkcyB0byBzb3J0IGJ5LlxuICAvLyAgICAgICAgICAgdGhlIHZhbHVlIGlzICsxIGZvciBhc2NlbmRpbmcsIC0xIGZvciBkZXNjZW5kaW5nLlxuICAvLyAgIGNvdW50ICAgcnVuIGEgY291bnQgaW5zdGVhZCBvZiByZXR1cm5pbmcgcmVzdWx0cy5cbiAgLy8gICBhY2wgICAgIHJlc3RyaWN0IHRoaXMgb3BlcmF0aW9uIHdpdGggYW4gQUNMIGZvciB0aGUgcHJvdmlkZWQgYXJyYXlcbiAgLy8gICAgICAgICAgIG9mIHVzZXIgb2JqZWN0SWRzIGFuZCByb2xlcy4gYWNsOiBudWxsIG1lYW5zIG5vIHVzZXIuXG4gIC8vICAgICAgICAgICB3aGVuIHRoaXMgZmllbGQgaXMgbm90IHByZXNlbnQsIGRvbid0IGRvIGFueXRoaW5nIHJlZ2FyZGluZyBBQ0xzLlxuICAvLyAgY2FzZUluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICAgIGNhc2VJbnNlbnNpdGl2ZSA9IGZhbHNlLFxuICAgICAgZXhwbGFpbixcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgb3AgPVxuICAgICAgb3AgfHwgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxID8gJ2dldCcgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAvL0FsbG93IHZvbGF0aWxlIGNsYXNzZXMgaWYgcXVlcnlpbmcgd2l0aCBNYXN0ZXIgKGZvciBfUHVzaFN0YXR1cylcbiAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAvL3RoYXQgYXBpLnBhcnNlLmNvbSBicmVha3Mgd2hlbiBfUHVzaFN0YXR1cyBleGlzdHMgaW4gbW9uZ28uXG4gICAgICByZXR1cm4gc2NoZW1hQ29udHJvbGxlclxuICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgLy8gQmVoYXZpb3IgZm9yIG5vbi1leGlzdGVudCBjbGFzc2VzIGlzIGtpbmRhIHdlaXJkIG9uIFBhcnNlLmNvbS4gUHJvYmFibHkgZG9lc24ndCBtYXR0ZXIgdG9vIG11Y2guXG4gICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY2xhc3NFeGlzdHMgPSBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgLy8gUGFyc2UuY29tIHRyZWF0cyBxdWVyaWVzIG9uIF9jcmVhdGVkX2F0IGFuZCBfdXBkYXRlZF9hdCBhcyBpZiB0aGV5IHdlcmUgcXVlcmllcyBvbiBjcmVhdGVkQXQgYW5kIHVwZGF0ZWRBdCxcbiAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgIC8vIHVzZSB0aGUgb25lIHRoYXQgYXBwZWFycyBmaXJzdCBpbiB0aGUgc29ydCBsaXN0LlxuICAgICAgICAgIGlmIChzb3J0Ll9jcmVhdGVkX2F0KSB7XG4gICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICBkZWxldGUgc29ydC5fY3JlYXRlZF9hdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgIHNvcnQudXBkYXRlZEF0ID0gc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBxdWVyeU9wdGlvbnMgPSB7XG4gICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAga2V5cyxcbiAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgaGludCxcbiAgICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYENhbm5vdCBzb3J0IGJ5ICR7ZmllbGROYW1lfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc3Qgcm9vdEZpZWxkTmFtZSA9IGdldFJvb3RGaWVsZE5hbWUoZmllbGROYW1lKTtcbiAgICAgICAgICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5maWVsZE5hbWVJc1ZhbGlkKHJvb3RGaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm4gKGlzTWFzdGVyXG4gICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wKVxuICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgcXVlcnksIHF1ZXJ5T3B0aW9ucykpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hQ29udHJvbGxlcikpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgLyogRG9uJ3QgdXNlIHByb2plY3Rpb25zIHRvIG9wdGltaXplIHRoZSBwcm90ZWN0ZWRGaWVsZHMgc2luY2UgdGhlIHByb3RlY3RlZEZpZWxkc1xuICAgICAgICAgICAgICAgICAgYmFzZWQgb24gcG9pbnRlci1wZXJtaXNzaW9ucyBhcmUgZGV0ZXJtaW5lZCBhZnRlciBxdWVyeWluZy4gVGhlIGZpbHRlcmluZyBjYW5cbiAgICAgICAgICAgICAgICAgIG92ZXJ3cml0ZSB0aGUgcHJvdGVjdGVkIGZpZWxkcy4gKi9cbiAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgIGFjbEdyb3VwLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5T3B0aW9uc1xuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wID09PSAndXBkYXRlJyB8fCBvcCA9PT0gJ2RlbGV0ZScpIHtcbiAgICAgICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSBhZGRSZWFkQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHZhbGlkYXRlUXVlcnkocXVlcnkpO1xuICAgICAgICAgICAgICBpZiAoY291bnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgICAgICAgICAgICBoaW50XG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgIGlmICghY2xhc3NFeGlzdHMpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5kaXN0aW5jdChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIGRpc3RpbmN0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSBpZiAocGlwZWxpbmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICAgICAgICBleHBsYWluXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgIC50aGVuKG9iamVjdHMgPT5cbiAgICAgICAgICAgICAgICAgICAgb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBmaWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICAgICAgICAgICAgaXNNYXN0ZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjaGVtYUNvbnRyb2xsZXIsXG4gICAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGRlbGV0ZVNjaGVtYShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGxldCBzY2hlbWFDb250cm9sbGVyO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEoeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAudGhlbihzID0+IHtcbiAgICAgICAgc2NoZW1hQ29udHJvbGxlciA9IHM7XG4gICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLmNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgU2NoZW1hQ2FjaGUuZGVsKGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXIucmVsb2FkRGF0YSgpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gVGhpcyBoZWxwcyB0byBjcmVhdGUgaW50ZXJtZWRpYXRlIG9iamVjdHMgZm9yIHNpbXBsZXIgY29tcGFyaXNvbiBvZlxuICAvLyBrZXkgdmFsdWUgcGFpcnMgdXNlZCBpbiBxdWVyeSBvYmplY3RzLiBFYWNoIGtleSB2YWx1ZSBwYWlyIHdpbGwgcmVwcmVzZW50ZWRcbiAgLy8gaW4gYSBzaW1pbGFyIHdheSB0byBqc29uXG4gIG9iamVjdFRvRW50cmllc1N0cmluZ3MocXVlcnk6IGFueSk6IEFycmF5PHN0cmluZz4ge1xuICAgIHJldHVybiBPYmplY3QuZW50cmllcyhxdWVyeSkubWFwKGEgPT4gYS5tYXAocyA9PiBKU09OLnN0cmluZ2lmeShzKSkuam9pbignOicpKTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIE9SIG9wZXJhdGlvbnMgbWVhbnQgdG8gYmUgdXNlZCBvbmx5IGZvciBwb2ludGVyIHBlcm1pc3Npb25zLlxuICByZWR1Y2VPck9wZXJhdGlvbihxdWVyeTogeyAkb3I6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kb3IpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcXVlcmllcyA9IHF1ZXJ5LiRvci5tYXAocSA9PiB0aGlzLm9iamVjdFRvRW50cmllc1N0cmluZ3MocSkpO1xuICAgIGxldCByZXBlYXQgPSBmYWxzZTtcbiAgICBkbyB7XG4gICAgICByZXBlYXQgPSBmYWxzZTtcbiAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVlcmllcy5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgcXVlcmllcy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGNvbnN0IFtzaG9ydGVyLCBsb25nZXJdID0gcXVlcmllc1tpXS5sZW5ndGggPiBxdWVyaWVzW2pdLmxlbmd0aCA/IFtqLCBpXSA6IFtpLCBqXTtcbiAgICAgICAgICBjb25zdCBmb3VuZEVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLnJlZHVjZShcbiAgICAgICAgICAgIChhY2MsIGVudHJ5KSA9PiBhY2MgKyAocXVlcmllc1tsb25nZXJdLmluY2x1ZGVzKGVudHJ5KSA/IDEgOiAwKSxcbiAgICAgICAgICAgIDBcbiAgICAgICAgICApO1xuICAgICAgICAgIGNvbnN0IHNob3J0ZXJFbnRyaWVzID0gcXVlcmllc1tzaG9ydGVyXS5sZW5ndGg7XG4gICAgICAgICAgaWYgKGZvdW5kRW50cmllcyA9PT0gc2hvcnRlckVudHJpZXMpIHtcbiAgICAgICAgICAgIC8vIElmIHRoZSBzaG9ydGVyIHF1ZXJ5IGlzIGNvbXBsZXRlbHkgY29udGFpbmVkIGluIHRoZSBsb25nZXIgb25lLCB3ZSBjYW4gc3RyaWtlXG4gICAgICAgICAgICAvLyBvdXQgdGhlIGxvbmdlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRvci5zcGxpY2UobG9uZ2VyLCAxKTtcbiAgICAgICAgICAgIHF1ZXJpZXMuc3BsaWNlKGxvbmdlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJG9yLmxlbmd0aCA9PT0gMSkge1xuICAgICAgcXVlcnkgPSB7IC4uLnF1ZXJ5LCAuLi5xdWVyeS4kb3JbMF0gfTtcbiAgICAgIGRlbGV0ZSBxdWVyeS4kb3I7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIE5haXZlIGxvZ2ljIHJlZHVjZXIgZm9yIEFORCBvcGVyYXRpb25zIG1lYW50IHRvIGJlIHVzZWQgb25seSBmb3IgcG9pbnRlciBwZXJtaXNzaW9ucy5cbiAgcmVkdWNlQW5kT3BlcmF0aW9uKHF1ZXJ5OiB7ICRhbmQ6IEFycmF5PGFueT4gfSk6IGFueSB7XG4gICAgaWYgKCFxdWVyeS4kYW5kKSB7XG4gICAgICByZXR1cm4gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHF1ZXJpZXMgPSBxdWVyeS4kYW5kLm1hcChxID0+IHRoaXMub2JqZWN0VG9FbnRyaWVzU3RyaW5ncyhxKSk7XG4gICAgbGV0IHJlcGVhdCA9IGZhbHNlO1xuICAgIGRvIHtcbiAgICAgIHJlcGVhdCA9IGZhbHNlO1xuICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWVyaWVzLmxlbmd0aCAtIDE7IGkrKykge1xuICAgICAgICBmb3IgKGxldCBqID0gaSArIDE7IGogPCBxdWVyaWVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgY29uc3QgW3Nob3J0ZXIsIGxvbmdlcl0gPSBxdWVyaWVzW2ldLmxlbmd0aCA+IHF1ZXJpZXNbal0ubGVuZ3RoID8gW2osIGldIDogW2ksIGpdO1xuICAgICAgICAgIGNvbnN0IGZvdW5kRW50cmllcyA9IHF1ZXJpZXNbc2hvcnRlcl0ucmVkdWNlKFxuICAgICAgICAgICAgKGFjYywgZW50cnkpID0+IGFjYyArIChxdWVyaWVzW2xvbmdlcl0uaW5jbHVkZXMoZW50cnkpID8gMSA6IDApLFxuICAgICAgICAgICAgMFxuICAgICAgICAgICk7XG4gICAgICAgICAgY29uc3Qgc2hvcnRlckVudHJpZXMgPSBxdWVyaWVzW3Nob3J0ZXJdLmxlbmd0aDtcbiAgICAgICAgICBpZiAoZm91bmRFbnRyaWVzID09PSBzaG9ydGVyRW50cmllcykge1xuICAgICAgICAgICAgLy8gSWYgdGhlIHNob3J0ZXIgcXVlcnkgaXMgY29tcGxldGVseSBjb250YWluZWQgaW4gdGhlIGxvbmdlciBvbmUsIHdlIGNhbiBzdHJpa2VcbiAgICAgICAgICAgIC8vIG91dCB0aGUgc2hvcnRlciBxdWVyeS5cbiAgICAgICAgICAgIHF1ZXJ5LiRhbmQuc3BsaWNlKHNob3J0ZXIsIDEpO1xuICAgICAgICAgICAgcXVlcmllcy5zcGxpY2Uoc2hvcnRlciwgMSk7XG4gICAgICAgICAgICByZXBlYXQgPSB0cnVlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSB3aGlsZSAocmVwZWF0KTtcbiAgICBpZiAocXVlcnkuJGFuZC5sZW5ndGggPT09IDEpIHtcbiAgICAgIHF1ZXJ5ID0geyAuLi5xdWVyeSwgLi4ucXVlcnkuJGFuZFswXSB9O1xuICAgICAgZGVsZXRlIHF1ZXJ5LiRhbmQ7XG4gICAgfVxuICAgIHJldHVybiBxdWVyeTtcbiAgfVxuXG4gIC8vIENvbnN0cmFpbnRzIHF1ZXJ5IHVzaW5nIENMUCdzIHBvaW50ZXIgcGVybWlzc2lvbnMgKFBQKSBpZiBhbnkuXG4gIC8vIDEuIEV0cmFjdCB0aGUgdXNlciBpZCBmcm9tIGNhbGxlcidzIEFDTGdyb3VwO1xuICAvLyAyLiBFeGN0cmFjdCBhIGxpc3Qgb2YgZmllbGQgbmFtZXMgdGhhdCBhcmUgUFAgZm9yIHRhcmdldCBjb2xsZWN0aW9uIGFuZCBvcGVyYXRpb247XG4gIC8vIDMuIENvbnN0cmFpbnQgdGhlIG9yaWdpbmFsIHF1ZXJ5IHNvIHRoYXQgZWFjaCBQUCBmaWVsZCBtdXN0XG4gIC8vIHBvaW50IHRvIGNhbGxlcidzIGlkIChvciBjb250YWluIGl0IGluIGNhc2Ugb2YgUFAgZmllbGQgYmVpbmcgYW4gYXJyYXkpXG4gIGFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIGFjbEdyb3VwOiBhbnlbXSA9IFtdXG4gICk6IGFueSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG5cbiAgICBjb25zdCB1c2VyQUNMID0gYWNsR3JvdXAuZmlsdGVyKGFjbCA9PiB7XG4gICAgICByZXR1cm4gYWNsLmluZGV4T2YoJ3JvbGU6JykgIT0gMCAmJiBhY2wgIT0gJyonO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZ3JvdXBLZXkgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgY29uc3QgcGVybUZpZWxkcyA9IFtdO1xuXG4gICAgaWYgKHBlcm1zW29wZXJhdGlvbl0gJiYgcGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKSB7XG4gICAgICBwZXJtRmllbGRzLnB1c2goLi4ucGVybXNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzKTtcbiAgICB9XG5cbiAgICBpZiAocGVybXNbZ3JvdXBLZXldKSB7XG4gICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHBlcm1zW2dyb3VwS2V5XSkge1xuICAgICAgICBpZiAoIXBlcm1GaWVsZHMuaW5jbHVkZXMoZmllbGQpKSB7XG4gICAgICAgICAgcGVybUZpZWxkcy5wdXNoKGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICAvLyB0aGUgQUNMIHNob3VsZCBoYXZlIGV4YWN0bHkgMSB1c2VyXG4gICAgaWYgKHBlcm1GaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgICAgLy8gTm8gdXNlciBzZXQgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgLy8gSWYgdGhlIGxlbmd0aCBpcyA+IDEsIHRoYXQgbWVhbnMgd2UgZGlkbid0IGRlLWR1cGUgdXNlcnMgY29ycmVjdGx5XG4gICAgICBpZiAodXNlckFDTC5sZW5ndGggIT0gMSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCB1c2VySWQgPSB1c2VyQUNMWzBdO1xuICAgICAgY29uc3QgdXNlclBvaW50ZXIgPSB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgICB9O1xuXG4gICAgICBjb25zdCBxdWVyaWVzID0gcGVybUZpZWxkcy5tYXAoa2V5ID0+IHtcbiAgICAgICAgY29uc3QgZmllbGREZXNjcmlwdG9yID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9XG4gICAgICAgICAgZmllbGREZXNjcmlwdG9yICYmXG4gICAgICAgICAgdHlwZW9mIGZpZWxkRGVzY3JpcHRvciA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgICBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGREZXNjcmlwdG9yLCAndHlwZScpXG4gICAgICAgICAgICA/IGZpZWxkRGVzY3JpcHRvci50eXBlXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgbGV0IHF1ZXJ5Q2xhdXNlO1xuXG4gICAgICAgIGlmIChmaWVsZFR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHNpbmdsZSBwb2ludGVyIHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB1c2VyUG9pbnRlciB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ0FycmF5Jykge1xuICAgICAgICAgIC8vIGNvbnN0cmFpbnQgZm9yIHVzZXJzLWFycmF5IHNldHVwXG4gICAgICAgICAgcXVlcnlDbGF1c2UgPSB7IFtrZXldOiB7ICRhbGw6IFt1c2VyUG9pbnRlcl0gfSB9O1xuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZSA9PT0gJ09iamVjdCcpIHtcbiAgICAgICAgICAvLyBjb25zdHJhaW50IGZvciBvYmplY3Qgc2V0dXBcbiAgICAgICAgICBxdWVyeUNsYXVzZSA9IHsgW2tleV06IHVzZXJQb2ludGVyIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGF0IHRoZXJlIGlzIGEgQ0xQIGZpZWxkIG9mIGFuIHVuZXhwZWN0ZWQgdHlwZS4gVGhpcyBjb25kaXRpb24gc2hvdWxkIG5vdCBoYXBwZW4sIHdoaWNoIGlzXG4gICAgICAgICAgLy8gd2h5IGlzIGJlaW5nIHRyZWF0ZWQgYXMgYW4gZXJyb3IuXG4gICAgICAgICAgdGhyb3cgRXJyb3IoXG4gICAgICAgICAgICBgQW4gdW5leHBlY3RlZCBjb25kaXRpb24gb2NjdXJyZWQgd2hlbiByZXNvbHZpbmcgcG9pbnRlciBwZXJtaXNzaW9uczogJHtjbGFzc05hbWV9ICR7a2V5fWBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIGlmIHdlIGFscmVhZHkgaGF2ZSBhIGNvbnN0cmFpbnQgb24gdGhlIGtleSwgdXNlIHRoZSAkYW5kXG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocXVlcnksIGtleSkpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VBbmRPcGVyYXRpb24oeyAkYW5kOiBbcXVlcnlDbGF1c2UsIHF1ZXJ5XSB9KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHF1ZXJ5Q2xhdXNlKTtcbiAgICAgIH0pO1xuXG4gICAgICByZXR1cm4gcXVlcmllcy5sZW5ndGggPT09IDEgPyBxdWVyaWVzWzBdIDogdGhpcy5yZWR1Y2VPck9wZXJhdGlvbih7ICRvcjogcXVlcmllcyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlciB8IGFueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge30sXG4gICAgcXVlcnlPcHRpb25zOiBGdWxsUXVlcnlPcHRpb25zID0ge31cbiAgKTogbnVsbCB8IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwZXJtcyA9XG4gICAgICBzY2hlbWEgJiYgc2NoZW1hLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9uc1xuICAgICAgICA/IHNjaGVtYS5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKVxuICAgICAgICA6IHNjaGVtYTtcbiAgICBpZiAoIXBlcm1zKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IHBlcm1zLnByb3RlY3RlZEZpZWxkcztcbiAgICBpZiAoIXByb3RlY3RlZEZpZWxkcykgcmV0dXJuIG51bGw7XG5cbiAgICBpZiAoYWNsR3JvdXAuaW5kZXhPZihxdWVyeS5vYmplY3RJZCkgPiAtMSkgcmV0dXJuIG51bGw7XG5cbiAgICAvLyBmb3IgcXVlcmllcyB3aGVyZSBcImtleXNcIiBhcmUgc2V0IGFuZCBkbyBub3QgaW5jbHVkZSBhbGwgJ3VzZXJGaWVsZCc6e2ZpZWxkfSxcbiAgICAvLyB3ZSBoYXZlIHRvIHRyYW5zcGFyZW50bHkgaW5jbHVkZSBpdCwgYW5kIHRoZW4gcmVtb3ZlIGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50XG4gICAgLy8gQmVjYXVzZSBpZiBzdWNoIGtleSBub3QgcHJvamVjdGVkIHRoZSBwZXJtaXNzaW9uIHdvbid0IGJlIGVuZm9yY2VkIHByb3Blcmx5XG4gICAgLy8gUFMgdGhpcyBpcyBjYWxsZWQgd2hlbiAnZXhjbHVkZUtleXMnIGFscmVhZHkgcmVkdWNlZCB0byAna2V5cydcbiAgICBjb25zdCBwcmVzZXJ2ZUtleXMgPSBxdWVyeU9wdGlvbnMua2V5cztcblxuICAgIC8vIHRoZXNlIGFyZSBrZXlzIHRoYXQgbmVlZCB0byBiZSBpbmNsdWRlZCBvbmx5XG4gICAgLy8gdG8gYmUgYWJsZSB0byBhcHBseSBwcm90ZWN0ZWRGaWVsZHMgYnkgcG9pbnRlclxuICAgIC8vIGFuZCB0aGVuIHVuc2V0IGJlZm9yZSByZXR1cm5pbmcgdG8gY2xpZW50IChsYXRlciBpbiAgZmlsdGVyU2Vuc2l0aXZlRmllbGRzKVxuICAgIGNvbnN0IHNlcnZlck9ubHlLZXlzID0gW107XG5cbiAgICBjb25zdCBhdXRoZW50aWNhdGVkID0gYXV0aC51c2VyO1xuXG4gICAgLy8gbWFwIHRvIGFsbG93IGNoZWNrIHdpdGhvdXQgYXJyYXkgc2VhcmNoXG4gICAgY29uc3Qgcm9sZXMgPSAoYXV0aC51c2VyUm9sZXMgfHwgW10pLnJlZHVjZSgoYWNjLCByKSA9PiB7XG4gICAgICBhY2Nbcl0gPSBwcm90ZWN0ZWRGaWVsZHNbcl07XG4gICAgICByZXR1cm4gYWNjO1xuICAgIH0sIHt9KTtcblxuICAgIC8vIGFycmF5IG9mIHNldHMgb2YgcHJvdGVjdGVkIGZpZWxkcy4gc2VwYXJhdGUgaXRlbSBmb3IgZWFjaCBhcHBsaWNhYmxlIGNyaXRlcmlhXG4gICAgY29uc3QgcHJvdGVjdGVkS2V5c1NldHMgPSBbXTtcblxuICAgIGZvciAoY29uc3Qga2V5IGluIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgLy8gc2tpcCB1c2VyRmllbGRzXG4gICAgICBpZiAoa2V5LnN0YXJ0c1dpdGgoJ3VzZXJGaWVsZDonKSkge1xuICAgICAgICBpZiAocHJlc2VydmVLZXlzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGROYW1lID0ga2V5LnN1YnN0cmluZygxMCk7XG4gICAgICAgICAgaWYgKCFwcmVzZXJ2ZUtleXMuaW5jbHVkZXMoZmllbGROYW1lKSkge1xuICAgICAgICAgICAgLy8gMS4gcHV0IGl0IHRoZXJlIHRlbXBvcmFyaWx5XG4gICAgICAgICAgICBxdWVyeU9wdGlvbnMua2V5cyAmJiBxdWVyeU9wdGlvbnMua2V5cy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAvLyAyLiBwcmVzZXJ2ZSBpdCBkZWxldGUgbGF0ZXJcbiAgICAgICAgICAgIHNlcnZlck9ubHlLZXlzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIGFkZCBwdWJsaWMgdGllclxuICAgICAgaWYgKGtleSA9PT0gJyonKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKGF1dGhlbnRpY2F0ZWQpIHtcbiAgICAgICAgaWYgKGtleSA9PT0gJ2F1dGhlbnRpY2F0ZWQnKSB7XG4gICAgICAgICAgLy8gZm9yIGxvZ2dlZCBpbiB1c2Vyc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocHJvdGVjdGVkRmllbGRzW2tleV0pO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvbGVzW2tleV0gJiYga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpIHtcbiAgICAgICAgICAvLyBhZGQgYXBwbGljYWJsZSByb2xlc1xuICAgICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocm9sZXNba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjaGVjayBpZiB0aGVyZSdzIGEgcnVsZSBmb3IgY3VycmVudCB1c2VyJ3MgaWRcbiAgICBpZiAoYXV0aGVudGljYXRlZCkge1xuICAgICAgY29uc3QgdXNlcklkID0gYXV0aC51c2VyLmlkO1xuICAgICAgaWYgKHBlcm1zLnByb3RlY3RlZEZpZWxkc1t1c2VySWRdKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXNTZXRzLnB1c2gocGVybXMucHJvdGVjdGVkRmllbGRzW3VzZXJJZF0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIHByZXNlcnZlIGZpZWxkcyB0byBiZSByZW1vdmVkIGJlZm9yZSBzZW5kaW5nIHJlc3BvbnNlIHRvIGNsaWVudFxuICAgIGlmIChzZXJ2ZXJPbmx5S2V5cy5sZW5ndGggPiAwKSB7XG4gICAgICBwZXJtcy5wcm90ZWN0ZWRGaWVsZHMudGVtcG9yYXJ5S2V5cyA9IHNlcnZlck9ubHlLZXlzO1xuICAgIH1cblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5c1NldHMucmVkdWNlKChhY2MsIG5leHQpID0+IHtcbiAgICAgIGlmIChuZXh0KSB7XG4gICAgICAgIGFjYy5wdXNoKC4uLm5leHQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCBbXSk7XG5cbiAgICAvLyBpbnRlcnNlY3QgYWxsIHNldHMgb2YgcHJvdGVjdGVkRmllbGRzXG4gICAgcHJvdGVjdGVkS2V5c1NldHMuZm9yRWFjaChmaWVsZHMgPT4ge1xuICAgICAgaWYgKGZpZWxkcykge1xuICAgICAgICBwcm90ZWN0ZWRLZXlzID0gcHJvdGVjdGVkS2V5cy5maWx0ZXIodiA9PiBmaWVsZHMuaW5jbHVkZXModikpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHByb3RlY3RlZEtleXM7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNyZWF0ZVRyYW5zYWN0aW9uYWxTZXNzaW9uKCkudGhlbih0cmFuc2FjdGlvbmFsU2Vzc2lvbiA9PiB7XG4gICAgICB0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbiA9IHRyYW5zYWN0aW9uYWxTZXNzaW9uO1xuICAgIH0pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24oKSB7XG4gICAgaWYgKCF0aGlzLl90cmFuc2FjdGlvbmFsU2Vzc2lvbikge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGVyZSBpcyBubyB0cmFuc2FjdGlvbmFsIHNlc3Npb24gdG8gY29tbWl0Jyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbigpIHtcbiAgICBpZiAoIXRoaXMuX3RyYW5zYWN0aW9uYWxTZXNzaW9uKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZXJlIGlzIG5vIHRyYW5zYWN0aW9uYWwgc2Vzc2lvbiB0byBhYm9ydCcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmFib3J0VHJhbnNhY3Rpb25hbFNlc3Npb24odGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24pLnRoZW4oKCkgPT4ge1xuICAgICAgdGhpcy5fdHJhbnNhY3Rpb25hbFNlc3Npb24gPSBudWxsO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gVE9ETzogY3JlYXRlIGluZGV4ZXMgb24gZmlyc3QgY3JlYXRpb24gb2YgYSBfVXNlciBvYmplY3QuIE90aGVyd2lzZSBpdCdzIGltcG9zc2libGUgdG9cbiAgLy8gaGF2ZSBhIFBhcnNlIGFwcCB3aXRob3V0IGl0IGhhdmluZyBhIF9Vc2VyIGNvbGxlY3Rpb24uXG4gIGFzeW5jIHBlcmZvcm1Jbml0aWFsaXphdGlvbigpIHtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKHtcbiAgICAgIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXM6IFNjaGVtYUNvbnRyb2xsZXIuVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgICB9KTtcbiAgICBjb25zdCByZXF1aXJlZFVzZXJGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fVXNlcixcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZFJvbGVGaWVsZHMgPSB7XG4gICAgICBmaWVsZHM6IHtcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgICAgLi4uU2NoZW1hQ29udHJvbGxlci5kZWZhdWx0Q29sdW1ucy5fUm9sZSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBjb25zdCByZXF1aXJlZElkZW1wb3RlbmN5RmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgICAgfSxcbiAgICB9O1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Sb2xlJykpO1xuICAgIGF3YWl0IHRoaXMubG9hZFNjaGVtYSgpLnRoZW4oc2NoZW1hID0+IHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19JZGVtcG90ZW5jeScpKTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlci5lbnN1cmVVbmlxdWVuZXNzKCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWyd1c2VybmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VybmFtZXM6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlSW5kZXgoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ3VzZXJuYW1lJ10sICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJywgdHJ1ZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gY3JlYXRlIGNhc2UgaW5zZW5zaXRpdmUgdXNlcm5hbWUgaW5kZXg6ICcsIGVycm9yKTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXJcbiAgICAgIC5lbnN1cmVJbmRleCgnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSwgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLCB0cnVlKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBjcmVhdGUgY2FzZSBpbnNlbnNpdGl2ZSB1c2VybmFtZSBpbmRleDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXIgZW1haWwgYWRkcmVzc2VzOiAnLCBlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9KTtcblxuICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgLmVuc3VyZUluZGV4KCdfVXNlcicsIHJlcXVpcmVkVXNlckZpZWxkcywgWydlbWFpbCddLCAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsIHRydWUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBjYXNlIGluc2Vuc2l0aXZlIGVtYWlsIGluZGV4OiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciByb2xlIG5hbWU6ICcsIGVycm9yKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH0pO1xuXG4gICAgYXdhaXQgdGhpcy5hZGFwdGVyXG4gICAgICAuZW5zdXJlVW5pcXVlbmVzcygnX0lkZW1wb3RlbmN5JywgcmVxdWlyZWRJZGVtcG90ZW5jeUZpZWxkcywgWydyZXFJZCddKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3IgaWRlbXBvdGVuY3kgcmVxdWVzdCBJRDogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgaXNNb25nb0FkYXB0ZXIgPSB0aGlzLmFkYXB0ZXIgaW5zdGFuY2VvZiBNb25nb1N0b3JhZ2VBZGFwdGVyO1xuICAgIGNvbnN0IGlzUG9zdGdyZXNBZGFwdGVyID0gdGhpcy5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlcjtcbiAgICBpZiAoaXNNb25nb0FkYXB0ZXIgfHwgaXNQb3N0Z3Jlc0FkYXB0ZXIpIHtcbiAgICAgIGxldCBvcHRpb25zID0ge307XG4gICAgICBpZiAoaXNNb25nb0FkYXB0ZXIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHtcbiAgICAgICAgICB0dGw6IDAsXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKGlzUG9zdGdyZXNBZGFwdGVyKSB7XG4gICAgICAgIG9wdGlvbnMgPSB0aGlzLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgICAgICAgb3B0aW9ucy5zZXRJZGVtcG90ZW5jeUZ1bmN0aW9uID0gdHJ1ZTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHRoaXMuYWRhcHRlclxuICAgICAgICAuZW5zdXJlSW5kZXgoJ19JZGVtcG90ZW5jeScsIHJlcXVpcmVkSWRlbXBvdGVuY3lGaWVsZHMsIFsnZXhwaXJlJ10sICd0dGwnLCBmYWxzZSwgb3B0aW9ucylcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICBsb2dnZXIud2FybignVW5hYmxlIHRvIGNyZWF0ZSBUVEwgaW5kZXggZm9yIGlkZW1wb3RlbmN5IGV4cGlyZSBkYXRlOiAnLCBlcnJvcik7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcbiAgfVxuXG4gIF9leHBhbmRSZXN1bHRPbktleVBhdGgob2JqZWN0OiBhbnksIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICAgIG9iamVjdFtrZXldID0gdmFsdWVba2V5XTtcbiAgICAgIHJldHVybiBvYmplY3Q7XG4gICAgfVxuICAgIGNvbnN0IHBhdGggPSBrZXkuc3BsaXQoJy4nKTtcbiAgICBjb25zdCBmaXJzdEtleSA9IHBhdGhbMF07XG4gICAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcblxuICAgIC8vIFNjYW4gcmVxdWVzdCBkYXRhIGZvciBkZW5pZWQga2V5d29yZHNcbiAgICBpZiAodGhpcy5vcHRpb25zICYmIHRoaXMub3B0aW9ucy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgICBmb3IgKGNvbnN0IGtleXdvcmQgb2YgdGhpcy5vcHRpb25zLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBVdGlscy5vYmplY3RDb250YWluc0tleVZhbHVlKHsgZmlyc3RLZXk6IHVuZGVmaW5lZCB9LCBrZXl3b3JkLmtleSwgdW5kZWZpbmVkKTtcbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIG9iamVjdFtmaXJzdEtleV0gPSB0aGlzLl9leHBhbmRSZXN1bHRPbktleVBhdGgoXG4gICAgICBvYmplY3RbZmlyc3RLZXldIHx8IHt9LFxuICAgICAgbmV4dFBhdGgsXG4gICAgICB2YWx1ZVtmaXJzdEtleV1cbiAgICApO1xuICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG5cbiAgX3Nhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3Q6IGFueSwgcmVzdWx0OiBhbnkpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHJlc3BvbnNlID0ge307XG4gICAgaWYgKCFyZXN1bHQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzcG9uc2UpO1xuICAgIH1cbiAgICBPYmplY3Qua2V5cyhvcmlnaW5hbE9iamVjdCkuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgY29uc3Qga2V5VXBkYXRlID0gb3JpZ2luYWxPYmplY3Rba2V5XTtcbiAgICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgICAgaWYgKFxuICAgICAgICBrZXlVcGRhdGUgJiZcbiAgICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAga2V5VXBkYXRlLl9fb3AgJiZcbiAgICAgICAgWydBZGQnLCAnQWRkVW5pcXVlJywgJ1JlbW92ZScsICdJbmNyZW1lbnQnXS5pbmRleE9mKGtleVVwZGF0ZS5fX29wKSA+IC0xXG4gICAgICApIHtcbiAgICAgICAgLy8gb25seSB2YWxpZCBvcHMgdGhhdCBwcm9kdWNlIGFuIGFjdGlvbmFibGUgcmVzdWx0XG4gICAgICAgIC8vIHRoZSBvcCBtYXkgaGF2ZSBoYXBwZW5lZCBvbiBhIGtleXBhdGhcbiAgICAgICAgdGhpcy5fZXhwYW5kUmVzdWx0T25LZXlQYXRoKHJlc3BvbnNlLCBrZXksIHJlc3VsdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gIH1cblxuICBzdGF0aWMgX3ZhbGlkYXRlUXVlcnk6IGFueSA9PiB2b2lkO1xuICBzdGF0aWMgZmlsdGVyU2Vuc2l0aXZlRGF0YTogKGJvb2xlYW4sIGFueVtdLCBhbnksIGFueSwgYW55LCBzdHJpbmcsIGFueVtdLCBhbnkpID0+IHZvaWQ7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGF0YWJhc2VDb250cm9sbGVyO1xuLy8gRXhwb3NlIHZhbGlkYXRlUXVlcnkgZm9yIHRlc3RzXG5tb2R1bGUuZXhwb3J0cy5fdmFsaWRhdGVRdWVyeSA9IHZhbGlkYXRlUXVlcnk7XG5tb2R1bGUuZXhwb3J0cy5maWx0ZXJTZW5zaXRpdmVEYXRhID0gZmlsdGVyU2Vuc2l0aXZlRGF0YTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFLQTs7QUFFQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBS0EsU0FBU0EsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEJDLEdBQTVCLEVBQWlDO0VBQy9CLE1BQU1DLFFBQVEsR0FBR0MsZUFBQSxDQUFFQyxTQUFGLENBQVlKLEtBQVosQ0FBakIsQ0FEK0IsQ0FFL0I7OztFQUNBRSxRQUFRLENBQUNHLE1BQVQsR0FBa0I7SUFBRUMsR0FBRyxFQUFFLENBQUMsSUFBRCxFQUFPLEdBQUdMLEdBQVY7RUFBUCxDQUFsQjtFQUNBLE9BQU9DLFFBQVA7QUFDRDs7QUFFRCxTQUFTSyxVQUFULENBQW9CUCxLQUFwQixFQUEyQkMsR0FBM0IsRUFBZ0M7RUFDOUIsTUFBTUMsUUFBUSxHQUFHQyxlQUFBLENBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQ4QixDQUU5Qjs7O0VBQ0FFLFFBQVEsQ0FBQ00sTUFBVCxHQUFrQjtJQUFFRixHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBUCxFQUFZLEdBQUdMLEdBQWY7RUFBUCxDQUFsQjtFQUNBLE9BQU9DLFFBQVA7QUFDRCxDLENBRUQ7OztBQUNBLE1BQU1PLGtCQUFrQixHQUFHLFFBQXdCO0VBQUEsSUFBdkI7SUFBRUM7RUFBRixDQUF1QjtFQUFBLElBQWJDLE1BQWE7O0VBQ2pELElBQUksQ0FBQ0QsR0FBTCxFQUFVO0lBQ1IsT0FBT0MsTUFBUDtFQUNEOztFQUVEQSxNQUFNLENBQUNOLE1BQVAsR0FBZ0IsRUFBaEI7RUFDQU0sTUFBTSxDQUFDSCxNQUFQLEdBQWdCLEVBQWhCOztFQUVBLEtBQUssTUFBTUksS0FBWCxJQUFvQkYsR0FBcEIsRUFBeUI7SUFD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