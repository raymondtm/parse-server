"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _RestQuery = _interopRequireDefault(require("./RestQuery"));

var _lodash = _interopRequireDefault(require("lodash"));

var _logger = _interopRequireDefault(require("./logger"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".
var SchemaController = require('./Controllers/SchemaController');

var deepcopy = require('deepcopy');

const Auth = require('./Auth');

const Utils = require('./Utils');

var cryptoUtils = require('./cryptoUtils');

var passwordCrypto = require('./password');

var Parse = require('parse/node');

var triggers = require('./triggers');

var ClientSDK = require('./ClientSDK');

// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData, clientSDK, context, action) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }

  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  this.context = context || {};

  if (action) {
    this.runOptions.action = action;
  }

  if (!query) {
    if (this.config.allowCustomObjectId) {
      if (Object.prototype.hasOwnProperty.call(data, 'objectId') && !data.objectId) {
        throw new Parse.Error(Parse.Error.MISSING_OBJECT_ID, 'objectId must not be empty, null or undefined');
      }
    } else {
      if (data.objectId) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
      }

      if (data.id) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'id is an invalid field name.');
      }
    }
  }

  if (this.config.requestKeywordDenylist) {
    // Scan request data for denied keywords
    for (const keyword of this.config.requestKeywordDenylist) {
      const match = Utils.objectContainsKeyValue(data, keyword.key, keyword.value);

      if (match) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Prohibited keyword in request data: ${JSON.stringify(keyword)}.`);
      }
    }
  } // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header


  this.response = null; // Processing this operation may mutate our data, so we operate on a
  // copy

  this.query = deepcopy(query);
  this.data = deepcopy(data); // We never change originalData, so we do not need a deep copy

  this.originalData = originalData; // The timestamp we'll use for this whole operation

  this.updatedAt = Parse._encode(new Date()).iso; // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable

  this.validSchemaController = null;
} // A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.


RestWrite.prototype.execute = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.handleInstallation();
  }).then(() => {
    return this.handleSession();
  }).then(() => {
    return this.validateAuthData();
  }).then(() => {
    return this.runBeforeSaveTrigger();
  }).then(() => {
    return this.deleteEmailResetTokenIfNeeded();
  }).then(() => {
    return this.validateSchema();
  }).then(schemaController => {
    this.validSchemaController = schemaController;
    return this.setRequiredFieldsIfNeeded();
  }).then(() => {
    return this.transformUser();
  }).then(() => {
    return this.expandFilesForExistingObjects();
  }).then(() => {
    return this.destroyDuplicatedSessions();
  }).then(() => {
    return this.runDatabaseOperation();
  }).then(() => {
    return this.createSessionTokenIfNeeded();
  }).then(() => {
    return this.handleFollowup();
  }).then(() => {
    return this.runAfterSaveTrigger();
  }).then(() => {
    return this.cleanUserAuthData();
  }).then(() => {
    return this.response;
  });
}; // Uses the Auth object to get the list of roles, adds the user id


RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.runOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.runOptions.acl = this.runOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
}; // Validates this operation against the allowClientClassCreation config.


RestWrite.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
}; // Validates this operation against the schema.


RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions);
}; // Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.


RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response) {
    return;
  } // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.


  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  } // Cloud code gets a bit of extra data for its objects


  var extraData = {
    className: this.className
  };

  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  let originalObject = null;
  const updatedObject = this.buildUpdatedObject(extraData);

  if (this.query && this.query.objectId) {
    // This is an update for existing object.
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;

    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, true, true);
    } else {
      // Validate for creating
      databasePromise = this.config.database.create(this.className, this.data, this.runOptions, true);
    } // In the case that there is no permission for the operation, it throws an error


    return databasePromise.then(result => {
      if (!result || result.length <= 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
    });
  }).then(() => {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, this.auth, updatedObject, originalObject, this.config, this.context);
  }).then(response => {
    if (response && response.object) {
      this.storage.fieldsChangedByTrigger = _lodash.default.reduce(response.object, (result, value, key) => {
        if (!_lodash.default.isEqual(this.data[key], value)) {
          result.push(key);
        }

        return result;
      }, []);
      this.data = response.object; // We should delete the objectId for an update write

      if (this.query && this.query.objectId) {
        delete this.data.objectId;
      }
    }
  });
};

RestWrite.prototype.runBeforeLoginTrigger = async function (userData) {
  // Avoid doing any setup for triggers if there is no 'beforeLogin' trigger
  if (!triggers.triggerExists(this.className, triggers.Types.beforeLogin, this.config.applicationId)) {
    return;
  } // Cloud code gets a bit of extra data for its objects


  const extraData = {
    className: this.className
  }; // Expand file objects

  this.config.filesController.expandFilesInObject(this.config, userData);
  const user = triggers.inflate(extraData, userData); // no need to return a response

  await triggers.maybeRunTrigger(triggers.Types.beforeLogin, this.auth, user, null, this.config, this.context);
};

RestWrite.prototype.setRequiredFieldsIfNeeded = function () {
  if (this.data) {
    return this.validSchemaController.getAllClasses().then(allClasses => {
      const schema = allClasses.find(oneClass => oneClass.className === this.className);

      const setRequiredFieldIfNeeded = (fieldName, setDefault) => {
        if (this.data[fieldName] === undefined || this.data[fieldName] === null || this.data[fieldName] === '' || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete') {
          if (setDefault && schema.fields[fieldName] && schema.fields[fieldName].defaultValue !== null && schema.fields[fieldName].defaultValue !== undefined && (this.data[fieldName] === undefined || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete')) {
            this.data[fieldName] = schema.fields[fieldName].defaultValue;
            this.storage.fieldsChangedByTrigger = this.storage.fieldsChangedByTrigger || [];

            if (this.storage.fieldsChangedByTrigger.indexOf(fieldName) < 0) {
              this.storage.fieldsChangedByTrigger.push(fieldName);
            }
          } else if (schema.fields[fieldName] && schema.fields[fieldName].required === true) {
            throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} is required`);
          }
        }
      }; // Add default fields


      this.data.updatedAt = this.updatedAt;

      if (!this.query) {
        this.data.createdAt = this.updatedAt; // Only assign new objectId if we are creating new object

        if (!this.data.objectId) {
          this.data.objectId = cryptoUtils.newObjectId(this.config.objectIdSize);
        }

        if (schema) {
          Object.keys(schema.fields).forEach(fieldName => {
            setRequiredFieldIfNeeded(fieldName, true);
          });
        }
      } else if (schema) {
        Object.keys(this.data).forEach(fieldName => {
          setRequiredFieldIfNeeded(fieldName, false);
        });
      }
    });
  }

  return Promise.resolve();
}; // Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.


RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }

  if (!this.query && !this.data.authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }

    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }

  if (this.data.authData && !Object.keys(this.data.authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Handle saving authData to {} or if authData doesn't exist
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }

  var authData = this.data.authData;
  var providers = Object.keys(authData);

  if (providers.length > 0) {
    const canHandleAuthData = providers.reduce((canHandle, provider) => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return canHandle && (hasToken || providerAuthData == null);
    }, true);

    if (canHandleAuthData) {
      return this.handleAuthData(authData);
    }
  }

  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};

RestWrite.prototype.handleAuthDataValidation = function (authData) {
  const validations = Object.keys(authData).map(provider => {
    if (authData[provider] === null) {
      return Promise.resolve();
    }

    const validateAuthData = this.config.authDataManager.getValidatorForProvider(provider);

    if (!validateAuthData) {
      throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
    }

    return validateAuthData(authData[provider]);
  });
  return Promise.all(validations);
};

RestWrite.prototype.findUsersWithAuthData = function (authData) {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider]) {
      return memo;
    }

    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  let findPromise = Promise.resolve([]);

  if (query.length > 0) {
    findPromise = this.config.database.find(this.className, {
      $or: query
    }, {});
  }

  return findPromise;
};

RestWrite.prototype.filteredObjectsByACL = function (objects) {
  if (this.auth.isMaster) {
    return objects;
  }

  return objects.filter(object => {
    if (!object.ACL) {
      return true; // legacy users that have no ACL field on them
    } // Regular users that have been locked out.


    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};

RestWrite.prototype.handleAuthData = function (authData) {
  let results;
  return this.findUsersWithAuthData(authData).then(async r => {
    results = this.filteredObjectsByACL(r);

    if (results.length == 1) {
      this.storage['authProvider'] = Object.keys(authData).join(',');
      const userResult = results[0];
      const mutatedAuthData = {};
      Object.keys(authData).forEach(provider => {
        const providerData = authData[provider];
        const userAuthData = userResult.authData[provider];

        if (!_lodash.default.isEqual(providerData, userAuthData)) {
          mutatedAuthData[provider] = providerData;
        }
      });
      const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
      let userId;

      if (this.query && this.query.objectId) {
        userId = this.query.objectId;
      } else if (this.auth && this.auth.user && this.auth.user.id) {
        userId = this.auth.user.id;
      }

      if (!userId || userId === userResult.objectId) {
        // no user making the call
        // OR the user making the call is the right one
        // Login with auth data
        delete results[0].password; // need to set the objectId first otherwise location has trailing undefined

        this.data.objectId = userResult.objectId;

        if (!this.query || !this.query.objectId) {
          // this a login call, no userId passed
          this.response = {
            response: userResult,
            location: this.location()
          }; // Run beforeLogin hook before storing any updates
          // to authData on the db; changes to userResult
          // will be ignored.

          await this.runBeforeLoginTrigger(deepcopy(userResult));
        } // If we didn't change the auth data, just keep going


        if (!hasMutatedAuthData) {
          return;
        } // We have authData that is updated on login
        // that can happen when token are refreshed,
        // We should update the token and let the user in
        // We should only check the mutated keys


        return this.handleAuthDataValidation(mutatedAuthData).then(async () => {
          // IF we have a response, we'll skip the database operation / beforeSave / afterSave etc...
          // we need to set it up there.
          // We are supposed to have a response only on LOGIN with authData, so we skip those
          // If we're not logging in, but just updating the current user, we can safely skip that part
          if (this.response) {
            // Assign the new authData in the response
            Object.keys(mutatedAuthData).forEach(provider => {
              this.response.response.authData[provider] = mutatedAuthData[provider];
            }); // Run the DB update directly, as 'master'
            // Just update the authData part
            // Then we're good for the user, early exit of sorts

            return this.config.database.update(this.className, {
              objectId: this.data.objectId
            }, {
              authData: mutatedAuthData
            }, {});
          }
        });
      } else if (userId) {
        // Trying to update auth data but users
        // are different
        if (userResult.objectId !== userId) {
          throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
        } // No auth data was mutated, just keep going


        if (!hasMutatedAuthData) {
          return;
        }
      }
    }

    return this.handleAuthDataValidation(authData).then(() => {
      if (results.length > 1) {
        // More than 1 user with the passed id's
        throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
      }
    });
  });
}; // The non-third-party parts of User transformation


RestWrite.prototype.transformUser = function () {
  var promise = Promise.resolve();

  if (this.className !== '_User') {
    return promise;
  }

  if (!this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  } // Do not cleanup session if objectId is not set


  if (this.query && this.objectId()) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    promise = new _RestQuery.default(this.config, Auth.master(this.config), '_Session', {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    }).execute().then(results => {
      results.results.forEach(session => this.config.cacheController.user.del(session.sessionToken));
    });
  }

  return promise.then(() => {
    // Transform the password
    if (this.data.password === undefined) {
      // ignore only if undefined. should proceed if empty ('')
      return Promise.resolve();
    }

    if (this.query) {
      this.storage['clearSessions'] = true; // Generate a new session only if the user requested

      if (!this.auth.isMaster) {
        this.storage['generateNewSession'] = true;
      }
    }

    return this._validatePasswordPolicy().then(() => {
      return passwordCrypto.hash(this.data.password).then(hashedPassword => {
        this.data._hashed_password = hashedPassword;
        delete this.data.password;
      });
    });
  }).then(() => {
    return this._validateUserName();
  }).then(() => {
    return this._validateEmail();
  });
};

RestWrite.prototype._validateUserName = function () {
  // Check for username uniqueness
  if (!this.data.username) {
    if (!this.query) {
      this.data.username = cryptoUtils.randomString(25);
      this.responseShouldHaveUsername = true;
    }

    return Promise.resolve();
  }
  /*
    Usernames should be unique when compared case insensitively
     Users should be able to make case sensitive usernames and
    login using the case they entered.  I.e. 'Snoopy' should preclude
    'snoopy' as a valid username.
  */


  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }

    return;
  });
};
/*
  As with usernames, Parse should not allow case insensitive collisions of email.
  unlike with usernames (which can have case insensitive collisions in the case of
  auth adapters), emails should never have a case insensitive collision.

  This behavior can be enforced through a properly configured index see:
  https://docs.mongodb.com/manual/core/index-case-insensitive/#create-a-case-insensitive-index
  which could be implemented instead of this code based validation.

  Given that this lookup should be a relatively low use case and that the case sensitive
  unique index will be used by the db for the query, this is an adequate solution.
*/


RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  } // Validate basic email address format


  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  } // Case insensitive match, see note above function.


  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
    }

    if (!this.data.authData || !Object.keys(this.data.authData).length || Object.keys(this.data.authData).length === 1 && Object.keys(this.data.authData)[0] === 'anonymous') {
      // We updated the email, send a new validation
      this.storage['sendVerificationEmail'] = true;
      this.config.userController.setEmailVerifyToken(this.data);
    }
  });
};

RestWrite.prototype._validatePasswordPolicy = function () {
  if (!this.config.passwordPolicy) return Promise.resolve();
  return this._validatePasswordRequirements().then(() => {
    return this._validatePasswordHistory();
  });
};

RestWrite.prototype._validatePasswordRequirements = function () {
  // check if the password conforms to the defined password policy if configured
  // If we specified a custom error in our configuration use it.
  // Example: "Passwords must include a Capital Letter, Lowercase Letter, and a number."
  //
  // This is especially useful on the generic "password reset" page,
  // as it allows the programmer to communicate specific requirements instead of:
  // a. making the user guess whats wrong
  // b. making a custom password reset page that shows the requirements
  const policyError = this.config.passwordPolicy.validationError ? this.config.passwordPolicy.validationError : 'Password does not meet the Password Policy requirements.';
  const containsUsernameError = 'Password cannot contain your username.'; // check whether the password meets the password strength requirements

  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  } // check whether password contain username


  if (this.config.passwordPolicy.doNotAllowUsername === true) {
    if (this.data.username) {
      // username is not passed during password reset
      if (this.data.password.indexOf(this.data.username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }

        if (this.data.password.indexOf(results[0].username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
        return Promise.resolve();
      });
    }
  }

  return Promise.resolve();
};

RestWrite.prototype._validatePasswordHistory = function () {
  // check whether password is repeating from specified history
  if (this.query && this.config.passwordPolicy.maxPasswordHistory) {
    return this.config.database.find('_User', {
      objectId: this.objectId()
    }, {
      keys: ['_password_history', '_hashed_password']
    }).then(results => {
      if (results.length != 1) {
        throw undefined;
      }

      const user = results[0];
      let oldPasswords = [];
      if (user._password_history) oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      const newPassword = this.data.password; // compare the new password hash with all old password hashes

      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result) // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      }); // wait for all comparisons to complete

      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD') // a match was found
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
        throw err;
      });
    });
  }

  return Promise.resolve();
};

RestWrite.prototype.createSessionTokenIfNeeded = function () {
  if (this.className !== '_User') {
    return;
  } // Don't generate session for updating user (this.query is set) unless authData exists


  if (this.query && !this.data.authData) {
    return;
  } // Don't generate new sessionToken if linking via sessionToken


  if (this.auth.user && this.data.authData) {
    return;
  }

  if (!this.storage['authProvider'] && // signup call, with
  this.config.preventLoginWithUnverifiedEmail && // no login without verification
  this.config.verifyUserEmails) {
    // verification is on
    return; // do not create the session token in that case!
  }

  return this.createSessionToken();
};

RestWrite.prototype.createSessionToken = async function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }

  if (this.storage['authProvider'] == null && this.data.authData) {
    this.storage['authProvider'] = Object.keys(this.data.authData).join(',');
  }

  const {
    sessionData,
    createSession
  } = RestWrite.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage['authProvider'] ? 'login' : 'signup',
      authProvider: this.storage['authProvider'] || 'password'
    },
    installationId: this.auth.installationId
  });

  if (this.response && this.response.response) {
    this.response.response.sessionToken = sessionData.sessionToken;
  }

  return createSession();
};

RestWrite.createSession = function (config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    expiresAt: Parse._encode(expiresAt)
  };

  if (installationId) {
    sessionData.installationId = installationId;
  }

  Object.assign(sessionData, additionalSessionData);
  return {
    sessionData,
    createSession: () => new RestWrite(config, Auth.master(config), '_Session', null, sessionData).execute()
  };
}; // Delete email reset tokens if user is changing password or email.


RestWrite.prototype.deleteEmailResetTokenIfNeeded = function () {
  if (this.className !== '_User' || this.query === null) {
    // null query means create
    return;
  }

  if ('password' in this.data || 'email' in this.data) {
    const addOps = {
      _perishable_token: {
        __op: 'Delete'
      },
      _perishable_token_expires_at: {
        __op: 'Delete'
      }
    };
    this.data = Object.assign(this.data, addOps);
  }
};

RestWrite.prototype.destroyDuplicatedSessions = function () {
  // Only for _Session, and at creation time
  if (this.className != '_Session' || this.query) {
    return;
  } // Destroy the sessions in 'Background'


  const {
    user,
    installationId,
    sessionToken
  } = this.data;

  if (!user || !installationId) {
    return;
  }

  if (!user.objectId) {
    return;
  }

  this.config.database.destroy('_Session', {
    user,
    installationId,
    sessionToken: {
      $ne: sessionToken
    }
  }, {}, this.validSchemaController);
}; // Handles any followup logic


RestWrite.prototype.handleFollowup = function () {
  if (this.storage && this.storage['clearSessions'] && this.config.revokeSessionOnPasswordReset) {
    var sessionQuery = {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
  }

  if (this.storage && this.storage['generateNewSession']) {
    delete this.storage['generateNewSession'];
    return this.createSessionToken().then(this.handleFollowup.bind(this));
  }

  if (this.storage && this.storage['sendVerificationEmail']) {
    delete this.storage['sendVerificationEmail']; // Fire and forget!

    this.config.userController.sendVerificationEmail(this.data);
    return this.handleFollowup.bind(this);
  }
}; // Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.


RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }

  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  } // TODO: Verify proper error to throw


  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
  }

  if (this.query) {
    if (this.data.user && !this.auth.isMaster && this.data.user.objectId != this.auth.user.id) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.installationId) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    }
  }

  if (!this.query && !this.auth.isMaster) {
    const additionalSessionData = {};

    for (var key in this.data) {
      if (key === 'objectId' || key === 'user') {
        continue;
      }

      additionalSessionData[key] = this.data[key];
    }

    const {
      sessionData,
      createSession
    } = RestWrite.createSession(this.config, {
      userId: this.auth.user.id,
      createdWith: {
        action: 'create'
      },
      additionalSessionData
    });
    return createSession().then(results => {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }

      sessionData['objectId'] = results.response['objectId'];
      this.response = {
        status: 201,
        location: results.location,
        response: sessionData
      };
    });
  }
}; // Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.


RestWrite.prototype.handleInstallation = function () {
  if (this.response || this.className !== '_Installation') {
    return;
  }

  if (!this.query && !this.data.deviceToken && !this.data.installationId && !this.auth.installationId) {
    throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
  } // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.


  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  } // We lowercase the installationId if present


  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }

  let installationId = this.data.installationId; // If data.installationId is not set and we're not master, we can lookup in auth

  if (!installationId && !this.auth.isMaster) {
    installationId = this.auth.installationId;
  }

  if (installationId) {
    installationId = installationId.toLowerCase();
  } // Updating _Installation but not updating anything critical


  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }

  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId

  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = []; // Instead of issuing 3 reads, let's do it with one OR.

  const orQueries = [];

  if (this.query && this.query.objectId) {
    orQueries.push({
      objectId: this.query.objectId
    });
  }

  if (installationId) {
    orQueries.push({
      installationId: installationId
    });
  }

  if (this.data.deviceToken) {
    orQueries.push({
      deviceToken: this.data.deviceToken
    });
  }

  if (orQueries.length == 0) {
    return;
  }

  promise = promise.then(() => {
    return this.config.database.find('_Installation', {
      $or: orQueries
    }, {});
  }).then(results => {
    results.forEach(result => {
      if (this.query && this.query.objectId && result.objectId == this.query.objectId) {
        objectIdMatch = result;
      }

      if (result.installationId == installationId) {
        installationIdMatch = result;
      }

      if (result.deviceToken == this.data.deviceToken) {
        deviceTokenMatches.push(result);
      }
    }); // Sanity checks when running a query

    if (this.query && this.query.objectId) {
      if (!objectIdMatch) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
      }

      if (this.data.installationId && objectIdMatch.installationId && this.data.installationId !== objectIdMatch.installationId) {
        throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
      }

      if (this.data.deviceToken && objectIdMatch.deviceToken && this.data.deviceToken !== objectIdMatch.deviceToken && !this.data.installationId && !objectIdMatch.installationId) {
        throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
      }

      if (this.data.deviceType && this.data.deviceType && this.data.deviceType !== objectIdMatch.deviceType) {
        throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
      }
    }

    if (this.query && this.query.objectId && objectIdMatch) {
      idMatch = objectIdMatch;
    }

    if (installationId && installationIdMatch) {
      idMatch = installationIdMatch;
    } // need to specify deviceType only if it's new


    if (!this.query && !this.data.deviceType && !idMatch) {
      throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }
  }).then(() => {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!this.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          deviceToken: this.data.deviceToken,
          installationId: {
            $ne: installationId
          }
        };

        if (this.data.appIdentifier) {
          delQuery['appIdentifier'] = this.data.appIdentifier;
        }

        this.config.database.destroy('_Installation', delQuery).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored.
            return;
          } // rethrow the error


          throw err;
        });
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        const delQuery = {
          objectId: idMatch.objectId
        };
        return this.config.database.destroy('_Installation', delQuery).then(() => {
          return deviceTokenMatches[0]['objectId'];
        }).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored
            return;
          } // rethrow the error


          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          }; // We have a unique install Id, use that to preserve
          // the interesting installation

          if (this.data.installationId) {
            delQuery['installationId'] = {
              $ne: this.data.installationId
            };
          } else if (idMatch.objectId && this.data.objectId && idMatch.objectId == this.data.objectId) {
            // we passed an objectId, preserve that instalation
            delQuery['objectId'] = {
              $ne: idMatch.objectId
            };
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }

          if (this.data.appIdentifier) {
            delQuery['appIdentifier'] = this.data.appIdentifier;
          }

          this.config.database.destroy('_Installation', delQuery).catch(err => {
            if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
              // no deletions were made. Can be ignored.
              return;
            } // rethrow the error


            throw err;
          });
        } // In non-merge scenarios, just return the installation match id


        return idMatch.objectId;
      }
    }
  }).then(objId => {
    if (objId) {
      this.query = {
        objectId: objId
      };
      delete this.data.objectId;
      delete this.data.createdAt;
    } // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)

  });
  return promise;
}; // If we short-circuited the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User


RestWrite.prototype.expandFilesForExistingObjects = function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};

RestWrite.prototype.runDatabaseOperation = function () {
  if (this.response) {
    return;
  }

  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
  }

  if (this.className === '_User' && this.query && this.auth.isUnauthenticated()) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`);
  }

  if (this.className === '_Product' && this.data.download) {
    this.data.downloadName = this.data.download.name;
  } // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.


  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }

  if (this.query) {
    // Force the user to not lockout
    // Matched with parse.com
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true) {
      this.data.ACL[this.query.objectId] = {
        read: true,
        write: true
      };
    } // update password timestamp if user password is being changed


    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    } // Ignore createdAt when update


    delete this.data.createdAt;
    let defer = Promise.resolve(); // if password history is enabled then save the current password to history

    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', {
        objectId: this.objectId()
      }, {
        keys: ['_password_history', '_hashed_password']
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }

        const user = results[0];
        let oldPasswords = [];

        if (user._password_history) {
          oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory);
        } //n-1 passwords go into history including last password


        while (oldPasswords.length > Math.max(0, this.config.passwordPolicy.maxPasswordHistory - 2)) {
          oldPasswords.shift();
        }

        oldPasswords.push(user.password);
        this.data._password_history = oldPasswords;
      });
    }

    return defer.then(() => {
      // Run an update
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, false, false, this.validSchemaController).then(response => {
        response.updatedAt = this.updatedAt;

        this._updateResponseWithData(response, this.data);

        this.response = {
          response
        };
      });
    });
  } else {
    // Set the default ACL and password timestamp for the new _User
    if (this.className === '_User') {
      var ACL = this.data.ACL; // default public r/w ACL

      if (!ACL) {
        ACL = {};

        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
      } // make sure the user is not locked down


      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL; // password timestamp to be used when password expiry policy is enforced

      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    } // Run a create


    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      } // Quick check, if we were able to infer the duplicated field name


      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }

      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      } // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.
      // Fallback to the original method
      // TODO: See if we can later do this without additional queries by using named indexes.


      return this.config.database.find(this.className, {
        username: this.data.username,
        objectId: {
          $ne: this.objectId()
        }
      }, {
        limit: 1
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }

        return this.config.database.find(this.className, {
          email: this.data.email,
          objectId: {
            $ne: this.objectId()
          }
        }, {
          limit: 1
        });
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }

        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    }).then(response => {
      response.objectId = this.data.objectId;
      response.createdAt = this.data.createdAt;

      if (this.responseShouldHaveUsername) {
        response.username = this.data.username;
      }

      this._updateResponseWithData(response, this.data);

      this.response = {
        status: 201,
        response,
        location: this.location()
      };
    });
  }
}; // Returns nothing - doesn't wait for the trigger.


RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response) {
    return;
  } // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.


  const hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  const hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);

  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }

  var extraData = {
    className: this.className
  };

  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  } // Build the original object, we only do this for a update write.


  let originalObject;

  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  } // Build the inflated object, different from beforeSave, originalData is not empty
  // since developers can change data in the beforeSave.


  const updatedObject = this.buildUpdatedObject(extraData);

  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);

  this.config.database.loadSchema().then(schemaController => {
    // Notifiy LiveQueryServer if possible
    const perms = schemaController.getClassLevelPermissions(updatedObject.className);
    this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
  }); // Run afterSave trigger

  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    if (result && typeof result === 'object') {
      this.response.response = result;
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
}; // A helper to figure out what location this operation happens at.


RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
}; // A helper to get the object id for this operation.
// Because it could be either on the query or on the data


RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
}; // Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)


RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }

    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
}; // Returns an updated copy of the object


RestWrite.prototype.buildUpdatedObject = function (extraData) {
  const className = Parse.Object.fromJSON(extraData);
  const readOnlyAttributes = className.constructor.readOnlyAttributes ? className.constructor.readOnlyAttributes() : [];

  if (!this.originalData) {
    for (const attribute of readOnlyAttributes) {
      extraData[attribute] = this.data[attribute];
    }
  }

  const updatedObject = triggers.inflate(extraData, this.originalData);
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      if (typeof data[key].__op === 'string') {
        if (!readOnlyAttributes.includes(key)) {
          updatedObject.set(key, data[key]);
        }
      } else {
        // subdocument key with dot notation { 'x.y': v } => { 'x': { 'y' : v } })
        const splittedKey = key.split('.');
        const parentProp = splittedKey[0];
        let parentVal = updatedObject.get(parentProp);

        if (typeof parentVal !== 'object') {
          parentVal = {};
        }

        parentVal[splittedKey[1]] = data[key];
        updatedObject.set(parentProp, parentVal);
      }

      delete data[key];
    }

    return data;
  }, deepcopy(this.data));
  const sanitized = this.sanitizedData();

  for (const attribute of readOnlyAttributes) {
    delete sanitized[attribute];
  }

  updatedObject.set(sanitized);
  return updatedObject;
};

RestWrite.prototype.cleanUserAuthData = function () {
  if (this.response && this.response.response && this.className === '_User') {
    const user = this.response.response;

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
};

RestWrite.prototype._updateResponseWithData = function (response, data) {
  if (_lodash.default.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }

  const clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    const dataValue = data[fieldName];

    if (!Object.prototype.hasOwnProperty.call(response, fieldName)) {
      response[fieldName] = dataValue;
    } // Strips operations from responses


    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];

      if (clientSupportsDelete && dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  return response;
};

var _default = RestWrite;
exports.default = _default;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJTY2hlbWFDb250cm9sbGVyIiwicmVxdWlyZSIsImRlZXBjb3B5IiwiQXV0aCIsIlV0aWxzIiwiY3J5cHRvVXRpbHMiLCJwYXNzd29yZENyeXB0byIsIlBhcnNlIiwidHJpZ2dlcnMiLCJDbGllbnRTREsiLCJSZXN0V3JpdGUiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwicXVlcnkiLCJkYXRhIiwib3JpZ2luYWxEYXRhIiwiY2xpZW50U0RLIiwiY29udGV4dCIsImFjdGlvbiIsImlzUmVhZE9ubHkiLCJFcnJvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJzdG9yYWdlIiwicnVuT3B0aW9ucyIsImFsbG93Q3VzdG9tT2JqZWN0SWQiLCJPYmplY3QiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJvYmplY3RJZCIsIk1JU1NJTkdfT0JKRUNUX0lEIiwiSU5WQUxJRF9LRVlfTkFNRSIsImlkIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImtleXdvcmQiLCJtYXRjaCIsIm9iamVjdENvbnRhaW5zS2V5VmFsdWUiLCJrZXkiLCJ2YWx1ZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJyZXNwb25zZSIsInVwZGF0ZWRBdCIsIl9lbmNvZGUiLCJEYXRlIiwiaXNvIiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwiZXhlY3V0ZSIsIlByb21pc2UiLCJyZXNvbHZlIiwidGhlbiIsImdldFVzZXJBbmRSb2xlQUNMIiwidmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uIiwiaGFuZGxlSW5zdGFsbGF0aW9uIiwiaGFuZGxlU2Vzc2lvbiIsInZhbGlkYXRlQXV0aERhdGEiLCJydW5CZWZvcmVTYXZlVHJpZ2dlciIsImRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkIiwidmFsaWRhdGVTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwic2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCIsInRyYW5zZm9ybVVzZXIiLCJleHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyIsImRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMiLCJydW5EYXRhYmFzZU9wZXJhdGlvbiIsImNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkIiwiaGFuZGxlRm9sbG93dXAiLCJydW5BZnRlclNhdmVUcmlnZ2VyIiwiY2xlYW5Vc2VyQXV0aERhdGEiLCJpc01hc3RlciIsImFjbCIsInVzZXIiLCJnZXRVc2VyUm9sZXMiLCJyb2xlcyIsImNvbmNhdCIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJpbmRleE9mIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiaGFzQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInRyaWdnZXJFeGlzdHMiLCJUeXBlcyIsImJlZm9yZVNhdmUiLCJhcHBsaWNhdGlvbklkIiwiZXh0cmFEYXRhIiwib3JpZ2luYWxPYmplY3QiLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRVcGRhdGVkT2JqZWN0IiwiaW5mbGF0ZSIsImRhdGFiYXNlUHJvbWlzZSIsInVwZGF0ZSIsImNyZWF0ZSIsInJlc3VsdCIsImxlbmd0aCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJtYXliZVJ1blRyaWdnZXIiLCJvYmplY3QiLCJmaWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIiwiXyIsInJlZHVjZSIsImlzRXF1YWwiLCJwdXNoIiwicnVuQmVmb3JlTG9naW5UcmlnZ2VyIiwidXNlckRhdGEiLCJiZWZvcmVMb2dpbiIsImZpbGVzQ29udHJvbGxlciIsImV4cGFuZEZpbGVzSW5PYmplY3QiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJrZXlzIiwiZm9yRWFjaCIsImF1dGhEYXRhIiwidXNlcm5hbWUiLCJpc0VtcHR5IiwiVVNFUk5BTUVfTUlTU0lORyIsInBhc3N3b3JkIiwiUEFTU1dPUkRfTUlTU0lORyIsIlVOU1VQUE9SVEVEX1NFUlZJQ0UiLCJwcm92aWRlcnMiLCJjYW5IYW5kbGVBdXRoRGF0YSIsImNhbkhhbmRsZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiaGFuZGxlQXV0aERhdGEiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0aW9ucyIsIm1hcCIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiYWxsIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwibWVtbyIsInF1ZXJ5S2V5IiwiZmlsdGVyIiwicSIsImZpbmRQcm9taXNlIiwiJG9yIiwiZmlsdGVyZWRPYmplY3RzQnlBQ0wiLCJvYmplY3RzIiwiQUNMIiwicmVzdWx0cyIsInIiLCJqb2luIiwidXNlclJlc3VsdCIsIm11dGF0ZWRBdXRoRGF0YSIsInByb3ZpZGVyRGF0YSIsInVzZXJBdXRoRGF0YSIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJJZCIsImxvY2F0aW9uIiwiQUNDT1VOVF9BTFJFQURZX0xJTktFRCIsInByb21pc2UiLCJlcnJvciIsIlJlc3RRdWVyeSIsIm1hc3RlciIsIl9fdHlwZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsImNhc2VJbnNlbnNpdGl2ZSIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJyZWplY3QiLCJJTlZBTElEX0VNQUlMX0FERFJFU1MiLCJFTUFJTF9UQUtFTiIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm9sZFBhc3N3b3JkcyIsIl9wYXNzd29yZF9oaXN0b3J5IiwidGFrZSIsIm5ld1Bhc3N3b3JkIiwicHJvbWlzZXMiLCJjb21wYXJlIiwiY2F0Y2giLCJlcnIiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwidmVyaWZ5VXNlckVtYWlscyIsImNyZWF0ZVNlc3Npb25Ub2tlbiIsImluc3RhbGxhdGlvbklkIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhdXRoUHJvdmlkZXIiLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJ0b2tlbiIsIm5ld1Rva2VuIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYXNzaWduIiwiYWRkT3BzIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiZGVzdHJveSIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJzZXNzaW9uUXVlcnkiLCJiaW5kIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwic3RhdHVzIiwiZGV2aWNlVG9rZW4iLCJ0b0xvd2VyQ2FzZSIsImRldmljZVR5cGUiLCJpZE1hdGNoIiwib2JqZWN0SWRNYXRjaCIsImluc3RhbGxhdGlvbklkTWF0Y2giLCJkZXZpY2VUb2tlbk1hdGNoZXMiLCJvclF1ZXJpZXMiLCJkZWxRdWVyeSIsImFwcElkZW50aWZpZXIiLCJjb2RlIiwib2JqSWQiLCJyb2xlIiwiY2xlYXIiLCJpc1VuYXV0aGVudGljYXRlZCIsIlNFU1NJT05fTUlTU0lORyIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwibmFtZSIsIklOVkFMSURfQUNMIiwicmVhZCIsIndyaXRlIiwibWF4UGFzc3dvcmRBZ2UiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsImRlZmVyIiwiTWF0aCIsIm1heCIsInNoaWZ0IiwiX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwiRFVQTElDQVRFX1ZBTFVFIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiaGFzQWZ0ZXJTYXZlSG9vayIsImFmdGVyU2F2ZSIsImhhc0xpdmVRdWVyeSIsImxpdmVRdWVyeUNvbnRyb2xsZXIiLCJfaGFuZGxlU2F2ZVJlc3BvbnNlIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJvbkFmdGVyU2F2ZSIsImxvZ2dlciIsIndhcm4iLCJtaWRkbGUiLCJtb3VudCIsInNlcnZlclVSTCIsInNhbml0aXplZERhdGEiLCJ0ZXN0IiwiX2RlY29kZSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJhdHRyaWJ1dGUiLCJpbmNsdWRlcyIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwiY2xpZW50U3VwcG9ydHNEZWxldGUiLCJzdXBwb3J0c0ZvcndhcmREZWxldGUiLCJkYXRhVmFsdWUiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1Jlc3RXcml0ZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIFJlc3RXcml0ZSBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhbiBvcGVyYXRpb25cbi8vIHRoYXQgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZS5cbi8vIFRoaXMgY291bGQgYmUgZWl0aGVyIGEgXCJjcmVhdGVcIiBvciBhbiBcInVwZGF0ZVwiLlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIGRlZXBjb3B5ID0gcmVxdWlyZSgnZGVlcGNvcHknKTtcblxuY29uc3QgQXV0aCA9IHJlcXVpcmUoJy4vQXV0aCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuL1V0aWxzJyk7XG52YXIgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG52YXIgcGFzc3dvcmRDcnlwdG8gPSByZXF1aXJlKCcuL3Bhc3N3b3JkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG52YXIgQ2xpZW50U0RLID0gcmVxdWlyZSgnLi9DbGllbnRTREsnKTtcbmltcG9ydCBSZXN0UXVlcnkgZnJvbSAnLi9SZXN0UXVlcnknO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi9sb2dnZXInO1xuXG4vLyBxdWVyeSBhbmQgZGF0YSBhcmUgYm90aCBwcm92aWRlZCBpbiBSRVNUIEFQSSBmb3JtYXQuIFNvIGRhdGFcbi8vIHR5cGVzIGFyZSBlbmNvZGVkIGJ5IHBsYWluIG9sZCBvYmplY3RzLlxuLy8gSWYgcXVlcnkgaXMgbnVsbCwgdGhpcyBpcyBhIFwiY3JlYXRlXCIgYW5kIHRoZSBkYXRhIGluIGRhdGEgc2hvdWxkIGJlXG4vLyBjcmVhdGVkLlxuLy8gT3RoZXJ3aXNlIHRoaXMgaXMgYW4gXCJ1cGRhdGVcIiAtIHRoZSBvYmplY3QgbWF0Y2hpbmcgdGhlIHF1ZXJ5XG4vLyBzaG91bGQgZ2V0IHVwZGF0ZWQgd2l0aCBkYXRhLlxuLy8gUmVzdFdyaXRlIHdpbGwgaGFuZGxlIG9iamVjdElkLCBjcmVhdGVkQXQsIGFuZCB1cGRhdGVkQXQgZm9yXG4vLyBldmVyeXRoaW5nLiBJdCBhbHNvIGtub3dzIHRvIHVzZSB0cmlnZ2VycyBhbmQgc3BlY2lhbCBtb2RpZmljYXRpb25zXG4vLyBmb3IgdGhlIF9Vc2VyIGNsYXNzLlxuZnVuY3Rpb24gUmVzdFdyaXRlKGNvbmZpZywgYXV0aCwgY2xhc3NOYW1lLCBxdWVyeSwgZGF0YSwgb3JpZ2luYWxEYXRhLCBjbGllbnRTREssIGNvbnRleHQsIGFjdGlvbikge1xuICBpZiAoYXV0aC5pc1JlYWRPbmx5KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICdDYW5ub3QgcGVyZm9ybSBhIHdyaXRlIG9wZXJhdGlvbiB3aGVuIHVzaW5nIHJlYWRPbmx5TWFzdGVyS2V5J1xuICAgICk7XG4gIH1cbiAgdGhpcy5jb25maWcgPSBjb25maWc7XG4gIHRoaXMuYXV0aCA9IGF1dGg7XG4gIHRoaXMuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICB0aGlzLmNsaWVudFNESyA9IGNsaWVudFNESztcbiAgdGhpcy5zdG9yYWdlID0ge307XG4gIHRoaXMucnVuT3B0aW9ucyA9IHt9O1xuICB0aGlzLmNvbnRleHQgPSBjb250ZXh0IHx8IHt9O1xuXG4gIGlmIChhY3Rpb24pIHtcbiAgICB0aGlzLnJ1bk9wdGlvbnMuYWN0aW9uID0gYWN0aW9uO1xuICB9XG5cbiAgaWYgKCFxdWVyeSkge1xuICAgIGlmICh0aGlzLmNvbmZpZy5hbGxvd0N1c3RvbU9iamVjdElkKSB7XG4gICAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGRhdGEsICdvYmplY3RJZCcpICYmICFkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5NSVNTSU5HX09CSkVDVF9JRCxcbiAgICAgICAgICAnb2JqZWN0SWQgbXVzdCBub3QgYmUgZW1wdHksIG51bGwgb3IgdW5kZWZpbmVkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoZGF0YS5vYmplY3RJZCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgJ29iamVjdElkIGlzIGFuIGludmFsaWQgZmllbGQgbmFtZS4nKTtcbiAgICAgIH1cbiAgICAgIGlmIChkYXRhLmlkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnaWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGlmICh0aGlzLmNvbmZpZy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgLy8gU2NhbiByZXF1ZXN0IGRhdGEgZm9yIGRlbmllZCBrZXl3b3Jkc1xuICAgIGZvciAoY29uc3Qga2V5d29yZCBvZiB0aGlzLmNvbmZpZy5yZXF1ZXN0S2V5d29yZERlbnlsaXN0KSB7XG4gICAgICBjb25zdCBtYXRjaCA9IFV0aWxzLm9iamVjdENvbnRhaW5zS2V5VmFsdWUoZGF0YSwga2V5d29yZC5rZXksIGtleXdvcmQudmFsdWUpO1xuICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgIGBQcm9oaWJpdGVkIGtleXdvcmQgaW4gcmVxdWVzdCBkYXRhOiAke0pTT04uc3RyaW5naWZ5KGtleXdvcmQpfS5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCB0aGlzLnJlc3BvbnNlIG1heSBoYXZlIHNldmVyYWxcbiAgLy8gZmllbGRzLlxuICAvLyByZXNwb25zZTogdGhlIGFjdHVhbCBkYXRhIHRvIGJlIHJldHVybmVkXG4gIC8vIHN0YXR1czogdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGlmIG5vdCBwcmVzZW50LCB0cmVhdGVkIGxpa2UgYSAyMDBcbiAgLy8gbG9jYXRpb246IHRoZSBsb2NhdGlvbiBoZWFkZXIuIGlmIG5vdCBwcmVzZW50LCBubyBsb2NhdGlvbiBoZWFkZXJcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG5cbiAgLy8gUHJvY2Vzc2luZyB0aGlzIG9wZXJhdGlvbiBtYXkgbXV0YXRlIG91ciBkYXRhLCBzbyB3ZSBvcGVyYXRlIG9uIGFcbiAgLy8gY29weVxuICB0aGlzLnF1ZXJ5ID0gZGVlcGNvcHkocXVlcnkpO1xuICB0aGlzLmRhdGEgPSBkZWVwY29weShkYXRhKTtcbiAgLy8gV2UgbmV2ZXIgY2hhbmdlIG9yaWdpbmFsRGF0YSwgc28gd2UgZG8gbm90IG5lZWQgYSBkZWVwIGNvcHlcbiAgdGhpcy5vcmlnaW5hbERhdGEgPSBvcmlnaW5hbERhdGE7XG5cbiAgLy8gVGhlIHRpbWVzdGFtcCB3ZSdsbCB1c2UgZm9yIHRoaXMgd2hvbGUgb3BlcmF0aW9uXG4gIHRoaXMudXBkYXRlZEF0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKS5pc287XG5cbiAgLy8gU2hhcmVkIFNjaGVtYUNvbnRyb2xsZXIgdG8gYmUgcmV1c2VkIHRvIHJlZHVjZSB0aGUgbnVtYmVyIG9mIGxvYWRTY2hlbWEoKSBjYWxscyBwZXIgcmVxdWVzdFxuICAvLyBPbmNlIHNldCB0aGUgc2NoZW1hRGF0YSBzaG91bGQgYmUgaW1tdXRhYmxlXG4gIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gbnVsbDtcbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyB0aGVcbi8vIHdyaXRlLCBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZSwgc3RhdHVzLCBsb2NhdGlvbn0gb2JqZWN0LlxuLy8gc3RhdHVzIGFuZCBsb2NhdGlvbiBhcmUgb3B0aW9uYWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluc3RhbGxhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU2Vzc2lvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQmVmb3JlU2F2ZVRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYSgpO1xuICAgIH0pXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlciA9IHNjaGVtYUNvbnRyb2xsZXI7XG4gICAgICByZXR1cm4gdGhpcy5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy50cmFuc2Zvcm1Vc2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucygpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuRGF0YWJhc2VPcGVyYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQWZ0ZXJTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2xlYW5Vc2VyQXV0aERhdGEoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0V3JpdGUucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gdGhpcy5ydW5PcHRpb25zLmFjbC5jb25jYXQocm9sZXMsIFt0aGlzLmF1dGgudXNlci5pZF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKFxuICAgIHRoaXMuY29uZmlnLmFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiA9PT0gZmFsc2UgJiZcbiAgICAhdGhpcy5hdXRoLmlzTWFzdGVyICYmXG4gICAgU2NoZW1hQ29udHJvbGxlci5zeXN0ZW1DbGFzc2VzLmluZGV4T2YodGhpcy5jbGFzc05hbWUpID09PSAtMVxuICApIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5oYXNDbGFzcyh0aGlzLmNsYXNzTmFtZSkpXG4gICAgICAudGhlbihoYXNDbGFzcyA9PiB7XG4gICAgICAgIGlmIChoYXNDbGFzcyAhPT0gdHJ1ZSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgICAgICAnVGhpcyB1c2VyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2VzcyAnICsgJ25vbi1leGlzdGVudCBjbGFzczogJyArIHRoaXMuY2xhc3NOYW1lXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgc2NoZW1hLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZVNjaGVtYSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnZhbGlkYXRlT2JqZWN0KFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRoaXMuZGF0YSxcbiAgICB0aGlzLnF1ZXJ5LFxuICAgIHRoaXMucnVuT3B0aW9uc1xuICApO1xufTtcblxuLy8gUnVucyBhbnkgYmVmb3JlU2F2ZSB0cmlnZ2VycyBhZ2FpbnN0IHRoaXMgb3BlcmF0aW9uLlxuLy8gQW55IGNoYW5nZSBsZWFkcyB0byBvdXIgZGF0YSBiZWluZyBtdXRhdGVkLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICB2YXIgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBleHRyYURhdGEub2JqZWN0SWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9XG5cbiAgbGV0IG9yaWdpbmFsT2JqZWN0ID0gbnVsbDtcbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRoaXMuYnVpbGRVcGRhdGVkT2JqZWN0KGV4dHJhRGF0YSk7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAvLyBUaGlzIGlzIGFuIHVwZGF0ZSBmb3IgZXhpc3Rpbmcgb2JqZWN0LlxuICAgIG9yaWdpbmFsT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgfVxuXG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIC8vIEJlZm9yZSBjYWxsaW5nIHRoZSB0cmlnZ2VyLCB2YWxpZGF0ZSB0aGUgcGVybWlzc2lvbnMgZm9yIHRoZSBzYXZlIG9wZXJhdGlvblxuICAgICAgbGV0IGRhdGFiYXNlUHJvbWlzZSA9IG51bGw7XG4gICAgICBpZiAodGhpcy5xdWVyeSkge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgdXBkYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciBjcmVhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5jcmVhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJbiB0aGUgY2FzZSB0aGF0IHRoZXJlIGlzIG5vIHBlcm1pc3Npb24gZm9yIHRoZSBvcGVyYXRpb24sIGl0IHRocm93cyBhbiBlcnJvclxuICAgICAgcmV0dXJuIGRhdGFiYXNlUHJvbWlzZS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0IHx8IHJlc3VsdC5sZW5ndGggPD0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZC4nKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgICAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLFxuICAgICAgICB0aGlzLmF1dGgsXG4gICAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICB0aGlzLmNvbmZpZyxcbiAgICAgICAgdGhpcy5jb250ZXh0XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgaWYgKHJlc3BvbnNlICYmIHJlc3BvbnNlLm9iamVjdCkge1xuICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IF8ucmVkdWNlKFxuICAgICAgICAgIHJlc3BvbnNlLm9iamVjdCxcbiAgICAgICAgICAocmVzdWx0LCB2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgICAgICBpZiAoIV8uaXNFcXVhbCh0aGlzLmRhdGFba2V5XSwgdmFsdWUpKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGtleSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICAgIH0sXG4gICAgICAgICAgW11cbiAgICAgICAgKTtcbiAgICAgICAgdGhpcy5kYXRhID0gcmVzcG9uc2Uub2JqZWN0O1xuICAgICAgICAvLyBXZSBzaG91bGQgZGVsZXRlIHRoZSBvYmplY3RJZCBmb3IgYW4gdXBkYXRlIHdyaXRlXG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlciA9IGFzeW5jIGZ1bmN0aW9uICh1c2VyRGF0YSkge1xuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdiZWZvcmVMb2dpbicgdHJpZ2dlclxuICBpZiAoXG4gICAgIXRyaWdnZXJzLnRyaWdnZXJFeGlzdHModGhpcy5jbGFzc05hbWUsIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBDbG91ZCBjb2RlIGdldHMgYSBiaXQgb2YgZXh0cmEgZGF0YSBmb3IgaXRzIG9iamVjdHNcbiAgY29uc3QgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG5cbiAgLy8gRXhwYW5kIGZpbGUgb2JqZWN0c1xuICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdXNlckRhdGEpO1xuXG4gIGNvbnN0IHVzZXIgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdXNlckRhdGEpO1xuXG4gIC8vIG5vIG5lZWQgdG8gcmV0dXJuIGEgcmVzcG9uc2VcbiAgYXdhaXQgdHJpZ2dlcnMubWF5YmVSdW5UcmlnZ2VyKFxuICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZUxvZ2luLFxuICAgIHRoaXMuYXV0aCxcbiAgICB1c2VyLFxuICAgIG51bGwsXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5jb250ZXh0XG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmRhdGEpIHtcbiAgICByZXR1cm4gdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBjb25zdCBzY2hlbWEgPSBhbGxDbGFzc2VzLmZpbmQob25lQ2xhc3MgPT4gb25lQ2xhc3MuY2xhc3NOYW1lID09PSB0aGlzLmNsYXNzTmFtZSk7XG4gICAgICBjb25zdCBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQgPSAoZmllbGROYW1lLCBzZXREZWZhdWx0KSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IG51bGwgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJycgfHxcbiAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJylcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgc2V0RGVmYXVsdCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSBudWxsICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgICAgICh0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID0gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZTtcbiAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgfHwgW107XG4gICAgICAgICAgICBpZiAodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnJlcXVpcmVkID09PSB0cnVlKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgYCR7ZmllbGROYW1lfSBpcyByZXF1aXJlZGApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfTtcblxuICAgICAgLy8gQWRkIGRlZmF1bHQgZmllbGRzXG4gICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuXG4gICAgICAgIC8vIE9ubHkgYXNzaWduIG5ldyBvYmplY3RJZCBpZiB3ZSBhcmUgY3JlYXRpbmcgbmV3IG9iamVjdFxuICAgICAgICBpZiAoIXRoaXMuZGF0YS5vYmplY3RJZCkge1xuICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IGNyeXB0b1V0aWxzLm5ld09iamVjdElkKHRoaXMuY29uZmlnLm9iamVjdElkU2l6ZSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNjaGVtYSkge1xuICAgICAgICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIHRydWUpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNjaGVtYSkge1xuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCBmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cbi8vIFRyYW5zZm9ybXMgYXV0aCBkYXRhIGZvciBhIHVzZXIgb2JqZWN0LlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYSB1c2VyIG9iamVjdC5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS51c2VybmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnYmFkIG9yIG1pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEucGFzc3dvcmQpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgICh0aGlzLmRhdGEuYXV0aERhdGEgJiYgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoKSB8fFxuICAgICFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKVxuICApIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIHt9IG9yIGlmIGF1dGhEYXRhIGRvZXNuJ3QgZXhpc3RcbiAgICByZXR1cm47XG4gIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJykgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8gbnVsbFxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICk7XG4gIH1cblxuICB2YXIgYXV0aERhdGEgPSB0aGlzLmRhdGEuYXV0aERhdGE7XG4gIHZhciBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGlmIChwcm92aWRlcnMubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGNhbkhhbmRsZUF1dGhEYXRhID0gcHJvdmlkZXJzLnJlZHVjZSgoY2FuSGFuZGxlLCBwcm92aWRlcikgPT4ge1xuICAgICAgdmFyIHByb3ZpZGVyQXV0aERhdGEgPSBhdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICB2YXIgaGFzVG9rZW4gPSBwcm92aWRlckF1dGhEYXRhICYmIHByb3ZpZGVyQXV0aERhdGEuaWQ7XG4gICAgICByZXR1cm4gY2FuSGFuZGxlICYmIChoYXNUb2tlbiB8fCBwcm92aWRlckF1dGhEYXRhID09IG51bGwpO1xuICAgIH0sIHRydWUpO1xuICAgIGlmIChjYW5IYW5kbGVBdXRoRGF0YSkge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGEoYXV0aERhdGEpO1xuICAgIH1cbiAgfVxuICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24gPSBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgY29uc3QgdmFsaWRhdGlvbnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkubWFwKHByb3ZpZGVyID0+IHtcbiAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGNvbnN0IHZhbGlkYXRlQXV0aERhdGEgPSB0aGlzLmNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuICAgIGlmICghdmFsaWRhdGVBdXRoRGF0YSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgICAnVGhpcyBhdXRoZW50aWNhdGlvbiBtZXRob2QgaXMgdW5zdXBwb3J0ZWQuJ1xuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbGlkYXRlQXV0aERhdGEoYXV0aERhdGFbcHJvdmlkZXJdKTtcbiAgfSk7XG4gIHJldHVybiBQcm9taXNlLmFsbCh2YWxpZGF0aW9ucyk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSA9IGZ1bmN0aW9uIChhdXRoRGF0YSkge1xuICBjb25zdCBwcm92aWRlcnMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSk7XG4gIGNvbnN0IHF1ZXJ5ID0gcHJvdmlkZXJzXG4gICAgLnJlZHVjZSgobWVtbywgcHJvdmlkZXIpID0+IHtcbiAgICAgIGlmICghYXV0aERhdGFbcHJvdmlkZXJdKSB7XG4gICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgfVxuICAgICAgY29uc3QgcXVlcnlLZXkgPSBgYXV0aERhdGEuJHtwcm92aWRlcn0uaWRgO1xuICAgICAgY29uc3QgcXVlcnkgPSB7fTtcbiAgICAgIHF1ZXJ5W3F1ZXJ5S2V5XSA9IGF1dGhEYXRhW3Byb3ZpZGVyXS5pZDtcbiAgICAgIG1lbW8ucHVzaChxdWVyeSk7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9LCBbXSlcbiAgICAuZmlsdGVyKHEgPT4ge1xuICAgICAgcmV0dXJuIHR5cGVvZiBxICE9PSAndW5kZWZpbmVkJztcbiAgICB9KTtcblxuICBsZXQgZmluZFByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoW10pO1xuICBpZiAocXVlcnkubGVuZ3RoID4gMCkge1xuICAgIGZpbmRQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCh0aGlzLmNsYXNzTmFtZSwgeyAkb3I6IHF1ZXJ5IH0sIHt9KTtcbiAgfVxuXG4gIHJldHVybiBmaW5kUHJvbWlzZTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmlsdGVyZWRPYmplY3RzQnlBQ0wgPSBmdW5jdGlvbiAob2JqZWN0cykge1xuICBpZiAodGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdHM7XG4gIH1cbiAgcmV0dXJuIG9iamVjdHMuZmlsdGVyKG9iamVjdCA9PiB7XG4gICAgaWYgKCFvYmplY3QuQUNMKSB7XG4gICAgICByZXR1cm4gdHJ1ZTsgLy8gbGVnYWN5IHVzZXJzIHRoYXQgaGF2ZSBubyBBQ0wgZmllbGQgb24gdGhlbVxuICAgIH1cbiAgICAvLyBSZWd1bGFyIHVzZXJzIHRoYXQgaGF2ZSBiZWVuIGxvY2tlZCBvdXQuXG4gICAgcmV0dXJuIG9iamVjdC5BQ0wgJiYgT2JqZWN0LmtleXMob2JqZWN0LkFDTCkubGVuZ3RoID4gMDtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhID0gZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGxldCByZXN1bHRzO1xuICByZXR1cm4gdGhpcy5maW5kVXNlcnNXaXRoQXV0aERhdGEoYXV0aERhdGEpLnRoZW4oYXN5bmMgciA9PiB7XG4gICAgcmVzdWx0cyA9IHRoaXMuZmlsdGVyZWRPYmplY3RzQnlBQ0wocik7XG5cbiAgICBpZiAocmVzdWx0cy5sZW5ndGggPT0gMSkge1xuICAgICAgdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5qb2luKCcsJyk7XG5cbiAgICAgIGNvbnN0IHVzZXJSZXN1bHQgPSByZXN1bHRzWzBdO1xuICAgICAgY29uc3QgbXV0YXRlZEF1dGhEYXRhID0ge307XG4gICAgICBPYmplY3Qua2V5cyhhdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGNvbnN0IHByb3ZpZGVyRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29uc3QgdXNlckF1dGhEYXRhID0gdXNlclJlc3VsdC5hdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgIGlmICghXy5pc0VxdWFsKHByb3ZpZGVyRGF0YSwgdXNlckF1dGhEYXRhKSkge1xuICAgICAgICAgIG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl0gPSBwcm92aWRlckRhdGE7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgY29uc3QgaGFzTXV0YXRlZEF1dGhEYXRhID0gT2JqZWN0LmtleXMobXV0YXRlZEF1dGhEYXRhKS5sZW5ndGggIT09IDA7XG4gICAgICBsZXQgdXNlcklkO1xuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICB1c2VySWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgICAgdXNlcklkID0gdGhpcy5hdXRoLnVzZXIuaWQ7XG4gICAgICB9XG4gICAgICBpZiAoIXVzZXJJZCB8fCB1c2VySWQgPT09IHVzZXJSZXN1bHQub2JqZWN0SWQpIHtcbiAgICAgICAgLy8gbm8gdXNlciBtYWtpbmcgdGhlIGNhbGxcbiAgICAgICAgLy8gT1IgdGhlIHVzZXIgbWFraW5nIHRoZSBjYWxsIGlzIHRoZSByaWdodCBvbmVcbiAgICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgICAgZGVsZXRlIHJlc3VsdHNbMF0ucGFzc3dvcmQ7XG5cbiAgICAgICAgLy8gbmVlZCB0byBzZXQgdGhlIG9iamVjdElkIGZpcnN0IG90aGVyd2lzZSBsb2NhdGlvbiBoYXMgdHJhaWxpbmcgdW5kZWZpbmVkXG4gICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgICAgaWYgKCF0aGlzLnF1ZXJ5IHx8ICF0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgLy8gdGhpcyBhIGxvZ2luIGNhbGwsIG5vIHVzZXJJZCBwYXNzZWRcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgICAgcmVzcG9uc2U6IHVzZXJSZXN1bHQsXG4gICAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICAgIH07XG4gICAgICAgICAgLy8gUnVuIGJlZm9yZUxvZ2luIGhvb2sgYmVmb3JlIHN0b3JpbmcgYW55IHVwZGF0ZXNcbiAgICAgICAgICAvLyB0byBhdXRoRGF0YSBvbiB0aGUgZGI7IGNoYW5nZXMgdG8gdXNlclJlc3VsdFxuICAgICAgICAgIC8vIHdpbGwgYmUgaWdub3JlZC5cbiAgICAgICAgICBhd2FpdCB0aGlzLnJ1bkJlZm9yZUxvZ2luVHJpZ2dlcihkZWVwY29weSh1c2VyUmVzdWx0KSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB3ZSBkaWRuJ3QgY2hhbmdlIHRoZSBhdXRoIGRhdGEsIGp1c3Qga2VlcCBnb2luZ1xuICAgICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICAvLyBXZSBoYXZlIGF1dGhEYXRhIHRoYXQgaXMgdXBkYXRlZCBvbiBsb2dpblxuICAgICAgICAvLyB0aGF0IGNhbiBoYXBwZW4gd2hlbiB0b2tlbiBhcmUgcmVmcmVzaGVkLFxuICAgICAgICAvLyBXZSBzaG91bGQgdXBkYXRlIHRoZSB0b2tlbiBhbmQgbGV0IHRoZSB1c2VyIGluXG4gICAgICAgIC8vIFdlIHNob3VsZCBvbmx5IGNoZWNrIHRoZSBtdXRhdGVkIGtleXNcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKG11dGF0ZWRBdXRoRGF0YSkudGhlbihhc3luYyAoKSA9PiB7XG4gICAgICAgICAgLy8gSUYgd2UgaGF2ZSBhIHJlc3BvbnNlLCB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgICAgIC8vIHdlIG5lZWQgdG8gc2V0IGl0IHVwIHRoZXJlLlxuICAgICAgICAgIC8vIFdlIGFyZSBzdXBwb3NlZCB0byBoYXZlIGEgcmVzcG9uc2Ugb25seSBvbiBMT0dJTiB3aXRoIGF1dGhEYXRhLCBzbyB3ZSBza2lwIHRob3NlXG4gICAgICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgICAgICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgICAgICAgICAgLy8gQXNzaWduIHRoZSBuZXcgYXV0aERhdGEgaW4gdGhlIHJlc3BvbnNlXG4gICAgICAgICAgICBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IG11dGF0ZWRBdXRoRGF0YVtwcm92aWRlcl07XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gUnVuIHRoZSBEQiB1cGRhdGUgZGlyZWN0bHksIGFzICdtYXN0ZXInXG4gICAgICAgICAgICAvLyBKdXN0IHVwZGF0ZSB0aGUgYXV0aERhdGEgcGFydFxuICAgICAgICAgICAgLy8gVGhlbiB3ZSdyZSBnb29kIGZvciB0aGUgdXNlciwgZWFybHkgZXhpdCBvZiBzb3J0c1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMuZGF0YS5vYmplY3RJZCB9LFxuICAgICAgICAgICAgICB7IGF1dGhEYXRhOiBtdXRhdGVkQXV0aERhdGEgfSxcbiAgICAgICAgICAgICAge31cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSBpZiAodXNlcklkKSB7XG4gICAgICAgIC8vIFRyeWluZyB0byB1cGRhdGUgYXV0aCBkYXRhIGJ1dCB1c2Vyc1xuICAgICAgICAvLyBhcmUgZGlmZmVyZW50XG4gICAgICAgIGlmICh1c2VyUmVzdWx0Lm9iamVjdElkICE9PSB1c2VySWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBObyBhdXRoIGRhdGEgd2FzIG11dGF0ZWQsIGp1c3Qga2VlcCBnb2luZ1xuICAgICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24oYXV0aERhdGEpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMSkge1xuICAgICAgICAvLyBNb3JlIHRoYW4gMSB1c2VyIHdpdGggdGhlIHBhc3NlZCBpZCdzXG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFRoZSBub24tdGhpcmQtcGFydHkgcGFydHMgb2YgVXNlciB0cmFuc2Zvcm1hdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS50cmFuc2Zvcm1Vc2VyID0gZnVuY3Rpb24gKCkge1xuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgJ2VtYWlsVmVyaWZpZWQnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGVycm9yID0gYENsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5gO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCBlcnJvcik7XG4gIH1cblxuICAvLyBEbyBub3QgY2xlYW51cCBzZXNzaW9uIGlmIG9iamVjdElkIGlzIG5vdCBzZXRcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5vYmplY3RJZCgpKSB7XG4gICAgLy8gSWYgd2UncmUgdXBkYXRpbmcgYSBfVXNlciBvYmplY3QsIHdlIG5lZWQgdG8gY2xlYXIgb3V0IHRoZSBjYWNoZSBmb3IgdGhhdCB1c2VyLiBGaW5kIGFsbCB0aGVpclxuICAgIC8vIHNlc3Npb24gdG9rZW5zLCBhbmQgcmVtb3ZlIHRoZW0gZnJvbSB0aGUgY2FjaGUuXG4gICAgcHJvbWlzZSA9IG5ldyBSZXN0UXVlcnkodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9KVxuICAgICAgLmV4ZWN1dGUoKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHNlc3Npb24gPT5cbiAgICAgICAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvbi5zZXNzaW9uVG9rZW4pXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBwYXNzd29yZFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIGlnbm9yZSBvbmx5IGlmIHVuZGVmaW5lZC4gc2hvdWxkIHByb2NlZWQgaWYgZW1wdHkgKCcnKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddID0gdHJ1ZTtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBuZXcgc2Vzc2lvbiBvbmx5IGlmIHRoZSB1c2VyIHJlcXVlc3RlZFxuICAgICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5KCkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5oYXNoKHRoaXMuZGF0YS5wYXNzd29yZCkudGhlbihoYXNoZWRQYXNzd29yZCA9PiB7XG4gICAgICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgPSBoYXNoZWRQYXNzd29yZDtcbiAgICAgICAgICBkZWxldGUgdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICB9KTtcbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlVXNlck5hbWUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZUVtYWlsKCk7XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVVzZXJOYW1lID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayBmb3IgdXNlcm5hbWUgdW5pcXVlbmVzc1xuICBpZiAoIXRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgdGhpcy5kYXRhLnVzZXJuYW1lID0gY3J5cHRvVXRpbHMucmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLypcbiAgICBVc2VybmFtZXMgc2hvdWxkIGJlIHVuaXF1ZSB3aGVuIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmVseVxuXG4gICAgVXNlcnMgc2hvdWxkIGJlIGFibGUgdG8gbWFrZSBjYXNlIHNlbnNpdGl2ZSB1c2VybmFtZXMgYW5kXG4gICAgbG9naW4gdXNpbmcgdGhlIGNhc2UgdGhleSBlbnRlcmVkLiAgSS5lLiAnU25vb3B5JyBzaG91bGQgcHJlY2x1ZGVcbiAgICAnc25vb3B5JyBhcyBhIHZhbGlkIHVzZXJuYW1lLlxuICAqL1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9KTtcbn07XG5cbi8qXG4gIEFzIHdpdGggdXNlcm5hbWVzLCBQYXJzZSBzaG91bGQgbm90IGFsbG93IGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBvZiBlbWFpbC5cbiAgdW5saWtlIHdpdGggdXNlcm5hbWVzICh3aGljaCBjYW4gaGF2ZSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgaW4gdGhlIGNhc2Ugb2ZcbiAgYXV0aCBhZGFwdGVycyksIGVtYWlscyBzaG91bGQgbmV2ZXIgaGF2ZSBhIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9uLlxuXG4gIFRoaXMgYmVoYXZpb3IgY2FuIGJlIGVuZm9yY2VkIHRocm91Z2ggYSBwcm9wZXJseSBjb25maWd1cmVkIGluZGV4IHNlZTpcbiAgaHR0cHM6Ly9kb2NzLm1vbmdvZGIuY29tL21hbnVhbC9jb3JlL2luZGV4LWNhc2UtaW5zZW5zaXRpdmUvI2NyZWF0ZS1hLWNhc2UtaW5zZW5zaXRpdmUtaW5kZXhcbiAgd2hpY2ggY291bGQgYmUgaW1wbGVtZW50ZWQgaW5zdGVhZCBvZiB0aGlzIGNvZGUgYmFzZWQgdmFsaWRhdGlvbi5cblxuICBHaXZlbiB0aGF0IHRoaXMgbG9va3VwIHNob3VsZCBiZSBhIHJlbGF0aXZlbHkgbG93IHVzZSBjYXNlIGFuZCB0aGF0IHRoZSBjYXNlIHNlbnNpdGl2ZVxuICB1bmlxdWUgaW5kZXggd2lsbCBiZSB1c2VkIGJ5IHRoZSBkYiBmb3IgdGhlIHF1ZXJ5LCB0aGlzIGlzIGFuIGFkZXF1YXRlIHNvbHV0aW9uLlxuKi9cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlRW1haWwgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsIHx8IHRoaXMuZGF0YS5lbWFpbC5fX29wID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBWYWxpZGF0ZSBiYXNpYyBlbWFpbCBhZGRyZXNzIGZvcm1hdFxuICBpZiAoIXRoaXMuZGF0YS5lbWFpbC5tYXRjaCgvXi4rQC4rJC8pKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRU1BSUxfQUREUkVTUywgJ0VtYWlsIGFkZHJlc3MgZm9ybWF0IGlzIGludmFsaWQuJylcbiAgICApO1xuICB9XG4gIC8vIENhc2UgaW5zZW5zaXRpdmUgbWF0Y2gsIHNlZSBub3RlIGFib3ZlIGZ1bmN0aW9uLlxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAuZmluZChcbiAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAge1xuICAgICAgICBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLFxuICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgfSxcbiAgICAgIHsgbGltaXQ6IDEsIGNhc2VJbnNlbnNpdGl2ZTogdHJ1ZSB9LFxuICAgICAge30sXG4gICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICAhdGhpcy5kYXRhLmF1dGhEYXRhIHx8XG4gICAgICAgICFPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCB8fFxuICAgICAgICAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggPT09IDEgJiZcbiAgICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpWzBdID09PSAnYW5vbnltb3VzJylcbiAgICAgICkge1xuICAgICAgICAvLyBXZSB1cGRhdGVkIHRoZSBlbWFpbCwgc2VuZCBhIG5ldyB2YWxpZGF0aW9uXG4gICAgICAgIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10gPSB0cnVlO1xuICAgICAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZXRFbWFpbFZlcmlmeVRva2VuKHRoaXMuZGF0YSk7XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUG9saWN5ID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5KSByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzKCkudGhlbigoKSA9PiB7XG4gICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5KCk7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgaWYgdGhlIHBhc3N3b3JkIGNvbmZvcm1zIHRvIHRoZSBkZWZpbmVkIHBhc3N3b3JkIHBvbGljeSBpZiBjb25maWd1cmVkXG4gIC8vIElmIHdlIHNwZWNpZmllZCBhIGN1c3RvbSBlcnJvciBpbiBvdXIgY29uZmlndXJhdGlvbiB1c2UgaXQuXG4gIC8vIEV4YW1wbGU6IFwiUGFzc3dvcmRzIG11c3QgaW5jbHVkZSBhIENhcGl0YWwgTGV0dGVyLCBMb3dlcmNhc2UgTGV0dGVyLCBhbmQgYSBudW1iZXIuXCJcbiAgLy9cbiAgLy8gVGhpcyBpcyBlc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgZ2VuZXJpYyBcInBhc3N3b3JkIHJlc2V0XCIgcGFnZSxcbiAgLy8gYXMgaXQgYWxsb3dzIHRoZSBwcm9ncmFtbWVyIHRvIGNvbW11bmljYXRlIHNwZWNpZmljIHJlcXVpcmVtZW50cyBpbnN0ZWFkIG9mOlxuICAvLyBhLiBtYWtpbmcgdGhlIHVzZXIgZ3Vlc3Mgd2hhdHMgd3JvbmdcbiAgLy8gYi4gbWFraW5nIGEgY3VzdG9tIHBhc3N3b3JkIHJlc2V0IHBhZ2UgdGhhdCBzaG93cyB0aGUgcmVxdWlyZW1lbnRzXG4gIGNvbnN0IHBvbGljeUVycm9yID0gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgPyB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA6ICdQYXNzd29yZCBkb2VzIG5vdCBtZWV0IHRoZSBQYXNzd29yZCBQb2xpY3kgcmVxdWlyZW1lbnRzLic7XG4gIGNvbnN0IGNvbnRhaW5zVXNlcm5hbWVFcnJvciA9ICdQYXNzd29yZCBjYW5ub3QgY29udGFpbiB5b3VyIHVzZXJuYW1lLic7XG5cbiAgLy8gY2hlY2sgd2hldGhlciB0aGUgcGFzc3dvcmQgbWVldHMgdGhlIHBhc3N3b3JkIHN0cmVuZ3RoIHJlcXVpcmVtZW50c1xuICBpZiAoXG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yKHRoaXMuZGF0YS5wYXNzd29yZCkpIHx8XG4gICAgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sodGhpcy5kYXRhLnBhc3N3b3JkKSlcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBwb2xpY3lFcnJvcikpO1xuICB9XG5cbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBjb250YWluIHVzZXJuYW1lXG4gIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgPT09IHRydWUpIHtcbiAgICBpZiAodGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgICAvLyB1c2VybmFtZSBpcyBub3QgcGFzc2VkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHRoaXMuZGF0YS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gcmV0cmlldmUgdGhlIFVzZXIgb2JqZWN0IHVzaW5nIG9iamVjdElkIGR1cmluZyBwYXNzd29yZCByZXNldFxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoJ19Vc2VyJywgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZihyZXN1bHRzWzBdLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBjb250YWluc1VzZXJuYW1lRXJyb3IpXG4gICAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5ID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGlzIHJlcGVhdGluZyBmcm9tIHNwZWNpZmllZCBoaXN0b3J5XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmZpbmQoXG4gICAgICAgICdfVXNlcicsXG4gICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSlcbiAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMVxuICAgICAgICAgICk7XG4gICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICBjb25zdCBuZXdQYXNzd29yZCA9IHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgLy8gY29tcGFyZSB0aGUgbmV3IHBhc3N3b3JkIGhhc2ggd2l0aCBhbGwgb2xkIHBhc3N3b3JkIGhhc2hlc1xuICAgICAgICBjb25zdCBwcm9taXNlcyA9IG9sZFBhc3N3b3Jkcy5tYXAoZnVuY3Rpb24gKGhhc2gpIHtcbiAgICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uY29tcGFyZShuZXdQYXNzd29yZCwgaGFzaCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdClcbiAgICAgICAgICAgICAgLy8gcmVqZWN0IGlmIHRoZXJlIGlzIGEgbWF0Y2hcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KCdSRVBFQVRfUEFTU1dPUkQnKTtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIC8vIHdhaXQgZm9yIGFsbCBjb21wYXJpc29ucyB0byBjb21wbGV0ZVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyID09PSAnUkVQRUFUX1BBU1NXT1JEJylcbiAgICAgICAgICAgICAgLy8gYSBtYXRjaCB3YXMgZm91bmRcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsXG4gICAgICAgICAgICAgICAgICBgTmV3IHBhc3N3b3JkIHNob3VsZCBub3QgYmUgdGhlIHNhbWUgYXMgbGFzdCAke3RoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeX0gcGFzc3dvcmRzLmBcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRG9uJ3QgZ2VuZXJhdGUgc2Vzc2lvbiBmb3IgdXBkYXRpbmcgdXNlciAodGhpcy5xdWVyeSBpcyBzZXQpIHVubGVzcyBhdXRoRGF0YSBleGlzdHNcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBuZXcgc2Vzc2lvblRva2VuIGlmIGxpbmtpbmcgdmlhIHNlc3Npb25Ub2tlblxuICBpZiAodGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChcbiAgICAhdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSAmJiAvLyBzaWdudXAgY2FsbCwgd2l0aFxuICAgIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgJiYgLy8gbm8gbG9naW4gd2l0aG91dCB2ZXJpZmljYXRpb25cbiAgICB0aGlzLmNvbmZpZy52ZXJpZnlVc2VyRW1haWxzXG4gICkge1xuICAgIC8vIHZlcmlmaWNhdGlvbiBpcyBvblxuICAgIHJldHVybjsgLy8gZG8gbm90IGNyZWF0ZSB0aGUgc2Vzc2lvbiB0b2tlbiBpbiB0aGF0IGNhc2UhXG4gIH1cbiAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmNyZWF0ZVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgLy8gY2xvdWQgaW5zdGFsbGF0aW9uSWQgZnJvbSBDbG91ZCBDb2RlLFxuICAvLyBuZXZlciBjcmVhdGUgc2Vzc2lvbiB0b2tlbnMgZnJvbSB0aGVyZS5cbiAgaWYgKHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCAmJiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgPT09ICdjbG91ZCcpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA9PSBudWxsICYmIHRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIHRoaXMuc3RvcmFnZVsnYXV0aFByb3ZpZGVyJ10gPSBPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmpvaW4oJywnKTtcbiAgfVxuXG4gIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgdXNlcklkOiB0aGlzLm9iamVjdElkKCksXG4gICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgIGFjdGlvbjogdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA/ICdsb2dpbicgOiAnc2lnbnVwJyxcbiAgICAgIGF1dGhQcm92aWRlcjogdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSB8fCAncGFzc3dvcmQnLFxuICAgIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgfSk7XG5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2Uuc2Vzc2lvblRva2VuID0gc2Vzc2lvbkRhdGEuc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgcmV0dXJuIGNyZWF0ZVNlc3Npb24oKTtcbn07XG5cblJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uID0gZnVuY3Rpb24gKFxuICBjb25maWcsXG4gIHsgdXNlcklkLCBjcmVhdGVkV2l0aCwgaW5zdGFsbGF0aW9uSWQsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSB9XG4pIHtcbiAgY29uc3QgdG9rZW4gPSAncjonICsgY3J5cHRvVXRpbHMubmV3VG9rZW4oKTtcbiAgY29uc3QgZXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCgpO1xuICBjb25zdCBzZXNzaW9uRGF0YSA9IHtcbiAgICBzZXNzaW9uVG9rZW46IHRva2VuLFxuICAgIHVzZXI6IHtcbiAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgb2JqZWN0SWQ6IHVzZXJJZCxcbiAgICB9LFxuICAgIGNyZWF0ZWRXaXRoLFxuICAgIGV4cGlyZXNBdDogUGFyc2UuX2VuY29kZShleHBpcmVzQXQpLFxuICB9O1xuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIHNlc3Npb25EYXRhLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBPYmplY3QuYXNzaWduKHNlc3Npb25EYXRhLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEpO1xuXG4gIHJldHVybiB7XG4gICAgc2Vzc2lvbkRhdGEsXG4gICAgY3JlYXRlU2Vzc2lvbjogKCkgPT5cbiAgICAgIG5ldyBSZXN0V3JpdGUoY29uZmlnLCBBdXRoLm1hc3Rlcihjb25maWcpLCAnX1Nlc3Npb24nLCBudWxsLCBzZXNzaW9uRGF0YSkuZXhlY3V0ZSgpLFxuICB9O1xufTtcblxuLy8gRGVsZXRlIGVtYWlsIHJlc2V0IHRva2VucyBpZiB1c2VyIGlzIGNoYW5naW5nIHBhc3N3b3JkIG9yIGVtYWlsLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IHRoaXMucXVlcnkgPT09IG51bGwpIHtcbiAgICAvLyBudWxsIHF1ZXJ5IG1lYW5zIGNyZWF0ZVxuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICgncGFzc3dvcmQnIGluIHRoaXMuZGF0YSB8fCAnZW1haWwnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGFkZE9wcyA9IHtcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgICBfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0OiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcbiAgICB0aGlzLmRhdGEgPSBPYmplY3QuYXNzaWduKHRoaXMuZGF0YSwgYWRkT3BzKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zID0gZnVuY3Rpb24gKCkge1xuICAvLyBPbmx5IGZvciBfU2Vzc2lvbiwgYW5kIGF0IGNyZWF0aW9uIHRpbWVcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9ICdfU2Vzc2lvbicgfHwgdGhpcy5xdWVyeSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEZXN0cm95IHRoZSBzZXNzaW9ucyBpbiAnQmFja2dyb3VuZCdcbiAgY29uc3QgeyB1c2VyLCBpbnN0YWxsYXRpb25JZCwgc2Vzc2lvblRva2VuIH0gPSB0aGlzLmRhdGE7XG4gIGlmICghdXNlciB8fCAhaW5zdGFsbGF0aW9uSWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKCF1c2VyLm9iamVjdElkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koXG4gICAgJ19TZXNzaW9uJyxcbiAgICB7XG4gICAgICB1c2VyLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICBzZXNzaW9uVG9rZW46IHsgJG5lOiBzZXNzaW9uVG9rZW4gfSxcbiAgICB9LFxuICAgIHt9LFxuICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICk7XG59O1xuXG4vLyBIYW5kbGVzIGFueSBmb2xsb3d1cCBsb2dpY1xuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVGb2xsb3d1cCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXSAmJiB0aGlzLmNvbmZpZy5yZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0KSB7XG4gICAgdmFyIHNlc3Npb25RdWVyeSA9IHtcbiAgICAgIHVzZXI6IHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgICAgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICAgIH0sXG4gICAgfTtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ107XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZGVzdHJveSgnX1Nlc3Npb24nLCBzZXNzaW9uUXVlcnkpXG4gICAgICAudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ107XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuKCkudGhlbih0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcykpO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZSAmJiB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddKSB7XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ107XG4gICAgLy8gRmlyZSBhbmQgZm9yZ2V0IVxuICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCh0aGlzLmRhdGEpO1xuICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwLmJpbmQodGhpcyk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9TZXNzaW9uIGNsYXNzIHNwZWNpYWxuZXNzLlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYW4gX1Nlc3Npb24gb2JqZWN0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5oYW5kbGVTZXNzaW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19TZXNzaW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICghdGhpcy5hdXRoLnVzZXIgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sICdTZXNzaW9uIHRva2VuIHJlcXVpcmVkLicpO1xuICB9XG5cbiAgLy8gVE9ETzogVmVyaWZ5IHByb3BlciBlcnJvciB0byB0aHJvd1xuICBpZiAodGhpcy5kYXRhLkFDTCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnQ2Fubm90IHNldCAnICsgJ0FDTCBvbiBhIFNlc3Npb24uJyk7XG4gIH1cblxuICBpZiAodGhpcy5xdWVyeSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmIHRoaXMuZGF0YS51c2VyLm9iamVjdElkICE9IHRoaXMuYXV0aC51c2VyLmlkKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5zZXNzaW9uVG9rZW4pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgIGNvbnN0IGFkZGl0aW9uYWxTZXNzaW9uRGF0YSA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLmRhdGEpIHtcbiAgICAgIGlmIChrZXkgPT09ICdvYmplY3RJZCcgfHwga2V5ID09PSAndXNlcicpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGFba2V5XSA9IHRoaXMuZGF0YVtrZXldO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnY3JlYXRlJyxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMucmVzcG9uc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0Vycm9yIGNyZWF0aW5nIHNlc3Npb24uJyk7XG4gICAgICB9XG4gICAgICBzZXNzaW9uRGF0YVsnb2JqZWN0SWQnXSA9IHJlc3VsdHMucmVzcG9uc2VbJ29iamVjdElkJ107XG4gICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgbG9jYXRpb246IHJlc3VsdHMubG9jYXRpb24sXG4gICAgICAgIHJlc3BvbnNlOiBzZXNzaW9uRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9JbnN0YWxsYXRpb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBpbnN0YWxsYXRpb24gb2JqZWN0LlxuLy8gSWYgYW4gaW5zdGFsbGF0aW9uIGlzIGZvdW5kLCB0aGlzIGNhbiBtdXRhdGUgdGhpcy5xdWVyeSBhbmQgdHVybiBhIGNyZWF0ZVxuLy8gaW50byBhbiB1cGRhdGUuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUluc3RhbGxhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfSW5zdGFsbGF0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChcbiAgICAhdGhpcy5xdWVyeSAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZFxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAxMzUsXG4gICAgICAnYXQgbGVhc3Qgb25lIElEIGZpZWxkIChkZXZpY2VUb2tlbiwgaW5zdGFsbGF0aW9uSWQpICcgKyAnbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkZXZpY2UgdG9rZW4gaXMgNjQgY2hhcmFjdGVycyBsb25nLCB3ZSBhc3N1bWUgaXQgaXMgZm9yIGlPU1xuICAvLyBhbmQgbG93ZXJjYXNlIGl0LlxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIHRoaXMuZGF0YS5kZXZpY2VUb2tlbi5sZW5ndGggPT0gNjQpIHtcbiAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4udG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFdlIGxvd2VyY2FzZSB0aGUgaW5zdGFsbGF0aW9uSWQgaWYgcHJlc2VudFxuICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBsZXQgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQ7XG5cbiAgLy8gSWYgZGF0YS5pbnN0YWxsYXRpb25JZCBpcyBub3Qgc2V0IGFuZCB3ZSdyZSBub3QgbWFzdGVyLCB3ZSBjYW4gbG9va3VwIGluIGF1dGhcbiAgaWYgKCFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQ7XG4gIH1cblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICAvLyBVcGRhdGluZyBfSW5zdGFsbGF0aW9uIGJ1dCBub3QgdXBkYXRpbmcgYW55dGhpbmcgY3JpdGljYWxcbiAgaWYgKHRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiAhaW5zdGFsbGF0aW9uSWQgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICB2YXIgaWRNYXRjaDsgLy8gV2lsbCBiZSBhIG1hdGNoIG9uIGVpdGhlciBvYmplY3RJZCBvciBpbnN0YWxsYXRpb25JZFxuICB2YXIgb2JqZWN0SWRNYXRjaDtcbiAgdmFyIGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gIHZhciBkZXZpY2VUb2tlbk1hdGNoZXMgPSBbXTtcblxuICAvLyBJbnN0ZWFkIG9mIGlzc3VpbmcgMyByZWFkcywgbGV0J3MgZG8gaXQgd2l0aCBvbmUgT1IuXG4gIGNvbnN0IG9yUXVlcmllcyA9IFtdO1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgb2JqZWN0SWQ6IHRoaXMucXVlcnkub2JqZWN0SWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goe1xuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluc3RhbGxhdGlvbklkLFxuICAgIH0pO1xuICB9XG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7IGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gfSk7XG4gIH1cblxuICBpZiAob3JRdWVyaWVzLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJvbWlzZSA9IHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgJ19JbnN0YWxsYXRpb24nLFxuICAgICAgICB7XG4gICAgICAgICAgJG9yOiBvclF1ZXJpZXMsXG4gICAgICAgIH0sXG4gICAgICAgIHt9XG4gICAgICApO1xuICAgIH0pXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmZvckVhY2gocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiByZXN1bHQub2JqZWN0SWQgPT0gdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIG9iamVjdElkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5pbnN0YWxsYXRpb25JZCA9PSBpbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIGluc3RhbGxhdGlvbklkTWF0Y2ggPSByZXN1bHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJlc3VsdC5kZXZpY2VUb2tlbiA9PSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMucHVzaChyZXN1bHQpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgICAgLy8gU2FuaXR5IGNoZWNrcyB3aGVuIHJ1bm5pbmcgYSBxdWVyeVxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAoIW9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQgZm9yIHVwZGF0ZS4nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAhPT0gb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnaW5zdGFsbGF0aW9uSWQgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICYmXG4gICAgICAgICAgb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICAhb2JqZWN0SWRNYXRjaC5pbnN0YWxsYXRpb25JZFxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVG9rZW4gbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVR5cGVcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVR5cGUgbWF5IG5vdCBiZSBjaGFuZ2VkIGluIHRoaXMgJyArICdvcGVyYXRpb24nKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIG9iamVjdElkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IG9iamVjdElkTWF0Y2g7XG4gICAgICB9XG5cbiAgICAgIGlmIChpbnN0YWxsYXRpb25JZCAmJiBpbnN0YWxsYXRpb25JZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICAgICAgfVxuICAgICAgLy8gbmVlZCB0byBzcGVjaWZ5IGRldmljZVR5cGUgb25seSBpZiBpdCdzIG5ld1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJiAhaWRNYXRjaCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM1LCAnZGV2aWNlVHlwZSBtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbicpO1xuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKCFpZE1hdGNoKSB7XG4gICAgICAgIGlmICghZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiZcbiAgICAgICAgICAoIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSB8fCAhaW5zdGFsbGF0aW9uSWQpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIFNpbmdsZSBtYXRjaCBvbiBkZXZpY2UgdG9rZW4gYnV0IG5vbmUgb24gaW5zdGFsbGF0aW9uSWQsIGFuZCBlaXRoZXJcbiAgICAgICAgICAvLyB0aGUgcGFzc2VkIG9iamVjdCBvciB0aGUgbWF0Y2ggaXMgbWlzc2luZyBhbiBpbnN0YWxsYXRpb25JZCwgc28gd2VcbiAgICAgICAgICAvLyBjYW4ganVzdCByZXR1cm4gdGhlIG1hdGNoLlxuICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgIH0gZWxzZSBpZiAoIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIDEzMixcbiAgICAgICAgICAgICdNdXN0IHNwZWNpZnkgaW5zdGFsbGF0aW9uSWQgd2hlbiBkZXZpY2VUb2tlbiAnICtcbiAgICAgICAgICAgICAgJ21hdGNoZXMgbXVsdGlwbGUgSW5zdGFsbGF0aW9uIG9iamVjdHMnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBNdWx0aXBsZSBkZXZpY2UgdG9rZW4gbWF0Y2hlcyBhbmQgd2Ugc3BlY2lmaWVkIGFuIGluc3RhbGxhdGlvbiBJRCxcbiAgICAgICAgICAvLyBvciBhIHNpbmdsZSBtYXRjaCB3aGVyZSBib3RoIHRoZSBwYXNzZWQgYW5kIG1hdGNoaW5nIG9iamVjdHMgaGF2ZVxuICAgICAgICAgIC8vIGFuIGluc3RhbGxhdGlvbiBJRC4gVHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoXG4gICAgICAgICAgLy8gdGhlIGRldmljZVRva2VuLCBhbmQgcmV0dXJuIG5pbCB0byBzaWduYWwgdGhhdCBhIG5ldyBvYmplY3Qgc2hvdWxkXG4gICAgICAgICAgLy8gYmUgY3JlYXRlZC5cbiAgICAgICAgICB2YXIgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHtcbiAgICAgICAgICAgICAgJG5lOiBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAoZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmICFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10pIHtcbiAgICAgICAgICAvLyBFeGFjdGx5IG9uZSBkZXZpY2UgdG9rZW4gbWF0Y2ggYW5kIGl0IGRvZXNuJ3QgaGF2ZSBhbiBpbnN0YWxsYXRpb25cbiAgICAgICAgICAvLyBJRC4gVGhpcyBpcyB0aGUgb25lIGNhc2Ugd2hlcmUgd2Ugd2FudCB0byBtZXJnZSB3aXRoIHRoZSBleGlzdGluZ1xuICAgICAgICAgIC8vIG9iamVjdC5cbiAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHsgb2JqZWN0SWQ6IGlkTWF0Y2gub2JqZWN0SWQgfTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAgIC5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiBkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ29iamVjdElkJ107XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWRcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJiBpZE1hdGNoLmRldmljZVRva2VuICE9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgICAgLy8gV2UncmUgc2V0dGluZyB0aGUgZGV2aWNlIHRva2VuIG9uIGFuIGV4aXN0aW5nIGluc3RhbGxhdGlvbiwgc29cbiAgICAgICAgICAgIC8vIHdlIHNob3VsZCB0cnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2ggdGhpc1xuICAgICAgICAgICAgLy8gZGV2aWNlIHRva2VuLlxuICAgICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7XG4gICAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIHVuaXF1ZSBpbnN0YWxsIElkLCB1c2UgdGhhdCB0byBwcmVzZXJ2ZVxuICAgICAgICAgICAgLy8gdGhlIGludGVyZXN0aW5nIGluc3RhbGxhdGlvblxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnaW5zdGFsbGF0aW9uSWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIGlkTWF0Y2gub2JqZWN0SWQgPT0gdGhpcy5kYXRhLm9iamVjdElkXG4gICAgICAgICAgICApIHtcbiAgICAgICAgICAgICAgLy8gd2UgcGFzc2VkIGFuIG9iamVjdElkLCBwcmVzZXJ2ZSB0aGF0IGluc3RhbGF0aW9uXG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydvYmplY3RJZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogaWRNYXRjaC5vYmplY3RJZCxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIC8vIFdoYXQgdG8gZG8gaGVyZT8gY2FuJ3QgcmVhbGx5IGNsZWFuIHVwIGV2ZXJ5dGhpbmcuLi5cbiAgICAgICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmFwcElkZW50aWZpZXIpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KS5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gSW4gbm9uLW1lcmdlIHNjZW5hcmlvcywganVzdCByZXR1cm4gdGhlIGluc3RhbGxhdGlvbiBtYXRjaCBpZFxuICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbihvYmpJZCA9PiB7XG4gICAgICBpZiAob2JqSWQpIHtcbiAgICAgICAgdGhpcy5xdWVyeSA9IHsgb2JqZWN0SWQ6IG9iaklkIH07XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuICAgICAgfVxuICAgICAgLy8gVE9ETzogVmFsaWRhdGUgb3BzIChhZGQvcmVtb3ZlIG9uIGNoYW5uZWxzLCAkaW5jIG9uIGJhZGdlLCBldGMuKVxuICAgIH0pO1xuICByZXR1cm4gcHJvbWlzZTtcbn07XG5cbi8vIElmIHdlIHNob3J0LWNpcmN1aXRlZCB0aGUgb2JqZWN0IHJlc3BvbnNlIC0gdGhlbiB3ZSBuZWVkIHRvIG1ha2Ugc3VyZSB3ZSBleHBhbmQgYWxsIHRoZSBmaWxlcyxcbi8vIHNpbmNlIHRoaXMgbWlnaHQgbm90IGhhdmUgYSBxdWVyeSwgbWVhbmluZyBpdCB3b24ndCByZXR1cm4gdGhlIGZ1bGwgcmVzdWx0IGJhY2suXG4vLyBUT0RPOiAobmx1dHNlbmtvKSBUaGlzIHNob3VsZCBkaWUgd2hlbiB3ZSBtb3ZlIHRvIHBlci1jbGFzcyBiYXNlZCBjb250cm9sbGVycyBvbiBfU2Vzc2lvbi9fVXNlclxuUmVzdFdyaXRlLnByb3RvdHlwZS5leHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgd2hldGhlciB3ZSBoYXZlIGEgc2hvcnQtY2lyY3VpdGVkIHJlc3BvbnNlIC0gb25seSB0aGVuIHJ1biBleHBhbnNpb24uXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgdGhpcy5yZXNwb25zZS5yZXNwb25zZSk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuRGF0YWJhc2VPcGVyYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1JvbGUnKSB7XG4gICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnJvbGUuY2xlYXIoKTtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJiB0aGlzLnF1ZXJ5ICYmIHRoaXMuYXV0aC5pc1VuYXV0aGVudGljYXRlZCgpKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuU0VTU0lPTl9NSVNTSU5HLFxuICAgICAgYENhbm5vdCBtb2RpZnkgdXNlciAke3RoaXMucXVlcnkub2JqZWN0SWR9LmBcbiAgICApO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1Byb2R1Y3QnICYmIHRoaXMuZGF0YS5kb3dubG9hZCkge1xuICAgIHRoaXMuZGF0YS5kb3dubG9hZE5hbWUgPSB0aGlzLmRhdGEuZG93bmxvYWQubmFtZTtcbiAgfVxuXG4gIC8vIFRPRE86IEFkZCBiZXR0ZXIgZGV0ZWN0aW9uIGZvciBBQ0wsIGVuc3VyaW5nIGEgdXNlciBjYW4ndCBiZSBsb2NrZWQgZnJvbVxuICAvLyAgICAgICB0aGVpciBvd24gdXNlciByZWNvcmQuXG4gIGlmICh0aGlzLmRhdGEuQUNMICYmIHRoaXMuZGF0YS5BQ0xbJyp1bnJlc29sdmVkJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9BQ0wsICdJbnZhbGlkIEFDTC4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgLy8gRm9yY2UgdGhlIHVzZXIgdG8gbm90IGxvY2tvdXRcbiAgICAvLyBNYXRjaGVkIHdpdGggcGFyc2UuY29tXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5hdXRoLmlzTWFzdGVyICE9PSB0cnVlKSB7XG4gICAgICB0aGlzLmRhdGEuQUNMW3RoaXMucXVlcnkub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgIH1cbiAgICAvLyB1cGRhdGUgcGFzc3dvcmQgdGltZXN0YW1wIGlmIHVzZXIgcGFzc3dvcmQgaXMgYmVpbmcgY2hhbmdlZFxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlXG4gICAgKSB7XG4gICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgIH1cbiAgICAvLyBJZ25vcmUgY3JlYXRlZEF0IHdoZW4gdXBkYXRlXG4gICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICBsZXQgZGVmZXIgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAvLyBpZiBwYXNzd29yZCBoaXN0b3J5IGlzIGVuYWJsZWQgdGhlbiBzYXZlIHRoZSBjdXJyZW50IHBhc3N3b3JkIHRvIGhpc3RvcnlcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICApIHtcbiAgICAgIGRlZmVyID0gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLmZpbmQoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICB7IGtleXM6IFsnX3Bhc3N3b3JkX2hpc3RvcnknLCAnX2hhc2hlZF9wYXNzd29yZCddIH1cbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcmVzdWx0c1swXTtcbiAgICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgICAgaWYgKHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnkpIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgICAgdXNlci5fcGFzc3dvcmRfaGlzdG9yeSxcbiAgICAgICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvL24tMSBwYXNzd29yZHMgZ28gaW50byBoaXN0b3J5IGluY2x1ZGluZyBsYXN0IHBhc3N3b3JkXG4gICAgICAgICAgd2hpbGUgKFxuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLmxlbmd0aCA+IE1hdGgubWF4KDAsIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAtIDIpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMuc2hpZnQoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9oaXN0b3J5ID0gb2xkUGFzc3dvcmRzO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gZGVmZXIudGhlbigoKSA9PiB7XG4gICAgICAvLyBSdW4gYW4gdXBkYXRlXG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgKVxuICAgICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgICAgcmVzcG9uc2UudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgICB0aGlzLnJlc3BvbnNlID0geyByZXNwb25zZSB9O1xuICAgICAgICB9KTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBTZXQgdGhlIGRlZmF1bHQgQUNMIGFuZCBwYXNzd29yZCB0aW1lc3RhbXAgZm9yIHRoZSBuZXcgX1VzZXJcbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIHZhciBBQ0wgPSB0aGlzLmRhdGEuQUNMO1xuICAgICAgLy8gZGVmYXVsdCBwdWJsaWMgci93IEFDTFxuICAgICAgaWYgKCFBQ0wpIHtcbiAgICAgICAgQUNMID0ge307XG4gICAgICAgIGlmICghdGhpcy5jb25maWcuZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgICAgICAgIEFDTFsnKiddID0geyByZWFkOiB0cnVlLCB3cml0ZTogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gbWFrZSBzdXJlIHRoZSB1c2VyIGlzIG5vdCBsb2NrZWQgZG93blxuICAgICAgQUNMW3RoaXMuZGF0YS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgICB0aGlzLmRhdGEuQUNMID0gQUNMO1xuICAgICAgLy8gcGFzc3dvcmQgdGltZXN0YW1wIHRvIGJlIHVzZWQgd2hlbiBwYXNzd29yZCBleHBpcnkgcG9saWN5IGlzIGVuZm9yY2VkXG4gICAgICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UpIHtcbiAgICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBSdW4gYSBjcmVhdGVcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5jcmVhdGUodGhpcy5jbGFzc05hbWUsIHRoaXMuZGF0YSwgdGhpcy5ydW5PcHRpb25zLCBmYWxzZSwgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgZXJyb3IuY29kZSAhPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBRdWljayBjaGVjaywgaWYgd2Ugd2VyZSBhYmxlIHRvIGluZmVyIHRoZSBkdXBsaWNhdGVkIGZpZWxkIG5hbWVcbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICd1c2VybmFtZScpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVycm9yICYmIGVycm9yLnVzZXJJbmZvICYmIGVycm9yLnVzZXJJbmZvLmR1cGxpY2F0ZWRfZmllbGQgPT09ICdlbWFpbCcpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiB0aGlzIHdhcyBhIGZhaWxlZCB1c2VyIGNyZWF0aW9uIGR1ZSB0byB1c2VybmFtZSBvciBlbWFpbCBhbHJlYWR5IHRha2VuLCB3ZSBuZWVkIHRvXG4gICAgICAgIC8vIGNoZWNrIHdoZXRoZXIgaXQgd2FzIHVzZXJuYW1lIG9yIGVtYWlsIGFuZCByZXR1cm4gdGhlIGFwcHJvcHJpYXRlIGVycm9yLlxuICAgICAgICAvLyBGYWxsYmFjayB0byB0aGUgb3JpZ2luYWwgbWV0aG9kXG4gICAgICAgIC8vIFRPRE86IFNlZSBpZiB3ZSBjYW4gbGF0ZXIgZG8gdGhpcyB3aXRob3V0IGFkZGl0aW9uYWwgcXVlcmllcyBieSB1c2luZyBuYW1lZCBpbmRleGVzLlxuICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgICAgICAuZmluZChcbiAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICB1c2VybmFtZTogdGhpcy5kYXRhLnVzZXJuYW1lLFxuICAgICAgICAgICAgICBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgIClcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIHVzZXJuYW1lLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBlbWFpbDogdGhpcy5kYXRhLmVtYWlsLCBvYmplY3RJZDogeyAkbmU6IHRoaXMub2JqZWN0SWQoKSB9IH0sXG4gICAgICAgICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSxcbiAgICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgcmVzcG9uc2Uub2JqZWN0SWQgPSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIHJlc3BvbnNlLmNyZWF0ZWRBdCA9IHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG5cbiAgICAgICAgaWYgKHRoaXMucmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUpIHtcbiAgICAgICAgICByZXNwb25zZS51c2VybmFtZSA9IHRoaXMuZGF0YS51c2VybmFtZTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICAgIHJlc3BvbnNlLFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBub3RoaW5nIC0gZG9lc24ndCB3YWl0IGZvciB0aGUgdHJpZ2dlci5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQWZ0ZXJTYXZlVHJpZ2dlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLnJlc3BvbnNlIHx8ICF0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYWZ0ZXJTYXZlJyB0cmlnZ2VyIGZvciB0aGlzIGNsYXNzLlxuICBjb25zdCBoYXNBZnRlclNhdmVIb29rID0gdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyhcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZFxuICApO1xuICBjb25zdCBoYXNMaXZlUXVlcnkgPSB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLmhhc0xpdmVRdWVyeSh0aGlzLmNsYXNzTmFtZSk7XG4gIGlmICghaGFzQWZ0ZXJTYXZlSG9vayAmJiAhaGFzTGl2ZVF1ZXJ5KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgdmFyIGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgZXh0cmFEYXRhLm9iamVjdElkID0gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgfVxuXG4gIC8vIEJ1aWxkIHRoZSBvcmlnaW5hbCBvYmplY3QsIHdlIG9ubHkgZG8gdGhpcyBmb3IgYSB1cGRhdGUgd3JpdGUuXG4gIGxldCBvcmlnaW5hbE9iamVjdDtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yaWdpbmFsT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgfVxuXG4gIC8vIEJ1aWxkIHRoZSBpbmZsYXRlZCBvYmplY3QsIGRpZmZlcmVudCBmcm9tIGJlZm9yZVNhdmUsIG9yaWdpbmFsRGF0YSBpcyBub3QgZW1wdHlcbiAgLy8gc2luY2UgZGV2ZWxvcGVycyBjYW4gY2hhbmdlIGRhdGEgaW4gdGhlIGJlZm9yZVNhdmUuXG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0aGlzLmJ1aWxkVXBkYXRlZE9iamVjdChleHRyYURhdGEpO1xuICB1cGRhdGVkT2JqZWN0Ll9oYW5kbGVTYXZlUmVzcG9uc2UodGhpcy5yZXNwb25zZS5yZXNwb25zZSwgdGhpcy5yZXNwb25zZS5zdGF0dXMgfHwgMjAwKTtcblxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAvLyBOb3RpZml5IExpdmVRdWVyeVNlcnZlciBpZiBwb3NzaWJsZVxuICAgIGNvbnN0IHBlcm1zID0gc2NoZW1hQ29udHJvbGxlci5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnModXBkYXRlZE9iamVjdC5jbGFzc05hbWUpO1xuICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIub25BZnRlclNhdmUoXG4gICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHBlcm1zXG4gICAgKTtcbiAgfSk7XG5cbiAgLy8gUnVuIGFmdGVyU2F2ZSB0cmlnZ2VyXG4gIHJldHVybiB0cmlnZ2Vyc1xuICAgIC5tYXliZVJ1blRyaWdnZXIoXG4gICAgICB0cmlnZ2Vycy5UeXBlcy5hZnRlclNhdmUsXG4gICAgICB0aGlzLmF1dGgsXG4gICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIHRoaXMuY29udGV4dFxuICAgIClcbiAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgaWYgKHJlc3VsdCAmJiB0eXBlb2YgcmVzdWx0ID09PSAnb2JqZWN0Jykge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlID0gcmVzdWx0O1xuICAgICAgfVxuICAgIH0pXG4gICAgLmNhdGNoKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGxvZ2dlci53YXJuKCdhZnRlclNhdmUgY2F1Z2h0IGFuIGVycm9yJywgZXJyKTtcbiAgICB9KTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGZpZ3VyZSBvdXQgd2hhdCBsb2NhdGlvbiB0aGlzIG9wZXJhdGlvbiBoYXBwZW5zIGF0LlxuUmVzdFdyaXRlLnByb3RvdHlwZS5sb2NhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG1pZGRsZSA9IHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInID8gJy91c2Vycy8nIDogJy9jbGFzc2VzLycgKyB0aGlzLmNsYXNzTmFtZSArICcvJztcbiAgY29uc3QgbW91bnQgPSB0aGlzLmNvbmZpZy5tb3VudCB8fCB0aGlzLmNvbmZpZy5zZXJ2ZXJVUkw7XG4gIHJldHVybiBtb3VudCArIG1pZGRsZSArIHRoaXMuZGF0YS5vYmplY3RJZDtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCB0aGUgb2JqZWN0IGlkIGZvciB0aGlzIG9wZXJhdGlvbi5cbi8vIEJlY2F1c2UgaXQgY291bGQgYmUgZWl0aGVyIG9uIHRoZSBxdWVyeSBvciBvbiB0aGUgZGF0YVxuUmVzdFdyaXRlLnByb3RvdHlwZS5vYmplY3RJZCA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMuZGF0YS5vYmplY3RJZCB8fCB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xufTtcblxuLy8gUmV0dXJucyBhIGNvcHkgb2YgdGhlIGRhdGEgYW5kIGRlbGV0ZSBiYWQga2V5cyAoX2F1dGhfZGF0YSwgX2hhc2hlZF9wYXNzd29yZC4uLilcblJlc3RXcml0ZS5wcm90b3R5cGUuc2FuaXRpemVkRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc3QgZGF0YSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKChkYXRhLCBrZXkpID0+IHtcbiAgICAvLyBSZWdleHAgY29tZXMgZnJvbSBQYXJzZS5PYmplY3QucHJvdG90eXBlLnZhbGlkYXRlXG4gICAgaWYgKCEvXltBLVphLXpdWzAtOUEtWmEtel9dKiQvLnRlc3Qoa2V5KSkge1xuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuICByZXR1cm4gUGFyc2UuX2RlY29kZSh1bmRlZmluZWQsIGRhdGEpO1xufTtcblxuLy8gUmV0dXJucyBhbiB1cGRhdGVkIGNvcHkgb2YgdGhlIG9iamVjdFxuUmVzdFdyaXRlLnByb3RvdHlwZS5idWlsZFVwZGF0ZWRPYmplY3QgPSBmdW5jdGlvbiAoZXh0cmFEYXRhKSB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihleHRyYURhdGEpO1xuICBjb25zdCByZWFkT25seUF0dHJpYnV0ZXMgPSBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzXG4gICAgPyBjbGFzc05hbWUuY29uc3RydWN0b3IucmVhZE9ubHlBdHRyaWJ1dGVzKClcbiAgICA6IFtdO1xuICBpZiAoIXRoaXMub3JpZ2luYWxEYXRhKSB7XG4gICAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgICBleHRyYURhdGFbYXR0cmlidXRlXSA9IHRoaXMuZGF0YVthdHRyaWJ1dGVdO1xuICAgIH1cbiAgfVxuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHRoaXMub3JpZ2luYWxEYXRhKTtcbiAgT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoZnVuY3Rpb24gKGRhdGEsIGtleSkge1xuICAgIGlmIChrZXkuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgaWYgKHR5cGVvZiBkYXRhW2tleV0uX19vcCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgaWYgKCFyZWFkT25seUF0dHJpYnV0ZXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KGtleSwgZGF0YVtrZXldKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gc3ViZG9jdW1lbnQga2V5IHdpdGggZG90IG5vdGF0aW9uIHsgJ3gueSc6IHYgfSA9PiB7ICd4JzogeyAneScgOiB2IH0gfSlcbiAgICAgICAgY29uc3Qgc3BsaXR0ZWRLZXkgPSBrZXkuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgcGFyZW50UHJvcCA9IHNwbGl0dGVkS2V5WzBdO1xuICAgICAgICBsZXQgcGFyZW50VmFsID0gdXBkYXRlZE9iamVjdC5nZXQocGFyZW50UHJvcCk7XG4gICAgICAgIGlmICh0eXBlb2YgcGFyZW50VmFsICE9PSAnb2JqZWN0Jykge1xuICAgICAgICAgIHBhcmVudFZhbCA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHBhcmVudFZhbFtzcGxpdHRlZEtleVsxXV0gPSBkYXRhW2tleV07XG4gICAgICAgIHVwZGF0ZWRPYmplY3Quc2V0KHBhcmVudFByb3AsIHBhcmVudFZhbCk7XG4gICAgICB9XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG5cbiAgY29uc3Qgc2FuaXRpemVkID0gdGhpcy5zYW5pdGl6ZWREYXRhKCk7XG4gIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIHJlYWRPbmx5QXR0cmlidXRlcykge1xuICAgIGRlbGV0ZSBzYW5pdGl6ZWRbYXR0cmlidXRlXTtcbiAgfVxuICB1cGRhdGVkT2JqZWN0LnNldChzYW5pdGl6ZWQpO1xuICByZXR1cm4gdXBkYXRlZE9iamVjdDtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xlYW5Vc2VyQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24gKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9IFJlc3RXcml0ZTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQWNBOztBQUNBOztBQUNBOzs7O0FBaEJBO0FBQ0E7QUFDQTtBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQUQsQ0FBOUI7O0FBQ0EsSUFBSUMsUUFBUSxHQUFHRCxPQUFPLENBQUMsVUFBRCxDQUF0Qjs7QUFFQSxNQUFNRSxJQUFJLEdBQUdGLE9BQU8sQ0FBQyxRQUFELENBQXBCOztBQUNBLE1BQU1HLEtBQUssR0FBR0gsT0FBTyxDQUFDLFNBQUQsQ0FBckI7O0FBQ0EsSUFBSUksV0FBVyxHQUFHSixPQUFPLENBQUMsZUFBRCxDQUF6Qjs7QUFDQSxJQUFJSyxjQUFjLEdBQUdMLE9BQU8sQ0FBQyxZQUFELENBQTVCOztBQUNBLElBQUlNLEtBQUssR0FBR04sT0FBTyxDQUFDLFlBQUQsQ0FBbkI7O0FBQ0EsSUFBSU8sUUFBUSxHQUFHUCxPQUFPLENBQUMsWUFBRCxDQUF0Qjs7QUFDQSxJQUFJUSxTQUFTLEdBQUdSLE9BQU8sQ0FBQyxhQUFELENBQXZCOztBQUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLFNBQVNTLFNBQVQsQ0FBbUJDLE1BQW5CLEVBQTJCQyxJQUEzQixFQUFpQ0MsU0FBakMsRUFBNENDLEtBQTVD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