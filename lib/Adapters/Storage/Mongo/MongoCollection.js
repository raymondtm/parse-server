"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

const mongodb = require('mongodb');

const Collection = mongodb.Collection;

class MongoCollection {
  constructor(mongoCollection) {
    this._mongoCollection = mongoCollection;
  } // Does a find with "smart indexing".
  // Currently this just means, if it needs a geoindex and there is
  // none, then build the geoindex.
  // This could be improved a lot but it's not clear if that's a good
  // idea. Or even if this behavior is a good idea.


  find(query, {
    skip,
    limit,
    sort,
    keys,
    maxTimeMS,
    readPreference,
    hint,
    caseInsensitive,
    explain
  } = {}) {
    // Support for Full Text Search - $text
    if (keys && keys.$score) {
      delete keys.$score;
      keys.score = {
        $meta: 'textScore'
      };
    }

    return this._rawFind(query, {
      skip,
      limit,
      sort,
      keys,
      maxTimeMS,
      readPreference,
      hint,
      caseInsensitive,
      explain
    }).catch(error => {
      // Check for "no geoindex" error
      if (error.code != 17007 && !error.message.match(/unable to find index for .geoNear/)) {
        throw error;
      } // Figure out what key needs an index


      const key = error.message.match(/field=([A-Za-z_0-9]+) /)[1];

      if (!key) {
        throw error;
      }

      var index = {};
      index[key] = '2d';
      return this._mongoCollection.createIndex(index) // Retry, but just once.
      .then(() => this._rawFind(query, {
        skip,
        limit,
        sort,
        keys,
        maxTimeMS,
        readPreference,
        hint,
        caseInsensitive,
        explain
      }));
    });
  }
  /**
   * Collation to support case insensitive queries
   */


  static caseInsensitiveCollation() {
    return {
      locale: 'en_US',
      strength: 2
    };
  }

  _rawFind(query, {
    skip,
    limit,
    sort,
    keys,
    maxTimeMS,
    readPreference,
    hint,
    caseInsensitive,
    explain
  } = {}) {
    let findOperation = this._mongoCollection.find(query, {
      skip,
      limit,
      sort,
      readPreference,
      hint
    });

    if (keys) {
      findOperation = findOperation.project(keys);
    }

    if (caseInsensitive) {
      findOperation = findOperation.collation(MongoCollection.caseInsensitiveCollation());
    }

    if (maxTimeMS) {
      findOperation = findOperation.maxTimeMS(maxTimeMS);
    }

    return explain ? findOperation.explain(explain) : findOperation.toArray();
  }

  count(query, {
    skip,
    limit,
    sort,
    maxTimeMS,
    readPreference,
    hint
  } = {}) {
    // If query is empty, then use estimatedDocumentCount instead.
    // This is due to countDocuments performing a scan,
    // which greatly increases execution time when being run on large collections.
    // See https://github.com/Automattic/mongoose/issues/6713 for more info regarding this problem.
    if (typeof query !== 'object' || !Object.keys(query).length) {
      return this._mongoCollection.estimatedDocumentCount({
        maxTimeMS
      });
    }

    const countOperation = this._mongoCollection.countDocuments(query, {
      skip,
      limit,
      sort,
      maxTimeMS,
      readPreference,
      hint
    });

    return countOperation;
  }

  distinct(field, query) {
    return this._mongoCollection.distinct(field, query);
  }

  aggregate(pipeline, {
    maxTimeMS,
    readPreference,
    hint,
    explain
  } = {}) {
    return this._mongoCollection.aggregate(pipeline, {
      maxTimeMS,
      readPreference,
      hint,
      explain
    }).toArray();
  }

  insertOne(object, session) {
    return this._mongoCollection.insertOne(object, {
      session
    });
  } // Atomically updates data in the database for a single (first) object that matched the query
  // If there is nothing that matches the query - does insert
  // Postgres Note: `INSERT ... ON CONFLICT UPDATE` that is available since 9.5.


  upsertOne(query, update, session) {
    return this._mongoCollection.updateOne(query, update, {
      upsert: true,
      session
    });
  }

  updateOne(query, update) {
    return this._mongoCollection.updateOne(query, update);
  }

  updateMany(query, update, session) {
    return this._mongoCollection.updateMany(query, update, {
      session
    });
  }

  deleteMany(query, session) {
    return this._mongoCollection.deleteMany(query, {
      session
    });
  }

  _ensureSparseUniqueIndexInBackground(indexRequest) {
    return new Promise((resolve, reject) => {
      this._mongoCollection.createIndex(indexRequest, {
        unique: true,
        background: true,
        sparse: true
      }, error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  drop() {
    return this._mongoCollection.drop();
  }

}

exports.default = MongoCollection;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJtb25nb2RiIiwicmVxdWlyZSIsIkNvbGxlY3Rpb24iLCJNb25nb0NvbGxlY3Rpb24iLCJjb25zdHJ1Y3RvciIsIm1vbmdvQ29sbGVjdGlvbiIsIl9tb25nb0NvbGxlY3Rpb24iLCJmaW5kIiwicXVlcnkiLCJza2lwIiwibGltaXQiLCJzb3J0Iiwia2V5cyIsIm1heFRpbWVNUyIsInJlYWRQcmVmZXJlbmNlIiwiaGludCIsImNhc2VJbnNlbnNpdGl2ZSIsImV4cGxhaW4iLCIkc2NvcmUiLCJzY29yZSIsIiRtZXRhIiwiX3Jhd0ZpbmQiLCJjYXRjaCIsImVycm9yIiwiY29kZSIsIm1lc3NhZ2UiLCJtYXRjaCIsImtleSIsImluZGV4IiwiY3JlYXRlSW5kZXgiLCJ0aGVuIiwiY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uIiwibG9jYWxlIiwic3RyZW5ndGgiLCJmaW5kT3BlcmF0aW9uIiwicHJvamVjdCIsImNvbGxhdGlvbiIsInRvQXJyYXkiLCJjb3VudCIsIk9iamVjdCIsImxlbmd0aCIsImVzdGltYXRlZERvY3VtZW50Q291bnQiLCJjb3VudE9wZXJhdGlvbiIsImNvdW50RG9jdW1lbnRzIiwiZGlzdGluY3QiLCJmaWVsZCIsImFnZ3JlZ2F0ZSIsInBpcGVsaW5lIiwiaW5zZXJ0T25lIiwib2JqZWN0Iiwic2Vzc2lvbiIsInVwc2VydE9uZSIsInVwZGF0ZSIsInVwZGF0ZU9uZSIsInVwc2VydCIsInVwZGF0ZU1hbnkiLCJkZWxldGVNYW55IiwiX2Vuc3VyZVNwYXJzZVVuaXF1ZUluZGV4SW5CYWNrZ3JvdW5kIiwiaW5kZXhSZXF1ZXN0IiwiUHJvbWlzZSIsInJlc29sdmUiLCJyZWplY3QiLCJ1bmlxdWUiLCJiYWNrZ3JvdW5kIiwic3BhcnNlIiwiZHJvcCJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL01vbmdvL01vbmdvQ29sbGVjdGlvbi5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBtb25nb2RiID0gcmVxdWlyZSgnbW9uZ29kYicpO1xuY29uc3QgQ29sbGVjdGlvbiA9IG1vbmdvZGIuQ29sbGVjdGlvbjtcblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgTW9uZ29Db2xsZWN0aW9uIHtcbiAgX21vbmdvQ29sbGVjdGlvbjogQ29sbGVjdGlvbjtcblxuICBjb25zdHJ1Y3Rvcihtb25nb0NvbGxlY3Rpb246IENvbGxlY3Rpb24pIHtcbiAgICB0aGlzLl9tb25nb0NvbGxlY3Rpb24gPSBtb25nb0NvbGxlY3Rpb247XG4gIH1cblxuICAvLyBEb2VzIGEgZmluZCB3aXRoIFwic21hcnQgaW5kZXhpbmdcIi5cbiAgLy8gQ3VycmVudGx5IHRoaXMganVzdCBtZWFucywgaWYgaXQgbmVlZHMgYSBnZW9pbmRleCBhbmQgdGhlcmUgaXNcbiAgLy8gbm9uZSwgdGhlbiBidWlsZCB0aGUgZ2VvaW5kZXguXG4gIC8vIFRoaXMgY291bGQgYmUgaW1wcm92ZWQgYSBsb3QgYnV0IGl0J3Mgbm90IGNsZWFyIGlmIHRoYXQncyBhIGdvb2RcbiAgLy8gaWRlYS4gT3IgZXZlbiBpZiB0aGlzIGJlaGF2aW9yIGlzIGEgZ29vZCBpZGVhLlxuICBmaW5kKFxuICAgIHF1ZXJ5LFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIG1heFRpbWVNUywgcmVhZFByZWZlcmVuY2UsIGhpbnQsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9ID0ge31cbiAgKSB7XG4gICAgLy8gU3VwcG9ydCBmb3IgRnVsbCBUZXh0IFNlYXJjaCAtICR0ZXh0XG4gICAgaWYgKGtleXMgJiYga2V5cy4kc2NvcmUpIHtcbiAgICAgIGRlbGV0ZSBrZXlzLiRzY29yZTtcbiAgICAgIGtleXMuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fcmF3RmluZChxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIGtleXMsXG4gICAgICBtYXhUaW1lTVMsXG4gICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgIGhpbnQsXG4gICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICBleHBsYWluLFxuICAgIH0pLmNhdGNoKGVycm9yID0+IHtcbiAgICAgIC8vIENoZWNrIGZvciBcIm5vIGdlb2luZGV4XCIgZXJyb3JcbiAgICAgIGlmIChlcnJvci5jb2RlICE9IDE3MDA3ICYmICFlcnJvci5tZXNzYWdlLm1hdGNoKC91bmFibGUgdG8gZmluZCBpbmRleCBmb3IgLmdlb05lYXIvKSkge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICAgIC8vIEZpZ3VyZSBvdXQgd2hhdCBrZXkgbmVlZHMgYW4gaW5kZXhcbiAgICAgIGNvbnN0IGtleSA9IGVycm9yLm1lc3NhZ2UubWF0Y2goL2ZpZWxkPShbQS1aYS16XzAtOV0rKSAvKVsxXTtcbiAgICAgIGlmICgha2V5KSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuXG4gICAgICB2YXIgaW5kZXggPSB7fTtcbiAgICAgIGluZGV4W2tleV0gPSAnMmQnO1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgdGhpcy5fbW9uZ29Db2xsZWN0aW9uXG4gICAgICAgICAgLmNyZWF0ZUluZGV4KGluZGV4KVxuICAgICAgICAgIC8vIFJldHJ5LCBidXQganVzdCBvbmNlLlxuICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICB0aGlzLl9yYXdGaW5kKHF1ZXJ5LCB7XG4gICAgICAgICAgICAgIHNraXAsXG4gICAgICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgICAgICBzb3J0LFxuICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICBtYXhUaW1lTVMsXG4gICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICBoaW50LFxuICAgICAgICAgICAgICBjYXNlSW5zZW5zaXRpdmUsXG4gICAgICAgICAgICAgIGV4cGxhaW4sXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIClcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogQ29sbGF0aW9uIHRvIHN1cHBvcnQgY2FzZSBpbnNlbnNpdGl2ZSBxdWVyaWVzXG4gICAqL1xuICBzdGF0aWMgY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uKCkge1xuICAgIHJldHVybiB7IGxvY2FsZTogJ2VuX1VTJywgc3RyZW5ndGg6IDIgfTtcbiAgfVxuXG4gIF9yYXdGaW5kKFxuICAgIHF1ZXJ5LFxuICAgIHsgc2tpcCwgbGltaXQsIHNvcnQsIGtleXMsIG1heFRpbWVNUywgcmVhZFByZWZlcmVuY2UsIGhpbnQsIGNhc2VJbnNlbnNpdGl2ZSwgZXhwbGFpbiB9ID0ge31cbiAgKSB7XG4gICAgbGV0IGZpbmRPcGVyYXRpb24gPSB0aGlzLl9tb25nb0NvbGxlY3Rpb24uZmluZChxdWVyeSwge1xuICAgICAgc2tpcCxcbiAgICAgIGxpbWl0LFxuICAgICAgc29ydCxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaGludCxcbiAgICB9KTtcblxuICAgIGlmIChrZXlzKSB7XG4gICAgICBmaW5kT3BlcmF0aW9uID0gZmluZE9wZXJhdGlvbi5wcm9qZWN0KGtleXMpO1xuICAgIH1cblxuICAgIGlmIChjYXNlSW5zZW5zaXRpdmUpIHtcbiAgICAgIGZpbmRPcGVyYXRpb24gPSBmaW5kT3BlcmF0aW9uLmNvbGxhdGlvbihNb25nb0NvbGxlY3Rpb24uY2FzZUluc2Vuc2l0aXZlQ29sbGF0aW9uKCkpO1xuICAgIH1cblxuICAgIGlmIChtYXhUaW1lTVMpIHtcbiAgICAgIGZpbmRPcGVyYXRpb24gPSBmaW5kT3BlcmF0aW9uLm1heFRpbWVNUyhtYXhUaW1lTVMpO1xuICAgIH1cblxuICAgIHJldHVybiBleHBsYWluID8gZmluZE9wZXJhdGlvbi5leHBsYWluKGV4cGxhaW4pIDogZmluZE9wZXJhdGlvbi50b0FycmF5KCk7XG4gIH1cblxuICBjb3VudChxdWVyeSwgeyBza2lwLCBsaW1pdCwgc29ydCwgbWF4VGltZU1TLCByZWFkUHJlZmVyZW5jZSwgaGludCB9ID0ge30pIHtcbiAgICAvLyBJZiBxdWVyeSBpcyBlbXB0eSwgdGhlbiB1c2UgZXN0aW1hdGVkRG9jdW1lbnRDb3VudCBpbnN0ZWFkLlxuICAgIC8vIFRoaXMgaXMgZHVlIHRvIGNvdW50RG9jdW1lbnRzIHBlcmZvcm1pbmcgYSBzY2FuLFxuICAgIC8vIHdoaWNoIGdyZWF0bHkgaW5jcmVhc2VzIGV4ZWN1dGlvbiB0aW1lIHdoZW4gYmVpbmcgcnVuIG9uIGxhcmdlIGNvbGxlY3Rpb25zLlxuICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vQXV0b21hdHRpYy9tb25nb29zZS9pc3N1ZXMvNjcxMyBmb3IgbW9yZSBpbmZvIHJlZ2FyZGluZyB0aGlzIHByb2JsZW0uXG4gICAgaWYgKHR5cGVvZiBxdWVyeSAhPT0gJ29iamVjdCcgfHwgIU9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGgpIHtcbiAgICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24uZXN0aW1hdGVkRG9jdW1lbnRDb3VudCh7XG4gICAgICAgIG1heFRpbWVNUyxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGNvdW50T3BlcmF0aW9uID0gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmNvdW50RG9jdW1lbnRzKHF1ZXJ5LCB7XG4gICAgICBza2lwLFxuICAgICAgbGltaXQsXG4gICAgICBzb3J0LFxuICAgICAgbWF4VGltZU1TLFxuICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICBoaW50LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGNvdW50T3BlcmF0aW9uO1xuICB9XG5cbiAgZGlzdGluY3QoZmllbGQsIHF1ZXJ5KSB7XG4gICAgcmV0dXJuIHRoaXMuX21vbmdvQ29sbGVjdGlvbi5kaXN0aW5jdChmaWVsZCwgcXVlcnkpO1xuICB9XG5cbiAgYWdncmVnYXRlKHBpcGVsaW5lLCB7IG1heFRpbWVNUywgcmVhZFByZWZlcmVuY2UsIGhpbnQsIGV4cGxhaW4gfSA9IHt9KSB7XG4gICAgcmV0dXJuIHRoaXMuX21vbmdvQ29sbGVjdGlvblxuICAgICAgLmFnZ3JlZ2F0ZShwaXBlbGluZSwgeyBtYXhUaW1lTVMsIHJlYWRQcmVmZXJlbmNlLCBoaW50LCBleHBsYWluIH0pXG4gICAgICAudG9BcnJheSgpO1xuICB9XG5cbiAgaW5zZXJ0T25lKG9iamVjdCwgc2Vzc2lvbikge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24uaW5zZXJ0T25lKG9iamVjdCwgeyBzZXNzaW9uIH0pO1xuICB9XG5cbiAgLy8gQXRvbWljYWxseSB1cGRhdGVzIGRhdGEgaW4gdGhlIGRhdGFiYXNlIGZvciBhIHNpbmdsZSAoZmlyc3QpIG9iamVjdCB0aGF0IG1hdGNoZWQgdGhlIHF1ZXJ5XG4gIC8vIElmIHRoZXJlIGlzIG5vdGhpbmcgdGhhdCBtYXRjaGVzIHRoZSBxdWVyeSAtIGRvZXMgaW5zZXJ0XG4gIC8vIFBvc3RncmVzIE5vdGU6IGBJTlNFUlQgLi4uIE9OIENPTkZMSUNUIFVQREFURWAgdGhhdCBpcyBhdmFpbGFibGUgc2luY2UgOS41LlxuICB1cHNlcnRPbmUocXVlcnksIHVwZGF0ZSwgc2Vzc2lvbikge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24udXBkYXRlT25lKHF1ZXJ5LCB1cGRhdGUsIHtcbiAgICAgIHVwc2VydDogdHJ1ZSxcbiAgICAgIHNlc3Npb24sXG4gICAgfSk7XG4gIH1cblxuICB1cGRhdGVPbmUocXVlcnksIHVwZGF0ZSkge1xuICAgIHJldHVybiB0aGlzLl9tb25nb0NvbGxlY3Rpb24udXBkYXRlT25lKHF1ZXJ5LCB1cGRhdGUpO1xuICB9XG5cbiAgdXBkYXRlTWFueShxdWVyeSwgdXBkYXRlLCBzZXNzaW9uKSB7XG4gICAgcmV0dXJuIHRoaXMuX21vbmdvQ29sbGVjdGlvbi51cGRhdGVNYW55KHF1ZXJ5LCB1cGRhdGUsIHsgc2Vzc2lvbiB9KTtcbiAgfVxuXG4gIGRlbGV0ZU1hbnkocXVlcnksIHNlc3Npb24pIHtcbiAgICByZXR1cm4gdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmRlbGV0ZU1hbnkocXVlcnksIHsgc2Vzc2lvbiB9KTtcbiAgfVxuXG4gIF9lbnN1cmVTcGFyc2VVbmlxdWVJbmRleEluQmFja2dyb3VuZChpbmRleFJlcXVlc3QpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgdGhpcy5fbW9uZ29Db2xsZWN0aW9uLmNyZWF0ZUluZGV4KFxuICAgICAgICBpbmRleFJlcXVlc3QsXG4gICAgICAgIHsgdW5pcXVlOiB0cnVlLCBiYWNrZ3JvdW5kOiB0cnVlLCBzcGFyc2U6IHRydWUgfSxcbiAgICAgICAgZXJyb3IgPT4ge1xuICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgcmVqZWN0KGVycm9yKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzb2x2ZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIGRyb3AoKSB7XG4gICAgcmV0dXJuIHRoaXMuX21vbmdvQ29sbGVjdGlvbi5kcm9wKCk7XG4gIH1cbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBLE1BQU1BLE9BQU8sR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBdkI7O0FBQ0EsTUFBTUMsVUFBVSxHQUFHRixPQUFPLENBQUNFLFVBQTNCOztBQUVlLE1BQU1DLGVBQU4sQ0FBc0I7RUFHbkNDLFdBQVcsQ0FBQ0MsZUFBRCxFQUE4QjtJQUN2QyxLQUFLQyxnQkFBTCxHQUF3QkQsZUFBeEI7RUFDRCxDQUxrQyxDQU9uQztFQUNBO0VBQ0E7RUFDQTtFQUNBOzs7RUFDQUUsSUFBSSxDQUNGQyxLQURFLEVBRUY7SUFBRUMsSUFBRjtJQUFRQyxLQUFSO0lBQWVDLElBQWY7SUFBcUJDLElBQXJCO0lBQTJCQyxTQUEzQjtJQUFzQ0MsY0FBdEM7SUFBc0RDLElBQXREO0lBQTREQyxlQUE1RDtJQUE2RUM7RUFBN0UsSUFBeUYsRUFGdkYsRUFHRjtJQUNBO0lBQ0EsSUFBSUwsSUFBSSxJQUFJ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