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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9Db25maWcuanMiXSwibmFtZXMiOlsicmVtb3ZlVHJhaWxpbmdTbGFzaCIsInN0ciIsImVuZHNXaXRoIiwic3Vic3RyIiwibGVuZ3RoIiwiQ29uZmlnIiwiZ2V0IiwiYXBwbGljYXRpb25JZCIsIm1vdW50IiwiY2FjaGVJbmZvIiwiQXBwQ2FjaGUiLCJjb25maWciLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImtleSIsImRhdGFiYXNlIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiZGF0YWJhc2VDb250cm9sbGVyIiwiYWRhcHRlciIsImdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdCIsImJpbmQiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJwdXQiLCJzZXJ2ZXJDb25maWd1cmF0aW9uIiwidmFsaWRhdGUiLCJhcHBJZCIsInNldHVwUGFzc3dvcmRWYWxpZGF0b3IiLCJwYXNzd29yZFBvbGljeSIsInZlcmlmeVVzZXJFbWFpbHMiLCJ1c2VyQ29udHJvbGxlciIsImFwcE5hbWUiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJtYXhMaW1pdCIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiYWNjb3VudExvY2tvdXQiLCJtYXN0ZXJLZXlJcHMiLCJtYXN0ZXJLZXkiLCJyZWFkT25seU1hc3RlcktleSIsImFsbG93SGVhZGVycyIsImlkZW1wb3RlbmN5T3B0aW9ucyIsImVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQiLCJmaWxlVXBsb2FkIiwicGFnZXMiLCJzZWN1cml0eSIsImVuZm9yY2VQcml2YXRlVXNlcnMiLCJzY2hlbWEiLCJyZXF1ZXN0S2V5d29yZERlbnlsaXN0IiwiRXJyb3IiLCJlbWFpbEFkYXB0ZXIiLCJ2YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbiIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVNYXN0ZXJLZXlJcHMiLCJ2YWxpZGF0ZU1heExpbWl0IiwidmFsaWRhdGVBbGxvd0hlYWRlcnMiLCJ2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyIsInZhbGlkYXRlUGFnZXNPcHRpb25zIiwidmFsaWRhdGVTZWN1cml0eU9wdGlvbnMiLCJ2YWxpZGF0ZVNjaGVtYU9wdGlvbnMiLCJ2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMiLCJ2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QiLCJ1bmRlZmluZWQiLCJkZWZhdWx0IiwiQXJyYXkiLCJpc0FycmF5IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZW5hYmxlQ2hlY2siLCJTZWN1cml0eU9wdGlvbnMiLCJlbmFibGVDaGVja0xvZyIsImRlZmluaXRpb25zIiwiU2NoZW1hT3B0aW9ucyIsInN0cmljdCIsImRlbGV0ZUV4dHJhRmllbGRzIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImxvY2tTY2hlbWFzIiwiYmVmb3JlTWlncmF0aW9uIiwiYWZ0ZXJNaWdyYXRpb24iLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIiwicGxhY2Vob2xkZXJzIiwiZm9yY2VSZWRpcmVjdCIsInBhZ2VzUGF0aCIsInBhZ2VzRW5kcG9pbnQiLCJjdXN0b21VcmxzIiwiY3VzdG9tUm91dGVzIiwidHRsIiwiSWRlbXBvdGVuY3lPcHRpb25zIiwiaXNOYU4iLCJwYXRocyIsImR1cmF0aW9uIiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwidGhyZXNob2xkIiwidW5sb2NrT25QYXNzd29yZFJlc2V0IiwiQWNjb3VudExvY2tvdXRPcHRpb25zIiwibWF4UGFzc3dvcmRBZ2UiLCJyZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiIsInZhbGlkYXRvclBhdHRlcm4iLCJSZWdFeHAiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsInJlc2V0VG9rZW5SZXVzZUlmVmFsaWQiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsdWUiLCJ0ZXN0IiwiZSIsIlJlZmVyZW5jZUVycm9yIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZpbGVVcGxvYWRPcHRpb25zIiwiZW5hYmxlRm9yUHVibGljIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJpcCIsIm5ldCIsImlzSVAiLCJfbW91bnQiLCJuZXdWYWx1ZSIsImluY2x1ZGVzIiwiaGVhZGVyIiwidHJpbSIsIm5vdyIsIkRhdGUiLCJnZXRUaW1lIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCJpbnZhbGlkTGlua1VSTCIsImN1c3RvbVBhZ2VzIiwiaW52YWxpZExpbmsiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCIsImludmFsaWRWZXJpZmljYXRpb25MaW5rIiwibGlua1NlbmRTdWNjZXNzVVJMIiwibGlua1NlbmRTdWNjZXNzIiwibGlua1NlbmRGYWlsVVJMIiwibGlua1NlbmRGYWlsIiwidmVyaWZ5RW1haWxTdWNjZXNzVVJMIiwidmVyaWZ5RW1haWxTdWNjZXNzIiwiY2hvb3NlUGFzc3dvcmRVUkwiLCJjaG9vc2VQYXNzd29yZCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwicmVzZXRQYXNzd29yZExpbmsiLCJwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzIiwicGFyc2VGcmFtZVVSTCIsInZlcmlmeUVtYWlsVVJMIiwidmVyaWZ5RW1haWxMaW5rIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUlB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QWMsSUFBRyxLQUFLdkYsYUFBYyxlQUEvRztBQUNELEdBM2dCaUIsQ0E2Z0JsQjtBQUNBOzs7QUFDaUIsTUFBYnVGLGFBQWEsR0FBRztBQUNsQixXQUFPLEtBQUtoRCxLQUFMLElBQWMsS0FBS0EsS0FBTCxDQUFXd0MsWUFBekIsSUFBeUMsS0FBS3hDLEtBQUwsQ0FBV2dELGFBQXBELEdBQ0gsS0FBS2hELEtBQUwsQ0FBV2dELGFBRFIsR0FFSCxNQUZKO0FBR0Q7O0FBbmhCaUI7OztlQXNoQkx6RixNOztBQUNmdUosTUFBTSxDQUFDQyxPQUFQLEdBQWlCeEosTUFBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIENvbmZpZyBvYmplY3QgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgaG93IGEgc3BlY2lmaWMgYXBwIGlzXG4vLyBjb25maWd1cmVkLlxuLy8gbW91bnQgaXMgdGhlIFVSTCBmb3IgdGhlIHJvb3Qgb2YgdGhlIEFQSTsgaW5jbHVkZXMgaHR0cCwgZG9tYWluLCBldGMuXG5cbmltcG9ydCBBcHBDYWNoZSBmcm9tICcuL2NhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHtcbiAgSWRlbXBvdGVuY3lPcHRpb25zLFxuICBGaWxlVXBsb2FkT3B0aW9ucyxcbiAgQWNjb3VudExvY2tvdXRPcHRpb25zLFxuICBQYWdlc09wdGlvbnMsXG4gIFNlY3VyaXR5T3B0aW9ucyxcbiAgU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IGlzQm9vbGVhbiwgaXNTdHJpbmcgfSBmcm9tICdsb2Rhc2gnO1xuXG5mdW5jdGlvbiByZW1vdmVUcmFpbGluZ1NsYXNoKHN0cikge1xuICBpZiAoIXN0cikge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbiAgaWYgKHN0ci5lbmRzV2l0aCgnLycpKSB7XG4gICAgc3RyID0gc3RyLnN1YnN0cigwLCBzdHIubGVuZ3RoIC0gMSk7XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZyB7XG4gIHN0YXRpYyBnZXQoYXBwbGljYXRpb25JZDogc3RyaW5nLCBtb3VudDogc3RyaW5nKSB7XG4gICAgY29uc3QgY2FjaGVJbmZvID0gQXBwQ2FjaGUuZ2V0KGFwcGxpY2F0aW9uSWQpO1xuICAgIGlmICghY2FjaGVJbmZvKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWcoKTtcbiAgICBjb25maWcuYXBwbGljYXRpb25JZCA9IGFwcGxpY2F0aW9uSWQ7XG4gICAgT2JqZWN0LmtleXMoY2FjaGVJbmZvKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoa2V5ID09ICdkYXRhYmFzZUNvbnRyb2xsZXInKSB7XG4gICAgICAgIGNvbmZpZy5kYXRhYmFzZSA9IG5ldyBEYXRhYmFzZUNvbnRyb2xsZXIoY2FjaGVJbmZvLmRhdGFiYXNlQ29udHJvbGxlci5hZGFwdGVyLCBjb25maWcpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uZmlnW2tleV0gPSBjYWNoZUluZm9ba2V5XTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25maWcubW91bnQgPSByZW1vdmVUcmFpbGluZ1NsYXNoKG1vdW50KTtcbiAgICBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlU2Vzc2lvbkV4cGlyZXNBdC5iaW5kKGNvbmZpZyk7XG4gICAgY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQuYmluZChcbiAgICAgIGNvbmZpZ1xuICAgICk7XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZShzZXJ2ZXJDb25maWd1cmF0aW9uKTtcbiAgICBBcHBDYWNoZS5wdXQoc2VydmVyQ29uZmlndXJhdGlvbi5hcHBJZCwgc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnNldHVwUGFzc3dvcmRWYWxpZGF0b3Ioc2VydmVyQ29uZmlndXJhdGlvbi5wYXNzd29yZFBvbGljeSk7XG4gICAgcmV0dXJuIHNlcnZlckNvbmZpZ3VyYXRpb247XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGUoe1xuICAgIHZlcmlmeVVzZXJFbWFpbHMsXG4gICAgdXNlckNvbnRyb2xsZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgcmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCxcbiAgICBleHBpcmVJbmFjdGl2ZVNlc3Npb25zLFxuICAgIHNlc3Npb25MZW5ndGgsXG4gICAgbWF4TGltaXQsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgYWNjb3VudExvY2tvdXQsXG4gICAgcGFzc3dvcmRQb2xpY3ksXG4gICAgbWFzdGVyS2V5SXBzLFxuICAgIG1hc3RlcktleSxcbiAgICByZWFkT25seU1hc3RlcktleSxcbiAgICBhbGxvd0hlYWRlcnMsXG4gICAgaWRlbXBvdGVuY3lPcHRpb25zLFxuICAgIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgICBlbmZvcmNlUHJpdmF0ZVVzZXJzLFxuICAgIHNjaGVtYSxcbiAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0LFxuICB9KSB7XG4gICAgaWYgKG1hc3RlcktleSA9PT0gcmVhZE9ubHlNYXN0ZXJLZXkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWFzdGVyS2V5IGFuZCByZWFkT25seU1hc3RlcktleSBzaG91bGQgYmUgZGlmZmVyZW50Jyk7XG4gICAgfVxuXG4gICAgY29uc3QgZW1haWxBZGFwdGVyID0gdXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgICBpZiAodmVyaWZ5VXNlckVtYWlscykge1xuICAgICAgdGhpcy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcixcbiAgICAgICAgYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCk7XG4gICAgdGhpcy52YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KTtcbiAgICB0aGlzLnZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCk7XG5cbiAgICBpZiAodHlwZW9mIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ3Jldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmIChwdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIGlmICghcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSAmJiAhcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgdGhyb3cgJ3B1YmxpY1NlcnZlclVSTCBzaG91bGQgYmUgYSB2YWxpZCBIVFRQUyBVUkwgc3RhcnRpbmcgd2l0aCBodHRwczovLyc7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlTWFzdGVyS2V5SXBzKG1hc3RlcktleUlwcyk7XG4gICAgdGhpcy52YWxpZGF0ZU1heExpbWl0KG1heExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dIZWFkZXJzKGFsbG93SGVhZGVycyk7XG4gICAgdGhpcy52YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpO1xuICAgIHRoaXMudmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpO1xuICAgIHRoaXMudmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpO1xuICAgIHRoaXMudmFsaWRhdGVTY2hlbWFPcHRpb25zKHNjaGVtYSk7XG4gICAgdGhpcy52YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycyk7XG4gICAgdGhpcy52YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCk7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSZXF1ZXN0S2V5d29yZERlbnlsaXN0KHJlcXVlc3RLZXl3b3JkRGVueWxpc3QpIHtcbiAgICBpZiAocmVxdWVzdEtleXdvcmREZW55bGlzdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0ID0gcmVxdWVzdEtleXdvcmREZW55bGlzdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkocmVxdWVzdEtleXdvcmREZW55bGlzdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUVuZm9yY2VQcml2YXRlVXNlcnMoZW5mb3JjZVByaXZhdGVVc2Vycykge1xuICAgIGlmICh0eXBlb2YgZW5mb3JjZVByaXZhdGVVc2VycyAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBlbmZvcmNlUHJpdmF0ZVVzZXJzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2VjdXJpdHlPcHRpb25zKHNlY3VyaXR5KSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChzZWN1cml0eSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2sgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2suZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2spKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVjayBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cgPSBTZWN1cml0eU9wdGlvbnMuZW5hYmxlQ2hlY2tMb2cuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2VjdXJpdHkuZW5hYmxlQ2hlY2tMb2cpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzZWN1cml0eS5lbmFibGVDaGVja0xvZyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hOiBTY2hlbWFPcHRpb25zKSB7XG4gICAgaWYgKCFzY2hlbWEpIHJldHVybjtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNjaGVtYSkgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWZpbml0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVmaW5pdGlvbnMgPSBTY2hlbWFPcHRpb25zLmRlZmluaXRpb25zLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShzY2hlbWEuZGVmaW5pdGlvbnMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuZGVmaW5pdGlvbnMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnN0cmljdCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuc3RyaWN0ID0gU2NoZW1hT3B0aW9ucy5zdHJpY3QuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnN0cmljdCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5zdHJpY3QgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuZGVsZXRlRXh0cmFGaWVsZHMgPSBTY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPSBTY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmxvY2tTY2hlbWFzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5sb2NrU2NoZW1hcyA9IFNjaGVtYU9wdGlvbnMubG9ja1NjaGVtYXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmxvY2tTY2hlbWFzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmxvY2tTY2hlbWFzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gbnVsbCAmJiB0eXBlb2Ygc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gPSBudWxsO1xuICAgIH0gZWxzZSBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVQYWdlc09wdGlvbnMocGFnZXMpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5lbmFibGVSb3V0ZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZW5hYmxlUm91dGVyID0gUGFnZXNPcHRpb25zLmVuYWJsZVJvdXRlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5lbmFibGVSb3V0ZXIpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5lbmFibGVSb3V0ZXIgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVMb2NhbGl6YXRpb24gPSBQYWdlc09wdGlvbnMuZW5hYmxlTG9jYWxpemF0aW9uLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uSnNvblBhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlID0gUGFnZXNPcHRpb25zLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNTdHJpbmcocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wbGFjZWhvbGRlcnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGxhY2Vob2xkZXJzID0gUGFnZXNPcHRpb25zLnBsYWNlaG9sZGVycy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMucGxhY2Vob2xkZXJzKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScgJiZcbiAgICAgIHR5cGVvZiBwYWdlcy5wbGFjZWhvbGRlcnMgIT09ICdmdW5jdGlvbidcbiAgICApIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBsYWNlaG9sZGVycyBtdXN0IGJlIGFuIG9iamVjdCBvciBhIGZ1bmN0aW9uLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5mb3JjZVJlZGlyZWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmZvcmNlUmVkaXJlY3QgPSBQYWdlc09wdGlvbnMuZm9yY2VSZWRpcmVjdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihwYWdlcy5mb3JjZVJlZGlyZWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZm9yY2VSZWRpcmVjdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNQYXRoID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzUGF0aCA9IFBhZ2VzT3B0aW9ucy5wYWdlc1BhdGguZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc1BhdGgpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc1BhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMucGFnZXNFbmRwb2ludCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wYWdlc0VuZHBvaW50ID0gUGFnZXNPcHRpb25zLnBhZ2VzRW5kcG9pbnQuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5wYWdlc0VuZHBvaW50KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGFnZXNFbmRwb2ludCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21VcmxzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVVybHMgPSBQYWdlc09wdGlvbnMuY3VzdG9tVXJscy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHBhZ2VzLmN1c3RvbVVybHMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuY3VzdG9tVXJscyBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuY3VzdG9tUm91dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmN1c3RvbVJvdXRlcyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21Sb3V0ZXMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEocGFnZXMuY3VzdG9tUm91dGVzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21Sb3V0ZXMgbXVzdCBiZSBhbiBhcnJheS4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUlkZW1wb3RlbmN5T3B0aW9ucyhpZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICBpZiAoIWlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMudHRsID0gSWRlbXBvdGVuY3lPcHRpb25zLnR0bC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzTmFOKGlkZW1wb3RlbmN5T3B0aW9ucy50dGwpICYmIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPD0gMCkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwIHNlY29uZHMnO1xuICAgIH0gZWxzZSBpZiAoaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBUVEwgdmFsdWUgbXVzdCBiZSBhIG51bWJlcic7XG4gICAgfVxuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzKSB7XG4gICAgICBpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgPSBJZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCEoaWRlbXBvdGVuY3lPcHRpb25zLnBhdGhzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgcGF0aHMgbXVzdCBiZSBvZiBhbiBhcnJheSBvZiBzdHJpbmdzJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCkge1xuICAgIGlmIChhY2NvdW50TG9ja291dCkge1xuICAgICAgaWYgKFxuICAgICAgICB0eXBlb2YgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LmR1cmF0aW9uIDw9IDAgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPiA5OTk5OVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdBY2NvdW50IGxvY2tvdXQgZHVyYXRpb24gc2hvdWxkIGJlIGdyZWF0ZXIgdGhhbiAwIGFuZCBsZXNzIHRoYW4gMTAwMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihhY2NvdW50TG9ja291dC50aHJlc2hvbGQpIHx8XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCA8IDEgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkID4gOTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCB0aHJlc2hvbGQgc2hvdWxkIGJlIGFuIGludGVnZXIgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwJztcbiAgICAgIH1cblxuICAgICAgaWYgKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCA9IEFjY291bnRMb2Nrb3V0T3B0aW9ucy51bmxvY2tPblBhc3N3b3JkUmVzZXQuZGVmYXVsdDtcbiAgICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihhY2NvdW50TG9ja291dC51bmxvY2tPblBhc3N3b3JkUmVzZXQpKSB7XG4gICAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KSB7XG4gICAgaWYgKHBhc3N3b3JkUG9saWN5KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSAhPT0gJ251bWJlcicgfHwgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgPCAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gIT09ICdudW1iZXInIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMClcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcic7XG4gICAgICB9XG5cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICAgIGlmICh0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID0gbmV3IFJlZ0V4cChwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKTtcbiAgICAgICAgfSBlbHNlIGlmICghKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaW5zdGFuY2VvZiBSZWdFeHApKSB7XG4gICAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gbXVzdCBiZSBhIHJlZ2V4IHN0cmluZyBvciBSZWdFeHAgb2JqZWN0Lic7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgICB0eXBlb2YgcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgIT09ICdmdW5jdGlvbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yQ2FsbGJhY2sgbXVzdCBiZSBhIGZ1bmN0aW9uLic7XG4gICAgICB9XG5cbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUuJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgJiZcbiAgICAgICAgKCFOdW1iZXIuaXNJbnRlZ2VyKHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSkgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgPD0gMCB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA+IDIwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgbXVzdCBiZSBhbiBpbnRlZ2VyIHJhbmdpbmcgMCAtIDIwJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgICBpZiAocGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblJldXNlSWZWYWxpZCAmJiAhcGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIHJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCByZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlTWFzdGVyS2V5SXBzKG1hc3RlcktleUlwcykge1xuICAgIGZvciAoY29uc3QgaXAgb2YgbWFzdGVyS2V5SXBzKSB7XG4gICAgICBpZiAoIW5ldC5pc0lQKGlwKSkge1xuICAgICAgICB0aHJvdyBgSW52YWxpZCBpcCBpbiBtYXN0ZXJLZXlJcHM6ICR7aXB9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgbW91bnQoKSB7XG4gICAgdmFyIG1vdW50ID0gdGhpcy5fbW91bnQ7XG4gICAgaWYgKHRoaXMucHVibGljU2VydmVyVVJMKSB7XG4gICAgICBtb3VudCA9IHRoaXMucHVibGljU2VydmVyVVJMO1xuICAgIH1cbiAgICByZXR1cm4gbW91bnQ7XG4gIH1cblxuICBzZXQgbW91bnQobmV3VmFsdWUpIHtcbiAgICB0aGlzLl9tb3VudCA9IG5ld1ZhbHVlO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2Vzc2lvbkNvbmZpZ3VyYXRpb24oc2Vzc2lvbkxlbmd0aCwgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgIGlmIChleHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICBpZiAoaXNOYU4oc2Vzc2lvbkxlbmd0aCkpIHtcbiAgICAgICAgdGhyb3cgJ1Nlc3Npb24gbGVuZ3RoIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoc2Vzc2lvbkxlbmd0aCA8PSAwKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5yZXNldFBhc3N3b3JkTGluayB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS9yZXF1ZXN0X3Bhc3N3b3JkX3Jlc2V0YDtcbiAgfVxuXG4gIGdldCBwYXNzd29yZFJlc2V0U3VjY2Vzc1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5wYXNzd29yZFJlc2V0U3VjY2VzcyB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvcGFzc3dvcmRfcmVzZXRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgcGFyc2VGcmFtZVVSTCgpIHtcbiAgICByZXR1cm4gdGhpcy5jdXN0b21QYWdlcy5wYXJzZUZyYW1lVVJMO1xuICB9XG5cbiAgZ2V0IHZlcmlmeUVtYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLnZlcmlmeUVtYWlsTGluayB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vJHt0aGlzLnBhZ2VzRW5kcG9pbnR9LyR7dGhpcy5hcHBsaWNhdGlvbklkfS92ZXJpZnlfZW1haWxgO1xuICB9XG5cbiAgLy8gVE9ETzogUmVtb3ZlIHRoaXMgZnVuY3Rpb24gb25jZSBQYWdlc1JvdXRlciByZXBsYWNlcyB0aGUgUHVibGljQVBJUm91dGVyO1xuICAvLyB0aGUgKGRlZmF1bHQpIGVuZHBvaW50IGhhcyB0byBiZSBkZWZpbmVkIGluIFBhZ2VzUm91dGVyIG9ubHkuXG4gIGdldCBwYWdlc0VuZHBvaW50KCkge1xuICAgIHJldHVybiB0aGlzLnBhZ2VzICYmIHRoaXMucGFnZXMuZW5hYmxlUm91dGVyICYmIHRoaXMucGFnZXMucGFnZXNFbmRwb2ludFxuICAgICAgPyB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgIDogJ2FwcHMnO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbmZpZztcbm1vZHVsZS5leHBvcnRzID0gQ29uZmlnO1xuIl19