'use strict';

var cardinal            = require('cardinal')
  , xtend               = require('xtend')
  , colors              = require('ansicolors')
  , format              = require('util').format
  , getFunctionLocation = require('function-origin')
  , indexes

function highlightSource(s) {
  try {
    return cardinal.highlight(s, { lineno: true });
  } catch (e)  {
    return s;
  }
}

function resolveHandle(handle, cb) {
  var visited = []
    , resolved = []
    , fn, src, location
    , highlighted, name, anonymous

  function wasVisited(h) {
    return ~visited.indexOf(h);
  }

  for (var next = handle._idleNext; !!next && !wasVisited(next); next = next._idleNext) {
    visited.push(next);
    if (!next.hasOwnProperty('_onTimeout')) continue;

    fn = next._onTimeout
    src = fn.toString();

    location = getFunctionLocation(fn)
    // v8 zero bases lines
    if (location) location.line++;

    // handle anonymous functions and try to figure out a meaningful function name
    anonymous = false;
    if (!fn.name || !fn.name.length) {
      name = location.inferredName && location.inferredName.length
          ? location.inferredName
          : '__unknown_function_name__';

      anonymous = true;
    } else {
      name = fn.name;
    }

    // function () { ... is not by itself parsable
    // x = function () { .. is
    highlighted = anonymous
      ? highlightSource(name + ' = ' + src)
      : highlightSource(src);

    resolved.push({
        msecs       : next._idleTimeout
      , fn          : fn
      , name        : name
      , source      : src
      , highlighted : highlighted
      , location    : location
    })
  }

  return resolved;
}

function resolveHandles(handles) {
  var tasks = handles.length;
  var resolvedHandles = [];

  function pushHandle(h) {
    resolvedHandles.push(h);
  }

  function resolveCurrentHandle(handle) {
    var resolved = resolveHandle(handle);
    resolved.forEach(pushHandle);
  }

  handles.forEach(resolveCurrentHandle);
  return resolvedHandles;
}

/**
 * Gathers information about all currently active handles.
 * Active handles are obtained via `process._getActiveHandles` 
 * and location and name of each is resolved.
 * 
 * @name activeHandles
 * @function
 * @return {Array.<Object>} handles each with the following properties
 * @return {Number}   handle.msecs         timeout specified for the handle
 * @return {Function} handle.fn            the handle itself
 * @return {String}   handle.name          the name of the function, for anonymous functions this is the name it was assigned to
 * @return {String}   handle.source        the raw function source
 * @return {String}   handle.highlighted   the highlighted source
 * @return {Object}   handle.location      location information about the handle
 * @return {String}   handle.location.file          full path to the file in which the handle was defined
 * @return {Number}   handle.location.line          line where the handle was defined
 * @return {Number}   handle.location.column        column where the handle was defined
 * @return {String}   handle.location.inferredName  name that is used when function declaration is anonymous 
 */
exports = module.exports = function activeHandles() {
  var handles = process._getActiveHandles();
  if (!handles.length) return [];
  return resolveHandles(handles);
}

/**
 * Convenience function that first calls @see activeHandles and
 * prints the information to stdout.
 * 
 * @name activeHandles::print
 * @function
 */
exports.print = function print() {
  var h, loc, locString;

  var handles = exports();
  for (var i = 0, len = handles.length; i < len; i++) {
    h = handles[i];
    loc = h.location;

    locString = loc
      ? format('%s:%d:%d', loc.file, loc.line, loc.column)
      : 'Unknown location';

    console.log('\n%s %s\n%s'
      , colors.green(h.name + ':')
      , colors.brightBlack(locString)
      , h.highlighted);
  }
}