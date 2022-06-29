"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Types = void 0;
exports._unregisterAll = _unregisterAll;
exports.addConnectTrigger = addConnectTrigger;
exports.addFileTrigger = addFileTrigger;
exports.addFunction = addFunction;
exports.addJob = addJob;
exports.addLiveQueryEventHandler = addLiveQueryEventHandler;
exports.addTrigger = addTrigger;
exports.getClassName = getClassName;
exports.getFileTrigger = getFileTrigger;
exports.getFunction = getFunction;
exports.getFunctionNames = getFunctionNames;
exports.getJob = getJob;
exports.getJobs = getJobs;
exports.getRequestFileObject = getRequestFileObject;
exports.getRequestObject = getRequestObject;
exports.getRequestQueryObject = getRequestQueryObject;
exports.getResponseObject = getResponseObject;
exports.getTrigger = getTrigger;
exports.getValidator = getValidator;
exports.inflate = inflate;
exports.maybeRunAfterFindTrigger = maybeRunAfterFindTrigger;
exports.maybeRunFileTrigger = maybeRunFileTrigger;
exports.maybeRunQueryTrigger = maybeRunQueryTrigger;
exports.maybeRunTrigger = maybeRunTrigger;
exports.maybeRunValidator = maybeRunValidator;
exports.removeFunction = removeFunction;
exports.removeTrigger = removeTrigger;
exports.resolveError = resolveError;
exports.runLiveQueryEventHandlers = runLiveQueryEventHandlers;
exports.runTrigger = runTrigger;
exports.toJSONwithObjects = toJSONwithObjects;
exports.triggerExists = triggerExists;

var _node = _interopRequireDefault(require("parse/node"));

var _logger = require("./logger");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const Types = {
  beforeLogin: 'beforeLogin',
  afterLogin: 'afterLogin',
  afterLogout: 'afterLogout',
  beforeSave: 'beforeSave',
  afterSave: 'afterSave',
  beforeDelete: 'beforeDelete',
  afterDelete: 'afterDelete',
  beforeFind: 'beforeFind',
  afterFind: 'afterFind',
  beforeSaveFile: 'beforeSaveFile',
  afterSaveFile: 'afterSaveFile',
  beforeDeleteFile: 'beforeDeleteFile',
  afterDeleteFile: 'afterDeleteFile',
  beforeConnect: 'beforeConnect',
  beforeSubscribe: 'beforeSubscribe',
  afterEvent: 'afterEvent'
};
exports.Types = Types;
const FileClassName = '@File';
const ConnectClassName = '@Connect';

const baseStore = function () {
  const Validators = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  const Functions = {};
  const Jobs = {};
  const LiveQuery = [];
  const Triggers = Object.keys(Types).reduce(function (base, key) {
    base[key] = {};
    return base;
  }, {});
  return Object.freeze({
    Functions,
    Jobs,
    Validators,
    Triggers,
    LiveQuery
  });
};

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }

  return parseClass;
}

function validateClassNameForTriggers(className, type) {
  if (type == Types.beforeSave && className === '_PushStatus') {
    // _PushStatus uses undocumented nested key increment ops
    // allowing beforeSave would mess up the objects big time
    // TODO: Allow proper documented way of using nested increment ops
    throw 'Only afterSave is allowed on _PushStatus';
  }

  if ((type === Types.beforeLogin || type === Types.afterLogin) && className !== '_User') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _User class is allowed for the beforeLogin and afterLogin triggers';
  }

  if (type === Types.afterLogout && className !== '_Session') {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the _Session class is allowed for the afterLogout trigger.';
  }

  if (className === '_Session' && type !== Types.afterLogout) {
    // TODO: check if upstream code will handle `Error` instance rather
    // than this anti-pattern of throwing strings
    throw 'Only the afterLogout trigger is allowed for the _Session class.';
  }

  return className;
}

const _triggerStore = {};
const Category = {
  Functions: 'Functions',
  Validators: 'Validators',
  Jobs: 'Jobs',
  Triggers: 'Triggers'
};

function getStore(category, name, applicationId) {
  const path = name.split('.');
  path.splice(-1); // remove last component

  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();
  let store = _triggerStore[applicationId][category];

  for (const component of path) {
    store = store[component];

    if (!store) {
      return undefined;
    }
  }

  return store;
}

function add(category, name, handler, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);

  if (store[lastComponent]) {
    _logger.logger.warn(`Warning: Duplicate cloud functions exist for ${lastComponent}. Only the last one will be used and the others will be ignored.`);
  }

  store[lastComponent] = handler;
}

function remove(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  delete store[lastComponent];
}

function get(category, name, applicationId) {
  const lastComponent = name.split('.').splice(-1);
  const store = getStore(category, name, applicationId);
  return store[lastComponent];
}

function addFunction(functionName, handler, validationHandler, applicationId) {
  add(Category.Functions, functionName, handler, applicationId);
  add(Category.Validators, functionName, validationHandler, applicationId);
}

function addJob(jobName, handler, applicationId) {
  add(Category.Jobs, jobName, handler, applicationId);
}

function addTrigger(type, className, handler, applicationId, validationHandler) {
  validateClassNameForTriggers(className, type);
  add(Category.Triggers, `${type}.${className}`, handler, applicationId);
  add(Category.Validators, `${type}.${className}`, validationHandler, applicationId);
}

function addFileTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${FileClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${FileClassName}`, validationHandler, applicationId);
}

function addConnectTrigger(type, handler, applicationId, validationHandler) {
  add(Category.Triggers, `${type}.${ConnectClassName}`, handler, applicationId);
  add(Category.Validators, `${type}.${ConnectClassName}`, validationHandler, applicationId);
}

function addLiveQueryEventHandler(handler, applicationId) {
  applicationId = applicationId || _node.default.applicationId;
  _triggerStore[applicationId] = _triggerStore[applicationId] || baseStore();

  _triggerStore[applicationId].LiveQuery.push(handler);
}

function removeFunction(functionName, applicationId) {
  remove(Category.Functions, functionName, applicationId);
}

function removeTrigger(type, className, applicationId) {
  remove(Category.Triggers, `${type}.${className}`, applicationId);
}

function _unregisterAll() {
  Object.keys(_triggerStore).forEach(appId => delete _triggerStore[appId]);
}

function toJSONwithObjects(object, className) {
  if (!object || !object.toJSON) {
    return {};
  }

  const toJSON = object.toJSON();

  const stateController = _node.default.CoreManager.getObjectStateController();

  const [pending] = stateController.getPendingOps(object._getStateIdentifier());

  for (const key in pending) {
    const val = object.get(key);

    if (!val || !val._toFullJSON) {
      toJSON[key] = val;
      continue;
    }

    toJSON[key] = val._toFullJSON();
  }

  if (className) {
    toJSON.className = className;
  }

  return toJSON;
}

function getTrigger(className, triggerType, applicationId) {
  if (!applicationId) {
    throw 'Missing ApplicationID';
  }

  return get(Category.Triggers, `${triggerType}.${className}`, applicationId);
}

async function runTrigger(trigger, name, request, auth) {
  if (!trigger) {
    return;
  }

  await maybeRunValidator(request, name, auth);

  if (request.skipWithMasterKey) {
    return;
  }

  return await trigger(request);
}

function getFileTrigger(type, applicationId) {
  return getTrigger(FileClassName, type, applicationId);
}

function triggerExists(className, type, applicationId) {
  return getTrigger(className, type, applicationId) != undefined;
}

function getFunction(functionName, applicationId) {
  return get(Category.Functions, functionName, applicationId);
}

function getFunctionNames(applicationId) {
  const store = _triggerStore[applicationId] && _triggerStore[applicationId][Category.Functions] || {};
  const functionNames = [];

  const extractFunctionNames = (namespace, store) => {
    Object.keys(store).forEach(name => {
      const value = store[name];

      if (namespace) {
        name = `${namespace}.${name}`;
      }

      if (typeof value === 'function') {
        functionNames.push(name);
      } else {
        extractFunctionNames(name, value);
      }
    });
  };

  extractFunctionNames(null, store);
  return functionNames;
}

function getJob(jobName, applicationId) {
  return get(Category.Jobs, jobName, applicationId);
}

function getJobs(applicationId) {
  var manager = _triggerStore[applicationId];

  if (manager && manager.Jobs) {
    return manager.Jobs;
  }

  return undefined;
}

function getValidator(functionName, applicationId) {
  return get(Category.Validators, functionName, applicationId);
}

function getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context) {
  const request = {
    triggerName: triggerType,
    object: parseObject,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    auth
  };

  if (originalParseObject) {
    request.original = originalParseObject;
  }

  if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete || triggerType === Types.afterFind) {
    // Set a copy of the context on the request object.
    request.context = Object.assign({}, context);
  }

  if (!auth) {
    return request;
  }

  if (auth.isMaster) {
    request['master'] = true;
  }

  if (auth.user) {
    request['user'] = auth.user;
  }

  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }

  return request;
}

function getRequestQueryObject(triggerType, auth, query, count, config, context, isGet) {
  isGet = !!isGet;
  var request = {
    triggerName: triggerType,
    query,
    master: false,
    count,
    log: config.loggerController,
    isGet,
    headers: config.headers,
    ip: config.ip,
    context: context || {},
    auth
  };

  if (!auth) {
    return request;
  }

  if (auth.isMaster) {
    request['master'] = true;
  }

  if (auth.user) {
    request['user'] = auth.user;
  }

  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }

  return request;
} // Creates the response object, and uses the request object to pass data
// The API will call this with REST API formatted objects, this will
// transform them to Parse.Object instances expected by Cloud Code.
// Any changes made to the object in a beforeSave will be included.


function getResponseObject(request, resolve, reject) {
  return {
    success: function (response) {
      if (request.triggerName === Types.afterFind) {
        if (!response) {
          response = request.objects;
        }

        response = response.map(object => {
          return toJSONwithObjects(object);
        });
        return resolve(response);
      } // Use the JSON response


      if (response && typeof response === 'object' && !request.object.equals(response) && request.triggerName === Types.beforeSave) {
        return resolve(response);
      }

      if (response && typeof response === 'object' && request.triggerName === Types.afterSave) {
        return resolve(response);
      }

      if (request.triggerName === Types.afterSave) {
        return resolve();
      }

      response = {};

      if (request.triggerName === Types.beforeSave) {
        response['object'] = request.object._getSaveJSON();
        response['object']['objectId'] = request.object.id;
      }

      return resolve(response);
    },
    error: function (error) {
      const e = resolveError(error, {
        code: _node.default.Error.SCRIPT_FAILED,
        message: 'Script failed. Unknown error.'
      });
      reject(e);
    }
  };
}

function userIdForLog(auth) {
  return auth && auth.user ? auth.user.id : undefined;
}

function logTriggerAfterHook(triggerType, className, input, auth) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));

  _logger.logger.info(`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerSuccessBeforeHook(triggerType, className, input, result, auth) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));

  const cleanResult = _logger.logger.truncateLogMessage(JSON.stringify(result));

  _logger.logger.info(`${triggerType} triggered for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Result: ${cleanResult}`, {
    className,
    triggerType,
    user: userIdForLog(auth)
  });
}

function logTriggerErrorBeforeHook(triggerType, className, input, auth, error) {
  const cleanInput = _logger.logger.truncateLogMessage(JSON.stringify(input));

  _logger.logger.error(`${triggerType} failed for ${className} for user ${userIdForLog(auth)}:\n  Input: ${cleanInput}\n  Error: ${JSON.stringify(error)}`, {
    className,
    triggerType,
    error,
    user: userIdForLog(auth)
  });
}

function maybeRunAfterFindTrigger(triggerType, auth, className, objects, config, query, context) {
  return new Promise((resolve, reject) => {
    const trigger = getTrigger(className, triggerType, config.applicationId);

    if (!trigger) {
      return resolve();
    }

    const request = getRequestObject(triggerType, auth, null, null, config, context);

    if (query) {
      request.query = query;
    }

    const {
      success,
      error
    } = getResponseObject(request, object => {
      resolve(object);
    }, error => {
      reject(error);
    });
    logTriggerSuccessBeforeHook(triggerType, className, 'AfterFind', JSON.stringify(objects), auth);
    request.objects = objects.map(object => {
      //setting the class name to transform into parse object
      object.className = className;
      return _node.default.Object.fromJSON(object);
    });
    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return request.objects;
      }

      const response = trigger(request);

      if (response && typeof response.then === 'function') {
        return response.then(results => {
          return results;
        });
      }

      return response;
    }).then(success, error);
  }).then(results => {
    logTriggerAfterHook(triggerType, className, JSON.stringify(results), auth);
    return results;
  });
}

function maybeRunQueryTrigger(triggerType, className, restWhere, restOptions, config, auth, context, isGet) {
  const trigger = getTrigger(className, triggerType, config.applicationId);

  if (!trigger) {
    return Promise.resolve({
      restWhere,
      restOptions
    });
  }

  const json = Object.assign({}, restOptions);
  json.where = restWhere;
  const parseQuery = new _node.default.Query(className);
  parseQuery.withJSON(json);
  let count = false;

  if (restOptions) {
    count = !!restOptions.count;
  }

  const requestObject = getRequestQueryObject(triggerType, auth, parseQuery, count, config, context, isGet);
  return Promise.resolve().then(() => {
    return maybeRunValidator(requestObject, `${triggerType}.${className}`, auth);
  }).then(() => {
    if (requestObject.skipWithMasterKey) {
      return requestObject.query;
    }

    return trigger(requestObject);
  }).then(result => {
    let queryResult = parseQuery;

    if (result && result instanceof _node.default.Query) {
      queryResult = result;
    }

    const jsonQuery = queryResult.toJSON();

    if (jsonQuery.where) {
      restWhere = jsonQuery.where;
    }

    if (jsonQuery.limit) {
      restOptions = restOptions || {};
      restOptions.limit = jsonQuery.limit;
    }

    if (jsonQuery.skip) {
      restOptions = restOptions || {};
      restOptions.skip = jsonQuery.skip;
    }

    if (jsonQuery.include) {
      restOptions = restOptions || {};
      restOptions.include = jsonQuery.include;
    }

    if (jsonQuery.excludeKeys) {
      restOptions = restOptions || {};
      restOptions.excludeKeys = jsonQuery.excludeKeys;
    }

    if (jsonQuery.explain) {
      restOptions = restOptions || {};
      restOptions.explain = jsonQuery.explain;
    }

    if (jsonQuery.keys) {
      restOptions = restOptions || {};
      restOptions.keys = jsonQuery.keys;
    }

    if (jsonQuery.order) {
      restOptions = restOptions || {};
      restOptions.order = jsonQuery.order;
    }

    if (jsonQuery.hint) {
      restOptions = restOptions || {};
      restOptions.hint = jsonQuery.hint;
    }

    if (requestObject.readPreference) {
      restOptions = restOptions || {};
      restOptions.readPreference = requestObject.readPreference;
    }

    if (requestObject.includeReadPreference) {
      restOptions = restOptions || {};
      restOptions.includeReadPreference = requestObject.includeReadPreference;
    }

    if (requestObject.subqueryReadPreference) {
      restOptions = restOptions || {};
      restOptions.subqueryReadPreference = requestObject.subqueryReadPreference;
    }

    return {
      restWhere,
      restOptions
    };
  }, err => {
    const error = resolveError(err, {
      code: _node.default.Error.SCRIPT_FAILED,
      message: 'Script failed. Unknown error.'
    });
    throw error;
  });
}

function resolveError(message, defaultOpts) {
  if (!defaultOpts) {
    defaultOpts = {};
  }

  if (!message) {
    return new _node.default.Error(defaultOpts.code || _node.default.Error.SCRIPT_FAILED, defaultOpts.message || 'Script failed.');
  }

  if (message instanceof _node.default.Error) {
    return message;
  }

  const code = defaultOpts.code || _node.default.Error.SCRIPT_FAILED; // If it's an error, mark it as a script failed

  if (typeof message === 'string') {
    return new _node.default.Error(code, message);
  }

  const error = new _node.default.Error(code, message.message || message);

  if (message instanceof Error) {
    error.stack = message.stack;
  }

  return error;
}

function maybeRunValidator(request, validator, auth) {
  let theValidator;

  if (typeof validator === 'string') {
    theValidator = getValidator(validator, _node.default.applicationId);
  } else if (typeof validator === 'object') {
    theValidator = validator;
  }

  if (!theValidator) {
    return;
  }

  if (typeof theValidator === 'object' && theValidator.skipWithMasterKey && request.master) {
    request.skipWithMasterKey = true;
  }

  return new Promise((resolve, reject) => {
    return Promise.resolve().then(() => {
      return typeof theValidator === 'object' ? builtInTriggerValidator(theValidator, request, auth) : theValidator(request);
    }).then(() => {
      resolve();
    }).catch(e => {
      const error = resolveError(e, {
        code: _node.default.Error.VALIDATION_ERROR,
        message: 'Validation failed.'
      });
      reject(error);
    });
  });
}

async function builtInTriggerValidator(options, request, auth) {
  if (request.master && !options.validateMasterKey) {
    return;
  }

  let reqUser = request.user;

  if (!reqUser && request.object && request.object.className === '_User' && !request.object.existed()) {
    reqUser = request.object;
  }

  if ((options.requireUser || options.requireAnyUserRoles || options.requireAllUserRoles) && !reqUser) {
    throw 'Validation failed. Please login to continue.';
  }

  if (options.requireMaster && !request.master) {
    throw 'Validation failed. Master key is required to complete this request.';
  }

  let params = request.params || {};

  if (request.object) {
    params = request.object.toJSON();
  }

  const requiredParam = key => {
    const value = params[key];

    if (value == null) {
      throw `Validation failed. Please specify data for ${key}.`;
    }
  };

  const validateOptions = async (opt, key, val) => {
    let opts = opt.options;

    if (typeof opts === 'function') {
      try {
        const result = await opts(val);

        if (!result && result != null) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }
      } catch (e) {
        if (!e) {
          throw opt.error || `Validation failed. Invalid value for ${key}.`;
        }

        throw opt.error || e.message || e;
      }

      return;
    }

    if (!Array.isArray(opts)) {
      opts = [opt.options];
    }

    if (!opts.includes(val)) {
      throw opt.error || `Validation failed. Invalid option for ${key}. Expected: ${opts.join(', ')}`;
    }
  };

  const getType = fn => {
    const match = fn && fn.toString().match(/^\s*function (\w+)/);
    return (match ? match[1] : '').toLowerCase();
  };

  if (Array.isArray(options.fields)) {
    for (const key of options.fields) {
      requiredParam(key);
    }
  } else {
    const optionPromises = [];

    for (const key in options.fields) {
      const opt = options.fields[key];
      let val = params[key];

      if (typeof opt === 'string') {
        requiredParam(opt);
      }

      if (typeof opt === 'object') {
        if (opt.default != null && val == null) {
          val = opt.default;
          params[key] = val;

          if (request.object) {
            request.object.set(key, val);
          }
        }

        if (opt.constant && request.object) {
          if (request.original) {
            request.object.set(key, request.original.get(key));
          } else if (opt.default != null) {
            request.object.set(key, opt.default);
          }
        }

        if (opt.required) {
          requiredParam(key);
        }

        const optional = !opt.required && val === undefined;

        if (!optional) {
          if (opt.type) {
            const type = getType(opt.type);
            const valType = Array.isArray(val) ? 'array' : typeof val;

            if (valType !== type) {
              throw `Validation failed. Invalid type for ${key}. Expected: ${type}`;
            }
          }

          if (opt.options) {
            optionPromises.push(validateOptions(opt, key, val));
          }
        }
      }
    }

    await Promise.all(optionPromises);
  }

  let userRoles = options.requireAnyUserRoles;
  let requireAllRoles = options.requireAllUserRoles;
  const promises = [Promise.resolve(), Promise.resolve(), Promise.resolve()];

  if (userRoles || requireAllRoles) {
    promises[0] = auth.getUserRoles();
  }

  if (typeof userRoles === 'function') {
    promises[1] = userRoles();
  }

  if (typeof requireAllRoles === 'function') {
    promises[2] = requireAllRoles();
  }

  const [roles, resolvedUserRoles, resolvedRequireAll] = await Promise.all(promises);

  if (resolvedUserRoles && Array.isArray(resolvedUserRoles)) {
    userRoles = resolvedUserRoles;
  }

  if (resolvedRequireAll && Array.isArray(resolvedRequireAll)) {
    requireAllRoles = resolvedRequireAll;
  }

  if (userRoles) {
    const hasRole = userRoles.some(requiredRole => roles.includes(`role:${requiredRole}`));

    if (!hasRole) {
      throw `Validation failed. User does not match the required roles.`;
    }
  }

  if (requireAllRoles) {
    for (const requiredRole of requireAllRoles) {
      if (!roles.includes(`role:${requiredRole}`)) {
        throw `Validation failed. User does not match all the required roles.`;
      }
    }
  }

  const userKeys = options.requireUserKeys || [];

  if (Array.isArray(userKeys)) {
    for (const key of userKeys) {
      if (!reqUser) {
        throw 'Please login to make this request.';
      }

      if (reqUser.get(key) == null) {
        throw `Validation failed. Please set data for ${key} on your account.`;
      }
    }
  } else if (typeof userKeys === 'object') {
    const optionPromises = [];

    for (const key in options.requireUserKeys) {
      const opt = options.requireUserKeys[key];

      if (opt.options) {
        optionPromises.push(validateOptions(opt, key, reqUser.get(key)));
      }
    }

    await Promise.all(optionPromises);
  }
} // To be used as part of the promise chain when saving/deleting an object
// Will resolve successfully if no trigger is configured
// Resolves to an object, empty or containing an object key. A beforeSave
// trigger will set the object key to the rest format object to save.
// originalParseObject is optional, we only need that for before/afterSave functions


function maybeRunTrigger(triggerType, auth, parseObject, originalParseObject, config, context) {
  if (!parseObject) {
    return Promise.resolve({});
  }

  return new Promise(function (resolve, reject) {
    var trigger = getTrigger(parseObject.className, triggerType, config.applicationId);
    if (!trigger) return resolve();
    var request = getRequestObject(triggerType, auth, parseObject, originalParseObject, config, context);
    var {
      success,
      error
    } = getResponseObject(request, object => {
      logTriggerSuccessBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), object, auth);

      if (triggerType === Types.beforeSave || triggerType === Types.afterSave || triggerType === Types.beforeDelete || triggerType === Types.afterDelete) {
        Object.assign(context, request.context);
      }

      resolve(object);
    }, error => {
      logTriggerErrorBeforeHook(triggerType, parseObject.className, parseObject.toJSON(), auth, error);
      reject(error);
    }); // AfterSave and afterDelete triggers can return a promise, which if they
    // do, needs to be resolved before this promise is resolved,
    // so trigger execution is synced with RestWrite.execute() call.
    // If triggers do not return a promise, they can run async code parallel
    // to the RestWrite.execute() call.

    return Promise.resolve().then(() => {
      return maybeRunValidator(request, `${triggerType}.${parseObject.className}`, auth);
    }).then(() => {
      if (request.skipWithMasterKey) {
        return Promise.resolve();
      }

      const promise = trigger(request);

      if (triggerType === Types.afterSave || triggerType === Types.afterDelete || triggerType === Types.afterLogin) {
        logTriggerAfterHook(triggerType, parseObject.className, parseObject.toJSON(), auth);
      } // beforeSave is expected to return null (nothing)


      if (triggerType === Types.beforeSave) {
        if (promise && typeof promise.then === 'function') {
          return promise.then(response => {
            // response.object may come from express routing before hook
            if (response && response.object) {
              return response;
            }

            return null;
          });
        }

        return null;
      }

      return promise;
    }).then(success, error);
  });
} // Converts a REST-format object to a Parse.Object
// data is either className or an object


function inflate(data, restObject) {
  var copy = typeof data == 'object' ? data : {
    className: data
  };

  for (var key in restObject) {
    copy[key] = restObject[key];
  }

  return _node.default.Object.fromJSON(copy);
}

function runLiveQueryEventHandlers(data, applicationId = _node.default.applicationId) {
  if (!_triggerStore || !_triggerStore[applicationId] || !_triggerStore[applicationId].LiveQuery) {
    return;
  }

  _triggerStore[applicationId].LiveQuery.forEach(handler => handler(data));
}

function getRequestFileObject(triggerType, auth, fileObject, config) {
  const request = _objectSpread(_objectSpread({}, fileObject), {}, {
    triggerName: triggerType,
    master: false,
    log: config.loggerController,
    headers: config.headers,
    ip: config.ip,
    auth
  });

  if (!auth) {
    return request;
  }

  if (auth.isMaster) {
    request['master'] = true;
  }

  if (auth.user) {
    request['user'] = auth.user;
  }

  if (auth.installationId) {
    request['installationId'] = auth.installationId;
  }

  return request;
}

async function maybeRunFileTrigger(triggerType, fileObject, config, auth) {
  const fileTrigger = getFileTrigger(triggerType, config.applicationId);

  if (typeof fileTrigger === 'function') {
    try {
      const request = getRequestFileObject(triggerType, auth, fileObject, config);
      await maybeRunValidator(request, `${triggerType}.${FileClassName}`, auth);

      if (request.skipWithMasterKey) {
        return fileObject;
      }

      const result = await fileTrigger(request);
      logTriggerSuccessBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), result, auth);
      return result || fileObject;
    } catch (error) {
      logTriggerErrorBeforeHook(triggerType, 'Parse.File', _objectSpread(_objectSpread({}, fileObject.file.toJSON()), {}, {
        fileSize: fileObject.fileSize
      }), auth, error);
      throw error;
    }
  }

  return fileObject;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkZpbGVDbGFzc05hbWUiLCJDb25uZWN0Q2xhc3NOYW1lIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiRnVuY3Rpb25zIiwiSm9icyIsIkxpdmVRdWVyeSIsIlRyaWdnZXJzIiwiZnJlZXplIiwiZ2V0Q2xhc3NOYW1lIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsIm5hbWUiLCJhcHBsaWNhdGlvbklkIiwicGF0aCIsInNwbGl0Iiwic3BsaWNlIiwiUGFyc2UiLCJzdG9yZSIsImNvbXBvbmVudCIsInVuZGVmaW5lZCIsImFkZCIsImhhbmRsZXIiLCJsYXN0Q29tcG9uZW50IiwibG9nZ2VyIiwid2FybiIsInJlbW92ZSIsImdldCIsImFkZEZ1bmN0aW9uIiwiZnVuY3Rpb25OYW1lIiwidmFsaWRhdGlvbkhhbmRsZXIiLCJhZGRKb2IiLCJqb2JOYW1lIiwiYWRkVHJpZ2dlciIsImFkZEZpbGVUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsImdldEZpbGVUcmlnZ2VyIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInRyaWdnZXJOYW1lIiwibWFzdGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm9yaWdpbmFsIiwiYXNzaWduIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJnZXRSZXF1ZXN0UXVlcnlPYmplY3QiLCJxdWVyeSIsImNvdW50IiwiaXNHZXQiLCJnZXRSZXNwb25zZU9iamVjdCIsInJlc29sdmUiLCJyZWplY3QiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJvYmplY3RzIiwibWFwIiwiZXF1YWxzIiwiX2dldFNhdmVKU09OIiwiaWQiLCJlcnJvciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJpbnB1dCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwiaW5mbyIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIlByb21pc2UiLCJmcm9tSlNPTiIsInRoZW4iLCJyZXN1bHRzIiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImpzb24iLCJ3aGVyZSIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwicmVxdWVzdE9iamVjdCIsInF1ZXJ5UmVzdWx0IiwianNvblF1ZXJ5IiwibGltaXQiLCJza2lwIiwiaW5jbHVkZSIsImV4Y2x1ZGVLZXlzIiwiZXhwbGFpbiIsIm9yZGVyIiwiaGludCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImVyciIsImRlZmF1bHRPcHRzIiwic3RhY2siLCJ2YWxpZGF0b3IiLCJ0aGVWYWxpZGF0b3IiLCJidWlsdEluVHJpZ2dlclZhbGlkYXRvciIsImNhdGNoIiwiVkFMSURBVElPTl9FUlJPUiIsIm9wdGlvbnMiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInJlcVVzZXIiLCJleGlzdGVkIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJwYXJhbXMiLCJyZXF1aXJlZFBhcmFtIiwidmFsaWRhdGVPcHRpb25zIiwib3B0Iiwib3B0cyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVzIiwiam9pbiIsImdldFR5cGUiLCJmbiIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImZpZWxkcyIsIm9wdGlvblByb21pc2VzIiwiZGVmYXVsdCIsInNldCIsImNvbnN0YW50IiwicmVxdWlyZWQiLCJvcHRpb25hbCIsInZhbFR5cGUiLCJhbGwiLCJ1c2VyUm9sZXMiLCJyZXF1aXJlQWxsUm9sZXMiLCJwcm9taXNlcyIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwicmVzb2x2ZWRVc2VyUm9sZXMiLCJyZXNvbHZlZFJlcXVpcmVBbGwiLCJoYXNSb2xlIiwic29tZSIsInJlcXVpcmVkUm9sZSIsInVzZXJLZXlzIiwicmVxdWlyZVVzZXJLZXlzIiwibWF5YmVSdW5UcmlnZ2VyIiwicHJvbWlzZSIsImluZmxhdGUiLCJkYXRhIiwicmVzdE9iamVjdCIsImNvcHkiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZ2V0UmVxdWVzdEZpbGVPYmplY3QiLCJmaWxlT2JqZWN0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsImZpbGVUcmlnZ2VyIiwiZmlsZSIsImZpbGVTaXplIl0sInNvdXJjZXMiOlsiLi4vc3JjL3RyaWdnZXJzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGFmdGVyTG9naW46ICdhZnRlckxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlU2F2ZUZpbGU6ICdiZWZvcmVTYXZlRmlsZScsXG4gIGFmdGVyU2F2ZUZpbGU6ICdhZnRlclNhdmVGaWxlJyxcbiAgYmVmb3JlRGVsZXRlRmlsZTogJ2JlZm9yZURlbGV0ZUZpbGUnLFxuICBhZnRlckRlbGV0ZUZpbGU6ICdhZnRlckRlbGV0ZUZpbGUnLFxuICBiZWZvcmVDb25uZWN0OiAnYmVmb3JlQ29ubmVjdCcsXG4gIGJlZm9yZVN1YnNjcmliZTogJ2JlZm9yZVN1YnNjcmliZScsXG4gIGFmdGVyRXZlbnQ6ICdhZnRlckV2ZW50Jyxcbn07XG5cbmNvbnN0IEZpbGVDbGFzc05hbWUgPSAnQEZpbGUnO1xuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHBhdGggPSBuYW1lLnNwbGl0KCcuJyk7XG4gIHBhdGguc3BsaWNlKC0xKTsgLy8gcmVtb3ZlIGxhc3QgY29tcG9uZW50XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBsZXQgc3RvcmUgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW2NhdGVnb3J5XTtcbiAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgcGF0aCkge1xuICAgIHN0b3JlID0gc3RvcmVbY29tcG9uZW50XTtcbiAgICBpZiAoIXN0b3JlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoc3RvcmVbbGFzdENvbXBvbmVudF0pIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBXYXJuaW5nOiBEdXBsaWNhdGUgY2xvdWQgZnVuY3Rpb25zIGV4aXN0IGZvciAke2xhc3RDb21wb25lbnR9LiBPbmx5IHRoZSBsYXN0IG9uZSB3aWxsIGJlIHVzZWQgYW5kIHRoZSBvdGhlcnMgd2lsbCBiZSBpZ25vcmVkLmBcbiAgICApO1xuICB9XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZpbGVUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENvbm5lY3RUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCwgY2xhc3NOYW1lKSB7XG4gIGlmICghb2JqZWN0IHx8ICFvYmplY3QudG9KU09OKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG4gIGNvbnN0IHRvSlNPTiA9IG9iamVjdC50b0pTT04oKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKG9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiBwZW5kaW5nKSB7XG4gICAgY29uc3QgdmFsID0gb2JqZWN0LmdldChrZXkpO1xuICAgIGlmICghdmFsIHx8ICF2YWwuX3RvRnVsbEpTT04pIHtcbiAgICAgIHRvSlNPTltrZXldID0gdmFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRvSlNPTltrZXldID0gdmFsLl90b0Z1bGxKU09OKCk7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSkge1xuICAgIHRvSlNPTi5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIH1cbiAgcmV0dXJuIHRvSlNPTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5UcmlnZ2VyKHRyaWdnZXIsIG5hbWUsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIG5hbWUsIGF1dGgpO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gYXdhaXQgdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbGVUcmlnZ2VyKHR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoRmlsZUNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGF1dGgsXG4gIH07XG5cbiAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICByZXF1ZXN0Lm9yaWdpbmFsID0gb3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckZpbmRcbiAgKSB7XG4gICAgLy8gU2V0IGEgY29weSBvZiB0aGUgY29udGV4dCBvbiB0aGUgcmVxdWVzdCBvYmplY3QuXG4gICAgcmVxdWVzdC5jb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgY29udGV4dCk7XG4gIH1cblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0UXVlcnlPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIHF1ZXJ5LCBjb3VudCwgY29uZmlnLCBjb250ZXh0LCBpc0dldCkge1xuICBpc0dldCA9ICEhaXNHZXQ7XG5cbiAgdmFyIHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIHF1ZXJ5LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgY291bnQsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBpc0dldCxcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbnRleHQ6IGNvbnRleHQgfHwge30sXG4gICAgYXV0aCxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbi8vIENyZWF0ZXMgdGhlIHJlc3BvbnNlIG9iamVjdCwgYW5kIHVzZXMgdGhlIHJlcXVlc3Qgb2JqZWN0IHRvIHBhc3MgZGF0YVxuLy8gVGhlIEFQSSB3aWxsIGNhbGwgdGhpcyB3aXRoIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3RzLCB0aGlzIHdpbGxcbi8vIHRyYW5zZm9ybSB0aGVtIHRvIFBhcnNlLk9iamVjdCBpbnN0YW5jZXMgZXhwZWN0ZWQgYnkgQ2xvdWQgQ29kZS5cbi8vIEFueSBjaGFuZ2VzIG1hZGUgdG8gdGhlIG9iamVjdCBpbiBhIGJlZm9yZVNhdmUgd2lsbCBiZSBpbmNsdWRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNwb25zZU9iamVjdChyZXF1ZXN0LCByZXNvbHZlLCByZWplY3QpIHtcbiAgcmV0dXJuIHtcbiAgICBzdWNjZXNzOiBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlckZpbmQpIHtcbiAgICAgICAgaWYgKCFyZXNwb25zZSkge1xuICAgICAgICAgIHJlc3BvbnNlID0gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIHJlc3BvbnNlID0gcmVzcG9uc2UubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCk7XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICAvLyBVc2UgdGhlIEpTT04gcmVzcG9uc2VcbiAgICAgIGlmIChcbiAgICAgICAgcmVzcG9uc2UgJiZcbiAgICAgICAgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAhcmVxdWVzdC5vYmplY3QuZXF1YWxzKHJlc3BvbnNlKSAmJlxuICAgICAgICByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiYgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICAgIH1cbiAgICAgIHJlc3BvbnNlID0ge307XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J10gPSByZXF1ZXN0Lm9iamVjdC5fZ2V0U2F2ZUpTT04oKTtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddWydvYmplY3RJZCddID0gcmVxdWVzdC5vYmplY3QuaWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgfSxcbiAgICBlcnJvcjogZnVuY3Rpb24gKGVycm9yKSB7XG4gICAgICBjb25zdCBlID0gcmVzb2x2ZUVycm9yKGVycm9yLCB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIHJlamVjdChlKTtcbiAgICB9LFxuICB9O1xufVxuXG5mdW5jdGlvbiB1c2VySWRGb3JMb2coYXV0aCkge1xuICByZXR1cm4gYXV0aCAmJiBhdXRoLnVzZXIgPyBhdXRoLnVzZXIuaWQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCByZXN1bHQsIGF1dGgpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgY29uc3QgY2xlYW5SZXN1bHQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KHJlc3VsdCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgUmVzdWx0OiAke2NsZWFuUmVzdWx0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoLCBlcnJvcikge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuZXJyb3IoXG4gICAgYCR7dHJpZ2dlclR5cGV9IGZhaWxlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIEVycm9yOiAke0pTT04uc3RyaW5naWZ5KGVycm9yKX1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgZXJyb3IsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgY2xhc3NOYW1lLFxuICBvYmplY3RzLFxuICBjb25maWcsXG4gIHF1ZXJ5LFxuICBjb250ZXh0XG4pIHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgbnVsbCwgbnVsbCwgY29uZmlnLCBjb250ZXh0KTtcbiAgICBpZiAocXVlcnkpIHtcbiAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH1cbiAgICApO1xuICAgIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCAnQWZ0ZXJGaW5kJywgSlNPTi5zdHJpbmdpZnkob2JqZWN0cyksIGF1dGgpO1xuICAgIHJlcXVlc3Qub2JqZWN0cyA9IG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAvL3NldHRpbmcgdGhlIGNsYXNzIG5hbWUgdG8gdHJhbnNmb3JtIGludG8gcGFyc2Ugb2JqZWN0XG4gICAgICBvYmplY3QuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgICAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmplY3QpO1xuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgaWYgKHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdC5vYmplY3RzO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKHJlc3BvbnNlICYmIHR5cGVvZiByZXNwb25zZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgcmV0dXJuIHJlc3BvbnNlLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0cztcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICB9KVxuICAgICAgLnRoZW4oc3VjY2VzcywgZXJyb3IpO1xuICB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgSlNPTi5zdHJpbmdpZnkocmVzdWx0cyksIGF1dGgpO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuUXVlcnlUcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgY2xhc3NOYW1lLFxuICByZXN0V2hlcmUsXG4gIHJlc3RPcHRpb25zLFxuICBjb25maWcsXG4gIGF1dGgsXG4gIGNvbnRleHQsXG4gIGlzR2V0XG4pIHtcbiAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAoIXRyaWdnZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgIHJlc3RXaGVyZSxcbiAgICAgIHJlc3RPcHRpb25zLFxuICAgIH0pO1xuICB9XG4gIGNvbnN0IGpzb24gPSBPYmplY3QuYXNzaWduKHt9LCByZXN0T3B0aW9ucyk7XG4gIGpzb24ud2hlcmUgPSByZXN0V2hlcmU7XG5cbiAgY29uc3QgcGFyc2VRdWVyeSA9IG5ldyBQYXJzZS5RdWVyeShjbGFzc05hbWUpO1xuICBwYXJzZVF1ZXJ5LndpdGhKU09OKGpzb24pO1xuXG4gIGxldCBjb3VudCA9IGZhbHNlO1xuICBpZiAocmVzdE9wdGlvbnMpIHtcbiAgICBjb3VudCA9ICEhcmVzdE9wdGlvbnMuY291bnQ7XG4gIH1cbiAgY29uc3QgcmVxdWVzdE9iamVjdCA9IGdldFJlcXVlc3RRdWVyeU9iamVjdChcbiAgICB0cmlnZ2VyVHlwZSxcbiAgICBhdXRoLFxuICAgIHBhcnNlUXVlcnksXG4gICAgY291bnQsXG4gICAgY29uZmlnLFxuICAgIGNvbnRleHQsXG4gICAgaXNHZXRcbiAgKTtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3RPYmplY3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiByZXF1ZXN0T2JqZWN0LnF1ZXJ5O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRyaWdnZXIocmVxdWVzdE9iamVjdCk7XG4gICAgfSlcbiAgICAudGhlbihcbiAgICAgIHJlc3VsdCA9PiB7XG4gICAgICAgIGxldCBxdWVyeVJlc3VsdCA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGlmIChyZXN1bHQgJiYgcmVzdWx0IGluc3RhbmNlb2YgUGFyc2UuUXVlcnkpIHtcbiAgICAgICAgICBxdWVyeVJlc3VsdCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBqc29uUXVlcnkgPSBxdWVyeVJlc3VsdC50b0pTT04oKTtcbiAgICAgICAgaWYgKGpzb25RdWVyeS53aGVyZSkge1xuICAgICAgICAgIHJlc3RXaGVyZSA9IGpzb25RdWVyeS53aGVyZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmxpbWl0KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5saW1pdCA9IGpzb25RdWVyeS5saW1pdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LnNraXApIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnNraXAgPSBqc29uUXVlcnkuc2tpcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmluY2x1ZGUpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBqc29uUXVlcnkuaW5jbHVkZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4Y2x1ZGVLZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leGNsdWRlS2V5cyA9IGpzb25RdWVyeS5leGNsdWRlS2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmV4cGxhaW4pIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4cGxhaW4gPSBqc29uUXVlcnkuZXhwbGFpbjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmtleXMgPSBqc29uUXVlcnkua2V5cztcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5Lm9yZGVyKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5vcmRlciA9IGpzb25RdWVyeS5vcmRlcjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoanNvblF1ZXJ5LmhpbnQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmhpbnQgPSBqc29uUXVlcnkuaGludDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3Quc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgICByZXN0T3B0aW9ucyxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICAgIG1lc3NhZ2U6ICdTY3JpcHQgZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICAgIH0pO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUVycm9yKG1lc3NhZ2UsIGRlZmF1bHRPcHRzKSB7XG4gIGlmICghZGVmYXVsdE9wdHMpIHtcbiAgICBkZWZhdWx0T3B0cyA9IHt9O1xuICB9XG4gIGlmICghbWVzc2FnZSkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICBkZWZhdWx0T3B0cy5tZXNzYWdlIHx8ICdTY3JpcHQgZmFpbGVkLidcbiAgICApO1xuICB9XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIGNvbnN0IGNvZGUgPSBkZWZhdWx0T3B0cy5jb2RlIHx8IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQ7XG4gIC8vIElmIGl0J3MgYW4gZXJyb3IsIG1hcmsgaXQgYXMgYSBzY3JpcHQgZmFpbGVkXG4gIGlmICh0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UpO1xuICB9XG4gIGNvbnN0IGVycm9yID0gbmV3IFBhcnNlLkVycm9yKGNvZGUsIG1lc3NhZ2UubWVzc2FnZSB8fCBtZXNzYWdlKTtcbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgIGVycm9yLnN0YWNrID0gbWVzc2FnZS5zdGFjaztcbiAgfVxuICByZXR1cm4gZXJyb3I7XG59XG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgdmFsaWRhdG9yLCBhdXRoKSB7XG4gIGxldCB0aGVWYWxpZGF0b3I7XG4gIGlmICh0eXBlb2YgdmFsaWRhdG9yID09PSAnc3RyaW5nJykge1xuICAgIHRoZVZhbGlkYXRvciA9IGdldFZhbGlkYXRvcih2YWxpZGF0b3IsIFBhcnNlLmFwcGxpY2F0aW9uSWQpO1xuICB9IGVsc2UgaWYgKHR5cGVvZiB2YWxpZGF0b3IgPT09ICdvYmplY3QnKSB7XG4gICAgdGhlVmFsaWRhdG9yID0gdmFsaWRhdG9yO1xuICB9XG5cbiAgaWYgKCF0aGVWYWxpZGF0b3IpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHR5cGVvZiB0aGVWYWxpZGF0b3IgPT09ICdvYmplY3QnICYmIHRoZVZhbGlkYXRvci5za2lwV2l0aE1hc3RlcktleSAmJiByZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHJlcXVlc3Quc2tpcFdpdGhNYXN0ZXJLZXkgPSB0cnVlO1xuICB9XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0J1xuICAgICAgICAgID8gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3IodGhlVmFsaWRhdG9yLCByZXF1ZXN0LCBhdXRoKVxuICAgICAgICAgIDogdGhlVmFsaWRhdG9yKHJlcXVlc3QpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgbWVzc2FnZTogJ1ZhbGlkYXRpb24gZmFpbGVkLicsXG4gICAgICAgIH0pO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfSk7XG4gIH0pO1xufVxuYXN5bmMgZnVuY3Rpb24gYnVpbHRJblRyaWdnZXJWYWxpZGF0b3Iob3B0aW9ucywgcmVxdWVzdCwgYXV0aCkge1xuICBpZiAocmVxdWVzdC5tYXN0ZXIgJiYgIW9wdGlvbnMudmFsaWRhdGVNYXN0ZXJLZXkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgbGV0IHJlcVVzZXIgPSByZXF1ZXN0LnVzZXI7XG4gIGlmIChcbiAgICAhcmVxVXNlciAmJlxuICAgIHJlcXVlc3Qub2JqZWN0ICYmXG4gICAgcmVxdWVzdC5vYmplY3QuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgIXJlcXVlc3Qub2JqZWN0LmV4aXN0ZWQoKVxuICApIHtcbiAgICByZXFVc2VyID0gcmVxdWVzdC5vYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIChvcHRpb25zLnJlcXVpcmVVc2VyIHx8IG9wdGlvbnMucmVxdWlyZUFueVVzZXJSb2xlcyB8fCBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXMpICYmXG4gICAgIXJlcVVzZXJcbiAgKSB7XG4gICAgdGhyb3cgJ1ZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2UgbG9naW4gdG8gY29udGludWUuJztcbiAgfVxuICBpZiAob3B0aW9ucy5yZXF1aXJlTWFzdGVyICYmICFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gTWFzdGVyIGtleSBpcyByZXF1aXJlZCB0byBjb21wbGV0ZSB0aGlzIHJlcXVlc3QuJztcbiAgfVxuICBsZXQgcGFyYW1zID0gcmVxdWVzdC5wYXJhbXMgfHwge307XG4gIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgIHBhcmFtcyA9IHJlcXVlc3Qub2JqZWN0LnRvSlNPTigpO1xuICB9XG4gIGNvbnN0IHJlcXVpcmVkUGFyYW0gPSBrZXkgPT4ge1xuICAgIGNvbnN0IHZhbHVlID0gcGFyYW1zW2tleV07XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIHNwZWNpZnkgZGF0YSBmb3IgJHtrZXl9LmA7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IHZhbGlkYXRlT3B0aW9ucyA9IGFzeW5jIChvcHQsIGtleSwgdmFsKSA9PiB7XG4gICAgbGV0IG9wdHMgPSBvcHQub3B0aW9ucztcbiAgICBpZiAodHlwZW9mIG9wdHMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG9wdHModmFsKTtcbiAgICAgICAgaWYgKCFyZXN1bHQgJiYgcmVzdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoIWUpIHtcbiAgICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHZhbHVlIGZvciAke2tleX0uYDtcbiAgICAgICAgfVxuXG4gICAgICAgIHRocm93IG9wdC5lcnJvciB8fCBlLm1lc3NhZ2UgfHwgZTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wdHMpKSB7XG4gICAgICBvcHRzID0gW29wdC5vcHRpb25zXTtcbiAgICB9XG5cbiAgICBpZiAoIW9wdHMuaW5jbHVkZXModmFsKSkge1xuICAgICAgdGhyb3cgKFxuICAgICAgICBvcHQuZXJyb3IgfHwgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIG9wdGlvbiBmb3IgJHtrZXl9LiBFeHBlY3RlZDogJHtvcHRzLmpvaW4oJywgJyl9YFxuICAgICAgKTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgZ2V0VHlwZSA9IGZuID0+IHtcbiAgICBjb25zdCBtYXRjaCA9IGZuICYmIGZuLnRvU3RyaW5nKCkubWF0Y2goL15cXHMqZnVuY3Rpb24gKFxcdyspLyk7XG4gICAgcmV0dXJuIChtYXRjaCA/IG1hdGNoWzFdIDogJycpLnRvTG93ZXJDYXNlKCk7XG4gIH07XG4gIGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMuZmllbGRzKSkge1xuICAgIGZvciAoY29uc3Qga2V5IG9mIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICByZXF1aXJlZFBhcmFtKGtleSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5maWVsZHMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMuZmllbGRzW2tleV07XG4gICAgICBsZXQgdmFsID0gcGFyYW1zW2tleV07XG4gICAgICBpZiAodHlwZW9mIG9wdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmVxdWlyZWRQYXJhbShvcHQpO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGlmIChvcHQuZGVmYXVsdCAhPSBudWxsICYmIHZhbCA9PSBudWxsKSB7XG4gICAgICAgICAgdmFsID0gb3B0LmRlZmF1bHQ7XG4gICAgICAgICAgcGFyYW1zW2tleV0gPSB2YWw7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCB2YWwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LmNvbnN0YW50ICYmIHJlcXVlc3Qub2JqZWN0KSB7XG4gICAgICAgICAgaWYgKHJlcXVlc3Qub3JpZ2luYWwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIHJlcXVlc3Qub3JpZ2luYWwuZ2V0KGtleSkpO1xuICAgICAgICAgIH0gZWxzZSBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgb3B0LmRlZmF1bHQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0LnJlcXVpcmVkKSB7XG4gICAgICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IG9wdGlvbmFsID0gIW9wdC5yZXF1aXJlZCAmJiB2YWwgPT09IHVuZGVmaW5lZDtcbiAgICAgICAgaWYgKCFvcHRpb25hbCkge1xuICAgICAgICAgIGlmIChvcHQudHlwZSkge1xuICAgICAgICAgICAgY29uc3QgdHlwZSA9IGdldFR5cGUob3B0LnR5cGUpO1xuICAgICAgICAgICAgY29uc3QgdmFsVHlwZSA9IEFycmF5LmlzQXJyYXkodmFsKSA/ICdhcnJheScgOiB0eXBlb2YgdmFsO1xuICAgICAgICAgICAgaWYgKHZhbFR5cGUgIT09IHR5cGUpIHtcbiAgICAgICAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBJbnZhbGlkIHR5cGUgZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7dHlwZX1gO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgICAgIG9wdGlvblByb21pc2VzLnB1c2godmFsaWRhdGVPcHRpb25zKG9wdCwga2V5LCB2YWwpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG4gIGxldCB1c2VyUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXM7XG4gIGxldCByZXF1aXJlQWxsUm9sZXMgPSBvcHRpb25zLnJlcXVpcmVBbGxVc2VyUm9sZXM7XG4gIGNvbnN0IHByb21pc2VzID0gW1Byb21pc2UucmVzb2x2ZSgpLCBQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCldO1xuICBpZiAodXNlclJvbGVzIHx8IHJlcXVpcmVBbGxSb2xlcykge1xuICAgIHByb21pc2VzWzBdID0gYXV0aC5nZXRVc2VyUm9sZXMoKTtcbiAgfVxuICBpZiAodHlwZW9mIHVzZXJSb2xlcyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIHByb21pc2VzWzFdID0gdXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiByZXF1aXJlQWxsUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1syXSA9IHJlcXVpcmVBbGxSb2xlcygpO1xuICB9XG4gIGNvbnN0IFtyb2xlcywgcmVzb2x2ZWRVc2VyUm9sZXMsIHJlc29sdmVkUmVxdWlyZUFsbF0gPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gIGlmIChyZXNvbHZlZFVzZXJSb2xlcyAmJiBBcnJheS5pc0FycmF5KHJlc29sdmVkVXNlclJvbGVzKSkge1xuICAgIHVzZXJSb2xlcyA9IHJlc29sdmVkVXNlclJvbGVzO1xuICB9XG4gIGlmIChyZXNvbHZlZFJlcXVpcmVBbGwgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFJlcXVpcmVBbGwpKSB7XG4gICAgcmVxdWlyZUFsbFJvbGVzID0gcmVzb2x2ZWRSZXF1aXJlQWxsO1xuICB9XG4gIGlmICh1c2VyUm9sZXMpIHtcbiAgICBjb25zdCBoYXNSb2xlID0gdXNlclJvbGVzLnNvbWUocmVxdWlyZWRSb2xlID0+IHJvbGVzLmluY2x1ZGVzKGByb2xlOiR7cmVxdWlyZWRSb2xlfWApKTtcbiAgICBpZiAoIWhhc1JvbGUpIHtcbiAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gVXNlciBkb2VzIG5vdCBtYXRjaCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICB9XG4gIH1cbiAgaWYgKHJlcXVpcmVBbGxSb2xlcykge1xuICAgIGZvciAoY29uc3QgcmVxdWlyZWRSb2xlIG9mIHJlcXVpcmVBbGxSb2xlcykge1xuICAgICAgaWYgKCFyb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggYWxsIHRoZSByZXF1aXJlZCByb2xlcy5gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuICBjb25zdCB1c2VyS2V5cyA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzIHx8IFtdO1xuICBpZiAoQXJyYXkuaXNBcnJheSh1c2VyS2V5cykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB1c2VyS2V5cykge1xuICAgICAgaWYgKCFyZXFVc2VyKSB7XG4gICAgICAgIHRocm93ICdQbGVhc2UgbG9naW4gdG8gbWFrZSB0aGlzIHJlcXVlc3QuJztcbiAgICAgIH1cblxuICAgICAgaWYgKHJlcVVzZXIuZ2V0KGtleSkgPT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzZXQgZGF0YSBmb3IgJHtrZXl9IG9uIHlvdXIgYWNjb3VudC5gO1xuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIGlmICh0eXBlb2YgdXNlcktleXMgPT09ICdvYmplY3QnKSB7XG4gICAgY29uc3Qgb3B0aW9uUHJvbWlzZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cykge1xuICAgICAgY29uc3Qgb3B0ID0gb3B0aW9ucy5yZXF1aXJlVXNlcktleXNba2V5XTtcbiAgICAgIGlmIChvcHQub3B0aW9ucykge1xuICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgcmVxVXNlci5nZXQoa2V5KSkpO1xuICAgICAgfVxuICAgIH1cbiAgICBhd2FpdCBQcm9taXNlLmFsbChvcHRpb25Qcm9taXNlcyk7XG4gIH1cbn1cblxuLy8gVG8gYmUgdXNlZCBhcyBwYXJ0IG9mIHRoZSBwcm9taXNlIGNoYWluIHdoZW4gc2F2aW5nL2RlbGV0aW5nIGFuIG9iamVjdFxuLy8gV2lsbCByZXNvbHZlIHN1Y2Nlc3NmdWxseSBpZiBubyB0cmlnZ2VyIGlzIGNvbmZpZ3VyZWRcbi8vIFJlc29sdmVzIHRvIGFuIG9iamVjdCwgZW1wdHkgb3IgY29udGFpbmluZyBhbiBvYmplY3Qga2V5LiBBIGJlZm9yZVNhdmVcbi8vIHRyaWdnZXIgd2lsbCBzZXQgdGhlIG9iamVjdCBrZXkgdG8gdGhlIHJlc3QgZm9ybWF0IG9iamVjdCB0byBzYXZlLlxuLy8gb3JpZ2luYWxQYXJzZU9iamVjdCBpcyBvcHRpb25hbCwgd2Ugb25seSBuZWVkIHRoYXQgZm9yIGJlZm9yZS9hZnRlclNhdmUgZnVuY3Rpb25zXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5UcmlnZ2VyKFxuICB0cmlnZ2VyVHlwZSxcbiAgYXV0aCxcbiAgcGFyc2VPYmplY3QsXG4gIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gIGNvbmZpZyxcbiAgY29udGV4dFxuKSB7XG4gIGlmICghcGFyc2VPYmplY3QpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHt9KTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoZnVuY3Rpb24gKHJlc29sdmUsIHJlamVjdCkge1xuICAgIHZhciB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihwYXJzZU9iamVjdC5jbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCF0cmlnZ2VyKSByZXR1cm4gcmVzb2x2ZSgpO1xuICAgIHZhciByZXF1ZXN0ID0gZ2V0UmVxdWVzdE9iamVjdChcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgYXV0aCxcbiAgICAgIHBhcnNlT2JqZWN0LFxuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgIGNvbmZpZyxcbiAgICAgIGNvbnRleHRcbiAgICApO1xuICAgIHZhciB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICAgICAgcGFyc2VPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LnRvSlNPTigpLFxuICAgICAgICAgIG9iamVjdCxcbiAgICAgICAgICBhdXRoXG4gICAgICAgICk7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlRGVsZXRlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyRGVsZXRlXG4gICAgICAgICkge1xuICAgICAgICAgIE9iamVjdC5hc3NpZ24oY29udGV4dCwgcmVxdWVzdC5jb250ZXh0KTtcbiAgICAgICAgfVxuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGVycm9yXG4gICAgICAgICk7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIEFmdGVyU2F2ZSBhbmQgYWZ0ZXJEZWxldGUgdHJpZ2dlcnMgY2FuIHJldHVybiBhIHByb21pc2UsIHdoaWNoIGlmIHRoZXlcbiAgICAvLyBkbywgbmVlZHMgdG8gYmUgcmVzb2x2ZWQgYmVmb3JlIHRoaXMgcHJvbWlzZSBpcyByZXNvbHZlZCxcbiAgICAvLyBzbyB0cmlnZ2VyIGV4ZWN1dGlvbiBpcyBzeW5jZWQgd2l0aCBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgLy8gSWYgdHJpZ2dlcnMgZG8gbm90IHJldHVybiBhIHByb21pc2UsIHRoZXkgY2FuIHJ1biBhc3luYyBjb2RlIHBhcmFsbGVsXG4gICAgLy8gdG8gdGhlIFJlc3RXcml0ZS5leGVjdXRlKCkgY2FsbC5cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke3BhcnNlT2JqZWN0LmNsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHByb21pc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckxvZ2luXG4gICAgICAgICkge1xuICAgICAgICAgIGxvZ1RyaWdnZXJBZnRlckhvb2sodHJpZ2dlclR5cGUsIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSwgcGFyc2VPYmplY3QudG9KU09OKCksIGF1dGgpO1xuICAgICAgICB9XG4gICAgICAgIC8vIGJlZm9yZVNhdmUgaXMgZXhwZWN0ZWQgdG8gcmV0dXJuIG51bGwgKG5vdGhpbmcpXG4gICAgICAgIGlmICh0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZSkge1xuICAgICAgICAgIGlmIChwcm9taXNlICYmIHR5cGVvZiBwcm9taXNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBwcm9taXNlLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgICAgICAvLyByZXNwb25zZS5vYmplY3QgbWF5IGNvbWUgZnJvbSBleHByZXNzIHJvdXRpbmcgYmVmb3JlIGhvb2tcbiAgICAgICAgICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSk7XG59XG5cbi8vIENvbnZlcnRzIGEgUkVTVC1mb3JtYXQgb2JqZWN0IHRvIGEgUGFyc2UuT2JqZWN0XG4vLyBkYXRhIGlzIGVpdGhlciBjbGFzc05hbWUgb3IgYW4gb2JqZWN0XG5leHBvcnQgZnVuY3Rpb24gaW5mbGF0ZShkYXRhLCByZXN0T2JqZWN0KSB7XG4gIHZhciBjb3B5ID0gdHlwZW9mIGRhdGEgPT0gJ29iamVjdCcgPyBkYXRhIDogeyBjbGFzc05hbWU6IGRhdGEgfTtcbiAgZm9yICh2YXIga2V5IGluIHJlc3RPYmplY3QpIHtcbiAgICBjb3B5W2tleV0gPSByZXN0T2JqZWN0W2tleV07XG4gIH1cbiAgcmV0dXJuIFBhcnNlLk9iamVjdC5mcm9tSlNPTihjb3B5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoZGF0YSwgYXBwbGljYXRpb25JZCA9IFBhcnNlLmFwcGxpY2F0aW9uSWQpIHtcbiAgaWYgKCFfdHJpZ2dlclN0b3JlIHx8ICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8ICFfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5mb3JFYWNoKGhhbmRsZXIgPT4gaGFuZGxlcihkYXRhKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKSB7XG4gIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgLi4uZmlsZU9iamVjdCxcbiAgICB0cmlnZ2VyTmFtZTogdHJpZ2dlclR5cGUsXG4gICAgbWFzdGVyOiBmYWxzZSxcbiAgICBsb2c6IGNvbmZpZy5sb2dnZXJDb250cm9sbGVyLFxuICAgIGhlYWRlcnM6IGNvbmZpZy5oZWFkZXJzLFxuICAgIGlwOiBjb25maWcuaXAsXG4gICAgYXV0aCxcbiAgfTtcblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYXliZVJ1bkZpbGVUcmlnZ2VyKHRyaWdnZXJUeXBlLCBmaWxlT2JqZWN0LCBjb25maWcsIGF1dGgpIHtcbiAgY29uc3QgZmlsZVRyaWdnZXIgPSBnZXRGaWxlVHJpZ2dlcih0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICBpZiAodHlwZW9mIGZpbGVUcmlnZ2VyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0RmlsZU9iamVjdCh0cmlnZ2VyVHlwZSwgYXV0aCwgZmlsZU9iamVjdCwgY29uZmlnKTtcbiAgICAgIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke0ZpbGVDbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gZmlsZU9iamVjdDtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVUcmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgcmVzdWx0LFxuICAgICAgICBhdXRoXG4gICAgICApO1xuICAgICAgcmV0dXJuIHJlc3VsdCB8fCBmaWxlT2JqZWN0O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBsb2dUcmlnZ2VyRXJyb3JCZWZvcmVIb29rKFxuICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgJ1BhcnNlLkZpbGUnLFxuICAgICAgICB7IC4uLmZpbGVPYmplY3QuZmlsZS50b0pTT04oKSwgZmlsZVNpemU6IGZpbGVPYmplY3QuZmlsZVNpemUgfSxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgZXJyb3JcbiAgICAgICk7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZpbGVPYmplY3Q7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNB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