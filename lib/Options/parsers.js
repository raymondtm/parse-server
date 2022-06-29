"use strict";

function numberParser(key) {
  return function (opt) {
    const intOpt = parseInt(opt);

    if (!Number.isInteger(intOpt)) {
      throw new Error(`Key ${key} has invalid value ${opt}`);
    }

    return intOpt;
  };
}

function numberOrBoolParser(key) {
  return function (opt) {
    if (typeof opt === 'boolean') {
      return opt;
    }

    if (opt === 'true') {
      return true;
    }

    if (opt === 'false') {
      return false;
    }

    return numberParser(key)(opt);
  };
}

function objectParser(opt) {
  if (typeof opt == 'object') {
    return opt;
  }

  return JSON.parse(opt);
}

function arrayParser(opt) {
  if (Array.isArray(opt)) {
    return opt;
  } else if (typeof opt === 'string') {
    return opt.split(',');
  } else {
    throw new Error(`${opt} should be a comma separated string or an array`);
  }
}

function moduleOrObjectParser(opt) {
  if (typeof opt == 'object') {
    return opt;
  }

  try {
    return JSON.parse(opt);
  } catch (e) {
    /* */
  }

  return opt;
}

function booleanParser(opt) {
  if (opt == true || opt == 'true' || opt == '1') {
    return true;
  }

  return false;
}

function nullParser(opt) {
  if (opt == 'null') {
    return null;
  }

  return opt;
}

module.exports = {
  numberParser,
  numberOrBoolParser,
  nullParser,
  booleanParser,
  moduleOrObjectParser,
  arrayParser,
  objectParser
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJudW1iZXJQYXJzZXIiLCJrZXkiLCJvcHQiLCJpbnRPcHQiLCJwYXJzZUludCIsIk51bWJlciIsImlzSW50ZWdlciIsIkVycm9yIiwibnVtYmVyT3JCb29sUGFyc2VyIiwib2JqZWN0UGFyc2VyIiwiSlNPTiIsInBhcnNlIiwiYXJyYXlQYXJzZXIiLCJBcnJheSIsImlzQXJyYXkiLCJzcGxpdCIsIm1vZHVsZU9yT2JqZWN0UGFyc2VyIiwiZSIsImJvb2xlYW5QYXJzZXIiLCJudWxsUGFyc2VyIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9PcHRpb25zL3BhcnNlcnMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiZnVuY3Rpb24gbnVtYmVyUGFyc2VyKGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24gKG9wdCkge1xuICAgIGNvbnN0IGludE9wdCA9IHBhcnNlSW50KG9wdCk7XG4gICAgaWYgKCFOdW1iZXIuaXNJbnRlZ2VyKGludE9wdCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgS2V5ICR7a2V5fSBoYXMgaW52YWxpZCB2YWx1ZSAke29wdH1gKTtcbiAgICB9XG4gICAgcmV0dXJuIGludE9wdDtcbiAgfTtcbn1cblxuZnVuY3Rpb24gbnVtYmVyT3JCb29sUGFyc2VyKGtleSkge1xuICByZXR1cm4gZnVuY3Rpb24gKG9wdCkge1xuICAgIGlmICh0eXBlb2Ygb3B0ID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHJldHVybiBvcHQ7XG4gICAgfVxuICAgIGlmIChvcHQgPT09ICd0cnVlJykge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGlmIChvcHQgPT09ICdmYWxzZScpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIG51bWJlclBhcnNlcihrZXkpKG9wdCk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIG9iamVjdFBhcnNlcihvcHQpIHtcbiAgaWYgKHR5cGVvZiBvcHQgPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gb3B0O1xuICB9XG4gIHJldHVybiBKU09OLnBhcnNlKG9wdCk7XG59XG5cbmZ1bmN0aW9uIGFycmF5UGFyc2VyKG9wdCkge1xuICBpZiAoQXJyYXkuaXNBcnJheShvcHQpKSB7XG4gICAgcmV0dXJuIG9wdDtcbiAgfSBlbHNlIGlmICh0eXBlb2Ygb3B0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBvcHQuc3BsaXQoJywnKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYCR7b3B0fSBzaG91bGQgYmUgYSBjb21tYSBzZXBhcmF0ZWQgc3RyaW5nIG9yIGFuIGFycmF5YCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gbW9kdWxlT3JPYmplY3RQYXJzZXIob3B0KSB7XG4gIGlmICh0eXBlb2Ygb3B0ID09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG9wdDtcbiAgfVxuICB0cnkge1xuICAgIHJldHVybiBKU09OLnBhcnNlKG9wdCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICAvKiAqL1xuICB9XG4gIHJldHVybiBvcHQ7XG59XG5cbmZ1bmN0aW9uIGJvb2xlYW5QYXJzZXIob3B0KSB7XG4gIGlmIChvcHQgPT0gdHJ1ZSB8fCBvcHQgPT0gJ3RydWUnIHx8IG9wdCA9PSAnMScpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIG51bGxQYXJzZXIob3B0KSB7XG4gIGlmIChvcHQgPT0gJ251bGwnKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIG9wdDtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG51bWJlclBhcnNlcixcbiAgbnVtYmVyT3JCb29sUGFyc2VyLFxuICBudWxsUGFyc2VyLFxuICBib29sZWFuUGFyc2VyLFxuICBtb2R1bGVPck9iamVjdFBhcnNlcixcbiAgYXJyYXlQYXJzZXIsXG4gIG9iamVjdFBhcnNlcixcbn07XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsU0FBU0EsWUFBVCxD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