"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getAnalyticsController = getAnalyticsController;
exports.getAuthDataManager = getAuthDataManager;
exports.getCacheController = getCacheController;
exports.getControllers = getControllers;
exports.getDatabaseAdapter = getDatabaseAdapter;
exports.getDatabaseController = getDatabaseController;
exports.getFilesController = getFilesController;
exports.getHooksController = getHooksController;
exports.getLiveQueryController = getLiveQueryController;
exports.getLoggerController = getLoggerController;
exports.getParseGraphQLController = getParseGraphQLController;
exports.getPushController = getPushController;
exports.getUserController = getUserController;

var _Auth = _interopRequireDefault(require("../Adapters/Auth"));

var _Options = require("../Options");

var _AdapterLoader = require("../Adapters/AdapterLoader");

var _defaults = _interopRequireDefault(require("../defaults"));

var _LoggerController = require("./LoggerController");

var _FilesController = require("./FilesController");

var _HooksController = require("./HooksController");

var _UserController = require("./UserController");

var _CacheController = require("./CacheController");

var _LiveQueryController = require("./LiveQueryController");

var _AnalyticsController = require("./AnalyticsController");

var _PushController = require("./PushController");

var _PushQueue = require("../Push/PushQueue");

var _PushWorker = require("../Push/PushWorker");

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _GridFSBucketAdapter = require("../Adapters/Files/GridFSBucketAdapter");

var _WinstonLoggerAdapter = require("../Adapters/Logger/WinstonLoggerAdapter");

var _InMemoryCacheAdapter = require("../Adapters/Cache/InMemoryCacheAdapter");

var _AnalyticsAdapter = require("../Adapters/Analytics/AnalyticsAdapter");

var _MongoStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Mongo/MongoStorageAdapter"));

var _PostgresStorageAdapter = _interopRequireDefault(require("../Adapters/Storage/Postgres/PostgresStorageAdapter"));

var _pushAdapter = _interopRequireDefault(require("@parse/push-adapter"));

var _ParseGraphQLController = _interopRequireDefault(require("./ParseGraphQLController"));

var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function getControllers(options) {
  const loggerController = getLoggerController(options);
  const filesController = getFilesController(options);
  const userController = getUserController(options);
  const {
    pushController,
    hasPushScheduledSupport,
    hasPushSupport,
    pushControllerQueue,
    pushWorker
  } = getPushController(options);
  const cacheController = getCacheController(options);
  const analyticsController = getAnalyticsController(options);
  const liveQueryController = getLiveQueryController(options);
  const databaseController = getDatabaseController(options);
  const hooksController = getHooksController(options, databaseController);
  const authDataManager = getAuthDataManager(options);
  const parseGraphQLController = getParseGraphQLController(options, {
    databaseController,
    cacheController
  });
  return {
    loggerController,
    filesController,
    userController,
    pushController,
    hasPushScheduledSupport,
    hasPushSupport,
    pushWorker,
    pushControllerQueue,
    analyticsController,
    cacheController,
    parseGraphQLController,
    liveQueryController,
    databaseController,
    hooksController,
    authDataManager,
    schemaCache: _SchemaCache.default
  };
}

function getLoggerController(options) {
  const {
    appId,
    jsonLogs,
    logsFolder,
    verbose,
    logLevel,
    maxLogFiles,
    silent,
    loggerAdapter
  } = options;
  const loggerOptions = {
    jsonLogs,
    logsFolder,
    verbose,
    logLevel,
    silent,
    maxLogFiles
  };
  const loggerControllerAdapter = (0, _AdapterLoader.loadAdapter)(loggerAdapter, _WinstonLoggerAdapter.WinstonLoggerAdapter, loggerOptions);
  return new _LoggerController.LoggerController(loggerControllerAdapter, appId, loggerOptions);
}

function getFilesController(options) {
  const {
    appId,
    databaseURI,
    filesAdapter,
    databaseAdapter,
    preserveFileName,
    fileKey
  } = options;

  if (!filesAdapter && databaseAdapter) {
    throw 'When using an explicit database adapter, you must also use an explicit filesAdapter.';
  }

  const filesControllerAdapter = (0, _AdapterLoader.loadAdapter)(filesAdapter, () => {
    return new _GridFSBucketAdapter.GridFSBucketAdapter(databaseURI, {}, fileKey);
  });
  return new _FilesController.FilesController(filesControllerAdapter, appId, {
    preserveFileName
  });
}

function getUserController(options) {
  const {
    appId,
    emailAdapter,
    verifyUserEmails
  } = options;
  const emailControllerAdapter = (0, _AdapterLoader.loadAdapter)(emailAdapter);
  return new _UserController.UserController(emailControllerAdapter, appId, {
    verifyUserEmails
  });
}

function getCacheController(options) {
  const {
    appId,
    cacheAdapter,
    cacheTTL,
    cacheMaxSize
  } = options;
  const cacheControllerAdapter = (0, _AdapterLoader.loadAdapter)(cacheAdapter, _InMemoryCacheAdapter.InMemoryCacheAdapter, {
    appId: appId,
    ttl: cacheTTL,
    maxSize: cacheMaxSize
  });
  return new _CacheController.CacheController(cacheControllerAdapter, appId);
}

function getParseGraphQLController(options, controllerDeps) {
  return new _ParseGraphQLController.default(_objectSpread({
    mountGraphQL: options.mountGraphQL
  }, controllerDeps));
}

function getAnalyticsController(options) {
  const {
    analyticsAdapter
  } = options;
  const analyticsControllerAdapter = (0, _AdapterLoader.loadAdapter)(analyticsAdapter, _AnalyticsAdapter.AnalyticsAdapter);
  return new _AnalyticsController.AnalyticsController(analyticsControllerAdapter);
}

function getLiveQueryController(options) {
  return new _LiveQueryController.LiveQueryController(options.liveQuery);
}

function getDatabaseController(options) {
  const {
    databaseURI,
    collectionPrefix,
    databaseOptions
  } = options;
  let {
    databaseAdapter
  } = options;

  if ((databaseOptions || databaseURI && databaseURI !== _defaults.default.databaseURI || collectionPrefix !== _defaults.default.collectionPrefix) && databaseAdapter) {
    throw 'You cannot specify both a databaseAdapter and a databaseURI/databaseOptions/collectionPrefix.';
  } else if (!databaseAdapter) {
    databaseAdapter = getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions);
  } else {
    databaseAdapter = (0, _AdapterLoader.loadAdapter)(databaseAdapter);
  }

  return new _DatabaseController.default(databaseAdapter, options);
}

function getHooksController(options, databaseController) {
  const {
    appId,
    webhookKey
  } = options;
  return new _HooksController.HooksController(appId, databaseController, webhookKey);
}

function getPushController(options) {
  const {
    scheduledPush,
    push
  } = options;
  const pushOptions = Object.assign({}, push);
  const pushQueueOptions = pushOptions.queueOptions || {};

  if (pushOptions.queueOptions) {
    delete pushOptions.queueOptions;
  } // Pass the push options too as it works with the default


  const pushAdapter = (0, _AdapterLoader.loadAdapter)(pushOptions && pushOptions.adapter, _pushAdapter.default, pushOptions); // We pass the options and the base class for the adatper,
  // Note that passing an instance would work too

  const pushController = new _PushController.PushController();
  const hasPushSupport = !!(pushAdapter && push);
  const hasPushScheduledSupport = hasPushSupport && scheduledPush === true;
  const {
    disablePushWorker
  } = pushQueueOptions;
  const pushControllerQueue = new _PushQueue.PushQueue(pushQueueOptions);
  let pushWorker;

  if (!disablePushWorker) {
    pushWorker = new _PushWorker.PushWorker(pushAdapter, pushQueueOptions);
  }

  return {
    pushController,
    hasPushSupport,
    hasPushScheduledSupport,
    pushControllerQueue,
    pushWorker
  };
}

function getAuthDataManager(options) {
  const {
    auth,
    enableAnonymousUsers
  } = options;
  return (0, _Auth.default)(auth, enableAnonymousUsers);
}

function getDatabaseAdapter(databaseURI, collectionPrefix, databaseOptions) {
  let protocol;

  try {
    const parsedURI = new URL(databaseURI);
    protocol = parsedURI.protocol ? parsedURI.protocol.toLowerCase() : null;
  } catch (e) {
    /* */
  }

  switch (protocol) {
    case 'postgres:':
    case 'postgresql:':
      return new _PostgresStorageAdapter.default({
        uri: databaseURI,
        collectionPrefix,
        databaseOptions
      });

    default:
      return new _MongoStorageAdapter.default({
        uri: databaseURI,
        collectionPrefix,
        mongoOptions: databaseOptions
      });
  }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJnZXRDb250cm9sbGVycyIsIm9wdGlvbnMiLCJsb2dnZXJDb250cm9sbGVyIiwiZ2V0TG9nZ2VyQ29udHJvbGxlciIsImZpbGVzQ29udHJvbGxlciIsImdldEZpbGVzQ29udHJvbGxlciIsInVzZXJDb250cm9sbGVyIiwiZ2V0VXNlckNvbnRyb2xsZXIiLCJwdXNoQ29udHJvbGxlciIsImhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0IiwiaGFzUHVzaFN1cHBvcnQiLCJwdXNoQ29udHJvbGxlclF1ZXVlIiwicHVzaFdvcmtlciIsImdldFB1c2hDb250cm9sbGVyIiwiY2FjaGVDb250cm9sbGVyIiwiZ2V0Q2FjaGVDb250cm9sbGVyIiwiYW5hbHl0aWNzQ29udHJvbGxlciIsImdldEFuYWx5dGljc0NvbnRyb2xsZXIiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiZ2V0TGl2ZVF1ZXJ5Q29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImdldERhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImdldEhvb2tzQ29udHJvbGxlciIsImF1dGhEYXRhTWFuYWdlciIsImdldEF1dGhEYXRhTWFuYWdlciIsInBhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJnZXRQYXJzZUdyYXBoUUxDb250cm9sbGVyIiwic2NoZW1hQ2FjaGUiLCJTY2hlbWFDYWNoZSIsImFwcElkIiwianNvbkxvZ3MiLCJsb2dzRm9sZGVyIiwidmVyYm9zZSIsImxvZ0xldmVsIiwibWF4TG9nRmlsZXMiLCJzaWxlbnQiLCJsb2dnZXJBZGFwdGVyIiwibG9nZ2VyT3B0aW9ucyIsImxvZ2dlckNvbnRyb2xsZXJBZGFwdGVyIiwibG9hZEFkYXB0ZXIiLCJXaW5zdG9uTG9nZ2VyQWRhcHRlciIsIkxvZ2dlckNvbnRyb2xsZXIiLCJkYXRhYmFzZVVSSSIsImZpbGVzQWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsInByZXNlcnZlRmlsZU5hbWUiLCJmaWxlS2V5IiwiZmlsZXNDb250cm9sbGVyQWRhcHRlciIsIkdyaWRGU0J1Y2tldEFkYXB0ZXIiLCJGaWxlc0NvbnRyb2xsZXIiLCJlbWFpbEFkYXB0ZXIiLCJ2ZXJpZnlVc2VyRW1haWxzIiwiZW1haWxDb250cm9sbGVyQWRhcHRlciIsIlVzZXJDb250cm9sbGVyIiwiY2FjaGVBZGFwdGVyIiwiY2FjaGVUVEwiLCJjYWNoZU1heFNpemUiLCJjYWNoZUNvbnRyb2xsZXJBZGFwdGVyIiwiSW5NZW1vcnlDYWNoZUFkYXB0ZXIiLCJ0dGwiLCJtYXhTaXplIiwiQ2FjaGVDb250cm9sbGVyIiwiY29udHJvbGxlckRlcHMiLCJQYXJzZUdyYXBoUUxDb250cm9sbGVyIiwibW91bnRHcmFwaFFMIiwiYW5hbHl0aWNzQWRhcHRlciIsImFuYWx5dGljc0NvbnRyb2xsZXJBZGFwdGVyIiwiQW5hbHl0aWNzQWRhcHRlciIsIkFuYWx5dGljc0NvbnRyb2xsZXIiLCJMaXZlUXVlcnlDb250cm9sbGVyIiwibGl2ZVF1ZXJ5IiwiY29sbGVjdGlvblByZWZpeCIsImRhdGFiYXNlT3B0aW9ucyIsImRlZmF1bHRzIiwiZ2V0RGF0YWJhc2VBZGFwdGVyIiwiRGF0YWJhc2VDb250cm9sbGVyIiwid2ViaG9va0tleSIsIkhvb2tzQ29udHJvbGxlciIsInNjaGVkdWxlZFB1c2giLCJwdXNoIiwicHVzaE9wdGlvbnMiLCJPYmplY3QiLCJhc3NpZ24iLCJwdXNoUXVldWVPcHRpb25zIiwicXVldWVPcHRpb25zIiwicHVzaEFkYXB0ZXIiLCJhZGFwdGVyIiwiUGFyc2VQdXNoQWRhcHRlciIsIlB1c2hDb250cm9sbGVyIiwiZGlzYWJsZVB1c2hXb3JrZXIiLCJQdXNoUXVldWUiLCJQdXNoV29ya2VyIiwiYXV0aCIsImVuYWJsZUFub255bW91c1VzZXJzIiwicHJvdG9jb2wiLCJwYXJzZWRVUkkiLCJVUkwiLCJ0b0xvd2VyQ2FzZSIsImUiLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwidXJpIiwiTW9uZ29TdG9yYWdlQWRhcHRlciIsIm1vbmdvT3B0aW9ucyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgYXV0aERhdGFNYW5hZ2VyIGZyb20gJy4uL0FkYXB0ZXJzL0F1dGgnO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgeyBsb2FkQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0FkYXB0ZXJMb2FkZXInO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4uL2RlZmF1bHRzJztcbi8vIENvbnRyb2xsZXJzXG5pbXBvcnQgeyBMb2dnZXJDb250cm9sbGVyIH0gZnJvbSAnLi9Mb2dnZXJDb250cm9sbGVyJztcbmltcG9ydCB7IEZpbGVzQ29udHJvbGxlciB9IGZyb20gJy4vRmlsZXNDb250cm9sbGVyJztcbmltcG9ydCB7IEhvb2tzQ29udHJvbGxlciB9IGZyb20gJy4vSG9va3NDb250cm9sbGVyJztcbmltcG9ydCB7IFVzZXJDb250cm9sbGVyIH0gZnJvbSAnLi9Vc2VyQ29udHJvbGxlcic7XG5pbXBvcnQgeyBDYWNoZUNvbnRyb2xsZXIgfSBmcm9tICcuL0NhY2hlQ29udHJvbGxlcic7XG5pbXBvcnQgeyBMaXZlUXVlcnlDb250cm9sbGVyIH0gZnJvbSAnLi9MaXZlUXVlcnlDb250cm9sbGVyJztcbmltcG9ydCB7IEFuYWx5dGljc0NvbnRyb2xsZXIgfSBmcm9tICcuL0FuYWx5dGljc0NvbnRyb2xsZXInO1xuaW1wb3J0IHsgUHVzaENvbnRyb2xsZXIgfSBmcm9tICcuL1B1c2hDb250cm9sbGVyJztcbmltcG9ydCB7IFB1c2hRdWV1ZSB9IGZyb20gJy4uL1B1c2gvUHVzaFF1ZXVlJztcbmltcG9ydCB7IFB1c2hXb3JrZXIgfSBmcm9tICcuLi9QdXNoL1B1c2hXb3JrZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5cbi8vIEFkYXB0ZXJzXG5pbXBvcnQgeyBHcmlkRlNCdWNrZXRBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvRmlsZXMvR3JpZEZTQnVja2V0QWRhcHRlcic7XG5pbXBvcnQgeyBXaW5zdG9uTG9nZ2VyQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0xvZ2dlci9XaW5zdG9uTG9nZ2VyQWRhcHRlcic7XG5pbXBvcnQgeyBJbk1lbW9yeUNhY2hlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL0luTWVtb3J5Q2FjaGVBZGFwdGVyJztcbmltcG9ydCB7IEFuYWx5dGljc0FkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9BbmFseXRpY3MvQW5hbHl0aWNzQWRhcHRlcic7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9Qb3N0Z3Jlcy9Qb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBQYXJzZVB1c2hBZGFwdGVyIGZyb20gJ0BwYXJzZS9wdXNoLWFkYXB0ZXInO1xuaW1wb3J0IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIgZnJvbSAnLi9QYXJzZUdyYXBoUUxDb250cm9sbGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250cm9sbGVycyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgY29uc3QgbG9nZ2VyQ29udHJvbGxlciA9IGdldExvZ2dlckNvbnRyb2xsZXIob3B0aW9ucyk7XG4gIGNvbnN0IGZpbGVzQ29udHJvbGxlciA9IGdldEZpbGVzQ29udHJvbGxlcihvcHRpb25zKTtcbiAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSBnZXRVc2VyQ29udHJvbGxlcihvcHRpb25zKTtcbiAgY29uc3Qge1xuICAgIHB1c2hDb250cm9sbGVyLFxuICAgIGhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0LFxuICAgIGhhc1B1c2hTdXBwb3J0LFxuICAgIHB1c2hDb250cm9sbGVyUXVldWUsXG4gICAgcHVzaFdvcmtlcixcbiAgfSA9IGdldFB1c2hDb250cm9sbGVyKG9wdGlvbnMpO1xuICBjb25zdCBjYWNoZUNvbnRyb2xsZXIgPSBnZXRDYWNoZUNvbnRyb2xsZXIob3B0aW9ucyk7XG4gIGNvbnN0IGFuYWx5dGljc0NvbnRyb2xsZXIgPSBnZXRBbmFseXRpY3NDb250cm9sbGVyKG9wdGlvbnMpO1xuICBjb25zdCBsaXZlUXVlcnlDb250cm9sbGVyID0gZ2V0TGl2ZVF1ZXJ5Q29udHJvbGxlcihvcHRpb25zKTtcbiAgY29uc3QgZGF0YWJhc2VDb250cm9sbGVyID0gZ2V0RGF0YWJhc2VDb250cm9sbGVyKG9wdGlvbnMpO1xuICBjb25zdCBob29rc0NvbnRyb2xsZXIgPSBnZXRIb29rc0NvbnRyb2xsZXIob3B0aW9ucywgZGF0YWJhc2VDb250cm9sbGVyKTtcbiAgY29uc3QgYXV0aERhdGFNYW5hZ2VyID0gZ2V0QXV0aERhdGFNYW5hZ2VyKG9wdGlvbnMpO1xuICBjb25zdCBwYXJzZUdyYXBoUUxDb250cm9sbGVyID0gZ2V0UGFyc2VHcmFwaFFMQ29udHJvbGxlcihvcHRpb25zLCB7XG4gICAgZGF0YWJhc2VDb250cm9sbGVyLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgfSk7XG4gIHJldHVybiB7XG4gICAgbG9nZ2VyQ29udHJvbGxlcixcbiAgICBmaWxlc0NvbnRyb2xsZXIsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgcHVzaENvbnRyb2xsZXIsXG4gICAgaGFzUHVzaFNjaGVkdWxlZFN1cHBvcnQsXG4gICAgaGFzUHVzaFN1cHBvcnQsXG4gICAgcHVzaFdvcmtlcixcbiAgICBwdXNoQ29udHJvbGxlclF1ZXVlLFxuICAgIGFuYWx5dGljc0NvbnRyb2xsZXIsXG4gICAgY2FjaGVDb250cm9sbGVyLFxuICAgIHBhcnNlR3JhcGhRTENvbnRyb2xsZXIsXG4gICAgbGl2ZVF1ZXJ5Q29udHJvbGxlcixcbiAgICBkYXRhYmFzZUNvbnRyb2xsZXIsXG4gICAgaG9va3NDb250cm9sbGVyLFxuICAgIGF1dGhEYXRhTWFuYWdlcixcbiAgICBzY2hlbWFDYWNoZTogU2NoZW1hQ2FjaGUsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2dnZXJDb250cm9sbGVyKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucyk6IExvZ2dlckNvbnRyb2xsZXIge1xuICBjb25zdCB7XG4gICAgYXBwSWQsXG4gICAganNvbkxvZ3MsXG4gICAgbG9nc0ZvbGRlcixcbiAgICB2ZXJib3NlLFxuICAgIGxvZ0xldmVsLFxuICAgIG1heExvZ0ZpbGVzLFxuICAgIHNpbGVudCxcbiAgICBsb2dnZXJBZGFwdGVyLFxuICB9ID0gb3B0aW9ucztcbiAgY29uc3QgbG9nZ2VyT3B0aW9ucyA9IHtcbiAgICBqc29uTG9ncyxcbiAgICBsb2dzRm9sZGVyLFxuICAgIHZlcmJvc2UsXG4gICAgbG9nTGV2ZWwsXG4gICAgc2lsZW50LFxuICAgIG1heExvZ0ZpbGVzLFxuICB9O1xuICBjb25zdCBsb2dnZXJDb250cm9sbGVyQWRhcHRlciA9IGxvYWRBZGFwdGVyKGxvZ2dlckFkYXB0ZXIsIFdpbnN0b25Mb2dnZXJBZGFwdGVyLCBsb2dnZXJPcHRpb25zKTtcbiAgcmV0dXJuIG5ldyBMb2dnZXJDb250cm9sbGVyKGxvZ2dlckNvbnRyb2xsZXJBZGFwdGVyLCBhcHBJZCwgbG9nZ2VyT3B0aW9ucyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaWxlc0NvbnRyb2xsZXIob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKTogRmlsZXNDb250cm9sbGVyIHtcbiAgY29uc3QgeyBhcHBJZCwgZGF0YWJhc2VVUkksIGZpbGVzQWRhcHRlciwgZGF0YWJhc2VBZGFwdGVyLCBwcmVzZXJ2ZUZpbGVOYW1lLCBmaWxlS2V5IH0gPSBvcHRpb25zO1xuICBpZiAoIWZpbGVzQWRhcHRlciAmJiBkYXRhYmFzZUFkYXB0ZXIpIHtcbiAgICB0aHJvdyAnV2hlbiB1c2luZyBhbiBleHBsaWNpdCBkYXRhYmFzZSBhZGFwdGVyLCB5b3UgbXVzdCBhbHNvIHVzZSBhbiBleHBsaWNpdCBmaWxlc0FkYXB0ZXIuJztcbiAgfVxuICBjb25zdCBmaWxlc0NvbnRyb2xsZXJBZGFwdGVyID0gbG9hZEFkYXB0ZXIoZmlsZXNBZGFwdGVyLCAoKSA9PiB7XG4gICAgcmV0dXJuIG5ldyBHcmlkRlNCdWNrZXRBZGFwdGVyKGRhdGFiYXNlVVJJLCB7fSwgZmlsZUtleSk7XG4gIH0pO1xuICByZXR1cm4gbmV3IEZpbGVzQ29udHJvbGxlcihmaWxlc0NvbnRyb2xsZXJBZGFwdGVyLCBhcHBJZCwge1xuICAgIHByZXNlcnZlRmlsZU5hbWUsXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VXNlckNvbnRyb2xsZXIob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKTogVXNlckNvbnRyb2xsZXIge1xuICBjb25zdCB7IGFwcElkLCBlbWFpbEFkYXB0ZXIsIHZlcmlmeVVzZXJFbWFpbHMgfSA9IG9wdGlvbnM7XG4gIGNvbnN0IGVtYWlsQ29udHJvbGxlckFkYXB0ZXIgPSBsb2FkQWRhcHRlcihlbWFpbEFkYXB0ZXIpO1xuICByZXR1cm4gbmV3IFVzZXJDb250cm9sbGVyKGVtYWlsQ29udHJvbGxlckFkYXB0ZXIsIGFwcElkLCB7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDYWNoZUNvbnRyb2xsZXIob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKTogQ2FjaGVDb250cm9sbGVyIHtcbiAgY29uc3QgeyBhcHBJZCwgY2FjaGVBZGFwdGVyLCBjYWNoZVRUTCwgY2FjaGVNYXhTaXplIH0gPSBvcHRpb25zO1xuICBjb25zdCBjYWNoZUNvbnRyb2xsZXJBZGFwdGVyID0gbG9hZEFkYXB0ZXIoY2FjaGVBZGFwdGVyLCBJbk1lbW9yeUNhY2hlQWRhcHRlciwge1xuICAgIGFwcElkOiBhcHBJZCxcbiAgICB0dGw6IGNhY2hlVFRMLFxuICAgIG1heFNpemU6IGNhY2hlTWF4U2l6ZSxcbiAgfSk7XG4gIHJldHVybiBuZXcgQ2FjaGVDb250cm9sbGVyKGNhY2hlQ29udHJvbGxlckFkYXB0ZXIsIGFwcElkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFBhcnNlR3JhcGhRTENvbnRyb2xsZXIoXG4gIG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucyxcbiAgY29udHJvbGxlckRlcHNcbik6IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIge1xuICByZXR1cm4gbmV3IFBhcnNlR3JhcGhRTENvbnRyb2xsZXIoe1xuICAgIG1vdW50R3JhcGhRTDogb3B0aW9ucy5tb3VudEdyYXBoUUwsXG4gICAgLi4uY29udHJvbGxlckRlcHMsXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QW5hbHl0aWNzQ29udHJvbGxlcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpOiBBbmFseXRpY3NDb250cm9sbGVyIHtcbiAgY29uc3QgeyBhbmFseXRpY3NBZGFwdGVyIH0gPSBvcHRpb25zO1xuICBjb25zdCBhbmFseXRpY3NDb250cm9sbGVyQWRhcHRlciA9IGxvYWRBZGFwdGVyKGFuYWx5dGljc0FkYXB0ZXIsIEFuYWx5dGljc0FkYXB0ZXIpO1xuICByZXR1cm4gbmV3IEFuYWx5dGljc0NvbnRyb2xsZXIoYW5hbHl0aWNzQ29udHJvbGxlckFkYXB0ZXIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGl2ZVF1ZXJ5Q29udHJvbGxlcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpOiBMaXZlUXVlcnlDb250cm9sbGVyIHtcbiAgcmV0dXJuIG5ldyBMaXZlUXVlcnlDb250cm9sbGVyKG9wdGlvbnMubGl2ZVF1ZXJ5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERhdGFiYXNlQ29udHJvbGxlcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpOiBEYXRhYmFzZUNvbnRyb2xsZXIge1xuICBjb25zdCB7IGRhdGFiYXNlVVJJLCBjb2xsZWN0aW9uUHJlZml4LCBkYXRhYmFzZU9wdGlvbnMgfSA9IG9wdGlvbnM7XG4gIGxldCB7IGRhdGFiYXNlQWRhcHRlciB9ID0gb3B0aW9ucztcbiAgaWYgKFxuICAgIChkYXRhYmFzZU9wdGlvbnMgfHxcbiAgICAgIChkYXRhYmFzZVVSSSAmJiBkYXRhYmFzZVVSSSAhPT0gZGVmYXVsdHMuZGF0YWJhc2VVUkkpIHx8XG4gICAgICBjb2xsZWN0aW9uUHJlZml4ICE9PSBkZWZhdWx0cy5jb2xsZWN0aW9uUHJlZml4KSAmJlxuICAgIGRhdGFiYXNlQWRhcHRlclxuICApIHtcbiAgICB0aHJvdyAnWW91IGNhbm5vdCBzcGVjaWZ5IGJvdGggYSBkYXRhYmFzZUFkYXB0ZXIgYW5kIGEgZGF0YWJhc2VVUkkvZGF0YWJhc2VPcHRpb25zL2NvbGxlY3Rpb25QcmVmaXguJztcbiAgfSBlbHNlIGlmICghZGF0YWJhc2VBZGFwdGVyKSB7XG4gICAgZGF0YWJhc2VBZGFwdGVyID0gZ2V0RGF0YWJhc2VBZGFwdGVyKGRhdGFiYXNlVVJJLCBjb2xsZWN0aW9uUHJlZml4LCBkYXRhYmFzZU9wdGlvbnMpO1xuICB9IGVsc2Uge1xuICAgIGRhdGFiYXNlQWRhcHRlciA9IGxvYWRBZGFwdGVyKGRhdGFiYXNlQWRhcHRlcik7XG4gIH1cbiAgcmV0dXJuIG5ldyBEYXRhYmFzZUNvbnRyb2xsZXIoZGF0YWJhc2VBZGFwdGVyLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEhvb2tzQ29udHJvbGxlcihcbiAgb3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLFxuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlclxuKTogSG9va3NDb250cm9sbGVyIHtcbiAgY29uc3QgeyBhcHBJZCwgd2ViaG9va0tleSB9ID0gb3B0aW9ucztcbiAgcmV0dXJuIG5ldyBIb29rc0NvbnRyb2xsZXIoYXBwSWQsIGRhdGFiYXNlQ29udHJvbGxlciwgd2ViaG9va0tleSk7XG59XG5cbmludGVyZmFjZSBQdXNoQ29udHJvbGxpbmcge1xuICBwdXNoQ29udHJvbGxlcjogUHVzaENvbnRyb2xsZXI7XG4gIGhhc1B1c2hTY2hlZHVsZWRTdXBwb3J0OiBib29sZWFuO1xuICBwdXNoQ29udHJvbGxlclF1ZXVlOiBQdXNoUXVldWU7XG4gIHB1c2hXb3JrZXI6IFB1c2hXb3JrZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQdXNoQ29udHJvbGxlcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpOiBQdXNoQ29udHJvbGxpbmcge1xuICBjb25zdCB7IHNjaGVkdWxlZFB1c2gsIHB1c2ggfSA9IG9wdGlvbnM7XG5cbiAgY29uc3QgcHVzaE9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCBwdXNoKTtcbiAgY29uc3QgcHVzaFF1ZXVlT3B0aW9ucyA9IHB1c2hPcHRpb25zLnF1ZXVlT3B0aW9ucyB8fCB7fTtcbiAgaWYgKHB1c2hPcHRpb25zLnF1ZXVlT3B0aW9ucykge1xuICAgIGRlbGV0ZSBwdXNoT3B0aW9ucy5xdWV1ZU9wdGlvbnM7XG4gIH1cblxuICAvLyBQYXNzIHRoZSBwdXNoIG9wdGlvbnMgdG9vIGFzIGl0IHdvcmtzIHdpdGggdGhlIGRlZmF1bHRcbiAgY29uc3QgcHVzaEFkYXB0ZXIgPSBsb2FkQWRhcHRlcihcbiAgICBwdXNoT3B0aW9ucyAmJiBwdXNoT3B0aW9ucy5hZGFwdGVyLFxuICAgIFBhcnNlUHVzaEFkYXB0ZXIsXG4gICAgcHVzaE9wdGlvbnNcbiAgKTtcbiAgLy8gV2UgcGFzcyB0aGUgb3B0aW9ucyBhbmQgdGhlIGJhc2UgY2xhc3MgZm9yIHRoZSBhZGF0cGVyLFxuICAvLyBOb3RlIHRoYXQgcGFzc2luZyBhbiBpbnN0YW5jZSB3b3VsZCB3b3JrIHRvb1xuICBjb25zdCBwdXNoQ29udHJvbGxlciA9IG5ldyBQdXNoQ29udHJvbGxlcigpO1xuICBjb25zdCBoYXNQdXNoU3VwcG9ydCA9ICEhKHB1c2hBZGFwdGVyICYmIHB1c2gpO1xuICBjb25zdCBoYXNQdXNoU2NoZWR1bGVkU3VwcG9ydCA9IGhhc1B1c2hTdXBwb3J0ICYmIHNjaGVkdWxlZFB1c2ggPT09IHRydWU7XG5cbiAgY29uc3QgeyBkaXNhYmxlUHVzaFdvcmtlciB9ID0gcHVzaFF1ZXVlT3B0aW9ucztcblxuICBjb25zdCBwdXNoQ29udHJvbGxlclF1ZXVlID0gbmV3IFB1c2hRdWV1ZShwdXNoUXVldWVPcHRpb25zKTtcbiAgbGV0IHB1c2hXb3JrZXI7XG4gIGlmICghZGlzYWJsZVB1c2hXb3JrZXIpIHtcbiAgICBwdXNoV29ya2VyID0gbmV3IFB1c2hXb3JrZXIocHVzaEFkYXB0ZXIsIHB1c2hRdWV1ZU9wdGlvbnMpO1xuICB9XG4gIHJldHVybiB7XG4gICAgcHVzaENvbnRyb2xsZXIsXG4gICAgaGFzUHVzaFN1cHBvcnQsXG4gICAgaGFzUHVzaFNjaGVkdWxlZFN1cHBvcnQsXG4gICAgcHVzaENvbnRyb2xsZXJRdWV1ZSxcbiAgICBwdXNoV29ya2VyLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QXV0aERhdGFNYW5hZ2VyKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBjb25zdCB7IGF1dGgsIGVuYWJsZUFub255bW91c1VzZXJzIH0gPSBvcHRpb25zO1xuICByZXR1cm4gYXV0aERhdGFNYW5hZ2VyKGF1dGgsIGVuYWJsZUFub255bW91c1VzZXJzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERhdGFiYXNlQWRhcHRlcihkYXRhYmFzZVVSSSwgY29sbGVjdGlvblByZWZpeCwgZGF0YWJhc2VPcHRpb25zKSB7XG4gIGxldCBwcm90b2NvbDtcbiAgdHJ5IHtcbiAgICBjb25zdCBwYXJzZWRVUkkgPSBuZXcgVVJMKGRhdGFiYXNlVVJJKTtcbiAgICBwcm90b2NvbCA9IHBhcnNlZFVSSS5wcm90b2NvbCA/IHBhcnNlZFVSSS5wcm90b2NvbC50b0xvd2VyQ2FzZSgpIDogbnVsbDtcbiAgfSBjYXRjaCAoZSkge1xuICAgIC8qICovXG4gIH1cbiAgc3dpdGNoIChwcm90b2NvbCkge1xuICAgIGNhc2UgJ3Bvc3RncmVzOic6XG4gICAgY2FzZSAncG9zdGdyZXNxbDonOlxuICAgICAgcmV0dXJuIG5ldyBQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyKHtcbiAgICAgICAgdXJpOiBkYXRhYmFzZVVSSSxcbiAgICAgICAgY29sbGVjdGlvblByZWZpeCxcbiAgICAgICAgZGF0YWJhc2VPcHRpb25zLFxuICAgICAgfSk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBuZXcgTW9uZ29TdG9yYWdlQWRhcHRlcih7XG4gICAgICAgIHVyaTogZGF0YWJhc2VVUkksXG4gICAgICAgIGNvbGxlY3Rpb25QcmVmaXgsXG4gICAgICAgIG1vbmdvT3B0aW9uczogZGF0YWJhc2VPcHRpb25zLFxuICAgICAgfSk7XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUdBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7O0FBRU8sU0FBU0EsY0FBVCxDQUF3QkMsT0FBeEIsRUFBcUQ7RUFDMUQsTUFBTUMsZ0JBQWdCLEdBQUdDLG1CQUFtQixDQUFDRixPQUFELENBQTVDO0VBQ0EsTUFBTUcsZUFBZSxHQUFHQyxrQkFBa0IsQ0FBQ0osT0FBRCxDQUExQztFQUNBLE1BQU1LLGNBQWMsR0FBR0MsaUJBQWlCLENBQUNOLE9BQUQsQ0FBeEM7RUFDQSxNQUFNO0lBQ0pPLGNBREk7SUFFSkMsdUJBRkk7SUFHSkMsY0FISTtJQUlKQyxtQkFKSTtJQUtKQztFQUxJLElBTUZDLGlCQUFpQixDQUFDWixPQUFELENBTnJCO0VBT0EsTUFBTWEsZUFBZSxHQUFHQyxrQkFBa0IsQ0FBQ2QsT0FBRCxDQUExQztFQUNBLE1BQU1lLG1CQUFtQixHQUFHQyxzQkFB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