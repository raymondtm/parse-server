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
    context: context || {}
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
    ip: config.ip
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkZpbGVDbGFzc05hbWUiLCJDb25uZWN0Q2xhc3NOYW1lIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiRnVuY3Rpb25zIiwiSm9icyIsIkxpdmVRdWVyeSIsIlRyaWdnZXJzIiwiZnJlZXplIiwiZ2V0Q2xhc3NOYW1lIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsIm5hbWUiLCJhcHBsaWNhdGlvbklkIiwicGF0aCIsInNwbGl0Iiwic3BsaWNlIiwiUGFyc2UiLCJzdG9yZSIsImNvbXBvbmVudCIsInVuZGVmaW5lZCIsImFkZCIsImhhbmRsZXIiLCJsYXN0Q29tcG9uZW50IiwibG9nZ2VyIiwid2FybiIsInJlbW92ZSIsImdldCIsImFkZEZ1bmN0aW9uIiwiZnVuY3Rpb25OYW1lIiwidmFsaWRhdGlvbkhhbmRsZXIiLCJhZGRKb2IiLCJqb2JOYW1lIiwiYWRkVHJpZ2dlciIsImFkZEZpbGVUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsImdldEZpbGVUcmlnZ2VyIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInRyaWdnZXJOYW1lIiwibWFzdGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm9yaWdpbmFsIiwiYXNzaWduIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJnZXRSZXF1ZXN0UXVlcnlPYmplY3QiLCJxdWVyeSIsImNvdW50IiwiaXNHZXQiLCJnZXRSZXNwb25zZU9iamVjdCIsInJlc29sdmUiLCJyZWplY3QiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJvYmplY3RzIiwibWFwIiwiZXF1YWxzIiwiX2dldFNhdmVKU09OIiwiaWQiLCJlcnJvciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJpbnB1dCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwiaW5mbyIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIlByb21pc2UiLCJmcm9tSlNPTiIsInRoZW4iLCJyZXN1bHRzIiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImpzb24iLCJ3aGVyZSIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwicmVxdWVzdE9iamVjdCIsInF1ZXJ5UmVzdWx0IiwianNvblF1ZXJ5IiwibGltaXQiLCJza2lwIiwiaW5jbHVkZSIsImV4Y2x1ZGVLZXlzIiwiZXhwbGFpbiIsIm9yZGVyIiwiaGludCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImVyciIsImRlZmF1bHRPcHRzIiwic3RhY2siLCJ2YWxpZGF0b3IiLCJ0aGVWYWxpZGF0b3IiLCJidWlsdEluVHJpZ2dlclZhbGlkYXRvciIsImNhdGNoIiwiVkFMSURBVElPTl9FUlJPUiIsIm9wdGlvbnMiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInJlcVVzZXIiLCJleGlzdGVkIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJwYXJhbXMiLCJyZXF1aXJlZFBhcmFtIiwidmFsaWRhdGVPcHRpb25zIiwib3B0Iiwib3B0cyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVzIiwiam9pbiIsImdldFR5cGUiLCJmbiIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImZpZWxkcyIsIm9wdGlvblByb21pc2VzIiwiZGVmYXVsdCIsInNldCIsImNvbnN0YW50IiwicmVxdWlyZWQiLCJvcHRpb25hbCIsInZhbFR5cGUiLCJhbGwiLCJ1c2VyUm9sZXMiLCJyZXF1aXJlQWxsUm9sZXMiLCJwcm9taXNlcyIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwicmVzb2x2ZWRVc2VyUm9sZXMiLCJyZXNvbHZlZFJlcXVpcmVBbGwiLCJoYXNSb2xlIiwic29tZSIsInJlcXVpcmVkUm9sZSIsInVzZXJLZXlzIiwicmVxdWlyZVVzZXJLZXlzIiwibWF5YmVSdW5UcmlnZ2VyIiwicHJvbWlzZSIsImluZmxhdGUiLCJkYXRhIiwicmVzdE9iamVjdCIsImNvcHkiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZ2V0UmVxdWVzdEZpbGVPYmplY3QiLCJmaWxlT2JqZWN0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsImZpbGVUcmlnZ2VyIiwiZmlsZSIsImZpbGVTaXplIl0sInNvdXJjZXMiOlsiLi4vc3JjL3RyaWdnZXJzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGFmdGVyTG9naW46ICdhZnRlckxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlU2F2ZUZpbGU6ICdiZWZvcmVTYXZlRmlsZScsXG4gIGFmdGVyU2F2ZUZpbGU6ICdhZnRlclNhdmVGaWxlJyxcbiAgYmVmb3JlRGVsZXRlRmlsZTogJ2JlZm9yZURlbGV0ZUZpbGUnLFxuICBhZnRlckRlbGV0ZUZpbGU6ICdhZnRlckRlbGV0ZUZpbGUnLFxuICBiZWZvcmVDb25uZWN0OiAnYmVmb3JlQ29ubmVjdCcsXG4gIGJlZm9yZVN1YnNjcmliZTogJ2JlZm9yZVN1YnNjcmliZScsXG4gIGFmdGVyRXZlbnQ6ICdhZnRlckV2ZW50Jyxcbn07XG5cbmNvbnN0IEZpbGVDbGFzc05hbWUgPSAnQEZpbGUnO1xuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHBhdGggPSBuYW1lLnNwbGl0KCcuJyk7XG4gIHBhdGguc3BsaWNlKC0xKTsgLy8gcmVtb3ZlIGxhc3QgY29tcG9uZW50XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBsZXQgc3RvcmUgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW2NhdGVnb3J5XTtcbiAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgcGF0aCkge1xuICAgIHN0b3JlID0gc3RvcmVbY29tcG9uZW50XTtcbiAgICBpZiAoIXN0b3JlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoc3RvcmVbbGFzdENvbXBvbmVudF0pIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBXYXJuaW5nOiBEdXBsaWNhdGUgY2xvdWQgZnVuY3Rpb25zIGV4aXN0IGZvciAke2xhc3RDb21wb25lbnR9LiBPbmx5IHRoZSBsYXN0IG9uZSB3aWxsIGJlIHVzZWQgYW5kIHRoZSBvdGhlcnMgd2lsbCBiZSBpZ25vcmVkLmBcbiAgICApO1xuICB9XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZpbGVUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENvbm5lY3RUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCwgY2xhc3NOYW1lKSB7XG4gIGlmICghb2JqZWN0IHx8ICFvYmplY3QudG9KU09OKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG4gIGNvbnN0IHRvSlNPTiA9IG9iamVjdC50b0pTT04oKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKG9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiBwZW5kaW5nKSB7XG4gICAgY29uc3QgdmFsID0gb2JqZWN0LmdldChrZXkpO1xuICAgIGlmICghdmFsIHx8ICF2YWwuX3RvRnVsbEpTT04pIHtcbiAgICAgIHRvSlNPTltrZXldID0gdmFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRvSlNPTltrZXldID0gdmFsLl90b0Z1bGxKU09OKCk7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSkge1xuICAgIHRvSlNPTi5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIH1cbiAgcmV0dXJuIHRvSlNPTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5UcmlnZ2VyKHRyaWdnZXIsIG5hbWUsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIG5hbWUsIGF1dGgpO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gYXdhaXQgdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbGVUcmlnZ2VyKHR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoRmlsZUNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGF1dGgsXG4gIH07XG5cbiAgaWYgKG9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICByZXF1ZXN0Lm9yaWdpbmFsID0gb3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgfVxuICBpZiAoXG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckZpbmRcbiAgKSB7XG4gICAgLy8gU2V0IGEgY29weSBvZiB0aGUgY29udGV4dCBvbiB0aGUgcmVxdWVzdCBvYmplY3QuXG4gICAgcmVxdWVzdC5jb250ZXh0ID0gT2JqZWN0LmFzc2lnbih7fSwgY29udGV4dCk7XG4gIH1cblxuICBpZiAoIWF1dGgpIHtcbiAgICByZXR1cm4gcmVxdWVzdDtcbiAgfVxuICBpZiAoYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcXVlc3RbJ21hc3RlciddID0gdHJ1ZTtcbiAgfVxuICBpZiAoYXV0aC51c2VyKSB7XG4gICAgcmVxdWVzdFsndXNlciddID0gYXV0aC51c2VyO1xuICB9XG4gIGlmIChhdXRoLmluc3RhbGxhdGlvbklkKSB7XG4gICAgcmVxdWVzdFsnaW5zdGFsbGF0aW9uSWQnXSA9IGF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXF1ZXN0UXVlcnlPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIHF1ZXJ5LCBjb3VudCwgY29uZmlnLCBjb250ZXh0LCBpc0dldCkge1xuICBpc0dldCA9ICEhaXNHZXQ7XG5cbiAgdmFyIHJlcXVlc3QgPSB7XG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIHF1ZXJ5LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgY291bnQsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBpc0dldCxcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICAgIGNvbnRleHQ6IGNvbnRleHQgfHwge30sXG4gIH07XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG4vLyBDcmVhdGVzIHRoZSByZXNwb25zZSBvYmplY3QsIGFuZCB1c2VzIHRoZSByZXF1ZXN0IG9iamVjdCB0byBwYXNzIGRhdGFcbi8vIFRoZSBBUEkgd2lsbCBjYWxsIHRoaXMgd2l0aCBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0cywgdGhpcyB3aWxsXG4vLyB0cmFuc2Zvcm0gdGhlbSB0byBQYXJzZS5PYmplY3QgaW5zdGFuY2VzIGV4cGVjdGVkIGJ5IENsb3VkIENvZGUuXG4vLyBBbnkgY2hhbmdlcyBtYWRlIHRvIHRoZSBvYmplY3QgaW4gYSBiZWZvcmVTYXZlIHdpbGwgYmUgaW5jbHVkZWQuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVzcG9uc2VPYmplY3QocmVxdWVzdCwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gIHJldHVybiB7XG4gICAgc3VjY2VzczogZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kKSB7XG4gICAgICAgIGlmICghcmVzcG9uc2UpIHtcbiAgICAgICAgICByZXNwb25zZSA9IHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICByZXNwb25zZSA9IHJlc3BvbnNlLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIHJldHVybiB0b0pTT053aXRoT2JqZWN0cyhvYmplY3QpO1xuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgLy8gVXNlIHRoZSBKU09OIHJlc3BvbnNlXG4gICAgICBpZiAoXG4gICAgICAgIHJlc3BvbnNlICYmXG4gICAgICAgIHR5cGVvZiByZXNwb25zZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgICAgIXJlcXVlc3Qub2JqZWN0LmVxdWFscyhyZXNwb25zZSkgJiZcbiAgICAgICAgcmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYmVmb3JlU2F2ZVxuICAgICAgKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVxdWVzdC50cmlnZ2VyTmFtZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlKSB7XG4gICAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgICB9XG4gICAgICByZXNwb25zZSA9IHt9O1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgcmVzcG9uc2VbJ29iamVjdCddID0gcmVxdWVzdC5vYmplY3QuX2dldFNhdmVKU09OKCk7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXVsnb2JqZWN0SWQnXSA9IHJlcXVlc3Qub2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgIH0sXG4gICAgZXJyb3I6IGZ1bmN0aW9uIChlcnJvcikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnJvciwge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgfSk7XG4gICAgICByZWplY3QoZSk7XG4gICAgfSxcbiAgfTtcbn1cblxuZnVuY3Rpb24gdXNlcklkRm9yTG9nKGF1dGgpIHtcbiAgcmV0dXJuIGF1dGggJiYgYXV0aC51c2VyID8gYXV0aC51c2VyLmlkIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIGlucHV0LCBhdXRoKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgcmVzdWx0LCBhdXRoKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGNvbnN0IGNsZWFuUmVzdWx0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShyZXN1bHQpKTtcbiAgbG9nZ2VyLmluZm8oXG4gICAgYCR7dHJpZ2dlclR5cGV9IHRyaWdnZXJlZCBmb3IgJHtjbGFzc05hbWV9IGZvciB1c2VyICR7dXNlcklkRm9yTG9nKFxuICAgICAgYXV0aFxuICAgICl9OlxcbiAgSW5wdXQ6ICR7Y2xlYW5JbnB1dH1cXG4gIFJlc3VsdDogJHtjbGVhblJlc3VsdH1gLFxuICAgIHtcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCwgZXJyb3IpIHtcbiAgY29uc3QgY2xlYW5JbnB1dCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkoaW5wdXQpKTtcbiAgbG9nZ2VyLmVycm9yKFxuICAgIGAke3RyaWdnZXJUeXBlfSBmYWlsZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBFcnJvcjogJHtKU09OLnN0cmluZ2lmeShlcnJvcil9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGVycm9yLFxuICAgICAgdXNlcjogdXNlcklkRm9yTG9nKGF1dGgpLFxuICAgIH1cbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIGNsYXNzTmFtZSxcbiAgb2JqZWN0cyxcbiAgY29uZmlnLFxuICBxdWVyeSxcbiAgY29udGV4dFxuKSB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikge1xuICAgICAgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIG51bGwsIG51bGwsIGNvbmZpZywgY29udGV4dCk7XG4gICAgaWYgKHF1ZXJ5KSB7XG4gICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgfVxuICAgIGNvbnN0IHsgc3VjY2VzcywgZXJyb3IgfSA9IGdldFJlc3BvbnNlT2JqZWN0KFxuICAgICAgcmVxdWVzdCxcbiAgICAgIG9iamVjdCA9PiB7XG4gICAgICAgIHJlc29sdmUob2JqZWN0KTtcbiAgICAgIH0sXG4gICAgICBlcnJvciA9PiB7XG4gICAgICAgIHJlamVjdChlcnJvcik7XG4gICAgICB9XG4gICAgKTtcbiAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgJ0FmdGVyRmluZCcsIEpTT04uc3RyaW5naWZ5KG9iamVjdHMpLCBhdXRoKTtcbiAgICByZXF1ZXN0Lm9iamVjdHMgPSBvYmplY3RzLm1hcChvYmplY3QgPT4ge1xuICAgICAgLy9zZXR0aW5nIHRoZSBjbGFzcyBuYW1lIHRvIHRyYW5zZm9ybSBpbnRvIHBhcnNlIG9iamVjdFxuICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqZWN0KTtcbiAgICB9KTtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIGAke3RyaWdnZXJUeXBlfS4ke2NsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3Qub2JqZWN0cztcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZXNwb25zZSA9IHRyaWdnZXIocmVxdWVzdCk7XG4gICAgICAgIGlmIChyZXNwb25zZSAmJiB0eXBlb2YgcmVzcG9uc2UudGhlbiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIHJldHVybiByZXNwb25zZS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3BvbnNlO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHN1Y2Nlc3MsIGVycm9yKTtcbiAgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsIEpTT04uc3RyaW5naWZ5KHJlc3VsdHMpLCBhdXRoKTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blF1ZXJ5VHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGNsYXNzTmFtZSxcbiAgcmVzdFdoZXJlLFxuICByZXN0T3B0aW9ucyxcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjb250ZXh0LFxuICBpc0dldFxuKSB7XG4gIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICByZXN0V2hlcmUsXG4gICAgICByZXN0T3B0aW9ucyxcbiAgICB9KTtcbiAgfVxuICBjb25zdCBqc29uID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdE9wdGlvbnMpO1xuICBqc29uLndoZXJlID0gcmVzdFdoZXJlO1xuXG4gIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgcGFyc2VRdWVyeS53aXRoSlNPTihqc29uKTtcblxuICBsZXQgY291bnQgPSBmYWxzZTtcbiAgaWYgKHJlc3RPcHRpb25zKSB7XG4gICAgY291bnQgPSAhIXJlc3RPcHRpb25zLmNvdW50O1xuICB9XG4gIGNvbnN0IHJlcXVlc3RPYmplY3QgPSBnZXRSZXF1ZXN0UXVlcnlPYmplY3QoXG4gICAgdHJpZ2dlclR5cGUsXG4gICAgYXV0aCxcbiAgICBwYXJzZVF1ZXJ5LFxuICAgIGNvdW50LFxuICAgIGNvbmZpZyxcbiAgICBjb250ZXh0LFxuICAgIGlzR2V0XG4gICk7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0T2JqZWN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVxdWVzdE9iamVjdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICByZXR1cm4gcmVxdWVzdE9iamVjdC5xdWVyeTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cmlnZ2VyKHJlcXVlc3RPYmplY3QpO1xuICAgIH0pXG4gICAgLnRoZW4oXG4gICAgICByZXN1bHQgPT4ge1xuICAgICAgICBsZXQgcXVlcnlSZXN1bHQgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBpZiAocmVzdWx0ICYmIHJlc3VsdCBpbnN0YW5jZW9mIFBhcnNlLlF1ZXJ5KSB7XG4gICAgICAgICAgcXVlcnlSZXN1bHQgPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QganNvblF1ZXJ5ID0gcXVlcnlSZXN1bHQudG9KU09OKCk7XG4gICAgICAgIGlmIChqc29uUXVlcnkud2hlcmUpIHtcbiAgICAgICAgICByZXN0V2hlcmUgPSBqc29uUXVlcnkud2hlcmU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5saW1pdCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMubGltaXQgPSBqc29uUXVlcnkubGltaXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5za2lwKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5za2lwID0ganNvblF1ZXJ5LnNraXA7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5pbmNsdWRlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlID0ganNvblF1ZXJ5LmluY2x1ZGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leGNsdWRlS2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhjbHVkZUtleXMgPSBqc29uUXVlcnkuZXhjbHVkZUtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5leHBsYWluKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5leHBsYWluID0ganNvblF1ZXJ5LmV4cGxhaW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5rZXlzID0ganNvblF1ZXJ5LmtleXM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5vcmRlcikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMub3JkZXIgPSBqc29uUXVlcnkub3JkZXI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGpzb25RdWVyeS5oaW50KSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5oaW50ID0ganNvblF1ZXJ5LmhpbnQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5yZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5pbmNsdWRlUmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGVSZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXN0V2hlcmUsXG4gICAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgZXJyID0+IHtcbiAgICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZXJyLCB7XG4gICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiAnU2NyaXB0IGZhaWxlZC4gVW5rbm93biBlcnJvci4nLFxuICAgICAgICB9KTtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVFcnJvcihtZXNzYWdlLCBkZWZhdWx0T3B0cykge1xuICBpZiAoIWRlZmF1bHRPcHRzKSB7XG4gICAgZGVmYXVsdE9wdHMgPSB7fTtcbiAgfVxuICBpZiAoIW1lc3NhZ2UpIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVELFxuICAgICAgZGVmYXVsdE9wdHMubWVzc2FnZSB8fCAnU2NyaXB0IGZhaWxlZC4nXG4gICAgKTtcbiAgfVxuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cblxuICBjb25zdCBjb2RlID0gZGVmYXVsdE9wdHMuY29kZSB8fCBQYXJzZS5FcnJvci5TQ1JJUFRfRkFJTEVEO1xuICAvLyBJZiBpdCdzIGFuIGVycm9yLCBtYXJrIGl0IGFzIGEgc2NyaXB0IGZhaWxlZFxuICBpZiAodHlwZW9mIG1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlKTtcbiAgfVxuICBjb25zdCBlcnJvciA9IG5ldyBQYXJzZS5FcnJvcihjb2RlLCBtZXNzYWdlLm1lc3NhZ2UgfHwgbWVzc2FnZSk7XG4gIGlmIChtZXNzYWdlIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICBlcnJvci5zdGFjayA9IG1lc3NhZ2Uuc3RhY2s7XG4gIH1cbiAgcmV0dXJuIGVycm9yO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIHZhbGlkYXRvciwgYXV0aCkge1xuICBsZXQgdGhlVmFsaWRhdG9yO1xuICBpZiAodHlwZW9mIHZhbGlkYXRvciA9PT0gJ3N0cmluZycpIHtcbiAgICB0aGVWYWxpZGF0b3IgPSBnZXRWYWxpZGF0b3IodmFsaWRhdG9yLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgdmFsaWRhdG9yID09PSAnb2JqZWN0Jykge1xuICAgIHRoZVZhbGlkYXRvciA9IHZhbGlkYXRvcjtcbiAgfVxuXG4gIGlmICghdGhlVmFsaWRhdG9yKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0JyAmJiB0aGVWYWxpZGF0b3Iuc2tpcFdpdGhNYXN0ZXJLZXkgJiYgcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICByZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5ID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCdcbiAgICAgICAgICA/IGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKHRoZVZhbGlkYXRvciwgcmVxdWVzdCwgYXV0aClcbiAgICAgICAgICA6IHRoZVZhbGlkYXRvcihyZXF1ZXN0KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZSA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgIG1lc3NhZ2U6ICdWYWxpZGF0aW9uIGZhaWxlZC4nLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH0pO1xuICB9KTtcbn1cbmFzeW5jIGZ1bmN0aW9uIGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKG9wdGlvbnMsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKHJlcXVlc3QubWFzdGVyICYmICFvcHRpb25zLnZhbGlkYXRlTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCByZXFVc2VyID0gcmVxdWVzdC51c2VyO1xuICBpZiAoXG4gICAgIXJlcVVzZXIgJiZcbiAgICByZXF1ZXN0Lm9iamVjdCAmJlxuICAgIHJlcXVlc3Qub2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICFyZXF1ZXN0Lm9iamVjdC5leGlzdGVkKClcbiAgKSB7XG4gICAgcmVxVXNlciA9IHJlcXVlc3Qub2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICAob3B0aW9ucy5yZXF1aXJlVXNlciB8fCBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXMgfHwgb3B0aW9ucy5yZXF1aXJlQWxsVXNlclJvbGVzKSAmJlxuICAgICFyZXFVc2VyXG4gICkge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIGxvZ2luIHRvIGNvbnRpbnVlLic7XG4gIH1cbiAgaWYgKG9wdGlvbnMucmVxdWlyZU1hc3RlciAmJiAhcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIE1hc3RlciBrZXkgaXMgcmVxdWlyZWQgdG8gY29tcGxldGUgdGhpcyByZXF1ZXN0Lic7XG4gIH1cbiAgbGV0IHBhcmFtcyA9IHJlcXVlc3QucGFyYW1zIHx8IHt9O1xuICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICBwYXJhbXMgPSByZXF1ZXN0Lm9iamVjdC50b0pTT04oKTtcbiAgfVxuICBjb25zdCByZXF1aXJlZFBhcmFtID0ga2V5ID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcmFtc1trZXldO1xuICAgIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzcGVjaWZ5IGRhdGEgZm9yICR7a2V5fS5gO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCB2YWxpZGF0ZU9wdGlvbnMgPSBhc3luYyAob3B0LCBrZXksIHZhbCkgPT4ge1xuICAgIGxldCBvcHRzID0gb3B0Lm9wdGlvbnM7XG4gICAgaWYgKHR5cGVvZiBvcHRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvcHRzKHZhbCk7XG4gICAgICAgIGlmICghcmVzdWx0ICYmIHJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB2YWx1ZSBmb3IgJHtrZXl9LmA7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKCFlKSB7XG4gICAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB2YWx1ZSBmb3IgJHtrZXl9LmA7XG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgZS5tZXNzYWdlIHx8IGU7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghQXJyYXkuaXNBcnJheShvcHRzKSkge1xuICAgICAgb3B0cyA9IFtvcHQub3B0aW9uc107XG4gICAgfVxuXG4gICAgaWYgKCFvcHRzLmluY2x1ZGVzKHZhbCkpIHtcbiAgICAgIHRocm93IChcbiAgICAgICAgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCBvcHRpb24gZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7b3B0cy5qb2luKCcsICcpfWBcbiAgICAgICk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGdldFR5cGUgPSBmbiA9PiB7XG4gICAgY29uc3QgbWF0Y2ggPSBmbiAmJiBmbi50b1N0cmluZygpLm1hdGNoKC9eXFxzKmZ1bmN0aW9uIChcXHcrKS8pO1xuICAgIHJldHVybiAobWF0Y2ggPyBtYXRjaFsxXSA6ICcnKS50b0xvd2VyQ2FzZSgpO1xuICB9O1xuICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLmZpZWxkcykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLmZpZWxkc1trZXldO1xuICAgICAgbGV0IHZhbCA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmVkUGFyYW0ob3B0KTtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCAmJiB2YWwgPT0gbnVsbCkge1xuICAgICAgICAgIHZhbCA9IG9wdC5kZWZhdWx0O1xuICAgICAgICAgIHBhcmFtc1trZXldID0gdmFsO1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgdmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5jb25zdGFudCAmJiByZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9yaWdpbmFsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCByZXF1ZXN0Lm9yaWdpbmFsLmdldChrZXkpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIG9wdC5kZWZhdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5yZXF1aXJlZCkge1xuICAgICAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvcHRpb25hbCA9ICFvcHQucmVxdWlyZWQgJiYgdmFsID09PSB1bmRlZmluZWQ7XG4gICAgICAgIGlmICghb3B0aW9uYWwpIHtcbiAgICAgICAgICBpZiAob3B0LnR5cGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBnZXRUeXBlKG9wdC50eXBlKTtcbiAgICAgICAgICAgIGNvbnN0IHZhbFR5cGUgPSBBcnJheS5pc0FycmF5KHZhbCkgPyAnYXJyYXknIDogdHlwZW9mIHZhbDtcbiAgICAgICAgICAgIGlmICh2YWxUeXBlICE9PSB0eXBlKSB7XG4gICAgICAgICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB0eXBlIGZvciAke2tleX0uIEV4cGVjdGVkOiAke3R5cGV9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgdmFsKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxuICBsZXQgdXNlclJvbGVzID0gb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzO1xuICBsZXQgcmVxdWlyZUFsbFJvbGVzID0gb3B0aW9ucy5yZXF1aXJlQWxsVXNlclJvbGVzO1xuICBjb25zdCBwcm9taXNlcyA9IFtQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpXTtcbiAgaWYgKHVzZXJSb2xlcyB8fCByZXF1aXJlQWxsUm9sZXMpIHtcbiAgICBwcm9taXNlc1swXSA9IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiB1c2VyUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1sxXSA9IHVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgcmVxdWlyZUFsbFJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMl0gPSByZXF1aXJlQWxsUm9sZXMoKTtcbiAgfVxuICBjb25zdCBbcm9sZXMsIHJlc29sdmVkVXNlclJvbGVzLCByZXNvbHZlZFJlcXVpcmVBbGxdID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICBpZiAocmVzb2x2ZWRVc2VyUm9sZXMgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFVzZXJSb2xlcykpIHtcbiAgICB1c2VyUm9sZXMgPSByZXNvbHZlZFVzZXJSb2xlcztcbiAgfVxuICBpZiAocmVzb2x2ZWRSZXF1aXJlQWxsICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRSZXF1aXJlQWxsKSkge1xuICAgIHJlcXVpcmVBbGxSb2xlcyA9IHJlc29sdmVkUmVxdWlyZUFsbDtcbiAgfVxuICBpZiAodXNlclJvbGVzKSB7XG4gICAgY29uc3QgaGFzUm9sZSA9IHVzZXJSb2xlcy5zb21lKHJlcXVpcmVkUm9sZSA9PiByb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSk7XG4gICAgaWYgKCFoYXNSb2xlKSB7XG4gICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgfVxuICB9XG4gIGlmIChyZXF1aXJlQWxsUm9sZXMpIHtcbiAgICBmb3IgKGNvbnN0IHJlcXVpcmVkUm9sZSBvZiByZXF1aXJlQWxsUm9sZXMpIHtcbiAgICAgIGlmICghcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpIHtcbiAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIGFsbCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgdXNlcktleXMgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cyB8fCBbXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkodXNlcktleXMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgdXNlcktleXMpIHtcbiAgICAgIGlmICghcmVxVXNlcikge1xuICAgICAgICB0aHJvdyAnUGxlYXNlIGxvZ2luIHRvIG1ha2UgdGhpcyByZXF1ZXN0Lic7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXFVc2VyLmdldChrZXkpID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc2V0IGRhdGEgZm9yICR7a2V5fSBvbiB5b3VyIGFjY291bnQuYDtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZW9mIHVzZXJLZXlzID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzW2tleV07XG4gICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHJlcVVzZXIuZ2V0KGtleSkpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG59XG5cbi8vIFRvIGJlIHVzZWQgYXMgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiB3aGVuIHNhdmluZy9kZWxldGluZyBhbiBvYmplY3Rcbi8vIFdpbGwgcmVzb2x2ZSBzdWNjZXNzZnVsbHkgaWYgbm8gdHJpZ2dlciBpcyBjb25maWd1cmVkXG4vLyBSZXNvbHZlcyB0byBhbiBvYmplY3QsIGVtcHR5IG9yIGNvbnRhaW5pbmcgYW4gb2JqZWN0IGtleS4gQSBiZWZvcmVTYXZlXG4vLyB0cmlnZ2VyIHdpbGwgc2V0IHRoZSBvYmplY3Qga2V5IHRvIHRoZSByZXN0IGZvcm1hdCBvYmplY3QgdG8gc2F2ZS5cbi8vIG9yaWdpbmFsUGFyc2VPYmplY3QgaXMgb3B0aW9uYWwsIHdlIG9ubHkgbmVlZCB0aGF0IGZvciBiZWZvcmUvYWZ0ZXJTYXZlIGZ1bmN0aW9uc1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgdHJpZ2dlciA9IGdldFRyaWdnZXIocGFyc2VPYmplY3QuY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB2YXIgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGF1dGgsXG4gICAgICBwYXJzZU9iamVjdCxcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICBjb25maWcsXG4gICAgICBjb250ZXh0XG4gICAgKTtcbiAgICB2YXIgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgYXV0aFxuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBwYXJzZU9iamVjdC5jbGFzc05hbWUsIHBhcnNlT2JqZWN0LnRvSlNPTigpLCBhdXRoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiZWZvcmVTYXZlIGlzIGV4cGVjdGVkIHRvIHJldHVybiBudWxsIChub3RoaW5nKVxuICAgICAgICBpZiAodHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgICBpZiAocHJvbWlzZSAmJiB0eXBlb2YgcHJvbWlzZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgLy8gcmVzcG9uc2Uub2JqZWN0IG1heSBjb21lIGZyb20gZXhwcmVzcyByb3V0aW5nIGJlZm9yZSBob29rXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pO1xufVxuXG4vLyBDb252ZXJ0cyBhIFJFU1QtZm9ybWF0IG9iamVjdCB0byBhIFBhcnNlLk9iamVjdFxuLy8gZGF0YSBpcyBlaXRoZXIgY2xhc3NOYW1lIG9yIGFuIG9iamVjdFxuZXhwb3J0IGZ1bmN0aW9uIGluZmxhdGUoZGF0YSwgcmVzdE9iamVjdCkge1xuICB2YXIgY29weSA9IHR5cGVvZiBkYXRhID09ICdvYmplY3QnID8gZGF0YSA6IHsgY2xhc3NOYW1lOiBkYXRhIH07XG4gIGZvciAodmFyIGtleSBpbiByZXN0T2JqZWN0KSB7XG4gICAgY29weVtrZXldID0gcmVzdE9iamVjdFtrZXldO1xuICB9XG4gIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04oY29weSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKGRhdGEsIGFwcGxpY2F0aW9uSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkKSB7XG4gIGlmICghX3RyaWdnZXJTdG9yZSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZykge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIC4uLmZpbGVPYmplY3QsXG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlclR5cGUsIGZpbGVPYmplY3QsIGNvbmZpZywgYXV0aCkge1xuICBjb25zdCBmaWxlVHJpZ2dlciA9IGdldEZpbGVUcmlnZ2VyKHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICh0eXBlb2YgZmlsZVRyaWdnZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpO1xuICAgICAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiBmaWxlT2JqZWN0O1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZVRyaWdnZXIocmVxdWVzdCk7XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGhcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGZpbGVPYmplY3Q7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICBhdXRoLFxuICAgICAgICBlcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmlsZU9iamVjdDtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxN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