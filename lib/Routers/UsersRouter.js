"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.UsersRouter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _Config = _interopRequireDefault(require("../Config"));

var _AccountLockout = _interopRequireDefault(require("../AccountLockout"));

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var _Auth = _interopRequireDefault(require("../Auth"));

var _password = _interopRequireDefault(require("../password"));

var _triggers = require("../triggers");

var _middlewares = require("../middlewares");

var _RestWrite = _interopRequireDefault(require("../RestWrite"));

var _FunctionsRouter = require("./FunctionsRouter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

class UsersRouter extends _ClassesRouter.default {
  className() {
    return '_User';
  }
  /**
   * Removes all "_" prefixed properties from an object, except "__type"
   * @param {Object} obj An object.
   */


  static removeHiddenProperties(obj) {
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Regexp comes from Parse.Object.prototype.validate
        if (key !== '__type' && !/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
          delete obj[key];
        }
      }
    }
  }
  /**
   * After retrieving a user directly from the database, we need to remove the
   * password from the object (for security), and fix an issue some SDKs have
   * with null values
   */


  _sanitizeAuthData(user) {
    delete user.password; // Sometimes the authData still has null on that keys
    // https://github.com/parse-community/parse-server/issues/935

    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });

      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }
  /**
   * Validates a password request in login and verifyPassword
   * @param {Object} req The request
   * @returns {Object} User object
   * @private
   */


  _authenticateUserFromRequest(req) {
    return new Promise((resolve, reject) => {
      // Use query parameters instead if provided in url
      let payload = req.body;

      if (!payload.username && req.query && req.query.username || !payload.email && req.query && req.query.email) {
        payload = req.query;
      }

      const {
        username,
        email,
        password
      } = payload; // TODO: use the right error codes / descriptions.

      if (!username && !email) {
        throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'username/email is required.');
      }

      if (!password) {
        throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'password is required.');
      }

      if (typeof password !== 'string' || email && typeof email !== 'string' || username && typeof username !== 'string') {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
      }

      let user;
      let isValidPassword = false;
      let query;

      if (email && username) {
        query = {
          email,
          username
        };
      } else if (email) {
        query = {
          email
        };
      } else {
        query = {
          $or: [{
            username
          }, {
            email: username
          }]
        };
      }

      return req.config.database.find('_User', query).then(results => {
        if (!results.length) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        if (results.length > 1) {
          // corner case where user1 has username == user2 email
          req.config.loggerController.warn("There is a user which email is the same as another user's username, logging in based on username");
          user = results.filter(user => user.username === username)[0];
        } else {
          user = results[0];
        }

        return _password.default.compare(password, user.password);
      }).then(correct => {
        isValidPassword = correct;
        const accountLockoutPolicy = new _AccountLockout.default(user, req.config);
        return accountLockoutPolicy.handleLoginAttempt(isValidPassword);
      }).then(() => {
        if (!isValidPassword) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        } // Ensure the user isn't locked out
        // A locked out user won't be able to login
        // To lock a user out, just set the ACL to `masterKey` only  ({}).
        // Empty ACL is OK


        if (!req.auth.isMaster && user.ACL && Object.keys(user.ACL).length == 0) {
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Invalid username/password.');
        }

        if (req.config.verifyUserEmails && req.config.preventLoginWithUnverifiedEmail && !user.emailVerified) {
          throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
        }

        this._sanitizeAuthData(user);

        return resolve(user);
      }).catch(error => {
        return reject(error);
      });
    });
  }

  handleMe(req) {
    if (!req.info || !req.info.sessionToken) {
      throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
    }

    const sessionToken = req.info.sessionToken;
    return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
      sessionToken
    }, {
      include: 'user'
    }, req.info.clientSDK, req.info.context).then(response => {
      if (!response.results || response.results.length == 0 || !response.results[0].user) {
        throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      } else {
        const user = response.results[0].user; // Send token back on the login, because SDKs expect that.

        user.sessionToken = sessionToken; // Remove hidden properties.

        UsersRouter.removeHiddenProperties(user);
        return {
          response: user
        };
      }
    });
  }

  async handleLogIn(req) {
    const user = await this._authenticateUserFromRequest(req); // handle password expiry policy

    if (req.config.passwordPolicy && req.config.passwordPolicy.maxPasswordAge) {
      let changedAt = user._password_changed_at;

      if (!changedAt) {
        // password was created before expiry policy was enabled.
        // simply update _User object so that it will start enforcing from now
        changedAt = new Date();
        req.config.database.update('_User', {
          username: user.username
        }, {
          _password_changed_at: _node.default._encode(changedAt)
        });
      } else {
        // check whether the password has expired
        if (changedAt.__type == 'Date') {
          changedAt = new Date(changedAt.iso);
        } // Calculate the expiry time.


        const expiresAt = new Date(changedAt.getTime() + 86400000 * req.config.passwordPolicy.maxPasswordAge);
        if (expiresAt < new Date()) // fail of current time is past password expiry time
          throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Your password has expired. Please reset your password.');
      }
    } // Remove hidden properties.


    UsersRouter.removeHiddenProperties(user);
    req.config.filesController.expandFilesInObject(req.config, user); // Before login trigger; throws if failure

    await (0, _triggers.maybeRunTrigger)(_triggers.Types.beforeLogin, req.auth, _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user)), null, req.config);

    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId: user.objectId,
      createdWith: {
        action: 'login',
        authProvider: 'password'
      },
      installationId: req.info.installationId
    });

    user.sessionToken = sessionData.sessionToken;
    await createSession();

    const afterLoginUser = _node.default.User.fromJSON(Object.assign({
      className: '_User'
    }, user));

    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogin, _objectSpread(_objectSpread({}, req.auth), {}, {
      user: afterLoginUser
    }), afterLoginUser, null, req.config);
    return {
      response: user
    };
  }
  /**
   * This allows master-key clients to create user sessions without access to
   * user credentials. This enables systems that can authenticate access another
   * way (API key, app administrators) to act on a user's behalf.
   *
   * We create a new session rather than looking for an existing session; we
   * want this to work in situations where the user is logged out on all
   * devices, since this can be used by automated systems acting on the user's
   * behalf.
   *
   * For the moment, we're omitting event hooks and lockout checks, since
   * immediate use cases suggest /loginAs could be used for semantically
   * different reasons from /login
   */


  async handleLogInAs(req) {
    if (!req.auth.isMaster) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, 'master key is required');
    }

    const userId = req.body.userId || req.query.userId;

    if (!userId) {
      throw new _node.default.Error(_node.default.Error.INVALID_VALUE, 'userId must not be empty, null, or undefined');
    }

    const queryResults = await req.config.database.find('_User', {
      objectId: userId
    });
    const user = queryResults[0];

    if (!user) {
      throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'user not found');
    }

    this._sanitizeAuthData(user);

    const {
      sessionData,
      createSession
    } = _RestWrite.default.createSession(req.config, {
      userId,
      createdWith: {
        action: 'login',
        authProvider: 'masterkey'
      },
      installationId: req.info.installationId
    });

    user.sessionToken = sessionData.sessionToken;
    await createSession();
    return {
      response: user
    };
  }

  handleVerifyPassword(req) {
    return this._authenticateUserFromRequest(req).then(user => {
      // Remove hidden properties.
      UsersRouter.removeHiddenProperties(user);
      return {
        response: user
      };
    }).catch(error => {
      throw error;
    });
  }

  handleLogOut(req) {
    const success = {
      response: {}
    };

    if (req.info && req.info.sessionToken) {
      return _rest.default.find(req.config, _Auth.default.master(req.config), '_Session', {
        sessionToken: req.info.sessionToken
      }, undefined, req.info.clientSDK, req.info.context).then(records => {
        if (records.results && records.results.length) {
          return _rest.default.del(req.config, _Auth.default.master(req.config), '_Session', records.results[0].objectId, req.info.context).then(() => {
            this._runAfterLogoutTrigger(req, records.results[0]);

            return Promise.resolve(success);
          });
        }

        return Promise.resolve(success);
      });
    }

    return Promise.resolve(success);
  }

  _runAfterLogoutTrigger(req, session) {
    // After logout trigger
    (0, _triggers.maybeRunTrigger)(_triggers.Types.afterLogout, req.auth, _node.default.Session.fromJSON(Object.assign({
      className: '_Session'
    }, session)), null, req.config);
  }

  _throwOnBadEmailConfig(req) {
    try {
      _Config.default.validateEmailConfiguration({
        emailAdapter: req.config.userController.adapter,
        appName: req.config.appName,
        publicServerURL: req.config.publicServerURL,
        emailVerifyTokenValidityDuration: req.config.emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid: req.config.emailVerifyTokenReuseIfValid
      });
    } catch (e) {
      if (typeof e === 'string') {
        // Maybe we need a Bad Configuration error, but the SDKs won't understand it. For now, Internal Server Error.
        throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'An appName, publicServerURL, and emailAdapter are required for password reset and email verification functionality.');
      } else {
        throw e;
      }
    }
  }

  handleResetRequest(req) {
    this._throwOnBadEmailConfig(req);

    const {
      email
    } = req.body;

    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }

    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }

    const userController = req.config.userController;
    return userController.sendPasswordResetEmail(email).then(() => {
      return Promise.resolve({
        response: {}
      });
    }, err => {
      if (err.code === _node.default.Error.OBJECT_NOT_FOUND) {
        // Return success so that this endpoint can't
        // be used to enumerate valid emails
        return Promise.resolve({
          response: {}
        });
      } else {
        throw err;
      }
    });
  }

  handleVerificationEmailRequest(req) {
    this._throwOnBadEmailConfig(req);

    const {
      email
    } = req.body;

    if (!email) {
      throw new _node.default.Error(_node.default.Error.EMAIL_MISSING, 'you must provide an email');
    }

    if (typeof email !== 'string') {
      throw new _node.default.Error(_node.default.Error.INVALID_EMAIL_ADDRESS, 'you must provide a valid email string');
    }

    return req.config.database.find('_User', {
      email: email
    }).then(results => {
      if (!results.length || results.length < 1) {
        throw new _node.default.Error(_node.default.Error.EMAIL_NOT_FOUND, `No user found with email ${email}`);
      }

      const user = results[0]; // remove password field, messes with saving on postgres

      delete user.password;

      if (user.emailVerified) {
        throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, `Email ${email} is already verified.`);
      }

      const userController = req.config.userController;
      return userController.regenerateEmailVerifyToken(user).then(() => {
        userController.sendVerificationEmail(user);
        return {
          response: {}
        };
      });
    });
  }

  handleVerifyEmail(req) {
    const {
      username,
      token: rawToken
    } = req.query;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username) {
      throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'Missing username');
    }

    if (!token) {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Missing token');
    }

    const userController = req.config.userController;
    return userController.verifyEmail(username, token).then(() => {
      return {
        response: {}
      };
    });
  }

  handleResetPassword(req) {
    const {
      username,
      new_password,
      token: rawToken
    } = req.body;
    const token = rawToken && typeof rawToken !== 'string' ? rawToken.toString() : rawToken;

    if (!username) {
      throw new _node.default.Error(_node.default.Error.USERNAME_MISSING, 'Missing username');
    }

    if (!token) {
      throw new _node.default.Error(_node.default.Error.OTHER_CAUSE, 'Missing token');
    }

    if (!new_password) {
      throw new _node.default.Error(_node.default.Error.PASSWORD_MISSING, 'Missing password');
    }

    return req.config.userController.updatePassword(username, token, new_password).then(() => {
      return {
        response: {}
      };
    });
  }

  mountRoutes() {
    this.route('GET', '/users', req => {
      return this.handleFind(req);
    });
    this.route('POST', '/users', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleCreate(req);
    });
    this.route('GET', '/users/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/users/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('PUT', '/users/:objectId', _middlewares.promiseEnsureIdempotency, req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/users/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('GET', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/login', req => {
      return this.handleLogIn(req);
    });
    this.route('POST', '/loginAs', req => {
      return this.handleLogInAs(req);
    });
    this.route('POST', '/logout', req => {
      return this.handleLogOut(req);
    });
    this.route('POST', '/requestPasswordReset', req => {
      return this.handleResetRequest(req);
    });
    this.route('POST', '/verificationEmailRequest', req => {
      return this.handleVerificationEmailRequest(req);
    });
    this.route('GET', '/verifyPassword', req => {
      return this.handleVerifyPassword(req);
    });
    this.route('POST', '/verifyEmail', req => {
      return this.handleVerifyEmail(req);
    });
    this.route('POST', '/resetPassword', req => {
      return this.handleResetPassword(req);
    }); // NOTE: An alias of cloud function

    this.route('POST', '/users/:functionName', req => {
      req.params.functionName = `${this.className()}.${req.params.functionName}`;
      return _FunctionsRouter.FunctionsRouter.handleCloudFunction(req);
    });
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVc2Vyc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwib2JqIiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidGVzdCIsIl9zYW5pdGl6ZUF1dGhEYXRhIiwidXNlciIsInBhc3N3b3JkIiwiYXV0aERhdGEiLCJrZXlzIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwibGVuZ3RoIiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiUmVzdFdyaXRlIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlVmVyaWZ5RW1haWwiLCJ0b2tlbiIsInJhd1Rva2VuIiwidG9TdHJpbmciLCJ2ZXJpZnlFbWFpbCIsImhhbmRsZVJlc2V0UGFzc3dvcmQiLCJuZXdfcGFzc3dvcmQiLCJ1cGRhdGVQYXNzd29yZCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIiwicGFyYW1zIiwiZnVuY3Rpb25OYW1lIiwiRnVuY3Rpb25zUm91dGVyIiwiaGFuZGxlQ2xvdWRGdW5jdGlvbiJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHsgbWF5YmVSdW5UcmlnZ2VyLCBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL0Z1bmN0aW9uc1JvdXRlcic7XG5cbmV4cG9ydCBjbGFzcyBVc2Vyc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfVXNlcic7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgXCJfXCIgcHJlZml4ZWQgcHJvcGVydGllcyBmcm9tIGFuIG9iamVjdCwgZXhjZXB0IFwiX190eXBlXCJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBBbiBvYmplY3QuXG4gICAqL1xuICBzdGF0aWMgcmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvYmopIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgICAgIGlmIChrZXkgIT09ICdfX3R5cGUnICYmICEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZnRlciByZXRyaWV2aW5nIGEgdXNlciBkaXJlY3RseSBmcm9tIHRoZSBkYXRhYmFzZSwgd2UgbmVlZCB0byByZW1vdmUgdGhlXG4gICAqIHBhc3N3b3JkIGZyb20gdGhlIG9iamVjdCAoZm9yIHNlY3VyaXR5KSwgYW5kIGZpeCBhbiBpc3N1ZSBzb21lIFNES3MgaGF2ZVxuICAgKiB3aXRoIG51bGwgdmFsdWVzXG4gICAqL1xuICBfc2FuaXRpemVBdXRoRGF0YSh1c2VyKSB7XG4gICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgJiZcbiAgICAgICAgICAgIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJlxuICAgICAgICAgICAgIXVzZXIuZW1haWxWZXJpZmllZFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGFsbG93cyBtYXN0ZXIta2V5IGNsaWVudHMgdG8gY3JlYXRlIHVzZXIgc2Vzc2lvbnMgd2l0aG91dCBhY2Nlc3MgdG9cbiAgICogdXNlciBjcmVkZW50aWFscy4gVGhpcyBlbmFibGVzIHN5c3RlbXMgdGhhdCBjYW4gYXV0aGVudGljYXRlIGFjY2VzcyBhbm90aGVyXG4gICAqIHdheSAoQVBJIGtleSwgYXBwIGFkbWluaXN0cmF0b3JzKSB0byBhY3Qgb24gYSB1c2VyJ3MgYmVoYWxmLlxuICAgKlxuICAgKiBXZSBjcmVhdGUgYSBuZXcgc2Vzc2lvbiByYXRoZXIgdGhhbiBsb29raW5nIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyB3ZVxuICAgKiB3YW50IHRoaXMgdG8gd29yayBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSB1c2VyIGlzIGxvZ2dlZCBvdXQgb24gYWxsXG4gICAqIGRldmljZXMsIHNpbmNlIHRoaXMgY2FuIGJlIHVzZWQgYnkgYXV0b21hdGVkIHN5c3RlbXMgYWN0aW5nIG9uIHRoZSB1c2VyJ3NcbiAgICogYmVoYWxmLlxuICAgKlxuICAgKiBGb3IgdGhlIG1vbWVudCwgd2UncmUgb21pdHRpbmcgZXZlbnQgaG9va3MgYW5kIGxvY2tvdXQgY2hlY2tzLCBzaW5jZVxuICAgKiBpbW1lZGlhdGUgdXNlIGNhc2VzIHN1Z2dlc3QgL2xvZ2luQXMgY291bGQgYmUgdXNlZCBmb3Igc2VtYW50aWNhbGx5XG4gICAqIGRpZmZlcmVudCByZWFzb25zIGZyb20gL2xvZ2luXG4gICAqL1xuICBhc3luYyBoYW5kbGVMb2dJbkFzKHJlcSkge1xuICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnbWFzdGVyIGtleSBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJJZCA9IHJlcS5ib2R5LnVzZXJJZCB8fCByZXEucXVlcnkudXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfVkFMVUUsXG4gICAgICAgICd1c2VySWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwsIG9yIHVuZGVmaW5lZCdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnlSZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHVzZXJJZCB9KTtcbiAgICBjb25zdCB1c2VyID0gcXVlcnlSZXN1bHRzWzBdO1xuICAgIGlmICghdXNlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICd1c2VyIG5vdCBmb3VuZCcpO1xuICAgIH1cblxuICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ21hc3RlcmtleScsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKSB7XG4gICAgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZUxvZ091dChyZXEpIHtcbiAgICBjb25zdCBzdWNjZXNzID0geyByZXNwb25zZToge30gfTtcbiAgICBpZiAocmVxLmluZm8gJiYgcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gcmVzdFxuICAgICAgICAuZmluZChcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlY29yZHMgPT4ge1xuICAgICAgICAgIGlmIChyZWNvcmRzLnJlc3VsdHMgJiYgcmVjb3Jkcy5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgICAgICAgLmRlbChcbiAgICAgICAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgICAgICAgcmVjb3Jkcy5yZXN1bHRzWzBdLm9iamVjdElkLFxuICAgICAgICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgcmVjb3Jkcy5yZXN1bHRzWzBdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gIH1cblxuICBfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgc2Vzc2lvbikge1xuICAgIC8vIEFmdGVyIGxvZ291dCB0cmlnZ2VyXG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5TZXNzaW9uLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfU2Vzc2lvbicgfSwgc2Vzc2lvbikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuICB9XG5cbiAgX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpIHtcbiAgICB0cnkge1xuICAgICAgQ29uZmlnLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyOiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWU6IHJlcS5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMOiByZXEuY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb246IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQ6IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAvLyBSZXR1cm4gc3VjY2VzcyBzbyB0aGF0IHRoaXMgZW5kcG9pbnQgY2FuJ3RcbiAgICAgICAgICAvLyBiZSB1c2VkIHRvIGVudW1lcmF0ZSB2YWxpZCBlbWFpbHNcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpLnRoZW4oKCkgPT4ge1xuICAgICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcik7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVWZXJpZnlFbWFpbChyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ01pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdNaXNzaW5nIHRva2VuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci52ZXJpZnlFbWFpbCh1c2VybmFtZSwgdG9rZW4pLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVSZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIG5ld19wYXNzd29yZCwgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEuYm9keTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ01pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdNaXNzaW5nIHRva2VuJyk7XG4gICAgfVxuXG4gICAgaWYgKCFuZXdfcGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAnTWlzc2luZyBwYXNzd29yZCcpO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLnVwZGF0ZVBhc3N3b3JkKHVzZXJuYW1lLCB0b2tlbiwgbmV3X3Bhc3N3b3JkKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbkFzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luQXMocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcblxuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmeUVtYWlsJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeUVtYWlsKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVzZXRQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgLy8gTk9URTogQW4gYWxpYXMgb2YgY2xvdWQgZnVuY3Rpb25cbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2Vycy86ZnVuY3Rpb25OYW1lJywgcmVxID0+IHtcbiAgICAgIHJlcS5wYXJhbXMuZnVuY3Rpb25OYW1lID0gYCR7dGhpcy5jbGFzc05hbWUoKX0uJHtyZXEucGFyYW1zLmZ1bmN0aW9uTmFtZX1gO1xuICAgICAgcmV0dXJuIEZ1bmN0aW9uc1JvdXRlci5oYW5kbGVDbG91ZEZ1bmN0aW9uKHJlcSk7XG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlcnNSb3V0ZXI7XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7OztBQUVPLE1BQU1BLFdBQU4sU0FBMEJDLHNCQUExQixDQUF3QztFQUM3Q0MsU0FBUyxHQUFHO0lBQ1YsT0FBTyxPQUFQO0VBQ0Q7RUFFRDtBQUNGO0FBQ0E7QUFDQTs7O0VBQytCLE9BQXRCQyxzQkFBc0IsQ0FBQ0MsR0FBRCxFQUFNO0lBQ2pDLEtBQUssSUFBSUMsR0FBVCxJQUFnQkQsR0FBaEIsRUFBcUI7TUFDbkIsSUFBSUUsTUFBTSxDQUFDQyxTQUFQLENBQWlCQyxjQUFqQixDQUFnQ0MsSUFBaEMsQ0FBcUNMLEdBQXJDLEVBQTBDQyxHQUExQyxDQUFKLEVBQW9EO1FBQ2xEO1FBQ0EsSUFBSUEsR0FBRyxLQUFLLFFBQVIsSUFBb0IsQ0FBQywwQkFBMEJLLElBQTFCLENBQStCTCxHQUEvQixDQUF6QixFQUE4RDtVQUM1RCxPQUFPRCxHQUFHLENBQUNDLEdBQUQsQ0FBVjtRQUNEO01BQ0Y7SUFDRjtFQUNGO0VBRUQ7QUFDRjtBQUNBO0FBQ0E7QUFDQTs7O0VBQ0VNLGlCQUFpQixDQUFDQyxJQUFELEVBQU87SUFDdEIsT0FBT0EsSUFBSSxDQUFDQyxRQUFaLENBRHNCLENBR3RCO0lBQ0E7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