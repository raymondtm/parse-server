"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _Options = require("./Options");

var _defaults = _interopRequireDefault(require("./defaults"));

var logging = _interopRequireWildcard(require("./logger"));

var _Config = _interopRequireDefault(require("./Config"));

var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));

var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));

var _AnalyticsRouter = require("./Routers/AnalyticsRouter");

var _ClassesRouter = require("./Routers/ClassesRouter");

var _FeaturesRouter = require("./Routers/FeaturesRouter");

var _FilesRouter = require("./Routers/FilesRouter");

var _FunctionsRouter = require("./Routers/FunctionsRouter");

var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");

var _GraphQLRouter = require("./Routers/GraphQLRouter");

var _HooksRouter = require("./Routers/HooksRouter");

var _IAPValidationRouter = require("./Routers/IAPValidationRouter");

var _InstallationsRouter = require("./Routers/InstallationsRouter");

var _LogsRouter = require("./Routers/LogsRouter");

var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");

var _PushRouter = require("./Routers/PushRouter");

var _CloudCodeRouter = require("./Routers/CloudCodeRouter");

var _RolesRouter = require("./Routers/RolesRouter");

var _SchemasRouter = require("./Routers/SchemasRouter");

var _SessionsRouter = require("./Routers/SessionsRouter");

var _UsersRouter = require("./Routers/UsersRouter");

var _PurgeRouter = require("./Routers/PurgeRouter");

var _AudiencesRouter = require("./Routers/AudiencesRouter");

var _AggregateRouter = require("./Routers/AggregateRouter");

var _ParseServerRESTController = require("./ParseServerRESTController");

var controllers = _interopRequireWildcard(require("./Controllers"));

var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");

var _SecurityRouter = require("./Routers/SecurityRouter");

var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));

var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));

var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// ParseServer - open-source compatible API Server for Parse apps
var batch = require('./batch'),
    bodyParser = require('body-parser'),
    express = require('express'),
    middlewares = require('./middlewares'),
    Parse = require('parse/node').Parse,
    {
  parse
} = require('graphql'),
    path = require('path'),
    fs = require('fs');

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud(); // ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html

class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options); // Set option defaults


    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      cloud,
      security,
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!'),
      serverStartComplete,
      schema
    } = options; // Initialize the node client SDK automatically

    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    const allControllers = controllers.getControllers(options);
    const {
      loggerController,
      databaseController,
      hooksController
    } = allControllers;
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(loggerController); // Note: Tests will start to fail if any validation happens after this is called.

    databaseController.performInitialization().then(() => hooksController.load()).then(async () => {
      if (schema) {
        await new _DefinedSchemas.DefinedSchemas(schema, this.config).execute();
      }

      if (serverStartComplete) {
        serverStartComplete();
      }
    }).catch(error => {
      if (serverStartComplete) {
        serverStartComplete(error);
      } else {
        console.error(error);
        process.exit(1);
      }
    });

    if (cloud) {
      addParseCloud();

      if (typeof cloud === 'function') {
        cloud(Parse);
      } else if (typeof cloud === 'string') {
        require(path.resolve(process.cwd(), cloud));
      } else {
        throw "argument 'cloud' must either be a string or a function";
      }
    }

    if (security && security.enableCheck && security.enableCheckLog) {
      new _CheckRunner.default(options.security).run();
    }
  }

  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }

    return this._app;
  }

  handleShutdown() {
    const promises = [];
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;

    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }

    const {
      adapter: fileAdapter
    } = this.config.filesController;

    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }

    const {
      adapter: cacheAdapter
    } = this.config.cacheController;

    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }

    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
  }
  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */


  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess
    } = options; // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.

    var api = express(); //api.use("/apps", express.static(__dirname + "/public"));

    api.use(middlewares.allowCrossDomain(appId)); // File handling needs to be before default middlewares are applied

    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.json({
        status: 'ok'
      });
    });
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors); // run the following when not testing

    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test

      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          throw err;
        }
      }); // verify the server url after a 'mount' event is received

      /* istanbul ignore next */

      api.on('mount', function () {
        ParseServer.verifyServerUrl();
      });
    }

    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }

    return api;
  }

  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }
  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  start(options, callback) {
    const app = express();

    if (options.middleware) {
      let middleware;

      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }

      app.use(middleware);
    }

    app.use(options.mountPath, this.app);

    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;

      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }

      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });

      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }

      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }

    const server = app.listen(options.port, options.host, callback);
    this.server = server;

    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    /* istanbul ignore next */


    if (!process.env.TESTING) {
      configureListeners(this);
    }

    this.expressApp = app;
    return this;
  }
  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  static start(options, callback) {
    const parseServer = new ParseServer(options);
    return parseServer.start(options, callback);
  }
  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {ParseLiveQueryServer} the live query server instance
   */


  static createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }

    return new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
  }

  static verifyServerUrl(callback) {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const request = require('./request');

      request({
        url: Parse.serverURL.replace(/\/$/, '') + '/health'
      }).catch(response => response).then(response => {
        const json = response.data || null;

        if (response.status !== 200 || !json || json && json.status !== 'ok') {
          /* eslint-disable no-console */
          console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
          /* eslint-enable no-console */

          if (callback) {
            callback(false);
          }
        } else {
          if (callback) {
            callback(true);
          }
        }
      });
    }
  }

}

function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');

  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });

  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  } // Reserved Characters


  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;

    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  } // Backwards compatibility


  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])])); // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.

    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }

    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  } // Merge protectedFields options with defaults.


  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];

    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
  options.masterKeyIps = Array.from(new Set(options.masterKeyIps.concat(_defaults.default.masterKeyIps, options.masterKeyIps)));
} // Those can't be tested as it requires a subprocess

/* istanbul ignore next */


function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */

  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });

  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };

  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

var _default = ParseServer;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXJzZSIsInBhdGgiLCJmcyIsImFkZFBhcnNlQ2xvdWQiLCJQYXJzZVNlcnZlciIsImNvbnN0cnVjdG9yIiwib3B0aW9ucyIsIkRlcHJlY2F0b3IiLCJzY2FuUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsInJlcXVpcmVkUGFyYW1ldGVyIiwibWFzdGVyS2V5IiwiY2xvdWQiLCJzZWN1cml0eSIsImphdmFzY3JpcHRLZXkiLCJzZXJ2ZXJVUkwiLCJzZXJ2ZXJTdGFydENvbXBsZXRlIiwic2NoZW1hIiwiaW5pdGlhbGl6ZSIsImFsbENvbnRyb2xsZXJzIiwiY29udHJvbGxlcnMiLCJnZXRDb250cm9sbGVycyIsImxvZ2dlckNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJob29rc0NvbnRyb2xsZXIiLCJjb25maWciLCJDb25maWciLCJwdXQiLCJPYmplY3QiLCJhc3NpZ24iLCJsb2dnaW5nIiwic2V0TG9nZ2VyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwidGhlbiIsImxvYWQiLCJEZWZpbmVkU2NoZW1hcyIsImV4ZWN1dGUiLCJjYXRjaCIsImVycm9yIiwiY29uc29sZSIsInByb2Nlc3MiLCJleGl0IiwicmVzb2x2ZSIsImN3ZCIsImVuYWJsZUNoZWNrIiwiZW5hYmxlQ2hlY2tMb2ciLCJDaGVja1J1bm5lciIsInJ1biIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsInByb21pc2VzIiwiYWRhcHRlciIsImRhdGFiYXNlQWRhcHRlciIsInB1c2giLCJmaWxlQWRhcHRlciIsImZpbGVzQ29udHJvbGxlciIsImNhY2hlQWRhcHRlciIsImNhY2hlQ29udHJvbGxlciIsImxlbmd0aCIsIlByb21pc2UiLCJhbGwiLCJzZXJ2ZXJDbG9zZUNvbXBsZXRlIiwibWF4VXBsb2FkU2l6ZSIsImRpcmVjdEFjY2VzcyIsImFwaSIsInVzZSIsImFsbG93Q3Jvc3NEb21haW4iLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJyZXMiLCJqc29uIiwic3RhdHVzIiwidHlwZSIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsImVudiIsIlRFU1RJTkciLCJvbiIsImVyciIsImNvZGUiLCJzdGRlcnIiLCJ3cml0ZSIsInBvcnQiLCJ2ZXJpZnlTZXJ2ZXJVcmwiLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsIlBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJHcmFwaFFMUm91dGVyIiwiUHVyZ2VSb3V0ZXIiLCJIb29rc1JvdXRlciIsIkNsb3VkQ29kZVJvdXRlciIsIkF1ZGllbmNlc1JvdXRlciIsIkFnZ3JlZ2F0ZVJvdXRlciIsIlNlY3VyaXR5Um91dGVyIiwicm91dGVzIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydCIsImNhbGxiYWNrIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsImdyYXBoUUxDdXN0b21UeXBlRGVmcyIsInVuZGVmaW5lZCIsImdyYXBoUUxTY2hlbWEiLCJyZWFkRmlsZVN5bmMiLCJwYXJzZUdyYXBoUUxTZXJ2ZXIiLCJQYXJzZUdyYXBoUUxTZXJ2ZXIiLCJncmFwaFFMUGF0aCIsInBsYXlncm91bmRQYXRoIiwiYXBwbHlHcmFwaFFMIiwiYXBwbHlQbGF5Z3JvdW5kIiwic2VydmVyIiwibGlzdGVuIiwiaG9zdCIsInN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIiwibGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyIsImxpdmVRdWVyeVNlcnZlciIsImNyZWF0ZUxpdmVRdWVyeVNlcnZlciIsImNvbmZpZ3VyZUxpc3RlbmVycyIsImV4cHJlc3NBcHAiLCJwYXJzZVNlcnZlciIsImh0dHBTZXJ2ZXIiLCJjcmVhdGVTZXJ2ZXIiLCJQYXJzZUxpdmVRdWVyeVNlcnZlciIsInJlcXVlc3QiLCJ1cmwiLCJyZXBsYWNlIiwicmVzcG9uc2UiLCJkYXRhIiwid2FybiIsIlBhcnNlQ2xvdWQiLCJDbG91ZCIsImdsb2JhbCIsImtleXMiLCJkZWZhdWx0cyIsImZvckVhY2giLCJrZXkiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJyZWdleCIsIm1hdGNoIiwidXNlclNlbnNpdGl2ZUZpZWxkcyIsIkFycmF5IiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInIiLCJ1bnEiLCJtYXN0ZXJLZXlJcHMiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsImUiLCJzdGRvdXQiLCJjbG9zZSJdLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGJvZHlQYXJzZXIgPSByZXF1aXJlKCdib2R5LXBhcnNlcicpLFxuICBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpLFxuICBtaWRkbGV3YXJlcyA9IHJlcXVpcmUoJy4vbWlkZGxld2FyZXMnKSxcbiAgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2UsXG4gIHsgcGFyc2UgfSA9IHJlcXVpcmUoJ2dyYXBocWwnKSxcbiAgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKSxcbiAgZnMgPSByZXF1aXJlKCdmcycpO1xuXG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMsIExpdmVRdWVyeVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnO1xuaW1wb3J0ICogYXMgbG9nZ2luZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgeyBBbmFseXRpY3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQW5hbHl0aWNzUm91dGVyJztcbmltcG9ydCB7IENsYXNzZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgeyBGZWF0dXJlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GZWF0dXJlc1JvdXRlcic7XG5pbXBvcnQgeyBGaWxlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GaWxlc1JvdXRlcic7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcbmltcG9ydCB7IEdsb2JhbENvbmZpZ1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9HbG9iYWxDb25maWdSb3V0ZXInO1xuaW1wb3J0IHsgR3JhcGhRTFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9HcmFwaFFMUm91dGVyJztcbmltcG9ydCB7IEhvb2tzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0hvb2tzUm91dGVyJztcbmltcG9ydCB7IElBUFZhbGlkYXRpb25Sb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSUFQVmFsaWRhdGlvblJvdXRlcic7XG5pbXBvcnQgeyBJbnN0YWxsYXRpb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0luc3RhbGxhdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgTG9nc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Mb2dzUm91dGVyJztcbmltcG9ydCB7IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyIH0gZnJvbSAnLi9MaXZlUXVlcnkvUGFyc2VMaXZlUXVlcnlTZXJ2ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5pbXBvcnQgeyBTZWN1cml0eVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZWN1cml0eVJvdXRlcic7XG5pbXBvcnQgQ2hlY2tSdW5uZXIgZnJvbSAnLi9TZWN1cml0eS9DaGVja1J1bm5lcic7XG5pbXBvcnQgRGVwcmVjYXRvciBmcm9tICcuL0RlcHJlY2F0b3IvRGVwcmVjYXRvcic7XG5pbXBvcnQgeyBEZWZpbmVkU2NoZW1hcyB9IGZyb20gJy4vU2NoZW1hTWlncmF0aW9ucy9EZWZpbmVkU2NoZW1hcyc7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBQYXJzZVNlcnZlciB3b3JrcyBsaWtlIGEgY29uc3RydWN0b3Igb2YgYW4gZXhwcmVzcyBhcHAuXG4vLyBodHRwczovL3BhcnNlcGxhdGZvcm0ub3JnL3BhcnNlLXNlcnZlci9hcGkvbWFzdGVyL1BhcnNlU2VydmVyT3B0aW9ucy5odG1sXG5jbGFzcyBQYXJzZVNlcnZlciB7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICAvLyBTY2FuIGZvciBkZXByZWNhdGVkIFBhcnNlIFNlcnZlciBvcHRpb25zXG4gICAgRGVwcmVjYXRvci5zY2FuUGFyc2VTZXJ2ZXJPcHRpb25zKG9wdGlvbnMpO1xuICAgIC8vIFNldCBvcHRpb24gZGVmYXVsdHNcbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBjbG91ZCxcbiAgICAgIHNlY3VyaXR5LFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZSxcbiAgICAgIHNjaGVtYSxcbiAgICB9ID0gb3B0aW9ucztcbiAgICAvLyBJbml0aWFsaXplIHRoZSBub2RlIGNsaWVudCBTREsgYXV0b21hdGljYWxseVxuICAgIFBhcnNlLmluaXRpYWxpemUoYXBwSWQsIGphdmFzY3JpcHRLZXkgfHwgJ3VudXNlZCcsIG1hc3RlcktleSk7XG4gICAgUGFyc2Uuc2VydmVyVVJMID0gc2VydmVyVVJMO1xuXG4gICAgY29uc3QgYWxsQ29udHJvbGxlcnMgPSBjb250cm9sbGVycy5nZXRDb250cm9sbGVycyhvcHRpb25zKTtcblxuICAgIGNvbnN0IHsgbG9nZ2VyQ29udHJvbGxlciwgZGF0YWJhc2VDb250cm9sbGVyLCBob29rc0NvbnRyb2xsZXIgfSA9IGFsbENvbnRyb2xsZXJzO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLnB1dChPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCBhbGxDb250cm9sbGVycykpO1xuXG4gICAgbG9nZ2luZy5zZXRMb2dnZXIobG9nZ2VyQ29udHJvbGxlcik7XG5cbiAgICAvLyBOb3RlOiBUZXN0cyB3aWxsIHN0YXJ0IHRvIGZhaWwgaWYgYW55IHZhbGlkYXRpb24gaGFwcGVucyBhZnRlciB0aGlzIGlzIGNhbGxlZC5cbiAgICBkYXRhYmFzZUNvbnRyb2xsZXJcbiAgICAgIC5wZXJmb3JtSW5pdGlhbGl6YXRpb24oKVxuICAgICAgLnRoZW4oKCkgPT4gaG9va3NDb250cm9sbGVyLmxvYWQoKSlcbiAgICAgIC50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIGF3YWl0IG5ldyBEZWZpbmVkU2NoZW1hcyhzY2hlbWEsIHRoaXMuY29uZmlnKS5leGVjdXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlcnZlclN0YXJ0Q29tcGxldGUpIHtcbiAgICAgICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlKCk7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoZXJyb3IpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAoY2xvdWQpIHtcbiAgICAgIGFkZFBhcnNlQ2xvdWQoKTtcbiAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2xvdWQoUGFyc2UpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBcImFyZ3VtZW50ICdjbG91ZCcgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBmdW5jdGlvblwiO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzZWN1cml0eSAmJiBzZWN1cml0eS5lbmFibGVDaGVjayAmJiBzZWN1cml0eS5lbmFibGVDaGVja0xvZykge1xuICAgICAgbmV3IENoZWNrUnVubmVyKG9wdGlvbnMuc2VjdXJpdHkpLnJ1bigpO1xuICAgIH1cbiAgfVxuXG4gIGdldCBhcHAoKSB7XG4gICAgaWYgKCF0aGlzLl9hcHApIHtcbiAgICAgIHRoaXMuX2FwcCA9IFBhcnNlU2VydmVyLmFwcCh0aGlzLmNvbmZpZyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9hcHA7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IHsgYWRhcHRlcjogZGF0YWJhc2VBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXI7XG4gICAgaWYgKGRhdGFiYXNlQWRhcHRlciAmJiB0eXBlb2YgZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBmaWxlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGlmIChmaWxlQWRhcHRlciAmJiB0eXBlb2YgZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogY2FjaGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgaWYgKGNhY2hlQWRhcHRlciAmJiB0eXBlb2YgY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgcmV0dXJuIChwcm9taXNlcy5sZW5ndGggPiAwID8gUHJvbWlzZS5hbGwocHJvbWlzZXMpIDogUHJvbWlzZS5yZXNvbHZlKCkpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUpIHtcbiAgICAgICAgdGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdGF0aWNcbiAgICogQ3JlYXRlIGFuIGV4cHJlc3MgYXBwIGZvciB0aGUgcGFyc2Ugc2VydmVyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGxldCB5b3Ugc3BlY2lmeSB0aGUgbWF4VXBsb2FkU2l6ZSB3aGVuIGNyZWF0aW5nIHRoZSBleHByZXNzIGFwcCAgKi9cbiAgc3RhdGljIGFwcChvcHRpb25zKSB7XG4gICAgY29uc3QgeyBtYXhVcGxvYWRTaXplID0gJzIwbWInLCBhcHBJZCwgZGlyZWN0QWNjZXNzIH0gPSBvcHRpb25zO1xuICAgIC8vIFRoaXMgYXBwIHNlcnZlcyB0aGUgUGFyc2UgQVBJIGRpcmVjdGx5LlxuICAgIC8vIEl0J3MgdGhlIGVxdWl2YWxlbnQgb2YgaHR0cHM6Ly9hcGkucGFyc2UuY29tLzEgaW4gdGhlIGhvc3RlZCBQYXJzZSBBUEkuXG4gICAgdmFyIGFwaSA9IGV4cHJlc3MoKTtcbiAgICAvL2FwaS51c2UoXCIvYXBwc1wiLCBleHByZXNzLnN0YXRpYyhfX2Rpcm5hbWUgKyBcIi9wdWJsaWNcIikpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dDcm9zc0RvbWFpbihhcHBJZCkpO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24gKHJlcSwgcmVzKSB7XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShib2R5UGFyc2VyLmpzb24oeyB0eXBlOiAnKi8qJywgbGltaXQ6IG1heFVwbG9hZFNpemUgfSkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dNZXRob2RPdmVycmlkZSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMpO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAvLyB1c2VyLWZyaWVuZGx5IG1lc3NhZ2UgZm9yIHRoaXMgY29tbW9uIGVycm9yXG4gICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoYFVuYWJsZSB0byBsaXN0ZW4gb24gcG9ydCAke2Vyci5wb3J0fS4gVGhlIHBvcnQgaXMgYWxyZWFkeSBpbiB1c2UuYCk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgYXBpLm9uKCdtb3VudCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3MuZW52LlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MgPT09ICcxJyB8fCBkaXJlY3RBY2Nlc3MpIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcikpO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IEdyYXBoUUxSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgICBuZXcgU2VjdXJpdHlSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIHN0YXJ0ZWRcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGFydChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsIGNhbGxiYWNrOiA/KCkgPT4gdm9pZCkge1xuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cblxuICAgIGFwcC51c2Uob3B0aW9ucy5tb3VudFBhdGgsIHRoaXMuYXBwKTtcblxuICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCA9PT0gdHJ1ZSB8fCBvcHRpb25zLm1vdW50UGxheWdyb3VuZCA9PT0gdHJ1ZSkge1xuICAgICAgbGV0IGdyYXBoUUxDdXN0b21UeXBlRGVmcyA9IHVuZGVmaW5lZDtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnc3RyaW5nJykge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBwYXJzZShmcy5yZWFkRmlsZVN5bmMob3B0aW9ucy5ncmFwaFFMU2NoZW1hLCAndXRmOCcpKTtcbiAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdvYmplY3QnIHx8XG4gICAgICAgIHR5cGVvZiBvcHRpb25zLmdyYXBoUUxTY2hlbWEgPT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSBvcHRpb25zLmdyYXBoUUxTY2hlbWE7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHBhcnNlR3JhcGhRTFNlcnZlciA9IG5ldyBQYXJzZUdyYXBoUUxTZXJ2ZXIodGhpcywge1xuICAgICAgICBncmFwaFFMUGF0aDogb3B0aW9ucy5ncmFwaFFMUGF0aCxcbiAgICAgICAgcGxheWdyb3VuZFBhdGg6IG9wdGlvbnMucGxheWdyb3VuZFBhdGgsXG4gICAgICAgIGdyYXBoUUxDdXN0b21UeXBlRGVmcyxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5R3JhcGhRTChhcHApO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudFBsYXlncm91bmQpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5UGxheWdyb3VuZChhcHApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHNlcnZlciA9IGFwcC5saXN0ZW4ob3B0aW9ucy5wb3J0LCBvcHRpb25zLmhvc3QsIGNhbGxiYWNrKTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcblxuICAgIGlmIChvcHRpb25zLnN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIHx8IG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgICAgICBvcHRpb25zXG4gICAgICApO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLmV4cHJlc3NBcHAgPSBhcHA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBQYXJzZVNlcnZlciBhbmQgc3RhcnRzIGl0LlxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB1c2VkIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBoYXMgc3RhcnRlZFxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBzdGFydChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsIGNhbGxiYWNrOiA/KCkgPT4gdm9pZCkge1xuICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IFBhcnNlU2VydmVyKG9wdGlvbnMpO1xuICAgIHJldHVybiBwYXJzZVNlcnZlci5zdGFydChvcHRpb25zLCBjYWxsYmFjayk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvciB0aGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIG9wdGlvbnMgZm9yIHRoZSBQYXJzZVNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VMaXZlUXVlcnlTZXJ2ZXJ9IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICBodHRwU2VydmVyLFxuICAgIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnNcbiAgKSB7XG4gICAgaWYgKCFodHRwU2VydmVyIHx8IChjb25maWcgJiYgY29uZmlnLnBvcnQpKSB7XG4gICAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xuICAgICAgaHR0cFNlcnZlciA9IHJlcXVpcmUoJ2h0dHAnKS5jcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgICAgIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0KTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcsIG9wdGlvbnMpO1xuICB9XG5cbiAgc3RhdGljIHZlcmlmeVNlcnZlclVybChjYWxsYmFjaykge1xuICAgIC8vIHBlcmZvcm0gYSBoZWFsdGggY2hlY2sgb24gdGhlIHNlcnZlclVSTCB2YWx1ZVxuICAgIGlmIChQYXJzZS5zZXJ2ZXJVUkwpIHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL3JlcXVlc3QnKTtcbiAgICAgIHJlcXVlc3QoeyB1cmw6IFBhcnNlLnNlcnZlclVSTC5yZXBsYWNlKC9cXC8kLywgJycpICsgJy9oZWFsdGgnIH0pXG4gICAgICAgIC5jYXRjaChyZXNwb25zZSA9PiByZXNwb25zZSlcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSByZXNwb25zZS5kYXRhIHx8IG51bGw7XG4gICAgICAgICAgaWYgKHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8ICFqc29uIHx8IChqc29uICYmIGpzb24uc3RhdHVzICE9PSAnb2snKSkge1xuICAgICAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgICAgICBgXFxuV0FSTklORywgVW5hYmxlIHRvIGNvbm5lY3QgdG8gJyR7UGFyc2Uuc2VydmVyVVJMfScuYCArXG4gICAgICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayhmYWxzZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICBjYWxsYmFjayh0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5XQVJOSU5HLCBhcHBJZCB0aGF0IGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycyBjYW4gY2F1c2UgaXNzdWVzIHdoaWxlIHVzaW5nIHdpdGggdXJscy5cXG5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4oZGVmYXVsdHMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSksIC4uLihvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pXSlcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzIGlzIHVuc2V0LFxuICAgIC8vIGl0J2xsIGJlIGFzc2lnbmVkIHRoZSBkZWZhdWx0IGFib3ZlLlxuICAgIC8vIEhlcmUsIHByb3RlY3QgYWdhaW5zdCB0aGUgY2FzZSB3aGVyZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAvLyBpcyBzZXQsIGJ1dCBkb2Vzbid0IGhhdmUgX1VzZXIuXG4gICAgaWYgKCEoJ19Vc2VyJyBpbiBvcHRpb25zLnByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzID0gT2JqZWN0LmFzc2lnbih7IF9Vc2VyOiBbXSB9LCBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgfVxuXG4gICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSB8fCBbXSksIC4uLnVzZXJTZW5zaXRpdmVGaWVsZHNdKVxuICAgICk7XG4gIH1cblxuICAvLyBNZXJnZSBwcm90ZWN0ZWRGaWVsZHMgb3B0aW9ucyB3aXRoIGRlZmF1bHRzLlxuICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHMpLmZvckVhY2goYyA9PiB7XG4gICAgY29uc3QgY3VyID0gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgaWYgKCFjdXIpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdID0gZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIH0gZWxzZSB7XG4gICAgICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY10pLmZvckVhY2gociA9PiB7XG4gICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSB8fCBbXSksXG4gICAgICAgICAgLi4uZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdW3JdLFxuICAgICAgICBdKTtcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIG9wdGlvbnMubWFzdGVyS2V5SXBzID0gQXJyYXkuZnJvbShcbiAgICBuZXcgU2V0KG9wdGlvbnMubWFzdGVyS2V5SXBzLmNvbmNhdChkZWZhdWx0cy5tYXN0ZXJLZXlJcHMsIG9wdGlvbnMubWFzdGVyS2V5SXBzKSlcbiAgKTtcbn1cblxuLy8gVGhvc2UgY2FuJ3QgYmUgdGVzdGVkIGFzIGl0IHJlcXVpcmVzIGEgc3VicHJvY2Vzc1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmZ1bmN0aW9uIGNvbmZpZ3VyZUxpc3RlbmVycyhwYXJzZVNlcnZlcikge1xuICBjb25zdCBzZXJ2ZXIgPSBwYXJzZVNlcnZlci5zZXJ2ZXI7XG4gIGNvbnN0IHNvY2tldHMgPSB7fTtcbiAgLyogQ3VycmVudGx5LCBleHByZXNzIGRvZXNuJ3Qgc2h1dCBkb3duIGltbWVkaWF0ZWx5IGFmdGVyIHJlY2VpdmluZyBTSUdJTlQvU0lHVEVSTSBpZiBpdCBoYXMgY2xpZW50IGNvbm5lY3Rpb25zIHRoYXQgaGF2ZW4ndCB0aW1lZCBvdXQuIChUaGlzIGlzIGEga25vd24gaXNzdWUgd2l0aCBub2RlIC0gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8yNjQyKVxuICAgIFRoaXMgZnVuY3Rpb24sIGFsb25nIHdpdGggYGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKClgLCBpbnRlbmQgdG8gZml4IHRoaXMgYmVoYXZpb3Igc3VjaCB0aGF0IHBhcnNlIHNlcnZlciB3aWxsIGNsb3NlIGFsbCBvcGVuIGNvbm5lY3Rpb25zIGFuZCBpbml0aWF0ZSB0aGUgc2h1dGRvd24gcHJvY2VzcyBhcyBzb29uIGFzIGl0IHJlY2VpdmVzIGEgU0lHSU5UL1NJR1RFUk0gc2lnbmFsLiAqL1xuICBzZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCBzb2NrZXQgPT4ge1xuICAgIGNvbnN0IHNvY2tldElkID0gc29ja2V0LnJlbW90ZUFkZHJlc3MgKyAnOicgKyBzb2NrZXQucmVtb3RlUG9ydDtcbiAgICBzb2NrZXRzW3NvY2tldElkXSA9IHNvY2tldDtcbiAgICBzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgZGVsZXRlIHNvY2tldHNbc29ja2V0SWRdO1xuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCBkZXN0cm95QWxpdmVDb25uZWN0aW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgICBmb3IgKGNvbnN0IHNvY2tldElkIGluIHNvY2tldHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHNvY2tldHNbc29ja2V0SWRdLmRlc3Ryb3koKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLyogKi9cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgY29uc3QgaGFuZGxlU2h1dGRvd24gPSBmdW5jdGlvbiAoKSB7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJ1Rlcm1pbmF0aW9uIHNpZ25hbCByZWNlaXZlZC4gU2h1dHRpbmcgZG93bi4nKTtcbiAgICBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpO1xuICAgIHNlcnZlci5jbG9zZSgpO1xuICAgIHBhcnNlU2VydmVyLmhhbmRsZVNodXRkb3duKCk7XG4gIH07XG4gIHByb2Nlc3Mub24oJ1NJR1RFUk0nLCBoYW5kbGVTaHV0ZG93bik7XG4gIHByb2Nlc3Mub24oJ1NJR0lOVCcsIGhhbmRsZVNodXRkb3duKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VTZXJ2ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFXQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUE1Q0E7QUFFQSxJQUFJQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxTQUFELENBQW5CO0FBQUEsSUFDRUMsVUFBVSxHQUFHRCxPQUFPLENBQUMsYUFBRCxDQUR0QjtBQUFBLElBRUVFLE9BQU8sR0FBR0YsT0FBTyxDQUFDLFNBQUQsQ0FGbkI7QUFBQSxJQUdFRyxXQUFXLEdBQUdILE9BQU8sQ0FBQyxlQUFELENBSHZCO0FBQUEsSUFJRUksS0FBSyxHQUFHSixPQUFPLENBQUMsWUFBRCxDQUFQ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