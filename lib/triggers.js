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
    ip: config.ip
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

function maybeRunValidator(request, functionName, auth) {
  const theValidator = getValidator(functionName, _node.default.applicationId);

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUeXBlcyIsImJlZm9yZUxvZ2luIiwiYWZ0ZXJMb2dpbiIsImFmdGVyTG9nb3V0IiwiYmVmb3JlU2F2ZSIsImFmdGVyU2F2ZSIsImJlZm9yZURlbGV0ZSIsImFmdGVyRGVsZXRlIiwiYmVmb3JlRmluZCIsImFmdGVyRmluZCIsImJlZm9yZVNhdmVGaWxlIiwiYWZ0ZXJTYXZlRmlsZSIsImJlZm9yZURlbGV0ZUZpbGUiLCJhZnRlckRlbGV0ZUZpbGUiLCJiZWZvcmVDb25uZWN0IiwiYmVmb3JlU3Vic2NyaWJlIiwiYWZ0ZXJFdmVudCIsIkZpbGVDbGFzc05hbWUiLCJDb25uZWN0Q2xhc3NOYW1lIiwiYmFzZVN0b3JlIiwiVmFsaWRhdG9ycyIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJiYXNlIiwia2V5IiwiRnVuY3Rpb25zIiwiSm9icyIsIkxpdmVRdWVyeSIsIlRyaWdnZXJzIiwiZnJlZXplIiwiZ2V0Q2xhc3NOYW1lIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsInZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMiLCJ0eXBlIiwiX3RyaWdnZXJTdG9yZSIsIkNhdGVnb3J5IiwiZ2V0U3RvcmUiLCJjYXRlZ29yeSIsIm5hbWUiLCJhcHBsaWNhdGlvbklkIiwicGF0aCIsInNwbGl0Iiwic3BsaWNlIiwiUGFyc2UiLCJzdG9yZSIsImNvbXBvbmVudCIsInVuZGVmaW5lZCIsImFkZCIsImhhbmRsZXIiLCJsYXN0Q29tcG9uZW50IiwibG9nZ2VyIiwid2FybiIsInJlbW92ZSIsImdldCIsImFkZEZ1bmN0aW9uIiwiZnVuY3Rpb25OYW1lIiwidmFsaWRhdGlvbkhhbmRsZXIiLCJhZGRKb2IiLCJqb2JOYW1lIiwiYWRkVHJpZ2dlciIsImFkZEZpbGVUcmlnZ2VyIiwiYWRkQ29ubmVjdFRyaWdnZXIiLCJhZGRMaXZlUXVlcnlFdmVudEhhbmRsZXIiLCJwdXNoIiwicmVtb3ZlRnVuY3Rpb24iLCJyZW1vdmVUcmlnZ2VyIiwiX3VucmVnaXN0ZXJBbGwiLCJmb3JFYWNoIiwiYXBwSWQiLCJ0b0pTT053aXRoT2JqZWN0cyIsIm9iamVjdCIsInRvSlNPTiIsInN0YXRlQ29udHJvbGxlciIsIkNvcmVNYW5hZ2VyIiwiZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyIiwicGVuZGluZyIsImdldFBlbmRpbmdPcHMiLCJfZ2V0U3RhdGVJZGVudGlmaWVyIiwidmFsIiwiX3RvRnVsbEpTT04iLCJnZXRUcmlnZ2VyIiwidHJpZ2dlclR5cGUiLCJydW5UcmlnZ2VyIiwidHJpZ2dlciIsInJlcXVlc3QiLCJhdXRoIiwibWF5YmVSdW5WYWxpZGF0b3IiLCJza2lwV2l0aE1hc3RlcktleSIsImdldEZpbGVUcmlnZ2VyIiwidHJpZ2dlckV4aXN0cyIsImdldEZ1bmN0aW9uIiwiZ2V0RnVuY3Rpb25OYW1lcyIsImZ1bmN0aW9uTmFtZXMiLCJleHRyYWN0RnVuY3Rpb25OYW1lcyIsIm5hbWVzcGFjZSIsInZhbHVlIiwiZ2V0Sm9iIiwiZ2V0Sm9icyIsIm1hbmFnZXIiLCJnZXRWYWxpZGF0b3IiLCJnZXRSZXF1ZXN0T2JqZWN0IiwicGFyc2VPYmplY3QiLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiY29uZmlnIiwiY29udGV4dCIsInRyaWdnZXJOYW1lIiwibWFzdGVyIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImhlYWRlcnMiLCJpcCIsIm9yaWdpbmFsIiwiYXNzaWduIiwiaXNNYXN0ZXIiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJnZXRSZXF1ZXN0UXVlcnlPYmplY3QiLCJxdWVyeSIsImNvdW50IiwiaXNHZXQiLCJnZXRSZXNwb25zZU9iamVjdCIsInJlc29sdmUiLCJyZWplY3QiLCJzdWNjZXNzIiwicmVzcG9uc2UiLCJvYmplY3RzIiwibWFwIiwiZXF1YWxzIiwiX2dldFNhdmVKU09OIiwiaWQiLCJlcnJvciIsImUiLCJyZXNvbHZlRXJyb3IiLCJjb2RlIiwiRXJyb3IiLCJTQ1JJUFRfRkFJTEVEIiwibWVzc2FnZSIsInVzZXJJZEZvckxvZyIsImxvZ1RyaWdnZXJBZnRlckhvb2siLCJpbnB1dCIsImNsZWFuSW5wdXQiLCJ0cnVuY2F0ZUxvZ01lc3NhZ2UiLCJKU09OIiwic3RyaW5naWZ5IiwiaW5mbyIsImxvZ1RyaWdnZXJTdWNjZXNzQmVmb3JlSG9vayIsInJlc3VsdCIsImNsZWFuUmVzdWx0IiwibG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayIsIm1heWJlUnVuQWZ0ZXJGaW5kVHJpZ2dlciIsIlByb21pc2UiLCJmcm9tSlNPTiIsInRoZW4iLCJyZXN1bHRzIiwibWF5YmVSdW5RdWVyeVRyaWdnZXIiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImpzb24iLCJ3aGVyZSIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwicmVxdWVzdE9iamVjdCIsInF1ZXJ5UmVzdWx0IiwianNvblF1ZXJ5IiwibGltaXQiLCJza2lwIiwiaW5jbHVkZSIsImV4Y2x1ZGVLZXlzIiwiZXhwbGFpbiIsIm9yZGVyIiwiaGludCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsImVyciIsImRlZmF1bHRPcHRzIiwic3RhY2siLCJ0aGVWYWxpZGF0b3IiLCJidWlsdEluVHJpZ2dlclZhbGlkYXRvciIsImNhdGNoIiwiVkFMSURBVElPTl9FUlJPUiIsIm9wdGlvbnMiLCJ2YWxpZGF0ZU1hc3RlcktleSIsInJlcVVzZXIiLCJleGlzdGVkIiwicmVxdWlyZVVzZXIiLCJyZXF1aXJlQW55VXNlclJvbGVzIiwicmVxdWlyZUFsbFVzZXJSb2xlcyIsInJlcXVpcmVNYXN0ZXIiLCJwYXJhbXMiLCJyZXF1aXJlZFBhcmFtIiwidmFsaWRhdGVPcHRpb25zIiwib3B0Iiwib3B0cyIsIkFycmF5IiwiaXNBcnJheSIsImluY2x1ZGVzIiwiam9pbiIsImdldFR5cGUiLCJmbiIsIm1hdGNoIiwidG9TdHJpbmciLCJ0b0xvd2VyQ2FzZSIsImZpZWxkcyIsIm9wdGlvblByb21pc2VzIiwiZGVmYXVsdCIsInNldCIsImNvbnN0YW50IiwicmVxdWlyZWQiLCJvcHRpb25hbCIsInZhbFR5cGUiLCJhbGwiLCJ1c2VyUm9sZXMiLCJyZXF1aXJlQWxsUm9sZXMiLCJwcm9taXNlcyIsImdldFVzZXJSb2xlcyIsInJvbGVzIiwicmVzb2x2ZWRVc2VyUm9sZXMiLCJyZXNvbHZlZFJlcXVpcmVBbGwiLCJoYXNSb2xlIiwic29tZSIsInJlcXVpcmVkUm9sZSIsInVzZXJLZXlzIiwicmVxdWlyZVVzZXJLZXlzIiwibWF5YmVSdW5UcmlnZ2VyIiwicHJvbWlzZSIsImluZmxhdGUiLCJkYXRhIiwicmVzdE9iamVjdCIsImNvcHkiLCJydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzIiwiZ2V0UmVxdWVzdEZpbGVPYmplY3QiLCJmaWxlT2JqZWN0IiwibWF5YmVSdW5GaWxlVHJpZ2dlciIsImZpbGVUcmlnZ2VyIiwiZmlsZSIsImZpbGVTaXplIl0sInNvdXJjZXMiOlsiLi4vc3JjL3RyaWdnZXJzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIHRyaWdnZXJzLmpzXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuL2xvZ2dlcic7XG5cbmV4cG9ydCBjb25zdCBUeXBlcyA9IHtcbiAgYmVmb3JlTG9naW46ICdiZWZvcmVMb2dpbicsXG4gIGFmdGVyTG9naW46ICdhZnRlckxvZ2luJyxcbiAgYWZ0ZXJMb2dvdXQ6ICdhZnRlckxvZ291dCcsXG4gIGJlZm9yZVNhdmU6ICdiZWZvcmVTYXZlJyxcbiAgYWZ0ZXJTYXZlOiAnYWZ0ZXJTYXZlJyxcbiAgYmVmb3JlRGVsZXRlOiAnYmVmb3JlRGVsZXRlJyxcbiAgYWZ0ZXJEZWxldGU6ICdhZnRlckRlbGV0ZScsXG4gIGJlZm9yZUZpbmQ6ICdiZWZvcmVGaW5kJyxcbiAgYWZ0ZXJGaW5kOiAnYWZ0ZXJGaW5kJyxcbiAgYmVmb3JlU2F2ZUZpbGU6ICdiZWZvcmVTYXZlRmlsZScsXG4gIGFmdGVyU2F2ZUZpbGU6ICdhZnRlclNhdmVGaWxlJyxcbiAgYmVmb3JlRGVsZXRlRmlsZTogJ2JlZm9yZURlbGV0ZUZpbGUnLFxuICBhZnRlckRlbGV0ZUZpbGU6ICdhZnRlckRlbGV0ZUZpbGUnLFxuICBiZWZvcmVDb25uZWN0OiAnYmVmb3JlQ29ubmVjdCcsXG4gIGJlZm9yZVN1YnNjcmliZTogJ2JlZm9yZVN1YnNjcmliZScsXG4gIGFmdGVyRXZlbnQ6ICdhZnRlckV2ZW50Jyxcbn07XG5cbmNvbnN0IEZpbGVDbGFzc05hbWUgPSAnQEZpbGUnO1xuY29uc3QgQ29ubmVjdENsYXNzTmFtZSA9ICdAQ29ubmVjdCc7XG5cbmNvbnN0IGJhc2VTdG9yZSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgVmFsaWRhdG9ycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG4gIGNvbnN0IEZ1bmN0aW9ucyA9IHt9O1xuICBjb25zdCBKb2JzID0ge307XG4gIGNvbnN0IExpdmVRdWVyeSA9IFtdO1xuICBjb25zdCBUcmlnZ2VycyA9IE9iamVjdC5rZXlzKFR5cGVzKS5yZWR1Y2UoZnVuY3Rpb24gKGJhc2UsIGtleSkge1xuICAgIGJhc2Vba2V5XSA9IHt9O1xuICAgIHJldHVybiBiYXNlO1xuICB9LCB7fSk7XG5cbiAgcmV0dXJuIE9iamVjdC5mcmVlemUoe1xuICAgIEZ1bmN0aW9ucyxcbiAgICBKb2JzLFxuICAgIFZhbGlkYXRvcnMsXG4gICAgVHJpZ2dlcnMsXG4gICAgTGl2ZVF1ZXJ5LFxuICB9KTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbGFzc05hbWUocGFyc2VDbGFzcykge1xuICBpZiAocGFyc2VDbGFzcyAmJiBwYXJzZUNsYXNzLmNsYXNzTmFtZSkge1xuICAgIHJldHVybiBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcbiAgfVxuICByZXR1cm4gcGFyc2VDbGFzcztcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDbGFzc05hbWVGb3JUcmlnZ2VycyhjbGFzc05hbWUsIHR5cGUpIHtcbiAgaWYgKHR5cGUgPT0gVHlwZXMuYmVmb3JlU2F2ZSAmJiBjbGFzc05hbWUgPT09ICdfUHVzaFN0YXR1cycpIHtcbiAgICAvLyBfUHVzaFN0YXR1cyB1c2VzIHVuZG9jdW1lbnRlZCBuZXN0ZWQga2V5IGluY3JlbWVudCBvcHNcbiAgICAvLyBhbGxvd2luZyBiZWZvcmVTYXZlIHdvdWxkIG1lc3MgdXAgdGhlIG9iamVjdHMgYmlnIHRpbWVcbiAgICAvLyBUT0RPOiBBbGxvdyBwcm9wZXIgZG9jdW1lbnRlZCB3YXkgb2YgdXNpbmcgbmVzdGVkIGluY3JlbWVudCBvcHNcbiAgICB0aHJvdyAnT25seSBhZnRlclNhdmUgaXMgYWxsb3dlZCBvbiBfUHVzaFN0YXR1cyc7XG4gIH1cbiAgaWYgKCh0eXBlID09PSBUeXBlcy5iZWZvcmVMb2dpbiB8fCB0eXBlID09PSBUeXBlcy5hZnRlckxvZ2luKSAmJiBjbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICAvLyBUT0RPOiBjaGVjayBpZiB1cHN0cmVhbSBjb2RlIHdpbGwgaGFuZGxlIGBFcnJvcmAgaW5zdGFuY2UgcmF0aGVyXG4gICAgLy8gdGhhbiB0aGlzIGFudGktcGF0dGVybiBvZiB0aHJvd2luZyBzdHJpbmdzXG4gICAgdGhyb3cgJ09ubHkgdGhlIF9Vc2VyIGNsYXNzIGlzIGFsbG93ZWQgZm9yIHRoZSBiZWZvcmVMb2dpbiBhbmQgYWZ0ZXJMb2dpbiB0cmlnZ2Vycyc7XG4gIH1cbiAgaWYgKHR5cGUgPT09IFR5cGVzLmFmdGVyTG9nb3V0ICYmIGNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIC8vIFRPRE86IGNoZWNrIGlmIHVwc3RyZWFtIGNvZGUgd2lsbCBoYW5kbGUgYEVycm9yYCBpbnN0YW5jZSByYXRoZXJcbiAgICAvLyB0aGFuIHRoaXMgYW50aS1wYXR0ZXJuIG9mIHRocm93aW5nIHN0cmluZ3NcbiAgICB0aHJvdyAnT25seSB0aGUgX1Nlc3Npb24gY2xhc3MgaXMgYWxsb3dlZCBmb3IgdGhlIGFmdGVyTG9nb3V0IHRyaWdnZXIuJztcbiAgfVxuICBpZiAoY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nICYmIHR5cGUgIT09IFR5cGVzLmFmdGVyTG9nb3V0KSB7XG4gICAgLy8gVE9ETzogY2hlY2sgaWYgdXBzdHJlYW0gY29kZSB3aWxsIGhhbmRsZSBgRXJyb3JgIGluc3RhbmNlIHJhdGhlclxuICAgIC8vIHRoYW4gdGhpcyBhbnRpLXBhdHRlcm4gb2YgdGhyb3dpbmcgc3RyaW5nc1xuICAgIHRocm93ICdPbmx5IHRoZSBhZnRlckxvZ291dCB0cmlnZ2VyIGlzIGFsbG93ZWQgZm9yIHRoZSBfU2Vzc2lvbiBjbGFzcy4nO1xuICB9XG4gIHJldHVybiBjbGFzc05hbWU7XG59XG5cbmNvbnN0IF90cmlnZ2VyU3RvcmUgPSB7fTtcblxuY29uc3QgQ2F0ZWdvcnkgPSB7XG4gIEZ1bmN0aW9uczogJ0Z1bmN0aW9ucycsXG4gIFZhbGlkYXRvcnM6ICdWYWxpZGF0b3JzJyxcbiAgSm9iczogJ0pvYnMnLFxuICBUcmlnZ2VyczogJ1RyaWdnZXJzJyxcbn07XG5cbmZ1bmN0aW9uIGdldFN0b3JlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IHBhdGggPSBuYW1lLnNwbGl0KCcuJyk7XG4gIHBhdGguc3BsaWNlKC0xKTsgLy8gcmVtb3ZlIGxhc3QgY29tcG9uZW50XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBsZXQgc3RvcmUgPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdW2NhdGVnb3J5XTtcbiAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgcGF0aCkge1xuICAgIHN0b3JlID0gc3RvcmVbY29tcG9uZW50XTtcbiAgICBpZiAoIXN0b3JlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RvcmU7XG59XG5cbmZ1bmN0aW9uIGFkZChjYXRlZ29yeSwgbmFtZSwgaGFuZGxlciwgYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBsYXN0Q29tcG9uZW50ID0gbmFtZS5zcGxpdCgnLicpLnNwbGljZSgtMSk7XG4gIGNvbnN0IHN0b3JlID0gZ2V0U3RvcmUoY2F0ZWdvcnksIG5hbWUsIGFwcGxpY2F0aW9uSWQpO1xuICBpZiAoc3RvcmVbbGFzdENvbXBvbmVudF0pIHtcbiAgICBsb2dnZXIud2FybihcbiAgICAgIGBXYXJuaW5nOiBEdXBsaWNhdGUgY2xvdWQgZnVuY3Rpb25zIGV4aXN0IGZvciAke2xhc3RDb21wb25lbnR9LiBPbmx5IHRoZSBsYXN0IG9uZSB3aWxsIGJlIHVzZWQgYW5kIHRoZSBvdGhlcnMgd2lsbCBiZSBpZ25vcmVkLmBcbiAgICApO1xuICB9XG4gIHN0b3JlW2xhc3RDb21wb25lbnRdID0gaGFuZGxlcjtcbn1cblxuZnVuY3Rpb24gcmVtb3ZlKGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIGRlbGV0ZSBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZnVuY3Rpb24gZ2V0KGNhdGVnb3J5LCBuYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIGNvbnN0IGxhc3RDb21wb25lbnQgPSBuYW1lLnNwbGl0KCcuJykuc3BsaWNlKC0xKTtcbiAgY29uc3Qgc3RvcmUgPSBnZXRTdG9yZShjYXRlZ29yeSwgbmFtZSwgYXBwbGljYXRpb25JZCk7XG4gIHJldHVybiBzdG9yZVtsYXN0Q29tcG9uZW50XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgaGFuZGxlciwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGZ1bmN0aW9uTmFtZSwgdmFsaWRhdGlvbkhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkSm9iKGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpIHtcbiAgYWRkKENhdGVnb3J5LkpvYnMsIGpvYk5hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJpZ2dlcih0eXBlLCBjbGFzc05hbWUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIHZhbGlkYXRlQ2xhc3NOYW1lRm9yVHJpZ2dlcnMoY2xhc3NOYW1lLCB0eXBlKTtcbiAgYWRkKENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0eXBlfS4ke2NsYXNzTmFtZX1gLCBoYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbiAgYWRkKENhdGVnb3J5LlZhbGlkYXRvcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZEZpbGVUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtGaWxlQ2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZENvbm5lY3RUcmlnZ2VyKHR5cGUsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQsIHZhbGlkYXRpb25IYW5kbGVyKSB7XG4gIGFkZChDYXRlZ29yeS5UcmlnZ2VycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIGhhbmRsZXIsIGFwcGxpY2F0aW9uSWQpO1xuICBhZGQoQ2F0ZWdvcnkuVmFsaWRhdG9ycywgYCR7dHlwZX0uJHtDb25uZWN0Q2xhc3NOYW1lfWAsIHZhbGlkYXRpb25IYW5kbGVyLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkZExpdmVRdWVyeUV2ZW50SGFuZGxlcihoYW5kbGVyLCBhcHBsaWNhdGlvbklkKSB7XG4gIGFwcGxpY2F0aW9uSWQgPSBhcHBsaWNhdGlvbklkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gIF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gPSBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdIHx8IGJhc2VTdG9yZSgpO1xuICBfdHJpZ2dlclN0b3JlW2FwcGxpY2F0aW9uSWRdLkxpdmVRdWVyeS5wdXNoKGhhbmRsZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlRnVuY3Rpb24oZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKSB7XG4gIHJlbW92ZShDYXRlZ29yeS5GdW5jdGlvbnMsIGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmlnZ2VyKHR5cGUsIGNsYXNzTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZW1vdmUoQ2F0ZWdvcnkuVHJpZ2dlcnMsIGAke3R5cGV9LiR7Y2xhc3NOYW1lfWAsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gX3VucmVnaXN0ZXJBbGwoKSB7XG4gIE9iamVjdC5rZXlzKF90cmlnZ2VyU3RvcmUpLmZvckVhY2goYXBwSWQgPT4gZGVsZXRlIF90cmlnZ2VyU3RvcmVbYXBwSWRdKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvSlNPTndpdGhPYmplY3RzKG9iamVjdCwgY2xhc3NOYW1lKSB7XG4gIGlmICghb2JqZWN0IHx8ICFvYmplY3QudG9KU09OKSB7XG4gICAgcmV0dXJuIHt9O1xuICB9XG4gIGNvbnN0IHRvSlNPTiA9IG9iamVjdC50b0pTT04oKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKG9iamVjdC5fZ2V0U3RhdGVJZGVudGlmaWVyKCkpO1xuICBmb3IgKGNvbnN0IGtleSBpbiBwZW5kaW5nKSB7XG4gICAgY29uc3QgdmFsID0gb2JqZWN0LmdldChrZXkpO1xuICAgIGlmICghdmFsIHx8ICF2YWwuX3RvRnVsbEpTT04pIHtcbiAgICAgIHRvSlNPTltrZXldID0gdmFsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIHRvSlNPTltrZXldID0gdmFsLl90b0Z1bGxKU09OKCk7XG4gIH1cbiAgaWYgKGNsYXNzTmFtZSkge1xuICAgIHRvSlNPTi5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIH1cbiAgcmV0dXJuIHRvSlNPTjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRyaWdnZXIoY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgYXBwbGljYXRpb25JZCkge1xuICBpZiAoIWFwcGxpY2F0aW9uSWQpIHtcbiAgICB0aHJvdyAnTWlzc2luZyBBcHBsaWNhdGlvbklEJztcbiAgfVxuICByZXR1cm4gZ2V0KENhdGVnb3J5LlRyaWdnZXJzLCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5UcmlnZ2VyKHRyaWdnZXIsIG5hbWUsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKCF0cmlnZ2VyKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGF3YWl0IG1heWJlUnVuVmFsaWRhdG9yKHJlcXVlc3QsIG5hbWUsIGF1dGgpO1xuICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gYXdhaXQgdHJpZ2dlcihyZXF1ZXN0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbGVUcmlnZ2VyKHR5cGUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldFRyaWdnZXIoRmlsZUNsYXNzTmFtZSwgdHlwZSwgYXBwbGljYXRpb25JZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmlnZ2VyRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGFwcGxpY2F0aW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuICByZXR1cm4gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHR5cGUsIGFwcGxpY2F0aW9uSWQpICE9IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uKGZ1bmN0aW9uTmFtZSwgYXBwbGljYXRpb25JZCkge1xuICByZXR1cm4gZ2V0KENhdGVnb3J5LkZ1bmN0aW9ucywgZnVuY3Rpb25OYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZ1bmN0aW9uTmFtZXMoYXBwbGljYXRpb25JZCkge1xuICBjb25zdCBzdG9yZSA9XG4gICAgKF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF0gJiYgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXVtDYXRlZ29yeS5GdW5jdGlvbnNdKSB8fCB7fTtcbiAgY29uc3QgZnVuY3Rpb25OYW1lcyA9IFtdO1xuICBjb25zdCBleHRyYWN0RnVuY3Rpb25OYW1lcyA9IChuYW1lc3BhY2UsIHN0b3JlKSA9PiB7XG4gICAgT2JqZWN0LmtleXMoc3RvcmUpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IHN0b3JlW25hbWVdO1xuICAgICAgaWYgKG5hbWVzcGFjZSkge1xuICAgICAgICBuYW1lID0gYCR7bmFtZXNwYWNlfS4ke25hbWV9YDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgZnVuY3Rpb25OYW1lcy5wdXNoKG5hbWUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZXh0cmFjdEZ1bmN0aW9uTmFtZXMobmFtZSwgdmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuICB9O1xuICBleHRyYWN0RnVuY3Rpb25OYW1lcyhudWxsLCBzdG9yZSk7XG4gIHJldHVybiBmdW5jdGlvbk5hbWVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Sm9iKGpvYk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5Kb2JzLCBqb2JOYW1lLCBhcHBsaWNhdGlvbklkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEpvYnMoYXBwbGljYXRpb25JZCkge1xuICB2YXIgbWFuYWdlciA9IF90cmlnZ2VyU3RvcmVbYXBwbGljYXRpb25JZF07XG4gIGlmIChtYW5hZ2VyICYmIG1hbmFnZXIuSm9icykge1xuICAgIHJldHVybiBtYW5hZ2VyLkpvYnM7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRvcihmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpIHtcbiAgcmV0dXJuIGdldChDYXRlZ29yeS5WYWxpZGF0b3JzLCBmdW5jdGlvbk5hbWUsIGFwcGxpY2F0aW9uSWQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdE9iamVjdChcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBvYmplY3Q6IHBhcnNlT2JqZWN0LFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgcmVxdWVzdC5vcmlnaW5hbCA9IG9yaWdpbmFsUGFyc2VPYmplY3Q7XG4gIH1cbiAgaWYgKFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVTYXZlIHx8XG4gICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmFmdGVyU2F2ZSB8fFxuICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5iZWZvcmVEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJGaW5kXG4gICkge1xuICAgIC8vIFNldCBhIGNvcHkgb2YgdGhlIGNvbnRleHQgb24gdGhlIHJlcXVlc3Qgb2JqZWN0LlxuICAgIHJlcXVlc3QuY29udGV4dCA9IE9iamVjdC5hc3NpZ24oe30sIGNvbnRleHQpO1xuICB9XG5cbiAgaWYgKCFhdXRoKSB7XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4gIH1cbiAgaWYgKGF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXF1ZXN0WydtYXN0ZXInXSA9IHRydWU7XG4gIH1cbiAgaWYgKGF1dGgudXNlcikge1xuICAgIHJlcXVlc3RbJ3VzZXInXSA9IGF1dGgudXNlcjtcbiAgfVxuICBpZiAoYXV0aC5pbnN0YWxsYXRpb25JZCkge1xuICAgIHJlcXVlc3RbJ2luc3RhbGxhdGlvbklkJ10gPSBhdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG4gIHJldHVybiByZXF1ZXN0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBxdWVyeSwgY291bnQsIGNvbmZpZywgY29udGV4dCwgaXNHZXQpIHtcbiAgaXNHZXQgPSAhIWlzR2V0O1xuXG4gIHZhciByZXF1ZXN0ID0ge1xuICAgIHRyaWdnZXJOYW1lOiB0cmlnZ2VyVHlwZSxcbiAgICBxdWVyeSxcbiAgICBtYXN0ZXI6IGZhbHNlLFxuICAgIGNvdW50LFxuICAgIGxvZzogY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIsXG4gICAgaXNHZXQsXG4gICAgaGVhZGVyczogY29uZmlnLmhlYWRlcnMsXG4gICAgaXA6IGNvbmZpZy5pcCxcbiAgICBjb250ZXh0OiBjb250ZXh0IHx8IHt9LFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuLy8gQ3JlYXRlcyB0aGUgcmVzcG9uc2Ugb2JqZWN0LCBhbmQgdXNlcyB0aGUgcmVxdWVzdCBvYmplY3QgdG8gcGFzcyBkYXRhXG4vLyBUaGUgQVBJIHdpbGwgY2FsbCB0aGlzIHdpdGggUkVTVCBBUEkgZm9ybWF0dGVkIG9iamVjdHMsIHRoaXMgd2lsbFxuLy8gdHJhbnNmb3JtIHRoZW0gdG8gUGFyc2UuT2JqZWN0IGluc3RhbmNlcyBleHBlY3RlZCBieSBDbG91ZCBDb2RlLlxuLy8gQW55IGNoYW5nZXMgbWFkZSB0byB0aGUgb2JqZWN0IGluIGEgYmVmb3JlU2F2ZSB3aWxsIGJlIGluY2x1ZGVkLlxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlc3BvbnNlT2JqZWN0KHJlcXVlc3QsIHJlc29sdmUsIHJlamVjdCkge1xuICByZXR1cm4ge1xuICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uIChyZXNwb25zZSkge1xuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyRmluZCkge1xuICAgICAgICBpZiAoIXJlc3BvbnNlKSB7XG4gICAgICAgICAgcmVzcG9uc2UgPSByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgcmVzcG9uc2UgPSByZXNwb25zZS5tYXAob2JqZWN0ID0+IHtcbiAgICAgICAgICByZXR1cm4gdG9KU09Od2l0aE9iamVjdHMob2JqZWN0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICAgIH1cbiAgICAgIC8vIFVzZSB0aGUgSlNPTiByZXNwb25zZVxuICAgICAgaWYgKFxuICAgICAgICByZXNwb25zZSAmJlxuICAgICAgICB0eXBlb2YgcmVzcG9uc2UgPT09ICdvYmplY3QnICYmXG4gICAgICAgICFyZXF1ZXN0Lm9iamVjdC5lcXVhbHMocmVzcG9uc2UpICYmXG4gICAgICAgIHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmJlZm9yZVNhdmVcbiAgICAgICkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZShyZXNwb25zZSk7XG4gICAgICB9XG4gICAgICBpZiAocmVzcG9uc2UgJiYgdHlwZW9mIHJlc3BvbnNlID09PSAnb2JqZWN0JyAmJiByZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5hZnRlclNhdmUpIHtcbiAgICAgICAgcmV0dXJuIHJlc29sdmUocmVzcG9uc2UpO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3QudHJpZ2dlck5hbWUgPT09IFR5cGVzLmFmdGVyU2F2ZSkge1xuICAgICAgICByZXR1cm4gcmVzb2x2ZSgpO1xuICAgICAgfVxuICAgICAgcmVzcG9uc2UgPSB7fTtcbiAgICAgIGlmIChyZXF1ZXN0LnRyaWdnZXJOYW1lID09PSBUeXBlcy5iZWZvcmVTYXZlKSB7XG4gICAgICAgIHJlc3BvbnNlWydvYmplY3QnXSA9IHJlcXVlc3Qub2JqZWN0Ll9nZXRTYXZlSlNPTigpO1xuICAgICAgICByZXNwb25zZVsnb2JqZWN0J11bJ29iamVjdElkJ10gPSByZXF1ZXN0Lm9iamVjdC5pZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXNvbHZlKHJlc3BvbnNlKTtcbiAgICB9LFxuICAgIGVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgIGNvbnN0IGUgPSByZXNvbHZlRXJyb3IoZXJyb3IsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgIH0pO1xuICAgICAgcmVqZWN0KGUpO1xuICAgIH0sXG4gIH07XG59XG5cbmZ1bmN0aW9uIHVzZXJJZEZvckxvZyhhdXRoKSB7XG4gIHJldHVybiBhdXRoICYmIGF1dGgudXNlciA/IGF1dGgudXNlci5pZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBpbnB1dCwgYXV0aCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBsb2dnZXIuaW5mbyhcbiAgICBgJHt0cmlnZ2VyVHlwZX0gdHJpZ2dlcmVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICB1c2VyOiB1c2VySWRGb3JMb2coYXV0aCksXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIHJlc3VsdCwgYXV0aCkge1xuICBjb25zdCBjbGVhbklucHV0ID0gbG9nZ2VyLnRydW5jYXRlTG9nTWVzc2FnZShKU09OLnN0cmluZ2lmeShpbnB1dCkpO1xuICBjb25zdCBjbGVhblJlc3VsdCA9IGxvZ2dlci50cnVuY2F0ZUxvZ01lc3NhZ2UoSlNPTi5zdHJpbmdpZnkocmVzdWx0KSk7XG4gIGxvZ2dlci5pbmZvKFxuICAgIGAke3RyaWdnZXJUeXBlfSB0cmlnZ2VyZWQgZm9yICR7Y2xhc3NOYW1lfSBmb3IgdXNlciAke3VzZXJJZEZvckxvZyhcbiAgICAgIGF1dGhcbiAgICApfTpcXG4gIElucHV0OiAke2NsZWFuSW5wdXR9XFxuICBSZXN1bHQ6ICR7Y2xlYW5SZXN1bHR9YCxcbiAgICB7XG4gICAgICBjbGFzc05hbWUsXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmZ1bmN0aW9uIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2sodHJpZ2dlclR5cGUsIGNsYXNzTmFtZSwgaW5wdXQsIGF1dGgsIGVycm9yKSB7XG4gIGNvbnN0IGNsZWFuSW5wdXQgPSBsb2dnZXIudHJ1bmNhdGVMb2dNZXNzYWdlKEpTT04uc3RyaW5naWZ5KGlucHV0KSk7XG4gIGxvZ2dlci5lcnJvcihcbiAgICBgJHt0cmlnZ2VyVHlwZX0gZmFpbGVkIGZvciAke2NsYXNzTmFtZX0gZm9yIHVzZXIgJHt1c2VySWRGb3JMb2coXG4gICAgICBhdXRoXG4gICAgKX06XFxuICBJbnB1dDogJHtjbGVhbklucHV0fVxcbiAgRXJyb3I6ICR7SlNPTi5zdHJpbmdpZnkoZXJyb3IpfWAsXG4gICAge1xuICAgICAgY2xhc3NOYW1lLFxuICAgICAgdHJpZ2dlclR5cGUsXG4gICAgICBlcnJvcixcbiAgICAgIHVzZXI6IHVzZXJJZEZvckxvZyhhdXRoKSxcbiAgICB9XG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIG9iamVjdHMsXG4gIGNvbmZpZyxcbiAgcXVlcnksXG4gIGNvbnRleHRcbikge1xuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgdHJpZ2dlclR5cGUsIGNvbmZpZy5hcHBsaWNhdGlvbklkKTtcbiAgICBpZiAoIXRyaWdnZXIpIHtcbiAgICAgIHJldHVybiByZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3QgPSBnZXRSZXF1ZXN0T2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBudWxsLCBudWxsLCBjb25maWcsIGNvbnRleHQpO1xuICAgIGlmIChxdWVyeSkge1xuICAgICAgcmVxdWVzdC5xdWVyeSA9IHF1ZXJ5O1xuICAgIH1cbiAgICBjb25zdCB7IHN1Y2Nlc3MsIGVycm9yIH0gPSBnZXRSZXNwb25zZU9iamVjdChcbiAgICAgIHJlcXVlc3QsXG4gICAgICBvYmplY3QgPT4ge1xuICAgICAgICByZXNvbHZlKG9iamVjdCk7XG4gICAgICB9LFxuICAgICAgZXJyb3IgPT4ge1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG4gICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKHRyaWdnZXJUeXBlLCBjbGFzc05hbWUsICdBZnRlckZpbmQnLCBKU09OLnN0cmluZ2lmeShvYmplY3RzKSwgYXV0aCk7XG4gICAgcmVxdWVzdC5vYmplY3RzID0gb2JqZWN0cy5tYXAob2JqZWN0ID0+IHtcbiAgICAgIC8vc2V0dGluZyB0aGUgY2xhc3MgbmFtZSB0byB0cmFuc2Zvcm0gaW50byBwYXJzZSBvYmplY3RcbiAgICAgIG9iamVjdC5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gICAgICByZXR1cm4gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iamVjdCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtjbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiByZXF1ZXN0Lm9iamVjdHM7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSB0cmlnZ2VyKHJlcXVlc3QpO1xuICAgICAgICBpZiAocmVzcG9uc2UgJiYgdHlwZW9mIHJlc3BvbnNlLnRoZW4gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICByZXR1cm4gcmVzcG9uc2UudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIHJldHVybiByZXN1bHRzO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXNwb25zZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgbG9nVHJpZ2dlckFmdGVySG9vayh0cmlnZ2VyVHlwZSwgY2xhc3NOYW1lLCBKU09OLnN0cmluZ2lmeShyZXN1bHRzKSwgYXV0aCk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF5YmVSdW5RdWVyeVRyaWdnZXIoXG4gIHRyaWdnZXJUeXBlLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSxcbiAgcmVzdE9wdGlvbnMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgY29udGV4dCxcbiAgaXNHZXRcbikge1xuICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsIHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdHJpZ2dlcikge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgcmVzdFdoZXJlLFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gIH1cbiAgY29uc3QganNvbiA9IE9iamVjdC5hc3NpZ24oe30sIHJlc3RPcHRpb25zKTtcbiAganNvbi53aGVyZSA9IHJlc3RXaGVyZTtcblxuICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gIHBhcnNlUXVlcnkud2l0aEpTT04oanNvbik7XG5cbiAgbGV0IGNvdW50ID0gZmFsc2U7XG4gIGlmIChyZXN0T3B0aW9ucykge1xuICAgIGNvdW50ID0gISFyZXN0T3B0aW9ucy5jb3VudDtcbiAgfVxuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdFF1ZXJ5T2JqZWN0KFxuICAgIHRyaWdnZXJUeXBlLFxuICAgIGF1dGgsXG4gICAgcGFyc2VRdWVyeSxcbiAgICBjb3VudCxcbiAgICBjb25maWcsXG4gICAgY29udGV4dCxcbiAgICBpc0dldFxuICApO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdE9iamVjdCwgYCR7dHJpZ2dlclR5cGV9LiR7Y2xhc3NOYW1lfWAsIGF1dGgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlcXVlc3RPYmplY3Quc2tpcFdpdGhNYXN0ZXJLZXkpIHtcbiAgICAgICAgcmV0dXJuIHJlcXVlc3RPYmplY3QucXVlcnk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJpZ2dlcihyZXF1ZXN0T2JqZWN0KTtcbiAgICB9KVxuICAgIC50aGVuKFxuICAgICAgcmVzdWx0ID0+IHtcbiAgICAgICAgbGV0IHF1ZXJ5UmVzdWx0ID0gcGFyc2VRdWVyeTtcbiAgICAgICAgaWYgKHJlc3VsdCAmJiByZXN1bHQgaW5zdGFuY2VvZiBQYXJzZS5RdWVyeSkge1xuICAgICAgICAgIHF1ZXJ5UmVzdWx0ID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGpzb25RdWVyeSA9IHF1ZXJ5UmVzdWx0LnRvSlNPTigpO1xuICAgICAgICBpZiAoanNvblF1ZXJ5LndoZXJlKSB7XG4gICAgICAgICAgcmVzdFdoZXJlID0ganNvblF1ZXJ5LndoZXJlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkubGltaXQpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmxpbWl0ID0ganNvblF1ZXJ5LmxpbWl0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuc2tpcCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuc2tpcCA9IGpzb25RdWVyeS5za2lwO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaW5jbHVkZSkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZSA9IGpzb25RdWVyeS5pbmNsdWRlO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhjbHVkZUtleXMpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLmV4Y2x1ZGVLZXlzID0ganNvblF1ZXJ5LmV4Y2x1ZGVLZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuZXhwbGFpbikge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuZXhwbGFpbiA9IGpzb25RdWVyeS5leHBsYWluO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkua2V5cykge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMua2V5cyA9IGpzb25RdWVyeS5rZXlzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkub3JkZXIpIHtcbiAgICAgICAgICByZXN0T3B0aW9ucyA9IHJlc3RPcHRpb25zIHx8IHt9O1xuICAgICAgICAgIHJlc3RPcHRpb25zLm9yZGVyID0ganNvblF1ZXJ5Lm9yZGVyO1xuICAgICAgICB9XG4gICAgICAgIGlmIChqc29uUXVlcnkuaGludCkge1xuICAgICAgICAgIHJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnMgfHwge307XG4gICAgICAgICAgcmVzdE9wdGlvbnMuaGludCA9IGpzb25RdWVyeS5oaW50O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXF1ZXN0T2JqZWN0LnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHJlcXVlc3RPYmplY3QucmVhZFByZWZlcmVuY2U7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3RPYmplY3QuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPSByZXF1ZXN0T2JqZWN0LmluY2x1ZGVSZWFkUHJlZmVyZW5jZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgICAgICAgcmVzdE9wdGlvbnMgPSByZXN0T3B0aW9ucyB8fCB7fTtcbiAgICAgICAgICByZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gcmVxdWVzdE9iamVjdC5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgcmVzdFdoZXJlLFxuICAgICAgICAgIHJlc3RPcHRpb25zLFxuICAgICAgICB9O1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGVyciwge1xuICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLlNDUklQVF9GQUlMRUQsXG4gICAgICAgICAgbWVzc2FnZTogJ1NjcmlwdCBmYWlsZWQuIFVua25vd24gZXJyb3IuJyxcbiAgICAgICAgfSk7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlRXJyb3IobWVzc2FnZSwgZGVmYXVsdE9wdHMpIHtcbiAgaWYgKCFkZWZhdWx0T3B0cykge1xuICAgIGRlZmF1bHRPcHRzID0ge307XG4gIH1cbiAgaWYgKCFtZXNzYWdlKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgIGRlZmF1bHRPcHRzLm1lc3NhZ2UgfHwgJ1NjcmlwdCBmYWlsZWQuJ1xuICAgICk7XG4gIH1cbiAgaWYgKG1lc3NhZ2UgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgIHJldHVybiBtZXNzYWdlO1xuICB9XG5cbiAgY29uc3QgY29kZSA9IGRlZmF1bHRPcHRzLmNvZGUgfHwgUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRDtcbiAgLy8gSWYgaXQncyBhbiBlcnJvciwgbWFyayBpdCBhcyBhIHNjcmlwdCBmYWlsZWRcbiAgaWYgKHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZSk7XG4gIH1cbiAgY29uc3QgZXJyb3IgPSBuZXcgUGFyc2UuRXJyb3IoY29kZSwgbWVzc2FnZS5tZXNzYWdlIHx8IG1lc3NhZ2UpO1xuICBpZiAobWVzc2FnZSBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgZXJyb3Iuc3RhY2sgPSBtZXNzYWdlLnN0YWNrO1xuICB9XG4gIHJldHVybiBlcnJvcjtcbn1cbmV4cG9ydCBmdW5jdGlvbiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBmdW5jdGlvbk5hbWUsIGF1dGgpIHtcbiAgY29uc3QgdGhlVmFsaWRhdG9yID0gZ2V0VmFsaWRhdG9yKGZ1bmN0aW9uTmFtZSwgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gIGlmICghdGhlVmFsaWRhdG9yKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICh0eXBlb2YgdGhlVmFsaWRhdG9yID09PSAnb2JqZWN0JyAmJiB0aGVWYWxpZGF0b3Iuc2tpcFdpdGhNYXN0ZXJLZXkgJiYgcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICByZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5ID0gdHJ1ZTtcbiAgfVxuICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdHlwZW9mIHRoZVZhbGlkYXRvciA9PT0gJ29iamVjdCdcbiAgICAgICAgICA/IGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKHRoZVZhbGlkYXRvciwgcmVxdWVzdCwgYXV0aClcbiAgICAgICAgICA6IHRoZVZhbGlkYXRvcihyZXF1ZXN0KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJlc29sdmUoKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZSA9PiB7XG4gICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUsIHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgIG1lc3NhZ2U6ICdWYWxpZGF0aW9uIGZhaWxlZC4nLFxuICAgICAgICB9KTtcbiAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgIH0pO1xuICB9KTtcbn1cbmFzeW5jIGZ1bmN0aW9uIGJ1aWx0SW5UcmlnZ2VyVmFsaWRhdG9yKG9wdGlvbnMsIHJlcXVlc3QsIGF1dGgpIHtcbiAgaWYgKHJlcXVlc3QubWFzdGVyICYmICFvcHRpb25zLnZhbGlkYXRlTWFzdGVyS2V5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGxldCByZXFVc2VyID0gcmVxdWVzdC51c2VyO1xuICBpZiAoXG4gICAgIXJlcVVzZXIgJiZcbiAgICByZXF1ZXN0Lm9iamVjdCAmJlxuICAgIHJlcXVlc3Qub2JqZWN0LmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICFyZXF1ZXN0Lm9iamVjdC5leGlzdGVkKClcbiAgKSB7XG4gICAgcmVxVXNlciA9IHJlcXVlc3Qub2JqZWN0O1xuICB9XG4gIGlmIChcbiAgICAob3B0aW9ucy5yZXF1aXJlVXNlciB8fCBvcHRpb25zLnJlcXVpcmVBbnlVc2VyUm9sZXMgfHwgb3B0aW9ucy5yZXF1aXJlQWxsVXNlclJvbGVzKSAmJlxuICAgICFyZXFVc2VyXG4gICkge1xuICAgIHRocm93ICdWYWxpZGF0aW9uIGZhaWxlZC4gUGxlYXNlIGxvZ2luIHRvIGNvbnRpbnVlLic7XG4gIH1cbiAgaWYgKG9wdGlvbnMucmVxdWlyZU1hc3RlciAmJiAhcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICB0aHJvdyAnVmFsaWRhdGlvbiBmYWlsZWQuIE1hc3RlciBrZXkgaXMgcmVxdWlyZWQgdG8gY29tcGxldGUgdGhpcyByZXF1ZXN0Lic7XG4gIH1cbiAgbGV0IHBhcmFtcyA9IHJlcXVlc3QucGFyYW1zIHx8IHt9O1xuICBpZiAocmVxdWVzdC5vYmplY3QpIHtcbiAgICBwYXJhbXMgPSByZXF1ZXN0Lm9iamVjdC50b0pTT04oKTtcbiAgfVxuICBjb25zdCByZXF1aXJlZFBhcmFtID0ga2V5ID0+IHtcbiAgICBjb25zdCB2YWx1ZSA9IHBhcmFtc1trZXldO1xuICAgIGlmICh2YWx1ZSA9PSBudWxsKSB7XG4gICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFBsZWFzZSBzcGVjaWZ5IGRhdGEgZm9yICR7a2V5fS5gO1xuICAgIH1cbiAgfTtcblxuICBjb25zdCB2YWxpZGF0ZU9wdGlvbnMgPSBhc3luYyAob3B0LCBrZXksIHZhbCkgPT4ge1xuICAgIGxldCBvcHRzID0gb3B0Lm9wdGlvbnM7XG4gICAgaWYgKHR5cGVvZiBvcHRzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBvcHRzKHZhbCk7XG4gICAgICAgIGlmICghcmVzdWx0ICYmIHJlc3VsdCAhPSBudWxsKSB7XG4gICAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB2YWx1ZSBmb3IgJHtrZXl9LmA7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKCFlKSB7XG4gICAgICAgICAgdGhyb3cgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB2YWx1ZSBmb3IgJHtrZXl9LmA7XG4gICAgICAgIH1cblxuICAgICAgICB0aHJvdyBvcHQuZXJyb3IgfHwgZS5tZXNzYWdlIHx8IGU7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICghQXJyYXkuaXNBcnJheShvcHRzKSkge1xuICAgICAgb3B0cyA9IFtvcHQub3B0aW9uc107XG4gICAgfVxuXG4gICAgaWYgKCFvcHRzLmluY2x1ZGVzKHZhbCkpIHtcbiAgICAgIHRocm93IChcbiAgICAgICAgb3B0LmVycm9yIHx8IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCBvcHRpb24gZm9yICR7a2V5fS4gRXhwZWN0ZWQ6ICR7b3B0cy5qb2luKCcsICcpfWBcbiAgICAgICk7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGdldFR5cGUgPSBmbiA9PiB7XG4gICAgY29uc3QgbWF0Y2ggPSBmbiAmJiBmbi50b1N0cmluZygpLm1hdGNoKC9eXFxzKmZ1bmN0aW9uIChcXHcrKS8pO1xuICAgIHJldHVybiAobWF0Y2ggPyBtYXRjaFsxXSA6ICcnKS50b0xvd2VyQ2FzZSgpO1xuICB9O1xuICBpZiAoQXJyYXkuaXNBcnJheShvcHRpb25zLmZpZWxkcykpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBvcHRpb25zLmZpZWxkcykge1xuICAgICAgcmVxdWlyZWRQYXJhbShrZXkpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBjb25zdCBvcHRpb25Qcm9taXNlcyA9IFtdO1xuICAgIGZvciAoY29uc3Qga2V5IGluIG9wdGlvbnMuZmllbGRzKSB7XG4gICAgICBjb25zdCBvcHQgPSBvcHRpb25zLmZpZWxkc1trZXldO1xuICAgICAgbGV0IHZhbCA9IHBhcmFtc1trZXldO1xuICAgICAgaWYgKHR5cGVvZiBvcHQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmVkUGFyYW0ob3B0KTtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZiAob3B0LmRlZmF1bHQgIT0gbnVsbCAmJiB2YWwgPT0gbnVsbCkge1xuICAgICAgICAgIHZhbCA9IG9wdC5kZWZhdWx0O1xuICAgICAgICAgIHBhcmFtc1trZXldID0gdmFsO1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgICAgcmVxdWVzdC5vYmplY3Quc2V0KGtleSwgdmFsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5jb25zdGFudCAmJiByZXF1ZXN0Lm9iamVjdCkge1xuICAgICAgICAgIGlmIChyZXF1ZXN0Lm9yaWdpbmFsKSB7XG4gICAgICAgICAgICByZXF1ZXN0Lm9iamVjdC5zZXQoa2V5LCByZXF1ZXN0Lm9yaWdpbmFsLmdldChrZXkpKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG9wdC5kZWZhdWx0ICE9IG51bGwpIHtcbiAgICAgICAgICAgIHJlcXVlc3Qub2JqZWN0LnNldChrZXksIG9wdC5kZWZhdWx0KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdC5yZXF1aXJlZCkge1xuICAgICAgICAgIHJlcXVpcmVkUGFyYW0oa2V5KTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBvcHRpb25hbCA9ICFvcHQucmVxdWlyZWQgJiYgdmFsID09PSB1bmRlZmluZWQ7XG4gICAgICAgIGlmICghb3B0aW9uYWwpIHtcbiAgICAgICAgICBpZiAob3B0LnR5cGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBnZXRUeXBlKG9wdC50eXBlKTtcbiAgICAgICAgICAgIGNvbnN0IHZhbFR5cGUgPSBBcnJheS5pc0FycmF5KHZhbCkgPyAnYXJyYXknIDogdHlwZW9mIHZhbDtcbiAgICAgICAgICAgIGlmICh2YWxUeXBlICE9PSB0eXBlKSB7XG4gICAgICAgICAgICAgIHRocm93IGBWYWxpZGF0aW9uIGZhaWxlZC4gSW52YWxpZCB0eXBlIGZvciAke2tleX0uIEV4cGVjdGVkOiAke3R5cGV9YDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKG9wdC5vcHRpb25zKSB7XG4gICAgICAgICAgICBvcHRpb25Qcm9taXNlcy5wdXNoKHZhbGlkYXRlT3B0aW9ucyhvcHQsIGtleSwgdmFsKSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGF3YWl0IFByb21pc2UuYWxsKG9wdGlvblByb21pc2VzKTtcbiAgfVxuICBsZXQgdXNlclJvbGVzID0gb3B0aW9ucy5yZXF1aXJlQW55VXNlclJvbGVzO1xuICBsZXQgcmVxdWlyZUFsbFJvbGVzID0gb3B0aW9ucy5yZXF1aXJlQWxsVXNlclJvbGVzO1xuICBjb25zdCBwcm9taXNlcyA9IFtQcm9taXNlLnJlc29sdmUoKSwgUHJvbWlzZS5yZXNvbHZlKCksIFByb21pc2UucmVzb2x2ZSgpXTtcbiAgaWYgKHVzZXJSb2xlcyB8fCByZXF1aXJlQWxsUm9sZXMpIHtcbiAgICBwcm9taXNlc1swXSA9IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gIH1cbiAgaWYgKHR5cGVvZiB1c2VyUm9sZXMgPT09ICdmdW5jdGlvbicpIHtcbiAgICBwcm9taXNlc1sxXSA9IHVzZXJSb2xlcygpO1xuICB9XG4gIGlmICh0eXBlb2YgcmVxdWlyZUFsbFJvbGVzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcHJvbWlzZXNbMl0gPSByZXF1aXJlQWxsUm9sZXMoKTtcbiAgfVxuICBjb25zdCBbcm9sZXMsIHJlc29sdmVkVXNlclJvbGVzLCByZXNvbHZlZFJlcXVpcmVBbGxdID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICBpZiAocmVzb2x2ZWRVc2VyUm9sZXMgJiYgQXJyYXkuaXNBcnJheShyZXNvbHZlZFVzZXJSb2xlcykpIHtcbiAgICB1c2VyUm9sZXMgPSByZXNvbHZlZFVzZXJSb2xlcztcbiAgfVxuICBpZiAocmVzb2x2ZWRSZXF1aXJlQWxsICYmIEFycmF5LmlzQXJyYXkocmVzb2x2ZWRSZXF1aXJlQWxsKSkge1xuICAgIHJlcXVpcmVBbGxSb2xlcyA9IHJlc29sdmVkUmVxdWlyZUFsbDtcbiAgfVxuICBpZiAodXNlclJvbGVzKSB7XG4gICAgY29uc3QgaGFzUm9sZSA9IHVzZXJSb2xlcy5zb21lKHJlcXVpcmVkUm9sZSA9PiByb2xlcy5pbmNsdWRlcyhgcm9sZToke3JlcXVpcmVkUm9sZX1gKSk7XG4gICAgaWYgKCFoYXNSb2xlKSB7XG4gICAgICB0aHJvdyBgVmFsaWRhdGlvbiBmYWlsZWQuIFVzZXIgZG9lcyBub3QgbWF0Y2ggdGhlIHJlcXVpcmVkIHJvbGVzLmA7XG4gICAgfVxuICB9XG4gIGlmIChyZXF1aXJlQWxsUm9sZXMpIHtcbiAgICBmb3IgKGNvbnN0IHJlcXVpcmVkUm9sZSBvZiByZXF1aXJlQWxsUm9sZXMpIHtcbiAgICAgIGlmICghcm9sZXMuaW5jbHVkZXMoYHJvbGU6JHtyZXF1aXJlZFJvbGV9YCkpIHtcbiAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBVc2VyIGRvZXMgbm90IG1hdGNoIGFsbCB0aGUgcmVxdWlyZWQgcm9sZXMuYDtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgY29uc3QgdXNlcktleXMgPSBvcHRpb25zLnJlcXVpcmVVc2VyS2V5cyB8fCBbXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkodXNlcktleXMpKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgdXNlcktleXMpIHtcbiAgICAgIGlmICghcmVxVXNlcikge1xuICAgICAgICB0aHJvdyAnUGxlYXNlIGxvZ2luIHRvIG1ha2UgdGhpcyByZXF1ZXN0Lic7XG4gICAgICB9XG5cbiAgICAgIGlmIChyZXFVc2VyLmdldChrZXkpID09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgYFZhbGlkYXRpb24gZmFpbGVkLiBQbGVhc2Ugc2V0IGRhdGEgZm9yICR7a2V5fSBvbiB5b3VyIGFjY291bnQuYDtcbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZW9mIHVzZXJLZXlzID09PSAnb2JqZWN0Jykge1xuICAgIGNvbnN0IG9wdGlvblByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucy5yZXF1aXJlVXNlcktleXMpIHtcbiAgICAgIGNvbnN0IG9wdCA9IG9wdGlvbnMucmVxdWlyZVVzZXJLZXlzW2tleV07XG4gICAgICBpZiAob3B0Lm9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9uUHJvbWlzZXMucHVzaCh2YWxpZGF0ZU9wdGlvbnMob3B0LCBrZXksIHJlcVVzZXIuZ2V0KGtleSkpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwob3B0aW9uUHJvbWlzZXMpO1xuICB9XG59XG5cbi8vIFRvIGJlIHVzZWQgYXMgcGFydCBvZiB0aGUgcHJvbWlzZSBjaGFpbiB3aGVuIHNhdmluZy9kZWxldGluZyBhbiBvYmplY3Rcbi8vIFdpbGwgcmVzb2x2ZSBzdWNjZXNzZnVsbHkgaWYgbm8gdHJpZ2dlciBpcyBjb25maWd1cmVkXG4vLyBSZXNvbHZlcyB0byBhbiBvYmplY3QsIGVtcHR5IG9yIGNvbnRhaW5pbmcgYW4gb2JqZWN0IGtleS4gQSBiZWZvcmVTYXZlXG4vLyB0cmlnZ2VyIHdpbGwgc2V0IHRoZSBvYmplY3Qga2V5IHRvIHRoZSByZXN0IGZvcm1hdCBvYmplY3QgdG8gc2F2ZS5cbi8vIG9yaWdpbmFsUGFyc2VPYmplY3QgaXMgb3B0aW9uYWwsIHdlIG9ubHkgbmVlZCB0aGF0IGZvciBiZWZvcmUvYWZ0ZXJTYXZlIGZ1bmN0aW9uc1xuZXhwb3J0IGZ1bmN0aW9uIG1heWJlUnVuVHJpZ2dlcihcbiAgdHJpZ2dlclR5cGUsXG4gIGF1dGgsXG4gIHBhcnNlT2JqZWN0LFxuICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICBjb25maWcsXG4gIGNvbnRleHRcbikge1xuICBpZiAoIXBhcnNlT2JqZWN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7fSk7XG4gIH1cbiAgcmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcbiAgICB2YXIgdHJpZ2dlciA9IGdldFRyaWdnZXIocGFyc2VPYmplY3QuY2xhc3NOYW1lLCB0cmlnZ2VyVHlwZSwgY29uZmlnLmFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghdHJpZ2dlcikgcmV0dXJuIHJlc29sdmUoKTtcbiAgICB2YXIgcmVxdWVzdCA9IGdldFJlcXVlc3RPYmplY3QoXG4gICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgIGF1dGgsXG4gICAgICBwYXJzZU9iamVjdCxcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICBjb25maWcsXG4gICAgICBjb250ZXh0XG4gICAgKTtcbiAgICB2YXIgeyBzdWNjZXNzLCBlcnJvciB9ID0gZ2V0UmVzcG9uc2VPYmplY3QoXG4gICAgICByZXF1ZXN0LFxuICAgICAgb2JqZWN0ID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlclN1Y2Nlc3NCZWZvcmVIb29rKFxuICAgICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAgIHBhcnNlT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC50b0pTT04oKSxcbiAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgYXV0aFxuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJTYXZlIHx8XG4gICAgICAgICAgdHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZURlbGV0ZSB8fFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlckRlbGV0ZVxuICAgICAgICApIHtcbiAgICAgICAgICBPYmplY3QuYXNzaWduKGNvbnRleHQsIHJlcXVlc3QuY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzb2x2ZShvYmplY3QpO1xuICAgICAgfSxcbiAgICAgIGVycm9yID0+IHtcbiAgICAgICAgbG9nVHJpZ2dlckVycm9yQmVmb3JlSG9vayhcbiAgICAgICAgICB0cmlnZ2VyVHlwZSxcbiAgICAgICAgICBwYXJzZU9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcGFyc2VPYmplY3QudG9KU09OKCksXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICByZWplY3QoZXJyb3IpO1xuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBBZnRlclNhdmUgYW5kIGFmdGVyRGVsZXRlIHRyaWdnZXJzIGNhbiByZXR1cm4gYSBwcm9taXNlLCB3aGljaCBpZiB0aGV5XG4gICAgLy8gZG8sIG5lZWRzIHRvIGJlIHJlc29sdmVkIGJlZm9yZSB0aGlzIHByb21pc2UgaXMgcmVzb2x2ZWQsXG4gICAgLy8gc28gdHJpZ2dlciBleGVjdXRpb24gaXMgc3luY2VkIHdpdGggUmVzdFdyaXRlLmV4ZWN1dGUoKSBjYWxsLlxuICAgIC8vIElmIHRyaWdnZXJzIGRvIG5vdCByZXR1cm4gYSBwcm9taXNlLCB0aGV5IGNhbiBydW4gYXN5bmMgY29kZSBwYXJhbGxlbFxuICAgIC8vIHRvIHRoZSBSZXN0V3JpdGUuZXhlY3V0ZSgpIGNhbGwuXG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBtYXliZVJ1blZhbGlkYXRvcihyZXF1ZXN0LCBgJHt0cmlnZ2VyVHlwZX0uJHtwYXJzZU9iamVjdC5jbGFzc05hbWV9YCwgYXV0aCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAocmVxdWVzdC5za2lwV2l0aE1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBwcm9taXNlID0gdHJpZ2dlcihyZXF1ZXN0KTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRyaWdnZXJUeXBlID09PSBUeXBlcy5hZnRlclNhdmUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJEZWxldGUgfHxcbiAgICAgICAgICB0cmlnZ2VyVHlwZSA9PT0gVHlwZXMuYWZ0ZXJMb2dpblxuICAgICAgICApIHtcbiAgICAgICAgICBsb2dUcmlnZ2VyQWZ0ZXJIb29rKHRyaWdnZXJUeXBlLCBwYXJzZU9iamVjdC5jbGFzc05hbWUsIHBhcnNlT2JqZWN0LnRvSlNPTigpLCBhdXRoKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBiZWZvcmVTYXZlIGlzIGV4cGVjdGVkIHRvIHJldHVybiBudWxsIChub3RoaW5nKVxuICAgICAgICBpZiAodHJpZ2dlclR5cGUgPT09IFR5cGVzLmJlZm9yZVNhdmUpIHtcbiAgICAgICAgICBpZiAocHJvbWlzZSAmJiB0eXBlb2YgcHJvbWlzZS50aGVuID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcHJvbWlzZS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICAgICAgLy8gcmVzcG9uc2Uub2JqZWN0IG1heSBjb21lIGZyb20gZXhwcmVzcyByb3V0aW5nIGJlZm9yZSBob29rXG4gICAgICAgICAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gcmVzcG9uc2U7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcHJvbWlzZTtcbiAgICAgIH0pXG4gICAgICAudGhlbihzdWNjZXNzLCBlcnJvcik7XG4gIH0pO1xufVxuXG4vLyBDb252ZXJ0cyBhIFJFU1QtZm9ybWF0IG9iamVjdCB0byBhIFBhcnNlLk9iamVjdFxuLy8gZGF0YSBpcyBlaXRoZXIgY2xhc3NOYW1lIG9yIGFuIG9iamVjdFxuZXhwb3J0IGZ1bmN0aW9uIGluZmxhdGUoZGF0YSwgcmVzdE9iamVjdCkge1xuICB2YXIgY29weSA9IHR5cGVvZiBkYXRhID09ICdvYmplY3QnID8gZGF0YSA6IHsgY2xhc3NOYW1lOiBkYXRhIH07XG4gIGZvciAodmFyIGtleSBpbiByZXN0T2JqZWN0KSB7XG4gICAgY29weVtrZXldID0gcmVzdE9iamVjdFtrZXldO1xuICB9XG4gIHJldHVybiBQYXJzZS5PYmplY3QuZnJvbUpTT04oY29weSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKGRhdGEsIGFwcGxpY2F0aW9uSWQgPSBQYXJzZS5hcHBsaWNhdGlvbklkKSB7XG4gIGlmICghX3RyaWdnZXJTdG9yZSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXSB8fCAhX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgX3RyaWdnZXJTdG9yZVthcHBsaWNhdGlvbklkXS5MaXZlUXVlcnkuZm9yRWFjaChoYW5kbGVyID0+IGhhbmRsZXIoZGF0YSkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UmVxdWVzdEZpbGVPYmplY3QodHJpZ2dlclR5cGUsIGF1dGgsIGZpbGVPYmplY3QsIGNvbmZpZykge1xuICBjb25zdCByZXF1ZXN0ID0ge1xuICAgIC4uLmZpbGVPYmplY3QsXG4gICAgdHJpZ2dlck5hbWU6IHRyaWdnZXJUeXBlLFxuICAgIG1hc3RlcjogZmFsc2UsXG4gICAgbG9nOiBjb25maWcubG9nZ2VyQ29udHJvbGxlcixcbiAgICBoZWFkZXJzOiBjb25maWcuaGVhZGVycyxcbiAgICBpcDogY29uZmlnLmlwLFxuICB9O1xuXG4gIGlmICghYXV0aCkge1xuICAgIHJldHVybiByZXF1ZXN0O1xuICB9XG4gIGlmIChhdXRoLmlzTWFzdGVyKSB7XG4gICAgcmVxdWVzdFsnbWFzdGVyJ10gPSB0cnVlO1xuICB9XG4gIGlmIChhdXRoLnVzZXIpIHtcbiAgICByZXF1ZXN0Wyd1c2VyJ10gPSBhdXRoLnVzZXI7XG4gIH1cbiAgaWYgKGF1dGguaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXF1ZXN0WydpbnN0YWxsYXRpb25JZCddID0gYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuICByZXR1cm4gcmVxdWVzdDtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1heWJlUnVuRmlsZVRyaWdnZXIodHJpZ2dlclR5cGUsIGZpbGVPYmplY3QsIGNvbmZpZywgYXV0aCkge1xuICBjb25zdCBmaWxlVHJpZ2dlciA9IGdldEZpbGVUcmlnZ2VyKHRyaWdnZXJUeXBlLCBjb25maWcuYXBwbGljYXRpb25JZCk7XG4gIGlmICh0eXBlb2YgZmlsZVRyaWdnZXIgPT09ICdmdW5jdGlvbicpIHtcbiAgICB0cnkge1xuICAgICAgY29uc3QgcmVxdWVzdCA9IGdldFJlcXVlc3RGaWxlT2JqZWN0KHRyaWdnZXJUeXBlLCBhdXRoLCBmaWxlT2JqZWN0LCBjb25maWcpO1xuICAgICAgYXdhaXQgbWF5YmVSdW5WYWxpZGF0b3IocmVxdWVzdCwgYCR7dHJpZ2dlclR5cGV9LiR7RmlsZUNsYXNzTmFtZX1gLCBhdXRoKTtcbiAgICAgIGlmIChyZXF1ZXN0LnNraXBXaXRoTWFzdGVyS2V5KSB7XG4gICAgICAgIHJldHVybiBmaWxlT2JqZWN0O1xuICAgICAgfVxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZVRyaWdnZXIocmVxdWVzdCk7XG4gICAgICBsb2dUcmlnZ2VyU3VjY2Vzc0JlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICByZXN1bHQsXG4gICAgICAgIGF1dGhcbiAgICAgICk7XG4gICAgICByZXR1cm4gcmVzdWx0IHx8IGZpbGVPYmplY3Q7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGxvZ1RyaWdnZXJFcnJvckJlZm9yZUhvb2soXG4gICAgICAgIHRyaWdnZXJUeXBlLFxuICAgICAgICAnUGFyc2UuRmlsZScsXG4gICAgICAgIHsgLi4uZmlsZU9iamVjdC5maWxlLnRvSlNPTigpLCBmaWxlU2l6ZTogZmlsZU9iamVjdC5maWxlU2l6ZSB9LFxuICAgICAgICBhdXRoLFxuICAgICAgICBlcnJvclxuICAgICAgKTtcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuICByZXR1cm4gZmlsZU9iamVjdDtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxLQUFLLEdBQUc7RUFDbkJDLFdBQVcsRUFBRSxhQURNO0VBRW5CQyxVQUFVLEVBQUUsWUFGTztFQUduQkMsV0FBVyxFQUFFLGFBSE07RUFJbkJDLFVBQVUsRUFBRSxZQUpPO0VBS25CQyxTQUFTLEVBQUUsV0FMUTtF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