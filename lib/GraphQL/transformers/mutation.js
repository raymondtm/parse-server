"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.transformTypes = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _graphqlRelay = require("graphql-relay");

var _filesMutations = require("../loaders/filesMutations");

var defaultGraphQLTypes = _interopRequireWildcard(require("../loaders/defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("../helpers/objectsMutations"));

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const transformTypes = async (inputType, fields, {
  className,
  parseGraphQLSchema,
  req
}) => {
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    config: {
      isCreateEnabled,
      isUpdateEnabled
    }
  } = parseGraphQLSchema.parseClassTypes[className];
  const parseClass = parseGraphQLSchema.parseClasses.find(clazz => clazz.className === className);

  if (fields) {
    const classGraphQLCreateTypeFields = isCreateEnabled && classGraphQLCreateType ? classGraphQLCreateType.getFields() : null;
    const classGraphQLUpdateTypeFields = isUpdateEnabled && classGraphQLUpdateType ? classGraphQLUpdateType.getFields() : null;
    const promises = Object.keys(fields).map(async field => {
      let inputTypeField;

      if (inputType === 'create' && classGraphQLCreateTypeFields) {
        inputTypeField = classGraphQLCreateTypeFields[field];
      } else if (classGraphQLUpdateTypeFields) {
        inputTypeField = classGraphQLUpdateTypeFields[field];
      }

      if (inputTypeField) {
        switch (true) {
          case inputTypeField.type === defaultGraphQLTypes.GEO_POINT_INPUT:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }

            fields[field] = transformers.geoPoint(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.POLYGON_INPUT:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }

            fields[field] = transformers.polygon(fields[field]);
            break;

          case inputTypeField.type === defaultGraphQLTypes.FILE_INPUT:
            fields[field] = await transformers.file(fields[field], req);
            break;

          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;

          case parseClass.fields[field].type === 'Pointer':
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              break;
            }

            fields[field] = await transformers.pointer(parseClass.fields[field].targetClass, field, fields[field], parseGraphQLSchema, req);
            break;

          default:
            if (fields[field] === null) {
              fields[field] = {
                __op: 'Delete'
              };
              return;
            }

            break;
        }
      }
    });
    await Promise.all(promises);
    if (fields.ACL) fields.ACL = transformers.ACL(fields.ACL);
  }

  return fields;
};

exports.transformTypes = transformTypes;
const transformers = {
  file: async (input, {
    config
  }) => {
    if (input === null) {
      return {
        __op: 'Delete'
      };
    }

    const {
      file,
      upload
    } = input;

    if (upload) {
      const {
        fileInfo
      } = await (0, _filesMutations.handleUpload)(upload, config);
      return _objectSpread(_objectSpread({}, fileInfo), {}, {
        __type: 'File'
      });
    } else if (file && file.name) {
      return {
        name: file.name,
        __type: 'File',
        url: file.url
      };
    }

    throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
  },
  polygon: value => ({
    __type: 'Polygon',
    coordinates: value.map(geoPoint => [geoPoint.latitude, geoPoint.longitude])
  }),
  geoPoint: value => _objectSpread(_objectSpread({}, value), {}, {
    __type: 'GeoPoint'
  }),
  ACL: value => {
    const parseACL = {};

    if (value.public) {
      parseACL['*'] = {
        read: value.public.read,
        write: value.public.write
      };
    }

    if (value.users) {
      value.users.forEach(rule => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(rule.userId);

        if (globalIdObject.type === '_User') {
          rule.userId = globalIdObject.id;
        }

        parseACL[rule.userId] = {
          read: rule.read,
          write: rule.write
        };
      });
    }

    if (value.roles) {
      value.roles.forEach(rule => {
        parseACL[`role:${rule.roleName}`] = {
          read: rule.read,
          write: rule.write
        };
      });
    }

    return parseACL;
  },
  relation: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide at least one operation on the relation mutation of field ${field}`);
    const op = {
      __op: 'Batch',
      ops: []
    };
    let nestedObjectsToAdd = [];

    if (value.createAndAdd) {
      nestedObjectsToAdd = (await Promise.all(value.createAndAdd.map(async input => {
        const parseFields = await transformTypes('create', input, {
          className: targetClass,
          parseGraphQLSchema,
          req: {
            config,
            auth,
            info
          }
        });
        return objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      }))).map(object => ({
        __type: 'Pointer',
        className: targetClass,
        objectId: object.objectId
      }));
    }

    if (value.add || nestedObjectsToAdd.length > 0) {
      if (!value.add) value.add = [];
      value.add = value.add.map(input => {
        const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);

        if (globalIdObject.type === targetClass) {
          input = globalIdObject.id;
        }

        return {
          __type: 'Pointer',
          className: targetClass,
          objectId: input
        };
      });
      op.ops.push({
        __op: 'AddRelation',
        objects: [...value.add, ...nestedObjectsToAdd]
      });
    }

    if (value.remove) {
      op.ops.push({
        __op: 'RemoveRelation',
        objects: value.remove.map(input => {
          const globalIdObject = (0, _graphqlRelay.fromGlobalId)(input);

          if (globalIdObject.type === targetClass) {
            input = globalIdObject.id;
          }

          return {
            __type: 'Pointer',
            className: targetClass,
            objectId: input
          };
        })
      });
    }

    return op;
  },
  pointer: async (targetClass, field, value, parseGraphQLSchema, {
    config,
    auth,
    info
  }) => {
    if (Object.keys(value).length > 1 || Object.keys(value).length === 0) throw new _node.default.Error(_node.default.Error.INVALID_POINTER, `You need to provide link OR createLink on the pointer mutation of field ${field}`);
    let nestedObjectToAdd;

    if (value.createAndLink) {
      const parseFields = await transformTypes('create', value.createAndLink, {
        className: targetClass,
        parseGraphQLSchema,
        req: {
          config,
          auth,
          info
        }
      });
      nestedObjectToAdd = await objectsMutations.createObject(targetClass, parseFields, config, auth, info);
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: nestedObjectToAdd.objectId
      };
    }

    if (value.link) {
      let objectId = value.link;
      const globalIdObject = (0, _graphqlRelay.fromGlobalId)(objectId);

      if (globalIdObject.type === targetClass) {
        objectId = globalIdObject.id;
      }

      return {
        __type: 'Pointer',
        className: targetClass,
        objectId
      };
    }
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0cmFuc2Zvcm1UeXBlcyIsImlucHV0VHlwZSIsImZpZWxkcyIsImNsYXNzTmFtZSIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInJlcSIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGUiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlIiwiY29uZmlnIiwiaXNDcmVhdGVFbmFibGVkIiwiaXNVcGRhdGVFbmFibGVkIiwicGFyc2VDbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NlcyIsImZpbmQiLCJjbGF6eiIsImNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMiLCJnZXRGaWVsZHMiLCJjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzIiwicHJvbWlzZXMiLCJPYmplY3QiLCJrZXlzIiwibWFwIiwiZmllbGQiLCJpbnB1dFR5cGVGaWVsZCIsInR5cGUiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiR0VPX1BPSU5UX0lOUFVUIiwiX19vcCIsInRyYW5zZm9ybWVycyIsImdlb1BvaW50IiwiUE9MWUdPTl9JTlBVVCIsInBvbHlnb24iLCJGSUxFX0lOUFVUIiwiZmlsZSIsInJlbGF0aW9uIiwidGFyZ2V0Q2xhc3MiLCJwb2ludGVyIiwiUHJvbWlzZSIsImFsbCIsIkFDTCIsImlucHV0IiwidXBsb2FkIiwiZmlsZUluZm8iLCJoYW5kbGVVcGxvYWQiLCJfX3R5cGUiLCJuYW1lIiwidXJsIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsInZhbHVlIiwiY29vcmRpbmF0ZXMiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsInBhcnNlQUNMIiwicHVibGljIiwicmVhZCIsIndyaXRlIiwidXNlcnMiLCJmb3JFYWNoIiwicnVsZSIsImdsb2JhbElkT2JqZWN0IiwiZnJvbUdsb2JhbElkIiwidXNlcklkIiwiaWQiLCJyb2xlcyIsInJvbGVOYW1lIiwiYXV0aCIsImluZm8iLCJsZW5ndGgiLCJJTlZBTElEX1BPSU5URVIiLCJvcCIsIm9wcyIsIm5lc3RlZE9iamVjdHNUb0FkZCIsImNyZWF0ZUFuZEFkZCIsInBhcnNlRmllbGRzIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsIm9iamVjdCIsIm9iamVjdElkIiwiYWRkIiwicHVzaCIsIm9iamVjdHMiLCJyZW1vdmUiLCJuZXN0ZWRPYmplY3RUb0FkZCIsImNyZWF0ZUFuZExpbmsiLCJsaW5rIl0sInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0dyYXBoUUwvdHJhbnNmb3JtZXJzL211dGF0aW9uLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCB7IGZyb21HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgaGFuZGxlVXBsb2FkIH0gZnJvbSAnLi4vbG9hZGVycy9maWxlc011dGF0aW9ucyc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4uL2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4uL2hlbHBlcnMvb2JqZWN0c011dGF0aW9ucyc7XG5cbmNvbnN0IHRyYW5zZm9ybVR5cGVzID0gYXN5bmMgKFxuICBpbnB1dFR5cGU6ICdjcmVhdGUnIHwgJ3VwZGF0ZScsXG4gIGZpZWxkcyxcbiAgeyBjbGFzc05hbWUsIHBhcnNlR3JhcGhRTFNjaGVtYSwgcmVxIH1cbikgPT4ge1xuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlLFxuICAgIGNvbmZpZzogeyBpc0NyZWF0ZUVuYWJsZWQsIGlzVXBkYXRlRW5hYmxlZCB9LFxuICB9ID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1tjbGFzc05hbWVdO1xuICBjb25zdCBwYXJzZUNsYXNzID0gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3Nlcy5maW5kKGNsYXp6ID0+IGNsYXp6LmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgaWYgKGZpZWxkcykge1xuICAgIGNvbnN0IGNsYXNzR3JhcGhRTENyZWF0ZVR5cGVGaWVsZHMgPVxuICAgICAgaXNDcmVhdGVFbmFibGVkICYmIGNsYXNzR3JhcGhRTENyZWF0ZVR5cGUgPyBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlLmdldEZpZWxkcygpIDogbnVsbDtcbiAgICBjb25zdCBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzID1cbiAgICAgIGlzVXBkYXRlRW5hYmxlZCAmJiBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlID8gY2xhc3NHcmFwaFFMVXBkYXRlVHlwZS5nZXRGaWVsZHMoKSA6IG51bGw7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLm1hcChhc3luYyBmaWVsZCA9PiB7XG4gICAgICBsZXQgaW5wdXRUeXBlRmllbGQ7XG4gICAgICBpZiAoaW5wdXRUeXBlID09PSAnY3JlYXRlJyAmJiBjbGFzc0dyYXBoUUxDcmVhdGVUeXBlRmllbGRzKSB7XG4gICAgICAgIGlucHV0VHlwZUZpZWxkID0gY2xhc3NHcmFwaFFMQ3JlYXRlVHlwZUZpZWxkc1tmaWVsZF07XG4gICAgICB9IGVsc2UgaWYgKGNsYXNzR3JhcGhRTFVwZGF0ZVR5cGVGaWVsZHMpIHtcbiAgICAgICAgaW5wdXRUeXBlRmllbGQgPSBjbGFzc0dyYXBoUUxVcGRhdGVUeXBlRmllbGRzW2ZpZWxkXTtcbiAgICAgIH1cbiAgICAgIGlmIChpbnB1dFR5cGVGaWVsZCkge1xuICAgICAgICBzd2l0Y2ggKHRydWUpIHtcbiAgICAgICAgICBjYXNlIGlucHV0VHlwZUZpZWxkLnR5cGUgPT09IGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UX0lOUFVUOlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmaWVsZHNbZmllbGRdID0gdHJhbnNmb3JtZXJzLmdlb1BvaW50KGZpZWxkc1tmaWVsZF0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpbnB1dFR5cGVGaWVsZC50eXBlID09PSBkZWZhdWx0R3JhcGhRTFR5cGVzLlBPTFlHT05fSU5QVVQ6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSB0cmFuc2Zvcm1lcnMucG9seWdvbihmaWVsZHNbZmllbGRdKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIGNhc2UgaW5wdXRUeXBlRmllbGQudHlwZSA9PT0gZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lOUFVUOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5maWxlKGZpZWxkc1tmaWVsZF0sIHJlcSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUmVsYXRpb24nOlxuICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IGF3YWl0IHRyYW5zZm9ybWVycy5yZWxhdGlvbihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9pbnRlcic6XG4gICAgICAgICAgICBpZiAoZmllbGRzW2ZpZWxkXSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpZWxkc1tmaWVsZF0gPSBhd2FpdCB0cmFuc2Zvcm1lcnMucG9pbnRlcihcbiAgICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnRhcmdldENsYXNzLFxuICAgICAgICAgICAgICBmaWVsZCxcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSxcbiAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLFxuICAgICAgICAgICAgICByZXFcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgaWYgKGZpZWxkc1tmaWVsZF0gPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXSA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgaWYgKGZpZWxkcy5BQ0wpIGZpZWxkcy5BQ0wgPSB0cmFuc2Zvcm1lcnMuQUNMKGZpZWxkcy5BQ0wpO1xuICB9XG4gIHJldHVybiBmaWVsZHM7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1lcnMgPSB7XG4gIGZpbGU6IGFzeW5jIChpbnB1dCwgeyBjb25maWcgfSkgPT4ge1xuICAgIGlmIChpbnB1dCA9PT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICB9XG4gICAgY29uc3QgeyBmaWxlLCB1cGxvYWQgfSA9IGlucHV0O1xuICAgIGlmICh1cGxvYWQpIHtcbiAgICAgIGNvbnN0IHsgZmlsZUluZm8gfSA9IGF3YWl0IGhhbmRsZVVwbG9hZCh1cGxvYWQsIGNvbmZpZyk7XG4gICAgICByZXR1cm4geyAuLi5maWxlSW5mbywgX190eXBlOiAnRmlsZScgfTtcbiAgICB9IGVsc2UgaWYgKGZpbGUgJiYgZmlsZS5uYW1lKSB7XG4gICAgICByZXR1cm4geyBuYW1lOiBmaWxlLm5hbWUsIF9fdHlwZTogJ0ZpbGUnLCB1cmw6IGZpbGUudXJsIH07XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsICdJbnZhbGlkIGZpbGUgdXBsb2FkLicpO1xuICB9LFxuICBwb2x5Z29uOiB2YWx1ZSA9PiAoe1xuICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgIGNvb3JkaW5hdGVzOiB2YWx1ZS5tYXAoZ2VvUG9pbnQgPT4gW2dlb1BvaW50LmxhdGl0dWRlLCBnZW9Qb2ludC5sb25naXR1ZGVdKSxcbiAgfSksXG4gIGdlb1BvaW50OiB2YWx1ZSA9PiAoe1xuICAgIC4uLnZhbHVlLFxuICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgfSksXG4gIEFDTDogdmFsdWUgPT4ge1xuICAgIGNvbnN0IHBhcnNlQUNMID0ge307XG4gICAgaWYgKHZhbHVlLnB1YmxpYykge1xuICAgICAgcGFyc2VBQ0xbJyonXSA9IHtcbiAgICAgICAgcmVhZDogdmFsdWUucHVibGljLnJlYWQsXG4gICAgICAgIHdyaXRlOiB2YWx1ZS5wdWJsaWMud3JpdGUsXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAodmFsdWUudXNlcnMpIHtcbiAgICAgIHZhbHVlLnVzZXJzLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKHJ1bGUudXNlcklkKTtcbiAgICAgICAgaWYgKGdsb2JhbElkT2JqZWN0LnR5cGUgPT09ICdfVXNlcicpIHtcbiAgICAgICAgICBydWxlLnVzZXJJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICAgIHBhcnNlQUNMW3J1bGUudXNlcklkXSA9IHtcbiAgICAgICAgICByZWFkOiBydWxlLnJlYWQsXG4gICAgICAgICAgd3JpdGU6IHJ1bGUud3JpdGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHZhbHVlLnJvbGVzKSB7XG4gICAgICB2YWx1ZS5yb2xlcy5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICBwYXJzZUFDTFtgcm9sZToke3J1bGUucm9sZU5hbWV9YF0gPSB7XG4gICAgICAgICAgcmVhZDogcnVsZS5yZWFkLFxuICAgICAgICAgIHdyaXRlOiBydWxlLndyaXRlLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiBwYXJzZUFDTDtcbiAgfSxcbiAgcmVsYXRpb246IGFzeW5jICh0YXJnZXRDbGFzcywgZmllbGQsIHZhbHVlLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHsgY29uZmlnLCBhdXRoLCBpbmZvIH0pID0+IHtcbiAgICBpZiAoT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCA9PT0gMClcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9QT0lOVEVSLFxuICAgICAgICBgWW91IG5lZWQgdG8gcHJvdmlkZSBhdCBsZWFzdCBvbmUgb3BlcmF0aW9uIG9uIHRoZSByZWxhdGlvbiBtdXRhdGlvbiBvZiBmaWVsZCAke2ZpZWxkfWBcbiAgICAgICk7XG5cbiAgICBjb25zdCBvcCA9IHtcbiAgICAgIF9fb3A6ICdCYXRjaCcsXG4gICAgICBvcHM6IFtdLFxuICAgIH07XG4gICAgbGV0IG5lc3RlZE9iamVjdHNUb0FkZCA9IFtdO1xuXG4gICAgaWYgKHZhbHVlLmNyZWF0ZUFuZEFkZCkge1xuICAgICAgbmVzdGVkT2JqZWN0c1RvQWRkID0gKFxuICAgICAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgICAgICB2YWx1ZS5jcmVhdGVBbmRBZGQubWFwKGFzeW5jIGlucHV0ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHBhcnNlRmllbGRzID0gYXdhaXQgdHJhbnNmb3JtVHlwZXMoJ2NyZWF0ZScsIGlucHV0LCB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICByZXR1cm4gb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QodGFyZ2V0Q2xhc3MsIHBhcnNlRmllbGRzLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgICAgIH0pXG4gICAgICAgIClcbiAgICAgICkubWFwKG9iamVjdCA9PiAoe1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgb2JqZWN0SWQ6IG9iamVjdC5vYmplY3RJZCxcbiAgICAgIH0pKTtcbiAgICB9XG5cbiAgICBpZiAodmFsdWUuYWRkIHx8IG5lc3RlZE9iamVjdHNUb0FkZC5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAoIXZhbHVlLmFkZCkgdmFsdWUuYWRkID0gW107XG4gICAgICB2YWx1ZS5hZGQgPSB2YWx1ZS5hZGQubWFwKGlucHV0ID0+IHtcbiAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaW5wdXQpO1xuICAgICAgICBpZiAoZ2xvYmFsSWRPYmplY3QudHlwZSA9PT0gdGFyZ2V0Q2xhc3MpIHtcbiAgICAgICAgICBpbnB1dCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICBvYmplY3RJZDogaW5wdXQsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgICAgIG9wLm9wcy5wdXNoKHtcbiAgICAgICAgX19vcDogJ0FkZFJlbGF0aW9uJyxcbiAgICAgICAgb2JqZWN0czogWy4uLnZhbHVlLmFkZCwgLi4ubmVzdGVkT2JqZWN0c1RvQWRkXSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS5yZW1vdmUpIHtcbiAgICAgIG9wLm9wcy5wdXNoKHtcbiAgICAgICAgX19vcDogJ1JlbW92ZVJlbGF0aW9uJyxcbiAgICAgICAgb2JqZWN0czogdmFsdWUucmVtb3ZlLm1hcChpbnB1dCA9PiB7XG4gICAgICAgICAgY29uc3QgZ2xvYmFsSWRPYmplY3QgPSBmcm9tR2xvYmFsSWQoaW5wdXQpO1xuICAgICAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICAgICAgaW5wdXQgPSBnbG9iYWxJZE9iamVjdC5pZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgY2xhc3NOYW1lOiB0YXJnZXRDbGFzcyxcbiAgICAgICAgICAgIG9iamVjdElkOiBpbnB1dCxcbiAgICAgICAgICB9O1xuICAgICAgICB9KSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gb3A7XG4gIH0sXG4gIHBvaW50ZXI6IGFzeW5jICh0YXJnZXRDbGFzcywgZmllbGQsIHZhbHVlLCBwYXJzZUdyYXBoUUxTY2hlbWEsIHsgY29uZmlnLCBhdXRoLCBpbmZvIH0pID0+IHtcbiAgICBpZiAoT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCA+IDEgfHwgT2JqZWN0LmtleXModmFsdWUpLmxlbmd0aCA9PT0gMClcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9QT0lOVEVSLFxuICAgICAgICBgWW91IG5lZWQgdG8gcHJvdmlkZSBsaW5rIE9SIGNyZWF0ZUxpbmsgb24gdGhlIHBvaW50ZXIgbXV0YXRpb24gb2YgZmllbGQgJHtmaWVsZH1gXG4gICAgICApO1xuXG4gICAgbGV0IG5lc3RlZE9iamVjdFRvQWRkO1xuICAgIGlmICh2YWx1ZS5jcmVhdGVBbmRMaW5rKSB7XG4gICAgICBjb25zdCBwYXJzZUZpZWxkcyA9IGF3YWl0IHRyYW5zZm9ybVR5cGVzKCdjcmVhdGUnLCB2YWx1ZS5jcmVhdGVBbmRMaW5rLCB7XG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYSxcbiAgICAgICAgcmVxOiB7IGNvbmZpZywgYXV0aCwgaW5mbyB9LFxuICAgICAgfSk7XG4gICAgICBuZXN0ZWRPYmplY3RUb0FkZCA9IGF3YWl0IG9iamVjdHNNdXRhdGlvbnMuY3JlYXRlT2JqZWN0KFxuICAgICAgICB0YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VGaWVsZHMsXG4gICAgICAgIGNvbmZpZyxcbiAgICAgICAgYXV0aCxcbiAgICAgICAgaW5mb1xuICAgICAgKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6IHRhcmdldENsYXNzLFxuICAgICAgICBvYmplY3RJZDogbmVzdGVkT2JqZWN0VG9BZGQub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAodmFsdWUubGluaykge1xuICAgICAgbGV0IG9iamVjdElkID0gdmFsdWUubGluaztcbiAgICAgIGNvbnN0IGdsb2JhbElkT2JqZWN0ID0gZnJvbUdsb2JhbElkKG9iamVjdElkKTtcbiAgICAgIGlmIChnbG9iYWxJZE9iamVjdC50eXBlID09PSB0YXJnZXRDbGFzcykge1xuICAgICAgICBvYmplY3RJZCA9IGdsb2JhbElkT2JqZWN0LmlkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgIGNsYXNzTmFtZTogdGFyZ2V0Q2xhc3MsXG4gICAgICAgIG9iamVjdElkLFxuICAgICAgfTtcbiAgICB9XG4gIH0sXG59O1xuXG5leHBvcnQgeyB0cmFuc2Zvcm1UeXBlcyB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBRUEsTUFBTUEsY0FBYyxHQUFHLE9BQ3JCQyxTQURxQixFQUVyQkMsTUFGcUIsRUFHckI7RUFBRUMsU0FBRjtFQUFhQyxrQkFBYjtFQUFpQ0M7QUFBakMsQ0FIcUIsS0FJbEI7RUFDSCxNQUFNO0lBQ0pDLHNCQURJO0lBRUpDLHNCQUZJO0lBR0pDLE1BQU0sRUFBRTtNQUFFQyxlQUFGO01BQW1CQztJQUFuQjtFQUhKLElBSUZOLGtCQUFrQixDQUFDTyxlQUFuQixDQUFtQ1IsU0FBbkMsQ0FKSjtFQUtBLE1BQU1TLFVBQVUsR0FBR1Isa0JBQWtCLENBQUNTLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ0MsS0FBSyxJQUFJQSxLQUFLLENBQUNaLFNBQU4sS0FBb0JBLFNBQWxFLENBQW5COztFQUNBLElBQUlELE1BQUosRUFBWTtJQUNWLE1BQU1jLDRCQUE0QixHQUNoQ1AsZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDVyxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtJQUVBLE1BQU1DLDRCQUE0QixHQUNoQ1IsZUFBZSxJQUFJSCxzQkFBbkIsR0FBNENBLHNCQUFzQixDQUFDVSxTQUF2QixFQUE1QyxHQUFpRixJQURuRjtJQUVBLE1BQU1FLFFBQVEsR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVluQixNQUFaLEVBQW9Cb0IsR0FBcEIsQ0FBd0IsTUFBTUMsS0FBTixJQUFlO01BQ3RELElBQUlDLGNBQUo7O01BQ0EsSUFBSXZCLFNBQVMsS0FBSyxRQUFkLElBQTBCZSw0QkFBOUIsRUFBNEQ7UUFDMURRLGNBQWMsR0FBR1IsNEJBQTRCLENB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