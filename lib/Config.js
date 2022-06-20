"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;

var _cache = _interopRequireDefault(require("./cache"));

var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));

var _net = _interopRequireDefault(require("net"));

var _Definitions = require("./Options/Definitions");

var _lodash = require("lodash");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.
function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }

  if (str.endsWith('/')) {
    str = str.substr(0, str.length - 1);
  }

  return str;
}

class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);

    if (!cacheInfo) {
      return;
    }

    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, config);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    return config;
  }

  static put(serverConfiguration) {
    Config.validate(serverConfiguration);

    _cache.default.put(serverConfiguration.appId, serverConfiguration);

    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }

  static validate({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    maxLimit,
    emailVerifyTokenValidityDuration,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    emailVerifyTokenReuseIfValid,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }

    const emailAdapter = userController.adapter;

    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }

    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);

    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }

    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }

    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateMasterKeyIps(masterKeyIps);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
  }

  static validateRequestKeywordDenylist(requestKeywordDenylist) {
    if (requestKeywordDenylist === undefined) {
      requestKeywordDenylist = requestKeywordDenylist.default;
    } else if (!Array.isArray(requestKeywordDenylist)) {
      throw 'Parse Server option requestKeywordDenylist must be an array.';
    }
  }

  static validateEnforcePrivateUsers(enforcePrivateUsers) {
    if (typeof enforcePrivateUsers !== 'boolean') {
      throw 'Parse Server option enforcePrivateUsers must be a boolean.';
    }
  }

  static validateSecurityOptions(security) {
    if (Object.prototype.toString.call(security) !== '[object Object]') {
      throw 'Parse Server option security must be an object.';
    }

    if (security.enableCheck === undefined) {
      security.enableCheck = _Definitions.SecurityOptions.enableCheck.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheck)) {
      throw 'Parse Server option security.enableCheck must be a boolean.';
    }

    if (security.enableCheckLog === undefined) {
      security.enableCheckLog = _Definitions.SecurityOptions.enableCheckLog.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheckLog)) {
      throw 'Parse Server option security.enableCheckLog must be a boolean.';
    }
  }

  static validateSchemaOptions(schema) {
    if (!schema) return;

    if (Object.prototype.toString.call(schema) !== '[object Object]') {
      throw 'Parse Server option schema must be an object.';
    }

    if (schema.definitions === undefined) {
      schema.definitions = _Definitions.SchemaOptions.definitions.default;
    } else if (!Array.isArray(schema.definitions)) {
      throw 'Parse Server option schema.definitions must be an array.';
    }

    if (schema.strict === undefined) {
      schema.strict = _Definitions.SchemaOptions.strict.default;
    } else if (!(0, _lodash.isBoolean)(schema.strict)) {
      throw 'Parse Server option schema.strict must be a boolean.';
    }

    if (schema.deleteExtraFields === undefined) {
      schema.deleteExtraFields = _Definitions.SchemaOptions.deleteExtraFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.deleteExtraFields)) {
      throw 'Parse Server option schema.deleteExtraFields must be a boolean.';
    }

    if (schema.recreateModifiedFields === undefined) {
      schema.recreateModifiedFields = _Definitions.SchemaOptions.recreateModifiedFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.recreateModifiedFields)) {
      throw 'Parse Server option schema.recreateModifiedFields must be a boolean.';
    }

    if (schema.lockSchemas === undefined) {
      schema.lockSchemas = _Definitions.SchemaOptions.lockSchemas.default;
    } else if (!(0, _lodash.isBoolean)(schema.lockSchemas)) {
      throw 'Parse Server option schema.lockSchemas must be a boolean.';
    }

    if (schema.beforeMigration === undefined) {
      schema.beforeMigration = null;
    } else if (schema.beforeMigration !== null && typeof schema.beforeMigration !== 'function') {
      throw 'Parse Server option schema.beforeMigration must be a function.';
    }

    if (schema.afterMigration === undefined) {
      schema.afterMigration = null;
    } else if (schema.afterMigration !== null && typeof schema.afterMigration !== 'function') {
      throw 'Parse Server option schema.afterMigration must be a function.';
    }
  }

  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }

    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }

    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }

    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }

    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }

    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }

    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }

    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }

    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }

    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }

    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }

  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }

    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }

    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }

  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }

      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }

      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }

  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }

      if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }

      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }

      if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }

      if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }

      if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }

      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }

      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
    }
  } // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern


  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }

  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }

    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }

    if (typeof publicServerURL !== 'string') {
      throw 'A public server url is required for e-mail verification and password resets.';
    }

    if (emailVerifyTokenValidityDuration) {
      if (isNaN(emailVerifyTokenValidityDuration)) {
        throw 'Email verify token validity duration must be a valid number.';
      } else if (emailVerifyTokenValidityDuration <= 0) {
        throw 'Email verify token validity duration must be a value greater than 0.';
      }
    }

    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }

    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }

  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }

      throw e;
    }

    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }

    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }

    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
  }

  static validateMasterKeyIps(masterKeyIps) {
    for (const ip of masterKeyIps) {
      if (!_net.default.isIP(ip)) {
        throw `Invalid ip in masterKeyIps: ${ip}`;
      }
    }
  }

  get mount() {
    var mount = this._mount;

    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }

    return mount;
  }

  set mount(newValue) {
    this._mount = newValue;
  }

  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }

  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }

  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }

  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }

  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }

    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }

  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }

    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }

  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }

  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }

  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }

  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }

  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }

  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }

  get requestResetPasswordURL() {
    return this.customPages.resetPasswordLink || `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }

  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }

  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }

  get verifyEmailURL() {
    return this.customPages.verifyEmailLink || `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  } // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.


  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }

}

exports.Config = Config;
var _default = Config;
exports.default = _default;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJyZW1vdmVUcmFpbGluZ1NsYXNoIiwic3RyIiwiZW5kc1dpdGgiLCJzdWJzdHIiLCJsZW5ndGgiLCJDb25maWciLCJnZXQiLCJhcHBsaWNhdGlvbklkIiwibW91bnQiLCJjYWNoZUluZm8iLCJBcHBDYWNoZSIsImNvbmZpZyIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwia2V5IiwiZGF0YWJhc2UiLCJEYXRhYmFzZUNvbnRyb2xsZXIiLCJkYXRhYmFzZUNvbnRyb2xsZXIiLCJhZGFwdGVyIiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYmluZCIsImdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZSIsImFwcElkIiwic2V0dXBQYXNzd29yZFZhbGlkYXRvciIsInBhc3N3b3JkUG9saWN5IiwidmVyaWZ5VXNlckVtYWlscyIsInVzZXJDb250cm9sbGVyIiwiYXBwTmFtZSIsInB1YmxpY1NlcnZlclVSTCIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJleHBpcmVJbmFjdGl2ZVNlc3Npb25zIiwic2Vzc2lvbkxlbmd0aCIsIm1heExpbWl0IiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJhY2NvdW50TG9ja291dCIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleSIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImZpbGVVcGxvYWQiLCJwYWdlcyIsInNlY3VyaXR5IiwiZW5mb3JjZVByaXZhdGVVc2VycyIsInNjaGVtYSIsInJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJFcnJvciIsImVtYWlsQWRhcHRlciIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwidmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeSIsInZhbGlkYXRlUGFzc3dvcmRQb2xpY3kiLCJ2YWxpZGF0ZUZpbGVVcGxvYWRPcHRpb25zIiwic3RhcnRzV2l0aCIsInZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU1hc3RlcktleUlwcyIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInVuZGVmaW5lZCIsImRlZmF1bHQiLCJBcnJheSIsImlzQXJyYXkiLCJwcm90b3R5cGUiLCJ0b1N0cmluZyIsImNhbGwiLCJlbmFibGVDaGVjayIsIlNlY3VyaXR5T3B0aW9ucyIsImlzQm9vbGVhbiIsImVuYWJsZUNoZWNrTG9nIiwiZGVmaW5pdGlvbnMiLCJTY2hlbWFPcHRpb25zIiwic3RyaWN0IiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwibG9ja1NjaGVtYXMiLCJiZWZvcmVNaWdyYXRpb24iLCJhZnRlck1pZ3JhdGlvbiIsImVuYWJsZVJvdXRlciIsIlBhZ2VzT3B0aW9ucyIsImVuYWJsZUxvY2FsaXphdGlvbiIsImxvY2FsaXphdGlvbkpzb25QYXRoIiwiaXNTdHJpbmciLCJsb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSIsInBsYWNlaG9sZGVycyIsImZvcmNlUmVkaXJlY3QiLCJwYWdlc1BhdGgiLCJwYWdlc0VuZHBvaW50IiwiY3VzdG9tVXJscyIsImN1c3RvbVJvdXRlcyIsInR0bCIsIklkZW1wb3RlbmN5T3B0aW9ucyIsImlzTmFOIiwicGF0aHMiLCJkdXJhdGlvbiIsIk51bWJlciIsImlzSW50ZWdlciIsInRocmVzaG9sZCIsInVubG9ja09uUGFzc3dvcmRSZXNldCIsIkFjY291bnRMb2Nrb3V0T3B0aW9ucyIsIm1heFBhc3N3b3JkQWdlIiwicmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJ2YWxpZGF0b3JQYXR0ZXJuIiwiUmVnRXhwIiwidmFsaWRhdG9yQ2FsbGJhY2siLCJkb05vdEFsbG93VXNlcm5hbWUiLCJtYXhQYXNzd29yZEhpc3RvcnkiLCJyZXNldFRva2VuUmV1c2VJZlZhbGlkIiwicGF0dGVyblZhbGlkYXRvciIsInZhbHVlIiwidGVzdCIsImUiLCJSZWZlcmVuY2VFcnJvciIsImVuYWJsZUZvckFub255bW91c1VzZXIiLCJGaWxlVXBsb2FkT3B0aW9ucyIsImVuYWJsZUZvclB1YmxpYyIsImVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIiwiaXAiLCJuZXQiLCJpc0lQIiwiX21vdW50IiwibmV3VmFsdWUiLCJpbmNsdWRlcyIsImhlYWRlciIsInRyaW0iLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsImdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0IiwiaW52YWxpZExpbmtVUkwiLCJjdXN0b21QYWdlcyIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInJlc2V0UGFzc3dvcmRMaW5rIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwiLCJwYXNzd29yZFJlc2V0U3VjY2VzcyIsInBhcnNlRnJhbWVVUkwiLCJ2ZXJpZnlFbWFpbFVSTCIsInZlcmlmeUVtYWlsTGluayIsIm1vZHVsZSIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi9zcmMvQ29uZmlnLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IEFwcENhY2hlIGZyb20gJy4vY2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0NvbnRyb2xsZXJzL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQge1xuICBJZGVtcG90ZW5jeU9wdGlvbnMsXG4gIEZpbGVVcGxvYWRPcHRpb25zLFxuICBBY2NvdW50TG9ja291dE9wdGlvbnMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgU2VjdXJpdHlPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL09wdGlvbnMvRGVmaW5pdGlvbnMnO1xuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIsIGNvbmZpZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbmZpZy5tb3VudCA9IHJlbW92ZVRyYWlsaW5nU2xhc2gobW91bnQpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0LmJpbmQoY29uZmlnKTtcbiAgICBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdC5iaW5kKFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICByZXR1cm4gY29uZmlnO1xuICB9XG5cbiAgc3RhdGljIHB1dChzZXJ2ZXJDb25maWd1cmF0aW9uKSB7XG4gICAgQ29uZmlnLnZhbGlkYXRlKHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIEFwcENhY2hlLnB1dChzZXJ2ZXJDb25maWd1cmF0aW9uLmFwcElkLCBzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBDb25maWcuc2V0dXBQYXNzd29yZFZhbGlkYXRvcihzZXJ2ZXJDb25maWd1cmF0aW9uLnBhc3N3b3JkUG9saWN5KTtcbiAgICByZXR1cm4gc2VydmVyQ29uZmlndXJhdGlvbjtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZSh7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgICB1c2VyQ29udHJvbGxlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICByZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0LFxuICAgIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMsXG4gICAgc2Vzc2lvbkxlbmd0aCxcbiAgICBtYXhMaW1pdCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICBmaWxlVXBsb2FkLFxuICAgIHBhZ2VzLFxuICAgIHNlY3VyaXR5LFxuICAgIGVuZm9yY2VQcml2YXRlVXNlcnMsXG4gICAgc2NoZW1hLFxuICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QsXG4gIH0pIHtcbiAgICBpZiAobWFzdGVyS2V5ID09PSByZWFkT25seU1hc3RlcktleSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdtYXN0ZXJLZXkgYW5kIHJlYWRPbmx5TWFzdGVyS2V5IHNob3VsZCBiZSBkaWZmZXJlbnQnKTtcbiAgICB9XG5cbiAgICBjb25zdCBlbWFpbEFkYXB0ZXIgPSB1c2VyQ29udHJvbGxlci5hZGFwdGVyO1xuICAgIGlmICh2ZXJpZnlVc2VyRW1haWxzKSB7XG4gICAgICB0aGlzLnZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICAgICAgZW1haWxBZGFwdGVyLFxuICAgICAgICBhcHBOYW1lLFxuICAgICAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgICAgIGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy52YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KTtcbiAgICB0aGlzLnZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpO1xuICAgIHRoaXMudmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKTtcblxuICAgIGlmICh0eXBlb2YgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAncmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuXG4gICAgaWYgKHB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgaWYgKCFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cDovLycpICYmICFwdWJsaWNTZXJ2ZXJVUkwuc3RhcnRzV2l0aCgnaHR0cHM6Ly8nKSkge1xuICAgICAgICB0aHJvdyAncHVibGljU2VydmVyVVJMIHNob3VsZCBiZSBhIHZhbGlkIEhUVFBTIFVSTCBzdGFydGluZyB3aXRoIGh0dHBzOi8vJztcbiAgICAgIH1cbiAgICB9XG4gICAgdGhpcy52YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVNYXN0ZXJLZXlJcHMobWFzdGVyS2V5SXBzKTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIGlmIChyZXF1ZXN0S2V5d29yZERlbnlsaXN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPSByZXF1ZXN0S2V5d29yZERlbnlsaXN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcmVxdWVzdEtleXdvcmREZW55bGlzdCBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgaWYgKHR5cGVvZiBlbmZvcmNlUHJpdmF0ZVVzZXJzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGVuZm9yY2VQcml2YXRlVXNlcnMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNlY3VyaXR5KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5IG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVjayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVjayA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVjay5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVjaykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVja0xvZy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVja0xvZykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWE6IFNjaGVtYU9wdGlvbnMpIHtcbiAgICBpZiAoIXNjaGVtYSkgcmV0dXJuO1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2NoZW1hKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlZmluaXRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWZpbml0aW9ucyA9IFNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYS5kZWZpbml0aW9ucykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWZpbml0aW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuc3RyaWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5zdHJpY3QgPSBTY2hlbWFPcHRpb25zLnN0cmljdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuc3RyaWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnN0cmljdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9IFNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9IFNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEubG9ja1NjaGVtYXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmxvY2tTY2hlbWFzID0gU2NoZW1hT3B0aW9ucy5sb2NrU2NoZW1hcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEubG9ja1NjaGVtYXMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEubG9ja1NjaGVtYXMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmFmdGVyTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpcyBjb25maWd1cmVkIHRoZW4gc2V0dXAgYSBjYWxsYmFjayB0byBwcm9jZXNzIHRoZSBwYXR0ZXJuXG4gIHN0YXRpYyBzZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5ICYmIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgIHBhc3N3b3JkUG9saWN5LnBhdHRlcm5WYWxpZGF0b3IgPSB2YWx1ZSA9PiB7XG4gICAgICAgIHJldHVybiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuLnRlc3QodmFsdWUpO1xuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVFbWFpbENvbmZpZ3VyYXRpb24oe1xuICAgIGVtYWlsQWRhcHRlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICB9KSB7XG4gICAgaWYgKCFlbWFpbEFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdBbiBlbWFpbEFkYXB0ZXIgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGFwcE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQW4gYXBwIG5hbWUgaXMgcmVxdWlyZWQgZm9yIGUtbWFpbCB2ZXJpZmljYXRpb24gYW5kIHBhc3N3b3JkIHJlc2V0cy4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHB1YmxpY1NlcnZlclVSTCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93ICdBIHB1YmxpYyBzZXJ2ZXIgdXJsIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBpZiAoaXNOYU4oZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKSB7XG4gICAgICAgIHRocm93ICdFbWFpbCB2ZXJpZnkgdG9rZW4gdmFsaWRpdHkgZHVyYXRpb24gbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmIHR5cGVvZiBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICB9XG4gICAgaWYgKGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgJiYgIWVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyhmaWxlVXBsb2FkKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmIChmaWxlVXBsb2FkID09IG51bGwgfHwgdHlwZW9mIGZpbGVVcGxvYWQgIT09ICdvYmplY3QnIHx8IGZpbGVVcGxvYWQgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICB0aHJvdyAnZmlsZVVwbG9hZCBtdXN0IGJlIGFuIG9iamVjdCB2YWx1ZS4nO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgUmVmZXJlbmNlRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBbm9ueW1vdXNVc2VyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gICAgaWYgKGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yUHVibGljLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmlsZVVwbG9hZC5lbmFibGVGb3JQdWJsaWMgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgPSBGaWxlVXBsb2FkT3B0aW9ucy5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXN0ZXJLZXlJcHMobWFzdGVyS2V5SXBzKSB7XG4gICAgZm9yIChjb25zdCBpcCBvZiBtYXN0ZXJLZXlJcHMpIHtcbiAgICAgIGlmICghbmV0LmlzSVAoaXApKSB7XG4gICAgICAgIHRocm93IGBJbnZhbGlkIGlwIGluIG1hc3RlcktleUlwczogJHtpcH1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBtb3VudCgpIHtcbiAgICB2YXIgbW91bnQgPSB0aGlzLl9tb3VudDtcbiAgICBpZiAodGhpcy5wdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIG1vdW50ID0gdGhpcy5wdWJsaWNTZXJ2ZXJVUkw7XG4gICAgfVxuICAgIHJldHVybiBtb3VudDtcbiAgfVxuXG4gIHNldCBtb3VudChuZXdWYWx1ZSkge1xuICAgIHRoaXMuX21vdW50ID0gbmV3VmFsdWU7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgaWYgKGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIGlmIChpc05hTihzZXNzaW9uTGVuZ3RoKSkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbGlkIG51bWJlci4nO1xuICAgICAgfSBlbHNlIGlmIChzZXNzaW9uTGVuZ3RoIDw9IDApIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KSB7XG4gICAgaWYgKG1heExpbWl0IDw9IDApIHtcbiAgICAgIHRocm93ICdNYXggbGltaXQgbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycykge1xuICAgIGlmICghW251bGwsIHVuZGVmaW5lZF0uaW5jbHVkZXMoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoYWxsb3dIZWFkZXJzKSkge1xuICAgICAgICBhbGxvd0hlYWRlcnMuZm9yRWFjaChoZWFkZXIgPT4ge1xuICAgICAgICAgIGlmICh0eXBlb2YgaGVhZGVyICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdGhyb3cgJ0FsbG93IGhlYWRlcnMgbXVzdCBvbmx5IGNvbnRhaW4gc3RyaW5ncyc7XG4gICAgICAgICAgfSBlbHNlIGlmICghaGVhZGVyLnRyaW0oKS5sZW5ndGgpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgbm90IGNvbnRhaW4gZW1wdHkgc3RyaW5ncyc7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3QgYmUgYW4gYXJyYXknO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMudmVyaWZ5VXNlckVtYWlscyB8fCAhdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gICAgdmFyIG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpIHtcbiAgICBpZiAoIXRoaXMucGFzc3dvcmRQb2xpY3kgfHwgIXRoaXMucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgcmV0dXJuIG5ldyBEYXRlKG5vdy5nZXRUaW1lKCkgKyB0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICogMTAwMCk7XG4gIH1cblxuICBnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLmV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5zZXNzaW9uTGVuZ3RoICogMTAwMCk7XG4gIH1cblxuICBnZXQgaW52YWxpZExpbmtVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuaW52YWxpZExpbmsgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF9saW5rLmh0bWxgO1xuICB9XG5cbiAgZ2V0IGludmFsaWRWZXJpZmljYXRpb25MaW5rVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRWZXJpZmljYXRpb25MaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9pbnZhbGlkX3ZlcmlmaWNhdGlvbl9saW5rLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRTdWNjZXNzIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBsaW5rU2VuZEZhaWxVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMubGlua1NlbmRGYWlsIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2xpbmtfc2VuZF9mYWlsLmh0bWxgO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsU3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3ZlcmlmeV9lbWFpbF9zdWNjZXNzLmh0bWxgXG4gICAgKTtcbiAgfVxuXG4gIGdldCBjaG9vc2VQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5jaG9vc2VQYXNzd29yZCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9jaG9vc2VfcGFzc3dvcmRgO1xuICB9XG5cbiAgZ2V0IHJlcXVlc3RSZXNldFBhc3N3b3JkVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLnJlc2V0UGFzc3dvcmRMaW5rIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy52ZXJpZnlFbWFpbExpbmsgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS8ke3RoaXMucGFnZXNFbmRwb2ludH0vJHt0aGlzLmFwcGxpY2F0aW9uSWR9L3ZlcmlmeV9lbWFpbGBcbiAgICApO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBSUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBUUE7Ozs7QUFmQTtBQUNBO0FBQ0E7QUFlQSxTQUFTQSxtQkFBVCxDQUE2QkMsR0FBN0IsRUFBa0M7RUFDaEMsSUFBSSxDQUFDQSxHQUFMLEVBQVU7SUFDUixPQUFPQSxHQUFQO0VBQ0Q7O0VBQ0QsSUFBSUEsR0FBRyxDQUFDQyxRQUFKLENBQWEsR0FBYixDQUFKLEVBQXVCO0lBQ3JCRCxHQUFHLEdBQUdBLEdBQUcsQ0FBQ0UsTUFBSixDQUFXLENBQVgsRUFBY0YsR0FBRyxDQUFDRyxNQUFKLEdBQWEsQ0FBM0IsQ0FBTjtFQUNEOztFQUNELE9BQU9ILEdBQVA7QUFDRDs7QUFFTSxNQUFNSSxNQUFOLENBQWE7RUFDUixPQUFIQyxHQUFHLENBQUNDLGFBQUQsRUFBd0JDLEtBQXhCLEVBQXVDO0lBQy9DLE1BQU1DLFNBQVMsR0FBR0MsY0FBQSxDQUFTSixHQUFULENBQWFDLGFBQWIsQ0FBbEI7O0lBQ0EsSUFBSSxDQUFDRSxTQUFMLEVBQWdCO01BQ2Q7SUFDRDs7SUFDRCxNQUFNRSxNQUFNLEdBQUcsSUFBSU4sTUFBSixFQUFmO0lBQ0FNLE1BQU0sQ0FBQ0osYUFBUCxHQUF1QkEsYUFBdkI7SUFDQUssTUFBTSxDQUFDQyxJQUFQLENBQVlKLFNBQVosRUFBdUJLLE9BQXZCLENBQStCQyxHQUFHLElBQUk7TUFDcEMsSUFBSUEsR0FBRyxJQUFJLG9CQUFYLEVBQWlDO1FBQy9CSixNQUFNLENBQUNLLFFBQVAsR0FBa0IsSUFBSUMsMkJBQUosQ0FBdUJSLFNBQVMsQ0FBQ1Msa0JBQVYsQ0FBNkJDLE9BQXBELEVBQTZEUixNQUE3RCxDQUFsQjtNQUNELENBRkQsTUFFTztRQUNMQSxNQUFNLENBQUNJLEdBQUQsQ0FBTixHQUFjTixTQUFTLENBQUNNLEdBQUQsQ0FBdkI7TUFDRDtJQUNGLENBTkQ7SUFPQUosTUFBTSxDQUFDSCxLQUFQLEdBQWVSLG1CQUFtQixDQUFDUSxLQUFELENBQWxDO0lBQ0FHLE1BQU0sQ0FBQ1Msd0JBQVAsR0FBa0NULE1BQU0sQ0FBQ1Msd0JBQVAsQ0FBZ0NDLElBQWhDLENBQXFDVixNQUFyQyxDQUFsQztJQUNBQSxNQUFNLENBQUNXLGlDQUFQLEdBQTJDWCxNQUFNLENBQUNXLGlDQUFQLENBQXlDRCxJQUF6QyxDQUN6Q1YsTUFEeUMsQ0FBM0M7SUFHQSxPQUFPQSxNQUFQO0VBQ0Q7O0VBRVMsT0FBSFksR0FBRyxDQUFDQyxtQkFBRCxFQUFzQjtJQUM5Qm5CLE1BQU0sQ0FBQ29CLFFBQVAsQ0FBZ0JELG1CQUFoQjs7SUFDQWQsY0FBQSxDQUFTYSxHQUFULENBQWFDLG1CQUFtQixDQUFDRSxLQUFqQyxFQUF3Q0YsbUJBQXhDOztJQUNBbkIsTUFBTSxDQUFDc0Isc0JBQVAsQ0FBOEJILG1CQUFtQixDQUFDSSxjQUFsRDtJQUNBLE9BQU9KLG1CQUFQO0VBQ0Q7O0VBRWMsT0FBUkMsUUFBUSxDQUFDO0lBQ2RJLGdCQURjO0lBRWRDLGNBRmM7SUFHZEMsT0FIYztJQUlkQyxlQUpjO0lBS2RDLDRCQUxjO0lBTWRDLHNCQU5jO0lBT2RDLGFBUGM7SUFRZEMsUUFSYztJQVNkQyxnQ0FUYztJQVVkQyxjQVZjO0lBV2RWLGNBWGM7SUFZZFcsWUFaYztJQWFkQyxTQWJjO0lBY2RDLGlCQWRjO0lBZWRDLFlBZmM7SUFnQmRDLGtCQWhCYztJQWlCZEMsNEJBakJjO0lBa0JkQyxVQWxCYztJQW1CZEMsS0FuQmM7SUFvQmRDLFFBcEJjO0lBcUJkQyxtQkFyQmM7SUFzQmRDLE1BdEJjO0lBdUJkQztFQXZCYyxDQUFELEVBd0JaO0lBQ0QsSUFBSVYsU0FBUyxLQUFLQyxpQkFBbEIsRUFBcUM7TUFDbkMsTUFBTSxJQUFJVSxLQUFKLENBQVUscURBQVYsQ0FBTjtJQUNEOztJQUVELE1BQU1DLFlBQVksR0FBR3RCLGNBQWMsQ0FBQ1gsT0FBcEM7O0lBQ0EsSUFBSVUsZ0JBQUosRUFBc0I7TUFDcEIsS0FBS3dCLDBCQUFMLENBQWdDO1FBQzlCRCxZQUQ4QjtRQUU5QnJCLE9BRjhCO1FBRzlCQyxlQUg4QjtRQUk5QkssZ0NBSjhCO1FBSzlCTztNQUw4QixDQUFoQztJQU9EOztJQUVELEtBQUtVLDRCQUFMLENBQWtDaEIsY0FBbEM7SUFDQSxLQUFLaUIsc0JBQUwsQ0FBNEIzQixjQUE1QjtJQUNBLEtBQUs0Qix5QkFBTCxDQUErQlgsVUFBL0I7O0lBRUEsSUFBSSxPQUFPWiw0QkFBUCxLQUF3QyxTQUE1QyxFQUF1RDtNQUNyRCxNQUFNLHNEQUFOO0lBQ0Q7O0lBRUQsSUFBSUQsZUFBSixFQUFxQjtNQUNuQixJQUFJLENBQUNBLGVBQWUsQ0FBQ3lCLFVBQWhCLENBQTJCLFNBQTNCLENBQUQsSUFBMEMsQ0FBQ3pCLGVBQWUsQ0FBQ3lCLFVBQWhCLENBQTJCLFVBQTNCLENBQS9DLEVBQXVGO1FBQ3JGLE1BQU0sb0VBQU47TUFDRDtJQUNGOztJQUNELEtBQUtDLDRCQUFMLENBQWtDdkIsYUFBbEMsRUFBaURELHNCQUFqRDtJQUNBLEtBQUt5QixvQkFBTCxDQUEwQnBCLFlBQTFCO0lBQ0EsS0FBS3FCLGdCQUFMLENBQXNCeEIsUUFBdEI7SUFDQSxLQUFLeUIsb0JBQUwsQ0FBMEJuQixZQUExQjtJQUNBLEtBQUtvQiwwQkFBTCxDQUFnQ25CLGtCQUFoQztJQUNBLEtBQUtvQixvQkFBTCxDQUEwQmpCLEtBQTFCO0lBQ0EsS0FBS2tCLHVCQUFMLENBQTZCakIsUUFBN0I7SUFDQSxLQUFLa0IscUJBQUwsQ0FBMkJoQixNQUEzQjtJQUNBLEtBQUtpQiwyQkFBTCxDQUFpQ2xCLG1CQUFqQztJQUNBLEtBQUttQiw4QkFBTCxDQUFvQ2pCLHNCQUFwQztFQUNEOztFQUVvQyxPQUE5QmlCLDhCQUE4QixDQUFDakIsc0JBQUQsRUFBeUI7SUFDNUQsSUFBSUEsc0JBQXNCLEtBQUtrQixTQUEvQixFQUEwQztNQUN4Q2xCLHNCQUFzQixHQUFHQSxzQkFBc0IsQ0FBQ21CLE9BQWhEO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQ0MsS0FBSyxDQUFDQyxPQUFOLENBQWNyQixzQkFBZCxDQUFMLEVBQTRDO01BQ2pELE1BQU0sOERBQU47SUFDRDtFQUNGOztFQUVpQyxPQUEzQmdCLDJCQUEyQixDQUFDbEIsbUJBQUQsRUFBc0I7SUFDdEQsSUFBSSxPQUFPQSxtQkFBUCxLQUErQixTQUFuQyxFQUE4QztNQUM1QyxNQUFNLDREQUFOO0lBQ0Q7RUFDRjs7RUFFNkIsT0FBdkJnQix1QkFBdUIsQ0FBQ2pCLFFBQUQsRUFBVztJQUN2QyxJQUFJbkMsTUFBTSxDQUFDNEQsU0FBUCxDQUFpQkMsUUFBakIsQ0FBMEJDLElBQTFCLENBQStCM0IsUUFBL0IsTUFBNkMsaUJBQWpELEVBQW9FO01BQ2xFLE1BQU0saURBQU47SUFDRDs7SUFDRCxJQUFJQSxRQUFRLENBQUM0QixXQUFULEtBQXlCUCxTQUE3QixFQUF3QztNQUN0Q3JCLFFBQVEsQ0FBQzRCLFdBQVQsR0FBdUJDLDRCQUFBLENBQWdCRCxXQUFoQixDQUE0Qk4sT0FBbkQ7SUFDRCxDQUZELE1BRU8sSUFBSSxDQUFDLElBQUFRLGlCQUFBLEVBQVU5QixRQUFRLENBQUM0QixXQUFuQixDQUFMLEVBQXNDO01BQzNDLE1BQU0sNkRBQU47SUFDRDs7SUFDRCxJQUFJNUIsUUFBUSxDQUFDK0IsY0FBVCxLQUE0QlYsU0FBaEMsRUFBMkM7TUFDekNyQixRQUFRLENBQUMrQixjQUFULEdBQTBCRiw0QkFBQSxDQUFnQkUsY0FBaEIsQ0FBK0JULE9BQXpEO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQyxJQUFBUSxpQkFBQSxFQUFVOUIsUUFBUSxDQUFDK0IsY0FBbkIsQ0FBTCxFQUF5QztNQUM5QyxNQUFNLGdFQUFOO0lBQ0Q7RUFDRjs7RUFFMkIsT0FBckJiLHFCQUFxQixDQUFDaEIsTUFBRCxFQUF3QjtJQUNsRCxJQUFJLENBQUNBLE1BQUwsRUFBYTs7SUFDYixJQUFJckMsTUFBTSxDQUFDNEQsU0FBUCxDQUFpQkMsUUFBakIsQ0FBMEJDLElBQTFCLENBQStCekIsTUFBL0IsTUFBMkMsaUJBQS9DLEVBQWtFO01BQ2hFLE1BQU0sK0NBQU47SUFDRDs7SUFDRCxJQUFJQSxNQUFNLENBQUM4QixXQUFQLEtBQXVCWCxTQUEzQixFQUFzQztNQUNwQ25CLE1BQU0sQ0FBQzhCLFdBQVAsR0FBcUJDLDBCQUFBLENBQWNELFdBQWQsQ0FBMEJWLE9BQS9DO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQ0MsS0FBSyxDQUFDQyxPQUFOLENBQWN0QixNQUFNLENBQUM4QixXQUFyQixDQUFMLEVBQXdDO01BQzdDLE1BQU0sMERBQU47SUFDRDs7SUFDRCxJQUFJOUIsTUFBTSxDQUFDZ0MsTUFBUCxLQUFrQmIsU0FBdEIsRUFBaUM7TUFDL0JuQixNQUFNLENBQUNnQyxNQUFQLEdBQWdCRCwwQkFBQSxDQUFjQyxNQUFkLENBQXFCWixPQUFyQztJQUNELENBRkQsTUFFTyxJQUFJLENBQUMsSUFBQVEsaUJBQUEsRUFBVTVCLE1BQU0sQ0FBQ2dDLE1BQWpCLENBQUwsRUFBK0I7TUFDcEMsTUFBTSxzREFBTjtJQUNEOztJQUNELElBQUloQyxNQUFNLENBQUNpQyxpQkFBUCxLQUE2QmQsU0FBakMsRUFBNEM7TUFDMUNuQixNQUFNLENBQUNpQyxpQkFBUCxHQUEyQkYsMEJBQUEsQ0FBY0UsaUJBQWQsQ0FBZ0NiLE9BQTNEO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQyxJQUFBUSxpQkFBQSxFQUFVNUIsTUFBTSxDQUFDaUMsaUJBQWpCLENBQUwsRUFBMEM7TUFDL0MsTUFBTSxpRUFBTjtJQUNEOztJQUNELElBQUlqQyxNQUFNLENBQUNrQyxzQkFBUCxLQUFrQ2YsU0FBdEMsRUFBaUQ7TUFDL0NuQixNQUFNLENBQUNrQyxzQkFBUCxHQUFnQ0gsMEJBQUEsQ0FBY0csc0JBQWQsQ0FBcUNkLE9BQXJFO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQyxJQUFBUSxpQkFBQSxFQUFVNUIsTUFBTSxDQUFDa0Msc0JBQWpCLENBQUwsRUFBK0M7TUFDcEQsTUFBTSxzRUFBTjtJQUNEOztJQUNELElBQUlsQyxNQUFNLENBQUNtQyxXQUFQLEtBQXVCaEIsU0FBM0IsRUFBc0M7TUFDcENuQixNQUFNLENBQUNtQyxXQUFQLEdBQXFCSiwwQkFBQSxDQUFjSSxXQUFkLENBQTBCZixPQUEvQztJQUNELENBRkQsTUFFTyxJQUFJLENBQUMsSUFBQVEsaUJBQUEsRUFBVTVCLE1BQU0sQ0FBQ21DLFdBQWpCLENBQUwsRUFBb0M7TUFDekMsTUFBTSwyREFBTjtJQUNEOztJQUNELElBQUluQyxNQUFNLENBQUNvQyxlQUFQLEtBQTJCakIsU0FBL0IsRUFBMEM7TUFDeENuQixNQUFNLENBQUNvQyxlQUFQLEdBQXlCLElBQXpCO0lBQ0QsQ0FGRCxNQUVPLElBQUlwQyxNQUFNLENBQUNvQyxlQUFQLEtBQTJCLElBQTNCLElBQW1DLE9BQU9wQyxNQUFNLENBQUNvQyxlQUFkLEtBQWtDLFVBQXpFLEVBQXFGO01BQzFGLE1BQU0sZ0VBQU47SUFDRDs7SUFDRCxJQUFJcEMsTUFBTSxDQUFDcUMsY0FBUCxLQUEwQmxCLFNBQTlCLEVBQXlDO01BQ3ZDbkIsTUFBTSxDQUFDcUMsY0FBUCxHQUF3QixJQUF4QjtJQUNELENBRkQsTUFFTyxJQUFJckMsTUFBTSxDQUFDcUMsY0FBUCxLQUEwQixJQUExQixJQUFrQyxPQUFPckMsTUFBTSxDQUFDcUMsY0FBZCxLQUFpQyxVQUF2RSxFQUFtRjtNQUN4RixNQUFNLCtEQUFOO0lBQ0Q7RUFDRjs7RUFFMEIsT0FBcEJ2QixvQkFBb0IsQ0FBQ2pCLEtBQUQsRUFBUTtJQUNqQyxJQUFJbEMsTUFBTSxDQUFDNEQsU0FBUCxDQUFpQkMsUUFBakIsQ0FBMEJDLElBQTFCLENBQStCNUIsS0FBL0IsTUFBMEMsaUJBQTlDLEVBQWlFO01BQy9ELE1BQU0sOENBQU47SUFDRDs7SUFDRCxJQUFJQSxLQUFLLENBQUN5QyxZQUFOLEtBQXVCbkIsU0FBM0IsRUFBc0M7TUFDcEN0QixLQUFLLENBQUN5QyxZQUFOLEdBQXFCQyx5QkFBQSxDQUFhRCxZQUFiLENBQTBCbEIsT0FBL0M7SUFDRCxDQUZELE1BRU8sSUFBSSxDQUFDLElBQUFRLGlCQUFBLEVBQVUvQixLQUFLLENBQUN5QyxZQUFoQixDQUFMLEVBQW9DO01BQ3pDLE1BQU0sMkRBQU47SUFDRDs7SUFDRCxJQUFJekMsS0FBSyxDQUFDMkMsa0JBQU4sS0FBNkJyQixTQUFqQyxFQUE0QztNQUMxQ3RCLEtBQUssQ0FBQzJDLGtCQUFOLEdBQTJCRCx5QkFBQSxDQUFhQyxrQkFBYixDQUFnQ3BCLE9BQTNEO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQyxJQUFBUSxpQkFBQSxFQUFVL0IsS0FBSyxDQUFDMkMsa0JBQWhCLENBQUwsRUFBMEM7TUFDL0MsTUFBTSxpRUFBTjtJQUNEOztJQUNELElBQUkzQyxLQUFLLENBQUM0QyxvQkFBTixLQUErQnRCLFNBQW5DLEVBQThDO01BQzVDdEIsS0FBSyxDQUFDNEMsb0JBQU4sR0FBNkJGLHlCQUFBLENBQWFFLG9CQUFiLENBQWtDckIsT0FBL0Q7SUFDRCxDQUZELE1BRU8sSUFBSSxDQUFDLElBQUFzQixnQkFBQSxFQUFTN0MsS0FBSyxDQUFDNEMsb0JBQWYsQ0FBTCxFQUEyQztNQUNoRCxNQUFNLGtFQUFOO0lBQ0Q7O0lBQ0QsSUFBSTVDLEtBQUssQ0FBQzhDLDBCQUFOLEtBQXFDeEIsU0FBekMsRUFBb0Q7TUFDbER0QixLQUFLLENBQUM4QywwQkFBTixHQUFtQ0oseUJBQUEsQ0FBYUksMEJBQWIsQ0FBd0N2QixPQUEzRTtJQUNELENBRkQsTUFFTyxJQUFJLENBQUMsSUFBQXNCLGdCQUFBLEVBQVM3QyxLQUFLLENBQUM4QywwQkFBZixDQUFMLEVBQWlEO01BQ3RELE1BQU0sd0VBQU47SUFDRDs7SUFDRCxJQUFJOUMsS0FBSyxDQUFDK0MsWUFBTixLQUF1QnpCLFNBQTNCLEVBQXNDO01BQ3BDdEIsS0FBSyxDQUFDK0MsWUFBTixHQUFxQkwseUJBQUEsQ0FBYUssWUFBYixDQUEwQnhCLE9BQS9DO0lBQ0QsQ0FGRCxNQUVPLElBQ0x6RCxNQUFNLENBQUM0RCxTQUFQLENBQWlCQyxRQUFqQixDQUEwQkMsSUFBMUIsQ0FBK0I1QixLQUFLLENBQUMrQyxZQUFyQyxNQUF1RCxpQkFBdkQsSUFDQSxPQUFPL0MsS0FBSyxDQUFDK0MsWUFBYixLQUE4QixVQUZ6QixFQUdMO01BQ0EsTUFBTSx5RUFBTjtJQUNEOztJQUNELElBQUkvQyxLQUFLLENBQUNnRCxhQUFOLEtBQXdCMUIsU0FBNUIsRUFBdUM7TUFDckN0QixLQUFLLENBQUNnRCxhQUFOLEdBQXNCTix5QkFBQSxDQUFhTSxhQUFiLENBQTJCekIsT0FBakQ7SUFDRCxDQUZELE1BRU8sSUFBSSxDQUFDLElBQUFRLGlCQUFBLEVBQVUvQixLQUFLLENBQUNnRCxhQUFoQixDQUFMLEVBQXFDO01BQzFDLE1BQU0sNERBQU47SUFDRDs7SUFDRCxJQUFJaEQsS0FBSyxDQUFDaUQsU0FBTixLQUFvQjNCLFNBQXhCLEVBQW1DO01BQ2pDdEIsS0FBSyxDQUFDaUQsU0FBTixHQUFrQlAseUJBQUEsQ0FBYU8sU0FBYixDQUF1QjFCLE9BQXpDO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQyxJQUFBc0IsZ0JBQUEsRUFBUzdDLEtBQUssQ0FBQ2lELFNBQWYsQ0FBTCxFQUFnQztNQUNyQyxNQUFNLHVEQUFOO0lBQ0Q7O0lBQ0QsSUFBSWpELEtBQUssQ0FBQ2tELGFBQU4sS0FBd0I1QixTQUE1QixFQUF1QztNQUNyQ3RCLEtBQUssQ0FBQ2tELGFBQU4sR0FBc0JSLHlCQUFBLENBQWFRLGFBQWIsQ0FBMkIzQixPQUFqRDtJQUNELENBRkQsTUFFTyxJQUFJLENBQUMsSUFBQXNCLGdCQUFBLEVBQVM3QyxLQUFLLENBQUNrRCxhQUFmLENBQUwsRUFBb0M7TUFDekMsTUFBTSwyREFBTjtJQUNEOztJQUNELElBQUlsRCxLQUFLLENBQUNtRCxVQUFOLEtBQXFCN0IsU0FBekIsRUFBb0M7TUFDbEN0QixLQUFLLENBQUNtRCxVQUFOLEdBQW1CVCx5QkFBQSxDQUFhUyxVQUFiLENBQXdCNUIsT0FBM0M7SUFDRCxDQUZELE1BRU8sSUFBSXpELE1BQU0sQ0FBQzRELFNBQVAsQ0FBaUJDLFFBQWpCLENBQTBCQyxJQUExQixDQUErQjVCLEtBQUssQ0FBQ21ELFVBQXJDLE1BQXFELGlCQUF6RCxFQUE0RTtNQUNqRixNQUFNLHlEQUFOO0lBQ0Q7O0lBQ0QsSUFBSW5ELEtBQUssQ0FBQ29ELFlBQU4sS0FBdUI5QixTQUEzQixFQUFzQztNQUNwQ3RCLEtBQUssQ0FBQ29ELFlBQU4sR0FBcUJWLHlCQUFBLENBQWFVLFlBQWIsQ0FBMEI3QixPQUEvQztJQUNELENBRkQsTUFFTyxJQUFJLEVBQUV2QixLQUFLLENBQUNvRCxZQUFOLFlBQThCNUIsS0FBaEMsQ0FBSixFQUE0QztNQUNqRCxNQUFNLDBEQUFOO0lBQ0Q7RUFDRjs7RUFFZ0MsT0FBMUJSLDBCQUEwQixDQUFDbkIsa0JBQUQsRUFBcUI7SUFDcEQsSUFBSSxDQUFDQSxrQkFBTCxFQUF5QjtNQUN2QjtJQUNEOztJQUNELElBQUlBLGtCQUFrQixDQUFDd0QsR0FBbkIsS0FBMkIvQixTQUEvQixFQUEwQztNQUN4Q3pCLGtCQUFrQixDQUFDd0QsR0FBbkIsR0FBeUJDLCtCQUFBLENBQW1CRCxHQUFuQixDQUF1QjlCLE9BQWhEO0lBQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQ2dDLEtBQUssQ0FBQzFELGtCQUFrQixDQUFDd0QsR0FBcEIsQ0FBTixJQUFrQ3hELGtCQUFrQixDQUFDd0QsR0FBbkIsSUFBMEIsQ0FBaEUsRUFBbUU7TUFDeEUsTUFBTSxzREFBTjtJQUNELENBRk0sTUFFQSxJQUFJRSxLQUFLLENBQUMxRCxrQkFBa0IsQ0FBQ3dELEdBQXBCLENBQVQsRUFBbUM7TUFDeEMsTUFBTSx3Q0FBTjtJQUNEOztJQUNELElBQUksQ0FBQ3hELGtCQUFrQixDQUFDMkQsS0FBeEIsRUFBK0I7TUFDN0IzRCxrQkFBa0IsQ0FBQzJELEtBQW5CLEdBQTJCRiwrQkFBQSxDQUFtQkUsS0FBbkIsQ0FBeUJqQyxPQUFwRDtJQUNELENBRkQsTUFFTyxJQUFJLEVBQUUxQixrQkFBa0IsQ0FBQzJELEtBQW5CLFlBQW9DaEMsS0FBdEMsQ0FBSixFQUFrRDtNQUN2RCxNQUFNLGtEQUFOO0lBQ0Q7RUFDRjs7RUFFa0MsT0FBNUJoQiw0QkFBNEIsQ0FBQ2hCLGNBQUQsRUFBaUI7SUFDbEQsSUFBSUEsY0FBSixFQUFvQjtNQUNsQixJQUNFLE9BQU9BLGNBQWMsQ0FBQ2lFLFFBQXRCLEtBQW1DLFFBQW5DLElBQ0FqRSxjQUFjLENBQUNpRSxRQUFmLElBQTJCLENBRDNCLElBRUFqRSxjQUFjLENBQUNpRSxRQUFmLEdBQTBCLEtBSDVCLEVBSUU7UUFDQSxNQUFNLHdFQUFOO01BQ0Q7O01BRUQsSUFDRSxDQUFDQyxNQUFNLENBQUNDLFNBQVAsQ0FBaUJuRSxjQUFjLENBQUNvRSxTQUFoQyxDQUFELElBQ0FwRSxjQUFjLENBQUNvRSxTQUFmLEdBQTJCLENBRDNCLElBRUFwRSxjQUFjLENBQUNvRSxTQUFmLEdBQTJCLEdBSDdCLEVBSUU7UUFDQSxNQUFNLGtGQUFOO01BQ0Q7O01BRUQsSUFBSXBFLGNBQWMsQ0FBQ3FFLHFCQUFmLEtBQXlDdkMsU0FBN0MsRUFBd0Q7UUFDdEQ5QixjQUFjLENBQUNxRSxxQkFBZixHQUF1Q0Msa0NBQUEsQ0FBc0JELHFCQUF0QixDQUE0Q3RDLE9BQW5GO01BQ0QsQ0FGRCxNQUVPLElBQUksQ0FBQyxJQUFBUSxpQkFBQSxFQUFVdkMsY0FBYyxDQUFDcUUscUJBQXpCLENBQUwsRUFBc0Q7UUFDM0QsTUFBTSw2RUFBTjtNQUNEO0lBQ0Y7RUFDRjs7RUFFNEIsT0FBdEJwRCxzQkFBc0IsQ0FBQzNCLGNBQUQsRUFBaUI7SUFDNUMsSUFBSUEsY0FBSixFQUFvQjtNQUNsQixJQUNFQSxjQUFjLENBQUNpRixjQUFmLEtBQWtDekMsU0FBbEMsS0FDQyxPQUFPeEMsY0FBYyxDQUFDaUYsY0FBdEIsS0FBeUMsUUFBekMsSUFBcURqRixjQUFjLENBQUNpRixjQUFmLEdBQWdDLENBRHRGLENBREYsRUFHRTtRQUNBLE1BQU0seURBQU47TUFDRDs7TUFFRCxJQUNFakYsY0FBYyxDQUFDa0YsMEJBQWYsS0FBOEMxQyxTQUE5QyxLQUNDLE9BQU94QyxjQUFjLENBQUNrRiwwQkFBdEIsS0FBcUQsUUFBckQsSUFDQ2xGLGNBQWMsQ0FBQ2tGLDBCQUFmLElBQTZDLENBRi9DLENBREYsRUFJRTtRQUNBLE1BQU0scUVBQU47TUFDRDs7TUFFRCxJQUFJbEYsY0FBYyxDQUFDbUYsZ0JBQW5CLEVBQXFDO1FBQ25DLElBQUksT0FBT25GLGNBQWMsQ0FBQ21GLGdCQUF0QixLQUEyQyxRQUEvQyxFQUF5RDtVQUN2RG5GLGNBQWMsQ0FBQ21GLGdCQUFmLEdBQWtDLElBQUlDLE1BQUosQ0FBV3BGLGNBQWMsQ0FBQ21GLGdCQUExQixDQUFsQztRQUNELENBRkQsTUFFTyxJQUFJLEVBQUVuRixjQUFjLENBQUNtRixnQkFBZixZQUEyQ0MsTUFBN0MsQ0FBSixFQUEwRDtVQUMvRCxNQUFNLDBFQUFOO1FBQ0Q7TUFDRjs7TUFFRCxJQUNFcEYsY0FBYyxDQUFDcUYsaUJBQWYsSUFDQSxPQUFPckYsY0FBYyxDQUFDcUYsaUJBQXRCLEtBQTRDLFVBRjlDLEVBR0U7UUFDQSxNQUFNLHNEQUFOO01BQ0Q7O01BRUQsSUFDRXJGLGNBQWMsQ0FBQ3NGLGtCQUFmLElBQ0EsT0FBT3RGLGNBQWMsQ0FBQ3NGLGtCQUF0QixLQUE2QyxTQUYvQyxFQUdFO1FBQ0EsTUFBTSw0REFBTjtNQUNEOztNQUVELElBQ0V0RixjQUFjLENBQUN1RixrQkFBZixLQUNDLENBQUNYLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQjdFLGNBQWMsQ0FBQ3VGLGtCQUFoQyxDQUFELElBQ0N2RixjQUFjLENBQUN1RixrQkFBZixJQUFxQyxDQUR0QyxJQUVDdkYsY0FBYyxDQUFDdUYsa0JBQWYsR0FBb0MsRUFIdEMsQ0FERixFQUtFO1FBQ0EsTUFBTSxxRUFBTjtNQUNEOztNQUVELElBQ0V2RixjQUFjLENBQUN3RixzQkFBZixJQUNBLE9BQU94RixjQUFjLENBQUN3RixzQkFBdEIsS0FBaUQsU0FGbkQsRUFHRTtRQUNBLE1BQU0sZ0RBQU47TUFDRDs7TUFDRCxJQUFJeEYsY0FBYyxDQUFDd0Ysc0JBQWYsSUFBeUMsQ0FBQ3hGLGNBQWMsQ0FBQ2tGLDBCQUE3RCxFQUF5RjtRQUN2RixNQUFNLDBFQUFOO01BQ0Q7SUFDRjtFQUNGLENBeFVpQixDQTBVbEI7OztFQUM2QixPQUF0Qm5GLHNCQUFzQixDQUFDQyxjQUFELEVBQWlCO0lBQzVDLElBQUlBLGNBQWMsSUFBSUEsY0FBYyxDQUFDbUYsZ0JBQXJDLEVBQXVEO01BQ3JEbkYsY0FBYyxDQUFDeUYsZ0JBQWYsR0FBa0NDLEtBQUssSUFBSTtRQUN6QyxPQUFPMUYsY0FBYyxDQUFDbUYsZ0JBQWYsQ0FBZ0NRLElBQWhDLENBQXFDRCxLQUFyQyxDQUFQO01BQ0QsQ0FGRDtJQUdEO0VBQ0Y7O0VBRWdDLE9BQTFCakUsMEJBQTBCLENBQUM7SUFDaENELFlBRGdDO0lBRWhDckIsT0FGZ0M7SUFHaENDLGVBSGdDO0lBSWhDSyxnQ0FKZ0M7SUFLaENPO0VBTGdDLENBQUQsRUFNOUI7SUFDRCxJQUFJLENBQUNRLFlBQUwsRUFBbUI7TUFDakIsTUFBTSwwRUFBTjtJQUNEOztJQUNELElBQUksT0FBT3JCLE9BQVAsS0FBbUIsUUFBdkIsRUFBaUM7TUFDL0IsTUFBTSxzRUFBTjtJQUNEOztJQUNELElBQUksT0FBT0MsZUFBUCxLQUEyQixRQUEvQixFQUF5QztNQUN2QyxNQUFNLDhFQUFOO0lBQ0Q7O0lBQ0QsSUFBSUssZ0NBQUosRUFBc0M7TUFDcEMsSUFBSWdFLEtBQUssQ0FBQ2hFLGdDQUFELENBQVQsRUFBNkM7UUFDM0MsTUFBTSw4REFBTjtNQUNELENBRkQsTUFFTyxJQUFJQSxnQ0FBZ0MsSUFBSSxDQUF4QyxFQUEyQztRQUNoRCxNQUFNLHNFQUFOO01BQ0Q7SUFDRjs7SUFDRCxJQUFJTyw0QkFBNEIsSUFBSSxPQUFPQSw0QkFBUCxLQUF3QyxTQUE1RSxFQUF1RjtNQUNyRixNQUFNLHNEQUFOO0lBQ0Q7O0lBQ0QsSUFBSUEsNEJBQTRCLElBQUksQ0FBQ1AsZ0NBQXJDLEVBQXVFO01BQ3JFLE1BQU0sc0ZBQU47SUFDRDtFQUNGOztFQUUrQixPQUF6Qm1CLHlCQUF5QixDQUFDWCxVQUFELEVBQWE7SUFDM0MsSUFBSTtNQUNGLElBQUlBLFVBQVUsSUFBSSxJQUFkLElBQXNCLE9BQU9BLFVBQVAsS0FBc0IsUUFBNUMsSUFBd0RBLFVBQVUsWUFBWXlCLEtBQWxGLEVBQXlGO1FBQ3ZGLE1BQU0scUNBQU47TUFDRDtJQUNGLENBSkQsQ0FJRSxPQUFPa0QsQ0FBUCxFQUFVO01BQ1YsSUFBSUEsQ0FBQyxZQUFZQyxjQUFqQixFQUFpQztRQUMvQjtNQUNEOztNQUNELE1BQU1ELENBQU47SUFDRDs7SUFDRCxJQUFJM0UsVUFBVSxDQUFDNkUsc0JBQVgsS0FBc0N0RCxTQUExQyxFQUFxRDtNQUNuRHZCLFVBQVUsQ0FBQzZFLHNCQUFYLEdBQW9DQyw4QkFBQSxDQUFrQkQsc0JBQWxCLENBQXlDckQsT0FBN0U7SUFDRCxDQUZELE1BRU8sSUFBSSxPQUFPeEIsVUFBVSxDQUFDNkUsc0JBQWxCLEtBQTZDLFNBQWpELEVBQTREO01BQ2pFLE1BQU0sNERBQU47SUFDRDs7SUFDRCxJQUFJN0UsVUFBVSxDQUFDK0UsZUFBWCxLQUErQnhELFNBQW5DLEVBQThDO01BQzVDdkIsVUFBVSxDQUFDK0UsZUFBWCxHQUE2QkQsOEJBQUEsQ0FBa0JDLGVBQWxCLENBQWtDdkQsT0FBL0Q7SUFDRCxDQUZELE1BRU8sSUFBSSxPQUFPeEIsVUFBVSxDQUFDK0UsZUFBbEIsS0FBc0MsU0FBMUMsRUFBcUQ7TUFDMUQsTUFBTSxxREFBTjtJQUNEOztJQUNELElBQUkvRSxVQUFVLENBQUNnRiwwQkFBWCxLQUEwQ3pELFNBQTlDLEVBQXlEO01BQ3ZEdkIsVUFBVSxDQUFDZ0YsMEJBQVgsR0FBd0NGLDhCQUFBLENBQWtCRSwwQkFBbEIsQ0FBNkN4RCxPQUFyRjtJQUNELENBRkQsTUFFTyxJQUFJLE9BQU94QixVQUFVLENBQUNnRiwwQkFBbEIsS0FBaUQsU0FBckQsRUFBZ0U7TUFDckUsTUFBTSxnRUFBTjtJQUNEO0VBQ0Y7O0VBRTBCLE9BQXBCbEUsb0JBQW9CLENBQUNwQixZQUFELEVBQWU7SUFDeEMsS0FBSyxNQUFNdUYsRUFBWCxJQUFpQnZGLFlBQWpCLEVBQStCO01BQzdCLElBQUksQ0FBQ3dGLFlBQUEsQ0FBSUMsSUFBSixDQUFTRixFQUFULENBQUwsRUFBbUI7UUFDakIsTUFBTywrQkFBOEJBLEVBQUcsRUFBeEM7TUFDRDtJQUNGO0VBQ0Y7O0VBRVEsSUFBTHRILEtBQUssR0FBRztJQUNWLElBQUlBLEtBQUssR0FBRyxLQUFLeUgsTUFBakI7O0lBQ0EsSUFBSSxLQUFLakcsZUFBVCxFQUEwQjtNQUN4QnhCLEtBQUssR0FBRyxLQUFLd0IsZUFBYjtJQUNEOztJQUNELE9BQU94QixLQUFQO0VBQ0Q7O0VBRVEsSUFBTEEsS0FBSyxDQUFDMEgsUUFBRCxFQUFXO0lBQ2xCLEtBQUtELE1BQUwsR0FBY0MsUUFBZDtFQUNEOztFQUVrQyxPQUE1QnhFLDRCQUE0QixDQUFDdkIsYUFBRCxFQUFnQkQsc0JBQWhCLEVBQXdDO0lBQ3pFLElBQUlBLHNCQUFKLEVBQTRCO01BQzFCLElBQUltRSxLQUFLLENBQUNsRSxhQUFELENBQVQsRUFBMEI7UUFDeEIsTUFBTSx3Q0FBTjtNQUNELENBRkQsTUFFTyxJQUFJQSxhQUFhLElBQUksQ0FBckIsRUFBd0I7UUFDN0IsTUFBTSxnREFBTjtNQUNEO0lBQ0Y7RUFDRjs7RUFFc0IsT0FBaEJ5QixnQkFBZ0IsQ0FBQ3hCLFFBQUQsRUFBVztJQUNoQyxJQUFJQSxRQUFRLElBQUksQ0FBaEIsRUFBbUI7TUFDakIsTUFBTSwyQ0FBTjtJQUNEO0VBQ0Y7O0VBRTBCLE9BQXBCeUIsb0JBQW9CLENBQUNuQixZQUFELEVBQWU7SUFDeEMsSUFBSSxDQUFDLENBQUMsSUFBRCxFQUFPMEIsU0FBUCxFQUFrQitELFFBQWxCLENBQTJCekYsWUFBM0IsQ0FBTCxFQUErQztNQUM3QyxJQUFJNEIsS0FBSyxDQUFDQyxPQUFOLENBQWM3QixZQUFkLENBQUosRUFBaUM7UUFDL0JBLFlBQVksQ0FBQzVCLE9BQWIsQ0FBcUJzSCxNQUFNLElBQUk7VUFDN0IsSUFBSSxPQUFPQSxNQUFQLEtBQWtCLFFBQXRCLEVBQWdDO1lBQzlCLE1BQU0seUNBQU47VUFDRCxDQUZELE1BRU8sSUFBSSxDQUFDQSxNQUFNLENBQUNDLElBQVAsR0FBY2pJLE1BQW5CLEVBQTJCO1lBQ2hDLE1BQU0sOENBQU47VUFDRDtRQUNGLENBTkQ7TUFPRCxDQVJELE1BUU87UUFDTCxNQUFNLGdDQUFOO01BQ0Q7SUFDRjtFQUNGOztFQUVEa0IsaUNBQWlDLEdBQUc7SUFDbEMsSUFBSSxDQUFDLEtBQUtPLGdCQUFOLElBQTBCLENBQUMsS0FBS1EsZ0NBQXBDLEVBQXNFO01BQ3BFLE9BQU8rQixTQUFQO0lBQ0Q7O0lBQ0QsSUFBSWtFLEdBQUcsR0FBRyxJQUFJQyxJQUFKLEVBQVY7SUFDQSxPQUFPLElBQUlBLElBQUosQ0FBU0QsR0FBRyxDQUFDRSxPQUFKLEtBQWdCLEtBQUtuRyxnQ0FBTCxHQUF3QyxJQUFqRSxDQUFQO0VBQ0Q7O0VBRURvRyxtQ0FBbUMsR0FBRztJQUNwQyxJQUFJLENBQUMsS0FBSzdHLGNBQU4sSUFBd0IsQ0FBQyxLQUFLQSxjQUFMLENBQW9Ca0YsMEJBQWpELEVBQTZFO01BQzNFLE9BQU8xQyxTQUFQO0lBQ0Q7O0lBQ0QsTUFBTWtFLEdBQUcsR0FBRyxJQUFJQyxJQUFKLEVBQVo7SUFDQSxPQUFPLElBQUlBLElBQUosQ0FBU0QsR0FBRyxDQUFDRSxPQUFKLEtBQWdCLEtBQUs1RyxjQUFMLENBQW9Ca0YsMEJBQXBCLEdBQWlELElBQTFFLENBQVA7RUFDRDs7RUFFRDFGLHdCQUF3QixHQUFHO0lBQ3pCLElBQUksQ0FBQyxLQUFLYyxzQkFBVixFQUFrQztNQUNoQyxPQUFPa0MsU0FBUDtJQUNEOztJQUNELElBQUlrRSxHQUFHLEdBQUcsSUFBSUMsSUFBSixFQUFWO0lBQ0EsT0FBTyxJQUFJQSxJQUFKLENBQVNELEdBQUcsQ0FBQ0UsT0FBSixLQUFnQixLQUFLckcsYUFBTCxHQUFxQixJQUE5QyxDQUFQO0VBQ0Q7O0VBRWlCLElBQWR1RyxjQUFjLEdBQUc7SUFDbkIsT0FBTyxLQUFLQyxXQUFMLENBQWlCQyxXQUFqQixJQUFpQyxHQUFFLEtBQUs1RyxlQUFnQix5QkFBL0Q7RUFDRDs7RUFFNkIsSUFBMUI2RywwQkFBMEIsR0FBRztJQUMvQixPQUNFLEtBQUtGLFdBQUwsQ0FBaUJHLHVCQUFqQixJQUNDLEdBQUUsS0FBSzlHLGVBQWdCLHNDQUYxQjtFQUlEOztFQUVxQixJQUFsQitHLGtCQUFrQixHQUFHO0lBQ3ZCLE9BQ0UsS0FBS0osV0FBTCxDQUFpQkssZUFBakIsSUFBcUMsR0FBRSxLQUFLaEgsZUFBZ0IsOEJBRDlEO0VBR0Q7O0VBRWtCLElBQWZpSCxlQUFlLEdBQUc7SUFDcEIsT0FBTyxLQUFLTixXQUFMLENBQWlCTyxZQUFqQixJQUFrQyxHQUFFLEtBQUtsSCxlQUFnQiwyQkFBaEU7RUFDRDs7RUFFd0IsSUFBckJtSCxxQkFBcUIsR0FBRztJQUMxQixPQUNFLEtBQUtSLFdBQUwsQ0FBaUJTLGtCQUFqQixJQUNDLEdBQUUsS0FBS3BILGVBQWdCLGlDQUYxQjtFQUlEOztFQUVvQixJQUFqQnFILGlCQUFpQixHQUFHO0lBQ3RCLE9BQU8sS0FBS1YsV0FBTCxDQUFpQlcsY0FBakIsSUFBb0MsR0FBRSxLQUFLdEgsZUFBZ0IsdUJBQWxFO0VBQ0Q7O0VBRTBCLElBQXZCdUgsdUJBQXVCLEdBQUc7SUFDNUIsT0FDRSxLQUFLWixXQUFMLENBQWlCYSxpQkFBakIsSUFDQyxHQUFFLEtBQUt4SCxlQUFnQixJQUFHLEtBQUtnRSxhQUFjLElBQUcsS0FBS3pGLGFBQWMseUJBRnRFO0VBSUQ7O0VBRTBCLElBQXZCa0osdUJBQXVCLEdBQUc7SUFDNUIsT0FDRSxLQUFLZCxXQUFMLENBQWlCZSxvQkFBakIsSUFDQyxHQUFFLEtBQUsxSCxlQUFnQixtQ0FGMUI7RUFJRDs7RUFFZ0IsSUFBYjJILGFBQWEsR0FBRztJQUNsQixPQUFPLEtBQUtoQixXQUFMLENBQWlCZ0IsYUFBeEI7RUFDRDs7RUFFaUIsSUFBZEMsY0FBYyxHQUFHO0lBQ25CLE9BQ0UsS0FBS2pCLFdBQUwsQ0FBaUJrQixlQUFqQixJQUNDLEdBQUUsS0FBSzdILGVBQWdCLElBQUcsS0FBS2dFLGFBQWMsSUFBRyxLQUFLekYsYUFBYyxlQUZ0RTtFQUlELENBamhCaUIsQ0FtaEJsQjtFQUNBOzs7RUFDaUIsSUFBYnlGLGFBQWEsR0FBRztJQUNsQixPQUFPLEtBQUtsRCxLQUFMLElBQWMsS0FBS0EsS0FBTCxDQUFXeUMsWUFBekIsSUFBeUMsS0FBS3pDLEtBQUwsQ0FBV2tELGFBQXBELEdBQ0gsS0FBS2xELEtBQUwsQ0FBV2tELGFBRFIsR0FFSCxNQUZKO0VBR0Q7O0FBemhCaUI7OztlQTRoQkwzRixNOztBQUNmeUosTUFBTSxDQUFDQyxPQUFQLEdBQWlCMUosTUFBakIifQ==