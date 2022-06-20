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
    });
  }

}

exports.UsersRouter = UsersRouter;
var _default = UsersRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJVc2Vyc1JvdXRlciIsIkNsYXNzZXNSb3V0ZXIiLCJjbGFzc05hbWUiLCJyZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzIiwib2JqIiwia2V5IiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwidGVzdCIsIl9zYW5pdGl6ZUF1dGhEYXRhIiwidXNlciIsInBhc3N3b3JkIiwiYXV0aERhdGEiLCJrZXlzIiwiZm9yRWFjaCIsInByb3ZpZGVyIiwibGVuZ3RoIiwiX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdCIsInJlcSIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwicGF5bG9hZCIsImJvZHkiLCJ1c2VybmFtZSIsInF1ZXJ5IiwiZW1haWwiLCJQYXJzZSIsIkVycm9yIiwiVVNFUk5BTUVfTUlTU0lORyIsIlBBU1NXT1JEX01JU1NJTkciLCJPQkpFQ1RfTk9UX0ZPVU5EIiwiaXNWYWxpZFBhc3N3b3JkIiwiJG9yIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwidGhlbiIsInJlc3VsdHMiLCJsb2dnZXJDb250cm9sbGVyIiwid2FybiIsImZpbHRlciIsInBhc3N3b3JkQ3J5cHRvIiwiY29tcGFyZSIsImNvcnJlY3QiLCJhY2NvdW50TG9ja291dFBvbGljeSIsIkFjY291bnRMb2Nrb3V0IiwiaGFuZGxlTG9naW5BdHRlbXB0IiwiYXV0aCIsImlzTWFzdGVyIiwiQUNMIiwidmVyaWZ5VXNlckVtYWlscyIsInByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiRU1BSUxfTk9UX0ZPVU5EIiwiY2F0Y2giLCJlcnJvciIsImhhbmRsZU1lIiwiaW5mbyIsInNlc3Npb25Ub2tlbiIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInJlc3QiLCJBdXRoIiwibWFzdGVyIiwiaW5jbHVkZSIsImNsaWVudFNESyIsImNvbnRleHQiLCJyZXNwb25zZSIsImhhbmRsZUxvZ0luIiwicGFzc3dvcmRQb2xpY3kiLCJtYXhQYXNzd29yZEFnZSIsImNoYW5nZWRBdCIsIl9wYXNzd29yZF9jaGFuZ2VkX2F0IiwiRGF0ZSIsInVwZGF0ZSIsIl9lbmNvZGUiLCJfX3R5cGUiLCJpc28iLCJleHBpcmVzQXQiLCJnZXRUaW1lIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsIm1heWJlUnVuVHJpZ2dlciIsIlRyaWdnZXJUeXBlcyIsImJlZm9yZUxvZ2luIiwiVXNlciIsImZyb21KU09OIiwiYXNzaWduIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiUmVzdFdyaXRlIiwidXNlcklkIiwib2JqZWN0SWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImF1dGhQcm92aWRlciIsImluc3RhbGxhdGlvbklkIiwiYWZ0ZXJMb2dpblVzZXIiLCJhZnRlckxvZ2luIiwiaGFuZGxlTG9nSW5BcyIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJJTlZBTElEX1ZBTFVFIiwicXVlcnlSZXN1bHRzIiwiaGFuZGxlVmVyaWZ5UGFzc3dvcmQiLCJoYW5kbGVMb2dPdXQiLCJzdWNjZXNzIiwidW5kZWZpbmVkIiwicmVjb3JkcyIsImRlbCIsIl9ydW5BZnRlckxvZ291dFRyaWdnZXIiLCJzZXNzaW9uIiwiYWZ0ZXJMb2dvdXQiLCJTZXNzaW9uIiwiX3Rocm93T25CYWRFbWFpbENvbmZpZyIsIkNvbmZpZyIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwiZW1haWxBZGFwdGVyIiwidXNlckNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImUiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJoYW5kbGVSZXNldFJlcXVlc3QiLCJFTUFJTF9NSVNTSU5HIiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsImVyciIsImNvZGUiLCJoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QiLCJPVEhFUl9DQVVTRSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiaGFuZGxlVmVyaWZ5RW1haWwiLCJ0b2tlbiIsInJhd1Rva2VuIiwidG9TdHJpbmciLCJ2ZXJpZnlFbWFpbCIsImhhbmRsZVJlc2V0UGFzc3dvcmQiLCJuZXdfcGFzc3dvcmQiLCJ1cGRhdGVQYXNzd29yZCIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwicHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlR2V0IiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1JvdXRlcnMvVXNlcnNSb3V0ZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gVGhlc2UgbWV0aG9kcyBoYW5kbGUgdGhlIFVzZXItcmVsYXRlZCByb3V0ZXMuXG5cbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCBBY2NvdW50TG9ja291dCBmcm9tICcuLi9BY2NvdW50TG9ja291dCc7XG5pbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgQXV0aCBmcm9tICcuLi9BdXRoJztcbmltcG9ydCBwYXNzd29yZENyeXB0byBmcm9tICcuLi9wYXNzd29yZCc7XG5pbXBvcnQgeyBtYXliZVJ1blRyaWdnZXIsIFR5cGVzIGFzIFRyaWdnZXJUeXBlcyB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCB7IHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSB9IGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBSZXN0V3JpdGUgZnJvbSAnLi4vUmVzdFdyaXRlJztcblxuZXhwb3J0IGNsYXNzIFVzZXJzUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ19Vc2VyJztcbiAgfVxuXG4gIC8qKlxuICAgKiBSZW1vdmVzIGFsbCBcIl9cIiBwcmVmaXhlZCBwcm9wZXJ0aWVzIGZyb20gYW4gb2JqZWN0LCBleGNlcHQgXCJfX3R5cGVcIlxuICAgKiBAcGFyYW0ge09iamVjdH0gb2JqIEFuIG9iamVjdC5cbiAgICovXG4gIHN0YXRpYyByZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKG9iaikge1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSB7XG4gICAgICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICAgICAgaWYgKGtleSAhPT0gJ19fdHlwZScgJiYgIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICAgICAgZGVsZXRlIG9ialtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEFmdGVyIHJldHJpZXZpbmcgYSB1c2VyIGRpcmVjdGx5IGZyb20gdGhlIGRhdGFiYXNlLCB3ZSBuZWVkIHRvIHJlbW92ZSB0aGVcbiAgICogcGFzc3dvcmQgZnJvbSB0aGUgb2JqZWN0IChmb3Igc2VjdXJpdHkpLCBhbmQgZml4IGFuIGlzc3VlIHNvbWUgU0RLcyBoYXZlXG4gICAqIHdpdGggbnVsbCB2YWx1ZXNcbiAgICovXG4gIF9zYW5pdGl6ZUF1dGhEYXRhKHVzZXIpIHtcbiAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgIC8vIFNvbWV0aW1lcyB0aGUgYXV0aERhdGEgc3RpbGwgaGFzIG51bGwgb24gdGhhdCBrZXlzXG4gICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvaXNzdWVzLzkzNVxuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIGEgcGFzc3dvcmQgcmVxdWVzdCBpbiBsb2dpbiBhbmQgdmVyaWZ5UGFzc3dvcmRcbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcSBUaGUgcmVxdWVzdFxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBVc2VyIG9iamVjdFxuICAgKiBAcHJpdmF0ZVxuICAgKi9cbiAgX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgLy8gVXNlIHF1ZXJ5IHBhcmFtZXRlcnMgaW5zdGVhZCBpZiBwcm92aWRlZCBpbiB1cmxcbiAgICAgIGxldCBwYXlsb2FkID0gcmVxLmJvZHk7XG4gICAgICBpZiAoXG4gICAgICAgICghcGF5bG9hZC51c2VybmFtZSAmJiByZXEucXVlcnkgJiYgcmVxLnF1ZXJ5LnVzZXJuYW1lKSB8fFxuICAgICAgICAoIXBheWxvYWQuZW1haWwgJiYgcmVxLnF1ZXJ5ICYmIHJlcS5xdWVyeS5lbWFpbClcbiAgICAgICkge1xuICAgICAgICBwYXlsb2FkID0gcmVxLnF1ZXJ5O1xuICAgICAgfVxuICAgICAgY29uc3QgeyB1c2VybmFtZSwgZW1haWwsIHBhc3N3b3JkIH0gPSBwYXlsb2FkO1xuXG4gICAgICAvLyBUT0RPOiB1c2UgdGhlIHJpZ2h0IGVycm9yIGNvZGVzIC8gZGVzY3JpcHRpb25zLlxuICAgICAgaWYgKCF1c2VybmFtZSAmJiAhZW1haWwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICd1c2VybmFtZS9lbWFpbCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmICghcGFzc3dvcmQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdwYXNzd29yZCBpcyByZXF1aXJlZC4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkICE9PSAnc3RyaW5nJyB8fFxuICAgICAgICAoZW1haWwgJiYgdHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykgfHxcbiAgICAgICAgKHVzZXJuYW1lICYmIHR5cGVvZiB1c2VybmFtZSAhPT0gJ3N0cmluZycpXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdJbnZhbGlkIHVzZXJuYW1lL3Bhc3N3b3JkLicpO1xuICAgICAgfVxuXG4gICAgICBsZXQgdXNlcjtcbiAgICAgIGxldCBpc1ZhbGlkUGFzc3dvcmQgPSBmYWxzZTtcbiAgICAgIGxldCBxdWVyeTtcbiAgICAgIGlmIChlbWFpbCAmJiB1c2VybmFtZSkge1xuICAgICAgICBxdWVyeSA9IHsgZW1haWwsIHVzZXJuYW1lIH07XG4gICAgICB9IGVsc2UgaWYgKGVtYWlsKSB7XG4gICAgICAgIHF1ZXJ5ID0geyBlbWFpbCB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSB7ICRvcjogW3sgdXNlcm5hbWUgfSwgeyBlbWFpbDogdXNlcm5hbWUgfV0gfTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXEuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKCdfVXNlcicsIHF1ZXJ5KVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gY29ybmVyIGNhc2Ugd2hlcmUgdXNlcjEgaGFzIHVzZXJuYW1lID09IHVzZXIyIGVtYWlsXG4gICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIud2FybihcbiAgICAgICAgICAgICAgXCJUaGVyZSBpcyBhIHVzZXIgd2hpY2ggZW1haWwgaXMgdGhlIHNhbWUgYXMgYW5vdGhlciB1c2VyJ3MgdXNlcm5hbWUsIGxvZ2dpbmcgaW4gYmFzZWQgb24gdXNlcm5hbWVcIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHVzZXIgPSByZXN1bHRzLmZpbHRlcih1c2VyID0+IHVzZXIudXNlcm5hbWUgPT09IHVzZXJuYW1lKVswXTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmNvbXBhcmUocGFzc3dvcmQsIHVzZXIucGFzc3dvcmQpO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbihjb3JyZWN0ID0+IHtcbiAgICAgICAgICBpc1ZhbGlkUGFzc3dvcmQgPSBjb3JyZWN0O1xuICAgICAgICAgIGNvbnN0IGFjY291bnRMb2Nrb3V0UG9saWN5ID0gbmV3IEFjY291bnRMb2Nrb3V0KHVzZXIsIHJlcS5jb25maWcpO1xuICAgICAgICAgIHJldHVybiBhY2NvdW50TG9ja291dFBvbGljeS5oYW5kbGVMb2dpbkF0dGVtcHQoaXNWYWxpZFBhc3N3b3JkKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIGlmICghaXNWYWxpZFBhc3N3b3JkKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEVuc3VyZSB0aGUgdXNlciBpc24ndCBsb2NrZWQgb3V0XG4gICAgICAgICAgLy8gQSBsb2NrZWQgb3V0IHVzZXIgd29uJ3QgYmUgYWJsZSB0byBsb2dpblxuICAgICAgICAgIC8vIFRvIGxvY2sgYSB1c2VyIG91dCwganVzdCBzZXQgdGhlIEFDTCB0byBgbWFzdGVyS2V5YCBvbmx5ICAoe30pLlxuICAgICAgICAgIC8vIEVtcHR5IEFDTCBpcyBPS1xuICAgICAgICAgIGlmICghcmVxLmF1dGguaXNNYXN0ZXIgJiYgdXNlci5BQ0wgJiYgT2JqZWN0LmtleXModXNlci5BQ0wpLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ0ludmFsaWQgdXNlcm5hbWUvcGFzc3dvcmQuJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlcS5jb25maWcudmVyaWZ5VXNlckVtYWlscyAmJlxuICAgICAgICAgICAgcmVxLmNvbmZpZy5wcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsICYmXG4gICAgICAgICAgICAhdXNlci5lbWFpbFZlcmlmaWVkXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiByZXNvbHZlKHVzZXIpO1xuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgIHJldHVybiByZWplY3QoZXJyb3IpO1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZU1lKHJlcSkge1xuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbicpO1xuICAgIH1cbiAgICBjb25zdCBzZXNzaW9uVG9rZW4gPSByZXEuaW5mby5zZXNzaW9uVG9rZW47XG4gICAgcmV0dXJuIHJlc3RcbiAgICAgIC5maW5kKFxuICAgICAgICByZXEuY29uZmlnLFxuICAgICAgICBBdXRoLm1hc3RlcihyZXEuY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgeyBpbmNsdWRlOiAndXNlcicgfSxcbiAgICAgICAgcmVxLmluZm8uY2xpZW50U0RLLFxuICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICApXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIGlmICghcmVzcG9uc2UucmVzdWx0cyB8fCByZXNwb25zZS5yZXN1bHRzLmxlbmd0aCA9PSAwIHx8ICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXIpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3BvbnNlLnJlc3VsdHNbMF0udXNlcjtcbiAgICAgICAgICAvLyBTZW5kIHRva2VuIGJhY2sgb24gdGhlIGxvZ2luLCBiZWNhdXNlIFNES3MgZXhwZWN0IHRoYXQuXG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG5cbiAgICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgICAgVXNlcnNSb3V0ZXIucmVtb3ZlSGlkZGVuUHJvcGVydGllcyh1c2VyKTtcblxuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgaGFuZGxlTG9nSW4ocmVxKSB7XG4gICAgY29uc3QgdXNlciA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0ZVVzZXJGcm9tUmVxdWVzdChyZXEpO1xuXG4gICAgLy8gaGFuZGxlIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3lcbiAgICBpZiAocmVxLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiByZXEuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICBsZXQgY2hhbmdlZEF0ID0gdXNlci5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcblxuICAgICAgaWYgKCFjaGFuZ2VkQXQpIHtcbiAgICAgICAgLy8gcGFzc3dvcmQgd2FzIGNyZWF0ZWQgYmVmb3JlIGV4cGlyeSBwb2xpY3kgd2FzIGVuYWJsZWQuXG4gICAgICAgIC8vIHNpbXBseSB1cGRhdGUgX1VzZXIgb2JqZWN0IHNvIHRoYXQgaXQgd2lsbCBzdGFydCBlbmZvcmNpbmcgZnJvbSBub3dcbiAgICAgICAgY2hhbmdlZEF0ID0gbmV3IERhdGUoKTtcbiAgICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICAgICAgeyBfcGFzc3dvcmRfY2hhbmdlZF9hdDogUGFyc2UuX2VuY29kZShjaGFuZ2VkQXQpIH1cbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIGhhcyBleHBpcmVkXG4gICAgICAgIGlmIChjaGFuZ2VkQXQuX190eXBlID09ICdEYXRlJykge1xuICAgICAgICAgIGNoYW5nZWRBdCA9IG5ldyBEYXRlKGNoYW5nZWRBdC5pc28pO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZXhwaXJ5IHRpbWUuXG4gICAgICAgIGNvbnN0IGV4cGlyZXNBdCA9IG5ldyBEYXRlKFxuICAgICAgICAgIGNoYW5nZWRBdC5nZXRUaW1lKCkgKyA4NjQwMDAwMCAqIHJlcS5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKGV4cGlyZXNBdCA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgLy8gZmFpbCBvZiBjdXJyZW50IHRpbWUgaXMgcGFzdCBwYXNzd29yZCBleHBpcnkgdGltZVxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAnWW91ciBwYXNzd29yZCBoYXMgZXhwaXJlZC4gUGxlYXNlIHJlc2V0IHlvdXIgcGFzc3dvcmQuJ1xuICAgICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVtb3ZlIGhpZGRlbiBwcm9wZXJ0aWVzLlxuICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICByZXEuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHJlcS5jb25maWcsIHVzZXIpO1xuXG4gICAgLy8gQmVmb3JlIGxvZ2luIHRyaWdnZXI7IHRocm93cyBpZiBmYWlsdXJlXG4gICAgYXdhaXQgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmJlZm9yZUxvZ2luLFxuICAgICAgcmVxLmF1dGgsXG4gICAgICBQYXJzZS5Vc2VyLmZyb21KU09OKE9iamVjdC5hc3NpZ24oeyBjbGFzc05hbWU6ICdfVXNlcicgfSwgdXNlcikpLFxuICAgICAgbnVsbCxcbiAgICAgIHJlcS5jb25maWdcbiAgICApO1xuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24ocmVxLmNvbmZpZywge1xuICAgICAgdXNlcklkOiB1c2VyLm9iamVjdElkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnbG9naW4nLFxuICAgICAgICBhdXRoUHJvdmlkZXI6ICdwYXNzd29yZCcsXG4gICAgICB9LFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IHJlcS5pbmZvLmluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuXG4gICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG5cbiAgICBhd2FpdCBjcmVhdGVTZXNzaW9uKCk7XG5cbiAgICBjb25zdCBhZnRlckxvZ2luVXNlciA9IFBhcnNlLlVzZXIuZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19Vc2VyJyB9LCB1c2VyKSk7XG4gICAgbWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgVHJpZ2dlclR5cGVzLmFmdGVyTG9naW4sXG4gICAgICB7IC4uLnJlcS5hdXRoLCB1c2VyOiBhZnRlckxvZ2luVXNlciB9LFxuICAgICAgYWZ0ZXJMb2dpblVzZXIsXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogdXNlciB9O1xuICB9XG5cbiAgLyoqXG4gICAqIFRoaXMgYWxsb3dzIG1hc3Rlci1rZXkgY2xpZW50cyB0byBjcmVhdGUgdXNlciBzZXNzaW9ucyB3aXRob3V0IGFjY2VzcyB0b1xuICAgKiB1c2VyIGNyZWRlbnRpYWxzLiBUaGlzIGVuYWJsZXMgc3lzdGVtcyB0aGF0IGNhbiBhdXRoZW50aWNhdGUgYWNjZXNzIGFub3RoZXJcbiAgICogd2F5IChBUEkga2V5LCBhcHAgYWRtaW5pc3RyYXRvcnMpIHRvIGFjdCBvbiBhIHVzZXIncyBiZWhhbGYuXG4gICAqXG4gICAqIFdlIGNyZWF0ZSBhIG5ldyBzZXNzaW9uIHJhdGhlciB0aGFuIGxvb2tpbmcgZm9yIGFuIGV4aXN0aW5nIHNlc3Npb247IHdlXG4gICAqIHdhbnQgdGhpcyB0byB3b3JrIGluIHNpdHVhdGlvbnMgd2hlcmUgdGhlIHVzZXIgaXMgbG9nZ2VkIG91dCBvbiBhbGxcbiAgICogZGV2aWNlcywgc2luY2UgdGhpcyBjYW4gYmUgdXNlZCBieSBhdXRvbWF0ZWQgc3lzdGVtcyBhY3Rpbmcgb24gdGhlIHVzZXInc1xuICAgKiBiZWhhbGYuXG4gICAqXG4gICAqIEZvciB0aGUgbW9tZW50LCB3ZSdyZSBvbWl0dGluZyBldmVudCBob29rcyBhbmQgbG9ja291dCBjaGVja3MsIHNpbmNlXG4gICAqIGltbWVkaWF0ZSB1c2UgY2FzZXMgc3VnZ2VzdCAvbG9naW5BcyBjb3VsZCBiZSB1c2VkIGZvciBzZW1hbnRpY2FsbHlcbiAgICogZGlmZmVyZW50IHJlYXNvbnMgZnJvbSAvbG9naW5cbiAgICovXG4gIGFzeW5jIGhhbmRsZUxvZ0luQXMocmVxKSB7XG4gICAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sICdtYXN0ZXIga2V5IGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuXG4gICAgY29uc3QgdXNlcklkID0gcmVxLmJvZHkudXNlcklkIHx8IHJlcS5xdWVyeS51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9WQUxVRSxcbiAgICAgICAgJ3VzZXJJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCwgb3IgdW5kZWZpbmVkJ1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeVJlc3VsdHMgPSBhd2FpdCByZXEuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdXNlcklkIH0pO1xuICAgIGNvbnN0IHVzZXIgPSBxdWVyeVJlc3VsdHNbMF07XG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ3VzZXIgbm90IGZvdW5kJyk7XG4gICAgfVxuXG4gICAgdGhpcy5fc2FuaXRpemVBdXRoRGF0YSh1c2VyKTtcblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHJlcS5jb25maWcsIHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICAgIGFjdGlvbjogJ2xvZ2luJyxcbiAgICAgICAgYXV0aFByb3ZpZGVyOiAnbWFzdGVya2V5JyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICB1c2VyLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcblxuICAgIGF3YWl0IGNyZWF0ZVNlc3Npb24oKTtcblxuICAgIHJldHVybiB7IHJlc3BvbnNlOiB1c2VyIH07XG4gIH1cblxuICBoYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpIHtcbiAgICByZXR1cm4gdGhpcy5fYXV0aGVudGljYXRlVXNlckZyb21SZXF1ZXN0KHJlcSlcbiAgICAgIC50aGVuKHVzZXIgPT4ge1xuICAgICAgICAvLyBSZW1vdmUgaGlkZGVuIHByb3BlcnRpZXMuXG4gICAgICAgIFVzZXJzUm91dGVyLnJlbW92ZUhpZGRlblByb3BlcnRpZXModXNlcik7XG5cbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHVzZXIgfTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlTG9nT3V0KHJlcSkge1xuICAgIGNvbnN0IHN1Y2Nlc3MgPSB7IHJlc3BvbnNlOiB7fSB9O1xuICAgIGlmIChyZXEuaW5mbyAmJiByZXEuaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHJldHVybiByZXN0XG4gICAgICAgIC5maW5kKFxuICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICB7IHNlc3Npb25Ub2tlbjogcmVxLmluZm8uc2Vzc2lvblRva2VuIH0sXG4gICAgICAgICAgdW5kZWZpbmVkLFxuICAgICAgICAgIHJlcS5pbmZvLmNsaWVudFNESyxcbiAgICAgICAgICByZXEuaW5mby5jb250ZXh0XG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVjb3JkcyA9PiB7XG4gICAgICAgICAgaWYgKHJlY29yZHMucmVzdWx0cyAmJiByZWNvcmRzLnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVzdFxuICAgICAgICAgICAgICAuZGVsKFxuICAgICAgICAgICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgICAgICAgICAgQXV0aC5tYXN0ZXIocmVxLmNvbmZpZyksXG4gICAgICAgICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICAgICAgICByZWNvcmRzLnJlc3VsdHNbMF0ub2JqZWN0SWQsXG4gICAgICAgICAgICAgICAgcmVxLmluZm8uY29udGV4dFxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLl9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCByZWNvcmRzLnJlc3VsdHNbMF0pO1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoc3VjY2Vzcyk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHN1Y2Nlc3MpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShzdWNjZXNzKTtcbiAgfVxuXG4gIF9ydW5BZnRlckxvZ291dFRyaWdnZXIocmVxLCBzZXNzaW9uKSB7XG4gICAgLy8gQWZ0ZXIgbG9nb3V0IHRyaWdnZXJcbiAgICBtYXliZVJ1blRyaWdnZXIoXG4gICAgICBUcmlnZ2VyVHlwZXMuYWZ0ZXJMb2dvdXQsXG4gICAgICByZXEuYXV0aCxcbiAgICAgIFBhcnNlLlNlc3Npb24uZnJvbUpTT04oT2JqZWN0LmFzc2lnbih7IGNsYXNzTmFtZTogJ19TZXNzaW9uJyB9LCBzZXNzaW9uKSksXG4gICAgICBudWxsLFxuICAgICAgcmVxLmNvbmZpZ1xuICAgICk7XG4gIH1cblxuICBfdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSkge1xuICAgIHRyeSB7XG4gICAgICBDb25maWcudmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgICAgICBlbWFpbEFkYXB0ZXI6IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIuYWRhcHRlcixcbiAgICAgICAgYXBwTmFtZTogcmVxLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkw6IHJlcS5jb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbjogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZDogcmVxLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHR5cGVvZiBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAvLyBNYXliZSB3ZSBuZWVkIGEgQmFkIENvbmZpZ3VyYXRpb24gZXJyb3IsIGJ1dCB0aGUgU0RLcyB3b24ndCB1bmRlcnN0YW5kIGl0LiBGb3Igbm93LCBJbnRlcm5hbCBTZXJ2ZXIgRXJyb3IuXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlRFUk5BTF9TRVJWRVJfRVJST1IsXG4gICAgICAgICAgJ0FuIGFwcE5hbWUsIHB1YmxpY1NlcnZlclVSTCwgYW5kIGVtYWlsQWRhcHRlciBhcmUgcmVxdWlyZWQgZm9yIHBhc3N3b3JkIHJlc2V0IGFuZCBlbWFpbCB2ZXJpZmljYXRpb24gZnVuY3Rpb25hbGl0eS4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGhhbmRsZVJlc2V0UmVxdWVzdChyZXEpIHtcbiAgICB0aGlzLl90aHJvd09uQmFkRW1haWxDb25maWcocmVxKTtcblxuICAgIGNvbnN0IHsgZW1haWwgfSA9IHJlcS5ib2R5O1xuICAgIGlmICghZW1haWwpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5FTUFJTF9NSVNTSU5HLCAneW91IG11c3QgcHJvdmlkZSBhbiBlbWFpbCcpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsXG4gICAgICAgICd5b3UgbXVzdCBwcm92aWRlIGEgdmFsaWQgZW1haWwgc3RyaW5nJ1xuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgdXNlckNvbnRyb2xsZXIgPSByZXEuY29uZmlnLnVzZXJDb250cm9sbGVyO1xuICAgIHJldHVybiB1c2VyQ29udHJvbGxlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKS50aGVuKFxuICAgICAgKCkgPT4ge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICByZXNwb25zZToge30sXG4gICAgICAgIH0pO1xuICAgICAgfSxcbiAgICAgIGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuY29kZSA9PT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIC8vIFJldHVybiBzdWNjZXNzIHNvIHRoYXQgdGhpcyBlbmRwb2ludCBjYW4ndFxuICAgICAgICAgIC8vIGJlIHVzZWQgdG8gZW51bWVyYXRlIHZhbGlkIGVtYWlsc1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICAgICAgcmVzcG9uc2U6IHt9LFxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBoYW5kbGVWZXJpZmljYXRpb25FbWFpbFJlcXVlc3QocmVxKSB7XG4gICAgdGhpcy5fdGhyb3dPbkJhZEVtYWlsQ29uZmlnKHJlcSk7XG5cbiAgICBjb25zdCB7IGVtYWlsIH0gPSByZXEuYm9keTtcbiAgICBpZiAoIWVtYWlsKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTUlTU0lORywgJ3lvdSBtdXN0IHByb3ZpZGUgYW4gZW1haWwnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBlbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLFxuICAgICAgICAneW91IG11c3QgcHJvdmlkZSBhIHZhbGlkIGVtYWlsIHN0cmluZydcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IGVtYWlsOiBlbWFpbCB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCB8fCByZXN1bHRzLmxlbmd0aCA8IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkVNQUlMX05PVF9GT1VORCwgYE5vIHVzZXIgZm91bmQgd2l0aCBlbWFpbCAke2VtYWlsfWApO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG5cbiAgICAgIC8vIHJlbW92ZSBwYXNzd29yZCBmaWVsZCwgbWVzc2VzIHdpdGggc2F2aW5nIG9uIHBvc3RncmVzXG4gICAgICBkZWxldGUgdXNlci5wYXNzd29yZDtcblxuICAgICAgaWYgKHVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT1RIRVJfQ0FVU0UsIGBFbWFpbCAke2VtYWlsfSBpcyBhbHJlYWR5IHZlcmlmaWVkLmApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdXNlckNvbnRyb2xsZXIucmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4odXNlcikudGhlbigoKSA9PiB7XG4gICAgICAgIHVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyKTtcbiAgICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZVZlcmlmeUVtYWlsKHJlcSkge1xuICAgIGNvbnN0IHsgdXNlcm5hbWUsIHRva2VuOiByYXdUb2tlbiB9ID0gcmVxLnF1ZXJ5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnTWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ01pc3NpbmcgdG9rZW4nKTtcbiAgICB9XG5cbiAgICBjb25zdCB1c2VyQ29udHJvbGxlciA9IHJlcS5jb25maWcudXNlckNvbnRyb2xsZXI7XG4gICAgcmV0dXJuIHVzZXJDb250cm9sbGVyLnZlcmlmeUVtYWlsKHVzZXJuYW1lLCB0b2tlbikudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4geyByZXNwb25zZToge30gfTtcbiAgICB9KTtcbiAgfVxuXG4gIGhhbmRsZVJlc2V0UGFzc3dvcmQocmVxKSB7XG4gICAgY29uc3QgeyB1c2VybmFtZSwgbmV3X3Bhc3N3b3JkLCB0b2tlbjogcmF3VG9rZW4gfSA9IHJlcS5ib2R5O1xuICAgIGNvbnN0IHRva2VuID0gcmF3VG9rZW4gJiYgdHlwZW9mIHJhd1Rva2VuICE9PSAnc3RyaW5nJyA/IHJhd1Rva2VuLnRvU3RyaW5nKCkgOiByYXdUb2tlbjtcblxuICAgIGlmICghdXNlcm5hbWUpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnTWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cblxuICAgIGlmICghdG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PVEhFUl9DQVVTRSwgJ01pc3NpbmcgdG9rZW4nKTtcbiAgICB9XG5cbiAgICBpZiAoIW5ld19wYXNzd29yZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlBBU1NXT1JEX01JU1NJTkcsICdNaXNzaW5nIHBhc3N3b3JkJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJlcS5jb25maWcudXNlckNvbnRyb2xsZXIudXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBuZXdfcGFzc3dvcmQpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHsgcmVzcG9uc2U6IHt9IH07XG4gICAgfSk7XG4gIH1cblxuICBtb3VudFJvdXRlcygpIHtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91c2VycycsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUNyZWF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvdXNlcnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3VzZXJzLzpvYmplY3RJZCcsIHByb21pc2VFbnN1cmVJZGVtcG90ZW5jeSwgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0RFTEVURScsICcvdXNlcnMvOm9iamVjdElkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZURlbGV0ZShyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvbG9naW4nLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW4ocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9sb2dpbicsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dJbihyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ2luQXMnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTG9nSW5BcyhyZXEpO1xuICAgIH0pO1xuICAgIHRoaXMucm91dGUoJ1BPU1QnLCAnL2xvZ291dCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVMb2dPdXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXF1ZXN0UGFzc3dvcmRSZXNldCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZXNldFJlcXVlc3QocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy92ZXJpZmljYXRpb25FbWFpbFJlcXVlc3QnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZpY2F0aW9uRW1haWxSZXF1ZXN0KHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy92ZXJpZnlQYXNzd29yZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVWZXJpZnlQYXNzd29yZChyZXEpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5yb3V0ZSgnUE9TVCcsICcvdmVyaWZ5RW1haWwnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlVmVyaWZ5RW1haWwocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9yZXNldFBhc3N3b3JkJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVJlc2V0UGFzc3dvcmQocmVxKTtcbiAgICB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBVc2Vyc1JvdXRlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUVBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztB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