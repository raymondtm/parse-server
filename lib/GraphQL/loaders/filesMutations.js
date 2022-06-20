"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.handleUpload = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _links = require("@graphql-tools/links");

var _node = _interopRequireDefault(require("parse/node"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _logger = _interopRequireDefault(require("../../logger"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const handleUpload = async (upload, config) => {
  const {
    createReadStream,
    filename,
    mimetype
  } = await upload;
  let data = null;

  if (createReadStream) {
    const stream = createReadStream();
    data = await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('error', reject).on('data', chunk => chunks.push(chunk)).on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  if (!data || !data.length) {
    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  }

  if (filename.length > 128) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
  }

  if (!filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
    throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
  }

  try {
    return {
      fileInfo: await config.filesController.createFile(config, filename, data, mimetype)
    };
  } catch (e) {
    _logger.default.error('Error creating a file: ', e);

    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`);
  }
};

exports.handleUpload = handleUpload;

const load = parseGraphQLSchema => {
  const createMutation = (0, _graphqlRelay.mutationWithClientMutationId)({
    name: 'CreateFile',
    description: 'The createFile mutation can be used to create and upload a new file.',
    inputFields: {
      upload: {
        description: 'This is the new file to be created and uploaded.',
        type: new _graphql.GraphQLNonNull(_links.GraphQLUpload)
      }
    },
    outputFields: {
      fileInfo: {
        description: 'This is the created file info.',
        type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.FILE_INFO)
      }
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const {
          upload
        } = args;
        const {
          config
        } = context;
        return handleUpload(upload, config);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }
  });
  parseGraphQLSchema.addGraphQLType(createMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(createMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('createFile', createMutation, true, true);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJoYW5kbGVVcGxvYWQiLCJ1cGxvYWQiLCJjb25maWciLCJjcmVhdGVSZWFkU3RyZWFtIiwiZmlsZW5hbWUiLCJtaW1ldHlwZSIsImRhdGEiLCJzdHJlYW0iLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlamVjdCIsImNodW5rcyIsIm9uIiwiY2h1bmsiLCJwdXNoIiwiQnVmZmVyIiwiY29uY2F0IiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsIklOVkFMSURfRklMRV9OQU1FIiwibWF0Y2giLCJmaWxlSW5mbyIsImZpbGVzQ29udHJvbGxlciIsImNyZWF0ZUZpbGUiLCJlIiwibG9nZ2VyIiwiZXJyb3IiLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwiY3JlYXRlTXV0YXRpb24iLCJtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkIiwibmFtZSIsImRlc2NyaXB0aW9uIiwiaW5wdXRGaWVsZHMiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMVXBsb2FkIiwib3V0cHV0RmllbGRzIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkZJTEVfSU5GTyIsIm11dGF0ZUFuZEdldFBheWxvYWQiLCJhcmdzIiwiY29udGV4dCIsImhhbmRsZUVycm9yIiwiYWRkR3JhcGhRTFR5cGUiLCJpbnB1dCIsIm9mVHlwZSIsImFkZEdyYXBoUUxNdXRhdGlvbiJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IG11dGF0aW9uV2l0aENsaWVudE11dGF0aW9uSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdAZ3JhcGhxbC10b29scy9saW5rcyc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uL2xvZ2dlcic7XG5cbmNvbnN0IGhhbmRsZVVwbG9hZCA9IGFzeW5jICh1cGxvYWQsIGNvbmZpZykgPT4ge1xuICBjb25zdCB7IGNyZWF0ZVJlYWRTdHJlYW0sIGZpbGVuYW1lLCBtaW1ldHlwZSB9ID0gYXdhaXQgdXBsb2FkO1xuICBsZXQgZGF0YSA9IG51bGw7XG4gIGlmIChjcmVhdGVSZWFkU3RyZWFtKSB7XG4gICAgY29uc3Qgc3RyZWFtID0gY3JlYXRlUmVhZFN0cmVhbSgpO1xuICAgIGRhdGEgPSBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICBjb25zdCBjaHVua3MgPSBbXTtcbiAgICAgIHN0cmVhbVxuICAgICAgICAub24oJ2Vycm9yJywgcmVqZWN0KVxuICAgICAgICAub24oJ2RhdGEnLCBjaHVuayA9PiBjaHVua3MucHVzaChjaHVuaykpXG4gICAgICAgIC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShCdWZmZXIuY29uY2F0KGNodW5rcykpKTtcbiAgICB9KTtcbiAgfVxuXG4gIGlmICghZGF0YSB8fCAhZGF0YS5sZW5ndGgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCAnSW52YWxpZCBmaWxlIHVwbG9hZC4nKTtcbiAgfVxuXG4gIGlmIChmaWxlbmFtZS5sZW5ndGggPiAxMjgpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsICdGaWxlbmFtZSB0b28gbG9uZy4nKTtcbiAgfVxuXG4gIGlmICghZmlsZW5hbWUubWF0Y2goL15bX2EtekEtWjAtOV1bYS16QS1aMC05QFxcLlxcIH5fLV0qJC8pKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLCAnRmlsZW5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzLicpO1xuICB9XG5cbiAgdHJ5IHtcbiAgICByZXR1cm4ge1xuICAgICAgZmlsZUluZm86IGF3YWl0IGNvbmZpZy5maWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShjb25maWcsIGZpbGVuYW1lLCBkYXRhLCBtaW1ldHlwZSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLCBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmApO1xuICB9XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgY29uc3QgY3JlYXRlTXV0YXRpb24gPSBtdXRhdGlvbldpdGhDbGllbnRNdXRhdGlvbklkKHtcbiAgICBuYW1lOiAnQ3JlYXRlRmlsZScsXG4gICAgZGVzY3JpcHRpb246ICdUaGUgY3JlYXRlRmlsZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYW5kIHVwbG9hZCBhIG5ldyBmaWxlLicsXG4gICAgaW5wdXRGaWVsZHM6IHtcbiAgICAgIHVwbG9hZDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG5ldyBmaWxlIHRvIGJlIGNyZWF0ZWQgYW5kIHVwbG9hZGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMVXBsb2FkKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBvdXRwdXRGaWVsZHM6IHtcbiAgICAgIGZpbGVJbmZvOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY3JlYXRlZCBmaWxlIGluZm8uJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9JTkZPKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBtdXRhdGVBbmRHZXRQYXlsb2FkOiBhc3luYyAoYXJncywgY29udGV4dCkgPT4ge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1cGxvYWQgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnIH0gPSBjb250ZXh0O1xuICAgICAgICByZXR1cm4gaGFuZGxlVXBsb2FkKHVwbG9hZCwgY29uZmlnKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShjcmVhdGVNdXRhdGlvbi5hcmdzLmlucHV0LnR5cGUub2ZUeXBlLCB0cnVlLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKGNyZWF0ZU11dGF0aW9uLnR5cGUsIHRydWUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTE11dGF0aW9uKCdjcmVhdGVGaWxlJywgY3JlYXRlTXV0YXRpb24sIHRydWUsIHRydWUpO1xufTtcblxuZXhwb3J0IHsgbG9hZCwgaGFuZGxlVXBsb2FkIH07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7QUFFQSxNQUFNQSxZQUFZLEdBQUcsT0FBT0MsTUFBUCxFQUFlQyxNQUFmLEtBQTBCO0VBQzdDLE1BQU07SUFBRUMsZ0JBQUY7SUFBb0JDLFFBQXBCO0lBQThCQztFQUE5QixJQUEyQyxNQUFNSixNQUF2RDtFQUNBLElBQUlLLElBQUksR0FBRyxJQUFYOztFQUNBLElBQUlILGdCQUFKLEVBQXNCO0lBQ3BCLE1BQU1JLE1BQU0sR0FBR0osZ0JBQWdCLEVBQS9CO0lBQ0FHLElBQUksR0FBRyxNQUFNLElBQUlFLE9BQUosQ0FBWSxDQUFDQyxP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