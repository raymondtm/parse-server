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
      req.params.className = this.className();
      return _FunctionsRouter.FunctionsRouter.handleCloudFunction(req);
    });
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVc2Vyc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwib2JqIiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidGVzdCIsIl9zYW5pdGl6ZUF1dGhEYXRhIiwidXNlciIsInBhc3N3b3JkIiwiYXV0aERhdGEiLCJrZXlzIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwibGVuZ3RoIiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiUmVzdFdyaXRlIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlVmVyaWZ5RW1haWwiLCJ0b2tlbiIsInJhd1Rva2VuIiwidG9TdHJpbmciLCJ2ZXJpZnlFbWFpbCIsImhhbmRsZVJlc2V0UGFzc3dvcmQiLCJuZXdfcGFzc3dvcmQiLCJ1cGRhdGVQYXNzd29yZCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIiwicGFyYW1zIiwiRnVuY3Rpb25zUm91dGVyIiwiaGFuZGxlQ2xvdWRGdW5jdGlvbiJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL1VzZXJzUm91dGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFRoZXNlIG1ldGhvZHMgaGFuZGxlIHRoZSBVc2VyLXJlbGF0ZWQgcm91dGVzLlxuXG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgQWNjb3VudExvY2tvdXQgZnJvbSAnLi4vQWNjb3VudExvY2tvdXQnO1xuaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcGFzc3dvcmRDcnlwdG8gZnJvbSAnLi4vcGFzc3dvcmQnO1xuaW1wb3J0IHsgbWF5YmVSdW5UcmlnZ2VyLCBUeXBlcyBhcyBUcmlnZ2VyVHlwZXMgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgeyBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kgfSBmcm9tICcuLi9taWRkbGV3YXJlcyc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4uL1Jlc3RXcml0ZSc7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL0Z1bmN0aW9uc1JvdXRlcic7XG5cbmV4cG9ydCBjbGFzcyBVc2Vyc1JvdXRlciBleHRlbmRzIENsYXNzZXNSb3V0ZXIge1xuICBjbGFzc05hbWUoKSB7XG4gICAgcmV0dXJuICdfVXNlcic7XG4gIH1cblxuICAvKipcbiAgICogUmVtb3ZlcyBhbGwgXCJfXCIgcHJlZml4ZWQgcHJvcGVydGllcyBmcm9tIGFuIG9iamVjdCwgZXhjZXB0IFwiX190eXBlXCJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9iaiBBbiBvYmplY3QuXG4gICAqL1xuICBzdGF0aWMgcmVtb3ZlSGlkZGVuUHJvcGVydGllcyhvYmopIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkge1xuICAgICAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgICAgIGlmIChrZXkgIT09ICdfX3R5cGUnICYmICEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgICAgIGRlbGV0ZSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBBZnRlciByZXRyaWV2aW5nIGEgdXNlciBkaXJlY3RseSBmcm9tIHRoZSBkYXRhYmFzZSwgd2UgbmVlZCB0byByZW1vdmUgdGhlXG4gICAqIHBhc3N3b3JkIGZyb20gdGhlIG9iamVjdCAoZm9yIHNlY3VyaXR5KSwgYW5kIGZpeCBhbiBpc3N1ZSBzb21lIFNES3MgaGF2ZVxuICAgKiB3aXRoIG51bGwgdmFsdWVzXG4gICAqL1xuICBfc2FuaXRpemVBdXRoRGF0YSh1c2VyKSB7XG4gICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAvLyBTb21ldGltZXMgdGhlIGF1dGhEYXRhIHN0aWxsIGhhcyBudWxsIG9uIHRoYXQga2V5c1xuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy85MzVcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyBhIHBhc3N3b3JkIHJlcXVlc3QgaW4gbG9naW4gYW5kIHZlcmlmeVBhc3N3b3JkXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXEgVGhlIHJlcXVlc3RcbiAgICogQHJldHVybnMge09iamVjdH0gVXNlciBvYmplY3RcbiAgICogQHByaXZhdGVcbiAgICovXG4gIF9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIC8vIFVzZSBxdWVyeSBwYXJhbWV0ZXJzIGluc3RlYWQgaWYgcHJvdmlkZWQgaW4gdXJsXG4gICAgICBsZXQgcGF5bG9hZCA9IHJlcS5ib2R5O1xuICAgICAgaWYgKFxuICAgICAgICAoIXBheWxvYWQudXNlcm5hbWUgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS51c2VybmFtZSkgfHxcbiAgICAgICAgKCFwYXlsb2FkLmVtYWlsICYmIHJlcS5xdWVyeSAmJiByZXEucXVlcnkuZW1haWwpXG4gICAgICApIHtcbiAgICAgICAgcGF5bG9hZCA9IHJlcS5xdWVyeTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdXNlcm5hbWUsIGVtYWlsLCBwYXNzd29yZCB9ID0gcGF5bG9hZDtcblxuICAgICAgLy8gVE9ETzogdXNlIHRoZSByaWdodCBlcnJvciBjb2RlcyAvIGRlc2NyaXB0aW9ucy5cbiAgICAgIGlmICghdXNlcm5hbWUgJiYgIWVtYWlsKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAndXNlcm5hbWUvZW1haWwgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoIXBhc3N3b3JkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQuJyk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZCAhPT0gJ3N0cmluZycgfHxcbiAgICAgICAgKGVtYWlsICYmIHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHx8XG4gICAgICAgICh1c2VybmFtZSAmJiB0eXBlb2YgdXNlcm5hbWUgIT09ICdzdHJpbmcnKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnSW52YWxpZCB1c2VybmFtZS9wYXNzd29yZC4nKTtcbiAgICAgIH1cblxuICAgICAgbGV0IHVzZXI7XG4gICAgICBsZXQgaXNWYWxpZFBhc3N3b3JkID0gZmFsc2U7XG4gICAgICBsZXQgcXVlcnk7XG4gICAgICBpZiAoZW1haWwgJiYgdXNlcm5hbWUpIHtcbiAgICAgICAgcXVlcnkgPSB7IGVtYWlsLCB1c2VybmFtZSB9O1xuICAgICAgfSBlbHNlIGlmIChlbWFpbCkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJ5ID0geyAkb3I6IFt7IHVzZXJuYW1lIH0sIHsgZW1haWw6IHVzZXJuYW1lIH1dIH07XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVxLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZCgnX1VzZXInLCBxdWVyeSlcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgIC8vIGNvcm5lciBjYXNlIHdoZXJlIHVzZXIxIGhhcyB1c2VybmFtZSA9PSB1c2VyMiBlbWFpbFxuICAgICAgICAgICAgcmVxLmNvbmZpZy5sb2dnZXJDb250cm9sbGVyLndhcm4oXG4gICAgICAgICAgICAgIFwiVGhlcmUgaXMgYSB1c2VyIHdoaWNoIGVtYWlsIGlzIHRoZSBzYW1lIGFzIGFub3RoZXIgdXNlcidzIHVzZXJuYW1lLCBsb2dnaW5nIGluIGJhc2VkIG9uIHVzZXJuYW1lXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICB1c2VyID0gcmVzdWx0cy5maWx0ZXIodXNlciA9PiB1c2VyLnVzZXJuYW1lID09PSB1c2VybmFtZSlbMF07XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKHBhc3N3b3JkLCB1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oY29ycmVjdCA9PiB7XG4gICAgICAgICAgaXNWYWxpZFBhc3N3b3JkID0gY29ycmVjdDtcbiAgICAgICAgICBjb25zdCBhY2NvdW50TG9ja291dFBvbGljeSA9IG5ldyBBY2NvdW50TG9ja291dCh1c2VyLCByZXEuY29uZmlnKTtcbiAgICAgICAgICByZXR1cm4gYWNjb3VudExvY2tvdXRQb2xpY3kuaGFuZGxlTG9naW5BdHRlbXB0KGlzVmFsaWRQYXNzd29yZCk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzVmFsaWRQYXNzd29yZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBFbnN1cmUgdGhlIHVzZXIgaXNuJ3QgbG9ja2VkIG91dFxuICAgICAgICAgIC8vIEEgbG9ja2VkIG91dCB1c2VyIHdvbid0IGJlIGFibGUgdG8gbG9naW5cbiAgICAgICAgICAvLyBUbyBsb2NrIGEgdXNlciBvdXQsIGp1c3Qgc2V0IHRoZSBBQ0wgdG8gYG1hc3RlcktleWAgb25seSAgKHt9KS5cbiAgICAgICAgICAvLyBFbXB0eSBBQ0wgaXMgT0tcbiAgICAgICAgICBpZiAoIXJlcS5hdXRoLmlzTWFzdGVyICYmIHVzZXIuQUNMICYmIE9iamVjdC5rZXlzKHVzZXIuQUNMKS5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICByZXEuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgJiZcbiAgICAgICAgICAgIHJlcS5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJlxuICAgICAgICAgICAgIXVzZXIuZW1haWxWZXJpZmllZFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgJ1VzZXIgZW1haWwgaXMgbm90IHZlcmlmaWVkLicpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICAgICAgICByZXR1cm4gcmVzb2x2ZSh1c2VyKTtcbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICByZXR1cm4gcmVqZWN0KGVycm9yKTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICBpZiAoIXJlcS5pbmZvIHx8ICFyZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdJbnZhbGlkIHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgc2Vzc2lvblRva2VuID0gcmVxLmluZm8uc2Vzc2lvblRva2VuO1xuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgICAgIHsgaW5jbHVkZTogJ3VzZXInIH0sXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fCAhcmVzcG9uc2UucmVzdWx0c1swXS51c2VyKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgLy8gU2VuZCB0b2tlbiBiYWNrIG9uIHRoZSBsb2dpbiwgYmVjYXVzZSBTREtzIGV4cGVjdCB0aGF0LlxuICAgICAgICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvblRva2VuO1xuXG4gICAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIGhhbmRsZUxvZ0luKHJlcSkge1xuICAgIGNvbnN0IHVzZXIgPSBhd2FpdCB0aGlzLl9hdXRoZW50aWNhdGVVc2VyRnJvbVJlcXVlc3QocmVxKTtcblxuICAgIC8vIGhhbmRsZSBwYXNzd29yZCBleHBpcnkgcG9saWN5XG4gICAgaWYgKHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgcmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgbGV0IGNoYW5nZWRBdCA9IHVzZXIuX3Bhc3N3b3JkX2NoYW5nZWRfYXQ7XG5cbiAgICAgIGlmICghY2hhbmdlZEF0KSB7XG4gICAgICAgIC8vIHBhc3N3b3JkIHdhcyBjcmVhdGVkIGJlZm9yZSBleHBpcnkgcG9saWN5IHdhcyBlbmFibGVkLlxuICAgICAgICAvLyBzaW1wbHkgdXBkYXRlIF9Vc2VyIG9iamVjdCBzbyB0aGF0IGl0IHdpbGwgc3RhcnQgZW5mb3JjaW5nIGZyb20gbm93XG4gICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKCk7XG4gICAgICAgIHJlcS5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgICAgIHsgX3Bhc3N3b3JkX2NoYW5nZWRfYXQ6IFBhcnNlLl9lbmNvZGUoY2hhbmdlZEF0KSB9XG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBoYXMgZXhwaXJlZFxuICAgICAgICBpZiAoY2hhbmdlZEF0Ll9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICBjaGFuZ2VkQXQgPSBuZXcgRGF0ZShjaGFuZ2VkQXQuaXNvKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGV4cGlyeSB0aW1lLlxuICAgICAgICBjb25zdCBleHBpcmVzQXQgPSBuZXcgRGF0ZShcbiAgICAgICAgICBjaGFuZ2VkQXQuZ2V0VGltZSgpICsgODY0MDAwMDAgKiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgICAgICk7XG4gICAgICAgIGlmIChleHBpcmVzQXQgPCBuZXcgRGF0ZSgpKVxuICAgICAgICAgIC8vIGZhaWwgb2YgY3VycmVudCB0aW1lIGlzIHBhc3QgcGFzc3dvcmQgZXhwaXJ5IHRpbWVcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ1lvdXIgcGFzc3dvcmQgaGFzIGV4cGlyZWQuIFBsZWFzZSByZXNldCB5b3VyIHBhc3N3b3JkLidcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJlbW92ZSBoaWRkZW4gcHJvcGVydGllcy5cbiAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgcmVxLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdChyZXEuY29uZmlnLCB1c2VyKTtcblxuICAgIC8vIEJlZm9yZSBsb2dpbiB0cmlnZ2VyOyB0aHJvd3MgaWYgZmFpbHVyZVxuICAgIGF3YWl0IG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5iZWZvcmVMb2dpbixcbiAgICAgIHJlcS5hdXRoLFxuICAgICAgUGFyc2UuVXNlci5mcm9tSlNPTihPYmplY3QuYXNzaWduKHsgY2xhc3NOYW1lOiAnX1VzZXInIH0sIHVzZXIpKSxcbiAgICAgIG51bGwsXG4gICAgICByZXEuY29uZmlnXG4gICAgKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdXNlci5vYmplY3RJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAncGFzc3dvcmQnLFxuICAgICAgfSxcbiAgICAgIGluc3RhbGxhdGlvbklkOiByZXEuaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcblxuICAgIHVzZXIuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuXG4gICAgYXdhaXQgY3JlYXRlU2Vzc2lvbigpO1xuXG4gICAgY29uc3QgYWZ0ZXJMb2dpblVzZXIgPSBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpO1xuICAgIG1heWJlUnVuVHJpZ2dlcihcbiAgICAgIFRyaWdnZXJUeXBlcy5hZnRlckxvZ2luLFxuICAgICAgeyAuLi5yZXEuYXV0aCwgdXNlcjogYWZ0ZXJMb2dpblVzZXIgfSxcbiAgICAgIGFmdGVyTG9naW5Vc2VyLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgfVxuXG4gIC8qKlxuICAgKiBUaGlzIGFsbG93cyBtYXN0ZXIta2V5IGNsaWVudHMgdG8gY3JlYXRlIHVzZXIgc2Vzc2lvbnMgd2l0aG91dCBhY2Nlc3MgdG9cbiAgICogdXNlciBjcmVkZW50aWFscy4gVGhpcyBlbmFibGVzIHN5c3RlbXMgdGhhdCBjYW4gYXV0aGVudGljYXRlIGFjY2VzcyBhbm90aGVyXG4gICAqIHdheSAoQVBJIGtleSwgYXBwIGFkbWluaXN0cmF0b3JzKSB0byBhY3Qgb24gYSB1c2VyJ3MgYmVoYWxmLlxuICAgKlxuICAgKiBXZSBjcmVhdGUgYSBuZXcgc2Vzc2lvbiByYXRoZXIgdGhhbiBsb29raW5nIGZvciBhbiBleGlzdGluZyBzZXNzaW9uOyB3ZVxuICAgKiB3YW50IHRoaXMgdG8gd29yayBpbiBzaXR1YXRpb25zIHdoZXJlIHRoZSB1c2VyIGlzIGxvZ2dlZCBvdXQgb24gYWxsXG4gICAqIGRldmljZXMsIHNpbmNlIHRoaXMgY2FuIGJlIHVzZWQgYnkgYXV0b21hdGVkIHN5c3RlbXMgYWN0aW5nIG9uIHRoZSB1c2VyJ3NcbiAgICogYmVoYWxmLlxuICAgKlxuICAgKiBGb3IgdGhlIG1vbWVudCwgd2UncmUgb21pdHRpbmcgZXZlbnQgaG9va3MgYW5kIGxvY2tvdXQgY2hlY2tzLCBzaW5jZVxuICAgKiBpbW1lZGlhdGUgdXNlIGNhc2VzIHN1Z2dlc3QgL2xvZ2luQXMgY291bGQgYmUgdXNlZCBmb3Igc2VtYW50aWNhbGx5XG4gICAqIGRpZmZlcmVudCByZWFzb25zIGZyb20gL2xvZ2luXG4gICAqL1xuICBhc3luYyBoYW5kbGVMb2dJbkFzKHJlcSkge1xuICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCAnbWFzdGVyIGtleSBpcyByZXF1aXJlZCcpO1xuICAgIH1cblxuICAgIGNvbnN0IHVzZXJJZCA9IHJlcS5ib2R5LnVzZXJJZCB8fCByZXEucXVlcnkudXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfVkFMVUUsXG4gICAgICAgICd1c2VySWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwsIG9yIHVuZGVmaW5lZCdcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnlSZXN1bHRzID0gYXdhaXQgcmVxLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHVzZXJJZCB9KTtcbiAgICBjb25zdCB1c2VyID0gcXVlcnlSZXN1bHRzWzBdO1xuICAgIGlmICghdXNlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICd1c2VyIG5vdCBmb3VuZCcpO1xuICAgIH1cblxuICAgIHRoaXMuX3Nhbml0aXplQXV0aERhdGEodXNlcik7XG5cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbihyZXEuY29uZmlnLCB7XG4gICAgICB1c2VySWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdsb2dpbicsXG4gICAgICAgIGF1dGhQcm92aWRlcjogJ21hc3RlcmtleScsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKSB7XG4gICAgcmV0dXJuIHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpXG4gICAgICAudGhlbih1c2VyID0+IHtcbiAgICAgICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHVzZXIpO1xuXG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZUxvZ091dChyZXEpIHtcbiAgICBjb25zdCBzdWNjZXNzID0geyByZXNwb25zZToge30gfTtcbiAgICBpZiAocmVxLmluZm8gJiYgcmVxLmluZm8uc2Vzc2lvblRva2VuKSB7XG4gICAgICByZXR1cm4gcmVzdFxuICAgICAgICAuZmluZChcbiAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgICByZXEuaW5mby5jbGllbnRTREssXG4gICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlY29yZHMgPT4ge1xuICAgICAgICAgIGlmIChyZWNvcmRzLnJlc3VsdHMgJiYgcmVjb3Jkcy5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIHJlc3RcbiAgICAgICAgICAgICAgLmRlbChcbiAgICAgICAgICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICAgICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAgICAgICAgICdfU2Vzc2lvbicsXG4gICAgICAgICAgICAgICAgcmVjb3Jkcy5yZXN1bHRzWzBdLm9iamVjdElkLFxuICAgICAgICAgICAgICAgIHJlcS5pbmZvLmNvbnRleHRcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgcmVjb3Jkcy5yZXN1bHRzWzBdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gIH1cblxuICBfcnVuQWZ0ZXJMb2dvdXRUcmlnZ2VyKHJlcSwgc2Vzc2lvbikge1xuICAgIC8vIEFmdGVyIGxvZ291dCB0cmlnZ2VyXG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9nb3V0LFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5TZXNzaW9uLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfU2Vzc2lvbicgfSwgc2Vzc2lvbikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuICB9XG5cbiAgX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpIHtcbiAgICB0cnkge1xuICAgICAgQ29uZmlnLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyOiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLmFkYXB0ZXIsXG4gICAgICAgIGFwcE5hbWU6IHJlcS5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMOiByZXEuY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb246IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQ6IHJlcS5jb25maWcuZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0eXBlb2YgZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLy8gTWF5YmUgd2UgbmVlZCBhIEJhZCBDb25maWd1cmF0aW9uIGVycm9yLCBidXQgdGhlIFNES3Mgd29uJ3QgdW5kZXJzdGFuZCBpdC4gRm9yIG5vdywgSW50ZXJuYWwgU2VydmVyIEVycm9yLlxuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICdBbiBhcHBOYW1lLCBwdWJsaWNTZXJ2ZXJVUkwsIGFuZCBlbWFpbEFkYXB0ZXIgYXJlIHJlcXVpcmVkIGZvciBwYXNzd29yZCByZXNldCBhbmQgZW1haWwgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uYWxpdHkuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBoYW5kbGVSZXNldFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuICAgIGNvbnN0IHVzZXJDb250cm9sbGVyID0gcmVxLmNvbmZpZy51c2VyQ29udHJvbGxlcjtcbiAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChlbWFpbCkudGhlbihcbiAgICAgICgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICB9KTtcbiAgICAgIH0sXG4gICAgICBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAvLyBSZXR1cm4gc3VjY2VzcyBzbyB0aGF0IHRoaXMgZW5kcG9pbnQgY2FuJ3RcbiAgICAgICAgICAvLyBiZSB1c2VkIHRvIGVudW1lcmF0ZSB2YWxpZCBlbWFpbHNcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICAgIHJlc3BvbnNlOiB7fSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSkge1xuICAgIHRoaXMuX3Rocm93T25CYWRFbWFpbENvbmZpZyhyZXEpO1xuXG4gICAgY29uc3QgeyBlbWFpbCB9ID0gcmVxLmJvZHk7XG4gICAgaWYgKCFlbWFpbCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX01JU1NJTkcsICd5b3UgbXVzdCBwcm92aWRlIGFuIGVtYWlsJyk7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUyxcbiAgICAgICAgJ3lvdSBtdXN0IHByb3ZpZGUgYSB2YWxpZCBlbWFpbCBzdHJpbmcnXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBlbWFpbDogZW1haWwgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGggfHwgcmVzdWx0cy5sZW5ndGggPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9OT1RfRk9VTkQsIGBObyB1c2VyIGZvdW5kIHdpdGggZW1haWwgJHtlbWFpbH1gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuXG4gICAgICAvLyByZW1vdmUgcGFzc3dvcmQgZmllbGQsIG1lc3NlcyB3aXRoIHNhdmluZyBvbiBwb3N0Z3Jlc1xuICAgICAgZGVsZXRlIHVzZXIucGFzc3dvcmQ7XG5cbiAgICAgIGlmICh1c2VyLmVtYWlsVmVyaWZpZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLCBgRW1haWwgJHtlbWFpbH0gaXMgYWxyZWFkeSB2ZXJpZmllZC5gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpLnRoZW4oKCkgPT4ge1xuICAgICAgICB1c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcik7XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVWZXJpZnlFbWFpbChyZXEpIHtcbiAgICBjb25zdCB7IHVzZXJuYW1lLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5xdWVyeTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ01pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdNaXNzaW5nIHRva2VuJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci52ZXJpZnlFbWFpbCh1c2VybmFtZSwgdG9rZW4pLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgfSk7XG4gIH1cblxuICBoYW5kbGVSZXNldFBhc3N3b3JkKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIG5ld19wYXNzd29yZCwgdG9rZW46IHJhd1Rva2VuIH0gPSByZXEuYm9keTtcbiAgICBjb25zdCB0b2tlbiA9IHJhd1Rva2VuICYmIHR5cGVvZiByYXdUb2tlbiAhPT0gJ3N0cmluZycgPyByYXdUb2tlbi50b1N0cmluZygpIDogcmF3VG9rZW47XG5cbiAgICBpZiAoIXVzZXJuYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVVNFUk5BTUVfTUlTU0lORywgJ01pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG5cbiAgICBpZiAoIXRva2VuKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsICdNaXNzaW5nIHRva2VuJyk7XG4gICAgfVxuXG4gICAgaWYgKCFuZXdfcGFzc3dvcmQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAnTWlzc2luZyBwYXNzd29yZCcpO1xuICAgIH1cblxuICAgIHJldHVybiByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyLnVwZGF0ZVBhc3N3b3JkKHVzZXJuYW1lLCB0b2tlbiwgbmV3X3Bhc3N3b3JkKS50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIH0pO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2VycycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGaW5kKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdXNlcnMnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzL21lJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZU1lKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy91c2Vycy86b2JqZWN0SWQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlR2V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUFVUJywgJy91c2Vycy86b2JqZWN0SWQnLCBwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3ksIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL2xvZ2luJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbkFzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUxvZ0luQXMocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dvdXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nT3V0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVxdWVzdFBhc3N3b3JkUmVzZXQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlUmVzZXRSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0JywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmaWNhdGlvbkVtYWlsUmVxdWVzdChyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdmVyaWZ5UGFzc3dvcmQnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcblxuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL3ZlcmlmeUVtYWlsJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVZlcmlmeUVtYWlsKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvcmVzZXRQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFBhc3N3b3JkKHJlcSk7XG4gICAgfSk7XG4gICAgLy8gTk9URTogQW4gYWxpYXMgb2YgY2xvdWQgZnVuY3Rpb25cbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2Vycy86ZnVuY3Rpb25OYW1lJywgcmVxID0+IHtcbiAgICAgIHJlcS5wYXJhbXMuY2xhc3NOYW1lID0gdGhpcy5jbGFzc05hbWUoKTtcbiAgICAgIHJldHVybiBGdW5jdGlvbnNSb3V0ZXIuaGFuZGxlQ2xvdWRGdW5jdGlvbihyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJzUm91dGVyO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBRUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7QUFFTyxNQUFNQSxXQUFOLFNBQTBCQyxzQkFBMUIsQ0FBd0M7RUFDN0NDLFNBQVMsR0FBRztJQUNWLE9BQU8sT0FBUDtFQUNEO0VBRUQ7QUFDRjtBQUNBO0FBQ0E7OztFQUMrQixPQUF0QkMsc0JBQXNCLENBQUNDLEdBQUQsRUFBTTtJQUNqQyxLQUFLLElBQUlDLEdBQVQsSUFBZ0JELEdBQWhCLEVBQXFCO01BQ25CLElBQUlFLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQkMsY0FBakIsQ0FBZ0NDLElBQWhDLENBQXFDTCxHQUFyQyxFQUEwQ0MsR0FBMUMsQ0FBSixFQUFvRDtRQUNsRDtRQUNBLElBQUlBLEdBQUcsS0FBSyxRQUFSLElBQW9CLENBQUMsMEJBQTBCSyxJQUExQixDQUErQkwsR0FBL0IsQ0FBekIsRUFBOEQ7VUFDNUQsT0FBT0QsR0FBRyxDQUFDQyxHQUFELENBQVY7UUFDRDtNQUNGO0lBQ0Y7RUFDRjtFQUVEO0FBQ0Y7QUFDQTtBQUNBO0FBQ0E7OztFQUNFTSxpQkFBaUIsQ0FBQ0MsSUFBRCxFQUFPO0lBQ3RCLE9BQU9BLElBQUksQ0FBQ0MsUUFBWixDQURzQixDQUd0QjtJQUNBOztJQUNBLElBQUlELElBQUksQ0FBQ0UsUUFBVCxFQUFtQjtNQUNqQlIsTUFBTSxDQUFD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