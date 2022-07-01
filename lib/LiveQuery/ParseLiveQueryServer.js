"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ParseLiveQueryServer = void 0;

var _tv = _interopRequireDefault(require("tv4"));

var _node = _interopRequireDefault(require("parse/node"));

var _Subscription = require("./Subscription");

var _Client = require("./Client");

var _ParseWebSocketServer = require("./ParseWebSocketServer");

var _logger = _interopRequireDefault(require("../logger"));

var _RequestSchema = _interopRequireDefault(require("./RequestSchema"));

var _QueryTools = require("./QueryTools");

var _ParsePubSub = require("./ParsePubSub");

var _SchemaController = _interopRequireDefault(require("../Controllers/SchemaController"));

var _lodash = _interopRequireDefault(require("lodash"));

var _uuid = require("uuid");

var _triggers = require("../triggers");

var _Auth = require("../Auth");

var _Controllers = require("../Controllers");

var _lruCache = _interopRequireDefault(require("lru-cache"));

var _UsersRouter = _interopRequireDefault(require("../Routers/UsersRouter"));

var _DatabaseController = _interopRequireDefault(require("../Controllers/DatabaseController"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class ParseLiveQueryServer {
  // className -> (queryHash -> subscription)
  // The subscriber we use to get object update from publisher
  constructor(server, config = {}, parseServerConfig = {}) {
    this.server = server;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.config = config;
    config.appId = config.appId || _node.default.applicationId;
    config.masterKey = config.masterKey || _node.default.masterKey; // Store keys, convert obj to map

    const keyPairs = config.keyPairs || {};
    this.keyPairs = new Map();

    for (const key of Object.keys(keyPairs)) {
      this.keyPairs.set(key, keyPairs[key]);
    }

    _logger.default.verbose('Support key pairs', this.keyPairs); // Initialize Parse


    _node.default.Object.disableSingleInstance();

    const serverURL = config.serverURL || _node.default.serverURL;
    _node.default.serverURL = serverURL;

    _node.default.initialize(config.appId, _node.default.javaScriptKey, config.masterKey); // The cache controller is a proper cache controller
    // with access to User and Roles


    this.cacheController = (0, _Controllers.getCacheController)(parseServerConfig);
    config.cacheTimeout = config.cacheTimeout || 5 * 1000; // 5s
    // This auth cache stores the promises for each auth resolution.
    // The main benefit is to be able to reuse the same user / session token resolution.

    this.authCache = new _lruCache.default({
      max: 500,
      // 500 concurrent
      maxAge: config.cacheTimeout
    }); // Initialize websocket server

    this.parseWebSocketServer = new _ParseWebSocketServer.ParseWebSocketServer(server, parseWebsocket => this._onConnect(parseWebsocket), config); // Initialize subscriber

    this.subscriber = _ParsePubSub.ParsePubSub.createSubscriber(config);
    this.subscriber.subscribe(_node.default.applicationId + 'afterSave');
    this.subscriber.subscribe(_node.default.applicationId + 'afterDelete'); // Register message handler for subscriber. When publisher get messages, it will publish message
    // to the subscribers and the handler will be called.

    this.subscriber.on('message', (channel, messageStr) => {
      _logger.default.verbose('Subscribe message %j', messageStr);

      let message;

      try {
        message = JSON.parse(messageStr);
      } catch (e) {
        _logger.default.error('unable to parse message', messageStr, e);

        return;
      }

      this._inflateParseObject(message);

      if (channel === _node.default.applicationId + 'afterSave') {
        this._onAfterSave(message);
      } else if (channel === _node.default.applicationId + 'afterDelete') {
        this._onAfterDelete(message);
      } else {
        _logger.default.error('Get message %s from unknown channel %j', message, channel);
      }
    });
  } // Message is the JSON object from publisher. Message.currentParseObject is the ParseObject JSON after changes.
  // Message.originalParseObject is the original ParseObject JSON.


  _inflateParseObject(message) {
    // Inflate merged object
    const currentParseObject = message.currentParseObject;

    _UsersRouter.default.removeHiddenProperties(currentParseObject);

    let className = currentParseObject.className;
    let parseObject = new _node.default.Object(className);

    parseObject._finishFetch(currentParseObject);

    message.currentParseObject = parseObject; // Inflate original object

    const originalParseObject = message.originalParseObject;

    if (originalParseObject) {
      _UsersRouter.default.removeHiddenProperties(originalParseObject);

      className = originalParseObject.className;
      parseObject = new _node.default.Object(className);

      parseObject._finishFetch(originalParseObject);

      message.originalParseObject = parseObject;
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.


  async _onAfterDelete(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterDelete is triggered');

    let deletedParseObject = message.currentParseObject.toJSON();
    const classLevelPermissions = message.classLevelPermissions;
    const className = deletedParseObject.className;

    _logger.default.verbose('ClassName: %j | ObjectId: %s', className, deletedParseObject.id);

    _logger.default.verbose('Current client number : %d', this.clients.size);

    const classSubscriptions = this.subscriptions.get(className);

    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);

      return;
    }

    for (const subscription of classSubscriptions.values()) {
      const isSubscriptionMatched = this._matchesSubscription(deletedParseObject, subscription);

      if (!isSubscriptionMatched) {
        continue;
      }

      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);

        if (typeof client === 'undefined') {
          continue;
        }

        requestIds.forEach(async requestId => {
          const acl = message.currentParseObject.getACL(); // Check CLP

          const op = this._getCLPOperation(subscription.query);

          let res = {};

          try {
            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const isMatched = await this._matchesACL(acl, client, requestId);

            if (!isMatched) {
              return null;
            }

            res = {
              event: 'delete',
              sessionToken: client.sessionToken,
              object: deletedParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);

            if (trigger) {
              const auth = await this.getAuthFromClient(client, requestId);

              if (auth && auth.user) {
                res.user = auth.user;
              }

              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }

              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }

            if (!res.sendEvent) {
              return;
            }

            if (res.object && typeof res.object.toJSON === 'function') {
              deletedParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }

            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            client.pushDelete(requestId, deletedParseObject);
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);

            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);

            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  } // Message is the JSON object from publisher after inflated. Message.currentParseObject is the ParseObject after changes.
  // Message.originalParseObject is the original ParseObject.


  async _onAfterSave(message) {
    _logger.default.verbose(_node.default.applicationId + 'afterSave is triggered');

    let originalParseObject = null;

    if (message.originalParseObject) {
      originalParseObject = message.originalParseObject.toJSON();
    }

    const classLevelPermissions = message.classLevelPermissions;
    let currentParseObject = message.currentParseObject.toJSON();
    const className = currentParseObject.className;

    _logger.default.verbose('ClassName: %s | ObjectId: %s', className, currentParseObject.id);

    _logger.default.verbose('Current client number : %d', this.clients.size);

    const classSubscriptions = this.subscriptions.get(className);

    if (typeof classSubscriptions === 'undefined') {
      _logger.default.debug('Can not find subscriptions under this class ' + className);

      return;
    }

    for (const subscription of classSubscriptions.values()) {
      const isOriginalSubscriptionMatched = this._matchesSubscription(originalParseObject, subscription);

      const isCurrentSubscriptionMatched = this._matchesSubscription(currentParseObject, subscription);

      for (const [clientId, requestIds] of _lodash.default.entries(subscription.clientRequestIds)) {
        const client = this.clients.get(clientId);

        if (typeof client === 'undefined') {
          continue;
        }

        requestIds.forEach(async requestId => {
          // Set orignal ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL
          let originalACLCheckingPromise;

          if (!isOriginalSubscriptionMatched) {
            originalACLCheckingPromise = Promise.resolve(false);
          } else {
            let originalACL;

            if (message.originalParseObject) {
              originalACL = message.originalParseObject.getACL();
            }

            originalACLCheckingPromise = this._matchesACL(originalACL, client, requestId);
          } // Set current ParseObject ACL checking promise, if the object does not match
          // subscription, we do not need to check ACL


          let currentACLCheckingPromise;
          let res = {};

          if (!isCurrentSubscriptionMatched) {
            currentACLCheckingPromise = Promise.resolve(false);
          } else {
            const currentACL = message.currentParseObject.getACL();
            currentACLCheckingPromise = this._matchesACL(currentACL, client, requestId);
          }

          try {
            const op = this._getCLPOperation(subscription.query);

            await this._matchesCLP(classLevelPermissions, message.currentParseObject, client, requestId, op);
            const [isOriginalMatched, isCurrentMatched] = await Promise.all([originalACLCheckingPromise, currentACLCheckingPromise]);

            _logger.default.verbose('Original %j | Current %j | Match: %s, %s, %s, %s | Query: %s', originalParseObject, currentParseObject, isOriginalSubscriptionMatched, isCurrentSubscriptionMatched, isOriginalMatched, isCurrentMatched, subscription.hash); // Decide event type


            let type;

            if (isOriginalMatched && isCurrentMatched) {
              type = 'update';
            } else if (isOriginalMatched && !isCurrentMatched) {
              type = 'leave';
            } else if (!isOriginalMatched && isCurrentMatched) {
              if (originalParseObject) {
                type = 'enter';
              } else {
                type = 'create';
              }
            } else {
              return null;
            }

            res = {
              event: type,
              sessionToken: client.sessionToken,
              object: currentParseObject,
              original: originalParseObject,
              clients: this.clients.size,
              subscriptions: this.subscriptions.size,
              useMasterKey: client.hasMasterKey,
              installationId: client.installationId,
              sendEvent: true
            };
            const trigger = (0, _triggers.getTrigger)(className, 'afterEvent', _node.default.applicationId);

            if (trigger) {
              if (res.object) {
                res.object = _node.default.Object.fromJSON(res.object);
              }

              if (res.original) {
                res.original = _node.default.Object.fromJSON(res.original);
              }

              const auth = await this.getAuthFromClient(client, requestId);

              if (auth && auth.user) {
                res.user = auth.user;
              }

              await (0, _triggers.runTrigger)(trigger, `afterEvent.${className}`, res, auth);
            }

            if (!res.sendEvent) {
              return;
            }

            if (res.object && typeof res.object.toJSON === 'function') {
              currentParseObject = (0, _triggers.toJSONwithObjects)(res.object, res.object.className || className);
            }

            if (res.original && typeof res.original.toJSON === 'function') {
              originalParseObject = (0, _triggers.toJSONwithObjects)(res.original, res.original.className || className);
            }

            await this._filterSensitiveData(classLevelPermissions, res, client, requestId, op, subscription.query);
            const functionName = 'push' + res.event.charAt(0).toUpperCase() + res.event.slice(1);

            if (client[functionName]) {
              client[functionName](requestId, currentParseObject, originalParseObject);
            }
          } catch (e) {
            const error = (0, _triggers.resolveError)(e);

            _Client.Client.pushError(client.parseWebSocket, error.code, error.message, false, requestId);

            _logger.default.error(`Failed running afterLiveQueryEvent on class ${className} for event ${res.event} with session ${res.sessionToken} with:\n Error: ` + JSON.stringify(error));
          }
        });
      }
    }
  }

  _onConnect(parseWebsocket) {
    parseWebsocket.on('message', request => {
      if (typeof request === 'string') {
        try {
          request = JSON.parse(request);
        } catch (e) {
          _logger.default.error('unable to parse request', request, e);

          return;
        }
      }

      _logger.default.verbose('Request: %j', request); // Check whether this request is a valid request, return error directly if not


      if (!_tv.default.validate(request, _RequestSchema.default['general']) || !_tv.default.validate(request, _RequestSchema.default[request.op])) {
        _Client.Client.pushError(parseWebsocket, 1, _tv.default.error.message);

        _logger.default.error('Connect message error %s', _tv.default.error.message);

        return;
      }

      switch (request.op) {
        case 'connect':
          this._handleConnect(parseWebsocket, request);

          break;

        case 'subscribe':
          this._handleSubscribe(parseWebsocket, request);

          break;

        case 'update':
          this._handleUpdateSubscription(parseWebsocket, request);

          break;

        case 'unsubscribe':
          this._handleUnsubscribe(parseWebsocket, request);

          break;

        default:
          _Client.Client.pushError(parseWebsocket, 3, 'Get unknown operation');

          _logger.default.error('Get unknown operation', request.op);

      }
    });
    parseWebsocket.on('disconnect', () => {
      _logger.default.info(`Client disconnect: ${parseWebsocket.clientId}`);

      const clientId = parseWebsocket.clientId;

      if (!this.clients.has(clientId)) {
        (0, _triggers.runLiveQueryEventHandlers)({
          event: 'ws_disconnect_error',
          clients: this.clients.size,
          subscriptions: this.subscriptions.size,
          error: `Unable to find client ${clientId}`
        });

        _logger.default.error(`Can not find client ${clientId} on disconnect`);

        return;
      } // Delete client


      const client = this.clients.get(clientId);
      this.clients.delete(clientId); // Delete client from subscriptions

      for (const [requestId, subscriptionInfo] of _lodash.default.entries(client.subscriptionInfos)) {
        const subscription = subscriptionInfo.subscription;
        subscription.deleteClientSubscription(clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

        const classSubscriptions = this.subscriptions.get(subscription.className);

        if (!subscription.hasSubscribingClient()) {
          classSubscriptions.delete(subscription.hash);
        } // If there is no subscriptions under this class, remove it from subscriptions


        if (classSubscriptions.size === 0) {
          this.subscriptions.delete(subscription.className);
        }
      }

      _logger.default.verbose('Current clients %d', this.clients.size);

      _logger.default.verbose('Current subscriptions %d', this.subscriptions.size);

      (0, _triggers.runLiveQueryEventHandlers)({
        event: 'ws_disconnect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId,
        sessionToken: client.sessionToken
      });
    });
    (0, _triggers.runLiveQueryEventHandlers)({
      event: 'ws_connect',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size
    });
  }

  _matchesSubscription(parseObject, subscription) {
    // Object is undefined or null, not match
    if (!parseObject) {
      return false;
    }

    return (0, _QueryTools.matchesQuery)(parseObject, subscription.query);
  }

  getAuthForSessionToken(sessionToken) {
    if (!sessionToken) {
      return Promise.resolve({});
    }

    const fromCache = this.authCache.get(sessionToken);

    if (fromCache) {
      return fromCache;
    }

    const authPromise = (0, _Auth.getAuthForSessionToken)({
      cacheController: this.cacheController,
      sessionToken: sessionToken
    }).then(auth => {
      return {
        auth,
        userId: auth && auth.user && auth.user.id
      };
    }).catch(error => {
      // There was an error with the session token
      const result = {};

      if (error && error.code === _node.default.Error.INVALID_SESSION_TOKEN) {
        result.error = error;
        this.authCache.set(sessionToken, Promise.resolve(result), this.config.cacheTimeout);
      } else {
        this.authCache.del(sessionToken);
      }

      return result;
    });
    this.authCache.set(sessionToken, authPromise);
    return authPromise;
  }

  async _matchesCLP(classLevelPermissions, object, client, requestId, op) {
    // try to match on user first, less expensive than with roles
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let userId;

    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);

      if (userId) {
        aclGroup.push(userId);
      }
    }

    try {
      await _SchemaController.default.validatePermission(classLevelPermissions, object.className, aclGroup, op);
      return true;
    } catch (e) {
      _logger.default.verbose(`Failed matching CLP for ${object.id} ${userId} ${e}`);

      return false;
    } // TODO: handle roles permissions
    // Object.keys(classLevelPermissions).forEach((key) => {
    //   const perm = classLevelPermissions[key];
    //   Object.keys(perm).forEach((key) => {
    //     if (key.indexOf('role'))
    //   });
    // })
    // // it's rejected here, check the roles
    // var rolesQuery = new Parse.Query(Parse.Role);
    // rolesQuery.equalTo("users", user);
    // return rolesQuery.find({useMasterKey:true});

  }

  async _filterSensitiveData(classLevelPermissions, res, client, requestId, op, query) {
    const subscriptionInfo = client.getSubscriptionInfo(requestId);
    const aclGroup = ['*'];
    let clientAuth;

    if (typeof subscriptionInfo !== 'undefined') {
      const {
        userId,
        auth
      } = await this.getAuthForSessionToken(subscriptionInfo.sessionToken);

      if (userId) {
        aclGroup.push(userId);
      }

      clientAuth = auth;
    }

    const filter = obj => {
      if (!obj) {
        return;
      }

      let protectedFields = (classLevelPermissions === null || classLevelPermissions === void 0 ? void 0 : classLevelPermissions.protectedFields) || [];

      if (!client.hasMasterKey && !Array.isArray(protectedFields)) {
        protectedFields = (0, _Controllers.getDatabaseController)(this.config).addProtectedFields(classLevelPermissions, res.object.className, query, aclGroup, clientAuth);
      }

      return _DatabaseController.default.filterSensitiveData(client.hasMasterKey, aclGroup, clientAuth, op, classLevelPermissions, res.object.className, protectedFields, obj, query);
    };

    res.object = filter(res.object);
    res.original = filter(res.original);
  }

  _getCLPOperation(query) {
    return typeof query === 'object' && Object.keys(query).length == 1 && typeof query.objectId === 'string' ? 'get' : 'find';
  }

  async _verifyACL(acl, token) {
    if (!token) {
      return false;
    }

    const {
      auth,
      userId
    } = await this.getAuthForSessionToken(token); // Getting the session token failed
    // This means that no additional auth is available
    // At this point, just bail out as no additional visibility can be inferred.

    if (!auth || !userId) {
      return false;
    }

    const isSubscriptionSessionTokenMatched = acl.getReadAccess(userId);

    if (isSubscriptionSessionTokenMatched) {
      return true;
    } // Check if the user has any roles that match the ACL


    return Promise.resolve().then(async () => {
      // Resolve false right away if the acl doesn't have any roles
      const acl_has_roles = Object.keys(acl.permissionsById).some(key => key.startsWith('role:'));

      if (!acl_has_roles) {
        return false;
      }

      const roleNames = await auth.getUserRoles(); // Finally, see if any of the user's roles allow them read access

      for (const role of roleNames) {
        // We use getReadAccess as `role` is in the form `role:roleName`
        if (acl.getReadAccess(role)) {
          return true;
        }
      }

      return false;
    }).catch(() => {
      return false;
    });
  }

  async getAuthFromClient(client, requestId, sessionToken) {
    const getSessionFromClient = () => {
      const subscriptionInfo = client.getSubscriptionInfo(requestId);

      if (typeof subscriptionInfo === 'undefined') {
        return client.sessionToken;
      }

      return subscriptionInfo.sessionToken || client.sessionToken;
    };

    if (!sessionToken) {
      sessionToken = getSessionFromClient();
    }

    if (!sessionToken) {
      return;
    }

    const {
      auth
    } = await this.getAuthForSessionToken(sessionToken);
    return auth;
  }

  async _matchesACL(acl, client, requestId) {
    // Return true directly if ACL isn't present, ACL is public read, or client has master key
    if (!acl || acl.getPublicReadAccess() || client.hasMasterKey) {
      return true;
    } // Check subscription sessionToken matches ACL first


    const subscriptionInfo = client.getSubscriptionInfo(requestId);

    if (typeof subscriptionInfo === 'undefined') {
      return false;
    }

    const subscriptionToken = subscriptionInfo.sessionToken;
    const clientSessionToken = client.sessionToken;

    if (await this._verifyACL(acl, subscriptionToken)) {
      return true;
    }

    if (await this._verifyACL(acl, clientSessionToken)) {
      return true;
    }

    return false;
  }

  async _handleConnect(parseWebsocket, request) {
    if (!this._validateKeys(request, this.keyPairs)) {
      _Client.Client.pushError(parseWebsocket, 4, 'Key in request is not valid');

      _logger.default.error('Key in request is not valid');

      return;
    }

    const hasMasterKey = this._hasMasterKey(request, this.keyPairs);

    const clientId = (0, _uuid.v4)();
    const client = new _Client.Client(clientId, parseWebsocket, hasMasterKey, request.sessionToken, request.installationId);

    try {
      const req = {
        client,
        event: 'connect',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: request.installationId
      };
      const trigger = (0, _triggers.getTrigger)('@Connect', 'beforeConnect', _node.default.applicationId);

      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, req.sessionToken);

        if (auth && auth.user) {
          req.user = auth.user;
        }

        await (0, _triggers.runTrigger)(trigger, `beforeConnect.@Connect`, req, auth);
      }

      parseWebsocket.clientId = clientId;
      this.clients.set(parseWebsocket.clientId, client);

      _logger.default.info(`Create new client: ${parseWebsocket.clientId}`);

      client.pushConnect();
      (0, _triggers.runLiveQueryEventHandlers)(req);
    } catch (e) {
      const error = (0, _triggers.resolveError)(e);

      _Client.Client.pushError(parseWebsocket, error.code, error.message, false);

      _logger.default.error(`Failed running beforeConnect for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
    }
  }

  _hasMasterKey(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0 || !validKeyPairs.has('masterKey')) {
      return false;
    }

    if (!request || !Object.prototype.hasOwnProperty.call(request, 'masterKey')) {
      return false;
    }

    return request.masterKey === validKeyPairs.get('masterKey');
  }

  _validateKeys(request, validKeyPairs) {
    if (!validKeyPairs || validKeyPairs.size == 0) {
      return true;
    }

    let isValid = false;

    for (const [key, secret] of validKeyPairs) {
      if (!request[key] || request[key] !== secret) {
        continue;
      }

      isValid = true;
      break;
    }

    return isValid;
  }

  async _handleSubscribe(parseWebsocket, request) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before subscribing');

      _logger.default.error('Can not find this client, make sure you connect to server before subscribing');

      return;
    }

    const client = this.clients.get(parseWebsocket.clientId);
    const className = request.query.className;
    let authCalled = false;

    try {
      const trigger = (0, _triggers.getTrigger)(className, 'beforeSubscribe', _node.default.applicationId);

      if (trigger) {
        const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);
        authCalled = true;

        if (auth && auth.user) {
          request.user = auth.user;
        }

        const parseQuery = new _node.default.Query(className);
        parseQuery.withJSON(request.query);
        request.query = parseQuery;
        await (0, _triggers.runTrigger)(trigger, `beforeSubscribe.${className}`, request, auth);
        const query = request.query.toJSON();

        if (query.keys) {
          query.fields = query.keys.split(',');
        }

        request.query = query;
      }

      if (className === '_Session') {
        if (!authCalled) {
          const auth = await this.getAuthFromClient(client, request.requestId, request.sessionToken);

          if (auth && auth.user) {
            request.user = auth.user;
          }
        }

        if (request.user) {
          request.query.where.user = request.user.toPointer();
        } else if (!request.master) {
          _Client.Client.pushError(parseWebsocket, _node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token', false, request.requestId);

          return;
        }
      } // Get subscription from subscriptions, create one if necessary


      const subscriptionHash = (0, _QueryTools.queryHash)(request.query); // Add className to subscriptions if necessary

      if (!this.subscriptions.has(className)) {
        this.subscriptions.set(className, new Map());
      }

      const classSubscriptions = this.subscriptions.get(className);
      let subscription;

      if (classSubscriptions.has(subscriptionHash)) {
        subscription = classSubscriptions.get(subscriptionHash);
      } else {
        subscription = new _Subscription.Subscription(className, request.query.where, subscriptionHash);
        classSubscriptions.set(subscriptionHash, subscription);
      } // Add subscriptionInfo to client


      const subscriptionInfo = {
        subscription: subscription
      }; // Add selected fields, sessionToken and installationId for this subscription if necessary

      if (request.query.fields) {
        subscriptionInfo.fields = request.query.fields;
      }

      if (request.sessionToken) {
        subscriptionInfo.sessionToken = request.sessionToken;
      }

      client.addSubscriptionInfo(request.requestId, subscriptionInfo); // Add clientId to subscription

      subscription.addClientSubscription(parseWebsocket.clientId, request.requestId);
      client.pushSubscribe(request.requestId);

      _logger.default.verbose(`Create client ${parseWebsocket.clientId} new subscription: ${request.requestId}`);

      _logger.default.verbose('Current client number: %d', this.clients.size);

      (0, _triggers.runLiveQueryEventHandlers)({
        client,
        event: 'subscribe',
        clients: this.clients.size,
        subscriptions: this.subscriptions.size,
        sessionToken: request.sessionToken,
        useMasterKey: client.hasMasterKey,
        installationId: client.installationId
      });
    } catch (e) {
      const error = (0, _triggers.resolveError)(e);

      _Client.Client.pushError(parseWebsocket, error.code, error.message, false, request.requestId);

      _logger.default.error(`Failed running beforeSubscribe on ${className} for session ${request.sessionToken} with:\n Error: ` + JSON.stringify(error));
    }
  }

  _handleUpdateSubscription(parseWebsocket, request) {
    this._handleUnsubscribe(parseWebsocket, request, false);

    this._handleSubscribe(parseWebsocket, request);
  }

  _handleUnsubscribe(parseWebsocket, request, notifyClient = true) {
    // If we can not find this client, return error to client
    if (!Object.prototype.hasOwnProperty.call(parseWebsocket, 'clientId')) {
      _Client.Client.pushError(parseWebsocket, 2, 'Can not find this client, make sure you connect to server before unsubscribing');

      _logger.default.error('Can not find this client, make sure you connect to server before unsubscribing');

      return;
    }

    const requestId = request.requestId;
    const client = this.clients.get(parseWebsocket.clientId);

    if (typeof client === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find client with clientId ' + parseWebsocket.clientId + '. Make sure you connect to live query server before unsubscribing.');

      _logger.default.error('Can not find this client ' + parseWebsocket.clientId);

      return;
    }

    const subscriptionInfo = client.getSubscriptionInfo(requestId);

    if (typeof subscriptionInfo === 'undefined') {
      _Client.Client.pushError(parseWebsocket, 2, 'Cannot find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId + '. Make sure you subscribe to live query server before unsubscribing.');

      _logger.default.error('Can not find subscription with clientId ' + parseWebsocket.clientId + ' subscriptionId ' + requestId);

      return;
    } // Remove subscription from client


    client.deleteSubscriptionInfo(requestId); // Remove client from subscription

    const subscription = subscriptionInfo.subscription;
    const className = subscription.className;
    subscription.deleteClientSubscription(parseWebsocket.clientId, requestId); // If there is no client which is subscribing this subscription, remove it from subscriptions

    const classSubscriptions = this.subscriptions.get(className);

    if (!subscription.hasSubscribingClient()) {
      classSubscriptions.delete(subscription.hash);
    } // If there is no subscriptions under this class, remove it from subscriptions


    if (classSubscriptions.size === 0) {
      this.subscriptions.delete(className);
    }

    (0, _triggers.runLiveQueryEventHandlers)({
      client,
      event: 'unsubscribe',
      clients: this.clients.size,
      subscriptions: this.subscriptions.size,
      sessionToken: subscriptionInfo.sessionToken,
      useMasterKey: client.hasMasterKey,
      installationId: client.installationId
    });

    if (!notifyClient) {
      return;
    }

    client.pushUnsubscribe(request.requestId);

    _logger.default.verbose(`Delete client: ${parseWebsocket.clientId} | subscription: ${request.requestId}`);
  }

}

exports.ParseLiveQueryServer = ParseLiveQueryServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwibWF4QWdlIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJzdWJzY3JpYmUiLCJvbiIsImNoYW5uZWwiLCJtZXNzYWdlU3RyIiwibWVzc2FnZSIsIkpTT04iLCJwYXJzZSIsImUiLCJlcnJvciIsIl9pbmZsYXRlUGFyc2VPYmplY3QiLCJfb25BZnRlclNhdmUiLCJfb25BZnRlckRlbGV0ZSIsImN1cnJlbnRQYXJzZU9iamVjdCIsIlVzZXJSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiY2xhc3NOYW1lIiwicGFyc2VPYmplY3QiLCJfZmluaXNoRmV0Y2giLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiZGVsZXRlZFBhcnNlT2JqZWN0IiwidG9KU09OIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaWQiLCJzaXplIiwiY2xhc3NTdWJzY3JpcHRpb25zIiwiZ2V0IiwiZGVidWciLCJzdWJzY3JpcHRpb24iLCJ2YWx1ZXMiLCJpc1N1YnNjcmlwdGlvbk1hdGNoZWQiLCJfbWF0Y2hlc1N1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkcyIsIl8iLCJlbnRyaWVzIiwiY2xpZW50UmVxdWVzdElkcyIsImNsaWVudCIsImZvckVhY2giLCJyZXF1ZXN0SWQiLCJhY2wiLCJnZXRBQ0wiLCJvcCIsIl9nZXRDTFBPcGVyYXRpb24iLCJxdWVyeSIsInJlcyIsIl9tYXRjaGVzQ0xQIiwiaXNNYXRjaGVkIiwiX21hdGNoZXNBQ0wiLCJldmVudCIsInNlc3Npb25Ub2tlbiIsIm9iamVjdCIsInVzZU1hc3RlcktleSIsImhhc01hc3RlcktleSIsImluc3RhbGxhdGlvbklkIiwic2VuZEV2ZW50IiwidHJpZ2dlciIsImdldFRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJydW5UcmlnZ2VyIiwidG9KU09Od2l0aE9iamVjdHMiLCJfZmlsdGVyU2Vuc2l0aXZlRGF0YSIsInB1c2hEZWxldGUiLCJyZXNvbHZlRXJyb3IiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJwYXJzZVdlYlNvY2tldCIsImNvZGUiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwib3JpZ2luYWxBQ0wiLCJjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlIiwiY3VycmVudEFDTCIsImlzT3JpZ2luYWxNYXRjaGVkIiwiaXNDdXJyZW50TWF0Y2hlZCIsImFsbCIsImhhc2giLCJ0eXBlIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImRlbGV0ZSIsInN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvcyIsImRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbiIsImhhc1N1YnNjcmliaW5nQ2xpZW50IiwibWF0Y2hlc1F1ZXJ5IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImZyb21DYWNoZSIsImF1dGhQcm9taXNlIiwidGhlbiIsInVzZXJJZCIsImNhdGNoIiwicmVzdWx0IiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJkZWwiLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImNsaWVudEF1dGgiLCJmaWx0ZXIiLCJvYmoiLCJwcm90ZWN0ZWRGaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJnZXREYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGRQcm90ZWN0ZWRGaWVsZHMiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwibGVuZ3RoIiwib2JqZWN0SWQiLCJfdmVyaWZ5QUNMIiwidG9rZW4iLCJpc1N1YnNjcmlwdGlvblNlc3Npb25Ub2tlbk1hdGNoZWQiLCJnZXRSZWFkQWNjZXNzIiwiYWNsX2hhc19yb2xlcyIsInBlcm1pc3Npb25zQnlJZCIsInNvbWUiLCJzdGFydHNXaXRoIiwicm9sZU5hbWVzIiwiZ2V0VXNlclJvbGVzIiwicm9sZSIsImdldFNlc3Npb25Gcm9tQ2xpZW50IiwiZ2V0UHVibGljUmVhZEFjY2VzcyIsInN1YnNjcmlwdGlvblRva2VuIiwiY2xpZW50U2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlS2V5cyIsIl9oYXNNYXN0ZXJLZXkiLCJ1dWlkdjQiLCJyZXEiLCJwdXNoQ29ubmVjdCIsInZhbGlkS2V5UGFpcnMiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJpc1ZhbGlkIiwic2VjcmV0IiwiYXV0aENhbGxlZCIsInBhcnNlUXVlcnkiLCJRdWVyeSIsIndpdGhKU09OIiwiZmllbGRzIiwic3BsaXQiLCJ3aGVyZSIsInRvUG9pbnRlciIsIm1hc3RlciIsInN1YnNjcmlwdGlvbkhhc2giLCJxdWVyeUhhc2giLCJTdWJzY3JpcHRpb24iLCJhZGRTdWJzY3JpcHRpb25JbmZvIiwiYWRkQ2xpZW50U3Vic2NyaXB0aW9uIiwicHVzaFN1YnNjcmliZSIsIm5vdGlmeUNsaWVudCIsImRlbGV0ZVN1YnNjcmlwdGlvbkluZm8iLCJwdXNoVW5zdWJzY3JpYmUiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0djQgZnJvbSAndHY0JztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IFN1YnNjcmlwdGlvbiB9IGZyb20gJy4vU3Vic2NyaXB0aW9uJztcbmltcG9ydCB7IENsaWVudCB9IGZyb20gJy4vQ2xpZW50JztcbmltcG9ydCB7IFBhcnNlV2ViU29ja2V0U2VydmVyIH0gZnJvbSAnLi9QYXJzZVdlYlNvY2tldFNlcnZlcic7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgUmVxdWVzdFNjaGVtYSBmcm9tICcuL1JlcXVlc3RTY2hlbWEnO1xuaW1wb3J0IHsgbWF0Y2hlc1F1ZXJ5LCBxdWVyeUhhc2ggfSBmcm9tICcuL1F1ZXJ5VG9vbHMnO1xuaW1wb3J0IHsgUGFyc2VQdWJTdWIgfSBmcm9tICcuL1BhcnNlUHViU3ViJztcbmltcG9ydCBTY2hlbWFDb250cm9sbGVyIGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuaW1wb3J0IHtcbiAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyxcbiAgZ2V0VHJpZ2dlcixcbiAgcnVuVHJpZ2dlcixcbiAgcmVzb2x2ZUVycm9yLFxuICB0b0pTT053aXRoT2JqZWN0cyxcbn0gZnJvbSAnLi4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiwgQXV0aCB9IGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHsgZ2V0Q2FjaGVDb250cm9sbGVyLCBnZXREYXRhYmFzZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgbWF4QWdlOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcblxuICAgIC8vIEluaXRpYWxpemUgc3Vic2NyaWJlclxuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJyk7XG4gICAgLy8gUmVnaXN0ZXIgbWVzc2FnZSBoYW5kbGVyIGZvciBzdWJzY3JpYmVyLiBXaGVuIHB1Ymxpc2hlciBnZXQgbWVzc2FnZXMsIGl0IHdpbGwgcHVibGlzaCBtZXNzYWdlXG4gICAgLy8gdG8gdGhlIHN1YnNjcmliZXJzIGFuZCB0aGUgaGFuZGxlciB3aWxsIGJlIGNhbGxlZC5cbiAgICB0aGlzLnN1YnNjcmliZXIub24oJ21lc3NhZ2UnLCAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oZGVsZXRlZFBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24pO1xuICAgICAgaWYgKCFpc1N1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2hlZCA9IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0woYWNsLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBpZiAoIWlzTWF0Y2hlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6ICdkZWxldGUnLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX2ZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgcmVzLFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3AsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbi5xdWVyeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNsaWVudC5wdXNoRGVsZXRlKHJlcXVlc3RJZCwgZGVsZXRlZFBhcnNlT2JqZWN0KTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBjb25zdCBlcnJvciA9IHJlc29sdmVFcnJvcihlKTtcbiAgICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoY2xpZW50LnBhcnNlV2ViU29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgICAgICAgYEZhaWxlZCBydW5uaW5nIGFmdGVyTGl2ZVF1ZXJ5RXZlbnQgb24gY2xhc3MgJHtjbGFzc05hbWV9IGZvciBldmVudCAke3Jlcy5ldmVudH0gd2l0aCBzZXNzaW9uICR7cmVzLnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJTYXZlKG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIGxvZ2dlci52ZXJib3NlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlIGlzIHRyaWdnZXJlZCcpO1xuXG4gICAgbGV0IG9yaWdpbmFsUGFyc2VPYmplY3QgPSBudWxsO1xuICAgIGlmIChtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QpIHtcbiAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSBtZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QudG9KU09OKCk7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IG1lc3NhZ2UuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgIGxldCBjdXJyZW50UGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVzIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBjdXJyZW50UGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZm9yIChjb25zdCBzdWJzY3JpcHRpb24gb2YgY2xhc3NTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG4gICAgICBjb25zdCBpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGNvbnN0IGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQgPSB0aGlzLl9tYXRjaGVzU3Vic2NyaXB0aW9uKFxuICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgIHN1YnNjcmlwdGlvblxuICAgICAgKTtcbiAgICAgIGZvciAoY29uc3QgW2NsaWVudElkLCByZXF1ZXN0SWRzXSBvZiBfLmVudHJpZXMoc3Vic2NyaXB0aW9uLmNsaWVudFJlcXVlc3RJZHMpKSB7XG4gICAgICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQoY2xpZW50SWQpO1xuICAgICAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0SWRzLmZvckVhY2goYXN5bmMgcmVxdWVzdElkID0+IHtcbiAgICAgICAgICAvLyBTZXQgb3JpZ25hbCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlO1xuICAgICAgICAgIGlmICghaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGV0IG9yaWdpbmFsQUNMO1xuICAgICAgICAgICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlID0gdGhpcy5fbWF0Y2hlc0FDTChvcmlnaW5hbEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBTZXQgY3VycmVudCBQYXJzZU9iamVjdCBBQ0wgY2hlY2tpbmcgcHJvbWlzZSwgaWYgdGhlIG9iamVjdCBkb2VzIG5vdCBtYXRjaFxuICAgICAgICAgIC8vIHN1YnNjcmlwdGlvbiwgd2UgZG8gbm90IG5lZWQgdG8gY2hlY2sgQUNMXG4gICAgICAgICAgbGV0IGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgbGV0IHJlcyA9IHt9O1xuICAgICAgICAgIGlmICghaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRBQ0wgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC5nZXRBQ0woKTtcbiAgICAgICAgICAgIGN1cnJlbnRBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKGN1cnJlbnRBQ0wsIGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IG9wID0gdGhpcy5fZ2V0Q0xQT3BlcmF0aW9uKHN1YnNjcmlwdGlvbi5xdWVyeSk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9tYXRjaGVzQ0xQKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICAgIHJlcXVlc3RJZCxcbiAgICAgICAgICAgICAgb3BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBbaXNPcmlnaW5hbE1hdGNoZWQsIGlzQ3VycmVudE1hdGNoZWRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICAgICAgICBvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSxcbiAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgICAgICAgICdPcmlnaW5hbCAlaiB8IEN1cnJlbnQgJWogfCBNYXRjaDogJXMsICVzLCAlcywgJXMgfCBRdWVyeTogJXMnLFxuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkLFxuICAgICAgICAgICAgICBpc09yaWdpbmFsTWF0Y2hlZCxcbiAgICAgICAgICAgICAgaXNDdXJyZW50TWF0Y2hlZCxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLmhhc2hcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvLyBEZWNpZGUgZXZlbnQgdHlwZVxuICAgICAgICAgICAgbGV0IHR5cGU7XG4gICAgICAgICAgICBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICB0eXBlID0gJ3VwZGF0ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzT3JpZ2luYWxNYXRjaGVkICYmICFpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAnbGVhdmUnO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghaXNPcmlnaW5hbE1hdGNoZWQgJiYgaXNDdXJyZW50TWF0Y2hlZCkge1xuICAgICAgICAgICAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnZW50ZXInO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHR5cGUgPSAnY3JlYXRlJztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXMgPSB7XG4gICAgICAgICAgICAgIGV2ZW50OiB0eXBlLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogY3VycmVudFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBvcmlnaW5hbDogb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIHNlbmRFdmVudDogdHJ1ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdhZnRlckV2ZW50JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICAgICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICAgICAgICBpZiAocmVzLm9iamVjdCkge1xuICAgICAgICAgICAgICAgIHJlcy5vYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ocmVzLm9iamVjdCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCkge1xuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub3JpZ2luYWwpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYWZ0ZXJFdmVudC4ke2NsYXNzTmFtZX1gLCByZXMsIGF1dGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFyZXMuc2VuZEV2ZW50KSB7XG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChyZXMub2JqZWN0ICYmIHR5cGVvZiByZXMub2JqZWN0LnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhyZXMub2JqZWN0LCByZXMub2JqZWN0LmNsYXNzTmFtZSB8fCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vcmlnaW5hbCAmJiB0eXBlb2YgcmVzLm9yaWdpbmFsLnRvSlNPTiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICBvcmlnaW5hbFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMoXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLFxuICAgICAgICAgICAgICAgIHJlcy5vcmlnaW5hbC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBhd2FpdCB0aGlzLl9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIHJlcyxcbiAgICAgICAgICAgICAgY2xpZW50LFxuICAgICAgICAgICAgICByZXF1ZXN0SWQsXG4gICAgICAgICAgICAgIG9wLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24ucXVlcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCBjdXJyZW50UGFyc2VPYmplY3QsIG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KHBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbChzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIGFzeW5jIF9maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogP2FueSxcbiAgICByZXM6IGFueSxcbiAgICBjbGllbnQ6IGFueSxcbiAgICByZXF1ZXN0SWQ6IG51bWJlcixcbiAgICBvcDogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnlcbiAgKSB7XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgY2xpZW50QXV0aDtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBjb25zdCB7IHVzZXJJZCwgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuKTtcbiAgICAgIGlmICh1c2VySWQpIHtcbiAgICAgICAgYWNsR3JvdXAucHVzaCh1c2VySWQpO1xuICAgICAgfVxuICAgICAgY2xpZW50QXV0aCA9IGF1dGg7XG4gICAgfVxuICAgIGNvbnN0IGZpbHRlciA9IG9iaiA9PiB7XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBsZXQgcHJvdGVjdGVkRmllbGRzID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zPy5wcm90ZWN0ZWRGaWVsZHMgfHwgW107XG4gICAgICBpZiAoIWNsaWVudC5oYXNNYXN0ZXJLZXkgJiYgIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSBnZXREYXRhYmFzZUNvbnRyb2xsZXIodGhpcy5jb25maWcpLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgICAgcXVlcnksXG4gICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgY2xpZW50QXV0aFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuIERhdGFiYXNlQ29udHJvbGxlci5maWx0ZXJTZW5zaXRpdmVEYXRhKFxuICAgICAgICBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgY2xpZW50QXV0aCxcbiAgICAgICAgb3AsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgcmVzLm9iamVjdC5jbGFzc05hbWUsXG4gICAgICAgIHByb3RlY3RlZEZpZWxkcyxcbiAgICAgICAgb2JqLFxuICAgICAgICBxdWVyeVxuICAgICAgKTtcbiAgICB9O1xuICAgIHJlcy5vYmplY3QgPSBmaWx0ZXIocmVzLm9iamVjdCk7XG4gICAgcmVzLm9yaWdpbmFsID0gZmlsdGVyKHJlcy5vcmlnaW5hbCk7XG4gIH1cblxuICBfZ2V0Q0xQT3BlcmF0aW9uKHF1ZXJ5OiBhbnkpIHtcbiAgICByZXR1cm4gdHlwZW9mIHF1ZXJ5ID09PSAnb2JqZWN0JyAmJlxuICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmxlbmd0aCA9PSAxICYmXG4gICAgICB0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICA/ICdnZXQnXG4gICAgICA6ICdmaW5kJztcbiAgfVxuXG4gIGFzeW5jIF92ZXJpZnlBQ0woYWNsOiBhbnksIHRva2VuOiBzdHJpbmcpIHtcbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3QgeyBhdXRoLCB1c2VySWQgfSA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZvclNlc3Npb25Ub2tlbih0b2tlbik7XG5cbiAgICAvLyBHZXR0aW5nIHRoZSBzZXNzaW9uIHRva2VuIGZhaWxlZFxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBubyBhZGRpdGlvbmFsIGF1dGggaXMgYXZhaWxhYmxlXG4gICAgLy8gQXQgdGhpcyBwb2ludCwganVzdCBiYWlsIG91dCBhcyBubyBhZGRpdGlvbmFsIHZpc2liaWxpdHkgY2FuIGJlIGluZmVycmVkLlxuICAgIGlmICghYXV0aCB8fCAhdXNlcklkKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCA9IGFjbC5nZXRSZWFkQWNjZXNzKHVzZXJJZCk7XG4gICAgaWYgKGlzU3Vic2NyaXB0aW9uU2Vzc2lvblRva2VuTWF0Y2hlZCkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgdGhlIHVzZXIgaGFzIGFueSByb2xlcyB0aGF0IG1hdGNoIHRoZSBBQ0xcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgLy8gUmVzb2x2ZSBmYWxzZSByaWdodCBhd2F5IGlmIHRoZSBhY2wgZG9lc24ndCBoYXZlIGFueSByb2xlc1xuICAgICAgICBjb25zdCBhY2xfaGFzX3JvbGVzID0gT2JqZWN0LmtleXMoYWNsLnBlcm1pc3Npb25zQnlJZCkuc29tZShrZXkgPT4ga2V5LnN0YXJ0c1dpdGgoJ3JvbGU6JykpO1xuICAgICAgICBpZiAoIWFjbF9oYXNfcm9sZXMpIHtcbiAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByb2xlTmFtZXMgPSBhd2FpdCBhdXRoLmdldFVzZXJSb2xlcygpO1xuICAgICAgICAvLyBGaW5hbGx5LCBzZWUgaWYgYW55IG9mIHRoZSB1c2VyJ3Mgcm9sZXMgYWxsb3cgdGhlbSByZWFkIGFjY2Vzc1xuICAgICAgICBmb3IgKGNvbnN0IHJvbGUgb2Ygcm9sZU5hbWVzKSB7XG4gICAgICAgICAgLy8gV2UgdXNlIGdldFJlYWRBY2Nlc3MgYXMgYHJvbGVgIGlzIGluIHRoZSBmb3JtIGByb2xlOnJvbGVOYW1lYFxuICAgICAgICAgIGlmIChhY2wuZ2V0UmVhZEFjY2Vzcyhyb2xlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGdldEF1dGhGcm9tQ2xpZW50KGNsaWVudDogYW55LCByZXF1ZXN0SWQ6IG51bWJlciwgc2Vzc2lvblRva2VuOiBzdHJpbmcpIHtcbiAgICBjb25zdCBnZXRTZXNzaW9uRnJvbUNsaWVudCA9ICgpID0+IHtcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICByZXR1cm4gY2xpZW50LnNlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiB8fCBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgIH07XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHNlc3Npb25Ub2tlbiA9IGdldFNlc3Npb25Gcm9tQ2xpZW50KCk7XG4gICAgfVxuICAgIGlmICghc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgYXV0aCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHNlc3Npb25Ub2tlbik7XG4gICAgcmV0dXJuIGF1dGg7XG4gIH1cblxuICBhc3luYyBfbWF0Y2hlc0FDTChhY2w6IGFueSwgY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgLy8gUmV0dXJuIHRydWUgZGlyZWN0bHkgaWYgQUNMIGlzbid0IHByZXNlbnQsIEFDTCBpcyBwdWJsaWMgcmVhZCwgb3IgY2xpZW50IGhhcyBtYXN0ZXIga2V5XG4gICAgaWYgKCFhY2wgfHwgYWNsLmdldFB1YmxpY1JlYWRBY2Nlc3MoKSB8fCBjbGllbnQuaGFzTWFzdGVyS2V5KSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgc3Vic2NyaXB0aW9uIHNlc3Npb25Ub2tlbiBtYXRjaGVzIEFDTCBmaXJzdFxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25Ub2tlbiA9IHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuO1xuICAgIGNvbnN0IGNsaWVudFNlc3Npb25Ub2tlbiA9IGNsaWVudC5zZXNzaW9uVG9rZW47XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgc3Vic2NyaXB0aW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoYXdhaXQgdGhpcy5fdmVyaWZ5QUNMKGFjbCwgY2xpZW50U2Vzc2lvblRva2VuKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZUNvbm5lY3QocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICBpZiAoIXRoaXMuX3ZhbGlkYXRlS2V5cyhyZXF1ZXN0LCB0aGlzLmtleVBhaXJzKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgNCwgJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgbG9nZ2VyLmVycm9yKCdLZXkgaW4gcmVxdWVzdCBpcyBub3QgdmFsaWQnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgaGFzTWFzdGVyS2V5ID0gdGhpcy5faGFzTWFzdGVyS2V5KHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpO1xuICAgIGNvbnN0IGNsaWVudElkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgY2xpZW50ID0gbmV3IENsaWVudChcbiAgICAgIGNsaWVudElkLFxuICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICBoYXNNYXN0ZXJLZXksXG4gICAgICByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgIHJlcXVlc3QuaW5zdGFsbGF0aW9uSWRcbiAgICApO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCByZXEgPSB7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdjb25uZWN0JyxcbiAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgICBzZXNzaW9uVG9rZW46IHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiByZXF1ZXN0Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfTtcbiAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKCdAQ29ubmVjdCcsICdiZWZvcmVDb25uZWN0JywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXEuc2Vzc2lvblRva2VuKTtcbiAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgcmVxLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cbiAgICAgICAgYXdhaXQgcnVuVHJpZ2dlcih0cmlnZ2VyLCBgYmVmb3JlQ29ubmVjdC5AQ29ubmVjdGAsIHJlcSwgYXV0aCk7XG4gICAgICB9XG4gICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCA9IGNsaWVudElkO1xuICAgICAgdGhpcy5jbGllbnRzLnNldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgY2xpZW50KTtcbiAgICAgIGxvZ2dlci5pbmZvKGBDcmVhdGUgbmV3IGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNsaWVudC5wdXNoQ29ubmVjdCgpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyhyZXEpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlQ29ubmVjdCBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYXNNYXN0ZXJLZXkocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDAgfHwgIXZhbGlkS2V5UGFpcnMuaGFzKCdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBpZiAoIXJlcXVlc3QgfHwgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXF1ZXN0LCAnbWFzdGVyS2V5JykpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcXVlc3QubWFzdGVyS2V5ID09PSB2YWxpZEtleVBhaXJzLmdldCgnbWFzdGVyS2V5Jyk7XG4gIH1cblxuICBfdmFsaWRhdGVLZXlzKHJlcXVlc3Q6IGFueSwgdmFsaWRLZXlQYWlyczogYW55KTogYm9vbGVhbiB7XG4gICAgaWYgKCF2YWxpZEtleVBhaXJzIHx8IHZhbGlkS2V5UGFpcnMuc2l6ZSA9PSAwKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgbGV0IGlzVmFsaWQgPSBmYWxzZTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHNlY3JldF0gb2YgdmFsaWRLZXlQYWlycykge1xuICAgICAgaWYgKCFyZXF1ZXN0W2tleV0gfHwgcmVxdWVzdFtrZXldICE9PSBzZWNyZXQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpc1ZhbGlkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgICByZXR1cm4gaXNWYWxpZDtcbiAgfVxuXG4gIGFzeW5jIF9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgc3Vic2NyaWJpbmcnKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChwYXJzZVdlYnNvY2tldC5jbGllbnRJZCk7XG4gICAgY29uc3QgY2xhc3NOYW1lID0gcmVxdWVzdC5xdWVyeS5jbGFzc05hbWU7XG4gICAgbGV0IGF1dGhDYWxsZWQgPSBmYWxzZTtcbiAgICB0cnkge1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoY2xhc3NOYW1lLCAnYmVmb3JlU3Vic2NyaWJlJywgUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICBpZiAodHJpZ2dlcikge1xuICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChjbGllbnQsIHJlcXVlc3QucmVxdWVzdElkLCByZXF1ZXN0LnNlc3Npb25Ub2tlbik7XG4gICAgICAgIGF1dGhDYWxsZWQgPSB0cnVlO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXF1ZXN0LnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBwYXJzZVF1ZXJ5ID0gbmV3IFBhcnNlLlF1ZXJ5KGNsYXNzTmFtZSk7XG4gICAgICAgIHBhcnNlUXVlcnkud2l0aEpTT04ocmVxdWVzdC5xdWVyeSk7XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBwYXJzZVF1ZXJ5O1xuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVTdWJzY3JpYmUuJHtjbGFzc05hbWV9YCwgcmVxdWVzdCwgYXV0aCk7XG5cbiAgICAgICAgY29uc3QgcXVlcnkgPSByZXF1ZXN0LnF1ZXJ5LnRvSlNPTigpO1xuICAgICAgICBpZiAocXVlcnkua2V5cykge1xuICAgICAgICAgIHF1ZXJ5LmZpZWxkcyA9IHF1ZXJ5LmtleXMuc3BsaXQoJywnKTtcbiAgICAgICAgfVxuICAgICAgICByZXF1ZXN0LnF1ZXJ5ID0gcXVlcnk7XG4gICAgICB9XG5cbiAgICAgIGlmIChjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicpIHtcbiAgICAgICAgaWYgKCFhdXRoQ2FsbGVkKSB7XG4gICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoXG4gICAgICAgICAgICBjbGllbnQsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZCxcbiAgICAgICAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlcXVlc3QudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QucXVlcnkud2hlcmUudXNlciA9IHJlcXVlc3QudXNlci50b1BvaW50ZXIoKTtcbiAgICAgICAgfSBlbHNlIGlmICghcmVxdWVzdC5tYXN0ZXIpIHtcbiAgICAgICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgcmVxdWVzdC5yZXF1ZXN0SWRcbiAgICAgICAgICApO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gR2V0IHN1YnNjcmlwdGlvbiBmcm9tIHN1YnNjcmlwdGlvbnMsIGNyZWF0ZSBvbmUgaWYgbmVjZXNzYXJ5XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25IYXNoID0gcXVlcnlIYXNoKHJlcXVlc3QucXVlcnkpO1xuICAgICAgLy8gQWRkIGNsYXNzTmFtZSB0byBzdWJzY3JpcHRpb25zIGlmIG5lY2Vzc2FyeVxuXG4gICAgICBpZiAoIXRoaXMuc3Vic2NyaXB0aW9ucy5oYXMoY2xhc3NOYW1lKSkge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuc2V0KGNsYXNzTmFtZSwgbmV3IE1hcCgpKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICAgIGxldCBzdWJzY3JpcHRpb247XG4gICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLmhhcyhzdWJzY3JpcHRpb25IYXNoKSkge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBjbGFzc1N1YnNjcmlwdGlvbnMuZ2V0KHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uID0gbmV3IFN1YnNjcmlwdGlvbihjbGFzc05hbWUsIHJlcXVlc3QucXVlcnkud2hlcmUsIHN1YnNjcmlwdGlvbkhhc2gpO1xuICAgICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuc2V0KHN1YnNjcmlwdGlvbkhhc2gsIHN1YnNjcmlwdGlvbik7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkZCBzdWJzY3JpcHRpb25JbmZvIHRvIGNsaWVudFxuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IHtcbiAgICAgICAgc3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb24sXG4gICAgICB9O1xuICAgICAgLy8gQWRkIHNlbGVjdGVkIGZpZWxkcywgc2Vzc2lvblRva2VuIGFuZCBpbnN0YWxsYXRpb25JZCBmb3IgdGhpcyBzdWJzY3JpcHRpb24gaWYgbmVjZXNzYXJ5XG4gICAgICBpZiAocmVxdWVzdC5xdWVyeS5maWVsZHMpIHtcbiAgICAgICAgc3Vic2NyaXB0aW9uSW5mby5maWVsZHMgPSByZXF1ZXN0LnF1ZXJ5LmZpZWxkcztcbiAgICAgIH1cbiAgICAgIGlmIChyZXF1ZXN0LnNlc3Npb25Ub2tlbikge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbiA9IHJlcXVlc3Quc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgY2xpZW50LmFkZFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdC5yZXF1ZXN0SWQsIHN1YnNjcmlwdGlvbkluZm8pO1xuXG4gICAgICAvLyBBZGQgY2xpZW50SWQgdG8gc3Vic2NyaXB0aW9uXG4gICAgICBzdWJzY3JpcHRpb24uYWRkQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0LnJlcXVlc3RJZCk7XG5cbiAgICAgIGNsaWVudC5wdXNoU3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICAgIGBDcmVhdGUgY2xpZW50ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IG5ldyBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICAgKTtcbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXI6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGNsaWVudCxcbiAgICAgICAgZXZlbnQ6ICdzdWJzY3JpYmUnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgZXJyb3IuY29kZSwgZXJyb3IubWVzc2FnZSwgZmFsc2UsIHJlcXVlc3QucmVxdWVzdElkKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGJlZm9yZVN1YnNjcmliZSBvbiAke2NsYXNzTmFtZX0gZm9yIHNlc3Npb24gJHtyZXF1ZXN0LnNlc3Npb25Ub2tlbn0gd2l0aDpcXG4gRXJyb3I6IGAgK1xuICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGVycm9yKVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBfaGFuZGxlVXBkYXRlU3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSk6IGFueSB7XG4gICAgdGhpcy5faGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QsIGZhbHNlKTtcbiAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICB9XG5cbiAgX2hhbmRsZVVuc3Vic2NyaWJlKHBhcnNlV2Vic29ja2V0OiBhbnksIHJlcXVlc3Q6IGFueSwgbm90aWZ5Q2xpZW50OiBib29sZWFuID0gdHJ1ZSk6IGFueSB7XG4gICAgLy8gSWYgd2UgY2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCByZXR1cm4gZXJyb3IgdG8gY2xpZW50XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwocGFyc2VXZWJzb2NrZXQsICdjbGllbnRJZCcpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcnXG4gICAgICApO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCByZXF1ZXN0SWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBpZiAodHlwZW9mIGNsaWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgY2xpZW50IHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcuIE1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKCdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQgJyArIHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0gY2xpZW50LmdldFN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKFxuICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgMixcbiAgICAgICAgJ0Nhbm5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBzdWJzY3JpYmUgdG8gbGl2ZSBxdWVyeSBzZXJ2ZXIgYmVmb3JlIHVuc3Vic2NyaWJpbmcuJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCBzdWJzY3JpcHRpb24gd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJyBzdWJzY3JpcHRpb25JZCAnICtcbiAgICAgICAgICByZXF1ZXN0SWRcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIHN1YnNjcmlwdGlvbiBmcm9tIGNsaWVudFxuICAgIGNsaWVudC5kZWxldGVTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgLy8gUmVtb3ZlIGNsaWVudCBmcm9tIHN1YnNjcmlwdGlvblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IHN1YnNjcmlwdGlvbkluZm8uc3Vic2NyaXB0aW9uO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHN1YnNjcmlwdGlvbi5jbGFzc05hbWU7XG4gICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldC5jbGllbnRJZCwgcmVxdWVzdElkKTtcbiAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICBjb25zdCBjbGFzc1N1YnNjcmlwdGlvbnMgPSB0aGlzLnN1YnNjcmlwdGlvbnMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgY2xhc3NTdWJzY3JpcHRpb25zLmRlbGV0ZShzdWJzY3JpcHRpb24uaGFzaCk7XG4gICAgfVxuICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuc2l6ZSA9PT0gMCkge1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zLmRlbGV0ZShjbGFzc05hbWUpO1xuICAgIH1cbiAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgIGNsaWVudCxcbiAgICAgIGV2ZW50OiAndW5zdWJzY3JpYmUnLFxuICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgIHNlc3Npb25Ub2tlbjogc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB1c2VNYXN0ZXJLZXk6IGNsaWVudC5oYXNNYXN0ZXJLZXksXG4gICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgaWYgKCFub3RpZnlDbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjbGllbnQucHVzaFVuc3Vic2NyaWJlKHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgIGxvZ2dlci52ZXJib3NlKFxuICAgICAgYERlbGV0ZSBjbGllbnQ6ICR7cGFyc2VXZWJzb2NrZXQuY2xpZW50SWR9IHwgc3Vic2NyaXB0aW9uOiAke3JlcXVlc3QucmVxdWVzdElkfWBcbiAgICApO1xuICB9XG59XG5cbmV4cG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFPQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUVBLE1BQU1BLG9CQUFOLENBQTJCO0VBRXpCO0VBSUE7RUFHQUMsV0FBVyxDQUFDQyxNQUFELEVBQWNDLE1BQVcsR0FBRyxFQUE1QixFQUFnQ0MsaUJBQXNCLEdBQUcs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