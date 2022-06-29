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

            if ((deletedParseObject.className === '_User' || deletedParseObject.className === '_Session') && !client.hasMasterKey) {
              delete deletedParseObject.sessionToken;
              delete deletedParseObject.authData;
            }

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

            if ((currentParseObject.className === '_User' || currentParseObject.className === '_Session') && !client.hasMasterKey) {
              var _originalParseObject, _originalParseObject2;

              delete currentParseObject.sessionToken;
              (_originalParseObject = originalParseObject) === null || _originalParseObject === void 0 ? true : delete _originalParseObject.sessionToken;
              delete currentParseObject.authData;
              (_originalParseObject2 = originalParseObject) === null || _originalParseObject2 === void 0 ? true : delete _originalParseObject2.authData;
            }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZUxpdmVRdWVyeVNlcnZlciIsImNvbnN0cnVjdG9yIiwic2VydmVyIiwiY29uZmlnIiwicGFyc2VTZXJ2ZXJDb25maWciLCJjbGllbnRzIiwiTWFwIiwic3Vic2NyaXB0aW9ucyIsImFwcElkIiwiUGFyc2UiLCJhcHBsaWNhdGlvbklkIiwibWFzdGVyS2V5Iiwia2V5UGFpcnMiLCJrZXkiLCJPYmplY3QiLCJrZXlzIiwic2V0IiwibG9nZ2VyIiwidmVyYm9zZSIsImRpc2FibGVTaW5nbGVJbnN0YW5jZSIsInNlcnZlclVSTCIsImluaXRpYWxpemUiLCJqYXZhU2NyaXB0S2V5IiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiY2FjaGVUaW1lb3V0IiwiYXV0aENhY2hlIiwiTFJVIiwibWF4IiwibWF4QWdlIiwicGFyc2VXZWJTb2NrZXRTZXJ2ZXIiLCJQYXJzZVdlYlNvY2tldFNlcnZlciIsInBhcnNlV2Vic29ja2V0IiwiX29uQ29ubmVjdCIsInN1YnNjcmliZXIiLCJQYXJzZVB1YlN1YiIsImNyZWF0ZVN1YnNjcmliZXIiLCJzdWJzY3JpYmUiLCJvbiIsImNoYW5uZWwiLCJtZXNzYWdlU3RyIiwibWVzc2FnZSIsIkpTT04iLCJwYXJzZSIsImUiLCJlcnJvciIsIl9pbmZsYXRlUGFyc2VPYmplY3QiLCJfb25BZnRlclNhdmUiLCJfb25BZnRlckRlbGV0ZSIsImN1cnJlbnRQYXJzZU9iamVjdCIsIlVzZXJSb3V0ZXIiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwiY2xhc3NOYW1lIiwicGFyc2VPYmplY3QiLCJfZmluaXNoRmV0Y2giLCJvcmlnaW5hbFBhcnNlT2JqZWN0IiwiZGVsZXRlZFBhcnNlT2JqZWN0IiwidG9KU09OIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaWQiLCJzaXplIiwiY2xhc3NTdWJzY3JpcHRpb25zIiwiZ2V0IiwiZGVidWciLCJzdWJzY3JpcHRpb24iLCJ2YWx1ZXMiLCJpc1N1YnNjcmlwdGlvbk1hdGNoZWQiLCJfbWF0Y2hlc1N1YnNjcmlwdGlvbiIsImNsaWVudElkIiwicmVxdWVzdElkcyIsIl8iLCJlbnRyaWVzIiwiY2xpZW50UmVxdWVzdElkcyIsImNsaWVudCIsImZvckVhY2giLCJyZXF1ZXN0SWQiLCJhY2wiLCJnZXRBQ0wiLCJvcCIsIl9nZXRDTFBPcGVyYXRpb24iLCJxdWVyeSIsInJlcyIsIl9tYXRjaGVzQ0xQIiwiaXNNYXRjaGVkIiwiX21hdGNoZXNBQ0wiLCJldmVudCIsInNlc3Npb25Ub2tlbiIsIm9iamVjdCIsInVzZU1hc3RlcktleSIsImhhc01hc3RlcktleSIsImluc3RhbGxhdGlvbklkIiwic2VuZEV2ZW50IiwidHJpZ2dlciIsImdldFRyaWdnZXIiLCJhdXRoIiwiZ2V0QXV0aEZyb21DbGllbnQiLCJ1c2VyIiwiZnJvbUpTT04iLCJydW5UcmlnZ2VyIiwidG9KU09Od2l0aE9iamVjdHMiLCJhdXRoRGF0YSIsInB1c2hEZWxldGUiLCJyZXNvbHZlRXJyb3IiLCJDbGllbnQiLCJwdXNoRXJyb3IiLCJwYXJzZVdlYlNvY2tldCIsImNvZGUiLCJzdHJpbmdpZnkiLCJpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCIsImlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQiLCJvcmlnaW5hbEFDTENoZWNraW5nUHJvbWlzZSIsIlByb21pc2UiLCJyZXNvbHZlIiwib3JpZ2luYWxBQ0wiLCJjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlIiwiY3VycmVudEFDTCIsImlzT3JpZ2luYWxNYXRjaGVkIiwiaXNDdXJyZW50TWF0Y2hlZCIsImFsbCIsImhhc2giLCJ0eXBlIiwib3JpZ2luYWwiLCJmdW5jdGlvbk5hbWUiLCJjaGFyQXQiLCJ0b1VwcGVyQ2FzZSIsInNsaWNlIiwicmVxdWVzdCIsInR2NCIsInZhbGlkYXRlIiwiUmVxdWVzdFNjaGVtYSIsIl9oYW5kbGVDb25uZWN0IiwiX2hhbmRsZVN1YnNjcmliZSIsIl9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24iLCJfaGFuZGxlVW5zdWJzY3JpYmUiLCJpbmZvIiwiaGFzIiwicnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyIsImRlbGV0ZSIsInN1YnNjcmlwdGlvbkluZm8iLCJzdWJzY3JpcHRpb25JbmZvcyIsImRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbiIsImhhc1N1YnNjcmliaW5nQ2xpZW50IiwibWF0Y2hlc1F1ZXJ5IiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsImZyb21DYWNoZSIsImF1dGhQcm9taXNlIiwidGhlbiIsInVzZXJJZCIsImNhdGNoIiwicmVzdWx0IiwiRXJyb3IiLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJkZWwiLCJnZXRTdWJzY3JpcHRpb25JbmZvIiwiYWNsR3JvdXAiLCJwdXNoIiwiU2NoZW1hQ29udHJvbGxlciIsInZhbGlkYXRlUGVybWlzc2lvbiIsImxlbmd0aCIsIm9iamVjdElkIiwiX3ZlcmlmeUFDTCIsInRva2VuIiwiaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkIiwiZ2V0UmVhZEFjY2VzcyIsImFjbF9oYXNfcm9sZXMiLCJwZXJtaXNzaW9uc0J5SWQiLCJzb21lIiwic3RhcnRzV2l0aCIsInJvbGVOYW1lcyIsImdldFVzZXJSb2xlcyIsInJvbGUiLCJnZXRTZXNzaW9uRnJvbUNsaWVudCIsImdldFB1YmxpY1JlYWRBY2Nlc3MiLCJzdWJzY3JpcHRpb25Ub2tlbiIsImNsaWVudFNlc3Npb25Ub2tlbiIsIl92YWxpZGF0ZUtleXMiLCJfaGFzTWFzdGVyS2V5IiwidXVpZHY0IiwicmVxIiwicHVzaENvbm5lY3QiLCJ2YWxpZEtleVBhaXJzIiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaXNWYWxpZCIsInNlY3JldCIsImF1dGhDYWxsZWQiLCJwYXJzZVF1ZXJ5IiwiUXVlcnkiLCJ3aXRoSlNPTiIsImZpZWxkcyIsInNwbGl0Iiwid2hlcmUiLCJ0b1BvaW50ZXIiLCJtYXN0ZXIiLCJzdWJzY3JpcHRpb25IYXNoIiwicXVlcnlIYXNoIiwiU3Vic2NyaXB0aW9uIiwiYWRkU3Vic2NyaXB0aW9uSW5mbyIsImFkZENsaWVudFN1YnNjcmlwdGlvbiIsInB1c2hTdWJzY3JpYmUiLCJub3RpZnlDbGllbnQiLCJkZWxldGVTdWJzY3JpcHRpb25JbmZvIiwicHVzaFVuc3Vic2NyaWJlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHY0IGZyb20gJ3R2NCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgeyBTdWJzY3JpcHRpb24gfSBmcm9tICcuL1N1YnNjcmlwdGlvbic7XG5pbXBvcnQgeyBDbGllbnQgfSBmcm9tICcuL0NsaWVudCc7XG5pbXBvcnQgeyBQYXJzZVdlYlNvY2tldFNlcnZlciB9IGZyb20gJy4vUGFyc2VXZWJTb2NrZXRTZXJ2ZXInO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IFJlcXVlc3RTY2hlbWEgZnJvbSAnLi9SZXF1ZXN0U2NoZW1hJztcbmltcG9ydCB7IG1hdGNoZXNRdWVyeSwgcXVlcnlIYXNoIH0gZnJvbSAnLi9RdWVyeVRvb2xzJztcbmltcG9ydCB7IFBhcnNlUHViU3ViIH0gZnJvbSAnLi9QYXJzZVB1YlN1Yic7XG5pbXBvcnQgU2NoZW1hQ29udHJvbGxlciBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcbmltcG9ydCB7IHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMsIGdldFRyaWdnZXIsIHJ1blRyaWdnZXIsIHJlc29sdmVFcnJvciwgdG9KU09Od2l0aE9iamVjdHMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLCBBdXRoIH0gZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgeyBnZXRDYWNoZUNvbnRyb2xsZXIgfSBmcm9tICcuLi9Db250cm9sbGVycyc7XG5pbXBvcnQgTFJVIGZyb20gJ2xydS1jYWNoZSc7XG5pbXBvcnQgVXNlclJvdXRlciBmcm9tICcuLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcblxuY2xhc3MgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIge1xuICBjbGllbnRzOiBNYXA7XG4gIC8vIGNsYXNzTmFtZSAtPiAocXVlcnlIYXNoIC0+IHN1YnNjcmlwdGlvbilcbiAgc3Vic2NyaXB0aW9uczogT2JqZWN0O1xuICBwYXJzZVdlYlNvY2tldFNlcnZlcjogT2JqZWN0O1xuICBrZXlQYWlyczogYW55O1xuICAvLyBUaGUgc3Vic2NyaWJlciB3ZSB1c2UgdG8gZ2V0IG9iamVjdCB1cGRhdGUgZnJvbSBwdWJsaXNoZXJcbiAgc3Vic2NyaWJlcjogT2JqZWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNlcnZlcjogYW55LCBjb25maWc6IGFueSA9IHt9LCBwYXJzZVNlcnZlckNvbmZpZzogYW55ID0ge30pIHtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcbiAgICB0aGlzLmNsaWVudHMgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5zdWJzY3JpcHRpb25zID0gbmV3IE1hcCgpO1xuICAgIHRoaXMuY29uZmlnID0gY29uZmlnO1xuXG4gICAgY29uZmlnLmFwcElkID0gY29uZmlnLmFwcElkIHx8IFBhcnNlLmFwcGxpY2F0aW9uSWQ7XG4gICAgY29uZmlnLm1hc3RlcktleSA9IGNvbmZpZy5tYXN0ZXJLZXkgfHwgUGFyc2UubWFzdGVyS2V5O1xuXG4gICAgLy8gU3RvcmUga2V5cywgY29udmVydCBvYmogdG8gbWFwXG4gICAgY29uc3Qga2V5UGFpcnMgPSBjb25maWcua2V5UGFpcnMgfHwge307XG4gICAgdGhpcy5rZXlQYWlycyA9IG5ldyBNYXAoKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhrZXlQYWlycykpIHtcbiAgICAgIHRoaXMua2V5UGFpcnMuc2V0KGtleSwga2V5UGFpcnNba2V5XSk7XG4gICAgfVxuICAgIGxvZ2dlci52ZXJib3NlKCdTdXBwb3J0IGtleSBwYWlycycsIHRoaXMua2V5UGFpcnMpO1xuXG4gICAgLy8gSW5pdGlhbGl6ZSBQYXJzZVxuICAgIFBhcnNlLk9iamVjdC5kaXNhYmxlU2luZ2xlSW5zdGFuY2UoKTtcbiAgICBjb25zdCBzZXJ2ZXJVUkwgPSBjb25maWcuc2VydmVyVVJMIHx8IFBhcnNlLnNlcnZlclVSTDtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShjb25maWcuYXBwSWQsIFBhcnNlLmphdmFTY3JpcHRLZXksIGNvbmZpZy5tYXN0ZXJLZXkpO1xuXG4gICAgLy8gVGhlIGNhY2hlIGNvbnRyb2xsZXIgaXMgYSBwcm9wZXIgY2FjaGUgY29udHJvbGxlclxuICAgIC8vIHdpdGggYWNjZXNzIHRvIFVzZXIgYW5kIFJvbGVzXG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIocGFyc2VTZXJ2ZXJDb25maWcpO1xuXG4gICAgY29uZmlnLmNhY2hlVGltZW91dCA9IGNvbmZpZy5jYWNoZVRpbWVvdXQgfHwgNSAqIDEwMDA7IC8vIDVzXG5cbiAgICAvLyBUaGlzIGF1dGggY2FjaGUgc3RvcmVzIHRoZSBwcm9taXNlcyBmb3IgZWFjaCBhdXRoIHJlc29sdXRpb24uXG4gICAgLy8gVGhlIG1haW4gYmVuZWZpdCBpcyB0byBiZSBhYmxlIHRvIHJldXNlIHRoZSBzYW1lIHVzZXIgLyBzZXNzaW9uIHRva2VuIHJlc29sdXRpb24uXG4gICAgdGhpcy5hdXRoQ2FjaGUgPSBuZXcgTFJVKHtcbiAgICAgIG1heDogNTAwLCAvLyA1MDAgY29uY3VycmVudFxuICAgICAgbWF4QWdlOiBjb25maWcuY2FjaGVUaW1lb3V0LFxuICAgIH0pO1xuICAgIC8vIEluaXRpYWxpemUgd2Vic29ja2V0IHNlcnZlclxuICAgIHRoaXMucGFyc2VXZWJTb2NrZXRTZXJ2ZXIgPSBuZXcgUGFyc2VXZWJTb2NrZXRTZXJ2ZXIoXG4gICAgICBzZXJ2ZXIsXG4gICAgICBwYXJzZVdlYnNvY2tldCA9PiB0aGlzLl9vbkNvbm5lY3QocGFyc2VXZWJzb2NrZXQpLFxuICAgICAgY29uZmlnXG4gICAgKTtcblxuICAgIC8vIEluaXRpYWxpemUgc3Vic2NyaWJlclxuICAgIHRoaXMuc3Vic2NyaWJlciA9IFBhcnNlUHViU3ViLmNyZWF0ZVN1YnNjcmliZXIoY29uZmlnKTtcbiAgICB0aGlzLnN1YnNjcmliZXIuc3Vic2NyaWJlKFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJTYXZlJyk7XG4gICAgdGhpcy5zdWJzY3JpYmVyLnN1YnNjcmliZShQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyRGVsZXRlJyk7XG4gICAgLy8gUmVnaXN0ZXIgbWVzc2FnZSBoYW5kbGVyIGZvciBzdWJzY3JpYmVyLiBXaGVuIHB1Ymxpc2hlciBnZXQgbWVzc2FnZXMsIGl0IHdpbGwgcHVibGlzaCBtZXNzYWdlXG4gICAgLy8gdG8gdGhlIHN1YnNjcmliZXJzIGFuZCB0aGUgaGFuZGxlciB3aWxsIGJlIGNhbGxlZC5cbiAgICB0aGlzLnN1YnNjcmliZXIub24oJ21lc3NhZ2UnLCAoY2hhbm5lbCwgbWVzc2FnZVN0cikgPT4ge1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ1N1YnNjcmliZSBtZXNzYWdlICVqJywgbWVzc2FnZVN0cik7XG4gICAgICBsZXQgbWVzc2FnZTtcbiAgICAgIHRyeSB7XG4gICAgICAgIG1lc3NhZ2UgPSBKU09OLnBhcnNlKG1lc3NhZ2VTdHIpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ3VuYWJsZSB0byBwYXJzZSBtZXNzYWdlJywgbWVzc2FnZVN0ciwgZSk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2luZmxhdGVQYXJzZU9iamVjdChtZXNzYWdlKTtcbiAgICAgIGlmIChjaGFubmVsID09PSBQYXJzZS5hcHBsaWNhdGlvbklkICsgJ2FmdGVyU2F2ZScpIHtcbiAgICAgICAgdGhpcy5fb25BZnRlclNhdmUobWVzc2FnZSk7XG4gICAgICB9IGVsc2UgaWYgKGNoYW5uZWwgPT09IFBhcnNlLmFwcGxpY2F0aW9uSWQgKyAnYWZ0ZXJEZWxldGUnKSB7XG4gICAgICAgIHRoaXMuX29uQWZ0ZXJEZWxldGUobWVzc2FnZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoJ0dldCBtZXNzYWdlICVzIGZyb20gdW5rbm93biBjaGFubmVsICVqJywgbWVzc2FnZSwgY2hhbm5lbCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBNZXNzYWdlIGlzIHRoZSBKU09OIG9iamVjdCBmcm9tIHB1Ymxpc2hlci4gTWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QgaXMgdGhlIFBhcnNlT2JqZWN0IEpTT04gYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdCBKU09OLlxuICBfaW5mbGF0ZVBhcnNlT2JqZWN0KG1lc3NhZ2U6IGFueSk6IHZvaWQge1xuICAgIC8vIEluZmxhdGUgbWVyZ2VkIG9iamVjdFxuICAgIGNvbnN0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0O1xuICAgIFVzZXJSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyhjdXJyZW50UGFyc2VPYmplY3QpO1xuICAgIGxldCBjbGFzc05hbWUgPSBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxldCBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICBwYXJzZU9iamVjdC5fZmluaXNoRmV0Y2goY3VycmVudFBhcnNlT2JqZWN0KTtcbiAgICBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIC8vIEluZmxhdGUgb3JpZ2luYWwgb2JqZWN0XG4gICAgY29uc3Qgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdDtcbiAgICBpZiAob3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgVXNlclJvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgY2xhc3NOYW1lID0gb3JpZ2luYWxQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgICBwYXJzZU9iamVjdCA9IG5ldyBQYXJzZS5PYmplY3QoY2xhc3NOYW1lKTtcbiAgICAgIHBhcnNlT2JqZWN0Ll9maW5pc2hGZXRjaChvcmlnaW5hbFBhcnNlT2JqZWN0KTtcbiAgICAgIG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCA9IHBhcnNlT2JqZWN0O1xuICAgIH1cbiAgfVxuXG4gIC8vIE1lc3NhZ2UgaXMgdGhlIEpTT04gb2JqZWN0IGZyb20gcHVibGlzaGVyIGFmdGVyIGluZmxhdGVkLiBNZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdCBpcyB0aGUgUGFyc2VPYmplY3QgYWZ0ZXIgY2hhbmdlcy5cbiAgLy8gTWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0IGlzIHRoZSBvcmlnaW5hbCBQYXJzZU9iamVjdC5cbiAgYXN5bmMgX29uQWZ0ZXJEZWxldGUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlckRlbGV0ZSBpcyB0cmlnZ2VyZWQnKTtcblxuICAgIGxldCBkZWxldGVkUGFyc2VPYmplY3QgPSBtZXNzYWdlLmN1cnJlbnRQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICBjb25zdCBjbGFzc0xldmVsUGVybWlzc2lvbnMgPSBtZXNzYWdlLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICBjb25zdCBjbGFzc05hbWUgPSBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDbGFzc05hbWU6ICVqIHwgT2JqZWN0SWQ6ICVzJywgY2xhc3NOYW1lLCBkZWxldGVkUGFyc2VPYmplY3QuaWQpO1xuICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudCBudW1iZXIgOiAlZCcsIHRoaXMuY2xpZW50cy5zaXplKTtcblxuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAodHlwZW9mIGNsYXNzU3Vic2NyaXB0aW9ucyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZygnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcyAnICsgY2xhc3NOYW1lKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzU3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oZGVsZXRlZFBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24pO1xuICAgICAgaWYgKCFpc1N1YnNjcmlwdGlvbk1hdGNoZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBmb3IgKGNvbnN0IFtjbGllbnRJZCwgcmVxdWVzdElkc10gb2YgXy5lbnRyaWVzKHN1YnNjcmlwdGlvbi5jbGllbnRSZXF1ZXN0SWRzKSkge1xuICAgICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbGllbnQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgICAgcmVxdWVzdElkcy5mb3JFYWNoKGFzeW5jIHJlcXVlc3RJZCA9PiB7XG4gICAgICAgICAgY29uc3QgYWNsID0gbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QuZ2V0QUNMKCk7XG4gICAgICAgICAgLy8gQ2hlY2sgQ0xQXG4gICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IGlzTWF0Y2hlZCA9IGF3YWl0IHRoaXMuX21hdGNoZXNBQ0woYWNsLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgICBpZiAoIWlzTWF0Y2hlZCkge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6ICdkZWxldGUnLFxuICAgICAgICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICAgICAgICAgIG9iamVjdDogZGVsZXRlZFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdElkKTtcbiAgICAgICAgICAgICAgaWYgKGF1dGggJiYgYXV0aC51c2VyKSB7XG4gICAgICAgICAgICAgICAgcmVzLnVzZXIgPSBhdXRoLnVzZXI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QpIHtcbiAgICAgICAgICAgICAgICByZXMub2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vYmplY3QpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGFmdGVyRXZlbnQuJHtjbGFzc05hbWV9YCwgcmVzLCBhdXRoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICghcmVzLnNlbmRFdmVudCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9iamVjdCAmJiB0eXBlb2YgcmVzLm9iamVjdC50b0pTT04gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgZGVsZXRlZFBhcnNlT2JqZWN0ID0gdG9KU09Od2l0aE9iamVjdHMocmVzLm9iamVjdCwgcmVzLm9iamVjdC5jbGFzc05hbWUgfHwgY2xhc3NOYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgKGRlbGV0ZWRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgfHxcbiAgICAgICAgICAgICAgICBkZWxldGVkUGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSAmJlxuICAgICAgICAgICAgICAhY2xpZW50Lmhhc01hc3RlcktleVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBkZWxldGVkUGFyc2VPYmplY3Quc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgZGVsZXRlZFBhcnNlT2JqZWN0LmF1dGhEYXRhO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2xpZW50LnB1c2hEZWxldGUocmVxdWVzdElkLCBkZWxldGVkUGFyc2VPYmplY3QpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gTWVzc2FnZSBpcyB0aGUgSlNPTiBvYmplY3QgZnJvbSBwdWJsaXNoZXIgYWZ0ZXIgaW5mbGF0ZWQuIE1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0IGlzIHRoZSBQYXJzZU9iamVjdCBhZnRlciBjaGFuZ2VzLlxuICAvLyBNZXNzYWdlLm9yaWdpbmFsUGFyc2VPYmplY3QgaXMgdGhlIG9yaWdpbmFsIFBhcnNlT2JqZWN0LlxuICBhc3luYyBfb25BZnRlclNhdmUobWVzc2FnZTogYW55KTogdm9pZCB7XG4gICAgbG9nZ2VyLnZlcmJvc2UoUGFyc2UuYXBwbGljYXRpb25JZCArICdhZnRlclNhdmUgaXMgdHJpZ2dlcmVkJyk7XG5cbiAgICBsZXQgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG51bGw7XG4gICAgaWYgKG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdCkge1xuICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCA9IG1lc3NhZ2Uub3JpZ2luYWxQYXJzZU9iamVjdC50b0pTT04oKTtcbiAgICB9XG4gICAgY29uc3QgY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gbWVzc2FnZS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgbGV0IGN1cnJlbnRQYXJzZU9iamVjdCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LnRvSlNPTigpO1xuICAgIGNvbnN0IGNsYXNzTmFtZSA9IGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWU7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0NsYXNzTmFtZTogJXMgfCBPYmplY3RJZDogJXMnLCBjbGFzc05hbWUsIGN1cnJlbnRQYXJzZU9iamVjdC5pZCk7XG4gICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlciA6ICVkJywgdGhpcy5jbGllbnRzLnNpemUpO1xuXG4gICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgIGlmICh0eXBlb2YgY2xhc3NTdWJzY3JpcHRpb25zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgbG9nZ2VyLmRlYnVnKCdDYW4gbm90IGZpbmQgc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzICcgKyBjbGFzc05hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IHN1YnNjcmlwdGlvbiBvZiBjbGFzc1N1YnNjcmlwdGlvbnMudmFsdWVzKCkpIHtcbiAgICAgIGNvbnN0IGlzT3JpZ2luYWxTdWJzY3JpcHRpb25NYXRjaGVkID0gdGhpcy5fbWF0Y2hlc1N1YnNjcmlwdGlvbihcbiAgICAgICAgb3JpZ2luYWxQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgY29uc3QgaXNDdXJyZW50U3Vic2NyaXB0aW9uTWF0Y2hlZCA9IHRoaXMuX21hdGNoZXNTdWJzY3JpcHRpb24oXG4gICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgc3Vic2NyaXB0aW9uXG4gICAgICApO1xuICAgICAgZm9yIChjb25zdCBbY2xpZW50SWQsIHJlcXVlc3RJZHNdIG9mIF8uZW50cmllcyhzdWJzY3JpcHRpb24uY2xpZW50UmVxdWVzdElkcykpIHtcbiAgICAgICAgY29uc3QgY2xpZW50ID0gdGhpcy5jbGllbnRzLmdldChjbGllbnRJZCk7XG4gICAgICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3RJZHMuZm9yRWFjaChhc3luYyByZXF1ZXN0SWQgPT4ge1xuICAgICAgICAgIC8vIFNldCBvcmlnbmFsIFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2U7XG4gICAgICAgICAgaWYgKCFpc09yaWdpbmFsU3Vic2NyaXB0aW9uTWF0Y2hlZCkge1xuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZXQgb3JpZ2luYWxBQ0w7XG4gICAgICAgICAgICBpZiAobWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMID0gbWVzc2FnZS5vcmlnaW5hbFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3JpZ2luYWxBQ0xDaGVja2luZ1Byb21pc2UgPSB0aGlzLl9tYXRjaGVzQUNMKG9yaWdpbmFsQUNMLCBjbGllbnQsIHJlcXVlc3RJZCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFNldCBjdXJyZW50IFBhcnNlT2JqZWN0IEFDTCBjaGVja2luZyBwcm9taXNlLCBpZiB0aGUgb2JqZWN0IGRvZXMgbm90IG1hdGNoXG4gICAgICAgICAgLy8gc3Vic2NyaXB0aW9uLCB3ZSBkbyBub3QgbmVlZCB0byBjaGVjayBBQ0xcbiAgICAgICAgICBsZXQgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZTtcbiAgICAgICAgICBsZXQgcmVzID0ge307XG4gICAgICAgICAgaWYgKCFpc0N1cnJlbnRTdWJzY3JpcHRpb25NYXRjaGVkKSB7XG4gICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEFDTCA9IG1lc3NhZ2UuY3VycmVudFBhcnNlT2JqZWN0LmdldEFDTCgpO1xuICAgICAgICAgICAgY3VycmVudEFDTENoZWNraW5nUHJvbWlzZSA9IHRoaXMuX21hdGNoZXNBQ0woY3VycmVudEFDTCwgY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgY29uc3Qgb3AgPSB0aGlzLl9nZXRDTFBPcGVyYXRpb24oc3Vic2NyaXB0aW9uLnF1ZXJ5KTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuX21hdGNoZXNDTFAoXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgbWVzc2FnZS5jdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgICAgcmVxdWVzdElkLFxuICAgICAgICAgICAgICBvcFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnN0IFtpc09yaWdpbmFsTWF0Y2hlZCwgaXNDdXJyZW50TWF0Y2hlZF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICAgICAgICAgIG9yaWdpbmFsQUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgICBjdXJyZW50QUNMQ2hlY2tpbmdQcm9taXNlLFxuICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgICAgICAgJ09yaWdpbmFsICVqIHwgQ3VycmVudCAlaiB8IE1hdGNoOiAlcywgJXMsICVzLCAlcyB8IFF1ZXJ5OiAlcycsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCxcbiAgICAgICAgICAgICAgaXNPcmlnaW5hbFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzQ3VycmVudFN1YnNjcmlwdGlvbk1hdGNoZWQsXG4gICAgICAgICAgICAgIGlzT3JpZ2luYWxNYXRjaGVkLFxuICAgICAgICAgICAgICBpc0N1cnJlbnRNYXRjaGVkLFxuICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uaGFzaFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8vIERlY2lkZSBldmVudCB0eXBlXG4gICAgICAgICAgICBsZXQgdHlwZTtcbiAgICAgICAgICAgIGlmIChpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSAndXBkYXRlJztcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNPcmlnaW5hbE1hdGNoZWQgJiYgIWlzQ3VycmVudE1hdGNoZWQpIHtcbiAgICAgICAgICAgICAgdHlwZSA9ICdsZWF2ZSc7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc09yaWdpbmFsTWF0Y2hlZCAmJiBpc0N1cnJlbnRNYXRjaGVkKSB7XG4gICAgICAgICAgICAgIGlmIChvcmlnaW5hbFBhcnNlT2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdlbnRlcic7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHlwZSA9ICdjcmVhdGUnO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJlcyA9IHtcbiAgICAgICAgICAgICAgZXZlbnQ6IHR5cGUsXG4gICAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogY2xpZW50LnNlc3Npb25Ub2tlbixcbiAgICAgICAgICAgICAgb2JqZWN0OiBjdXJyZW50UGFyc2VPYmplY3QsXG4gICAgICAgICAgICAgIG9yaWdpbmFsOiBvcmlnaW5hbFBhcnNlT2JqZWN0LFxuICAgICAgICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGNsaWVudC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgc2VuZEV2ZW50OiB0cnVlLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGNvbnN0IHRyaWdnZXIgPSBnZXRUcmlnZ2VyKGNsYXNzTmFtZSwgJ2FmdGVyRXZlbnQnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgICAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgICAgICAgIGlmIChyZXMub2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgcmVzLm9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihyZXMub2JqZWN0KTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsKSB7XG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKHJlcy5vcmlnaW5hbCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgY29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50LCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICAgICAgICByZXMudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBhZnRlckV2ZW50LiR7Y2xhc3NOYW1lfWAsIHJlcywgYXV0aCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoIXJlcy5zZW5kRXZlbnQpIHtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHJlcy5vYmplY3QgJiYgdHlwZW9mIHJlcy5vYmplY3QudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRQYXJzZU9iamVjdCA9IHRvSlNPTndpdGhPYmplY3RzKHJlcy5vYmplY3QsIHJlcy5vYmplY3QuY2xhc3NOYW1lIHx8IGNsYXNzTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAocmVzLm9yaWdpbmFsICYmIHR5cGVvZiByZXMub3JpZ2luYWwudG9KU09OID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgIG9yaWdpbmFsUGFyc2VPYmplY3QgPSB0b0pTT053aXRoT2JqZWN0cyhcbiAgICAgICAgICAgICAgICByZXMub3JpZ2luYWwsXG4gICAgICAgICAgICAgICAgcmVzLm9yaWdpbmFsLmNsYXNzTmFtZSB8fCBjbGFzc05hbWVcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgKGN1cnJlbnRQYXJzZU9iamVjdC5jbGFzc05hbWUgPT09ICdfVXNlcicgfHxcbiAgICAgICAgICAgICAgICBjdXJyZW50UGFyc2VPYmplY3QuY2xhc3NOYW1lID09PSAnX1Nlc3Npb24nKSAmJlxuICAgICAgICAgICAgICAhY2xpZW50Lmhhc01hc3RlcktleVxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIGRlbGV0ZSBjdXJyZW50UGFyc2VPYmplY3Quc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgb3JpZ2luYWxQYXJzZU9iamVjdD8uc2Vzc2lvblRva2VuO1xuICAgICAgICAgICAgICBkZWxldGUgY3VycmVudFBhcnNlT2JqZWN0LmF1dGhEYXRhO1xuICAgICAgICAgICAgICBkZWxldGUgb3JpZ2luYWxQYXJzZU9iamVjdD8uYXV0aERhdGE7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSAncHVzaCcgKyByZXMuZXZlbnQuY2hhckF0KDApLnRvVXBwZXJDYXNlKCkgKyByZXMuZXZlbnQuc2xpY2UoMSk7XG4gICAgICAgICAgICBpZiAoY2xpZW50W2Z1bmN0aW9uTmFtZV0pIHtcbiAgICAgICAgICAgICAgY2xpZW50W2Z1bmN0aW9uTmFtZV0ocmVxdWVzdElkLCBjdXJyZW50UGFyc2VPYmplY3QsIG9yaWdpbmFsUGFyc2VPYmplY3QpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yID0gcmVzb2x2ZUVycm9yKGUpO1xuICAgICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihjbGllbnQucGFyc2VXZWJTb2NrZXQsIGVycm9yLmNvZGUsIGVycm9yLm1lc3NhZ2UsIGZhbHNlLCByZXF1ZXN0SWQpO1xuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYWZ0ZXJMaXZlUXVlcnlFdmVudCBvbiBjbGFzcyAke2NsYXNzTmFtZX0gZm9yIGV2ZW50ICR7cmVzLmV2ZW50fSB3aXRoIHNlc3Npb24gJHtyZXMuc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgX29uQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55KTogdm9pZCB7XG4gICAgcGFyc2VXZWJzb2NrZXQub24oJ21lc3NhZ2UnLCByZXF1ZXN0ID0+IHtcbiAgICAgIGlmICh0eXBlb2YgcmVxdWVzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXF1ZXN0ID0gSlNPTi5wYXJzZShyZXF1ZXN0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcigndW5hYmxlIHRvIHBhcnNlIHJlcXVlc3QnLCByZXF1ZXN0LCBlKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdSZXF1ZXN0OiAlaicsIHJlcXVlc3QpO1xuXG4gICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgcmVxdWVzdCBpcyBhIHZhbGlkIHJlcXVlc3QsIHJldHVybiBlcnJvciBkaXJlY3RseSBpZiBub3RcbiAgICAgIGlmIChcbiAgICAgICAgIXR2NC52YWxpZGF0ZShyZXF1ZXN0LCBSZXF1ZXN0U2NoZW1hWydnZW5lcmFsJ10pIHx8XG4gICAgICAgICF0djQudmFsaWRhdGUocmVxdWVzdCwgUmVxdWVzdFNjaGVtYVtyZXF1ZXN0Lm9wXSlcbiAgICAgICkge1xuICAgICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCAxLCB0djQuZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIGxvZ2dlci5lcnJvcignQ29ubmVjdCBtZXNzYWdlIGVycm9yICVzJywgdHY0LmVycm9yLm1lc3NhZ2UpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAocmVxdWVzdC5vcCkge1xuICAgICAgICBjYXNlICdjb25uZWN0JzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVDb25uZWN0KHBhcnNlV2Vic29ja2V0LCByZXF1ZXN0KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVTdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQsIHJlcXVlc3QpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd1cGRhdGUnOlxuICAgICAgICAgIHRoaXMuX2hhbmRsZVVwZGF0ZVN1YnNjcmlwdGlvbihwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3Vuc3Vic2NyaWJlJzpcbiAgICAgICAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgQ2xpZW50LnB1c2hFcnJvcihwYXJzZVdlYnNvY2tldCwgMywgJ0dldCB1bmtub3duIG9wZXJhdGlvbicpO1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignR2V0IHVua25vd24gb3BlcmF0aW9uJywgcmVxdWVzdC5vcCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBwYXJzZVdlYnNvY2tldC5vbignZGlzY29ubmVjdCcsICgpID0+IHtcbiAgICAgIGxvZ2dlci5pbmZvKGBDbGllbnQgZGlzY29ubmVjdDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH1gKTtcbiAgICAgIGNvbnN0IGNsaWVudElkID0gcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQ7XG4gICAgICBpZiAoIXRoaXMuY2xpZW50cy5oYXMoY2xpZW50SWQpKSB7XG4gICAgICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdF9lcnJvcicsXG4gICAgICAgICAgY2xpZW50czogdGhpcy5jbGllbnRzLnNpemUsXG4gICAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgICAgZXJyb3I6IGBVbmFibGUgdG8gZmluZCBjbGllbnQgJHtjbGllbnRJZH1gLFxuICAgICAgICB9KTtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBDYW4gbm90IGZpbmQgY2xpZW50ICR7Y2xpZW50SWR9IG9uIGRpc2Nvbm5lY3RgKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBEZWxldGUgY2xpZW50XG4gICAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KGNsaWVudElkKTtcbiAgICAgIHRoaXMuY2xpZW50cy5kZWxldGUoY2xpZW50SWQpO1xuXG4gICAgICAvLyBEZWxldGUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgZm9yIChjb25zdCBbcmVxdWVzdElkLCBzdWJzY3JpcHRpb25JbmZvXSBvZiBfLmVudHJpZXMoY2xpZW50LnN1YnNjcmlwdGlvbkluZm9zKSkge1xuICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBzdWJzY3JpcHRpb25JbmZvLnN1YnNjcmlwdGlvbjtcbiAgICAgICAgc3Vic2NyaXB0aW9uLmRlbGV0ZUNsaWVudFN1YnNjcmlwdGlvbihjbGllbnRJZCwgcmVxdWVzdElkKTtcblxuICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBjbGllbnQgd2hpY2ggaXMgc3Vic2NyaWJpbmcgdGhpcyBzdWJzY3JpcHRpb24sIHJlbW92ZSBpdCBmcm9tIHN1YnNjcmlwdGlvbnNcbiAgICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChzdWJzY3JpcHRpb24uY2xhc3NOYW1lKTtcbiAgICAgICAgaWYgKCFzdWJzY3JpcHRpb24uaGFzU3Vic2NyaWJpbmdDbGllbnQoKSkge1xuICAgICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5kZWxldGUoc3Vic2NyaXB0aW9uLmhhc2gpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIHN1YnNjcmlwdGlvbnMgdW5kZXIgdGhpcyBjbGFzcywgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgICAgICBpZiAoY2xhc3NTdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5jbGFzc05hbWUpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGxvZ2dlci52ZXJib3NlKCdDdXJyZW50IGNsaWVudHMgJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBsb2dnZXIudmVyYm9zZSgnQ3VycmVudCBzdWJzY3JpcHRpb25zICVkJywgdGhpcy5zdWJzY3JpcHRpb25zLnNpemUpO1xuICAgICAgcnVuTGl2ZVF1ZXJ5RXZlbnRIYW5kbGVycyh7XG4gICAgICAgIGV2ZW50OiAnd3NfZGlzY29ubmVjdCcsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGNsaWVudC5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgZXZlbnQ6ICd3c19jb25uZWN0JyxcbiAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgfSk7XG4gIH1cblxuICBfbWF0Y2hlc1N1YnNjcmlwdGlvbihwYXJzZU9iamVjdDogYW55LCBzdWJzY3JpcHRpb246IGFueSk6IGJvb2xlYW4ge1xuICAgIC8vIE9iamVjdCBpcyB1bmRlZmluZWQgb3IgbnVsbCwgbm90IG1hdGNoXG4gICAgaWYgKCFwYXJzZU9iamVjdCkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gbWF0Y2hlc1F1ZXJ5KHBhcnNlT2JqZWN0LCBzdWJzY3JpcHRpb24ucXVlcnkpO1xuICB9XG5cbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbihzZXNzaW9uVG9rZW46ID9zdHJpbmcpOiBQcm9taXNlPHsgYXV0aDogP0F1dGgsIHVzZXJJZDogP3N0cmluZyB9PiB7XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgIH1cbiAgICBjb25zdCBmcm9tQ2FjaGUgPSB0aGlzLmF1dGhDYWNoZS5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAoZnJvbUNhY2hlKSB7XG4gICAgICByZXR1cm4gZnJvbUNhY2hlO1xuICAgIH1cbiAgICBjb25zdCBhdXRoUHJvbWlzZSA9IGdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgY2FjaGVDb250cm9sbGVyOiB0aGlzLmNhY2hlQ29udHJvbGxlcixcbiAgICAgIHNlc3Npb25Ub2tlbjogc2Vzc2lvblRva2VuLFxuICAgIH0pXG4gICAgICAudGhlbihhdXRoID0+IHtcbiAgICAgICAgcmV0dXJuIHsgYXV0aCwgdXNlcklkOiBhdXRoICYmIGF1dGgudXNlciAmJiBhdXRoLnVzZXIuaWQgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBUaGVyZSB3YXMgYW4gZXJyb3Igd2l0aCB0aGUgc2Vzc2lvbiB0b2tlblxuICAgICAgICBjb25zdCByZXN1bHQgPSB7fTtcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTikge1xuICAgICAgICAgIHJlc3VsdC5lcnJvciA9IGVycm9yO1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLnNldChzZXNzaW9uVG9rZW4sIFByb21pc2UucmVzb2x2ZShyZXN1bHQpLCB0aGlzLmNvbmZpZy5jYWNoZVRpbWVvdXQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMuYXV0aENhY2hlLmRlbChzZXNzaW9uVG9rZW4pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9KTtcbiAgICB0aGlzLmF1dGhDYWNoZS5zZXQoc2Vzc2lvblRva2VuLCBhdXRoUHJvbWlzZSk7XG4gICAgcmV0dXJuIGF1dGhQcm9taXNlO1xuICB9XG5cbiAgYXN5bmMgX21hdGNoZXNDTFAoXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiA/YW55LFxuICAgIG9iamVjdDogYW55LFxuICAgIGNsaWVudDogYW55LFxuICAgIHJlcXVlc3RJZDogbnVtYmVyLFxuICAgIG9wOiBzdHJpbmdcbiAgKTogYW55IHtcbiAgICAvLyB0cnkgdG8gbWF0Y2ggb24gdXNlciBmaXJzdCwgbGVzcyBleHBlbnNpdmUgdGhhbiB3aXRoIHJvbGVzXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBbJyonXTtcbiAgICBsZXQgdXNlcklkO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGNvbnN0IHsgdXNlcklkIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW4pO1xuICAgICAgaWYgKHVzZXJJZCkge1xuICAgICAgICBhY2xHcm91cC5wdXNoKHVzZXJJZCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBvYmplY3QuY2xhc3NOYW1lLFxuICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgb3BcbiAgICAgICk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIudmVyYm9zZShgRmFpbGVkIG1hdGNoaW5nIENMUCBmb3IgJHtvYmplY3QuaWR9ICR7dXNlcklkfSAke2V9YCk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIFRPRE86IGhhbmRsZSByb2xlcyBwZXJtaXNzaW9uc1xuICAgIC8vIE9iamVjdC5rZXlzKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucykuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgLy8gICBjb25zdCBwZXJtID0gY2xhc3NMZXZlbFBlcm1pc3Npb25zW2tleV07XG4gICAgLy8gICBPYmplY3Qua2V5cyhwZXJtKS5mb3JFYWNoKChrZXkpID0+IHtcbiAgICAvLyAgICAgaWYgKGtleS5pbmRleE9mKCdyb2xlJykpXG4gICAgLy8gICB9KTtcbiAgICAvLyB9KVxuICAgIC8vIC8vIGl0J3MgcmVqZWN0ZWQgaGVyZSwgY2hlY2sgdGhlIHJvbGVzXG4gICAgLy8gdmFyIHJvbGVzUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSk7XG4gICAgLy8gcm9sZXNRdWVyeS5lcXVhbFRvKFwidXNlcnNcIiwgdXNlcik7XG4gICAgLy8gcmV0dXJuIHJvbGVzUXVlcnkuZmluZCh7dXNlTWFzdGVyS2V5OnRydWV9KTtcbiAgfVxuXG4gIF9nZXRDTFBPcGVyYXRpb24ocXVlcnk6IGFueSkge1xuICAgIHJldHVybiB0eXBlb2YgcXVlcnkgPT09ICdvYmplY3QnICYmXG4gICAgICBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09IDEgJiZcbiAgICAgIHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PT0gJ3N0cmluZydcbiAgICAgID8gJ2dldCdcbiAgICAgIDogJ2ZpbmQnO1xuICB9XG5cbiAgYXN5bmMgX3ZlcmlmeUFDTChhY2w6IGFueSwgdG9rZW46IHN0cmluZykge1xuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25zdCB7IGF1dGgsIHVzZXJJZCB9ID0gYXdhaXQgdGhpcy5nZXRBdXRoRm9yU2Vzc2lvblRva2VuKHRva2VuKTtcblxuICAgIC8vIEdldHRpbmcgdGhlIHNlc3Npb24gdG9rZW4gZmFpbGVkXG4gICAgLy8gVGhpcyBtZWFucyB0aGF0IG5vIGFkZGl0aW9uYWwgYXV0aCBpcyBhdmFpbGFibGVcbiAgICAvLyBBdCB0aGlzIHBvaW50LCBqdXN0IGJhaWwgb3V0IGFzIG5vIGFkZGl0aW9uYWwgdmlzaWJpbGl0eSBjYW4gYmUgaW5mZXJyZWQuXG4gICAgaWYgKCFhdXRoIHx8ICF1c2VySWQpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkID0gYWNsLmdldFJlYWRBY2Nlc3ModXNlcklkKTtcbiAgICBpZiAoaXNTdWJzY3JpcHRpb25TZXNzaW9uVG9rZW5NYXRjaGVkKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiB0aGUgdXNlciBoYXMgYW55IHJvbGVzIHRoYXQgbWF0Y2ggdGhlIEFDTFxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgICAgLnRoZW4oYXN5bmMgKCkgPT4ge1xuICAgICAgICAvLyBSZXNvbHZlIGZhbHNlIHJpZ2h0IGF3YXkgaWYgdGhlIGFjbCBkb2Vzbid0IGhhdmUgYW55IHJvbGVzXG4gICAgICAgIGNvbnN0IGFjbF9oYXNfcm9sZXMgPSBPYmplY3Qua2V5cyhhY2wucGVybWlzc2lvbnNCeUlkKS5zb21lKGtleSA9PiBrZXkuc3RhcnRzV2l0aCgncm9sZTonKSk7XG4gICAgICAgIGlmICghYWNsX2hhc19yb2xlcykge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IGF1dGguZ2V0VXNlclJvbGVzKCk7XG4gICAgICAgIC8vIEZpbmFsbHksIHNlZSBpZiBhbnkgb2YgdGhlIHVzZXIncyByb2xlcyBhbGxvdyB0aGVtIHJlYWQgYWNjZXNzXG4gICAgICAgIGZvciAoY29uc3Qgcm9sZSBvZiByb2xlTmFtZXMpIHtcbiAgICAgICAgICAvLyBXZSB1c2UgZ2V0UmVhZEFjY2VzcyBhcyBgcm9sZWAgaXMgaW4gdGhlIGZvcm0gYHJvbGU6cm9sZU5hbWVgXG4gICAgICAgICAgaWYgKGFjbC5nZXRSZWFkQWNjZXNzKHJvbGUpKSB7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgZ2V0QXV0aEZyb21DbGllbnQoY2xpZW50OiBhbnksIHJlcXVlc3RJZDogbnVtYmVyLCBzZXNzaW9uVG9rZW46IHN0cmluZykge1xuICAgIGNvbnN0IGdldFNlc3Npb25Gcm9tQ2xpZW50ID0gKCkgPT4ge1xuICAgICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgICBpZiAodHlwZW9mIHN1YnNjcmlwdGlvbkluZm8gPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHJldHVybiBjbGllbnQuc2Vzc2lvblRva2VuO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuIHx8IGNsaWVudC5zZXNzaW9uVG9rZW47XG4gICAgfTtcbiAgICBpZiAoIXNlc3Npb25Ub2tlbikge1xuICAgICAgc2Vzc2lvblRva2VuID0gZ2V0U2Vzc2lvbkZyb21DbGllbnQoKTtcbiAgICB9XG4gICAgaWYgKCFzZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgeyBhdXRoIH0gPSBhd2FpdCB0aGlzLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oc2Vzc2lvblRva2VuKTtcbiAgICByZXR1cm4gYXV0aDtcbiAgfVxuXG4gIGFzeW5jIF9tYXRjaGVzQUNMKGFjbDogYW55LCBjbGllbnQ6IGFueSwgcmVxdWVzdElkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICAvLyBSZXR1cm4gdHJ1ZSBkaXJlY3RseSBpZiBBQ0wgaXNuJ3QgcHJlc2VudCwgQUNMIGlzIHB1YmxpYyByZWFkLCBvciBjbGllbnQgaGFzIG1hc3RlciBrZXlcbiAgICBpZiAoIWFjbCB8fCBhY2wuZ2V0UHVibGljUmVhZEFjY2VzcygpIHx8IGNsaWVudC5oYXNNYXN0ZXJLZXkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBzdWJzY3JpcHRpb24gc2Vzc2lvblRva2VuIG1hdGNoZXMgQUNMIGZpcnN0XG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uSW5mbyA9IGNsaWVudC5nZXRTdWJzY3JpcHRpb25JbmZvKHJlcXVlc3RJZCk7XG4gICAgaWYgKHR5cGVvZiBzdWJzY3JpcHRpb25JbmZvID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvblRva2VuID0gc3Vic2NyaXB0aW9uSW5mby5zZXNzaW9uVG9rZW47XG4gICAgY29uc3QgY2xpZW50U2Vzc2lvblRva2VuID0gY2xpZW50LnNlc3Npb25Ub2tlbjtcblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBzdWJzY3JpcHRpb25Ub2tlbikpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChhd2FpdCB0aGlzLl92ZXJpZnlBQ0woYWNsLCBjbGllbnRTZXNzaW9uVG9rZW4pKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBhc3luYyBfaGFuZGxlQ29ubmVjdChwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIGlmICghdGhpcy5fdmFsaWRhdGVLZXlzKHJlcXVlc3QsIHRoaXMua2V5UGFpcnMpKSB7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCA0LCAnS2V5IGluIHJlcXVlc3QgaXMgbm90IHZhbGlkJyk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0tleSBpbiByZXF1ZXN0IGlzIG5vdCB2YWxpZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBoYXNNYXN0ZXJLZXkgPSB0aGlzLl9oYXNNYXN0ZXJLZXkocmVxdWVzdCwgdGhpcy5rZXlQYWlycyk7XG4gICAgY29uc3QgY2xpZW50SWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQ2xpZW50KFxuICAgICAgY2xpZW50SWQsXG4gICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgIGhhc01hc3RlcktleSxcbiAgICAgIHJlcXVlc3Quc2Vzc2lvblRva2VuLFxuICAgICAgcmVxdWVzdC5pbnN0YWxsYXRpb25JZFxuICAgICk7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJlcSA9IHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ2Nvbm5lY3QnLFxuICAgICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgICAgc3Vic2NyaXB0aW9uczogdGhpcy5zdWJzY3JpcHRpb25zLnNpemUsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogcmVxdWVzdC5zZXNzaW9uVG9rZW4sXG4gICAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcXVlc3QuaW5zdGFsbGF0aW9uSWQsXG4gICAgICB9O1xuICAgICAgY29uc3QgdHJpZ2dlciA9IGdldFRyaWdnZXIoJ0BDb25uZWN0JywgJ2JlZm9yZUNvbm5lY3QnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcS5zZXNzaW9uVG9rZW4pO1xuICAgICAgICBpZiAoYXV0aCAmJiBhdXRoLnVzZXIpIHtcbiAgICAgICAgICByZXEudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuICAgICAgICBhd2FpdCBydW5UcmlnZ2VyKHRyaWdnZXIsIGBiZWZvcmVDb25uZWN0LkBDb25uZWN0YCwgcmVxLCBhdXRoKTtcbiAgICAgIH1cbiAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkID0gY2xpZW50SWQ7XG4gICAgICB0aGlzLmNsaWVudHMuc2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCBjbGllbnQpO1xuICAgICAgbG9nZ2VyLmluZm8oYENyZWF0ZSBuZXcgY2xpZW50OiAke3BhcnNlV2Vic29ja2V0LmNsaWVudElkfWApO1xuICAgICAgY2xpZW50LnB1c2hDb25uZWN0KCk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHJlcSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSk7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBGYWlsZWQgcnVubmluZyBiZWZvcmVDb25uZWN0IGZvciBzZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uVG9rZW59IHdpdGg6XFxuIEVycm9yOiBgICtcbiAgICAgICAgICBKU09OLnN0cmluZ2lmeShlcnJvcilcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgX2hhc01hc3RlcktleShyZXF1ZXN0OiBhbnksIHZhbGlkS2V5UGFpcnM6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdmFsaWRLZXlQYWlycyB8fCB2YWxpZEtleVBhaXJzLnNpemUgPT0gMCB8fCAhdmFsaWRLZXlQYWlycy5oYXMoJ21hc3RlcktleScpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICghcmVxdWVzdCB8fCAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlcXVlc3QsICdtYXN0ZXJLZXknKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gcmVxdWVzdC5tYXN0ZXJLZXkgPT09IHZhbGlkS2V5UGFpcnMuZ2V0KCdtYXN0ZXJLZXknKTtcbiAgfVxuXG4gIF92YWxpZGF0ZUtleXMocmVxdWVzdDogYW55LCB2YWxpZEtleVBhaXJzOiBhbnkpOiBib29sZWFuIHtcbiAgICBpZiAoIXZhbGlkS2V5UGFpcnMgfHwgdmFsaWRLZXlQYWlycy5zaXplID09IDApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBsZXQgaXNWYWxpZCA9IGZhbHNlO1xuICAgIGZvciAoY29uc3QgW2tleSwgc2VjcmV0XSBvZiB2YWxpZEtleVBhaXJzKSB7XG4gICAgICBpZiAoIXJlcXVlc3Rba2V5XSB8fCByZXF1ZXN0W2tleV0gIT09IHNlY3JldCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlzVmFsaWQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHJldHVybiBpc1ZhbGlkO1xuICB9XG5cbiAgYXN5bmMgX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldDogYW55LCByZXF1ZXN0OiBhbnkpOiBhbnkge1xuICAgIC8vIElmIHdlIGNhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgcmV0dXJuIGVycm9yIHRvIGNsaWVudFxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHBhcnNlV2Vic29ja2V0LCAnY2xpZW50SWQnKSkge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIG1ha2Ugc3VyZSB5b3UgY29ubmVjdCB0byBzZXJ2ZXIgYmVmb3JlIHN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcignQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSBzdWJzY3JpYmluZycpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBjbGllbnQgPSB0aGlzLmNsaWVudHMuZ2V0KHBhcnNlV2Vic29ja2V0LmNsaWVudElkKTtcbiAgICBjb25zdCBjbGFzc05hbWUgPSByZXF1ZXN0LnF1ZXJ5LmNsYXNzTmFtZTtcbiAgICBsZXQgYXV0aENhbGxlZCA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICBjb25zdCB0cmlnZ2VyID0gZ2V0VHJpZ2dlcihjbGFzc05hbWUsICdiZWZvcmVTdWJzY3JpYmUnLCBQYXJzZS5hcHBsaWNhdGlvbklkKTtcbiAgICAgIGlmICh0cmlnZ2VyKSB7XG4gICAgICAgIGNvbnN0IGF1dGggPSBhd2FpdCB0aGlzLmdldEF1dGhGcm9tQ2xpZW50KGNsaWVudCwgcmVxdWVzdC5yZXF1ZXN0SWQsIHJlcXVlc3Quc2Vzc2lvblRva2VuKTtcbiAgICAgICAgYXV0aENhbGxlZCA9IHRydWU7XG4gICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgIHJlcXVlc3QudXNlciA9IGF1dGgudXNlcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHBhcnNlUXVlcnkgPSBuZXcgUGFyc2UuUXVlcnkoY2xhc3NOYW1lKTtcbiAgICAgICAgcGFyc2VRdWVyeS53aXRoSlNPTihyZXF1ZXN0LnF1ZXJ5KTtcbiAgICAgICAgcmVxdWVzdC5xdWVyeSA9IHBhcnNlUXVlcnk7XG4gICAgICAgIGF3YWl0IHJ1blRyaWdnZXIodHJpZ2dlciwgYGJlZm9yZVN1YnNjcmliZS4ke2NsYXNzTmFtZX1gLCByZXF1ZXN0LCBhdXRoKTtcblxuICAgICAgICBjb25zdCBxdWVyeSA9IHJlcXVlc3QucXVlcnkudG9KU09OKCk7XG4gICAgICAgIGlmIChxdWVyeS5rZXlzKSB7XG4gICAgICAgICAgcXVlcnkuZmllbGRzID0gcXVlcnkua2V5cy5zcGxpdCgnLCcpO1xuICAgICAgICB9XG4gICAgICAgIHJlcXVlc3QucXVlcnkgPSBxdWVyeTtcbiAgICAgIH1cblxuICAgICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19TZXNzaW9uJykge1xuICAgICAgICBpZiAoIWF1dGhDYWxsZWQpIHtcbiAgICAgICAgICBjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5nZXRBdXRoRnJvbUNsaWVudChcbiAgICAgICAgICAgIGNsaWVudCxcbiAgICAgICAgICAgIHJlcXVlc3QucmVxdWVzdElkLFxuICAgICAgICAgICAgcmVxdWVzdC5zZXNzaW9uVG9rZW5cbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChhdXRoICYmIGF1dGgudXNlcikge1xuICAgICAgICAgICAgcmVxdWVzdC51c2VyID0gYXV0aC51c2VyO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBpZiAocmVxdWVzdC51c2VyKSB7XG4gICAgICAgICAgcmVxdWVzdC5xdWVyeS53aGVyZS51c2VyID0gcmVxdWVzdC51c2VyLnRvUG9pbnRlcigpO1xuICAgICAgICB9IGVsc2UgaWYgKCFyZXF1ZXN0Lm1hc3Rlcikge1xuICAgICAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgICAgICBwYXJzZVdlYnNvY2tldCxcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgICAgICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nLFxuICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICByZXF1ZXN0LnJlcXVlc3RJZFxuICAgICAgICAgICk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBHZXQgc3Vic2NyaXB0aW9uIGZyb20gc3Vic2NyaXB0aW9ucywgY3JlYXRlIG9uZSBpZiBuZWNlc3NhcnlcbiAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbkhhc2ggPSBxdWVyeUhhc2gocmVxdWVzdC5xdWVyeSk7XG4gICAgICAvLyBBZGQgY2xhc3NOYW1lIHRvIHN1YnNjcmlwdGlvbnMgaWYgbmVjZXNzYXJ5XG5cbiAgICAgIGlmICghdGhpcy5zdWJzY3JpcHRpb25zLmhhcyhjbGFzc05hbWUpKSB7XG4gICAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucy5zZXQoY2xhc3NOYW1lLCBuZXcgTWFwKCkpO1xuICAgICAgfVxuICAgICAgY29uc3QgY2xhc3NTdWJzY3JpcHRpb25zID0gdGhpcy5zdWJzY3JpcHRpb25zLmdldChjbGFzc05hbWUpO1xuICAgICAgbGV0IHN1YnNjcmlwdGlvbjtcbiAgICAgIGlmIChjbGFzc1N1YnNjcmlwdGlvbnMuaGFzKHN1YnNjcmlwdGlvbkhhc2gpKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbiA9IGNsYXNzU3Vic2NyaXB0aW9ucy5nZXQoc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdWJzY3JpcHRpb24gPSBuZXcgU3Vic2NyaXB0aW9uKGNsYXNzTmFtZSwgcmVxdWVzdC5xdWVyeS53aGVyZSwgc3Vic2NyaXB0aW9uSGFzaCk7XG4gICAgICAgIGNsYXNzU3Vic2NyaXB0aW9ucy5zZXQoc3Vic2NyaXB0aW9uSGFzaCwgc3Vic2NyaXB0aW9uKTtcbiAgICAgIH1cblxuICAgICAgLy8gQWRkIHN1YnNjcmlwdGlvbkluZm8gdG8gY2xpZW50XG4gICAgICBjb25zdCBzdWJzY3JpcHRpb25JbmZvID0ge1xuICAgICAgICBzdWJzY3JpcHRpb246IHN1YnNjcmlwdGlvbixcbiAgICAgIH07XG4gICAgICAvLyBBZGQgc2VsZWN0ZWQgZmllbGRzLCBzZXNzaW9uVG9rZW4gYW5kIGluc3RhbGxhdGlvbklkIGZvciB0aGlzIHN1YnNjcmlwdGlvbiBpZiBuZWNlc3NhcnlcbiAgICAgIGlmIChyZXF1ZXN0LnF1ZXJ5LmZpZWxkcykge1xuICAgICAgICBzdWJzY3JpcHRpb25JbmZvLmZpZWxkcyA9IHJlcXVlc3QucXVlcnkuZmllbGRzO1xuICAgICAgfVxuICAgICAgaWYgKHJlcXVlc3Quc2Vzc2lvblRva2VuKSB7XG4gICAgICAgIHN1YnNjcmlwdGlvbkluZm8uc2Vzc2lvblRva2VuID0gcmVxdWVzdC5zZXNzaW9uVG9rZW47XG4gICAgICB9XG4gICAgICBjbGllbnQuYWRkU3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0LnJlcXVlc3RJZCwgc3Vic2NyaXB0aW9uSW5mbyk7XG5cbiAgICAgIC8vIEFkZCBjbGllbnRJZCB0byBzdWJzY3JpcHRpb25cbiAgICAgIHN1YnNjcmlwdGlvbi5hZGRDbGllbnRTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQsIHJlcXVlc3QucmVxdWVzdElkKTtcblxuICAgICAgY2xpZW50LnB1c2hTdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgICBsb2dnZXIudmVyYm9zZShcbiAgICAgICAgYENyZWF0ZSBjbGllbnQgJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gbmV3IHN1YnNjcmlwdGlvbjogJHtyZXF1ZXN0LnJlcXVlc3RJZH1gXG4gICAgICApO1xuICAgICAgbG9nZ2VyLnZlcmJvc2UoJ0N1cnJlbnQgY2xpZW50IG51bWJlcjogJWQnLCB0aGlzLmNsaWVudHMuc2l6ZSk7XG4gICAgICBydW5MaXZlUXVlcnlFdmVudEhhbmRsZXJzKHtcbiAgICAgICAgY2xpZW50LFxuICAgICAgICBldmVudDogJ3N1YnNjcmliZScsXG4gICAgICAgIGNsaWVudHM6IHRoaXMuY2xpZW50cy5zaXplLFxuICAgICAgICBzdWJzY3JpcHRpb25zOiB0aGlzLnN1YnNjcmlwdGlvbnMuc2l6ZSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiByZXF1ZXN0LnNlc3Npb25Ub2tlbixcbiAgICAgICAgdXNlTWFzdGVyS2V5OiBjbGllbnQuaGFzTWFzdGVyS2V5LFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogY2xpZW50Lmluc3RhbGxhdGlvbklkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgY29uc3QgZXJyb3IgPSByZXNvbHZlRXJyb3IoZSk7XG4gICAgICBDbGllbnQucHVzaEVycm9yKHBhcnNlV2Vic29ja2V0LCBlcnJvci5jb2RlLCBlcnJvci5tZXNzYWdlLCBmYWxzZSwgcmVxdWVzdC5yZXF1ZXN0SWQpO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgRmFpbGVkIHJ1bm5pbmcgYmVmb3JlU3Vic2NyaWJlIG9uICR7Y2xhc3NOYW1lfSBmb3Igc2Vzc2lvbiAke3JlcXVlc3Quc2Vzc2lvblRva2VufSB3aXRoOlxcbiBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZXJyb3IpXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIF9oYW5kbGVVcGRhdGVTdWJzY3JpcHRpb24ocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55KTogYW55IHtcbiAgICB0aGlzLl9oYW5kbGVVbnN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCwgZmFsc2UpO1xuICAgIHRoaXMuX2hhbmRsZVN1YnNjcmliZShwYXJzZVdlYnNvY2tldCwgcmVxdWVzdCk7XG4gIH1cblxuICBfaGFuZGxlVW5zdWJzY3JpYmUocGFyc2VXZWJzb2NrZXQ6IGFueSwgcmVxdWVzdDogYW55LCBub3RpZnlDbGllbnQ6IGJvb2xlYW4gPSB0cnVlKTogYW55IHtcbiAgICAvLyBJZiB3ZSBjYW4gbm90IGZpbmQgdGhpcyBjbGllbnQsIHJldHVybiBlcnJvciB0byBjbGllbnRcbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChwYXJzZVdlYnNvY2tldCwgJ2NsaWVudElkJykpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHRoaXMgY2xpZW50LCBtYWtlIHN1cmUgeW91IGNvbm5lY3QgdG8gc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nJ1xuICAgICAgKTtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCwgbWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZydcbiAgICAgICk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHJlcXVlc3RJZCA9IHJlcXVlc3QucmVxdWVzdElkO1xuICAgIGNvbnN0IGNsaWVudCA9IHRoaXMuY2xpZW50cy5nZXQocGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgIGlmICh0eXBlb2YgY2xpZW50ID09PSAndW5kZWZpbmVkJykge1xuICAgICAgQ2xpZW50LnB1c2hFcnJvcihcbiAgICAgICAgcGFyc2VXZWJzb2NrZXQsXG4gICAgICAgIDIsXG4gICAgICAgICdDYW5ub3QgZmluZCBjbGllbnQgd2l0aCBjbGllbnRJZCAnICtcbiAgICAgICAgICBwYXJzZVdlYnNvY2tldC5jbGllbnRJZCArXG4gICAgICAgICAgJy4gTWFrZSBzdXJlIHlvdSBjb25uZWN0IHRvIGxpdmUgcXVlcnkgc2VydmVyIGJlZm9yZSB1bnN1YnNjcmliaW5nLidcbiAgICAgICk7XG4gICAgICBsb2dnZXIuZXJyb3IoJ0NhbiBub3QgZmluZCB0aGlzIGNsaWVudCAnICsgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN1YnNjcmlwdGlvbkluZm8gPSBjbGllbnQuZ2V0U3Vic2NyaXB0aW9uSW5mbyhyZXF1ZXN0SWQpO1xuICAgIGlmICh0eXBlb2Ygc3Vic2NyaXB0aW9uSW5mbyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIENsaWVudC5wdXNoRXJyb3IoXG4gICAgICAgIHBhcnNlV2Vic29ja2V0LFxuICAgICAgICAyLFxuICAgICAgICAnQ2Fubm90IGZpbmQgc3Vic2NyaXB0aW9uIHdpdGggY2xpZW50SWQgJyArXG4gICAgICAgICAgcGFyc2VXZWJzb2NrZXQuY2xpZW50SWQgK1xuICAgICAgICAgICcgc3Vic2NyaXB0aW9uSWQgJyArXG4gICAgICAgICAgcmVxdWVzdElkICtcbiAgICAgICAgICAnLiBNYWtlIHN1cmUgeW91IHN1YnNjcmliZSB0byBsaXZlIHF1ZXJ5IHNlcnZlciBiZWZvcmUgdW5zdWJzY3JpYmluZy4nXG4gICAgICApO1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICAnQ2FuIG5vdCBmaW5kIHN1YnNjcmlwdGlvbiB3aXRoIGNsaWVudElkICcgK1xuICAgICAgICAgIHBhcnNlV2Vic29ja2V0LmNsaWVudElkICtcbiAgICAgICAgICAnIHN1YnNjcmlwdGlvbklkICcgK1xuICAgICAgICAgIHJlcXVlc3RJZFxuICAgICAgKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvLyBSZW1vdmUgc3Vic2NyaXB0aW9uIGZyb20gY2xpZW50XG4gICAgY2xpZW50LmRlbGV0ZVN1YnNjcmlwdGlvbkluZm8ocmVxdWVzdElkKTtcbiAgICAvLyBSZW1vdmUgY2xpZW50IGZyb20gc3Vic2NyaXB0aW9uXG4gICAgY29uc3Qgc3Vic2NyaXB0aW9uID0gc3Vic2NyaXB0aW9uSW5mby5zdWJzY3JpcHRpb247XG4gICAgY29uc3QgY2xhc3NOYW1lID0gc3Vic2NyaXB0aW9uLmNsYXNzTmFtZTtcbiAgICBzdWJzY3JpcHRpb24uZGVsZXRlQ2xpZW50U3Vic2NyaXB0aW9uKHBhcnNlV2Vic29ja2V0LmNsaWVudElkLCByZXF1ZXN0SWQpO1xuICAgIC8vIElmIHRoZXJlIGlzIG5vIGNsaWVudCB3aGljaCBpcyBzdWJzY3JpYmluZyB0aGlzIHN1YnNjcmlwdGlvbiwgcmVtb3ZlIGl0IGZyb20gc3Vic2NyaXB0aW9uc1xuICAgIGNvbnN0IGNsYXNzU3Vic2NyaXB0aW9ucyA9IHRoaXMuc3Vic2NyaXB0aW9ucy5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoIXN1YnNjcmlwdGlvbi5oYXNTdWJzY3JpYmluZ0NsaWVudCgpKSB7XG4gICAgICBjbGFzc1N1YnNjcmlwdGlvbnMuZGVsZXRlKHN1YnNjcmlwdGlvbi5oYXNoKTtcbiAgICB9XG4gICAgLy8gSWYgdGhlcmUgaXMgbm8gc3Vic2NyaXB0aW9ucyB1bmRlciB0aGlzIGNsYXNzLCByZW1vdmUgaXQgZnJvbSBzdWJzY3JpcHRpb25zXG4gICAgaWYgKGNsYXNzU3Vic2NyaXB0aW9ucy5zaXplID09PSAwKSB7XG4gICAgICB0aGlzLnN1YnNjcmlwdGlvbnMuZGVsZXRlKGNsYXNzTmFtZSk7XG4gICAgfVxuICAgIHJ1bkxpdmVRdWVyeUV2ZW50SGFuZGxlcnMoe1xuICAgICAgY2xpZW50LFxuICAgICAgZXZlbnQ6ICd1bnN1YnNjcmliZScsXG4gICAgICBjbGllbnRzOiB0aGlzLmNsaWVudHMuc2l6ZSxcbiAgICAgIHN1YnNjcmlwdGlvbnM6IHRoaXMuc3Vic2NyaXB0aW9ucy5zaXplLFxuICAgICAgc2Vzc2lvblRva2VuOiBzdWJzY3JpcHRpb25JbmZvLnNlc3Npb25Ub2tlbixcbiAgICAgIHVzZU1hc3RlcktleTogY2xpZW50Lmhhc01hc3RlcktleSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiBjbGllbnQuaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICBpZiAoIW5vdGlmeUNsaWVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNsaWVudC5wdXNoVW5zdWJzY3JpYmUocmVxdWVzdC5yZXF1ZXN0SWQpO1xuXG4gICAgbG9nZ2VyLnZlcmJvc2UoXG4gICAgICBgRGVsZXRlIGNsaWVudDogJHtwYXJzZVdlYnNvY2tldC5jbGllbnRJZH0gfCBzdWJzY3JpcHRpb246ICR7cmVxdWVzdC5yZXF1ZXN0SWR9YFxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRUEsTUFBTUEsb0JBQU4sQ0FBMkI7RUFFekI7RUFJQTtFQUdBQyxXQUFXLENBQUNDLE1BQUQsRUFBY0MsTUFBVyxHQUFHLEVBQTVCLEVBQWdDQyxpQkFBc0IsR0FBRyxFQUF6RCxFQUE2RDtJQUN0RSxLQUFLRixNQUFMLEdBQWNBLE1BQWQ7SUFDQSxLQUFLRyxPQUFMLEdBQWUsSUFBSUMsR0FBSixFQUFmO0lBQ0EsS0FBS0MsYUFBTCxHQUFxQixJQUFJRCxHQUFKLEVBQXJCO0lBQ0EsS0FBS0gsTUFBTCxHQUFjQSxNQUFkO0lBRUFBLE1BQU0sQ0FBQ0ssS0FBUCxHQUFlTCxNQUFNLENBQUNLLEtBQVAsSUFBZ0JDLGFBQUEsQ0FBTUMsYUFBckM7SUFDQVAsTUFBTSxDQUFDUSxTQUFQLEdBQW1CUixNQUFNLENBQUNRLFNBQVAsSUFBb0JGLGFBQUEsQ0FBTUUsU0FBN0MsQ0FQc0UsQ0FTdEU7O0lBQ0EsTUFBTUMsUUFBUSxHQUFHVCxNQUFNLENBQUNTLFFBQVAsSUFBbUIsRUFBcEM7SUFDQSxLQUFLQSxRQUFMLEdBQWdCLElBQUlOLEdBQUosRUFBaEI7O0lBQ0EsS0FBSyxNQUFNTyxHQUFYLElBQWtCQyxNQUFN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