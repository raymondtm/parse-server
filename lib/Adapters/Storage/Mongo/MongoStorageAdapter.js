"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.MongoStorageAdapter = void 0;

var _MongoCollection = _interopRequireDefault(require("./MongoCollection"));

var _MongoSchemaCollection = _interopRequireDefault(require("./MongoSchemaCollection"));

var _StorageAdapter = require("../StorageAdapter");

var _mongodbUrl = require("../../../vendor/mongodbUrl");

var _MongoTransform = require("./MongoTransform");

var _node = _interopRequireDefault(require("parse/node"));

var _lodash = _interopRequireDefault(require("lodash"));

var _defaults = _interopRequireDefault(require("../../../defaults"));

var _logger = _interopRequireDefault(require("../../../logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

// -disable-next
const mongodb = require('mongodb');

const MongoClient = mongodb.MongoClient;
const ReadPreference = mongodb.ReadPreference;
const MongoSchemaCollectionName = '_SCHEMA';

const storageAdapterAllCollections = mongoAdapter => {
  return mongoAdapter.connect().then(() => mongoAdapter.database.collections()).then(collections => {
    return collections.filter(collection => {
      if (collection.namespace.match(/\.system\./)) {
        return false;
      } // TODO: If you have one app with a collection prefix that happens to be a prefix of another
      // apps prefix, this will go very very badly. We should fix that somehow.


      return collection.collectionName.indexOf(mongoAdapter._collectionPrefix) == 0;
    });
  });
};

const convertParseSchemaToMongoSchema = _ref => {
  let schema = _extends({}, _ref);

  delete schema.fields._rperm;
  delete schema.fields._wperm;

  if (schema.className === '_User') {
    // Legacy mongo adapter knows about the difference between password and _hashed_password.
    // Future database adapters will only know about _hashed_password.
    // Note: Parse Server will bring back password with injectDefaultSchema, so we don't need
    // to add _hashed_password back ever.
    delete schema.fields._hashed_password;
  }

  return schema;
}; // Returns { code, error } if invalid, or { result }, an object
// suitable for inserting into _SCHEMA collection, otherwise.


const mongoSchemaFromFieldsAndClassNameAndCLP = (fields, className, classLevelPermissions, indexes) => {
  const mongoObject = {
    _id: className,
    objectId: 'string',
    updatedAt: 'string',
    createdAt: 'string',
    _metadata: undefined
  };

  for (const fieldName in fields) {
    const _fields$fieldName = fields[fieldName],
          {
      type,
      targetClass
    } = _fields$fieldName,
          fieldOptions = _objectWithoutProperties(_fields$fieldName, ["type", "targetClass"]);

    mongoObject[fieldName] = _MongoSchemaCollection.default.parseFieldTypeToMongoFieldType({
      type,
      targetClass
    });

    if (fieldOptions && Object.keys(fieldOptions).length > 0) {
      mongoObject._metadata = mongoObject._metadata || {};
      mongoObject._metadata.fields_options = mongoObject._metadata.fields_options || {};
      mongoObject._metadata.fields_options[fieldName] = fieldOptions;
    }
  }

  if (typeof classLevelPermissions !== 'undefined') {
    mongoObject._metadata = mongoObject._metadata || {};

    if (!classLevelPermissions) {
      delete mongoObject._metadata.class_permissions;
    } else {
      mongoObject._metadata.class_permissions = classLevelPermissions;
    }
  }

  if (indexes && typeof indexes === 'object' && Object.keys(indexes).length > 0) {
    mongoObject._metadata = mongoObject._metadata || {};
    mongoObject._metadata.indexes = indexes;
  }

  if (!mongoObject._metadata) {
    // cleanup the unused _metadata
    delete mongoObject._metadata;
  }

  return mongoObject;
};

function validateExplainValue(explain) {
  if (explain) {
    // The list of allowed explain values is from node-mongodb-native/lib/explain.js
    const explainAllowedValues = ['queryPlanner', 'queryPlannerExtended', 'executionStats', 'allPlansExecution', false, true];

    if (!explainAllowedValues.includes(explain)) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Invalid value for explain');
    }
  }
}

class MongoStorageAdapter {
  // Private
  // Public
  constructor({
    uri = _defaults.default.DefaultMongoURI,
    collectionPrefix = '',
    mongoOptions = {}
  }) {
    this._uri = uri;
    this._collectionPrefix = collectionPrefix;
    this._mongoOptions = mongoOptions;
    this._mongoOptions.useNewUrlParser = true;
    this._mongoOptions.useUnifiedTopology = true;

    this._onchange = () => {}; // MaxTimeMS is not a global MongoDB client option, it is applied per operation.


    this._maxTimeMS = mongoOptions.maxTimeMS;
    this.canSortOnJoinTables = true;
    this.enableSchemaHooks = !!mongoOptions.enableSchemaHooks;
    delete mongoOptions.enableSchemaHooks;
    delete mongoOptions.maxTimeMS;
  }

  watch(callback) {
    this._onchange = callback;
  }

  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise;
    } // parsing and re-formatting causes the auth value (if there) to get URI
    // encoded


    const encodedUri = (0, _mongodbUrl.format)((0, _mongodbUrl.parse)(this._uri));
    this.connectionPromise = MongoClient.connect(encodedUri, this._mongoOptions).then(client => {
      // Starting mongoDB 3.0, the MongoClient.connect don't return a DB anymore but a client
      // Fortunately, we can get back the options and use them to select the proper DB.
      // https://github.com/mongodb/node-mongodb-native/blob/2c35d76f08574225b8db02d7bef687123e6bb018/lib/mongo_client.js#L885
      const options = client.s.options;
      const database = client.db(options.dbName);

      if (!database) {
        delete this.connectionPromise;
        return;
      }

      client.on('error', () => {
        delete this.connectionPromise;
      });
      client.on('close', () => {
        delete this.connectionPromise;
      });
      this.client = client;
      this.database = database;
    }).catch(err => {
      delete this.connectionPromise;
      return Promise.reject(err);
    });
    return this.connectionPromise;
  }

  handleError(error) {
    if (error && error.code === 13) {
      // Unauthorized error
      delete this.client;
      delete this.database;
      delete this.connectionPromise;

      _logger.default.error('Received unauthorized error', {
        error: error
      });
    }

    throw error;
  }

  handleShutdown() {
    if (!this.client) {
      return Promise.resolve();
    }

    return this.client.close(false);
  }

  _adaptiveCollection(name) {
    return this.connect().then(() => this.database.collection(this._collectionPrefix + name)).then(rawCollection => new _MongoCollection.default(rawCollection)).catch(err => this.handleError(err));
  }

  _schemaCollection() {
    return this.connect().then(() => this._adaptiveCollection(MongoSchemaCollectionName)).then(collection => {
      if (!this._stream && this.enableSchemaHooks) {
        this._stream = collection._mongoCollection.watch();

        this._stream.on('change', () => this._onchange());
      }

      return new _MongoSchemaCollection.default(collection);
    });
  }

  classExists(name) {
    return this.connect().then(() => {
      return this.database.listCollections({
        name: this._collectionPrefix + name
      }).toArray();
    }).then(collections => {
      return collections.length > 0;
    }).catch(err => this.handleError(err));
  }

  setClassLevelPermissions(className, CLPs) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.class_permissions': CLPs
      }
    })).catch(err => this.handleError(err));
  }

  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields) {
    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }

    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }

    const deletePromises = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];

      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }

      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }

      if (field.__op === 'Delete') {
        const promise = this.dropIndex(className, name);
        deletePromises.push(promise);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!Object.prototype.hasOwnProperty.call(fields, key.indexOf('_p_') === 0 ? key.replace('_p_', '') : key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    let insertPromise = Promise.resolve();

    if (insertedIndexes.length > 0) {
      insertPromise = this.createIndexes(className, insertedIndexes);
    }

    return Promise.all(deletePromises).then(() => insertPromise).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, {
      $set: {
        '_metadata.indexes': existingIndexes
      }
    })).catch(err => this.handleError(err));
  }

  setIndexesFromMongo(className) {
    return this.getIndexes(className).then(indexes => {
      indexes = indexes.reduce((obj, index) => {
        if (index.key._fts) {
          delete index.key._fts;
          delete index.key._ftsx;

          for (const field in index.weights) {
            index.key[field] = 'text';
          }
        }

        obj[index.name] = index.key;
        return obj;
      }, {});
      return this._schemaCollection().then(schemaCollection => schemaCollection.updateSchema(className, {
        $set: {
          '_metadata.indexes': indexes
        }
      }));
    }).catch(err => this.handleError(err)).catch(() => {
      // Ignore if collection not found
      return Promise.resolve();
    });
  }

  createClass(className, schema) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = mongoSchemaFromFieldsAndClassNameAndCLP(schema.fields, className, schema.classLevelPermissions, schema.indexes);
    mongoObject._id = className;
    return this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.insertSchema(mongoObject)).catch(err => this.handleError(err));
  }

  async updateFieldOptions(className, fieldName, type) {
    const schemaCollection = await this._schemaCollection();
    await schemaCollection.updateFieldOptions(className, fieldName, type);
  }

  addFieldIfNotExists(className, fieldName, type) {
    return this._schemaCollection().then(schemaCollection => schemaCollection.addFieldIfNotExists(className, fieldName, type)).then(() => this.createIndexesIfNeeded(className, fieldName, type)).catch(err => this.handleError(err));
  } // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.


  deleteClass(className) {
    return this._adaptiveCollection(className).then(collection => collection.drop()).catch(error => {
      // 'ns not found' means collection was already gone. Ignore deletion attempt.
      if (error.message == 'ns not found') {
        return;
      }

      throw error;
    }) // We've dropped the collection, now remove the _SCHEMA document
    .then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.findAndDeleteSchema(className)).catch(err => this.handleError(err));
  }

  deleteAllClasses(fast) {
    return storageAdapterAllCollections(this).then(collections => Promise.all(collections.map(collection => fast ? collection.deleteMany({}) : collection.drop())));
  } // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.
  // Pointer field names are passed for legacy reasons: the original mongo
  // format stored pointer field names differently in the database, and therefore
  // needed to know the type of the field before it could delete it. Future database
  // adapters should ignore the pointerFieldNames argument. All the field names are in
  // fieldNames, they show up additionally in the pointerFieldNames database for use
  // by the mongo adapter, which deals with the legacy mongo format.
  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.
  // Returns a Promise.


  deleteFields(className, schema, fieldNames) {
    const mongoFormatNames = fieldNames.map(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer') {
        return `_p_${fieldName}`;
      } else {
        return fieldName;
      }
    });
    const collectionUpdate = {
      $unset: {}
    };
    mongoFormatNames.forEach(name => {
      collectionUpdate['$unset'][name] = null;
    });
    const collectionFilter = {
      $or: []
    };
    mongoFormatNames.forEach(name => {
      collectionFilter['$or'].push({
        [name]: {
          $exists: true
        }
      });
    });
    const schemaUpdate = {
      $unset: {}
    };
    fieldNames.forEach(name => {
      schemaUpdate['$unset'][name] = null;
      schemaUpdate['$unset'][`_metadata.fields_options.${name}`] = null;
    });
    return this._adaptiveCollection(className).then(collection => collection.updateMany(collectionFilter, collectionUpdate)).then(() => this._schemaCollection()).then(schemaCollection => schemaCollection.updateSchema(className, schemaUpdate)).catch(err => this.handleError(err));
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  getAllClasses() {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchAllSchemasFrom_SCHEMA()).catch(err => this.handleError(err));
  } // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.


  getClass(className) {
    return this._schemaCollection().then(schemasCollection => schemasCollection._fetchOneSchemaFrom_SCHEMA(className)).catch(err => this.handleError(err));
  } // TODO: As yet not particularly well specified. Creates an object. Maybe shouldn't even need the schema,
  // and should infer from the type. Or maybe does need the schema for validations. Or maybe needs
  // the schema only for the legacy mongo format. We'll figure that out later.


  createObject(className, schema, object, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoObject = (0, _MongoTransform.parseObjectToMongoObjectForCreate)(className, object, schema);
    return this._adaptiveCollection(className).then(collection => collection.insertOne(mongoObject, transactionalSession)).then(() => ({
      ops: [mongoObject]
    })).catch(error => {
      if (error.code === 11000) {
        // Duplicate value
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;

        if (error.message) {
          const matches = error.message.match(/index:[\sa-zA-Z0-9_\-\.]+\$?([a-zA-Z_-]+)_1/);

          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }

        throw err;
      }

      throw error;
    }).catch(err => this.handleError(err));
  } // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.


  deleteObjectsByQuery(className, schema, query, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    return this._adaptiveCollection(className).then(collection => {
      const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
      return collection.deleteMany(mongoWhere, transactionalSession);
    }).catch(err => this.handleError(err)).then(({
      deletedCount
    }) => {
      if (deletedCount === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }

      return Promise.resolve();
    }, () => {
      throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'Database adapter error');
    });
  } // Apply the update to all objects that match the given Parse Query.


  updateObjectsByQuery(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.updateMany(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  } // Atomically finds and updates an object based on query.
  // Return value not currently well specified.


  findOneAndUpdate(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.findOneAndUpdate(mongoWhere, mongoUpdate, {
      returnDocument: 'after',
      session: transactionalSession || undefined
    })).then(result => (0, _MongoTransform.mongoObjectToParseObject)(className, result.value, schema)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      }

      throw error;
    }).catch(err => this.handleError(err));
  } // Hopefully we can get rid of this. It's only used for config and hooks.


  upsertOneObject(className, schema, query, update, transactionalSession) {
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoUpdate = (0, _MongoTransform.transformUpdate)(className, update, schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);
    return this._adaptiveCollection(className).then(collection => collection.upsertOne(mongoWhere, mongoUpdate, transactionalSession)).catch(err => this.handleError(err));
  } // Executes a find. Accepts: className, query in Parse format, and { skip, limit, sort }.


  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    readPreference,
    hint,
    caseInsensitive,
    explain
  }) {
    validateExplainValue(explain);
    schema = convertParseSchemaToMongoSchema(schema);
    const mongoWhere = (0, _MongoTransform.transformWhere)(className, query, schema);

    const mongoSort = _lodash.default.mapKeys(sort, (value, fieldName) => (0, _MongoTransform.transformKey)(className, fieldName, schema));

    const mongoKeys = _lodash.default.reduce(keys, (memo, key) => {
      if (key === 'ACL') {
        memo['_rperm'] = 1;
        memo['_wperm'] = 1;
      } else {
        memo[(0, _MongoTransform.transformKey)(className, key, schema)] = 1;
      }

      return memo;
    }, {}); // If we aren't requesting the `_id` field, we need to explicitly opt out
    // of it. Doing so in parse-server is unusual, but it can allow us to
    // optimize some queries with covering indexes.


    if (keys && !mongoKeys._id) {
      mongoKeys._id = 0;
    }

    readPreference = this._parseReadPreference(readPreference);
    return this.createTextIndexesIfNeeded(className, query, schema).then(() => this._adaptiveCollection(className)).then(collection => collection.find(mongoWhere, {
      skip,
      limit,
      sort: mongoSort,
      keys: mongoKeys,
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain
    })).then(objects => {
      if (explain) {
        return objects;
      }

      return objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema));
    }).catch(err => this.handleError(err));
  }

  ensureIndex(className, schema, fieldNames, indexName, caseInsensitive = false, options = {}) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = options.indexType !== undefined ? options.indexType : 1;
    });
    const defaultOptions = {
      background: true,
      sparse: true
    };
    const indexNameOptions = indexName ? {
      name: indexName
    } : {};
    const ttlOptions = options.ttl !== undefined ? {
      expireAfterSeconds: options.ttl
    } : {};
    const caseInsensitiveOptions = caseInsensitive ? {
      collation: _MongoCollection.default.caseInsensitiveCollation()
    } : {};

    const indexOptions = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, defaultOptions), caseInsensitiveOptions), indexNameOptions), ttlOptions);

    return this._adaptiveCollection(className).then(collection => new Promise((resolve, reject) => collection._mongoCollection.createIndex(indexCreationRequest, indexOptions, error => error ? reject(error) : resolve()))).catch(err => this.handleError(err));
  } // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.


  ensureUniqueness(className, schema, fieldNames) {
    schema = convertParseSchemaToMongoSchema(schema);
    const indexCreationRequest = {};
    const mongoFieldNames = fieldNames.map(fieldName => (0, _MongoTransform.transformKey)(className, fieldName, schema));
    mongoFieldNames.forEach(fieldName => {
      indexCreationRequest[fieldName] = 1;
    });
    return this._adaptiveCollection(className).then(collection => collection._ensureSparseUniqueIndexInBackground(indexCreationRequest)).catch(error => {
      if (error.code === 11000) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'Tried to ensure field uniqueness for a class that already has duplicates.');
      }

      throw error;
    }).catch(err => this.handleError(err));
  } // Used in tests


  _rawFind(className, query) {
    return this._adaptiveCollection(className).then(collection => collection.find(query, {
      maxTimeMS: this._maxTimeMS
    })).catch(err => this.handleError(err));
  } // Executes a count.


  count(className, schema, query, readPreference, hint) {
    schema = convertParseSchemaToMongoSchema(schema);
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.count((0, _MongoTransform.transformWhere)(className, query, schema, true), {
      maxTimeMS: this._maxTimeMS,
      readPreference,
      hint
    })).catch(err => this.handleError(err));
  }

  distinct(className, schema, query, fieldName) {
    schema = convertParseSchemaToMongoSchema(schema);
    const isPointerField = schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const transformField = (0, _MongoTransform.transformKey)(className, fieldName, schema);
    return this._adaptiveCollection(className).then(collection => collection.distinct(transformField, (0, _MongoTransform.transformWhere)(className, query, schema))).then(objects => {
      objects = objects.filter(obj => obj != null);
      return objects.map(object => {
        if (isPointerField) {
          return (0, _MongoTransform.transformPointerString)(schema, fieldName, object);
        }

        return (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema);
      });
    }).catch(err => this.handleError(err));
  }

  aggregate(className, schema, pipeline, readPreference, hint, explain) {
    validateExplainValue(explain);
    let isPointerField = false;
    pipeline = pipeline.map(stage => {
      if (stage.$group) {
        stage.$group = this._parseAggregateGroupArgs(schema, stage.$group);

        if (stage.$group._id && typeof stage.$group._id === 'string' && stage.$group._id.indexOf('$_p_') >= 0) {
          isPointerField = true;
        }
      }

      if (stage.$match) {
        stage.$match = this._parseAggregateArgs(schema, stage.$match);
      }

      if (stage.$project) {
        stage.$project = this._parseAggregateProjectArgs(schema, stage.$project);
      }

      if (stage.$geoNear && stage.$geoNear.query) {
        stage.$geoNear.query = this._parseAggregateArgs(schema, stage.$geoNear.query);
      }

      return stage;
    });
    readPreference = this._parseReadPreference(readPreference);
    return this._adaptiveCollection(className).then(collection => collection.aggregate(pipeline, {
      readPreference,
      maxTimeMS: this._maxTimeMS,
      hint,
      explain
    })).then(results => {
      results.forEach(result => {
        if (Object.prototype.hasOwnProperty.call(result, '_id')) {
          if (isPointerField && result._id) {
            result._id = result._id.split('$')[1];
          }

          if (result._id == null || result._id == undefined || ['object', 'string'].includes(typeof result._id) && _lodash.default.isEmpty(result._id)) {
            result._id = null;
          }

          result.objectId = result._id;
          delete result._id;
        }
      });
      return results;
    }).then(objects => objects.map(object => (0, _MongoTransform.mongoObjectToParseObject)(className, object, schema))).catch(err => this.handleError(err));
  } // This function will recursively traverse the pipeline and convert any Pointer or Date columns.
  // If we detect a pointer column we will rename the column being queried for to match the column
  // in the database. We also modify the value to what we expect the value to be in the database
  // as well.
  // For dates, the driver expects a Date object, but we have a string coming in. So we'll convert
  // the string to a Date so the driver can perform the necessary comparison.
  //
  // The goal of this method is to look for the "leaves" of the pipeline and determine if it needs
  // to be converted. The pipeline can have a few different forms. For more details, see:
  //     https://docs.mongodb.com/manual/reference/operator/aggregation/
  //
  // If the pipeline is an array, it means we are probably parsing an '$and' or '$or' operator. In
  // that case we need to loop through all of it's children to find the columns being operated on.
  // If the pipeline is an object, then we'll loop through the keys checking to see if the key name
  // matches one of the schema columns. If it does match a column and the column is a Pointer or
  // a Date, then we'll convert the value as described above.
  //
  // As much as I hate recursion...this seemed like a good fit for it. We're essentially traversing
  // down a tree to find a "leaf node" and checking to see if it needs to be converted.


  _parseAggregateArgs(schema, pipeline) {
    if (pipeline === null) {
      return null;
    } else if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};

      for (const field in pipeline) {
        if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
          if (typeof pipeline[field] === 'object') {
            // Pass objects down to MongoDB...this is more than likely an $exists operator.
            returnValue[`_p_${field}`] = pipeline[field];
          } else {
            returnValue[`_p_${field}`] = `${schema.fields[field].targetClass}$${pipeline[field]}`;
          }
        } else if (schema.fields[field] && schema.fields[field].type === 'Date') {
          returnValue[field] = this._convertToDate(pipeline[field]);
        } else {
          returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
        }

        if (field === 'objectId') {
          returnValue['_id'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'createdAt') {
          returnValue['_created_at'] = returnValue[field];
          delete returnValue[field];
        } else if (field === 'updatedAt') {
          returnValue['_updated_at'] = returnValue[field];
          delete returnValue[field];
        }
      }

      return returnValue;
    }

    return pipeline;
  } // This function is slightly different than the one above. Rather than trying to combine these
  // two functions and making the code even harder to understand, I decided to split it up. The
  // difference with this function is we are not transforming the values, only the keys of the
  // pipeline.


  _parseAggregateProjectArgs(schema, pipeline) {
    const returnValue = {};

    for (const field in pipeline) {
      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        returnValue[`_p_${field}`] = pipeline[field];
      } else {
        returnValue[field] = this._parseAggregateArgs(schema, pipeline[field]);
      }

      if (field === 'objectId') {
        returnValue['_id'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'createdAt') {
        returnValue['_created_at'] = returnValue[field];
        delete returnValue[field];
      } else if (field === 'updatedAt') {
        returnValue['_updated_at'] = returnValue[field];
        delete returnValue[field];
      }
    }

    return returnValue;
  } // This function is slightly different than the two above. MongoDB $group aggregate looks like:
  //     { $group: { _id: <expression>, <field1>: { <accumulator1> : <expression1> }, ... } }
  // The <expression> could be a column name, prefixed with the '$' character. We'll look for
  // these <expression> and check to see if it is a 'Pointer' or if it's one of createdAt,
  // updatedAt or objectId and change it accordingly.


  _parseAggregateGroupArgs(schema, pipeline) {
    if (Array.isArray(pipeline)) {
      return pipeline.map(value => this._parseAggregateGroupArgs(schema, value));
    } else if (typeof pipeline === 'object') {
      const returnValue = {};

      for (const field in pipeline) {
        returnValue[field] = this._parseAggregateGroupArgs(schema, pipeline[field]);
      }

      return returnValue;
    } else if (typeof pipeline === 'string') {
      const field = pipeline.substring(1);

      if (schema.fields[field] && schema.fields[field].type === 'Pointer') {
        return `$_p_${field}`;
      } else if (field == 'createdAt') {
        return '$_created_at';
      } else if (field == 'updatedAt') {
        return '$_updated_at';
      }
    }

    return pipeline;
  } // This function will attempt to convert the provided value to a Date object. Since this is part
  // of an aggregation pipeline, the value can either be a string or it can be another object with
  // an operator in it (like $gt, $lt, etc). Because of this I felt it was easier to make this a
  // recursive method to traverse down to the "leaf node" which is going to be the string.


  _convertToDate(value) {
    if (typeof value === 'string') {
      return new Date(value);
    }

    const returnValue = {};

    for (const field in value) {
      returnValue[field] = this._convertToDate(value[field]);
    }

    return returnValue;
  }

  _parseReadPreference(readPreference) {
    if (readPreference) {
      readPreference = readPreference.toUpperCase();
    }

    switch (readPreference) {
      case 'PRIMARY':
        readPreference = ReadPreference.PRIMARY;
        break;

      case 'PRIMARY_PREFERRED':
        readPreference = ReadPreference.PRIMARY_PREFERRED;
        break;

      case 'SECONDARY':
        readPreference = ReadPreference.SECONDARY;
        break;

      case 'SECONDARY_PREFERRED':
        readPreference = ReadPreference.SECONDARY_PREFERRED;
        break;

      case 'NEAREST':
        readPreference = ReadPreference.NEAREST;
        break;

      case undefined:
      case null:
      case '':
        break;

      default:
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, 'Not supported read preference.');
    }

    return readPreference;
  }

  performInitialization() {
    return Promise.resolve();
  }

  createIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndex(index)).catch(err => this.handleError(err));
  }

  createIndexes(className, indexes) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.createIndexes(indexes)).catch(err => this.handleError(err));
  }

  createIndexesIfNeeded(className, fieldName, type) {
    if (type && type.type === 'Polygon') {
      const index = {
        [fieldName]: '2dsphere'
      };
      return this.createIndex(className, index);
    }

    return Promise.resolve();
  }

  createTextIndexesIfNeeded(className, query, schema) {
    for (const fieldName in query) {
      if (!query[fieldName] || !query[fieldName].$text) {
        continue;
      }

      const existingIndexes = schema.indexes;

      for (const key in existingIndexes) {
        const index = existingIndexes[key];

        if (Object.prototype.hasOwnProperty.call(index, fieldName)) {
          return Promise.resolve();
        }
      }

      const indexName = `${fieldName}_text`;
      const textIndex = {
        [indexName]: {
          [fieldName]: 'text'
        }
      };
      return this.setIndexesWithSchemaFormat(className, textIndex, existingIndexes, schema.fields).catch(error => {
        if (error.code === 85) {
          // Index exist with different options
          return this.setIndexesFromMongo(className);
        }

        throw error;
      });
    }

    return Promise.resolve();
  }

  getIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.indexes()).catch(err => this.handleError(err));
  }

  dropIndex(className, index) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndex(index)).catch(err => this.handleError(err));
  }

  dropAllIndexes(className) {
    return this._adaptiveCollection(className).then(collection => collection._mongoCollection.dropIndexes()).catch(err => this.handleError(err));
  }

  updateSchemaWithIndexes() {
    return this.getAllClasses().then(classes => {
      const promises = classes.map(schema => {
        return this.setIndexesFromMongo(schema.className);
      });
      return Promise.all(promises);
    }).catch(err => this.handleError(err));
  }

  createTransactionalSession() {
    const transactionalSection = this.client.startSession();
    transactionalSection.startTransaction();
    return Promise.resolve(transactionalSection);
  }

  commitTransactionalSession(transactionalSection) {
    const commit = retries => {
      return transactionalSection.commitTransaction().catch(error => {
        if (error && error.hasErrorLabel('TransientTransactionError') && retries > 0) {
          return commit(retries - 1);
        }

        throw error;
      }).then(() => {
        transactionalSection.endSession();
      });
    };

    return commit(5);
  }

  abortTransactionalSession(transactionalSection) {
    return transactionalSection.abortTransaction().then(() => {
      transactionalSection.endSession();
    });
  }

}

exports.MongoStorageAdapter = MongoStorageAdapter;
var _default = MongoStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb25nb2RiIiwicmVxdWlyZSIsIk1vbmdvQ2xpZW50IiwiUmVhZFByZWZlcmVuY2UiLCJNb25nb1NjaGVtYUNvbGxlY3Rpb25OYW1lIiwic3RvcmFnZUFkYXB0ZXJBbGxDb2xsZWN0aW9ucyIsIm1vbmdvQWRhcHRlciIsImNvbm5lY3QiLCJ0aGVuIiwiZGF0YWJhc2UiLCJjb2xsZWN0aW9ucyIsImZpbHRlciIsImNvbGxlY3Rpb24iLCJuYW1lc3BhY2UiLCJtYXRjaCIsImNvbGxlY3Rpb25OYW1lIiwiaW5kZXhPZiIsIl9jb2xsZWN0aW9uUHJlZml4IiwiY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSIsInNjaGVtYSIsImZpZWxkcyIsIl9ycGVybSIsIl93cGVybSIsImNsYXNzTmFtZSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWVBbmRDTFAiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJpbmRleGVzIiwibW9uZ29PYmplY3QiLCJfaWQiLCJvYmplY3RJZCIsInVwZGF0ZWRBdCIsImNyZWF0ZWRBdCIsIl9tZXRhZGF0YSIsInVuZGVmaW5lZCIsImZpZWxkTmFtZSIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsImZpZWxkT3B0aW9ucyIsIk1vbmdvU2NoZW1hQ29sbGVjdGlvbiIsInBhcnNlRmllbGRUeXBlVG9Nb25nb0ZpZWxkVHlwZSIsIk9iamVjdCIsImtleXMiLCJsZW5ndGgiLCJmaWVsZHNfb3B0aW9ucyIsImNsYXNzX3Blcm1pc3Npb25zIiwidmFsaWRhdGVFeHBsYWluVmFsdWUiLCJleHBsYWluIiwiZXhwbGFpbkFsbG93ZWRWYWx1ZXMiLCJpbmNsdWRlcyIsIlBhcnNlIiwiRXJyb3IiLCJJTlZBTElEX1FVRVJZIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsImNvbnN0cnVjdG9yIiwidXJpIiwiZGVmYXVsdHMiLCJEZWZhdWx0TW9uZ29VUkkiLCJjb2xsZWN0aW9uUHJlZml4IiwibW9uZ29PcHRpb25zIiwiX3VyaSIsIl9tb25nb09wdGlvbnMiLCJ1c2VOZXdVcmxQYXJzZXIiLCJ1c2VVbmlmaWVkVG9wb2xvZ3kiLCJfb25jaGFuZ2UiLCJfbWF4VGltZU1TIiwibWF4VGltZU1TIiwiY2FuU29ydE9uSm9pblRhYmxlcyIsImVuYWJsZVNjaGVtYUhvb2tzIiwid2F0Y2giLCJjYWxsYmFjayIsImNvbm5lY3Rpb25Qcm9taXNlIiwiZW5jb2RlZFVyaSIsImZvcm1hdFVybCIsInBhcnNlVXJsIiwiY2xpZW50Iiwib3B0aW9ucyIsInMiLCJkYiIsImRiTmFtZSIsIm9uIiwiY2F0Y2giLCJlcnIiLCJQcm9taXNlIiwicmVqZWN0IiwiaGFuZGxlRXJyb3IiLCJlcnJvciIsImNvZGUiLCJsb2dnZXIiLCJoYW5kbGVTaHV0ZG93biIsInJlc29sdmUiLCJjbG9zZSIsIl9hZGFwdGl2ZUNvbGxlY3Rpb24iLCJuYW1lIiwicmF3Q29sbGVjdGlvbiIsIk1vbmdvQ29sbGVjdGlvbiIsIl9zY2hlbWFDb2xsZWN0aW9uIiwiX3N0cmVhbSIsIl9tb25nb0NvbGxlY3Rpb24iLCJjbGFzc0V4aXN0cyIsImxpc3RDb2xsZWN0aW9ucyIsInRvQXJyYXkiLCJzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJDTFBzIiwic2NoZW1hQ29sbGVjdGlvbiIsInVwZGF0ZVNjaGVtYSIsIiRzZXQiLCJzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdCIsInN1Ym1pdHRlZEluZGV4ZXMiLCJleGlzdGluZ0luZGV4ZXMiLCJfaWRfIiwiZGVsZXRlUHJvbWlzZXMiLCJpbnNlcnRlZEluZGV4ZXMiLCJmb3JFYWNoIiwiZmllbGQiLCJfX29wIiwicHJvbWlzZSIsImRyb3BJbmRleCIsInB1c2giLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJyZXBsYWNlIiwiaW5zZXJ0UHJvbWlzZSIsImNyZWF0ZUluZGV4ZXMiLCJhbGwiLCJzZXRJbmRleGVzRnJvbU1vbmdvIiwiZ2V0SW5kZXhlcyIsInJlZHVjZSIsIm9iaiIsImluZGV4IiwiX2Z0cyIsIl9mdHN4Iiwid2VpZ2h0cyIsImNyZWF0ZUNsYXNzIiwiaW5zZXJ0U2NoZW1hIiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImRlbGV0ZUNsYXNzIiwiZHJvcCIsIm1lc3NhZ2UiLCJmaW5kQW5kRGVsZXRlU2NoZW1hIiwiZGVsZXRlQWxsQ2xhc3NlcyIsImZhc3QiLCJtYXAiLCJkZWxldGVNYW55IiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsIm1vbmdvRm9ybWF0TmFtZXMiLCJjb2xsZWN0aW9uVXBkYXRlIiwiJHVuc2V0IiwiY29sbGVjdGlvbkZpbHRlciIsIiRvciIsIiRleGlzdHMiLCJzY2hlbWFVcGRhdGUiLCJ1cGRhdGVNYW55IiwiZ2V0QWxsQ2xhc3NlcyIsInNjaGVtYXNDb2xsZWN0aW9uIiwiX2ZldGNoQWxsU2NoZW1hc0Zyb21fU0NIRU1BIiwiZ2V0Q2xhc3MiLCJfZmV0Y2hPbmVTY2hlbWFGcm9tX1NDSEVNQSIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsInRyYW5zYWN0aW9uYWxTZXNzaW9uIiwicGFyc2VPYmplY3RUb01vbmdvT2JqZWN0Rm9yQ3JlYXRlIiwiaW5zZXJ0T25lIiwib3BzIiwiRFVQTElDQVRFX1ZBTFVFIiwidW5kZXJseWluZ0Vycm9yIiwibWF0Y2hlcyIsIkFycmF5IiwiaXNBcnJheSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5IiwicXVlcnkiLCJtb25nb1doZXJlIiwidHJhbnNmb3JtV2hlcmUiLCJkZWxldGVkQ291bnQiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGUiLCJtb25nb1VwZGF0ZSIsInRyYW5zZm9ybVVwZGF0ZSIsImZpbmRPbmVBbmRVcGRhdGUiLCJyZXR1cm5Eb2N1bWVudCIsInNlc3Npb24iLCJyZXN1bHQiLCJtb25nb09iamVjdFRvUGFyc2VPYmplY3QiLCJ2YWx1ZSIsInVwc2VydE9uZU9iamVjdCIsInVwc2VydE9uZSIsImZpbmQiLCJza2lwIiwibGltaXQiLCJzb3J0IiwicmVhZFByZWZlcmVuY2UiLCJoaW50IiwiY2FzZUluc2Vuc2l0aXZlIiwibW9uZ29Tb3J0IiwiXyIsIm1hcEtleXMiLCJ0cmFuc2Zvcm1LZXkiLCJtb25nb0tleXMiLCJtZW1vIiwiX3BhcnNlUmVhZFByZWZlcmVuY2UiLCJjcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkIiwib2JqZWN0cyIsImVuc3VyZUluZGV4IiwiaW5kZXhOYW1lIiwiaW5kZXhDcmVhdGlvblJlcXVlc3QiLCJtb25nb0ZpZWxkTmFtZXMiLCJpbmRleFR5cGUiLCJkZWZhdWx0T3B0aW9ucyIsImJhY2tncm91bmQiLCJzcGFyc2UiLCJpbmRleE5hbWVPcHRpb25zIiwidHRsT3B0aW9ucyIsInR0bCIsImV4cGlyZUFmdGVyU2Vjb25kcyIsImNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMiLCJjb2xsYXRpb24iLCJjYXNlSW5zZW5zaXRpdmVDb2xsYXRpb24iLCJpbmRleE9wdGlvbnMiLCJjcmVhdGVJbmRleCIsImVuc3VyZVVuaXF1ZW5lc3MiLCJfZW5zdXJlU3BhcnNlVW5pcXVlSW5kZXhJbkJhY2tncm91bmQiLCJfcmF3RmluZCIsImNvdW50IiwiZGlzdGluY3QiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybUZpZWxkIiwidHJhbnNmb3JtUG9pbnRlclN0cmluZyIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwic3RhZ2UiLCIkZ3JvdXAiLCJfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3MiLCIkbWF0Y2giLCJfcGFyc2VBZ2dyZWdhdGVBcmdzIiwiJHByb2plY3QiLCJfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyIsIiRnZW9OZWFyIiwicmVzdWx0cyIsInNwbGl0IiwiaXNFbXB0eSIsInJldHVyblZhbHVlIiwiX2NvbnZlcnRUb0RhdGUiLCJzdWJzdHJpbmciLCJEYXRlIiwidG9VcHBlckNhc2UiLCJQUklNQVJZIiwiUFJJTUFSWV9QUkVGRVJSRUQiLCJTRUNPTkRBUlkiLCJTRUNPTkRBUllfUFJFRkVSUkVEIiwiTkVBUkVTVCIsInBlcmZvcm1Jbml0aWFsaXphdGlvbiIsIiR0ZXh0IiwidGV4dEluZGV4IiwiZHJvcEFsbEluZGV4ZXMiLCJkcm9wSW5kZXhlcyIsInVwZGF0ZVNjaGVtYVdpdGhJbmRleGVzIiwiY2xhc3NlcyIsInByb21pc2VzIiwiY3JlYXRlVHJhbnNhY3Rpb25hbFNlc3Npb24iLCJ0cmFuc2FjdGlvbmFsU2VjdGlvbiIsInN0YXJ0U2Vzc2lvbiIsInN0YXJ0VHJhbnNhY3Rpb24iLCJjb21taXRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImNvbW1pdCIsInJldHJpZXMiLCJjb21taXRUcmFuc2FjdGlvbiIsImhhc0Vycm9yTGFiZWwiLCJlbmRTZXNzaW9uIiwiYWJvcnRUcmFuc2FjdGlvbmFsU2Vzc2lvbiIsImFib3J0VHJhbnNhY3Rpb24iXSwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvQWRhcHRlcnMvU3RvcmFnZS9Nb25nby9Nb25nb1N0b3JhZ2VBZGFwdGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG5pbXBvcnQgTW9uZ29Db2xsZWN0aW9uIGZyb20gJy4vTW9uZ29Db2xsZWN0aW9uJztcbmltcG9ydCBNb25nb1NjaGVtYUNvbGxlY3Rpb24gZnJvbSAnLi9Nb25nb1NjaGVtYUNvbGxlY3Rpb24nO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7IFNjaGVtYVR5cGUsIFF1ZXJ5VHlwZSwgU3RvcmFnZUNsYXNzLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVVybCwgZm9ybWF0IGFzIGZvcm1hdFVybCB9IGZyb20gJy4uLy4uLy4uL3ZlbmRvci9tb25nb2RiVXJsJztcbmltcG9ydCB7XG4gIHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZSxcbiAgbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0LFxuICB0cmFuc2Zvcm1LZXksXG4gIHRyYW5zZm9ybVdoZXJlLFxuICB0cmFuc2Zvcm1VcGRhdGUsXG4gIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcsXG59IGZyb20gJy4vTW9uZ29UcmFuc2Zvcm0nO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vLi4vZGVmYXVsdHMnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi8uLi8uLi9sb2dnZXInO1xuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IG1vbmdvZGIgPSByZXF1aXJlKCdtb25nb2RiJyk7XG5jb25zdCBNb25nb0NsaWVudCA9IG1vbmdvZGIuTW9uZ29DbGllbnQ7XG5jb25zdCBSZWFkUHJlZmVyZW5jZSA9IG1vbmdvZGIuUmVhZFByZWZlcmVuY2U7XG5cbmNvbnN0IE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUgPSAnX1NDSEVNQSc7XG5cbmNvbnN0IHN0b3JhZ2VBZGFwdGVyQWxsQ29sbGVjdGlvbnMgPSBtb25nb0FkYXB0ZXIgPT4ge1xuICByZXR1cm4gbW9uZ29BZGFwdGVyXG4gICAgLmNvbm5lY3QoKVxuICAgIC50aGVuKCgpID0+IG1vbmdvQWRhcHRlci5kYXRhYmFzZS5jb2xsZWN0aW9ucygpKVxuICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgIHJldHVybiBjb2xsZWN0aW9ucy5maWx0ZXIoY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmIChjb2xsZWN0aW9uLm5hbWVzcGFjZS5tYXRjaCgvXFwuc3lzdGVtXFwuLykpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVE9ETzogSWYgeW91IGhhdmUgb25lIGFwcCB3aXRoIGEgY29sbGVjdGlvbiBwcmVmaXggdGhhdCBoYXBwZW5zIHRvIGJlIGEgcHJlZml4IG9mIGFub3RoZXJcbiAgICAgICAgLy8gYXBwcyBwcmVmaXgsIHRoaXMgd2lsbCBnbyB2ZXJ5IHZlcnkgYmFkbHkuIFdlIHNob3VsZCBmaXggdGhhdCBzb21laG93LlxuICAgICAgICByZXR1cm4gY29sbGVjdGlvbi5jb2xsZWN0aW9uTmFtZS5pbmRleE9mKG1vbmdvQWRhcHRlci5fY29sbGVjdGlvblByZWZpeCkgPT0gMDtcbiAgICAgIH0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgLy8gTGVnYWN5IG1vbmdvIGFkYXB0ZXIga25vd3MgYWJvdXQgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBwYXNzd29yZCBhbmQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBGdXR1cmUgZGF0YWJhc2UgYWRhcHRlcnMgd2lsbCBvbmx5IGtub3cgYWJvdXQgX2hhc2hlZF9wYXNzd29yZC5cbiAgICAvLyBOb3RlOiBQYXJzZSBTZXJ2ZXIgd2lsbCBicmluZyBiYWNrIHBhc3N3b3JkIHdpdGggaW5qZWN0RGVmYXVsdFNjaGVtYSwgc28gd2UgZG9uJ3QgbmVlZFxuICAgIC8vIHRvIGFkZCBfaGFzaGVkX3Bhc3N3b3JkIGJhY2sgZXZlci5cbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbi8vIFJldHVybnMgeyBjb2RlLCBlcnJvciB9IGlmIGludmFsaWQsIG9yIHsgcmVzdWx0IH0sIGFuIG9iamVjdFxuLy8gc3VpdGFibGUgZm9yIGluc2VydGluZyBpbnRvIF9TQ0hFTUEgY29sbGVjdGlvbiwgb3RoZXJ3aXNlLlxuY29uc3QgbW9uZ29TY2hlbWFGcm9tRmllbGRzQW5kQ2xhc3NOYW1lQW5kQ0xQID0gKFxuICBmaWVsZHMsXG4gIGNsYXNzTmFtZSxcbiAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBpbmRleGVzXG4pID0+IHtcbiAgY29uc3QgbW9uZ29PYmplY3QgPSB7XG4gICAgX2lkOiBjbGFzc05hbWUsXG4gICAgb2JqZWN0SWQ6ICdzdHJpbmcnLFxuICAgIHVwZGF0ZWRBdDogJ3N0cmluZycsXG4gICAgY3JlYXRlZEF0OiAnc3RyaW5nJyxcbiAgICBfbWV0YWRhdGE6IHVuZGVmaW5lZCxcbiAgfTtcblxuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICBjb25zdCB7IHR5cGUsIHRhcmdldENsYXNzLCAuLi5maWVsZE9wdGlvbnMgfSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgIG1vbmdvT2JqZWN0W2ZpZWxkTmFtZV0gPSBNb25nb1NjaGVtYUNvbGxlY3Rpb24ucGFyc2VGaWVsZFR5cGVUb01vbmdvRmllbGRUeXBlKHtcbiAgICAgIHR5cGUsXG4gICAgICB0YXJnZXRDbGFzcyxcbiAgICB9KTtcbiAgICBpZiAoZmllbGRPcHRpb25zICYmIE9iamVjdC5rZXlzKGZpZWxkT3B0aW9ucykubGVuZ3RoID4gMCkge1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zID0gbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zIHx8IHt9O1xuICAgICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmZpZWxkc19vcHRpb25zW2ZpZWxkTmFtZV0gPSBmaWVsZE9wdGlvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKHR5cGVvZiBjbGFzc0xldmVsUGVybWlzc2lvbnMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhID0gbW9uZ29PYmplY3QuX21ldGFkYXRhIHx8IHt9O1xuICAgIGlmICghY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB7XG4gICAgICBkZWxldGUgbW9uZ29PYmplY3QuX21ldGFkYXRhLmNsYXNzX3Blcm1pc3Npb25zO1xuICAgIH0gZWxzZSB7XG4gICAgICBtb25nb09iamVjdC5fbWV0YWRhdGEuY2xhc3NfcGVybWlzc2lvbnMgPSBjbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgfVxuICB9XG5cbiAgaWYgKGluZGV4ZXMgJiYgdHlwZW9mIGluZGV4ZXMgPT09ICdvYmplY3QnICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCA+IDApIHtcbiAgICBtb25nb09iamVjdC5fbWV0YWRhdGEgPSBtb25nb09iamVjdC5fbWV0YWRhdGEgfHwge307XG4gICAgbW9uZ29PYmplY3QuX21ldGFkYXRhLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG5cbiAgaWYgKCFtb25nb09iamVjdC5fbWV0YWRhdGEpIHtcbiAgICAvLyBjbGVhbnVwIHRoZSB1bnVzZWQgX21ldGFkYXRhXG4gICAgZGVsZXRlIG1vbmdvT2JqZWN0Ll9tZXRhZGF0YTtcbiAgfVxuXG4gIHJldHVybiBtb25nb09iamVjdDtcbn07XG5cbmZ1bmN0aW9uIHZhbGlkYXRlRXhwbGFpblZhbHVlKGV4cGxhaW4pIHtcbiAgaWYgKGV4cGxhaW4pIHtcbiAgICAvLyBUaGUgbGlzdCBvZiBhbGxvd2VkIGV4cGxhaW4gdmFsdWVzIGlzIGZyb20gbm9kZS1tb25nb2RiLW5hdGl2ZS9saWIvZXhwbGFpbi5qc1xuICAgIGNvbnN0IGV4cGxhaW5BbGxvd2VkVmFsdWVzID0gW1xuICAgICAgJ3F1ZXJ5UGxhbm5lcicsXG4gICAgICAncXVlcnlQbGFubmVyRXh0ZW5kZWQnLFxuICAgICAgJ2V4ZWN1dGlvblN0YXRzJyxcbiAgICAgICdhbGxQbGFuc0V4ZWN1dGlvbicsXG4gICAgICBmYWxzZSxcbiAgICAgIHRydWUsXG4gICAgXTtcbiAgICBpZiAoIWV4cGxhaW5BbGxvd2VkVmFsdWVzLmluY2x1ZGVzKGV4cGxhaW4pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ0ludmFsaWQgdmFsdWUgZm9yIGV4cGxhaW4nKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vbmdvU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIC8vIFByaXZhdGVcbiAgX3VyaTogc3RyaW5nO1xuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfbW9uZ29PcHRpb25zOiBPYmplY3Q7XG4gIF9vbmNoYW5nZTogYW55O1xuICBfc3RyZWFtOiBhbnk7XG4gIC8vIFB1YmxpY1xuICBjb25uZWN0aW9uUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgZGF0YWJhc2U6IGFueTtcbiAgY2xpZW50OiBNb25nb0NsaWVudDtcbiAgX21heFRpbWVNUzogP251bWJlcjtcbiAgY2FuU29ydE9uSm9pblRhYmxlczogYm9vbGVhbjtcbiAgZW5hYmxlU2NoZW1hSG9va3M6IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IoeyB1cmkgPSBkZWZhdWx0cy5EZWZhdWx0TW9uZ29VUkksIGNvbGxlY3Rpb25QcmVmaXggPSAnJywgbW9uZ29PcHRpb25zID0ge30gfTogYW55KSB7XG4gICAgdGhpcy5fdXJpID0gdXJpO1xuICAgIHRoaXMuX2NvbGxlY3Rpb25QcmVmaXggPSBjb2xsZWN0aW9uUHJlZml4O1xuICAgIHRoaXMuX21vbmdvT3B0aW9ucyA9IG1vbmdvT3B0aW9ucztcbiAgICB0aGlzLl9tb25nb09wdGlvbnMudXNlTmV3VXJsUGFyc2VyID0gdHJ1ZTtcbiAgICB0aGlzLl9tb25nb09wdGlvbnMudXNlVW5pZmllZFRvcG9sb2d5ID0gdHJ1ZTtcbiAgICB0aGlzLl9vbmNoYW5nZSA9ICgpID0+IHt9O1xuXG4gICAgLy8gTWF4VGltZU1TIGlzIG5vdCBhIGdsb2JhbCBNb25nb0RCIGNsaWVudCBvcHRpb24sIGl0IGlzIGFwcGxpZWQgcGVyIG9wZXJhdGlvbi5cbiAgICB0aGlzLl9tYXhUaW1lTVMgPSBtb25nb09wdGlvbnMubWF4VGltZU1TO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IHRydWU7XG4gICAgdGhpcy5lbmFibGVTY2hlbWFIb29rcyA9ICEhbW9uZ29PcHRpb25zLmVuYWJsZVNjaGVtYUhvb2tzO1xuICAgIGRlbGV0ZSBtb25nb09wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3M7XG4gICAgZGVsZXRlIG1vbmdvT3B0aW9ucy5tYXhUaW1lTVM7XG4gIH1cblxuICB3YXRjaChjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuX29uY2hhbmdlID0gY2FsbGJhY2s7XG4gIH1cblxuICBjb25uZWN0KCkge1xuICAgIGlmICh0aGlzLmNvbm5lY3Rpb25Qcm9taXNlKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICB9XG5cbiAgICAvLyBwYXJzaW5nIGFuZCByZS1mb3JtYXR0aW5nIGNhdXNlcyB0aGUgYXV0aCB2YWx1ZSAoaWYgdGhlcmUpIHRvIGdldCBVUklcbiAgICAvLyBlbmNvZGVkXG4gICAgY29uc3QgZW5jb2RlZFVyaSA9IGZvcm1hdFVybChwYXJzZVVybCh0aGlzLl91cmkpKTtcblxuICAgIHRoaXMuY29ubmVjdGlvblByb21pc2UgPSBNb25nb0NsaWVudC5jb25uZWN0KGVuY29kZWRVcmksIHRoaXMuX21vbmdvT3B0aW9ucylcbiAgICAgIC50aGVuKGNsaWVudCA9PiB7XG4gICAgICAgIC8vIFN0YXJ0aW5nIG1vbmdvREIgMy4wLCB0aGUgTW9uZ29DbGllbnQuY29ubmVjdCBkb24ndCByZXR1cm4gYSBEQiBhbnltb3JlIGJ1dCBhIGNsaWVudFxuICAgICAgICAvLyBGb3J0dW5hdGVseSwgd2UgY2FuIGdldCBiYWNrIHRoZSBvcHRpb25zIGFuZCB1c2UgdGhlbSB0byBzZWxlY3QgdGhlIHByb3BlciBEQi5cbiAgICAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL21vbmdvZGIvbm9kZS1tb25nb2RiLW5hdGl2ZS9ibG9iLzJjMzVkNzZmMDg1NzQyMjViOGRiMDJkN2JlZjY4NzEyM2U2YmIwMTgvbGliL21vbmdvX2NsaWVudC5qcyNMODg1XG4gICAgICAgIGNvbnN0IG9wdGlvbnMgPSBjbGllbnQucy5vcHRpb25zO1xuICAgICAgICBjb25zdCBkYXRhYmFzZSA9IGNsaWVudC5kYihvcHRpb25zLmRiTmFtZSk7XG4gICAgICAgIGlmICghZGF0YWJhc2UpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY2xpZW50Lm9uKCdlcnJvcicsICgpID0+IHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgfSk7XG4gICAgICAgIGNsaWVudC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuY29ubmVjdGlvblByb21pc2U7XG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNsaWVudCA9IGNsaWVudDtcbiAgICAgICAgdGhpcy5kYXRhYmFzZSA9IGRhdGFiYXNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycik7XG4gICAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb25Qcm9taXNlO1xuICB9XG5cbiAgaGFuZGxlRXJyb3I8VD4oZXJyb3I6ID8oRXJyb3IgfCBQYXJzZS5FcnJvcikpOiBQcm9taXNlPFQ+IHtcbiAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gMTMpIHtcbiAgICAgIC8vIFVuYXV0aG9yaXplZCBlcnJvclxuICAgICAgZGVsZXRlIHRoaXMuY2xpZW50O1xuICAgICAgZGVsZXRlIHRoaXMuZGF0YWJhc2U7XG4gICAgICBkZWxldGUgdGhpcy5jb25uZWN0aW9uUHJvbWlzZTtcbiAgICAgIGxvZ2dlci5lcnJvcignUmVjZWl2ZWQgdW5hdXRob3JpemVkIGVycm9yJywgeyBlcnJvcjogZXJyb3IgfSk7XG4gICAgfVxuICAgIHRocm93IGVycm9yO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLmNsaWVudCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5jbGllbnQuY2xvc2UoZmFsc2UpO1xuICB9XG5cbiAgX2FkYXB0aXZlQ29sbGVjdGlvbihuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuZGF0YWJhc2UuY29sbGVjdGlvbih0aGlzLl9jb2xsZWN0aW9uUHJlZml4ICsgbmFtZSkpXG4gICAgICAudGhlbihyYXdDb2xsZWN0aW9uID0+IG5ldyBNb25nb0NvbGxlY3Rpb24ocmF3Q29sbGVjdGlvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBfc2NoZW1hQ29sbGVjdGlvbigpOiBQcm9taXNlPE1vbmdvU2NoZW1hQ29sbGVjdGlvbj4ge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3QoKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKE1vbmdvU2NoZW1hQ29sbGVjdGlvbk5hbWUpKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiB7XG4gICAgICAgIGlmICghdGhpcy5fc3RyZWFtICYmIHRoaXMuZW5hYmxlU2NoZW1hSG9va3MpIHtcbiAgICAgICAgICB0aGlzLl9zdHJlYW0gPSBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24ud2F0Y2goKTtcbiAgICAgICAgICB0aGlzLl9zdHJlYW0ub24oJ2NoYW5nZScsICgpID0+IHRoaXMuX29uY2hhbmdlKCkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBuZXcgTW9uZ29TY2hlbWFDb2xsZWN0aW9uKGNvbGxlY3Rpb24pO1xuICAgICAgfSk7XG4gIH1cblxuICBjbGFzc0V4aXN0cyhuYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5jb25uZWN0KClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZGF0YWJhc2UubGlzdENvbGxlY3Rpb25zKHsgbmFtZTogdGhpcy5fY29sbGVjdGlvblByZWZpeCArIG5hbWUgfSkudG9BcnJheSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb25zID0+IHtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb25zLmxlbmd0aCA+IDA7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBDTFBzOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5fc2NoZW1hQ29sbGVjdGlvbigpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5jbGFzc19wZXJtaXNzaW9ucyc6IENMUHMgfSxcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIHNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEluZGV4ZXM6IGFueSxcbiAgICBleGlzdGluZ0luZGV4ZXM6IGFueSA9IHt9LFxuICAgIGZpZWxkczogYW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmIChzdWJtaXR0ZWRJbmRleGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgaWYgKE9iamVjdC5rZXlzKGV4aXN0aW5nSW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgICBleGlzdGluZ0luZGV4ZXMgPSB7IF9pZF86IHsgX2lkOiAxIH0gfTtcbiAgICB9XG4gICAgY29uc3QgZGVsZXRlUHJvbWlzZXMgPSBbXTtcbiAgICBjb25zdCBpbnNlcnRlZEluZGV4ZXMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRJbmRleGVzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRJbmRleGVzW25hbWVdO1xuICAgICAgaWYgKGV4aXN0aW5nSW5kZXhlc1tuYW1lXSAmJiBmaWVsZC5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgfVxuICAgICAgaWYgKCFleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0aGlzLmRyb3BJbmRleChjbGFzc05hbWUsIG5hbWUpO1xuICAgICAgICBkZWxldGVQcm9taXNlcy5wdXNoKHByb21pc2UpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKFxuICAgICAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgICAgIGtleS5pbmRleE9mKCdfcF8nKSA9PT0gMCA/IGtleS5yZXBsYWNlKCdfcF8nLCAnJykgOiBrZXlcbiAgICAgICAgICAgIClcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgICAgYEZpZWxkICR7a2V5fSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGFkZCBpbmRleC5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGV4aXN0aW5nSW5kZXhlc1tuYW1lXSA9IGZpZWxkO1xuICAgICAgICBpbnNlcnRlZEluZGV4ZXMucHVzaCh7XG4gICAgICAgICAga2V5OiBmaWVsZCxcbiAgICAgICAgICBuYW1lLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBsZXQgaW5zZXJ0UHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChpbnNlcnRlZEluZGV4ZXMubGVuZ3RoID4gMCkge1xuICAgICAgaW5zZXJ0UHJvbWlzZSA9IHRoaXMuY3JlYXRlSW5kZXhlcyhjbGFzc05hbWUsIGluc2VydGVkSW5kZXhlcyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLmFsbChkZWxldGVQcm9taXNlcylcbiAgICAgIC50aGVuKCgpID0+IGluc2VydFByb21pc2UpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkpXG4gICAgICAudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgIHNjaGVtYUNvbGxlY3Rpb24udXBkYXRlU2NoZW1hKGNsYXNzTmFtZSwge1xuICAgICAgICAgICRzZXQ6IHsgJ19tZXRhZGF0YS5pbmRleGVzJzogZXhpc3RpbmdJbmRleGVzIH0sXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBzZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0SW5kZXhlcyhjbGFzc05hbWUpXG4gICAgICAudGhlbihpbmRleGVzID0+IHtcbiAgICAgICAgaW5kZXhlcyA9IGluZGV4ZXMucmVkdWNlKChvYmosIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGluZGV4LmtleS5fZnRzKSB7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHM7XG4gICAgICAgICAgICBkZWxldGUgaW5kZXgua2V5Ll9mdHN4O1xuICAgICAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBpbmRleC53ZWlnaHRzKSB7XG4gICAgICAgICAgICAgIGluZGV4LmtleVtmaWVsZF0gPSAndGV4dCc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIG9ialtpbmRleC5uYW1lXSA9IGluZGV4LmtleTtcbiAgICAgICAgICByZXR1cm4gb2JqO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKCkudGhlbihzY2hlbWFDb2xsZWN0aW9uID0+XG4gICAgICAgICAgc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCB7XG4gICAgICAgICAgICAkc2V0OiB7ICdfbWV0YWRhdGEuaW5kZXhlcyc6IGluZGV4ZXMgfSxcbiAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKVxuICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgLy8gSWdub3JlIGlmIGNvbGxlY3Rpb24gbm90IGZvdW5kXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSk6IFByb21pc2U8dm9pZD4ge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZUFuZENMUChcbiAgICAgIHNjaGVtYS5maWVsZHMsXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgc2NoZW1hLmluZGV4ZXNcbiAgICApO1xuICAgIG1vbmdvT2JqZWN0Ll9pZCA9IGNsYXNzTmFtZTtcbiAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChjbGFzc05hbWUsIHNjaGVtYS5pbmRleGVzLCB7fSwgc2NoZW1hLmZpZWxkcylcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi5pbnNlcnRTY2hlbWEobW9uZ29PYmplY3QpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KSB7XG4gICAgY29uc3Qgc2NoZW1hQ29sbGVjdGlvbiA9IGF3YWl0IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKTtcbiAgICBhd2FpdCBzY2hlbWFDb2xsZWN0aW9uLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gIH1cblxuICBhZGRGaWVsZElmTm90RXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKVxuICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLnRoZW4oKCkgPT4gdGhpcy5jcmVhdGVJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gRHJvcHMgYSBjb2xsZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRydWUgaWYgaXQgd2FzIGEgUGFyc2UgU2NoZW1hIChlZy4gX1VzZXIsIEN1c3RvbSwgZXRjLilcbiAgLy8gYW5kIHJlc29sdmVzIHdpdGggZmFsc2UgaWYgaXQgd2Fzbid0IChlZy4gYSBqb2luIHRhYmxlKS4gUmVqZWN0cyBpZiBkZWxldGlvbiB3YXMgaW1wb3NzaWJsZS5cbiAgZGVsZXRlQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLmRyb3AoKSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAvLyAnbnMgbm90IGZvdW5kJyBtZWFucyBjb2xsZWN0aW9uIHdhcyBhbHJlYWR5IGdvbmUuIElnbm9yZSBkZWxldGlvbiBhdHRlbXB0LlxuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlID09ICducyBub3QgZm91bmQnKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAvLyBXZSd2ZSBkcm9wcGVkIHRoZSBjb2xsZWN0aW9uLCBub3cgcmVtb3ZlIHRoZSBfU0NIRU1BIGRvY3VtZW50XG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgICAgLnRoZW4oc2NoZW1hQ29sbGVjdGlvbiA9PiBzY2hlbWFDb2xsZWN0aW9uLmZpbmRBbmREZWxldGVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgKTtcbiAgfVxuXG4gIGRlbGV0ZUFsbENsYXNzZXMoZmFzdDogYm9vbGVhbikge1xuICAgIHJldHVybiBzdG9yYWdlQWRhcHRlckFsbENvbGxlY3Rpb25zKHRoaXMpLnRoZW4oY29sbGVjdGlvbnMgPT5cbiAgICAgIFByb21pc2UuYWxsKFxuICAgICAgICBjb2xsZWN0aW9ucy5tYXAoY29sbGVjdGlvbiA9PiAoZmFzdCA/IGNvbGxlY3Rpb24uZGVsZXRlTWFueSh7fSkgOiBjb2xsZWN0aW9uLmRyb3AoKSkpXG4gICAgICApXG4gICAgKTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFBvaW50ZXIgZmllbGQgbmFtZXMgYXJlIHBhc3NlZCBmb3IgbGVnYWN5IHJlYXNvbnM6IHRoZSBvcmlnaW5hbCBtb25nb1xuICAvLyBmb3JtYXQgc3RvcmVkIHBvaW50ZXIgZmllbGQgbmFtZXMgZGlmZmVyZW50bHkgaW4gdGhlIGRhdGFiYXNlLCBhbmQgdGhlcmVmb3JlXG4gIC8vIG5lZWRlZCB0byBrbm93IHRoZSB0eXBlIG9mIHRoZSBmaWVsZCBiZWZvcmUgaXQgY291bGQgZGVsZXRlIGl0LiBGdXR1cmUgZGF0YWJhc2VcbiAgLy8gYWRhcHRlcnMgc2hvdWxkIGlnbm9yZSB0aGUgcG9pbnRlckZpZWxkTmFtZXMgYXJndW1lbnQuIEFsbCB0aGUgZmllbGQgbmFtZXMgYXJlIGluXG4gIC8vIGZpZWxkTmFtZXMsIHRoZXkgc2hvdyB1cCBhZGRpdGlvbmFsbHkgaW4gdGhlIHBvaW50ZXJGaWVsZE5hbWVzIGRhdGFiYXNlIGZvciB1c2VcbiAgLy8gYnkgdGhlIG1vbmdvIGFkYXB0ZXIsIHdoaWNoIGRlYWxzIHdpdGggdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuXG5cbiAgLy8gVGhpcyBmdW5jdGlvbiBpcyBub3Qgb2JsaWdhdGVkIHRvIGRlbGV0ZSBmaWVsZHMgYXRvbWljYWxseS4gSXQgaXMgZ2l2ZW4gdGhlIGZpZWxkXG4gIC8vIG5hbWVzIGluIGEgbGlzdCBzbyB0aGF0IGRhdGFiYXNlcyB0aGF0IGFyZSBjYXBhYmxlIG9mIGRlbGV0aW5nIGZpZWxkcyBhdG9taWNhbGx5XG4gIC8vIG1heSBkbyBzby5cblxuICAvLyBSZXR1cm5zIGEgUHJvbWlzZS5cbiAgZGVsZXRlRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgY29uc3QgbW9uZ29Gb3JtYXROYW1lcyA9IGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICByZXR1cm4gYF9wXyR7ZmllbGROYW1lfWA7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGROYW1lO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IGNvbGxlY3Rpb25VcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBtb25nb0Zvcm1hdE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb2xsZWN0aW9uVXBkYXRlWyckdW5zZXQnXVtuYW1lXSA9IG51bGw7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2xsZWN0aW9uRmlsdGVyID0geyAkb3I6IFtdIH07XG4gICAgbW9uZ29Gb3JtYXROYW1lcy5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgY29sbGVjdGlvbkZpbHRlclsnJG9yJ10ucHVzaCh7IFtuYW1lXTogeyAkZXhpc3RzOiB0cnVlIH0gfSk7XG4gICAgfSk7XG5cbiAgICBjb25zdCBzY2hlbWFVcGRhdGUgPSB7ICR1bnNldDoge30gfTtcbiAgICBmaWVsZE5hbWVzLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBzY2hlbWFVcGRhdGVbJyR1bnNldCddW25hbWVdID0gbnVsbDtcbiAgICAgIHNjaGVtYVVwZGF0ZVsnJHVuc2V0J11bYF9tZXRhZGF0YS5maWVsZHNfb3B0aW9ucy4ke25hbWV9YF0gPSBudWxsO1xuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShjb2xsZWN0aW9uRmlsdGVyLCBjb2xsZWN0aW9uVXBkYXRlKSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX3NjaGVtYUNvbGxlY3Rpb24oKSlcbiAgICAgIC50aGVuKHNjaGVtYUNvbGxlY3Rpb24gPT4gc2NoZW1hQ29sbGVjdGlvbi51cGRhdGVTY2hlbWEoY2xhc3NOYW1lLCBzY2hlbWFVcGRhdGUpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgYWxsIHNjaGVtYXMga25vd24gdG8gdGhpcyBhZGFwdGVyLCBpbiBQYXJzZSBmb3JtYXQuIEluIGNhc2UgdGhlXG4gIC8vIHNjaGVtYXMgY2Fubm90IGJlIHJldHJpZXZlZCwgcmV0dXJucyBhIHByb21pc2UgdGhhdCByZWplY3RzLiBSZXF1aXJlbWVudHMgZm9yIHRoZVxuICAvLyByZWplY3Rpb24gcmVhc29uIGFyZSBUQkQuXG4gIGdldEFsbENsYXNzZXMoKTogUHJvbWlzZTxTdG9yYWdlQ2xhc3NbXT4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaEFsbFNjaGVtYXNGcm9tX1NDSEVNQSgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gUmV0dXJuIGEgcHJvbWlzZSBmb3IgdGhlIHNjaGVtYSB3aXRoIHRoZSBnaXZlbiBuYW1lLCBpbiBQYXJzZSBmb3JtYXQuIElmXG4gIC8vIHRoaXMgYWRhcHRlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHNjaGVtYSwgcmV0dXJuIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMgd2l0aFxuICAvLyB1bmRlZmluZWQgYXMgdGhlIHJlYXNvbi5cbiAgZ2V0Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFN0b3JhZ2VDbGFzcz4ge1xuICAgIHJldHVybiB0aGlzLl9zY2hlbWFDb2xsZWN0aW9uKClcbiAgICAgIC50aGVuKHNjaGVtYXNDb2xsZWN0aW9uID0+IHNjaGVtYXNDb2xsZWN0aW9uLl9mZXRjaE9uZVNjaGVtYUZyb21fU0NIRU1BKGNsYXNzTmFtZSkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBUT0RPOiBBcyB5ZXQgbm90IHBhcnRpY3VsYXJseSB3ZWxsIHNwZWNpZmllZC4gQ3JlYXRlcyBhbiBvYmplY3QuIE1heWJlIHNob3VsZG4ndCBldmVuIG5lZWQgdGhlIHNjaGVtYSxcbiAgLy8gYW5kIHNob3VsZCBpbmZlciBmcm9tIHRoZSB0eXBlLiBPciBtYXliZSBkb2VzIG5lZWQgdGhlIHNjaGVtYSBmb3IgdmFsaWRhdGlvbnMuIE9yIG1heWJlIG5lZWRzXG4gIC8vIHRoZSBzY2hlbWEgb25seSBmb3IgdGhlIGxlZ2FjeSBtb25nbyBmb3JtYXQuIFdlJ2xsIGZpZ3VyZSB0aGF0IG91dCBsYXRlci5cbiAgY3JlYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIG9iamVjdDogYW55LCB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueSkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb09iamVjdCA9IHBhcnNlT2JqZWN0VG9Nb25nb09iamVjdEZvckNyZWF0ZShjbGFzc05hbWUsIG9iamVjdCwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5pbnNlcnRPbmUobW9uZ29PYmplY3QsIHRyYW5zYWN0aW9uYWxTZXNzaW9uKSlcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW21vbmdvT2JqZWN0XSB9KSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSAxMTAwMCkge1xuICAgICAgICAgIC8vIER1cGxpY2F0ZSB2YWx1ZVxuICAgICAgICAgIGNvbnN0IGVyciA9IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICk7XG4gICAgICAgICAgZXJyLnVuZGVybHlpbmdFcnJvciA9IGVycm9yO1xuICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gZXJyb3IubWVzc2FnZS5tYXRjaCgvaW5kZXg6W1xcc2EtekEtWjAtOV9cXC1cXC5dK1xcJD8oW2EtekEtWl8tXSspXzEvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4ge1xuICAgICAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICAgICAgcmV0dXJuIGNvbGxlY3Rpb24uZGVsZXRlTWFueShtb25nb1doZXJlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbik7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpXG4gICAgICAudGhlbihcbiAgICAgICAgKHsgZGVsZXRlZENvdW50IH0pID0+IHtcbiAgICAgICAgICBpZiAoZGVsZXRlZENvdW50ID09PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSxcbiAgICAgICAgKCkgPT4ge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsICdEYXRhYmFzZSBhZGFwdGVyIGVycm9yJyk7XG4gICAgICAgIH1cbiAgICAgICk7XG4gIH1cblxuICAvLyBBcHBseSB0aGUgdXBkYXRlIHRvIGFsbCBvYmplY3RzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIFBhcnNlIFF1ZXJ5LlxuICB1cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBkYXRlTWFueShtb25nb1doZXJlLCBtb25nb1VwZGF0ZSwgdHJhbnNhY3Rpb25hbFNlc3Npb24pKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSBmaW5kcyBhbmQgdXBkYXRlcyBhbiBvYmplY3QgYmFzZWQgb24gcXVlcnkuXG4gIC8vIFJldHVybiB2YWx1ZSBub3QgY3VycmVudGx5IHdlbGwgc3BlY2lmaWVkLlxuICBmaW5kT25lQW5kVXBkYXRlKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHVwZGF0ZTogYW55LFxuICAgIHRyYW5zYWN0aW9uYWxTZXNzaW9uOiA/YW55XG4gICkge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1VwZGF0ZSA9IHRyYW5zZm9ybVVwZGF0ZShjbGFzc05hbWUsIHVwZGF0ZSwgc2NoZW1hKTtcbiAgICBjb25zdCBtb25nb1doZXJlID0gdHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hKTtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmZpbmRPbmVBbmRVcGRhdGUobW9uZ29XaGVyZSwgbW9uZ29VcGRhdGUsIHtcbiAgICAgICAgICByZXR1cm5Eb2N1bWVudDogJ2FmdGVyJyxcbiAgICAgICAgICBzZXNzaW9uOiB0cmFuc2FjdGlvbmFsU2Vzc2lvbiB8fCB1bmRlZmluZWQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHQgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgcmVzdWx0LnZhbHVlLCBzY2hlbWEpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IDExMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBIb3BlZnVsbHkgd2UgY2FuIGdldCByaWQgb2YgdGhpcy4gSXQncyBvbmx5IHVzZWQgZm9yIGNvbmZpZyBhbmQgaG9va3MuXG4gIHVwc2VydE9uZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB0cmFuc2FjdGlvbmFsU2Vzc2lvbjogP2FueVxuICApIHtcbiAgICBzY2hlbWEgPSBjb252ZXJ0UGFyc2VTY2hlbWFUb01vbmdvU2NoZW1hKHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29VcGRhdGUgPSB0cmFuc2Zvcm1VcGRhdGUoY2xhc3NOYW1lLCB1cGRhdGUsIHNjaGVtYSk7XG4gICAgY29uc3QgbW9uZ29XaGVyZSA9IHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24udXBzZXJ0T25lKG1vbmdvV2hlcmUsIG1vbmdvVXBkYXRlLCB0cmFuc2FjdGlvbmFsU2Vzc2lvbikpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGZpbmQuIEFjY2VwdHM6IGNsYXNzTmFtZSwgcXVlcnkgaW4gUGFyc2UgZm9ybWF0LCBhbmQgeyBza2lwLCBsaW1pdCwgc29ydCB9LlxuICBmaW5kKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlLFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBjYXNlSW5zZW5zaXRpdmUsIGV4cGxhaW4gfTogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgdmFsaWRhdGVFeHBsYWluVmFsdWUoZXhwbGFpbik7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvV2hlcmUgPSB0cmFuc2Zvcm1XaGVyZShjbGFzc05hbWUsIHF1ZXJ5LCBzY2hlbWEpO1xuICAgIGNvbnN0IG1vbmdvU29ydCA9IF8ubWFwS2V5cyhzb3J0LCAodmFsdWUsIGZpZWxkTmFtZSkgPT5cbiAgICAgIHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKVxuICAgICk7XG4gICAgY29uc3QgbW9uZ29LZXlzID0gXy5yZWR1Y2UoXG4gICAgICBrZXlzLFxuICAgICAgKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBpZiAoa2V5ID09PSAnQUNMJykge1xuICAgICAgICAgIG1lbW9bJ19ycGVybSddID0gMTtcbiAgICAgICAgICBtZW1vWydfd3Blcm0nXSA9IDE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgbWVtb1t0cmFuc2Zvcm1LZXkoY2xhc3NOYW1lLCBrZXksIHNjaGVtYSldID0gMTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sXG4gICAgICB7fVxuICAgICk7XG5cbiAgICAvLyBJZiB3ZSBhcmVuJ3QgcmVxdWVzdGluZyB0aGUgYF9pZGAgZmllbGQsIHdlIG5lZWQgdG8gZXhwbGljaXRseSBvcHQgb3V0XG4gICAgLy8gb2YgaXQuIERvaW5nIHNvIGluIHBhcnNlLXNlcnZlciBpcyB1bnVzdWFsLCBidXQgaXQgY2FuIGFsbG93IHVzIHRvXG4gICAgLy8gb3B0aW1pemUgc29tZSBxdWVyaWVzIHdpdGggY292ZXJpbmcgaW5kZXhlcy5cbiAgICBpZiAoa2V5cyAmJiAhbW9uZ29LZXlzLl9pZCkge1xuICAgICAgbW9uZ29LZXlzLl9pZCA9IDA7XG4gICAgfVxuXG4gICAgcmVhZFByZWZlcmVuY2UgPSB0aGlzLl9wYXJzZVJlYWRQcmVmZXJlbmNlKHJlYWRQcmVmZXJlbmNlKTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVUZXh0SW5kZXhlc0lmTmVlZGVkKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmZpbmQobW9uZ29XaGVyZSwge1xuICAgICAgICAgIHNraXAsXG4gICAgICAgICAgbGltaXQsXG4gICAgICAgICAgc29ydDogbW9uZ29Tb3J0LFxuICAgICAgICAgIGtleXM6IG1vbmdvS2V5cyxcbiAgICAgICAgICBtYXhUaW1lTVM6IHRoaXMuX21heFRpbWVNUyxcbiAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBoaW50LFxuICAgICAgICAgIGNhc2VJbnNlbnNpdGl2ZSxcbiAgICAgICAgICBleHBsYWluLFxuICAgICAgICB9KVxuICAgICAgKVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiB7XG4gICAgICAgIGlmIChleHBsYWluKSB7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG9iamVjdHMubWFwKG9iamVjdCA9PiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGVuc3VyZUluZGV4KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBmaWVsZE5hbWVzOiBzdHJpbmdbXSxcbiAgICBpbmRleE5hbWU6ID9zdHJpbmcsXG4gICAgY2FzZUluc2Vuc2l0aXZlOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9ucz86IE9iamVjdCA9IHt9XG4gICk6IFByb21pc2U8YW55PiB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSBvcHRpb25zLmluZGV4VHlwZSAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5pbmRleFR5cGUgOiAxO1xuICAgIH0pO1xuXG4gICAgY29uc3QgZGVmYXVsdE9wdGlvbnM6IE9iamVjdCA9IHsgYmFja2dyb3VuZDogdHJ1ZSwgc3BhcnNlOiB0cnVlIH07XG4gICAgY29uc3QgaW5kZXhOYW1lT3B0aW9uczogT2JqZWN0ID0gaW5kZXhOYW1lID8geyBuYW1lOiBpbmRleE5hbWUgfSA6IHt9O1xuICAgIGNvbnN0IHR0bE9wdGlvbnM6IE9iamVjdCA9IG9wdGlvbnMudHRsICE9PSB1bmRlZmluZWQgPyB7IGV4cGlyZUFmdGVyU2Vjb25kczogb3B0aW9ucy50dGwgfSA6IHt9O1xuICAgIGNvbnN0IGNhc2VJbnNlbnNpdGl2ZU9wdGlvbnM6IE9iamVjdCA9IGNhc2VJbnNlbnNpdGl2ZVxuICAgICAgPyB7IGNvbGxhdGlvbjogTW9uZ29Db2xsZWN0aW9uLmNhc2VJbnNlbnNpdGl2ZUNvbGxhdGlvbigpIH1cbiAgICAgIDoge307XG4gICAgY29uc3QgaW5kZXhPcHRpb25zOiBPYmplY3QgPSB7XG4gICAgICAuLi5kZWZhdWx0T3B0aW9ucyxcbiAgICAgIC4uLmNhc2VJbnNlbnNpdGl2ZU9wdGlvbnMsXG4gICAgICAuLi5pbmRleE5hbWVPcHRpb25zLFxuICAgICAgLi4udHRsT3B0aW9ucyxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihcbiAgICAgICAgY29sbGVjdGlvbiA9PlxuICAgICAgICAgIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+XG4gICAgICAgICAgICBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXgoaW5kZXhDcmVhdGlvblJlcXVlc3QsIGluZGV4T3B0aW9ucywgZXJyb3IgPT5cbiAgICAgICAgICAgICAgZXJyb3IgPyByZWplY3QoZXJyb3IpIDogcmVzb2x2ZSgpXG4gICAgICAgICAgICApXG4gICAgICAgICAgKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgdW5pcXVlIGluZGV4LiBVbmlxdWUgaW5kZXhlcyBvbiBudWxsYWJsZSBmaWVsZHMgYXJlIG5vdCBhbGxvd2VkLiBTaW5jZSB3ZSBkb24ndFxuICAvLyBjdXJyZW50bHkga25vdyB3aGljaCBmaWVsZHMgYXJlIG51bGxhYmxlIGFuZCB3aGljaCBhcmVuJ3QsIHdlIGlnbm9yZSB0aGF0IGNyaXRlcmlhLlxuICAvLyBBcyBzdWNoLCB3ZSBzaG91bGRuJ3QgZXhwb3NlIHRoaXMgZnVuY3Rpb24gdG8gdXNlcnMgb2YgcGFyc2UgdW50aWwgd2UgaGF2ZSBhbiBvdXQtb2YtYmFuZFxuICAvLyBXYXkgb2YgZGV0ZXJtaW5pbmcgaWYgYSBmaWVsZCBpcyBudWxsYWJsZS4gVW5kZWZpbmVkIGRvZXNuJ3QgY291bnQgYWdhaW5zdCB1bmlxdWVuZXNzLFxuICAvLyB3aGljaCBpcyB3aHkgd2UgdXNlIHNwYXJzZSBpbmRleGVzLlxuICBlbnN1cmVVbmlxdWVuZXNzKGNsYXNzTmFtZTogc3RyaW5nLCBzY2hlbWE6IFNjaGVtYVR5cGUsIGZpZWxkTmFtZXM6IHN0cmluZ1tdKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGluZGV4Q3JlYXRpb25SZXF1ZXN0ID0ge307XG4gICAgY29uc3QgbW9uZ29GaWVsZE5hbWVzID0gZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHRyYW5zZm9ybUtleShjbGFzc05hbWUsIGZpZWxkTmFtZSwgc2NoZW1hKSk7XG4gICAgbW9uZ29GaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGluZGV4Q3JlYXRpb25SZXF1ZXN0W2ZpZWxkTmFtZV0gPSAxO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleENyZWF0aW9uUmVxdWVzdCkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gMTEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAnVHJpZWQgdG8gZW5zdXJlIGZpZWxkIHVuaXF1ZW5lc3MgZm9yIGEgY2xhc3MgdGhhdCBhbHJlYWR5IGhhcyBkdXBsaWNhdGVzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFVzZWQgaW4gdGVzdHNcbiAgX3Jhd0ZpbmQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT5cbiAgICAgICAgY29sbGVjdGlvbi5maW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgbWF4VGltZU1TOiB0aGlzLl9tYXhUaW1lTVMsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZTogP3N0cmluZyxcbiAgICBoaW50OiA/bWl4ZWRcbiAgKSB7XG4gICAgc2NoZW1hID0gY29udmVydFBhcnNlU2NoZW1hVG9Nb25nb1NjaGVtYShzY2hlbWEpO1xuICAgIHJlYWRQcmVmZXJlbmNlID0gdGhpcy5fcGFyc2VSZWFkUHJlZmVyZW5jZShyZWFkUHJlZmVyZW5jZSk7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uY291bnQodHJhbnNmb3JtV2hlcmUoY2xhc3NOYW1lLCBxdWVyeSwgc2NoZW1hLCB0cnVlKSwge1xuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBkaXN0aW5jdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBxdWVyeTogUXVlcnlUeXBlLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHNjaGVtYSA9IGNvbnZlcnRQYXJzZVNjaGVtYVRvTW9uZ29TY2hlbWEoc2NoZW1hKTtcbiAgICBjb25zdCBpc1BvaW50ZXJGaWVsZCA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ1BvaW50ZXInO1xuICAgIGNvbnN0IHRyYW5zZm9ybUZpZWxkID0gdHJhbnNmb3JtS2V5KGNsYXNzTmFtZSwgZmllbGROYW1lLCBzY2hlbWEpO1xuXG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+XG4gICAgICAgIGNvbGxlY3Rpb24uZGlzdGluY3QodHJhbnNmb3JtRmllbGQsIHRyYW5zZm9ybVdoZXJlKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYSkpXG4gICAgICApXG4gICAgICAudGhlbihvYmplY3RzID0+IHtcbiAgICAgICAgb2JqZWN0cyA9IG9iamVjdHMuZmlsdGVyKG9iaiA9PiBvYmogIT0gbnVsbCk7XG4gICAgICAgIHJldHVybiBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgcmV0dXJuIHRyYW5zZm9ybVBvaW50ZXJTdHJpbmcoc2NoZW1hLCBmaWVsZE5hbWUsIG9iamVjdCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb25nb09iamVjdFRvUGFyc2VPYmplY3QoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGFnZ3JlZ2F0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IGFueSxcbiAgICBwaXBlbGluZTogYW55LFxuICAgIHJlYWRQcmVmZXJlbmNlOiA/c3RyaW5nLFxuICAgIGhpbnQ6ID9taXhlZCxcbiAgICBleHBsYWluPzogYm9vbGVhblxuICApIHtcbiAgICB2YWxpZGF0ZUV4cGxhaW5WYWx1ZShleHBsYWluKTtcbiAgICBsZXQgaXNQb2ludGVyRmllbGQgPSBmYWxzZTtcbiAgICBwaXBlbGluZSA9IHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBpZiAoc3RhZ2UuJGdyb3VwKSB7XG4gICAgICAgIHN0YWdlLiRncm91cCA9IHRoaXMuX3BhcnNlQWdncmVnYXRlR3JvdXBBcmdzKHNjaGVtYSwgc3RhZ2UuJGdyb3VwKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHN0YWdlLiRncm91cC5faWQgJiZcbiAgICAgICAgICB0eXBlb2Ygc3RhZ2UuJGdyb3VwLl9pZCA9PT0gJ3N0cmluZycgJiZcbiAgICAgICAgICBzdGFnZS4kZ3JvdXAuX2lkLmluZGV4T2YoJyRfcF8nKSA+PSAwXG4gICAgICAgICkge1xuICAgICAgICAgIGlzUG9pbnRlckZpZWxkID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRtYXRjaCkge1xuICAgICAgICBzdGFnZS4kbWF0Y2ggPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBzdGFnZS4kbWF0Y2gpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIHN0YWdlLiRwcm9qZWN0ID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWEsIHN0YWdlLiRwcm9qZWN0KTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kZ2VvTmVhciAmJiBzdGFnZS4kZ2VvTmVhci5xdWVyeSkge1xuICAgICAgICBzdGFnZS4kZ2VvTmVhci5xdWVyeSA9IHRoaXMuX3BhcnNlQWdncmVnYXRlQXJncyhzY2hlbWEsIHN0YWdlLiRnZW9OZWFyLnF1ZXJ5KTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdGFnZTtcbiAgICB9KTtcbiAgICByZWFkUHJlZmVyZW5jZSA9IHRoaXMuX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2UpO1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PlxuICAgICAgICBjb2xsZWN0aW9uLmFnZ3JlZ2F0ZShwaXBlbGluZSwge1xuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIG1heFRpbWVNUzogdGhpcy5fbWF4VGltZU1TLFxuICAgICAgICAgIGhpbnQsXG4gICAgICAgICAgZXhwbGFpbixcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3VsdCwgJ19pZCcpKSB7XG4gICAgICAgICAgICBpZiAoaXNQb2ludGVyRmllbGQgJiYgcmVzdWx0Ll9pZCkge1xuICAgICAgICAgICAgICByZXN1bHQuX2lkID0gcmVzdWx0Ll9pZC5zcGxpdCgnJCcpWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICByZXN1bHQuX2lkID09IG51bGwgfHxcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKFsnb2JqZWN0JywgJ3N0cmluZyddLmluY2x1ZGVzKHR5cGVvZiByZXN1bHQuX2lkKSAmJiBfLmlzRW1wdHkocmVzdWx0Ll9pZCkpXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgcmVzdWx0Ll9pZCA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSByZXN1bHQuX2lkO1xuICAgICAgICAgICAgZGVsZXRlIHJlc3VsdC5faWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KVxuICAgICAgLnRoZW4ob2JqZWN0cyA9PiBvYmplY3RzLm1hcChvYmplY3QgPT4gbW9uZ29PYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gd2lsbCByZWN1cnNpdmVseSB0cmF2ZXJzZSB0aGUgcGlwZWxpbmUgYW5kIGNvbnZlcnQgYW55IFBvaW50ZXIgb3IgRGF0ZSBjb2x1bW5zLlxuICAvLyBJZiB3ZSBkZXRlY3QgYSBwb2ludGVyIGNvbHVtbiB3ZSB3aWxsIHJlbmFtZSB0aGUgY29sdW1uIGJlaW5nIHF1ZXJpZWQgZm9yIHRvIG1hdGNoIHRoZSBjb2x1bW5cbiAgLy8gaW4gdGhlIGRhdGFiYXNlLiBXZSBhbHNvIG1vZGlmeSB0aGUgdmFsdWUgdG8gd2hhdCB3ZSBleHBlY3QgdGhlIHZhbHVlIHRvIGJlIGluIHRoZSBkYXRhYmFzZVxuICAvLyBhcyB3ZWxsLlxuICAvLyBGb3IgZGF0ZXMsIHRoZSBkcml2ZXIgZXhwZWN0cyBhIERhdGUgb2JqZWN0LCBidXQgd2UgaGF2ZSBhIHN0cmluZyBjb21pbmcgaW4uIFNvIHdlJ2xsIGNvbnZlcnRcbiAgLy8gdGhlIHN0cmluZyB0byBhIERhdGUgc28gdGhlIGRyaXZlciBjYW4gcGVyZm9ybSB0aGUgbmVjZXNzYXJ5IGNvbXBhcmlzb24uXG4gIC8vXG4gIC8vIFRoZSBnb2FsIG9mIHRoaXMgbWV0aG9kIGlzIHRvIGxvb2sgZm9yIHRoZSBcImxlYXZlc1wiIG9mIHRoZSBwaXBlbGluZSBhbmQgZGV0ZXJtaW5lIGlmIGl0IG5lZWRzXG4gIC8vIHRvIGJlIGNvbnZlcnRlZC4gVGhlIHBpcGVsaW5lIGNhbiBoYXZlIGEgZmV3IGRpZmZlcmVudCBmb3Jtcy4gRm9yIG1vcmUgZGV0YWlscywgc2VlOlxuICAvLyAgICAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9yZWZlcmVuY2Uvb3BlcmF0b3IvYWdncmVnYXRpb24vXG4gIC8vXG4gIC8vIElmIHRoZSBwaXBlbGluZSBpcyBhbiBhcnJheSwgaXQgbWVhbnMgd2UgYXJlIHByb2JhYmx5IHBhcnNpbmcgYW4gJyRhbmQnIG9yICckb3InIG9wZXJhdG9yLiBJblxuICAvLyB0aGF0IGNhc2Ugd2UgbmVlZCB0byBsb29wIHRocm91Z2ggYWxsIG9mIGl0J3MgY2hpbGRyZW4gdG8gZmluZCB0aGUgY29sdW1ucyBiZWluZyBvcGVyYXRlZCBvbi5cbiAgLy8gSWYgdGhlIHBpcGVsaW5lIGlzIGFuIG9iamVjdCwgdGhlbiB3ZSdsbCBsb29wIHRocm91Z2ggdGhlIGtleXMgY2hlY2tpbmcgdG8gc2VlIGlmIHRoZSBrZXkgbmFtZVxuICAvLyBtYXRjaGVzIG9uZSBvZiB0aGUgc2NoZW1hIGNvbHVtbnMuIElmIGl0IGRvZXMgbWF0Y2ggYSBjb2x1bW4gYW5kIHRoZSBjb2x1bW4gaXMgYSBQb2ludGVyIG9yXG4gIC8vIGEgRGF0ZSwgdGhlbiB3ZSdsbCBjb252ZXJ0IHRoZSB2YWx1ZSBhcyBkZXNjcmliZWQgYWJvdmUuXG4gIC8vXG4gIC8vIEFzIG11Y2ggYXMgSSBoYXRlIHJlY3Vyc2lvbi4uLnRoaXMgc2VlbWVkIGxpa2UgYSBnb29kIGZpdCBmb3IgaXQuIFdlJ3JlIGVzc2VudGlhbGx5IHRyYXZlcnNpbmdcbiAgLy8gZG93biBhIHRyZWUgdG8gZmluZCBhIFwibGVhZiBub2RlXCIgYW5kIGNoZWNraW5nIHRvIHNlZSBpZiBpdCBuZWVkcyB0byBiZSBjb252ZXJ0ZWQuXG4gIF9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChwaXBlbGluZSA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCB2YWx1ZSkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHBpcGVsaW5lID09PSAnb2JqZWN0Jykge1xuICAgICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICAgIGZvciAoY29uc3QgZmllbGQgaW4gcGlwZWxpbmUpIHtcbiAgICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgICAgIGlmICh0eXBlb2YgcGlwZWxpbmVbZmllbGRdID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgLy8gUGFzcyBvYmplY3RzIGRvd24gdG8gTW9uZ29EQi4uLnRoaXMgaXMgbW9yZSB0aGFuIGxpa2VseSBhbiAkZXhpc3RzIG9wZXJhdG9yLlxuICAgICAgICAgICAgcmV0dXJuVmFsdWVbYF9wXyR7ZmllbGR9YF0gPSBwaXBlbGluZVtmaWVsZF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gYCR7c2NoZW1hLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3N9JCR7cGlwZWxpbmVbZmllbGRdfWA7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdICYmIHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdEYXRlJykge1xuICAgICAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUocGlwZWxpbmVbZmllbGRdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUFyZ3Moc2NoZW1hLCBwaXBlbGluZVtmaWVsZF0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19pZCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgICAgcmV0dXJuVmFsdWVbJ19jcmVhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgICByZXR1cm5WYWx1ZVsnX3VwZGF0ZWRfYXQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfVxuICAgIHJldHVybiBwaXBlbGluZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIG9uZSBhYm92ZS4gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNvbWJpbmUgdGhlc2VcbiAgLy8gdHdvIGZ1bmN0aW9ucyBhbmQgbWFraW5nIHRoZSBjb2RlIGV2ZW4gaGFyZGVyIHRvIHVuZGVyc3RhbmQsIEkgZGVjaWRlZCB0byBzcGxpdCBpdCB1cC4gVGhlXG4gIC8vIGRpZmZlcmVuY2Ugd2l0aCB0aGlzIGZ1bmN0aW9uIGlzIHdlIGFyZSBub3QgdHJhbnNmb3JtaW5nIHRoZSB2YWx1ZXMsIG9ubHkgdGhlIGtleXMgb2YgdGhlXG4gIC8vIHBpcGVsaW5lLlxuICBfcGFyc2VBZ2dyZWdhdGVQcm9qZWN0QXJncyhzY2hlbWE6IGFueSwgcGlwZWxpbmU6IGFueSk6IGFueSB7XG4gICAgY29uc3QgcmV0dXJuVmFsdWUgPSB7fTtcbiAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHBpcGVsaW5lKSB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZF0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICAgIHJldHVyblZhbHVlW2BfcF8ke2ZpZWxkfWBdID0gcGlwZWxpbmVbZmllbGRdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbZmllbGRdID0gdGhpcy5fcGFyc2VBZ2dyZWdhdGVBcmdzKHNjaGVtYSwgcGlwZWxpbmVbZmllbGRdKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGZpZWxkID09PSAnb2JqZWN0SWQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfaWQnXSA9IHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgICAgZGVsZXRlIHJldHVyblZhbHVlW2ZpZWxkXTtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGQgPT09ICdjcmVhdGVkQXQnKSB7XG4gICAgICAgIHJldHVyblZhbHVlWydfY3JlYXRlZF9hdCddID0gcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgICBkZWxldGUgcmV0dXJuVmFsdWVbZmllbGRdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgcmV0dXJuVmFsdWVbJ191cGRhdGVkX2F0J10gPSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICAgIGRlbGV0ZSByZXR1cm5WYWx1ZVtmaWVsZF07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXR1cm5WYWx1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgc2xpZ2h0bHkgZGlmZmVyZW50IHRoYW4gdGhlIHR3byBhYm92ZS4gTW9uZ29EQiAkZ3JvdXAgYWdncmVnYXRlIGxvb2tzIGxpa2U6XG4gIC8vICAgICB7ICRncm91cDogeyBfaWQ6IDxleHByZXNzaW9uPiwgPGZpZWxkMT46IHsgPGFjY3VtdWxhdG9yMT4gOiA8ZXhwcmVzc2lvbjE+IH0sIC4uLiB9IH1cbiAgLy8gVGhlIDxleHByZXNzaW9uPiBjb3VsZCBiZSBhIGNvbHVtbiBuYW1lLCBwcmVmaXhlZCB3aXRoIHRoZSAnJCcgY2hhcmFjdGVyLiBXZSdsbCBsb29rIGZvclxuICAvLyB0aGVzZSA8ZXhwcmVzc2lvbj4gYW5kIGNoZWNrIHRvIHNlZSBpZiBpdCBpcyBhICdQb2ludGVyJyBvciBpZiBpdCdzIG9uZSBvZiBjcmVhdGVkQXQsXG4gIC8vIHVwZGF0ZWRBdCBvciBvYmplY3RJZCBhbmQgY2hhbmdlIGl0IGFjY29yZGluZ2x5LlxuICBfcGFyc2VBZ2dyZWdhdGVHcm91cEFyZ3Moc2NoZW1hOiBhbnksIHBpcGVsaW5lOiBhbnkpOiBhbnkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBpcGVsaW5lKSkge1xuICAgICAgcmV0dXJuIHBpcGVsaW5lLm1hcCh2YWx1ZSA9PiB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHZhbHVlKSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdvYmplY3QnKSB7XG4gICAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBwaXBlbGluZSkge1xuICAgICAgICByZXR1cm5WYWx1ZVtmaWVsZF0gPSB0aGlzLl9wYXJzZUFnZ3JlZ2F0ZUdyb3VwQXJncyhzY2hlbWEsIHBpcGVsaW5lW2ZpZWxkXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0dXJuVmFsdWU7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcGlwZWxpbmUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBjb25zdCBmaWVsZCA9IHBpcGVsaW5lLnN1YnN0cmluZygxKTtcbiAgICAgIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgcmV0dXJuIGAkX3BfJHtmaWVsZH1gO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZCA9PSAnY3JlYXRlZEF0Jykge1xuICAgICAgICByZXR1cm4gJyRfY3JlYXRlZF9hdCc7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkID09ICd1cGRhdGVkQXQnKSB7XG4gICAgICAgIHJldHVybiAnJF91cGRhdGVkX2F0JztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHBpcGVsaW5lO1xuICB9XG5cbiAgLy8gVGhpcyBmdW5jdGlvbiB3aWxsIGF0dGVtcHQgdG8gY29udmVydCB0aGUgcHJvdmlkZWQgdmFsdWUgdG8gYSBEYXRlIG9iamVjdC4gU2luY2UgdGhpcyBpcyBwYXJ0XG4gIC8vIG9mIGFuIGFnZ3JlZ2F0aW9uIHBpcGVsaW5lLCB0aGUgdmFsdWUgY2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBpdCBjYW4gYmUgYW5vdGhlciBvYmplY3Qgd2l0aFxuICAvLyBhbiBvcGVyYXRvciBpbiBpdCAobGlrZSAkZ3QsICRsdCwgZXRjKS4gQmVjYXVzZSBvZiB0aGlzIEkgZmVsdCBpdCB3YXMgZWFzaWVyIHRvIG1ha2UgdGhpcyBhXG4gIC8vIHJlY3Vyc2l2ZSBtZXRob2QgdG8gdHJhdmVyc2UgZG93biB0byB0aGUgXCJsZWFmIG5vZGVcIiB3aGljaCBpcyBnb2luZyB0byBiZSB0aGUgc3RyaW5nLlxuICBfY29udmVydFRvRGF0ZSh2YWx1ZTogYW55KTogYW55IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKHZhbHVlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXR1cm5WYWx1ZSA9IHt9O1xuICAgIGZvciAoY29uc3QgZmllbGQgaW4gdmFsdWUpIHtcbiAgICAgIHJldHVyblZhbHVlW2ZpZWxkXSA9IHRoaXMuX2NvbnZlcnRUb0RhdGUodmFsdWVbZmllbGRdKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldHVyblZhbHVlO1xuICB9XG5cbiAgX3BhcnNlUmVhZFByZWZlcmVuY2UocmVhZFByZWZlcmVuY2U6ID9zdHJpbmcpOiA/c3RyaW5nIHtcbiAgICBpZiAocmVhZFByZWZlcmVuY2UpIHtcbiAgICAgIHJlYWRQcmVmZXJlbmNlID0gcmVhZFByZWZlcmVuY2UudG9VcHBlckNhc2UoKTtcbiAgICB9XG4gICAgc3dpdGNoIChyZWFkUHJlZmVyZW5jZSkge1xuICAgICAgY2FzZSAnUFJJTUFSWSc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQUklNQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuUFJJTUFSWV9QUkVGRVJSRUQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5TRUNPTkRBUlk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnU0VDT05EQVJZX1BSRUZFUlJFRCc6XG4gICAgICAgIHJlYWRQcmVmZXJlbmNlID0gUmVhZFByZWZlcmVuY2UuU0VDT05EQVJZX1BSRUZFUlJFRDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdORUFSRVNUJzpcbiAgICAgICAgcmVhZFByZWZlcmVuY2UgPSBSZWFkUHJlZmVyZW5jZS5ORUFSRVNUO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgdW5kZWZpbmVkOlxuICAgICAgY2FzZSBudWxsOlxuICAgICAgY2FzZSAnJzpcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSwgJ05vdCBzdXBwb3J0ZWQgcmVhZCBwcmVmZXJlbmNlLicpO1xuICAgIH1cbiAgICByZXR1cm4gcmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgY3JlYXRlSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4OiBhbnkpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KGluZGV4KSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4ZXM6IGFueSkge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uY3JlYXRlSW5kZXhlcyhpbmRleGVzKSlcbiAgICAgIC5jYXRjaChlcnIgPT4gdGhpcy5oYW5kbGVFcnJvcihlcnIpKTtcbiAgfVxuXG4gIGNyZWF0ZUluZGV4ZXNJZk5lZWRlZChjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcsIHR5cGU6IGFueSkge1xuICAgIGlmICh0eXBlICYmIHR5cGUudHlwZSA9PT0gJ1BvbHlnb24nKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHtcbiAgICAgICAgW2ZpZWxkTmFtZV06ICcyZHNwaGVyZScsXG4gICAgICB9O1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlSW5kZXgoY2xhc3NOYW1lLCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNyZWF0ZVRleHRJbmRleGVzSWZOZWVkZWQoY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBRdWVyeVR5cGUsIHNjaGVtYTogYW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gcXVlcnkpIHtcbiAgICAgIGlmICghcXVlcnlbZmllbGROYW1lXSB8fCAhcXVlcnlbZmllbGROYW1lXS4kdGV4dCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgZm9yIChjb25zdCBrZXkgaW4gZXhpc3RpbmdJbmRleGVzKSB7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gZXhpc3RpbmdJbmRleGVzW2tleV07XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5kZXgsIGZpZWxkTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IGluZGV4TmFtZSA9IGAke2ZpZWxkTmFtZX1fdGV4dGA7XG4gICAgICBjb25zdCB0ZXh0SW5kZXggPSB7XG4gICAgICAgIFtpbmRleE5hbWVdOiB7IFtmaWVsZE5hbWVdOiAndGV4dCcgfSxcbiAgICAgIH07XG4gICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB0ZXh0SW5kZXgsXG4gICAgICAgIGV4aXN0aW5nSW5kZXhlcyxcbiAgICAgICAgc2NoZW1hLmZpZWxkc1xuICAgICAgKS5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSA4NSkge1xuICAgICAgICAgIC8vIEluZGV4IGV4aXN0IHdpdGggZGlmZmVyZW50IG9wdGlvbnNcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgZ2V0SW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9hZGFwdGl2ZUNvbGxlY3Rpb24oY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oY29sbGVjdGlvbiA9PiBjb2xsZWN0aW9uLl9tb25nb0NvbGxlY3Rpb24uaW5kZXhlcygpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleDogYW55KSB7XG4gICAgcmV0dXJuIHRoaXMuX2FkYXB0aXZlQ29sbGVjdGlvbihjbGFzc05hbWUpXG4gICAgICAudGhlbihjb2xsZWN0aW9uID0+IGNvbGxlY3Rpb24uX21vbmdvQ29sbGVjdGlvbi5kcm9wSW5kZXgoaW5kZXgpKVxuICAgICAgLmNhdGNoKGVyciA9PiB0aGlzLmhhbmRsZUVycm9yKGVycikpO1xuICB9XG5cbiAgZHJvcEFsbEluZGV4ZXMoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gdGhpcy5fYWRhcHRpdmVDb2xsZWN0aW9uKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKGNvbGxlY3Rpb24gPT4gY29sbGVjdGlvbi5fbW9uZ29Db2xsZWN0aW9uLmRyb3BJbmRleGVzKCkpXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICB1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcygpOiBQcm9taXNlPGFueT4ge1xuICAgIHJldHVybiB0aGlzLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oY2xhc3NlcyA9PiB7XG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gY2xhc3Nlcy5tYXAoc2NoZW1hID0+IHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5zZXRJbmRleGVzRnJvbU1vbmdvKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyID0+IHRoaXMuaGFuZGxlRXJyb3IoZXJyKSk7XG4gIH1cblxuICBjcmVhdGVUcmFuc2FjdGlvbmFsU2Vzc2lvbigpOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IHRyYW5zYWN0aW9uYWxTZWN0aW9uID0gdGhpcy5jbGllbnQuc3RhcnRTZXNzaW9uKCk7XG4gICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uc3RhcnRUcmFuc2FjdGlvbigpO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJhbnNhY3Rpb25hbFNlY3Rpb24pO1xuICB9XG5cbiAgY29tbWl0VHJhbnNhY3Rpb25hbFNlc3Npb24odHJhbnNhY3Rpb25hbFNlY3Rpb246IGFueSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbW1pdCA9IHJldHJpZXMgPT4ge1xuICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uYWxTZWN0aW9uXG4gICAgICAgIC5jb21taXRUcmFuc2FjdGlvbigpXG4gICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmhhc0Vycm9yTGFiZWwoJ1RyYW5zaWVudFRyYW5zYWN0aW9uRXJyb3InKSAmJiByZXRyaWVzID4gMCkge1xuICAgICAgICAgICAgcmV0dXJuIGNvbW1pdChyZXRyaWVzIC0gMSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgICAgICB9KTtcbiAgICB9O1xuICAgIHJldHVybiBjb21taXQoNSk7XG4gIH1cblxuICBhYm9ydFRyYW5zYWN0aW9uYWxTZXNzaW9uKHRyYW5zYWN0aW9uYWxTZWN0aW9uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdHJhbnNhY3Rpb25hbFNlY3Rpb24uYWJvcnRUcmFuc2FjdGlvbigpLnRoZW4oKCkgPT4ge1xuICAgICAgdHJhbnNhY3Rpb25hbFNlY3Rpb24uZW5kU2Vzc2lvbigpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IE1v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