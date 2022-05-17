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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0V3JpdGUuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJkZWVwY29weSIsIkF1dGgiLCJVdGlscyIsImNyeXB0b1V0aWxzIiwicGFzc3dvcmRDcnlwdG8iLCJQYXJzZSIsInRyaWdnZXJzIiwiQ2xpZW50U0RLIiwiUmVzdFdyaXRlIiwiY29uZmlnIiwiYXV0aCIsImNsYXNzTmFtZSIsInF1ZXJ5IiwiZGF0YSIsIm9yaWdpbmFsRGF0YSIsImNsaWVudFNESyIsImNvbnRleHQiLCJhY3Rpb24iLCJpc1JlYWRPbmx5IiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwic3RvcmFnZSIsInJ1bk9wdGlvbnMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiT2JqZWN0IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJrZXl3b3JkIiwibWF0Y2giLCJvYmplY3RDb250YWluc0tleVZhbHVlIiwia2V5IiwidmFsdWUiLCJKU09OIiwic3RyaW5naWZ5IiwicmVzcG9uc2UiLCJ1cGRhdGVkQXQiLCJfZW5jb2RlIiwiRGF0ZSIsImlzbyIsInZhbGlkU2NoZW1hQ29udHJvbGxlciIsImV4ZWN1dGUiLCJQcm9taXNlIiwicmVzb2x2ZSIsInRoZW4iLCJnZXRVc2VyQW5kUm9sZUFDTCIsInZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiIsImhhbmRsZUluc3RhbGxhdGlvbiIsImhhbmRsZVNlc3Npb24iLCJ2YWxpZGF0ZUF1dGhEYXRhIiwicnVuQmVmb3JlU2F2ZVRyaWdnZXIiLCJkZWxldGVFbWFpbFJlc2V0VG9rZW5JZk5lZWRlZCIsInZhbGlkYXRlU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsInNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQiLCJ0cmFuc2Zvcm1Vc2VyIiwiZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMiLCJkZXN0cm95RHVwbGljYXRlZFNlc3Npb25zIiwicnVuRGF0YWJhc2VPcGVyYXRpb24iLCJjcmVhdGVTZXNzaW9uVG9rZW5JZk5lZWRlZCIsImhhbmRsZUZvbGxvd3VwIiwicnVuQWZ0ZXJTYXZlVHJpZ2dlciIsImNsZWFuVXNlckF1dGhEYXRhIiwiaXNNYXN0ZXIiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJ0cmlnZ2VyRXhpc3RzIiwiVHlwZXMiLCJiZWZvcmVTYXZlIiwiYXBwbGljYXRpb25JZCIsImV4dHJhRGF0YSIsIm9yaWdpbmFsT2JqZWN0IiwidXBkYXRlZE9iamVjdCIsImJ1aWxkVXBkYXRlZE9iamVjdCIsImluZmxhdGUiLCJkYXRhYmFzZVByb21pc2UiLCJ1cGRhdGUiLCJjcmVhdGUiLCJyZXN1bHQiLCJsZW5ndGgiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwibWF5YmVSdW5UcmlnZ2VyIiwib2JqZWN0IiwiZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciIsIl8iLCJyZWR1Y2UiLCJpc0VxdWFsIiwicHVzaCIsInJ1bkJlZm9yZUxvZ2luVHJpZ2dlciIsInVzZXJEYXRhIiwiYmVmb3JlTG9naW4iLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiZ2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJzY2hlbWEiLCJmaW5kIiwib25lQ2xhc3MiLCJzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQiLCJmaWVsZE5hbWUiLCJzZXREZWZhdWx0IiwidW5kZWZpbmVkIiwiX19vcCIsImZpZWxkcyIsImRlZmF1bHRWYWx1ZSIsInJlcXVpcmVkIiwiVkFMSURBVElPTl9FUlJPUiIsImNyZWF0ZWRBdCIsIm5ld09iamVjdElkIiwib2JqZWN0SWRTaXplIiwia2V5cyIsImZvckVhY2giLCJhdXRoRGF0YSIsInVzZXJuYW1lIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJwYXNzd29yZCIsIlBBU1NXT1JEX01JU1NJTkciLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwicHJvdmlkZXJzIiwiY2FuSGFuZGxlQXV0aERhdGEiLCJjYW5IYW5kbGUiLCJwcm92aWRlciIsInByb3ZpZGVyQXV0aERhdGEiLCJoYXNUb2tlbiIsImhhbmRsZUF1dGhEYXRhIiwiaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uIiwidmFsaWRhdGlvbnMiLCJtYXAiLCJhdXRoRGF0YU1hbmFnZXIiLCJnZXRWYWxpZGF0b3JGb3JQcm92aWRlciIsImFsbCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsIm1lbW8iLCJxdWVyeUtleSIsImZpbHRlciIsInEiLCJmaW5kUHJvbWlzZSIsIiRvciIsImZpbHRlcmVkT2JqZWN0c0J5QUNMIiwib2JqZWN0cyIsIkFDTCIsInJlc3VsdHMiLCJyIiwiam9pbiIsInVzZXJSZXN1bHQiLCJtdXRhdGVkQXV0aERhdGEiLCJwcm92aWRlckRhdGEiLCJ1c2VyQXV0aERhdGEiLCJoYXNNdXRhdGVkQXV0aERhdGEiLCJ1c2VySWQiLCJsb2NhdGlvbiIsIkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQiLCJwcm9taXNlIiwiZXJyb3IiLCJSZXN0UXVlcnkiLCJtYXN0ZXIiLCJfX3R5cGUiLCJzZXNzaW9uIiwiY2FjaGVDb250cm9sbGVyIiwiZGVsIiwic2Vzc2lvblRva2VuIiwiX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJoYXNoIiwiaGFzaGVkUGFzc3dvcmQiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3ZhbGlkYXRlVXNlck5hbWUiLCJfdmFsaWRhdGVFbWFpbCIsInJhbmRvbVN0cmluZyIsInJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lIiwiJG5lIiwibGltaXQiLCJjYXNlSW5zZW5zaXRpdmUiLCJVU0VSTkFNRV9UQUtFTiIsImVtYWlsIiwicmVqZWN0IiwiSU5WQUxJRF9FTUFJTF9BRERSRVNTIiwiRU1BSUxfVEFLRU4iLCJ1c2VyQ29udHJvbGxlciIsInNldEVtYWlsVmVyaWZ5VG9rZW4iLCJwYXNzd29yZFBvbGljeSIsIl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzIiwiX3ZhbGlkYXRlUGFzc3dvcmRIaXN0b3J5IiwicG9saWN5RXJyb3IiLCJ2YWxpZGF0aW9uRXJyb3IiLCJjb250YWluc1VzZXJuYW1lRXJyb3IiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJvbGRQYXNzd29yZHMiLCJfcGFzc3dvcmRfaGlzdG9yeSIsInRha2UiLCJuZXdQYXNzd29yZCIsInByb21pc2VzIiwiY29tcGFyZSIsImNhdGNoIiwiZXJyIiwicHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCIsInZlcmlmeVVzZXJFbWFpbHMiLCJjcmVhdGVTZXNzaW9uVG9rZW4iLCJpbnN0YWxsYXRpb25JZCIsInNlc3Npb25EYXRhIiwiY3JlYXRlU2Vzc2lvbiIsImNyZWF0ZWRXaXRoIiwiYXV0aFByb3ZpZGVyIiwiYWRkaXRpb25hbFNlc3Npb25EYXRhIiwidG9rZW4iLCJuZXdUb2tlbiIsImV4cGlyZXNBdCIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImFzc2lnbiIsImFkZE9wcyIsIl9wZXJpc2hhYmxlX3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCIsImRlc3Ryb3kiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0Iiwic2Vzc2lvblF1ZXJ5IiwiYmluZCIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInN0YXR1cyIsImRldmljZVRva2VuIiwidG9Mb3dlckNhc2UiLCJkZXZpY2VUeXBlIiwiaWRNYXRjaCIsIm9iamVjdElkTWF0Y2giLCJpbnN0YWxsYXRpb25JZE1hdGNoIiwiZGV2aWNlVG9rZW5NYXRjaGVzIiwib3JRdWVyaWVzIiwiZGVsUXVlcnkiLCJhcHBJZGVudGlmaWVyIiwiY29kZSIsIm9iaklkIiwicm9sZSIsImNsZWFyIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJTRVNTSU9OX01JU1NJTkciLCJkb3dubG9hZCIsImRvd25sb2FkTmFtZSIsIm5hbWUiLCJJTlZBTElEX0FDTCIsInJlYWQiLCJ3cml0ZSIsIm1heFBhc3N3b3JkQWdlIiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJkZWZlciIsIk1hdGgiLCJtYXgiLCJzaGlmdCIsIl91cGRhdGVSZXNwb25zZVdpdGhEYXRhIiwiZW5mb3JjZVByaXZhdGVVc2VycyIsIkRVUExJQ0FURV9WQUxVRSIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImhhc0FmdGVyU2F2ZUhvb2siLCJhZnRlclNhdmUiLCJoYXNMaXZlUXVlcnkiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwiX2hhbmRsZVNhdmVSZXNwb25zZSIsInBlcm1zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwib25BZnRlclNhdmUiLCJsb2dnZXIiLCJ3YXJuIiwibWlkZGxlIiwibW91bnQiLCJzZXJ2ZXJVUkwiLCJzYW5pdGl6ZWREYXRhIiwidGVzdCIsIl9kZWNvZGUiLCJmcm9tSlNPTiIsInJlYWRPbmx5QXR0cmlidXRlcyIsImNvbnN0cnVjdG9yIiwiYXR0cmlidXRlIiwiaW5jbHVkZXMiLCJzZXQiLCJzcGxpdHRlZEtleSIsInNwbGl0IiwicGFyZW50UHJvcCIsInBhcmVudFZhbCIsImdldCIsInNhbml0aXplZCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQWNBOztBQUNBOztBQUNBOzs7O0FBaEJBO0FBQ0E7QUFDQTtBQUVBLElB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USxDQUFDMEUsU0FBRCxDQUFSLENBQW9CRyxJQUEvQyxFQUFxRDtBQUNuRCxhQUFPN0UsUUFBUSxDQUFDMEUsU0FBRCxDQUFmOztBQUNBLFVBQUl5TCxvQkFBb0IsSUFBSUUsU0FBUyxDQUFDeEwsSUFBVixJQUFrQixRQUE5QyxFQUF3RDtBQUN0RDdFLFFBQUFBLFFBQVEsQ0FBQzBFLFNBQUQsQ0FBUixHQUFzQjJMLFNBQXRCO0FBQ0Q7QUFDRjtBQUNGLEdBZEQ7QUFlQSxTQUFPclEsUUFBUDtBQUNELENBckJEOztlQXVCZWhDLFM7O0FBQ2ZzUyxNQUFNLENBQUNDLE9BQVAsR0FBaUJ2UyxTQUFqQiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEEgUmVzdFdyaXRlIGVuY2Fwc3VsYXRlcyBldmVyeXRoaW5nIHdlIG5lZWQgdG8gcnVuIGFuIG9wZXJhdGlvblxuLy8gdGhhdCB3cml0ZXMgdG8gdGhlIGRhdGFiYXNlLlxuLy8gVGhpcyBjb3VsZCBiZSBlaXRoZXIgYSBcImNyZWF0ZVwiIG9yIGFuIFwidXBkYXRlXCIuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgZGVlcGNvcHkgPSByZXF1aXJlKCdkZWVwY29weScpO1xuXG5jb25zdCBBdXRoID0gcmVxdWlyZSgnLi9BdXRoJyk7XG5jb25zdCBVdGlscyA9IHJlcXVpcmUoJy4vVXRpbHMnKTtcbnZhciBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbnZhciBwYXNzd29yZENyeXB0byA9IHJlcXVpcmUoJy4vcGFzc3dvcmQnKTtcbnZhciBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbnZhciB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbnZhciBDbGllbnRTREsgPSByZXF1aXJlKCcuL0NsaWVudFNESycpO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnO1xuaW1wb3J0IGxvZ2dlciBmcm9tICcuL2xvZ2dlcic7XG5cbi8vIHF1ZXJ5IGFuZCBkYXRhIGFyZSBib3RoIHByb3ZpZGVkIGluIFJFU1QgQVBJIGZvcm1hdC4gU28gZGF0YVxuLy8gdHlwZXMgYXJlIGVuY29kZWQgYnkgcGxhaW4gb2xkIG9iamVjdHMuXG4vLyBJZiBxdWVyeSBpcyBudWxsLCB0aGlzIGlzIGEgXCJjcmVhdGVcIiBhbmQgdGhlIGRhdGEgaW4gZGF0YSBzaG91bGQgYmVcbi8vIGNyZWF0ZWQuXG4vLyBPdGhlcndpc2UgdGhpcyBpcyBhbiBcInVwZGF0ZVwiIC0gdGhlIG9iamVjdCBtYXRjaGluZyB0aGUgcXVlcnlcbi8vIHNob3VsZCBnZXQgdXBkYXRlZCB3aXRoIGRhdGEuXG4vLyBSZXN0V3JpdGUgd2lsbCBoYW5kbGUgb2JqZWN0SWQsIGNyZWF0ZWRBdCwgYW5kIHVwZGF0ZWRBdCBmb3Jcbi8vIGV2ZXJ5dGhpbmcuIEl0IGFsc28ga25vd3MgdG8gdXNlIHRyaWdnZXJzIGFuZCBzcGVjaWFsIG1vZGlmaWNhdGlvbnNcbi8vIGZvciB0aGUgX1VzZXIgY2xhc3MuXG5mdW5jdGlvbiBSZXN0V3JpdGUoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHF1ZXJ5LCBkYXRhLCBvcmlnaW5hbERhdGEsIGNsaWVudFNESywgY29udGV4dCwgYWN0aW9uKSB7XG4gIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgJ0Nhbm5vdCBwZXJmb3JtIGEgd3JpdGUgb3BlcmF0aW9uIHdoZW4gdXNpbmcgcmVhZE9ubHlNYXN0ZXJLZXknXG4gICAgKTtcbiAgfVxuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAvLyBTY2FuIHJlcXVlc3QgZGF0YSBmb3IgZGVuaWVkIGtleXdvcmRzXG4gICAgZm9yIChjb25zdCBrZXl3b3JkIG9mIHRoaXMuY29uZmlnLnJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICAgIGNvbnN0IG1hdGNoID0gVXRpbHMub2JqZWN0Q29udGFpbnNLZXlWYWx1ZShkYXRhLCBrZXl3b3JkLmtleSwga2V5d29yZC52YWx1ZSk7XG4gICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgYFByb2hpYml0ZWQga2V5d29yZCBpbiByZXF1ZXN0IGRhdGE6ICR7SlNPTi5zdHJpbmdpZnkoa2V5d29yZCl9LmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBXaGVuIHRoZSBvcGVyYXRpb24gaXMgY29tcGxldGUsIHRoaXMucmVzcG9uc2UgbWF5IGhhdmUgc2V2ZXJhbFxuICAvLyBmaWVsZHMuXG4gIC8vIHJlc3BvbnNlOiB0aGUgYWN0dWFsIGRhdGEgdG8gYmUgcmV0dXJuZWRcbiAgLy8gc3RhdHVzOiB0aGUgaHR0cCBzdGF0dXMgY29kZS4gaWYgbm90IHByZXNlbnQsIHRyZWF0ZWQgbGlrZSBhIDIwMFxuICAvLyBsb2NhdGlvbjogdGhlIGxvY2F0aW9uIGhlYWRlci4gaWYgbm90IHByZXNlbnQsIG5vIGxvY2F0aW9uIGhlYWRlclxuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcblxuICAvLyBQcm9jZXNzaW5nIHRoaXMgb3BlcmF0aW9uIG1heSBtdXRhdGUgb3VyIGRhdGEsIHNvIHdlIG9wZXJhdGUgb24gYVxuICAvLyBjb3B5XG4gIHRoaXMucXVlcnkgPSBkZWVwY29weShxdWVyeSk7XG4gIHRoaXMuZGF0YSA9IGRlZXBjb3B5KGRhdGEpO1xuICAvLyBXZSBuZXZlciBjaGFuZ2Ugb3JpZ2luYWxEYXRhLCBzbyB3ZSBkbyBub3QgbmVlZCBhIGRlZXAgY29weVxuICB0aGlzLm9yaWdpbmFsRGF0YSA9IG9yaWdpbmFsRGF0YTtcblxuICAvLyBUaGUgdGltZXN0YW1wIHdlJ2xsIHVzZSBmb3IgdGhpcyB3aG9sZSBvcGVyYXRpb25cbiAgdGhpcy51cGRhdGVkQXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpLmlzbztcblxuICAvLyBTaGFyZWQgU2NoZW1hQ29udHJvbGxlciB0byBiZSByZXVzZWQgdG8gcmVkdWNlIHRoZSBudW1iZXIgb2YgbG9hZFNjaGVtYSgpIGNhbGxzIHBlciByZXF1ZXN0XG4gIC8vIE9uY2Ugc2V0IHRoZSBzY2hlbWFEYXRhIHNob3VsZCBiZSBpbW11dGFibGVcbiAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXIgPSBudWxsO1xufVxuXG4vLyBBIGNvbnZlbmllbnQgbWV0aG9kIHRvIHBlcmZvcm0gYWxsIHRoZSBzdGVwcyBvZiBwcm9jZXNzaW5nIHRoZVxuLy8gd3JpdGUsIGluIG9yZGVyLlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEge3Jlc3BvbnNlLCBzdGF0dXMsIGxvY2F0aW9ufSBvYmplY3QuXG4vLyBzdGF0dXMgYW5kIGxvY2F0aW9uIGFyZSBvcHRpb25hbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZXhlY3V0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5zdGFsbGF0aW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVTZXNzaW9uKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUF1dGhEYXRhKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVzcG9uc2U7XG4gICAgfSk7XG59O1xuXG4vLyBVc2VzIHRoZSBBdXRoIG9iamVjdCB0byBnZXQgdGhlIGxpc3Qgb2Ygcm9sZXMsIGFkZHMgdGhlIHVzZXIgaWRcblJlc3RXcml0ZS5wcm90b3R5cGUuZ2V0VXNlckFuZFJvbGVBQ0wgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLnJ1bk9wdGlvbnMuYWNsID0gWycqJ107XG5cbiAgaWYgKHRoaXMuYXV0aC51c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuYXV0aC5nZXRVc2VyUm9sZXMoKS50aGVuKHJvbGVzID0+IHtcbiAgICAgIHRoaXMucnVuT3B0aW9ucy5hY2wgPSB0aGlzLnJ1bk9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW3RoaXMuYXV0aC51c2VyLmlkXSk7XG4gICAgICByZXR1cm47XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59O1xuXG4vLyBWYWxpZGF0ZXMgdGhpcyBvcGVyYXRpb24gYWdhaW5zdCB0aGUgYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIGNvbmZpZy5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVDbGllbnRDbGFzc0NyZWF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgKyAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICsgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBzY2hlbWEuXG5SZXN0V3JpdGUucHJvdG90eXBlLnZhbGlkYXRlU2NoZW1hID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudmFsaWRhdGVPYmplY3QoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdGhpcy5kYXRhLFxuICAgIHRoaXMucXVlcnksXG4gICAgdGhpcy5ydW5PcHRpb25zXG4gICk7XG59O1xuXG4vLyBSdW5zIGFueSBiZWZvcmVTYXZlIHRyaWdnZXJzIGFnYWluc3QgdGhpcyBvcGVyYXRpb24uXG4vLyBBbnkgY2hhbmdlIGxlYWRzIHRvIG91ciBkYXRhIGJlaW5nIG11dGF0ZWQuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkJlZm9yZVNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZVNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIHZhciBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIGV4dHJhRGF0YS5vYmplY3RJZCA9IHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gIH1cblxuICBsZXQgb3JpZ2luYWxPYmplY3QgPSBudWxsO1xuICBjb25zdCB1cGRhdGVkT2JqZWN0ID0gdGhpcy5idWlsZFVwZGF0ZWRPYmplY3QoZXh0cmFEYXRhKTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIC8vIFRoaXMgaXMgYW4gdXBkYXRlIGZvciBleGlzdGluZyBvYmplY3QuXG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQmVmb3JlIGNhbGxpbmcgdGhlIHRyaWdnZXIsIHZhbGlkYXRlIHRoZSBwZXJtaXNzaW9ucyBmb3IgdGhlIHNhdmUgb3BlcmF0aW9uXG4gICAgICBsZXQgZGF0YWJhc2VQcm9taXNlID0gbnVsbDtcbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIC8vIFZhbGlkYXRlIGZvciB1cGRhdGluZ1xuICAgICAgICBkYXRhYmFzZVByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWUsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIGNyZWF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLmNyZWF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIHRydWVcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIEluIHRoZSBjYXNlIHRoYXQgdGhlcmUgaXMgbm8gcGVybWlzc2lvbiBmb3IgdGhlIG9wZXJhdGlvbiwgaXQgdGhyb3dzIGFuIGVycm9yXG4gICAgICByZXR1cm4gZGF0YWJhc2VQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgaWYgKCFyZXN1bHQgfHwgcmVzdWx0Lmxlbmd0aCA8PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kLicpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgICAgIHRyaWdnZXJzLlR5cGVzLmJlZm9yZVNhdmUsXG4gICAgICAgIHRoaXMuYXV0aCxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgICB0aGlzLmNvbnRleHRcbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UgJiYgcmVzcG9uc2Uub2JqZWN0KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyID0gXy5yZWR1Y2UoXG4gICAgICAgICAgcmVzcG9uc2Uub2JqZWN0LFxuICAgICAgICAgIChyZXN1bHQsIHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgICAgIGlmICghXy5pc0VxdWFsKHRoaXMuZGF0YVtrZXldLCB2YWx1ZSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXVxuICAgICAgICApO1xuICAgICAgICB0aGlzLmRhdGEgPSByZXNwb25zZS5vYmplY3Q7XG4gICAgICAgIC8vIFdlIHNob3VsZCBkZWxldGUgdGhlIG9iamVjdElkIGZvciBhbiB1cGRhdGUgd3JpdGVcbiAgICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlTG9naW5UcmlnZ2VyID0gYXN5bmMgZnVuY3Rpb24gKHVzZXJEYXRhKSB7XG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2JlZm9yZUxvZ2luJyB0cmlnZ2VyXG4gIGlmIChcbiAgICAhdHJpZ2dlcnMudHJpZ2dlckV4aXN0cyh0aGlzLmNsYXNzTmFtZSwgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWQpXG4gICkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIENsb3VkIGNvZGUgZ2V0cyBhIGJpdCBvZiBleHRyYSBkYXRhIGZvciBpdHMgb2JqZWN0c1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUgfTtcblxuICAvLyBFeHBhbmQgZmlsZSBvYmplY3RzXG4gIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB1c2VyRGF0YSk7XG5cbiAgY29uc3QgdXNlciA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB1c2VyRGF0YSk7XG5cbiAgLy8gbm8gbmVlZCB0byByZXR1cm4gYSByZXNwb25zZVxuICBhd2FpdCB0cmlnZ2Vycy5tYXliZVJ1blRyaWdnZXIoXG4gICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlTG9naW4sXG4gICAgdGhpcy5hdXRoLFxuICAgIHVzZXIsXG4gICAgbnVsbCxcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmNvbnRleHRcbiAgKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuc2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuZGF0YSkge1xuICAgIHJldHVybiB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlci5nZXRBbGxDbGFzc2VzKCkudGhlbihhbGxDbGFzc2VzID0+IHtcbiAgICAgIGNvbnN0IHNjaGVtYSA9IGFsbENsYXNzZXMuZmluZChvbmVDbGFzcyA9PiBvbmVDbGFzcy5jbGFzc05hbWUgPT09IHRoaXMuY2xhc3NOYW1lKTtcbiAgICAgIGNvbnN0IHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCA9IChmaWVsZE5hbWUsIHNldERlZmF1bHQpID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gbnVsbCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnJyB8fFxuICAgICAgICAgICh0eXBlb2YgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICdvYmplY3QnICYmIHRoaXMuZGF0YVtmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBzZXREZWZhdWx0ICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IG51bGwgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAgICAgKHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQgfHxcbiAgICAgICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uZGVmYXVsdFZhbHVlO1xuICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlci5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgICAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0ucmVxdWlyZWQgPT09IHRydWUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLCBgJHtmaWVsZE5hbWV9IGlzIHJlcXVpcmVkYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9O1xuXG4gICAgICAvLyBBZGQgZGVmYXVsdCBmaWVsZHNcbiAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgIGlmICghdGhpcy5xdWVyeSkge1xuICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG5cbiAgICAgICAgLy8gT25seSBhc3NpZ24gbmV3IG9iamVjdElkIGlmIHdlIGFyZSBjcmVhdGluZyBuZXcgb2JqZWN0XG4gICAgICAgIGlmICghdGhpcy5kYXRhLm9iamVjdElkKSB7XG4gICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gY3J5cHRvVXRpbHMubmV3T2JqZWN0SWQodGhpcy5jb25maWcub2JqZWN0SWRTaXplKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgdHJ1ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hKSB7XG4gICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIHNldFJlcXVpcmVkRmllbGRJZk5lZWRlZChmaWVsZE5hbWUsIGZhbHNlKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuLy8gVHJhbnNmb3JtcyBhdXRoIGRhdGEgZm9yIGEgdXNlciBvYmplY3QuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhIHVzZXIgb2JqZWN0LlxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZW4gd2UncmUgZG9uZSBpZiBpdCBjYW4ndCBmaW5pc2ggdGhpcyB0aWNrLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUF1dGhEYXRhID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5hdXRoRGF0YSkge1xuICAgIGlmICh0eXBlb2YgdGhpcy5kYXRhLnVzZXJuYW1lICE9PSAnc3RyaW5nJyB8fCBfLmlzRW1wdHkodGhpcy5kYXRhLnVzZXJuYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVTRVJOQU1FX01JU1NJTkcsICdiYWQgb3IgbWlzc2luZyB1c2VybmFtZScpO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS5wYXNzd29yZCAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS5wYXNzd29yZCkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5QQVNTV09SRF9NSVNTSU5HLCAncGFzc3dvcmQgaXMgcmVxdWlyZWQnKTtcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgKHRoaXMuZGF0YS5hdXRoRGF0YSAmJiAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHx8XG4gICAgIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpXG4gICkge1xuICAgIC8vIEhhbmRsZSBzYXZpbmcgYXV0aERhdGEgdG8ge30gb3IgaWYgYXV0aERhdGEgZG9lc24ndCBleGlzdFxuICAgIHJldHVybjtcbiAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwodGhpcy5kYXRhLCAnYXV0aERhdGEnKSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgLy8gSGFuZGxlIHNhdmluZyBhdXRoRGF0YSB0byBudWxsXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuVU5TVVBQT1JURURfU0VSVklDRSxcbiAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgKTtcbiAgfVxuXG4gIHZhciBhdXRoRGF0YSA9IHRoaXMuZGF0YS5hdXRoRGF0YTtcbiAgdmFyIHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgaWYgKHByb3ZpZGVycy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgY2FuSGFuZGxlQXV0aERhdGEgPSBwcm92aWRlcnMucmVkdWNlKChjYW5IYW5kbGUsIHByb3ZpZGVyKSA9PiB7XG4gICAgICB2YXIgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIHZhciBoYXNUb2tlbiA9IHByb3ZpZGVyQXV0aERhdGEgJiYgcHJvdmlkZXJBdXRoRGF0YS5pZDtcbiAgICAgIHJldHVybiBjYW5IYW5kbGUgJiYgKGhhc1Rva2VuIHx8IHByb3ZpZGVyQXV0aERhdGEgPT0gbnVsbCk7XG4gICAgfSwgdHJ1ZSk7XG4gICAgaWYgKGNhbkhhbmRsZUF1dGhEYXRhKSB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YShhdXRoRGF0YSk7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGZ1bmN0aW9uIChhdXRoRGF0YSkge1xuICBjb25zdCB2YWxpZGF0aW9ucyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKS5tYXAocHJvdmlkZXIgPT4ge1xuICAgIGlmIChhdXRoRGF0YVtwcm92aWRlcl0gPT09IG51bGwpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgY29uc3QgdmFsaWRhdGVBdXRoRGF0YSA9IHRoaXMuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgaWYgKCF2YWxpZGF0ZUF1dGhEYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gdmFsaWRhdGVBdXRoRGF0YShhdXRoRGF0YVtwcm92aWRlcl0pO1xuICB9KTtcbiAgcmV0dXJuIFByb21pc2UuYWxsKHZhbGlkYXRpb25zKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZmluZFVzZXJzV2l0aEF1dGhEYXRhID0gZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgY29uc3QgcXVlcnkgPSBwcm92aWRlcnNcbiAgICAucmVkdWNlKChtZW1vLCBwcm92aWRlcikgPT4ge1xuICAgICAgaWYgKCFhdXRoRGF0YVtwcm92aWRlcl0pIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBxdWVyeUtleSA9IGBhdXRoRGF0YS4ke3Byb3ZpZGVyfS5pZGA7XG4gICAgICBjb25zdCBxdWVyeSA9IHt9O1xuICAgICAgcXVlcnlbcXVlcnlLZXldID0gYXV0aERhdGFbcHJvdmlkZXJdLmlkO1xuICAgICAgbWVtby5wdXNoKHF1ZXJ5KTtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH0sIFtdKVxuICAgIC5maWx0ZXIocSA9PiB7XG4gICAgICByZXR1cm4gdHlwZW9mIHEgIT09ICd1bmRlZmluZWQnO1xuICAgIH0pO1xuXG4gIGxldCBmaW5kUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShbXSk7XG4gIGlmIChxdWVyeS5sZW5ndGggPiAwKSB7XG4gICAgZmluZFByb21pc2UgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKHRoaXMuY2xhc3NOYW1lLCB7ICRvcjogcXVlcnkgfSwge30pO1xuICB9XG5cbiAgcmV0dXJuIGZpbmRQcm9taXNlO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5maWx0ZXJlZE9iamVjdHNCeUFDTCA9IGZ1bmN0aW9uIChvYmplY3RzKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gb2JqZWN0cztcbiAgfVxuICByZXR1cm4gb2JqZWN0cy5maWx0ZXIob2JqZWN0ID0+IHtcbiAgICBpZiAoIW9iamVjdC5BQ0wpIHtcbiAgICAgIHJldHVybiB0cnVlOyAvLyBsZWdhY3kgdXNlcnMgdGhhdCBoYXZlIG5vIEFDTCBmaWVsZCBvbiB0aGVtXG4gICAgfVxuICAgIC8vIFJlZ3VsYXIgdXNlcnMgdGhhdCBoYXZlIGJlZW4gbG9ja2VkIG91dC5cbiAgICByZXR1cm4gb2JqZWN0LkFDTCAmJiBPYmplY3Qua2V5cyhvYmplY3QuQUNMKS5sZW5ndGggPiAwO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlQXV0aERhdGEgPSBmdW5jdGlvbiAoYXV0aERhdGEpIHtcbiAgbGV0IHJlc3VsdHM7XG4gIHJldHVybiB0aGlzLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YShhdXRoRGF0YSkudGhlbihhc3luYyByID0+IHtcbiAgICByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcblxuICAgIGlmIChyZXN1bHRzLmxlbmd0aCA9PSAxKSB7XG4gICAgICB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmpvaW4oJywnKTtcblxuICAgICAgY29uc3QgdXNlclJlc3VsdCA9IHJlc3VsdHNbMF07XG4gICAgICBjb25zdCBtdXRhdGVkQXV0aERhdGEgPSB7fTtcbiAgICAgIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb25zdCB1c2VyQXV0aERhdGEgPSB1c2VyUmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgaWYgKCFfLmlzRXF1YWwocHJvdmlkZXJEYXRhLCB1c2VyQXV0aERhdGEpKSB7XG4gICAgICAgICAgbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXSA9IHByb3ZpZGVyRGF0YTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBjb25zdCBoYXNNdXRhdGVkQXV0aERhdGEgPSBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmxlbmd0aCAhPT0gMDtcbiAgICAgIGxldCB1c2VySWQ7XG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIHVzZXJJZCA9IHRoaXMucXVlcnkub2JqZWN0SWQ7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuYXV0aCAmJiB0aGlzLmF1dGgudXNlciAmJiB0aGlzLmF1dGgudXNlci5pZCkge1xuICAgICAgICB1c2VySWQgPSB0aGlzLmF1dGgudXNlci5pZDtcbiAgICAgIH1cbiAgICAgIGlmICghdXNlcklkIHx8IHVzZXJJZCA9PT0gdXNlclJlc3VsdC5vYmplY3RJZCkge1xuICAgICAgICAvLyBubyB1c2VyIG1ha2luZyB0aGUgY2FsbFxuICAgICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgICAvLyBMb2dpbiB3aXRoIGF1dGggZGF0YVxuICAgICAgICBkZWxldGUgcmVzdWx0c1swXS5wYXNzd29yZDtcblxuICAgICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gdXNlclJlc3VsdC5vYmplY3RJZDtcblxuICAgICAgICBpZiAoIXRoaXMucXVlcnkgfHwgIXRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICAvLyB0aGlzIGEgbG9naW4gY2FsbCwgbm8gdXNlcklkIHBhc3NlZFxuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgICByZXNwb25zZTogdXNlclJlc3VsdCxcbiAgICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgICAgfTtcbiAgICAgICAgICAvLyBSdW4gYmVmb3JlTG9naW4gaG9vayBiZWZvcmUgc3RvcmluZyBhbnkgdXBkYXRlc1xuICAgICAgICAgIC8vIHRvIGF1dGhEYXRhIG9uIHRoZSBkYjsgY2hhbmdlcyB0byB1c2VyUmVzdWx0XG4gICAgICAgICAgLy8gd2lsbCBiZSBpZ25vcmVkLlxuICAgICAgICAgIGF3YWl0IHRoaXMucnVuQmVmb3JlTG9naW5UcmlnZ2VyKGRlZXBjb3B5KHVzZXJSZXN1bHQpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHdlIGRpZG4ndCBjaGFuZ2UgdGhlIGF1dGggZGF0YSwganVzdCBrZWVwIGdvaW5nXG4gICAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIC8vIFdlIGhhdmUgYXV0aERhdGEgdGhhdCBpcyB1cGRhdGVkIG9uIGxvZ2luXG4gICAgICAgIC8vIHRoYXQgY2FuIGhhcHBlbiB3aGVuIHRva2VuIGFyZSByZWZyZXNoZWQsXG4gICAgICAgIC8vIFdlIHNob3VsZCB1cGRhdGUgdGhlIHRva2VuIGFuZCBsZXQgdGhlIHVzZXIgaW5cbiAgICAgICAgLy8gV2Ugc2hvdWxkIG9ubHkgY2hlY2sgdGhlIG11dGF0ZWQga2V5c1xuICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24obXV0YXRlZEF1dGhEYXRhKS50aGVuKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAvLyBJRiB3ZSBoYXZlIGEgcmVzcG9uc2UsIHdlJ2xsIHNraXAgdGhlIGRhdGFiYXNlIG9wZXJhdGlvbiAvIGJlZm9yZVNhdmUgLyBhZnRlclNhdmUgZXRjLi4uXG4gICAgICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAgICAgLy8gV2UgYXJlIHN1cHBvc2VkIHRvIGhhdmUgYSByZXNwb25zZSBvbmx5IG9uIExPR0lOIHdpdGggYXV0aERhdGEsIHNvIHdlIHNraXAgdGhvc2VcbiAgICAgICAgICAvLyBJZiB3ZSdyZSBub3QgbG9nZ2luZyBpbiwgYnV0IGp1c3QgdXBkYXRpbmcgdGhlIGN1cnJlbnQgdXNlciwgd2UgY2FuIHNhZmVseSBza2lwIHRoYXQgcGFydFxuICAgICAgICAgIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgICAgICAgICAvLyBBc3NpZ24gdGhlIG5ldyBhdXRoRGF0YSBpbiB0aGUgcmVzcG9uc2VcbiAgICAgICAgICAgIE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFbcHJvdmlkZXJdID0gbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBSdW4gdGhlIERCIHVwZGF0ZSBkaXJlY3RseSwgYXMgJ21hc3RlcidcbiAgICAgICAgICAgIC8vIEp1c3QgdXBkYXRlIHRoZSBhdXRoRGF0YSBwYXJ0XG4gICAgICAgICAgICAvLyBUaGVuIHdlJ3JlIGdvb2QgZm9yIHRoZSB1c2VyLCBlYXJseSBleGl0IG9mIHNvcnRzXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UudXBkYXRlKFxuICAgICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5kYXRhLm9iamVjdElkIH0sXG4gICAgICAgICAgICAgIHsgYXV0aERhdGE6IG11dGF0ZWRBdXRoRGF0YSB9LFxuICAgICAgICAgICAgICB7fVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfSBlbHNlIGlmICh1c2VySWQpIHtcbiAgICAgICAgLy8gVHJ5aW5nIHRvIHVwZGF0ZSBhdXRoIGRhdGEgYnV0IHVzZXJzXG4gICAgICAgIC8vIGFyZSBkaWZmZXJlbnRcbiAgICAgICAgaWYgKHVzZXJSZXN1bHQub2JqZWN0SWQgIT09IHVzZXJJZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vIGF1dGggZGF0YSB3YXMgbXV0YXRlZCwganVzdCBrZWVwIGdvaW5nXG4gICAgICAgIGlmICghaGFzTXV0YXRlZEF1dGhEYXRhKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSkudGhlbigoKSA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIC8vIE1vcmUgdGhhbiAxIHVzZXIgd2l0aCB0aGUgcGFzc2VkIGlkJ3NcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH0pO1xufTtcblxuLy8gVGhlIG5vbi10aGlyZC1wYXJ0eSBwYXJ0cyBvZiBVc2VyIHRyYW5zZm9ybWF0aW9uXG5SZXN0V3JpdGUucHJvdG90eXBlLnRyYW5zZm9ybVVzZXIgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAnZW1haWxWZXJpZmllZCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgZXJyb3IgPSBgQ2xpZW50cyBhcmVuJ3QgYWxsb3dlZCB0byBtYW51YWxseSB1cGRhdGUgZW1haWwgdmVyaWZpY2F0aW9uLmA7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sIGVycm9yKTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBwcm9taXNlID0gbmV3IFJlc3RRdWVyeSh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH0pXG4gICAgICAuZXhlY3V0ZSgpXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgcmVzdWx0cy5yZXN1bHRzLmZvckVhY2goc2Vzc2lvbiA9PlxuICAgICAgICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci51c2VyLmRlbChzZXNzaW9uLnNlc3Npb25Ub2tlbilcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgcmV0dXJuIHByb21pc2VcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBUcmFuc2Zvcm0gdGhlIHBhc3N3b3JkXG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgLy8gaWdub3JlIG9ubHkgaWYgdW5kZWZpbmVkLiBzaG91bGQgcHJvY2VlZCBpZiBlbXB0eSAoJycpXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gPSB0cnVlO1xuICAgICAgICAvLyBHZW5lcmF0ZSBhIG5ldyBzZXNzaW9uIG9ubHkgaWYgdGhlIHVzZXIgcmVxdWVzdGVkXG4gICAgICAgIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgICAgICAgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3koKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHBhc3N3b3JkQ3J5cHRvLmhhc2godGhpcy5kYXRhLnBhc3N3b3JkKS50aGVuKGhhc2hlZFBhc3N3b3JkID0+IHtcbiAgICAgICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCA9IGhhc2hlZFBhc3N3b3JkO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLmRhdGEucGFzc3dvcmQ7XG4gICAgICAgIH0pO1xuICAgICAgfSk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVVc2VyTmFtZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlRW1haWwoKTtcbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlVXNlck5hbWUgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIGZvciB1c2VybmFtZSB1bmlxdWVuZXNzXG4gIGlmICghdGhpcy5kYXRhLnVzZXJuYW1lKSB7XG4gICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICB0aGlzLmRhdGEudXNlcm5hbWUgPSBjcnlwdG9VdGlscy5yYW5kb21TdHJpbmcoMjUpO1xuICAgICAgdGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvKlxuICAgIFVzZXJuYW1lcyBzaG91bGQgYmUgdW5pcXVlIHdoZW4gY29tcGFyZWQgY2FzZSBpbnNlbnNpdGl2ZWx5XG5cbiAgICBVc2VycyBzaG91bGQgYmUgYWJsZSB0byBtYWtlIGNhc2Ugc2Vuc2l0aXZlIHVzZXJuYW1lcyBhbmRcbiAgICBsb2dpbiB1c2luZyB0aGUgY2FzZSB0aGV5IGVudGVyZWQuICBJLmUuICdTbm9vcHknIHNob3VsZCBwcmVjbHVkZVxuICAgICdzbm9vcHknIGFzIGEgdmFsaWQgdXNlcm5hbWUuXG4gICovXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmV0dXJuO1xuICAgIH0pO1xufTtcblxuLypcbiAgQXMgd2l0aCB1c2VybmFtZXMsIFBhcnNlIHNob3VsZCBub3QgYWxsb3cgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIG9mIGVtYWlsLlxuICB1bmxpa2Ugd2l0aCB1c2VybmFtZXMgKHdoaWNoIGNhbiBoYXZlIGNhc2UgaW5zZW5zaXRpdmUgY29sbGlzaW9ucyBpbiB0aGUgY2FzZSBvZlxuICBhdXRoIGFkYXB0ZXJzKSwgZW1haWxzIHNob3VsZCBuZXZlciBoYXZlIGEgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb24uXG5cbiAgVGhpcyBiZWhhdmlvciBjYW4gYmUgZW5mb3JjZWQgdGhyb3VnaCBhIHByb3Blcmx5IGNvbmZpZ3VyZWQgaW5kZXggc2VlOlxuICBodHRwczovL2RvY3MubW9uZ29kYi5jb20vbWFudWFsL2NvcmUvaW5kZXgtY2FzZS1pbnNlbnNpdGl2ZS8jY3JlYXRlLWEtY2FzZS1pbnNlbnNpdGl2ZS1pbmRleFxuICB3aGljaCBjb3VsZCBiZSBpbXBsZW1lbnRlZCBpbnN0ZWFkIG9mIHRoaXMgY29kZSBiYXNlZCB2YWxpZGF0aW9uLlxuXG4gIEdpdmVuIHRoYXQgdGhpcyBsb29rdXAgc2hvdWxkIGJlIGEgcmVsYXRpdmVseSBsb3cgdXNlIGNhc2UgYW5kIHRoYXQgdGhlIGNhc2Ugc2Vuc2l0aXZlXG4gIHVuaXF1ZSBpbmRleCB3aWxsIGJlIHVzZWQgYnkgdGhlIGRiIGZvciB0aGUgcXVlcnksIHRoaXMgaXMgYW4gYWRlcXVhdGUgc29sdXRpb24uXG4qL1xuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVFbWFpbCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwgfHwgdGhpcy5kYXRhLmVtYWlsLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFZhbGlkYXRlIGJhc2ljIGVtYWlsIGFkZHJlc3MgZm9ybWF0XG4gIGlmICghdGhpcy5kYXRhLmVtYWlsLm1hdGNoKC9eLitALiskLykpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9FTUFJTF9BRERSRVNTLCAnRW1haWwgYWRkcmVzcyBmb3JtYXQgaXMgaW52YWxpZC4nKVxuICAgICk7XG4gIH1cbiAgLy8gQ2FzZSBpbnNlbnNpdGl2ZSBtYXRjaCwgc2VlIG5vdGUgYWJvdmUgZnVuY3Rpb24uXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB7XG4gICAgICAgIGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsXG4gICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICB9LFxuICAgICAgeyBsaW1pdDogMSwgY2FzZUluc2Vuc2l0aXZlOiB0cnVlIH0sXG4gICAgICB7fSxcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgICF0aGlzLmRhdGEuYXV0aERhdGEgfHxcbiAgICAgICAgIU9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoIHx8XG4gICAgICAgIChPYmplY3Qua2V5cyh0aGlzLmRhdGEuYXV0aERhdGEpLmxlbmd0aCA9PT0gMSAmJlxuICAgICAgICAgIE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSlbMF0gPT09ICdhbm9ueW1vdXMnKVxuICAgICAgKSB7XG4gICAgICAgIC8vIFdlIHVwZGF0ZWQgdGhlIGVtYWlsLCBzZW5kIGEgbmV3IHZhbGlkYXRpb25cbiAgICAgICAgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSA9IHRydWU7XG4gICAgICAgIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhKTtcbiAgICAgIH1cbiAgICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRQb2xpY3kgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kpIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgcmV0dXJuIHRoaXMuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMoKS50aGVuKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkoKTtcbiAgfSk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkUmVxdWlyZW1lbnRzID0gZnVuY3Rpb24gKCkge1xuICAvLyBjaGVjayBpZiB0aGUgcGFzc3dvcmQgY29uZm9ybXMgdG8gdGhlIGRlZmluZWQgcGFzc3dvcmQgcG9saWN5IGlmIGNvbmZpZ3VyZWRcbiAgLy8gSWYgd2Ugc3BlY2lmaWVkIGEgY3VzdG9tIGVycm9yIGluIG91ciBjb25maWd1cmF0aW9uIHVzZSBpdC5cbiAgLy8gRXhhbXBsZTogXCJQYXNzd29yZHMgbXVzdCBpbmNsdWRlIGEgQ2FwaXRhbCBMZXR0ZXIsIExvd2VyY2FzZSBMZXR0ZXIsIGFuZCBhIG51bWJlci5cIlxuICAvL1xuICAvLyBUaGlzIGlzIGVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBnZW5lcmljIFwicGFzc3dvcmQgcmVzZXRcIiBwYWdlLFxuICAvLyBhcyBpdCBhbGxvd3MgdGhlIHByb2dyYW1tZXIgdG8gY29tbXVuaWNhdGUgc3BlY2lmaWMgcmVxdWlyZW1lbnRzIGluc3RlYWQgb2Y6XG4gIC8vIGEuIG1ha2luZyB0aGUgdXNlciBndWVzcyB3aGF0cyB3cm9uZ1xuICAvLyBiLiBtYWtpbmcgYSBjdXN0b20gcGFzc3dvcmQgcmVzZXQgcGFnZSB0aGF0IHNob3dzIHRoZSByZXF1aXJlbWVudHNcbiAgY29uc3QgcG9saWN5RXJyb3IgPSB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0aW9uRXJyb3JcbiAgICA/IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgIDogJ1Bhc3N3b3JkIGRvZXMgbm90IG1lZXQgdGhlIFBhc3N3b3JkIFBvbGljeSByZXF1aXJlbWVudHMuJztcbiAgY29uc3QgY29udGFpbnNVc2VybmFtZUVycm9yID0gJ1Bhc3N3b3JkIGNhbm5vdCBjb250YWluIHlvdXIgdXNlcm5hbWUuJztcblxuICAvLyBjaGVjayB3aGV0aGVyIHRoZSBwYXNzd29yZCBtZWV0cyB0aGUgcGFzc3dvcmQgc3RyZW5ndGggcmVxdWlyZW1lbnRzXG4gIGlmIChcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvciAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IodGhpcy5kYXRhLnBhc3N3b3JkKSkgfHxcbiAgICAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgJiZcbiAgICAgICF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayh0aGlzLmRhdGEucGFzc3dvcmQpKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIHBvbGljeUVycm9yKSk7XG4gIH1cblxuICAvLyBjaGVjayB3aGV0aGVyIHBhc3N3b3JkIGNvbnRhaW4gdXNlcm5hbWVcbiAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSA9PT0gdHJ1ZSkge1xuICAgIGlmICh0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICAgIC8vIHVzZXJuYW1lIGlzIG5vdCBwYXNzZWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YodGhpcy5kYXRhLnVzZXJuYW1lKSA+PSAwKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcikpO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyByZXRyaWV2ZSB0aGUgVXNlciBvYmplY3QgdXNpbmcgb2JqZWN0SWQgZHVyaW5nIHBhc3N3b3JkIHJlc2V0XG4gICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZC5pbmRleE9mKHJlc3VsdHNbMF0udXNlcm5hbWUpID49IDApXG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGNvbnRhaW5zVXNlcm5hbWVFcnJvcilcbiAgICAgICAgICApO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgaXMgcmVwZWF0aW5nIGZyb20gc3BlY2lmaWVkIGhpc3RvcnlcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICAgKTtcbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbiAoaGFzaCkge1xuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKG5ld1Bhc3N3b3JkLCBoYXNoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KVxuICAgICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gd2FpdCBmb3IgYWxsIGNvbXBhcmlzb25zIHRvIGNvbXBsZXRlXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIgPT09ICdSRVBFQVRfUEFTU1dPUkQnKVxuICAgICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBzZXNzaW9uIGZvciB1cGRhdGluZyB1c2VyICh0aGlzLnF1ZXJ5IGlzIHNldCkgdW5sZXNzIGF1dGhEYXRhIGV4aXN0c1xuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIG5ldyBzZXNzaW9uVG9rZW4gaWYgbGlua2luZyB2aWEgc2Vzc2lvblRva2VuXG4gIGlmICh0aGlzLmF1dGgudXNlciAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKFxuICAgICF0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddICYmIC8vIHNpZ251cCBjYWxsLCB3aXRoXG4gICAgdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCAmJiAvLyBubyBsb2dpbiB3aXRob3V0IHZlcmlmaWNhdGlvblxuICAgIHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHNcbiAgKSB7XG4gICAgLy8gdmVyaWZpY2F0aW9uIGlzIG9uXG4gICAgcmV0dXJuOyAvLyBkbyBub3QgY3JlYXRlIHRoZSBzZXNzaW9uIHRva2VuIGluIHRoYXQgY2FzZSFcbiAgfVxuICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICAvLyBjbG91ZCBpbnN0YWxsYXRpb25JZCBmcm9tIENsb3VkIENvZGUsXG4gIC8vIG5ldmVyIGNyZWF0ZSBzZXNzaW9uIHRva2VucyBmcm9tIHRoZXJlLlxuICBpZiAodGhpcy5hdXRoLmluc3RhbGxhdGlvbklkICYmIHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCA9PT0gJ2Nsb3VkJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID09IG51bGwgJiYgdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgdGhpcy5zdG9yYWdlWydhdXRoUHJvdmlkZXInXSA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuam9pbignLCcpO1xuICB9XG5cbiAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICB1c2VySWQ6IHRoaXMub2JqZWN0SWQoKSxcbiAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgYWN0aW9uOiB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddID8gJ2xvZ2luJyA6ICdzaWdudXAnLFxuICAgICAgYXV0aFByb3ZpZGVyOiB0aGlzLnN0b3JhZ2VbJ2F1dGhQcm92aWRlciddIHx8ICdwYXNzd29yZCcsXG4gICAgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICB9KTtcblxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uRGF0YS5zZXNzaW9uVG9rZW47XG4gIH1cblxuICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpO1xufTtcblxuUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24gPSBmdW5jdGlvbiAoXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShjb25maWcsIEF1dGgubWFzdGVyKGNvbmZpZyksICdfU2Vzc2lvbicsIG51bGwsIHNlc3Npb25EYXRhKS5leGVjdXRlKCksXG4gIH07XG59O1xuXG4vLyBEZWxldGUgZW1haWwgcmVzZXQgdG9rZW5zIGlmIHVzZXIgaXMgY2hhbmdpbmcgcGFzc3dvcmQgb3IgZW1haWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicgfHwgdGhpcy5xdWVyeSA9PT0gbnVsbCkge1xuICAgIC8vIG51bGwgcXVlcnkgbWVhbnMgY3JlYXRlXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCdwYXNzd29yZCcgaW4gdGhpcy5kYXRhIHx8ICdlbWFpbCcgaW4gdGhpcy5kYXRhKSB7XG4gICAgY29uc3QgYWRkT3BzID0ge1xuICAgICAgX3BlcmlzaGFibGVfdG9rZW46IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICAgIF9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ6IHsgX19vcDogJ0RlbGV0ZScgfSxcbiAgICB9O1xuICAgIHRoaXMuZGF0YSA9IE9iamVjdC5hc3NpZ24odGhpcy5kYXRhLCBhZGRPcHMpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIE9ubHkgZm9yIF9TZXNzaW9uLCBhbmQgYXQgY3JlYXRpb24gdGltZVxuICBpZiAodGhpcy5jbGFzc05hbWUgIT0gJ19TZXNzaW9uJyB8fCB0aGlzLnF1ZXJ5KSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERlc3Ryb3kgdGhlIHNlc3Npb25zIGluICdCYWNrZ3JvdW5kJ1xuICBjb25zdCB7IHVzZXIsIGluc3RhbGxhdGlvbklkLCBzZXNzaW9uVG9rZW4gfSA9IHRoaXMuZGF0YTtcbiAgaWYgKCF1c2VyIHx8ICFpbnN0YWxsYXRpb25JZCkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAoIXVzZXIub2JqZWN0SWQpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5jb25maWcuZGF0YWJhc2UuZGVzdHJveShcbiAgICAnX1Nlc3Npb24nLFxuICAgIHtcbiAgICAgIHVzZXIsXG4gICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgIHNlc3Npb25Ub2tlbjogeyAkbmU6IHNlc3Npb25Ub2tlbiB9LFxuICAgIH0sXG4gICAge30sXG4gICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgKTtcbn07XG5cbi8vIEhhbmRsZXMgYW55IGZvbGxvd3VwIGxvZ2ljXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUZvbGxvd3VwID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddICYmIHRoaXMuY29uZmlnLnJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQpIHtcbiAgICB2YXIgc2Vzc2lvblF1ZXJ5ID0ge1xuICAgICAgdXNlcjoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2NsZWFyU2Vzc2lvbnMnXTtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5kZXN0cm95KCdfU2Vzc2lvbicsIHNlc3Npb25RdWVyeSlcbiAgICAgIC50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnZ2VuZXJhdGVOZXdTZXNzaW9uJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXTtcbiAgICByZXR1cm4gdGhpcy5jcmVhdGVTZXNzaW9uVG9rZW4oKS50aGVuKHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKSk7XG4gIH1cblxuICBpZiAodGhpcy5zdG9yYWdlICYmIHRoaXMuc3RvcmFnZVsnc2VuZFZlcmlmaWNhdGlvbkVtYWlsJ10pIHtcbiAgICBkZWxldGUgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXTtcbiAgICAvLyBGaXJlIGFuZCBmb3JnZXQhXG4gICAgdGhpcy5jb25maWcudXNlckNvbnRyb2xsZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHRoaXMuZGF0YSk7XG4gICAgcmV0dXJuIHRoaXMuaGFuZGxlRm9sbG93dXAuYmluZCh0aGlzKTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX1Nlc3Npb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBfU2Vzc2lvbiBvYmplY3QuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZVNlc3Npb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMuY2xhc3NOYW1lICE9PSAnX1Nlc3Npb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKCF0aGlzLmF1dGgudXNlciAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gcmVxdWlyZWQuJyk7XG4gIH1cblxuICAvLyBUT0RPOiBWZXJpZnkgcHJvcGVyIGVycm9yIHRvIHRocm93XG4gIGlmICh0aGlzLmRhdGEuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdDYW5ub3Qgc2V0ICcgKyAnQUNMIG9uIGEgU2Vzc2lvbi4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgdGhpcy5kYXRhLnVzZXIub2JqZWN0SWQgIT0gdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH1cbiAgfVxuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgY29uc3QgYWRkaXRpb25hbFNlc3Npb25EYXRhID0ge307XG4gICAgZm9yICh2YXIga2V5IGluIHRoaXMuZGF0YSkge1xuICAgICAgaWYgKGtleSA9PT0gJ29iamVjdElkJyB8fCBrZXkgPT09ICd1c2VyJykge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YVtrZXldID0gdGhpcy5kYXRhW2tleV07XG4gICAgfVxuXG4gICAgY29uc3QgeyBzZXNzaW9uRGF0YSwgY3JlYXRlU2Vzc2lvbiB9ID0gUmVzdFdyaXRlLmNyZWF0ZVNlc3Npb24odGhpcy5jb25maWcsIHtcbiAgICAgIHVzZXJJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICdjcmVhdGUnLFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSxcbiAgICB9KTtcblxuICAgIHJldHVybiBjcmVhdGVTZXNzaW9uKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICghcmVzdWx0cy5yZXNwb25zZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLCAnRXJyb3IgY3JlYXRpbmcgc2Vzc2lvbi4nKTtcbiAgICAgIH1cbiAgICAgIHNlc3Npb25EYXRhWydvYmplY3RJZCddID0gcmVzdWx0cy5yZXNwb25zZVsnb2JqZWN0SWQnXTtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgIHN0YXR1czogMjAxLFxuICAgICAgICBsb2NhdGlvbjogcmVzdWx0cy5sb2NhdGlvbixcbiAgICAgICAgcmVzcG9uc2U6IHNlc3Npb25EYXRhLFxuICAgICAgfTtcbiAgICB9KTtcbiAgfVxufTtcblxuLy8gSGFuZGxlcyB0aGUgX0luc3RhbGxhdGlvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIGluc3RhbGxhdGlvbiBvYmplY3QuXG4vLyBJZiBhbiBpbnN0YWxsYXRpb24gaXMgZm91bmQsIHRoaXMgY2FuIG11dGF0ZSB0aGlzLnF1ZXJ5IGFuZCB0dXJuIGEgY3JlYXRlXG4vLyBpbnRvIGFuIHVwZGF0ZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlSW5zdGFsbGF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSB8fCB0aGlzLmNsYXNzTmFtZSAhPT0gJ19JbnN0YWxsYXRpb24nKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKFxuICAgICF0aGlzLnF1ZXJ5ICYmXG4gICAgIXRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAhdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIDEzNSxcbiAgICAgICdhdCBsZWFzdCBvbmUgSUQgZmllbGQgKGRldmljZVRva2VuLCBpbnN0YWxsYXRpb25JZCkgJyArICdtdXN0IGJlIHNwZWNpZmllZCBpbiB0aGlzIG9wZXJhdGlvbidcbiAgICApO1xuICB9XG5cbiAgLy8gSWYgdGhlIGRldmljZSB0b2tlbiBpcyA2NCBjaGFyYWN0ZXJzIGxvbmcsIHdlIGFzc3VtZSBpdCBpcyBmb3IgaU9TXG4gIC8vIGFuZCBsb3dlcmNhc2UgaXQuXG4gIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgdGhpcy5kYXRhLmRldmljZVRva2VuLmxlbmd0aCA9PSA2NCkge1xuICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiA9IHRoaXMuZGF0YS5kZXZpY2VUb2tlbi50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gV2UgbG93ZXJjYXNlIHRoZSBpbnN0YWxsYXRpb25JZCBpZiBwcmVzZW50XG4gIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIGxldCBpbnN0YWxsYXRpb25JZCA9IHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZDtcblxuICAvLyBJZiBkYXRhLmluc3RhbGxhdGlvbklkIGlzIG5vdCBzZXQgYW5kIHdlJ3JlIG5vdCBtYXN0ZXIsIHdlIGNhbiBsb29rdXAgaW4gYXV0aFxuICBpZiAoIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICBpbnN0YWxsYXRpb25JZCA9IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIGluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQudG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFVwZGF0aW5nIF9JbnN0YWxsYXRpb24gYnV0IG5vdCB1cGRhdGluZyBhbnl0aGluZyBjcml0aWNhbFxuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVRva2VuICYmICFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG4gIHZhciBpZE1hdGNoOyAvLyBXaWxsIGJlIGEgbWF0Y2ggb24gZWl0aGVyIG9iamVjdElkIG9yIGluc3RhbGxhdGlvbklkXG4gIHZhciBvYmplY3RJZE1hdGNoO1xuICB2YXIgaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgdmFyIGRldmljZVRva2VuTWF0Y2hlcyA9IFtdO1xuXG4gIC8vIEluc3RlYWQgb2YgaXNzdWluZyAzIHJlYWRzLCBsZXQncyBkbyBpdCB3aXRoIG9uZSBPUi5cbiAgY29uc3Qgb3JRdWVyaWVzID0gW107XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBvYmplY3RJZDogdGhpcy5xdWVyeS5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBvclF1ZXJpZXMucHVzaCh7XG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG4gIH1cbiAgaWYgKHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgIG9yUXVlcmllcy5wdXNoKHsgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbiB9KTtcbiAgfVxuXG4gIGlmIChvclF1ZXJpZXMubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBwcm9taXNlID0gcHJvbWlzZVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKFxuICAgICAgICAnX0luc3RhbGxhdGlvbicsXG4gICAgICAgIHtcbiAgICAgICAgICAkb3I6IG9yUXVlcmllcyxcbiAgICAgICAgfSxcbiAgICAgICAge31cbiAgICAgICk7XG4gICAgfSlcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkICYmIHJlc3VsdC5vYmplY3RJZCA9PSB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgb2JqZWN0SWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0Lmluc3RhbGxhdGlvbklkID09IGluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWRNYXRjaCA9IHJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAocmVzdWx0LmRldmljZVRva2VuID09IHRoaXMuZGF0YS5kZXZpY2VUb2tlbikge1xuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5wdXNoKHJlc3VsdCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBTYW5pdHkgY2hlY2tzIHdoZW4gcnVubmluZyBhIHF1ZXJ5XG4gICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmICghb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELCAnT2JqZWN0IG5vdCBmb3VuZCBmb3IgdXBkYXRlLicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICE9PSBvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdpbnN0YWxsYXRpb25JZCBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVRva2VuICE9PSBvYmplY3RJZE1hdGNoLmRldmljZVRva2VuICYmXG4gICAgICAgICAgIXRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgICFvYmplY3RJZE1hdGNoLmluc3RhbGxhdGlvbklkXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUb2tlbiBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVHlwZVxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCAnZGV2aWNlVHlwZSBtYXkgbm90IGJlIGNoYW5nZWQgaW4gdGhpcyAnICsgJ29wZXJhdGlvbicpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgb2JqZWN0SWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gb2JqZWN0SWRNYXRjaDtcbiAgICAgIH1cblxuICAgICAgaWYgKGluc3RhbGxhdGlvbklkICYmIGluc3RhbGxhdGlvbklkTWF0Y2gpIHtcbiAgICAgICAgaWRNYXRjaCA9IGluc3RhbGxhdGlvbklkTWF0Y2g7XG4gICAgICB9XG4gICAgICAvLyBuZWVkIHRvIHNwZWNpZnkgZGV2aWNlVHlwZSBvbmx5IGlmIGl0J3MgbmV3XG4gICAgICBpZiAoIXRoaXMucXVlcnkgJiYgIXRoaXMuZGF0YS5kZXZpY2VUeXBlICYmICFpZE1hdGNoKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzUsICdkZXZpY2VUeXBlIG11c3QgYmUgc3BlY2lmaWVkIGluIHRoaXMgb3BlcmF0aW9uJyk7XG4gICAgICB9XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICBpZiAoIWlkTWF0Y2gpIHtcbiAgICAgICAgaWYgKCFkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJlxuICAgICAgICAgICghZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddIHx8ICFpbnN0YWxsYXRpb25JZClcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gU2luZ2xlIG1hdGNoIG9uIGRldmljZSB0b2tlbiBidXQgbm9uZSBvbiBpbnN0YWxsYXRpb25JZCwgYW5kIGVpdGhlclxuICAgICAgICAgIC8vIHRoZSBwYXNzZWQgb2JqZWN0IG9yIHRoZSBtYXRjaCBpcyBtaXNzaW5nIGFuIGluc3RhbGxhdGlvbklkLCBzbyB3ZVxuICAgICAgICAgIC8vIGNhbiBqdXN0IHJldHVybiB0aGUgbWF0Y2guXG4gICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgMTMyLFxuICAgICAgICAgICAgJ011c3Qgc3BlY2lmeSBpbnN0YWxsYXRpb25JZCB3aGVuIGRldmljZVRva2VuICcgK1xuICAgICAgICAgICAgICAnbWF0Y2hlcyBtdWx0aXBsZSBJbnN0YWxsYXRpb24gb2JqZWN0cydcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIE11bHRpcGxlIGRldmljZSB0b2tlbiBtYXRjaGVzIGFuZCB3ZSBzcGVjaWZpZWQgYW4gaW5zdGFsbGF0aW9uIElELFxuICAgICAgICAgIC8vIG9yIGEgc2luZ2xlIG1hdGNoIHdoZXJlIGJvdGggdGhlIHBhc3NlZCBhbmQgbWF0Y2hpbmcgb2JqZWN0cyBoYXZlXG4gICAgICAgICAgLy8gYW4gaW5zdGFsbGF0aW9uIElELiBUcnkgY2xlYW5pbmcgb3V0IG9sZCBpbnN0YWxsYXRpb25zIHRoYXQgbWF0Y2hcbiAgICAgICAgICAvLyB0aGUgZGV2aWNlVG9rZW4sIGFuZCByZXR1cm4gbmlsIHRvIHNpZ25hbCB0aGF0IGEgbmV3IG9iamVjdCBzaG91bGRcbiAgICAgICAgICAvLyBiZSBjcmVhdGVkLlxuICAgICAgICAgIHZhciBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgIGRldmljZVRva2VuOiB0aGlzLmRhdGEuZGV2aWNlVG9rZW4sXG4gICAgICAgICAgICBpbnN0YWxsYXRpb25JZDoge1xuICAgICAgICAgICAgICAkbmU6IGluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9O1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgZGVsUXVlcnlbJ2FwcElkZW50aWZpZXInXSA9IHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChkZXZpY2VUb2tlbk1hdGNoZXMubGVuZ3RoID09IDEgJiYgIWRldmljZVRva2VuTWF0Y2hlc1swXVsnaW5zdGFsbGF0aW9uSWQnXSkge1xuICAgICAgICAgIC8vIEV4YWN0bHkgb25lIGRldmljZSB0b2tlbiBtYXRjaCBhbmQgaXQgZG9lc24ndCBoYXZlIGFuIGluc3RhbGxhdGlvblxuICAgICAgICAgIC8vIElELiBUaGlzIGlzIHRoZSBvbmUgY2FzZSB3aGVyZSB3ZSB3YW50IHRvIG1lcmdlIHdpdGggdGhlIGV4aXN0aW5nXG4gICAgICAgICAgLy8gb2JqZWN0LlxuICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0geyBvYmplY3RJZDogaWRNYXRjaC5vYmplY3RJZCB9O1xuICAgICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgICAgLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIGRldmljZVRva2VuTWF0Y2hlc1swXVsnb2JqZWN0SWQnXTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZFxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIGlkTWF0Y2guZGV2aWNlVG9rZW4gIT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgICAvLyBXZSdyZSBzZXR0aW5nIHRoZSBkZXZpY2UgdG9rZW4gb24gYW4gZXhpc3RpbmcgaW5zdGFsbGF0aW9uLCBzb1xuICAgICAgICAgICAgLy8gd2Ugc2hvdWxkIHRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaCB0aGlzXG4gICAgICAgICAgICAvLyBkZXZpY2UgdG9rZW4uXG4gICAgICAgICAgICBjb25zdCBkZWxRdWVyeSA9IHtcbiAgICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICAvLyBXZSBoYXZlIGEgdW5pcXVlIGluc3RhbGwgSWQsIHVzZSB0aGF0IHRvIHByZXNlcnZlXG4gICAgICAgICAgICAvLyB0aGUgaW50ZXJlc3RpbmcgaW5zdGFsbGF0aW9uXG4gICAgICAgICAgICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydpbnN0YWxsYXRpb25JZCddID0ge1xuICAgICAgICAgICAgICAgICRuZTogdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICB0aGlzLmRhdGEub2JqZWN0SWQgJiZcbiAgICAgICAgICAgICAgaWRNYXRjaC5vYmplY3RJZCA9PSB0aGlzLmRhdGEub2JqZWN0SWRcbiAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAvLyB3ZSBwYXNzZWQgYW4gb2JqZWN0SWQsIHByZXNlcnZlIHRoYXQgaW5zdGFsYXRpb25cbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ29iamVjdElkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiBpZE1hdGNoLm9iamVjdElkLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgLy8gV2hhdCB0byBkbyBoZXJlPyBjYW4ndCByZWFsbHkgY2xlYW4gdXAgZXZlcnl0aGluZy4uLlxuICAgICAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuYXBwSWRlbnRpZmllcikge1xuICAgICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KCdfSW5zdGFsbGF0aW9uJywgZGVsUXVlcnkpLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgICAgLy8gbm8gZGVsZXRpb25zIHdlcmUgbWFkZS4gQ2FuIGJlIGlnbm9yZWQuXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBJbiBub24tbWVyZ2Ugc2NlbmFyaW9zLCBqdXN0IHJldHVybiB0aGUgaW5zdGFsbGF0aW9uIG1hdGNoIGlkXG4gICAgICAgICAgcmV0dXJuIGlkTWF0Y2gub2JqZWN0SWQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKG9iaklkID0+IHtcbiAgICAgIGlmIChvYmpJZCkge1xuICAgICAgICB0aGlzLnF1ZXJ5ID0geyBvYmplY3RJZDogb2JqSWQgfTtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5jcmVhdGVkQXQ7XG4gICAgICB9XG4gICAgICAvLyBUT0RPOiBWYWxpZGF0ZSBvcHMgKGFkZC9yZW1vdmUgb24gY2hhbm5lbHMsICRpbmMgb24gYmFkZ2UsIGV0Yy4pXG4gICAgfSk7XG4gIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gSWYgd2Ugc2hvcnQtY2lyY3VpdGVkIHRoZSBvYmplY3QgcmVzcG9uc2UgLSB0aGVuIHdlIG5lZWQgdG8gbWFrZSBzdXJlIHdlIGV4cGFuZCBhbGwgdGhlIGZpbGVzLFxuLy8gc2luY2UgdGhpcyBtaWdodCBub3QgaGF2ZSBhIHF1ZXJ5LCBtZWFuaW5nIGl0IHdvbid0IHJldHVybiB0aGUgZnVsbCByZXN1bHQgYmFjay5cbi8vIFRPRE86IChubHV0c2Vua28pIFRoaXMgc2hvdWxkIGRpZSB3aGVuIHdlIG1vdmUgdG8gcGVyLWNsYXNzIGJhc2VkIGNvbnRyb2xsZXJzIG9uIF9TZXNzaW9uL19Vc2VyXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICAvLyBDaGVjayB3aGV0aGVyIHdlIGhhdmUgYSBzaG9ydC1jaXJjdWl0ZWQgcmVzcG9uc2UgLSBvbmx5IHRoZW4gcnVuIGV4cGFuc2lvbi5cbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSkge1xuICAgIHRoaXMuY29uZmlnLmZpbGVzQ29udHJvbGxlci5leHBhbmRGaWxlc0luT2JqZWN0KHRoaXMuY29uZmlnLCB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKTtcbiAgfVxufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5EYXRhYmFzZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUm9sZScpIHtcbiAgICB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXIucm9sZS5jbGVhcigpO1xuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5TRVNTSU9OX01JU1NJTkcsXG4gICAgICBgQ2Fubm90IG1vZGlmeSB1c2VyICR7dGhpcy5xdWVyeS5vYmplY3RJZH0uYFxuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUHJvZHVjdCcgJiYgdGhpcy5kYXRhLmRvd25sb2FkKSB7XG4gICAgdGhpcy5kYXRhLmRvd25sb2FkTmFtZSA9IHRoaXMuZGF0YS5kb3dubG9hZC5uYW1lO1xuICB9XG5cbiAgLy8gVE9ETzogQWRkIGJldHRlciBkZXRlY3Rpb24gZm9yIEFDTCwgZW5zdXJpbmcgYSB1c2VyIGNhbid0IGJlIGxvY2tlZCBmcm9tXG4gIC8vICAgICAgIHRoZWlyIG93biB1c2VyIHJlY29yZC5cbiAgaWYgKHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5kYXRhLkFDTFsnKnVucmVzb2x2ZWQnXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0FDTCwgJ0ludmFsaWQgQUNMLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAvLyBGb3JjZSB0aGUgdXNlciB0byBub3QgbG9ja291dFxuICAgIC8vIE1hdGNoZWQgd2l0aCBwYXJzZS5jb21cbiAgICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiYgdGhpcy5kYXRhLkFDTCAmJiB0aGlzLmF1dGguaXNNYXN0ZXIgIT09IHRydWUpIHtcbiAgICAgIHRoaXMuZGF0YS5BQ0xbdGhpcy5xdWVyeS5vYmplY3RJZF0gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH07XG4gICAgfVxuICAgIC8vIHVwZGF0ZSBwYXNzd29yZCB0aW1lc3RhbXAgaWYgdXNlciBwYXNzd29yZCBpcyBiZWluZyBjaGFuZ2VkXG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2VcbiAgICApIHtcbiAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgfVxuICAgIC8vIElnbm9yZSBjcmVhdGVkQXQgd2hlbiB1cGRhdGVcbiAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgIGxldCBkZWZlciA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIC8vIGlmIHBhc3N3b3JkIGhpc3RvcnkgaXMgZW5hYmxlZCB0aGVuIHNhdmUgdGhlIGN1cnJlbnQgcGFzc3dvcmQgdG8gaGlzdG9yeVxuICAgIGlmIChcbiAgICAgIHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmXG4gICAgICB0aGlzLmRhdGEuX2hhc2hlZF9wYXNzd29yZCAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICkge1xuICAgICAgZGVmZXIgPSB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAuZmluZChcbiAgICAgICAgICAnX1VzZXInLFxuICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9LFxuICAgICAgICAgIHsga2V5czogWydfcGFzc3dvcmRfaGlzdG9yeScsICdfaGFzaGVkX3Bhc3N3b3JkJ10gfVxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICAgIGxldCBvbGRQYXNzd29yZHMgPSBbXTtcbiAgICAgICAgICBpZiAodXNlci5fcGFzc3dvcmRfaGlzdG9yeSkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzID0gXy50YWtlKFxuICAgICAgICAgICAgICB1c2VyLl9wYXNzd29yZF9oaXN0b3J5LFxuICAgICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnlcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vbi0xIHBhc3N3b3JkcyBnbyBpbnRvIGhpc3RvcnkgaW5jbHVkaW5nIGxhc3QgcGFzc3dvcmRcbiAgICAgICAgICB3aGlsZSAoXG4gICAgICAgICAgICBvbGRQYXNzd29yZHMubGVuZ3RoID4gTWF0aC5tYXgoMCwgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5IC0gMilcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5zaGlmdCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvbGRQYXNzd29yZHMucHVzaCh1c2VyLnBhc3N3b3JkKTtcbiAgICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2hpc3RvcnkgPSBvbGRQYXNzd29yZHM7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHJldHVybiBkZWZlci50aGVuKCgpID0+IHtcbiAgICAgIC8vIFJ1biBhbiB1cGRhdGVcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAudXBkYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAgdGhpcy5kYXRhLFxuICAgICAgICAgIHRoaXMucnVuT3B0aW9ucyxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICBmYWxzZSxcbiAgICAgICAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICAgICAgICApXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICByZXNwb25zZS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcbiAgICAgICAgICB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKHJlc3BvbnNlLCB0aGlzLmRhdGEpO1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3BvbnNlIH07XG4gICAgICAgIH0pO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFNldCB0aGUgZGVmYXVsdCBBQ0wgYW5kIHBhc3N3b3JkIHRpbWVzdGFtcCBmb3IgdGhlIG5ldyBfVXNlclxuICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgdmFyIEFDTCA9IHRoaXMuZGF0YS5BQ0w7XG4gICAgICAvLyBkZWZhdWx0IHB1YmxpYyByL3cgQUNMXG4gICAgICBpZiAoIUFDTCkge1xuICAgICAgICBBQ0wgPSB7fTtcbiAgICAgICAgaWYgKCF0aGlzLmNvbmZpZy5lbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgICAgICAgQUNMWycqJ10gPSB7IHJlYWQ6IHRydWUsIHdyaXRlOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBtYWtlIHN1cmUgdGhlIHVzZXIgaXMgbm90IGxvY2tlZCBkb3duXG4gICAgICBBQ0xbdGhpcy5kYXRhLm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICAgIHRoaXMuZGF0YS5BQ0wgPSBBQ0w7XG4gICAgICAvLyBwYXNzd29yZCB0aW1lc3RhbXAgdG8gYmUgdXNlZCB3aGVuIHBhc3N3b3JkIGV4cGlyeSBwb2xpY3kgaXMgZW5mb3JjZWRcbiAgICAgIGlmICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSkge1xuICAgICAgICB0aGlzLmRhdGEuX3Bhc3N3b3JkX2NoYW5nZWRfYXQgPSBQYXJzZS5fZW5jb2RlKG5ldyBEYXRlKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFJ1biBhIGNyZWF0ZVxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmNyZWF0ZSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5kYXRhLCB0aGlzLnJ1bk9wdGlvbnMsIGZhbHNlLCB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlcilcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFF1aWNrIGNoZWNrLCBpZiB3ZSB3ZXJlIGFibGUgdG8gaW5mZXIgdGhlIGR1cGxpY2F0ZWQgZmllbGQgbmFtZVxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ3VzZXJuYW1lJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLlVTRVJOQU1FX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IudXNlckluZm8gJiYgZXJyb3IudXNlckluZm8uZHVwbGljYXRlZF9maWVsZCA9PT0gJ2VtYWlsJykge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgZW1haWwgYWRkcmVzcy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHRoaXMgd2FzIGEgZmFpbGVkIHVzZXIgY3JlYXRpb24gZHVlIHRvIHVzZXJuYW1lIG9yIGVtYWlsIGFscmVhZHkgdGFrZW4sIHdlIG5lZWQgdG9cbiAgICAgICAgLy8gY2hlY2sgd2hldGhlciBpdCB3YXMgdXNlcm5hbWUgb3IgZW1haWwgYW5kIHJldHVybiB0aGUgYXBwcm9wcmlhdGUgZXJyb3IuXG4gICAgICAgIC8vIEZhbGxiYWNrIHRvIHRoZSBvcmlnaW5hbCBtZXRob2RcbiAgICAgICAgLy8gVE9ETzogU2VlIGlmIHdlIGNhbiBsYXRlciBkbyB0aGlzIHdpdGhvdXQgYWRkaXRpb25hbCBxdWVyaWVzIGJ5IHVzaW5nIG5hbWVkIGluZGV4ZXMuXG4gICAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgICAgIC5maW5kKFxuICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHVzZXJuYW1lOiB0aGlzLmRhdGEudXNlcm5hbWUsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAgICAgJ0FjY291bnQgYWxyZWFkeSBleGlzdHMgZm9yIHRoaXMgdXNlcm5hbWUuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgICAgICB7IGVtYWlsOiB0aGlzLmRhdGEuZW1haWwsIG9iamVjdElkOiB7ICRuZTogdGhpcy5vYmplY3RJZCgpIH0gfSxcbiAgICAgICAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgICAnQSBkdXBsaWNhdGUgdmFsdWUgZm9yIGEgZmllbGQgd2l0aCB1bmlxdWUgdmFsdWVzIHdhcyBwcm92aWRlZCdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICByZXNwb25zZS5vYmplY3RJZCA9IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgcmVzcG9uc2UuY3JlYXRlZEF0ID0gdGhpcy5kYXRhLmNyZWF0ZWRBdDtcblxuICAgICAgICBpZiAodGhpcy5yZXNwb25zZVNob3VsZEhhdmVVc2VybmFtZSkge1xuICAgICAgICAgIHJlc3BvbnNlLnVzZXJuYW1lID0gdGhpcy5kYXRhLnVzZXJuYW1lO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgIHRoaXMucmVzcG9uc2UgPSB7XG4gICAgICAgICAgc3RhdHVzOiAyMDEsXG4gICAgICAgICAgcmVzcG9uc2UsXG4gICAgICAgICAgbG9jYXRpb246IHRoaXMubG9jYXRpb24oKSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG59O1xuXG4vLyBSZXR1cm5zIG5vdGhpbmcgLSBkb2Vzbid0IHdhaXQgZm9yIHRoZSB0cmlnZ2VyLlxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5BZnRlclNhdmVUcmlnZ2VyID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMucmVzcG9uc2UgfHwgIXRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlclNhdmUnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyU2F2ZUhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGNvbnN0IGhhc0xpdmVRdWVyeSA9IHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuaGFzTGl2ZVF1ZXJ5KHRoaXMuY2xhc3NOYW1lKTtcbiAgaWYgKCFoYXNBZnRlclNhdmVIb29rICYmICFoYXNMaXZlUXVlcnkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB2YXIgZXh0cmFEYXRhID0geyBjbGFzc05hbWU6IHRoaXMuY2xhc3NOYW1lIH07XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBleHRyYURhdGEub2JqZWN0SWQgPSB0aGlzLnF1ZXJ5Lm9iamVjdElkO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIG9yaWdpbmFsIG9iamVjdCwgd2Ugb25seSBkbyB0aGlzIGZvciBhIHVwZGF0ZSB3cml0ZS5cbiAgbGV0IG9yaWdpbmFsT2JqZWN0O1xuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgb3JpZ2luYWxPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICB9XG5cbiAgLy8gQnVpbGQgdGhlIGluZmxhdGVkIG9iamVjdCwgZGlmZmVyZW50IGZyb20gYmVmb3JlU2F2ZSwgb3JpZ2luYWxEYXRhIGlzIG5vdCBlbXB0eVxuICAvLyBzaW5jZSBkZXZlbG9wZXJzIGNhbiBjaGFuZ2UgZGF0YSBpbiB0aGUgYmVmb3JlU2F2ZS5cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRoaXMuYnVpbGRVcGRhdGVkT2JqZWN0KGV4dHJhRGF0YSk7XG4gIHVwZGF0ZWRPYmplY3QuX2hhbmRsZVNhdmVSZXNwb25zZSh0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLCB0aGlzLnJlc3BvbnNlLnN0YXR1cyB8fCAyMDApO1xuXG4gIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgIC8vIE5vdGlmaXkgTGl2ZVF1ZXJ5U2VydmVyIGlmIHBvc3NpYmxlXG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5vbkFmdGVyU2F2ZShcbiAgICAgIHVwZGF0ZWRPYmplY3QuY2xhc3NOYW1lLFxuICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgIG9yaWdpbmFsT2JqZWN0LFxuICAgICAgcGVybXNcbiAgICApO1xuICB9KTtcblxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBpZiAocmVzdWx0ICYmIHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSByZXN1bHQ7XG4gICAgICB9XG4gICAgfSlcbiAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWlkZGxlID0gdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgPyAnL3VzZXJzLycgOiAnL2NsYXNzZXMvJyArIHRoaXMuY2xhc3NOYW1lICsgJy8nO1xuICBjb25zdCBtb3VudCA9IHRoaXMuY29uZmlnLm1vdW50IHx8IHRoaXMuY29uZmlnLnNlcnZlclVSTDtcbiAgcmV0dXJuIG1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBkYXRhID0gT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoKGRhdGEsIGtleSkgPT4ge1xuICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICBpZiAoIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG4gIHJldHVybiBQYXJzZS5fZGVjb2RlKHVuZGVmaW5lZCwgZGF0YSk7XG59O1xuXG4vLyBSZXR1cm5zIGFuIHVwZGF0ZWQgY29weSBvZiB0aGUgb2JqZWN0XG5SZXN0V3JpdGUucHJvdG90eXBlLmJ1aWxkVXBkYXRlZE9iamVjdCA9IGZ1bmN0aW9uIChleHRyYURhdGEpIHtcbiAgY29uc3QgY2xhc3NOYW1lID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKGV4dHJhRGF0YSk7XG4gIGNvbnN0IHJlYWRPbmx5QXR0cmlidXRlcyA9IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXNcbiAgICA/IGNsYXNzTmFtZS5jb25zdHJ1Y3Rvci5yZWFkT25seUF0dHJpYnV0ZXMoKVxuICAgIDogW107XG4gIGlmICghdGhpcy5vcmlnaW5hbERhdGEpIHtcbiAgICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICAgIGV4dHJhRGF0YVthdHRyaWJ1dGVdID0gdGhpcy5kYXRhW2F0dHJpYnV0ZV07XG4gICAgfVxuICB9XG4gIGNvbnN0IHVwZGF0ZWRPYmplY3QgPSB0cmlnZ2Vycy5pbmZsYXRlKGV4dHJhRGF0YSwgdGhpcy5vcmlnaW5hbERhdGEpO1xuICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLnJlZHVjZShmdW5jdGlvbiAoZGF0YSwga2V5KSB7XG4gICAgaWYgKGtleS5pbmRleE9mKCcuJykgPiAwKSB7XG4gICAgICBpZiAodHlwZW9mIGRhdGFba2V5XS5fX29wID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXJlYWRPbmx5QXR0cmlidXRlcy5pbmNsdWRlcyhrZXkpKSB7XG4gICAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQoa2V5LCBkYXRhW2tleV0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBzdWJkb2N1bWVudCBrZXkgd2l0aCBkb3Qgbm90YXRpb24geyAneC55JzogdiB9ID0+IHsgJ3gnOiB7ICd5JyA6IHYgfSB9KVxuICAgICAgICBjb25zdCBzcGxpdHRlZEtleSA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgICBjb25zdCBwYXJlbnRQcm9wID0gc3BsaXR0ZWRLZXlbMF07XG4gICAgICAgIGxldCBwYXJlbnRWYWwgPSB1cGRhdGVkT2JqZWN0LmdldChwYXJlbnRQcm9wKTtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXJlbnRWYWwgIT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgcGFyZW50VmFsID0ge307XG4gICAgICAgIH1cbiAgICAgICAgcGFyZW50VmFsW3NwbGl0dGVkS2V5WzFdXSA9IGRhdGFba2V5XTtcbiAgICAgICAgdXBkYXRlZE9iamVjdC5zZXQocGFyZW50UHJvcCwgcGFyZW50VmFsKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBkYXRhW2tleV07XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9LCBkZWVwY29weSh0aGlzLmRhdGEpKTtcblxuICBjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLnNhbml0aXplZERhdGEoKTtcbiAgZm9yIChjb25zdCBhdHRyaWJ1dGUgb2YgcmVhZE9ubHlBdHRyaWJ1dGVzKSB7XG4gICAgZGVsZXRlIHNhbml0aXplZFthdHRyaWJ1dGVdO1xuICB9XG4gIHVwZGF0ZWRPYmplY3Quc2V0KHNhbml0aXplZCk7XG4gIHJldHVybiB1cGRhdGVkT2JqZWN0O1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jbGVhblVzZXJBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgJiYgdGhpcy5yZXNwb25zZS5yZXNwb25zZSAmJiB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IHVzZXIgPSB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlO1xuICAgIGlmICh1c2VyLmF1dGhEYXRhKSB7XG4gICAgICBPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAgICAgaWYgKHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIGlmIChPYmplY3Qua2V5cyh1c2VyLmF1dGhEYXRhKS5sZW5ndGggPT0gMCkge1xuICAgICAgICBkZWxldGUgdXNlci5hdXRoRGF0YTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEgPSBmdW5jdGlvbiAocmVzcG9uc2UsIGRhdGEpIHtcbiAgaWYgKF8uaXNFbXB0eSh0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlcikpIHtcbiAgICByZXR1cm4gcmVzcG9uc2U7XG4gIH1cbiAgY29uc3QgY2xpZW50U3VwcG9ydHNEZWxldGUgPSBDbGllbnRTREsuc3VwcG9ydHNGb3J3YXJkRGVsZXRlKHRoaXMuY2xpZW50U0RLKTtcbiAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgIGNvbnN0IGRhdGFWYWx1ZSA9IGRhdGFbZmllbGROYW1lXTtcblxuICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHJlc3BvbnNlLCBmaWVsZE5hbWUpKSB7XG4gICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgIH1cblxuICAgIC8vIFN0cmlwcyBvcGVyYXRpb25zIGZyb20gcmVzcG9uc2VzXG4gICAgaWYgKHJlc3BvbnNlW2ZpZWxkTmFtZV0gJiYgcmVzcG9uc2VbZmllbGROYW1lXS5fX29wKSB7XG4gICAgICBkZWxldGUgcmVzcG9uc2VbZmllbGROYW1lXTtcbiAgICAgIGlmIChjbGllbnRTdXBwb3J0c0RlbGV0ZSAmJiBkYXRhVmFsdWUuX19vcCA9PSAnRGVsZXRlJykge1xuICAgICAgICByZXNwb25zZVtmaWVsZE5hbWVdID0gZGF0YVZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIHJldHVybiByZXNwb25zZTtcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFJlc3RXcml0ZTtcbm1vZHVsZS5leHBvcnRzID0gUmVzdFdyaXRlO1xuIl19