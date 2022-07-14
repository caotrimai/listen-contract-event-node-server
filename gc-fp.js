
function runSolusLite() {
  // Put the solus lite code here and replace "this" parameter with the "window"
  (function (root, factory) {
    if (typeof(define) === 'function' && define.amd) {
      define([], factory);
    } else {
      root.GCFP = factory();
    }
  }(window, function() {
    /**
     * @license almond 0.3.3 Copyright jQuery Foundation and other contributors.
     * Released under MIT license, http://github.com/requirejs/almond/LICENSE
     */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
    /*global setTimeout: false */

    var requirejs, require, define;
    (function (undef) {
      var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

      function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
      }

      /**
       * Given a relative module name, like ./something, normalize it to
       * a real name that can be mapped to a path.
       * @param {String} name the relative name
       * @param {String} baseName a real name that the name arg is relative
       * to.
       * @returns {String} normalized name
       */
      function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
          foundI, foundStarMap, starI, i, j, part, normalizedBaseParts,
          baseParts = baseName && baseName.split("/"),
          map = config.map,
          starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name) {
          name = name.split('/');
          lastIndex = name.length - 1;

          // If wanting node ID compatibility, strip .js from end
          // of IDs. Have to do this here, and not in nameToUrl
          // because node allows either .js or non .js to map
          // to same file.
          if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
            name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
          }

          // Starts with a '.' so need the baseName
          if (name[0].charAt(0) === '.' && baseParts) {
            //Convert baseName to array, and lop off the last part,
            //so that . matches that 'directory' and not name of the baseName's
            //module. For instance, baseName of 'one/two/three', maps to
            //'one/two/three.js', but we want the directory, 'one/two' for
            //this normalization.
            normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
            name = normalizedBaseParts.concat(name);
          }

          //start trimDots
          for (i = 0; i < name.length; i++) {
            part = name[i];
            if (part === '.') {
              name.splice(i, 1);
              i -= 1;
            } else if (part === '..') {
              // If at the start, or previous value is still ..,
              // keep them so that when converted to a path it may
              // still work when converted to a path, even though
              // as an ID it is less than ideal. In larger point
              // releases, may be better to just kick out an error.
              if (i === 0 || (i === 1 && name[2] === '..') || name[i - 1] === '..') {
                continue;
              } else if (i > 0) {
                name.splice(i - 1, 2);
                i -= 2;
              }
            }
          }
          //end trimDots

          name = name.join('/');
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
          nameParts = name.split('/');

          for (i = nameParts.length; i > 0; i -= 1) {
            nameSegment = nameParts.slice(0, i).join("/");

            if (baseParts) {
              //Find the longest baseName segment match in the config.
              //So, do joins on the biggest to smallest lengths of baseParts.
              for (j = baseParts.length; j > 0; j -= 1) {
                mapValue = map[baseParts.slice(0, j).join('/')];

                //baseName segment has  config, find if it has one for
                //this name.
                if (mapValue) {
                  mapValue = mapValue[nameSegment];
                  if (mapValue) {
                    //Match, update name to the new value.
                    foundMap = mapValue;
                    foundI = i;
                    break;
                  }
                }
              }
            }

            if (foundMap) {
              break;
            }

            //Check for a star map match, but just hold on to it,
            //if there is a shorter segment match later in a matching
            //config, then favor over this star map.
            if (!foundStarMap && starMap && starMap[nameSegment]) {
              foundStarMap = starMap[nameSegment];
              starI = i;
            }
          }

          if (!foundMap && foundStarMap) {
            foundMap = foundStarMap;
            foundI = starI;
          }

          if (foundMap) {
            nameParts.splice(0, foundI, foundMap);
            name = nameParts.join('/');
          }
        }

        return name;
      }

      function makeRequire(relName, forceSync) {
        return function () {
          //A version of a require function that passes a moduleName
          //value for items that may need to
          //look up paths relative to the moduleName
          var args = aps.call(arguments, 0);

          //If first arg is not require('string'), and there is only
          //one arg, it is the array form without a callback. Insert
          //a null so that the following concat is correct.
          if (typeof args[0] !== 'string' && args.length === 1) {
            args.push(null);
          }
          return req.apply(undef, args.concat([relName, forceSync]));
        };
      }

      function makeNormalize(relName) {
        return function (name) {
          return normalize(name, relName);
        };
      }

      function makeLoad(depName) {
        return function (value) {
          defined[depName] = value;
        };
      }

      function callDep(name) {
        if (hasProp(waiting, name)) {
          var args = waiting[name];
          delete waiting[name];
          defining[name] = true;
          main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
          throw new Error('No ' + name);
        }
        return defined[name];
      }

      //Turns a plugin!resource to [plugin, resource]
      //with the plugin being undefined if the name
      //did not have a plugin prefix.
      function splitPrefix(name) {
        var prefix,
          index = name ? name.indexOf('!') : -1;
        if (index > -1) {
          prefix = name.substring(0, index);
          name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
      }

      //Creates a parts array for a relName where first part is plugin ID,
      //second part is resource ID. Assumes relName has already been normalized.
      function makeRelParts(relName) {
        return relName ? splitPrefix(relName) : [];
      }

      /**
       * Makes a name map, normalizing the name, and using a plugin
       * for normalization if necessary. Grabs a ref to plugin
       * too, as an optimization.
       */
      makeMap = function (name, relParts) {
        var plugin,
          parts = splitPrefix(name),
          prefix = parts[0],
          relResourceName = relParts[1];

        name = parts[1];

        if (prefix) {
          prefix = normalize(prefix, relResourceName);
          plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
          if (plugin && plugin.normalize) {
            name = plugin.normalize(name, makeNormalize(relResourceName));
          } else {
            name = normalize(name, relResourceName);
          }
        } else {
          name = normalize(name, relResourceName);
          parts = splitPrefix(name);
          prefix = parts[0];
          name = parts[1];
          if (prefix) {
            plugin = callDep(prefix);
          }
        }

        //Using ridiculous property names for space reasons
        return {
          f: prefix ? prefix + '!' + name : name, //fullName
          n: name,
          pr: prefix,
          p: plugin
        };
      };

      function makeConfig(name) {
        return function () {
          return (config && config.config && config.config[name]) || {};
        };
      }

      handlers = {
        require: function (name) {
          return makeRequire(name);
        },
        exports: function (name) {
          var e = defined[name];
          if (typeof e !== 'undefined') {
            return e;
          } else {
            return (defined[name] = {});
          }
        },
        module: function (name) {
          return {
            id: name,
            uri: '',
            exports: defined[name],
            config: makeConfig(name)
          };
        }
      };

      main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i, relParts,
          args = [],
          callbackType = typeof callback,
          usingExports;

        //Use name if no relName
        relName = relName || name;
        relParts = makeRelParts(relName);

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
          //Pull out the defined dependencies and pass the ordered
          //values to the callback.
          //Default to [require, exports, module] if no deps
          deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
          for (i = 0; i < deps.length; i += 1) {
            map = makeMap(deps[i], relParts);
            depName = map.f;

            //Fast path CommonJS standard dependencies.
            if (depName === "require") {
              args[i] = handlers.require(name);
            } else if (depName === "exports") {
              //CommonJS module spec 1.1
              args[i] = handlers.exports(name);
              usingExports = true;
            } else if (depName === "module") {
              //CommonJS module spec 1.1
              cjsModule = args[i] = handlers.module(name);
            } else if (hasProp(defined, depName) ||
              hasProp(waiting, depName) ||
              hasProp(defining, depName)) {
              args[i] = callDep(depName);
            } else if (map.p) {
              map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
              args[i] = defined[depName];
            } else {
              throw new Error(name + ' missing ' + depName);
            }
          }

          ret = callback ? callback.apply(defined[name], args) : undefined;

          if (name) {
            //If setting exports via "module" is in play,
            //favor that over return value and exports. After that,
            //favor a non-undefined return value over exports use.
            if (cjsModule && cjsModule.exports !== undef &&
              cjsModule.exports !== defined[name]) {
              defined[name] = cjsModule.exports;
            } else if (ret !== undef || !usingExports) {
              //Use the return value from the function.
              defined[name] = ret;
            }
          }
        } else if (name) {
          //May just be an object definition for the module. Only
          //worry about defining if have a module name.
          defined[name] = callback;
        }
      };

      requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
          if (handlers[deps]) {
            //callback in this case is really relName
            return handlers[deps](callback);
          }
          //Just return the module wanted. In this scenario, the
          //deps arg is the module name, and second arg (if passed)
          //is just the relName.
          //Normalize module name, if it contains . or ..
          return callDep(makeMap(deps, makeRelParts(callback)).f);
        } else if (!deps.splice) {
          //deps is a config object, not an array.
          config = deps;
          if (config.deps) {
            req(config.deps, config.callback);
          }
          if (!callback) {
            return;
          }

          if (callback.splice) {
            //callback is an array, which means it is a dependency list.
            //Adjust args if there are dependencies
            deps = callback;
            callback = relName;
            relName = null;
          } else {
            deps = undef;
          }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
          relName = forceSync;
          forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
          main(undef, deps, callback, relName);
        } else {
          //Using a non-zero value because of concern for what old browsers
          //do, and latest browsers "upgrade" to 4 if lower value is used:
          //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
          //If want a value immediately, use require('id') instead -- something
          //that works in almond on the global level, but not guaranteed and
          //unlikely to work in other AMD implementations.
          setTimeout(function () {
            main(undef, deps, callback, relName);
          }, 4);
        }

        return req;
      };

      /**
       * Just drops the config on the floor, but returns req in case
       * the config return value is used.
       */
      req.config = function (cfg) {
        return req(cfg);
      };

      /**
       * Expose module registry for debugging and tooling
       */
      requirejs._defined = defined;

      define = function (name, deps, callback) {
        if (typeof name !== 'string') {
          throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
          //deps is not an array, so probably means
          //an object literal or factory function for
          //the value. Adjust args.
          callback = deps;
          deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
          waiting[name] = [name, deps, callback];
        }
      };

      define.amd = {
        jQuery: true
      };
    }());

    define("almond", function(){});

    define('gc-fp/lib/crypto',[], function() {
      //core
      var CryptoJS = CryptoJS || (function(Math, undefined) {
        var C = {};
        var C_lib = C.lib = {};
        var Base = C_lib.Base = (function() {
          function F() {}
          return {
            extend: function(overrides) {
              F.prototype = this;
              var subtype = new F();
              if (overrides) {
                subtype.mixIn(overrides);
              }
              if (!subtype.hasOwnProperty('init')) {
                subtype.init = function() {
                  subtype.$super.init.apply(this, arguments);
                };
              }
              subtype.init.prototype = subtype;
              subtype.$super = this;
              return subtype;
            },
            create: function() {
              var instance = this.extend();
              instance.init.apply(instance, arguments);
              return instance;
            },
            init: function() {},
            mixIn: function(properties) {
              for (var propertyName in properties) {
                if (properties.hasOwnProperty(propertyName)) {
                  this[propertyName] = properties[propertyName];
                }
              }
              if (properties.hasOwnProperty('toString')) {
                this.toString = properties.toString;
              }
            },
            clone: function() {
              return this.init.prototype.extend(this);
            }
          };
        }());
        var WordArray = C_lib.WordArray = Base.extend({
          init: function(words, sigBytes) {
            words = this.words = words || [];
            if (sigBytes !== undefined) {
              this.sigBytes = sigBytes;
            } else {
              this.sigBytes = words.length * 4;
            }
          },
          toString: function(encoder) {
            return (encoder || Hex).stringify(this);
          },
          concat: function(wordArray) {
            var thisWords = this.words;
            var thatWords = wordArray.words;
            var thisSigBytes = this.sigBytes;
            var thatSigBytes = wordArray.sigBytes;
            this.clamp();
            if (thisSigBytes % 4) {
              for (var i = 0; i < thatSigBytes; i++) {
                var thatByte = (thatWords[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
                thisWords[(thisSigBytes + i) >>> 2] |= thatByte << (24 - ((thisSigBytes + i) % 4) * 8);
              }
            } else if (thatWords.length > 0xffff) {
              for (var i = 0; i < thatSigBytes; i += 4) {
                thisWords[(thisSigBytes + i) >>> 2] = thatWords[i >>> 2];
              }
            } else {
              thisWords.push.apply(thisWords, thatWords);
            }
            this.sigBytes += thatSigBytes;
            return this;
          },
          clamp: function() {
            var words = this.words;
            var sigBytes = this.sigBytes;
            words[sigBytes >>> 2] &= 0xffffffff << (32 - (sigBytes % 4) * 8);
            words.length = Math.ceil(sigBytes / 4);
          },
          clone: function() {
            var clone = Base.clone.call(this);
            clone.words = this.words.slice(0);

            return clone;
          },
          random: function(nBytes) {
            var words = [];
            for (var i = 0; i < nBytes; i += 4) {
              words.push((Math.random() * 0x100000000) | 0);
            }

            return new WordArray.init(words, nBytes);
          }
        });
        var C_enc = C.enc = {};
        var Hex = C_enc.Hex = {
          stringify: function(wordArray) {
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var hexChars = [];
            for (var i = 0; i < sigBytes; i++) {
              var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
              hexChars.push((bite >>> 4).toString(16));
              hexChars.push((bite & 0x0f).toString(16));
            }
            return hexChars.join('');
          },
          parse: function(hexStr) {
            var hexStrLength = hexStr.length;
            var words = [];
            for (var i = 0; i < hexStrLength; i += 2) {
              words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << (24 - (i % 8) * 4);
            }
            return new WordArray.init(words, hexStrLength / 2);
          }
        };
        var Latin1 = C_enc.Latin1 = {
          stringify: function(wordArray) {
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var latin1Chars = [];
            for (var i = 0; i < sigBytes; i++) {
              var bite = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
              latin1Chars.push(String.fromCharCode(bite));
            }
            return latin1Chars.join('');
          },
          parse: function(latin1Str) {
            var latin1StrLength = latin1Str.length;
            var words = [];
            for (var i = 0; i < latin1StrLength; i++) {
              words[i >>> 2] |= (latin1Str.charCodeAt(i) & 0xff) << (24 - (i % 4) * 8);
            }
            return new WordArray.init(words, latin1StrLength);
          }
        };
        var Utf8 = C_enc.Utf8 = {
          stringify: function(wordArray) {
            try {
              return decodeURIComponent(escape(Latin1.stringify(wordArray)));
            } catch (e) {
              throw new Error('Malformed UTF-8 data');
            }
          },
          parse: function(utf8Str) {
            return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
          }
        };
        var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
          reset: function() {
            this._data = new WordArray.init();
            this._nDataBytes = 0;
          },
          _append: function(data) {
            if (typeof data == 'string') {
              data = Utf8.parse(data);
            }
            this._data.concat(data);
            this._nDataBytes += data.sigBytes;
          },
          _process: function(doFlush) {
            var data = this._data;
            var dataWords = data.words;
            var dataSigBytes = data.sigBytes;
            var blockSize = this.blockSize;
            var blockSizeBytes = blockSize * 4;
            var nBlocksReady = dataSigBytes / blockSizeBytes;
            if (doFlush) {
              nBlocksReady = Math.ceil(nBlocksReady);
            } else {
              nBlocksReady = Math.max((nBlocksReady | 0) - this._minBufferSize, 0);
            }
            var nWordsReady = nBlocksReady * blockSize;
            var nBytesReady = Math.min(nWordsReady * 4, dataSigBytes);
            if (nWordsReady) {
              for (var offset = 0; offset < nWordsReady; offset += blockSize) {
                this._doProcessBlock(dataWords, offset);
              }
              var processedWords = dataWords.splice(0, nWordsReady);
              data.sigBytes -= nBytesReady;
            }
            return new WordArray.init(processedWords, nBytesReady);
          },
          clone: function() {
            var clone = Base.clone.call(this);
            clone._data = this._data.clone();

            return clone;
          },
          _minBufferSize: 0
        });
        var Hasher = C_lib.Hasher = BufferedBlockAlgorithm.extend({
          cfg: Base.extend(),
          init: function(cfg) {
            this.cfg = this.cfg.extend(cfg);
            this.reset();
          },
          reset: function() {
            BufferedBlockAlgorithm.reset.call(this);
            this._doReset();
          },
          update: function(messageUpdate) {
            this._append(messageUpdate);
            this._process();
            return this;
          },
          finalize: function(messageUpdate) {
            if (messageUpdate) {
              this._append(messageUpdate);
            }
            var hash = this._doFinalize();
            return hash;
          },
          blockSize: 512 / 32,
          _createHelper: function(hasher) {
            return function(message, cfg) {
              return new hasher.init(cfg).finalize(message);
            };
          },
          _createHmacHelper: function(hasher) {
            return function(message, key) {
              return new C_algo.HMAC.init(hasher, key).finalize(message);
            };
          }
        });
        var C_algo = C.algo = {};

        return C;
      }(Math));

      //hmac
      (function() {
        var C = CryptoJS;
        var C_lib = C.lib;
        var Base = C_lib.Base;
        var C_enc = C.enc;
        var Utf8 = C_enc.Utf8;
        var C_algo = C.algo;
        var HMAC = C_algo.HMAC = Base.extend({
          init: function(hasher, key) {
            hasher = this._hasher = new hasher.init();
            if (typeof key == 'string') {
              key = Utf8.parse(key);
            }
            var hasherBlockSize = hasher.blockSize;
            var hasherBlockSizeBytes = hasherBlockSize * 4;
            if (key.sigBytes > hasherBlockSizeBytes) {
              key = hasher.finalize(key);
            }
            key.clamp();
            var oKey = this._oKey = key.clone();
            var iKey = this._iKey = key.clone();
            var oKeyWords = oKey.words;
            var iKeyWords = iKey.words;
            for (var i = 0; i < hasherBlockSize; i++) {
              oKeyWords[i] ^= 0x5c5c5c5c;
              iKeyWords[i] ^= 0x36363636;
            }
            oKey.sigBytes = iKey.sigBytes = hasherBlockSizeBytes;
            this.reset();
          },
          reset: function() {
            var hasher = this._hasher;
            hasher.reset();
            hasher.update(this._iKey);
          },
          update: function(messageUpdate) {
            this._hasher.update(messageUpdate);
            return this;
          },
          finalize: function(messageUpdate) {
            var hasher = this._hasher;
            var innerHash = hasher.finalize(messageUpdate);
            hasher.reset();
            var hmac = hasher.finalize(this._oKey.clone().concat(innerHash));

            return hmac;
          }
        });
      }());

      //sha1
      (function() {
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_algo = C.algo;
        var W = [];
        var SHA1 = C_algo.SHA1 = Hasher.extend({
          _doReset: function() {
            this._hash = new WordArray.init([
              0x67452301, 0xefcdab89,
              0x98badcfe, 0x10325476,
              0xc3d2e1f0
            ]);
          },
          _doProcessBlock: function(M, offset) {
            var H = this._hash.words;
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];
            for (var i = 0; i < 80; i++) {
              if (i < 16) {
                W[i] = M[offset + i] | 0;
              } else {
                var n = W[i - 3] ^ W[i - 8] ^ W[i - 14] ^ W[i - 16];
                W[i] = (n << 1) | (n >>> 31);
              }
              var t = ((a << 5) | (a >>> 27)) + e + W[i];
              if (i < 20) {
                t += ((b & c) | (~b & d)) + 0x5a827999;
              } else if (i < 40) {
                t += (b ^ c ^ d) + 0x6ed9eba1;
              } else if (i < 60) {
                t += ((b & c) | (b & d) | (c & d)) - 0x70e44324;
              } else /* if (i < 80) */ {
                t += (b ^ c ^ d) - 0x359d3e2a;
              }
              e = d;
              d = c;
              c = (b << 30) | (b >>> 2);
              b = a;
              a = t;
            }
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
          },
          _doFinalize: function() {
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;
            this._process();
            return this._hash;
          },
          clone: function() {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();
            return clone;
          }
        });
        C.SHA1 = Hasher._createHelper(SHA1);
        C.HmacSHA1 = Hasher._createHmacHelper(SHA1);
      }());

      //sha256
      (function() {
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_algo = C.algo;
        var H = [];
        var K = [];
        (function() {
          function isPrime(n) {
            var sqrtN = Math.sqrt(n);
            for (var factor = 2; factor <= sqrtN; factor++) {
              if (!(n % factor)) {
                return false;
              }
            }
            return true;
          }

          function getFractionalBits(n) {
            return ((n - (n | 0)) * 0x100000000) | 0;
          }
          var n = 2;
          var nPrime = 0;
          while (nPrime < 64) {
            if (isPrime(n)) {
              if (nPrime < 8) {
                H[nPrime] = getFractionalBits(Math.pow(n, 1 / 2));
              }
              K[nPrime] = getFractionalBits(Math.pow(n, 1 / 3));

              nPrime++;
            }
            n++;
          }
        }());
        var W = [];
        var SHA256 = C_algo.SHA256 = Hasher.extend({
          _doReset: function() {
            this._hash = new WordArray.init(H.slice(0));
          },
          _doProcessBlock: function(M, offset) {
            var H = this._hash.words;
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];
            var e = H[4];
            var f = H[5];
            var g = H[6];
            var h = H[7];
            for (var i = 0; i < 64; i++) {
              if (i < 16) {
                W[i] = M[offset + i] | 0;
              } else {
                var gamma0x = W[i - 15];
                var gamma0 = ((gamma0x << 25) | (gamma0x >>> 7)) ^
                  ((gamma0x << 14) | (gamma0x >>> 18)) ^
                  (gamma0x >>> 3);
                var gamma1x = W[i - 2];
                var gamma1 = ((gamma1x << 15) | (gamma1x >>> 17)) ^
                  ((gamma1x << 13) | (gamma1x >>> 19)) ^
                  (gamma1x >>> 10);
                W[i] = gamma0 + W[i - 7] + gamma1 + W[i - 16];
              }
              var ch = (e & f) ^ (~e & g);
              var maj = (a & b) ^ (a & c) ^ (b & c);
              var sigma0 = ((a << 30) | (a >>> 2)) ^ ((a << 19) | (a >>> 13)) ^ ((a << 10) | (a >>> 22));
              var sigma1 = ((e << 26) | (e >>> 6)) ^ ((e << 21) | (e >>> 11)) ^ ((e << 7) | (e >>> 25));
              var t1 = h + sigma1 + ch + K[i] + W[i];
              var t2 = sigma0 + maj;
              h = g;
              g = f;
              f = e;
              e = (d + t1) | 0;
              d = c;
              c = b;
              b = a;
              a = (t1 + t2) | 0;
            }
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
            H[4] = (H[4] + e) | 0;
            H[5] = (H[5] + f) | 0;
            H[6] = (H[6] + g) | 0;
            H[7] = (H[7] + h) | 0;
          },
          _doFinalize: function() {
            var data = this._data;
            var dataWords = data.words;
            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = Math.floor(nBitsTotal / 0x100000000);
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = nBitsTotal;
            data.sigBytes = dataWords.length * 4;
            this._process();
            return this._hash;
          },
          clone: function() {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
          }
        });
        C.SHA256 = Hasher._createHelper(SHA256);
        C.HmacSHA256 = Hasher._createHmacHelper(SHA256);
      }());

      //enc-base64
      (function() {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var C_enc = C.enc;

        /**
         * Base64 encoding strategy.
         */
        var Base64 = C_enc.Base64 = {
          /**
           * Converts a word array to a Base64 string.
           *
           * @param {WordArray} wordArray The word array.
           *
           * @return {string} The Base64 string.
           *
           * @static
           *
           * @example
           *
           *     var base64String = CryptoJS.enc.Base64.stringify(wordArray);
           */
          stringify: function(wordArray) {
            // Shortcuts
            var words = wordArray.words;
            var sigBytes = wordArray.sigBytes;
            var map = this._map;

            // Clamp excess bits
            wordArray.clamp();

            // Convert
            var base64Chars = [];
            for (var i = 0; i < sigBytes; i += 3) {
              var byte1 = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
              var byte2 = (words[(i + 1) >>> 2] >>> (24 - ((i + 1) % 4) * 8)) & 0xff;
              var byte3 = (words[(i + 2) >>> 2] >>> (24 - ((i + 2) % 4) * 8)) & 0xff;

              var triplet = (byte1 << 16) | (byte2 << 8) | byte3;

              for (var j = 0;
                (j < 4) && (i + j * 0.75 < sigBytes); j++) {
                base64Chars.push(map.charAt((triplet >>> (6 * (3 - j))) & 0x3f));
              }
            }

            // Add padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
              while (base64Chars.length % 4) {
                base64Chars.push(paddingChar);
              }
            }

            return base64Chars.join('');
          },

          /**
           * Converts a Base64 string to a word array.
           *
           * @param {string} base64Str The Base64 string.
           *
           * @return {WordArray} The word array.
           *
           * @static
           *
           * @example
           *
           *     var wordArray = CryptoJS.enc.Base64.parse(base64String);
           */
          parse: function(base64Str) {
            // Shortcuts
            var base64StrLength = base64Str.length;
            var map = this._map;

            // Ignore padding
            var paddingChar = map.charAt(64);
            if (paddingChar) {
              var paddingIndex = base64Str.indexOf(paddingChar);
              if (paddingIndex != -1) {
                base64StrLength = paddingIndex;
              }
            }

            // Convert
            var words = [];
            var nBytes = 0;
            for (var i = 0; i < base64StrLength; i++) {
              if (i % 4) {
                var bits1 = map.indexOf(base64Str.charAt(i - 1)) << ((i % 4) * 2);
                var bits2 = map.indexOf(base64Str.charAt(i)) >>> (6 - (i % 4) * 2);
                var bitsCombined = bits1 | bits2;
                words[nBytes >>> 2] |= (bitsCombined) << (24 - (nBytes % 4) * 8);
                nBytes++;
              }
            }

            return WordArray.create(words, nBytes);
          },

          _map: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
        };
      }());

      //md5
      (function(Math) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var WordArray = C_lib.WordArray;
        var Hasher = C_lib.Hasher;
        var C_algo = C.algo;

        // Constants table
        var T = [];

        // Compute constants
        (function() {
          for (var i = 0; i < 64; i++) {
            T[i] = (Math.abs(Math.sin(i + 1)) * 0x100000000) | 0;
          }
        }());

        /**
         * MD5 hash algorithm.
         */
        var MD5 = C_algo.MD5 = Hasher.extend({
          _doReset: function() {
            this._hash = new WordArray.init([
              0x67452301, 0xefcdab89,
              0x98badcfe, 0x10325476
            ]);
          },

          _doProcessBlock: function(M, offset) {
            // Swap endian
            for (var i = 0; i < 16; i++) {
              // Shortcuts
              var offset_i = offset + i;
              var M_offset_i = M[offset_i];

              M[offset_i] = (
                (((M_offset_i << 8) | (M_offset_i >>> 24)) & 0x00ff00ff) |
                (((M_offset_i << 24) | (M_offset_i >>> 8)) & 0xff00ff00)
              );
            }

            // Shortcuts
            var H = this._hash.words;

            var M_offset_0 = M[offset + 0];
            var M_offset_1 = M[offset + 1];
            var M_offset_2 = M[offset + 2];
            var M_offset_3 = M[offset + 3];
            var M_offset_4 = M[offset + 4];
            var M_offset_5 = M[offset + 5];
            var M_offset_6 = M[offset + 6];
            var M_offset_7 = M[offset + 7];
            var M_offset_8 = M[offset + 8];
            var M_offset_9 = M[offset + 9];
            var M_offset_10 = M[offset + 10];
            var M_offset_11 = M[offset + 11];
            var M_offset_12 = M[offset + 12];
            var M_offset_13 = M[offset + 13];
            var M_offset_14 = M[offset + 14];
            var M_offset_15 = M[offset + 15];

            // Working varialbes
            var a = H[0];
            var b = H[1];
            var c = H[2];
            var d = H[3];

            // Computation
            a = FF(a, b, c, d, M_offset_0, 7, T[0]);
            d = FF(d, a, b, c, M_offset_1, 12, T[1]);
            c = FF(c, d, a, b, M_offset_2, 17, T[2]);
            b = FF(b, c, d, a, M_offset_3, 22, T[3]);
            a = FF(a, b, c, d, M_offset_4, 7, T[4]);
            d = FF(d, a, b, c, M_offset_5, 12, T[5]);
            c = FF(c, d, a, b, M_offset_6, 17, T[6]);
            b = FF(b, c, d, a, M_offset_7, 22, T[7]);
            a = FF(a, b, c, d, M_offset_8, 7, T[8]);
            d = FF(d, a, b, c, M_offset_9, 12, T[9]);
            c = FF(c, d, a, b, M_offset_10, 17, T[10]);
            b = FF(b, c, d, a, M_offset_11, 22, T[11]);
            a = FF(a, b, c, d, M_offset_12, 7, T[12]);
            d = FF(d, a, b, c, M_offset_13, 12, T[13]);
            c = FF(c, d, a, b, M_offset_14, 17, T[14]);
            b = FF(b, c, d, a, M_offset_15, 22, T[15]);

            a = GG(a, b, c, d, M_offset_1, 5, T[16]);
            d = GG(d, a, b, c, M_offset_6, 9, T[17]);
            c = GG(c, d, a, b, M_offset_11, 14, T[18]);
            b = GG(b, c, d, a, M_offset_0, 20, T[19]);
            a = GG(a, b, c, d, M_offset_5, 5, T[20]);
            d = GG(d, a, b, c, M_offset_10, 9, T[21]);
            c = GG(c, d, a, b, M_offset_15, 14, T[22]);
            b = GG(b, c, d, a, M_offset_4, 20, T[23]);
            a = GG(a, b, c, d, M_offset_9, 5, T[24]);
            d = GG(d, a, b, c, M_offset_14, 9, T[25]);
            c = GG(c, d, a, b, M_offset_3, 14, T[26]);
            b = GG(b, c, d, a, M_offset_8, 20, T[27]);
            a = GG(a, b, c, d, M_offset_13, 5, T[28]);
            d = GG(d, a, b, c, M_offset_2, 9, T[29]);
            c = GG(c, d, a, b, M_offset_7, 14, T[30]);
            b = GG(b, c, d, a, M_offset_12, 20, T[31]);

            a = HH(a, b, c, d, M_offset_5, 4, T[32]);
            d = HH(d, a, b, c, M_offset_8, 11, T[33]);
            c = HH(c, d, a, b, M_offset_11, 16, T[34]);
            b = HH(b, c, d, a, M_offset_14, 23, T[35]);
            a = HH(a, b, c, d, M_offset_1, 4, T[36]);
            d = HH(d, a, b, c, M_offset_4, 11, T[37]);
            c = HH(c, d, a, b, M_offset_7, 16, T[38]);
            b = HH(b, c, d, a, M_offset_10, 23, T[39]);
            a = HH(a, b, c, d, M_offset_13, 4, T[40]);
            d = HH(d, a, b, c, M_offset_0, 11, T[41]);
            c = HH(c, d, a, b, M_offset_3, 16, T[42]);
            b = HH(b, c, d, a, M_offset_6, 23, T[43]);
            a = HH(a, b, c, d, M_offset_9, 4, T[44]);
            d = HH(d, a, b, c, M_offset_12, 11, T[45]);
            c = HH(c, d, a, b, M_offset_15, 16, T[46]);
            b = HH(b, c, d, a, M_offset_2, 23, T[47]);

            a = II(a, b, c, d, M_offset_0, 6, T[48]);
            d = II(d, a, b, c, M_offset_7, 10, T[49]);
            c = II(c, d, a, b, M_offset_14, 15, T[50]);
            b = II(b, c, d, a, M_offset_5, 21, T[51]);
            a = II(a, b, c, d, M_offset_12, 6, T[52]);
            d = II(d, a, b, c, M_offset_3, 10, T[53]);
            c = II(c, d, a, b, M_offset_10, 15, T[54]);
            b = II(b, c, d, a, M_offset_1, 21, T[55]);
            a = II(a, b, c, d, M_offset_8, 6, T[56]);
            d = II(d, a, b, c, M_offset_15, 10, T[57]);
            c = II(c, d, a, b, M_offset_6, 15, T[58]);
            b = II(b, c, d, a, M_offset_13, 21, T[59]);
            a = II(a, b, c, d, M_offset_4, 6, T[60]);
            d = II(d, a, b, c, M_offset_11, 10, T[61]);
            c = II(c, d, a, b, M_offset_2, 15, T[62]);
            b = II(b, c, d, a, M_offset_9, 21, T[63]);

            // Intermediate hash value
            H[0] = (H[0] + a) | 0;
            H[1] = (H[1] + b) | 0;
            H[2] = (H[2] + c) | 0;
            H[3] = (H[3] + d) | 0;
          },

          _doFinalize: function() {
            // Shortcuts
            var data = this._data;
            var dataWords = data.words;

            var nBitsTotal = this._nDataBytes * 8;
            var nBitsLeft = data.sigBytes * 8;

            // Add padding
            dataWords[nBitsLeft >>> 5] |= 0x80 << (24 - nBitsLeft % 32);

            var nBitsTotalH = Math.floor(nBitsTotal / 0x100000000);
            var nBitsTotalL = nBitsTotal;
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 15] = (
              (((nBitsTotalH << 8) | (nBitsTotalH >>> 24)) & 0x00ff00ff) |
              (((nBitsTotalH << 24) | (nBitsTotalH >>> 8)) & 0xff00ff00)
            );
            dataWords[(((nBitsLeft + 64) >>> 9) << 4) + 14] = (
              (((nBitsTotalL << 8) | (nBitsTotalL >>> 24)) & 0x00ff00ff) |
              (((nBitsTotalL << 24) | (nBitsTotalL >>> 8)) & 0xff00ff00)
            );

            data.sigBytes = (dataWords.length + 1) * 4;

            // Hash final blocks
            this._process();

            // Shortcuts
            var hash = this._hash;
            var H = hash.words;

            // Swap endian
            for (var i = 0; i < 4; i++) {
              // Shortcut
              var H_i = H[i];

              H[i] = (((H_i << 8) | (H_i >>> 24)) & 0x00ff00ff) |
                (((H_i << 24) | (H_i >>> 8)) & 0xff00ff00);
            }

            // Return final computed hash
            return hash;
          },

          clone: function() {
            var clone = Hasher.clone.call(this);
            clone._hash = this._hash.clone();

            return clone;
          }
        });

        function FF(a, b, c, d, x, s, t) {
          var n = a + ((b & c) | (~b & d)) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        function GG(a, b, c, d, x, s, t) {
          var n = a + ((b & d) | (c & ~d)) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        function HH(a, b, c, d, x, s, t) {
          var n = a + (b ^ c ^ d) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        function II(a, b, c, d, x, s, t) {
          var n = a + (c ^ (b | ~d)) + x + t;
          return ((n << s) | (n >>> (32 - s))) + b;
        }

        /**
         * Shortcut function to the hasher's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         *
         * @return {WordArray} The hash.
         *
         * @static
         *
         * @example
         *
         *     var hash = CryptoJS.MD5('message');
         *     var hash = CryptoJS.MD5(wordArray);
         */
        C.MD5 = Hasher._createHelper(MD5);

        /**
         * Shortcut function to the HMAC's object interface.
         *
         * @param {WordArray|string} message The message to hash.
         * @param {WordArray|string} key The secret key.
         *
         * @return {WordArray} The HMAC.
         *
         * @static
         *
         * @example
         *
         *     var hmac = CryptoJS.HmacMD5(message, key);
         */
        C.HmacMD5 = Hasher._createHmacHelper(MD5);
      }(Math));

      //evpkdf
      (function() {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var Base = C_lib.Base;
        var WordArray = C_lib.WordArray;
        var C_algo = C.algo;
        var MD5 = C_algo.MD5;

        /**
         * This key derivation function is meant to conform with EVP_BytesToKey.
         * www.openssl.org/docs/crypto/EVP_BytesToKey.html
         */
        var EvpKDF = C_algo.EvpKDF = Base.extend({
          /**
           * Configuration options.
           *
           * @property {number} keySize The key size in words to generate. Default: 4 (128 bits)
           * @property {Hasher} hasher The hash algorithm to use. Default: MD5
           * @property {number} iterations The number of iterations to perform. Default: 1
           */
          cfg: Base.extend({
            keySize: 128 / 32,
            hasher: MD5,
            iterations: 1
          }),

          /**
           * Initializes a newly created key derivation function.
           *
           * @param {Object} cfg (Optional) The configuration options to use for the derivation.
           *
           * @example
           *
           *     var kdf = CryptoJS.algo.EvpKDF.create();
           *     var kdf = CryptoJS.algo.EvpKDF.create({ keySize: 8 });
           *     var kdf = CryptoJS.algo.EvpKDF.create({ keySize: 8, iterations: 1000 });
           */
          init: function(cfg) {
            this.cfg = this.cfg.extend(cfg);
          },

          /**
           * Derives a key from a password.
           *
           * @param {WordArray|string} password The password.
           * @param {WordArray|string} salt A salt.
           *
           * @return {WordArray} The derived key.
           *
           * @example
           *
           *     var key = kdf.compute(password, salt);
           */
          compute: function(password, salt) {
            // Shortcut
            var cfg = this.cfg;

            // Init hasher
            var hasher = cfg.hasher.create();

            // Initial values
            var derivedKey = WordArray.create();

            // Shortcuts
            var derivedKeyWords = derivedKey.words;
            var keySize = cfg.keySize;
            var iterations = cfg.iterations;

            // Generate key
            while (derivedKeyWords.length < keySize) {
              if (block) {
                hasher.update(block);
              }
              var block = hasher.update(password).finalize(salt);
              hasher.reset();

              // Iterations
              for (var i = 1; i < iterations; i++) {
                block = hasher.finalize(block);
                hasher.reset();
              }

              derivedKey.concat(block);
            }
            derivedKey.sigBytes = keySize * 4;

            return derivedKey;
          }
        });

        /**
         * Derives a key from a password.
         *
         * @param {WordArray|string} password The password.
         * @param {WordArray|string} salt A salt.
         * @param {Object} cfg (Optional) The configuration options to use for this computation.
         *
         * @return {WordArray} The derived key.
         *
         * @static
         *
         * @example
         *
         *     var key = CryptoJS.EvpKDF(password, salt);
         *     var key = CryptoJS.EvpKDF(password, salt, { keySize: 8 });
         *     var key = CryptoJS.EvpKDF(password, salt, { keySize: 8, iterations: 1000 });
         */
        C.EvpKDF = function(password, salt, cfg) {
          return EvpKDF.create(cfg).compute(password, salt);
        };
      }());

      //cipher-core
      CryptoJS.lib.Cipher || (function(undefined) {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var Base = C_lib.Base;
        var WordArray = C_lib.WordArray;
        var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm;
        var C_enc = C.enc;
        var Utf8 = C_enc.Utf8;
        var Base64 = C_enc.Base64;
        var C_algo = C.algo;
        var EvpKDF = C_algo.EvpKDF;

        /**
         * Abstract base cipher template.
         *
         * @property {number} keySize This cipher's key size. Default: 4 (128 bits)
         * @property {number} ivSize This cipher's IV size. Default: 4 (128 bits)
         * @property {number} _ENC_XFORM_MODE A constant representing encryption mode.
         * @property {number} _DEC_XFORM_MODE A constant representing decryption mode.
         */
        var Cipher = C_lib.Cipher = BufferedBlockAlgorithm.extend({
          /**
           * Configuration options.
           *
           * @property {WordArray} iv The IV to use for this operation.
           */
          cfg: Base.extend(),

          /**
           * Creates this cipher in encryption mode.
           *
           * @param {WordArray} key The key.
           * @param {Object} cfg (Optional) The configuration options to use for this operation.
           *
           * @return {Cipher} A cipher instance.
           *
           * @static
           *
           * @example
           *
           *     var cipher = CryptoJS.algo.AES.createEncryptor(keyWordArray, { iv: ivWordArray });
           */
          createEncryptor: function(key, cfg) {
            return this.create(this._ENC_XFORM_MODE, key, cfg);
          },

          /**
           * Creates this cipher in decryption mode.
           *
           * @param {WordArray} key The key.
           * @param {Object} cfg (Optional) The configuration options to use for this operation.
           *
           * @return {Cipher} A cipher instance.
           *
           * @static
           *
           * @example
           *
           *     var cipher = CryptoJS.algo.AES.createDecryptor(keyWordArray, { iv: ivWordArray });
           */
          createDecryptor: function(key, cfg) {
            return this.create(this._DEC_XFORM_MODE, key, cfg);
          },

          /**
           * Initializes a newly created cipher.
           *
           * @param {number} xformMode Either the encryption or decryption transormation mode constant.
           * @param {WordArray} key The key.
           * @param {Object} cfg (Optional) The configuration options to use for this operation.
           *
           * @example
           *
           *     var cipher = CryptoJS.algo.AES.create(CryptoJS.algo.AES._ENC_XFORM_MODE, keyWordArray, { iv: ivWordArray });
           */
          init: function(xformMode, key, cfg) {
            // Apply config defaults
            this.cfg = this.cfg.extend(cfg);

            // Store transform mode and key
            this._xformMode = xformMode;
            this._key = key;

            // Set initial values
            this.reset();
          },

          /**
           * Resets this cipher to its initial state.
           *
           * @example
           *
           *     cipher.reset();
           */
          reset: function() {
            // Reset data buffer
            BufferedBlockAlgorithm.reset.call(this);

            // Perform concrete-cipher logic
            this._doReset();
          },

          /**
           * Adds data to be encrypted or decrypted.
           *
           * @param {WordArray|string} dataUpdate The data to encrypt or decrypt.
           *
           * @return {WordArray} The data after processing.
           *
           * @example
           *
           *     var encrypted = cipher.process('data');
           *     var encrypted = cipher.process(wordArray);
           */
          process: function(dataUpdate) {
            // Append
            this._append(dataUpdate);

            // Process available blocks
            return this._process();
          },

          /**
           * Finalizes the encryption or decryption process.
           * Note that the finalize operation is effectively a destructive, read-once operation.
           *
           * @param {WordArray|string} dataUpdate The final data to encrypt or decrypt.
           *
           * @return {WordArray} The data after final processing.
           *
           * @example
           *
           *     var encrypted = cipher.finalize();
           *     var encrypted = cipher.finalize('data');
           *     var encrypted = cipher.finalize(wordArray);
           */
          finalize: function(dataUpdate) {
            // Final data update
            if (dataUpdate) {
              this._append(dataUpdate);
            }

            // Perform concrete-cipher logic
            var finalProcessedData = this._doFinalize();

            return finalProcessedData;
          },

          keySize: 128 / 32,

          ivSize: 128 / 32,

          _ENC_XFORM_MODE: 1,

          _DEC_XFORM_MODE: 2,

          /**
           * Creates shortcut functions to a cipher's object interface.
           *
           * @param {Cipher} cipher The cipher to create a helper for.
           *
           * @return {Object} An object with encrypt and decrypt shortcut functions.
           *
           * @static
           *
           * @example
           *
           *     var AES = CryptoJS.lib.Cipher._createHelper(CryptoJS.algo.AES);
           */
          _createHelper: (function() {
            function selectCipherStrategy(key) {
              if (typeof key == 'string') {
                return PasswordBasedCipher;
              } else {
                return SerializableCipher;
              }
            }

            return function(cipher) {
              return {
                encrypt: function(message, key, cfg) {
                  return selectCipherStrategy(key).encrypt(cipher, message, key, cfg);
                },

                decrypt: function(ciphertext, key, cfg) {
                  return selectCipherStrategy(key).decrypt(cipher, ciphertext, key, cfg);
                }
              };
            };
          }())
        });

        /**
         * Abstract base stream cipher template.
         *
         * @property {number} blockSize The number of 32-bit words this cipher operates on. Default: 1 (32 bits)
         */
        var StreamCipher = C_lib.StreamCipher = Cipher.extend({
          _doFinalize: function() {
            // Process partial blocks
            var finalProcessedBlocks = this._process(!!'flush');

            return finalProcessedBlocks;
          },

          blockSize: 1
        });

        /**
         * Mode namespace.
         */
        var C_mode = C.mode = {};

        /**
         * Abstract base block cipher mode template.
         */
        var BlockCipherMode = C_lib.BlockCipherMode = Base.extend({
          /**
           * Creates this mode for encryption.
           *
           * @param {Cipher} cipher A block cipher instance.
           * @param {Array} iv The IV words.
           *
           * @static
           *
           * @example
           *
           *     var mode = CryptoJS.mode.CBC.createEncryptor(cipher, iv.words);
           */
          createEncryptor: function(cipher, iv) {
            return this.Encryptor.create(cipher, iv);
          },

          /**
           * Creates this mode for decryption.
           *
           * @param {Cipher} cipher A block cipher instance.
           * @param {Array} iv The IV words.
           *
           * @static
           *
           * @example
           *
           *     var mode = CryptoJS.mode.CBC.createDecryptor(cipher, iv.words);
           */
          createDecryptor: function(cipher, iv) {
            return this.Decryptor.create(cipher, iv);
          },

          /**
           * Initializes a newly created mode.
           *
           * @param {Cipher} cipher A block cipher instance.
           * @param {Array} iv The IV words.
           *
           * @example
           *
           *     var mode = CryptoJS.mode.CBC.Encryptor.create(cipher, iv.words);
           */
          init: function(cipher, iv) {
            this._cipher = cipher;
            this._iv = iv;
          }
        });

        /**
         * Cipher Block Chaining mode.
         */
        var CBC = C_mode.CBC = (function() {
          /**
           * Abstract base CBC mode.
           */
          var CBC = BlockCipherMode.extend();

          /**
           * CBC encryptor.
           */
          CBC.Encryptor = CBC.extend({
            /**
             * Processes the data block at offset.
             *
             * @param {Array} words The data words to operate on.
             * @param {number} offset The offset where the block starts.
             *
             * @example
             *
             *     mode.processBlock(data.words, offset);
             */
            processBlock: function(words, offset) {
              // Shortcuts
              var cipher = this._cipher;
              var blockSize = cipher.blockSize;

              // XOR and encrypt
              xorBlock.call(this, words, offset, blockSize);
              cipher.encryptBlock(words, offset);

              // Remember this block to use with next block
              this._prevBlock = words.slice(offset, offset + blockSize);
            }
          });

          /**
           * CBC decryptor.
           */
          CBC.Decryptor = CBC.extend({
            /**
             * Processes the data block at offset.
             *
             * @param {Array} words The data words to operate on.
             * @param {number} offset The offset where the block starts.
             *
             * @example
             *
             *     mode.processBlock(data.words, offset);
             */
            processBlock: function(words, offset) {
              // Shortcuts
              var cipher = this._cipher;
              var blockSize = cipher.blockSize;

              // Remember this block to use with next block
              var thisBlock = words.slice(offset, offset + blockSize);

              // Decrypt and XOR
              cipher.decryptBlock(words, offset);
              xorBlock.call(this, words, offset, blockSize);

              // This block becomes the previous block
              this._prevBlock = thisBlock;
            }
          });

          function xorBlock(words, offset, blockSize) {
            // Shortcut
            var iv = this._iv;

            // Choose mixing block
            if (iv) {
              var block = iv;

              // Remove IV for subsequent blocks
              this._iv = undefined;
            } else {
              var block = this._prevBlock;
            }

            // XOR blocks
            for (var i = 0; i < blockSize; i++) {
              words[offset + i] ^= block[i];
            }
          }

          return CBC;
        }());

        /**
         * Padding namespace.
         */
        var C_pad = C.pad = {};

        /**
         * PKCS #5/7 padding strategy.
         */
        var Pkcs7 = C_pad.Pkcs7 = {
          /**
           * Pads data using the algorithm defined in PKCS #5/7.
           *
           * @param {WordArray} data The data to pad.
           * @param {number} blockSize The multiple that the data should be padded to.
           *
           * @static
           *
           * @example
           *
           *     CryptoJS.pad.Pkcs7.pad(wordArray, 4);
           */
          pad: function(data, blockSize) {
            // Shortcut
            var blockSizeBytes = blockSize * 4;

            // Count padding bytes
            var nPaddingBytes = blockSizeBytes - data.sigBytes % blockSizeBytes;

            // Create padding word
            var paddingWord = (nPaddingBytes << 24) | (nPaddingBytes << 16) | (nPaddingBytes << 8) | nPaddingBytes;

            // Create padding
            var paddingWords = [];
            for (var i = 0; i < nPaddingBytes; i += 4) {
              paddingWords.push(paddingWord);
            }
            var padding = WordArray.create(paddingWords, nPaddingBytes);

            // Add padding
            data.concat(padding);
          },

          /**
           * Unpads data that had been padded using the algorithm defined in PKCS #5/7.
           *
           * @param {WordArray} data The data to unpad.
           *
           * @static
           *
           * @example
           *
           *     CryptoJS.pad.Pkcs7.unpad(wordArray);
           */
          unpad: function(data) {
            // Get number of padding bytes from last byte
            var nPaddingBytes = data.words[(data.sigBytes - 1) >>> 2] & 0xff;

            // Remove padding
            data.sigBytes -= nPaddingBytes;
          }
        };

        /**
         * Abstract base block cipher template.
         *
         * @property {number} blockSize The number of 32-bit words this cipher operates on. Default: 4 (128 bits)
         */
        var BlockCipher = C_lib.BlockCipher = Cipher.extend({
          /**
           * Configuration options.
           *
           * @property {Mode} mode The block mode to use. Default: CBC
           * @property {Padding} padding The padding strategy to use. Default: Pkcs7
           */
          cfg: Cipher.cfg.extend({
            mode: CBC,
            padding: Pkcs7
          }),

          reset: function() {
            // Reset cipher
            Cipher.reset.call(this);

            // Shortcuts
            var cfg = this.cfg;
            var iv = cfg.iv;
            var mode = cfg.mode;

            // Reset block mode
            if (this._xformMode == this._ENC_XFORM_MODE) {
              var modeCreator = mode.createEncryptor;
            } else /* if (this._xformMode == this._DEC_XFORM_MODE) */ {
              var modeCreator = mode.createDecryptor;

              // Keep at least one block in the buffer for unpadding
              this._minBufferSize = 1;
            }
            this._mode = modeCreator.call(mode, this, iv && iv.words);
          },

          _doProcessBlock: function(words, offset) {
            this._mode.processBlock(words, offset);
          },

          _doFinalize: function() {
            // Shortcut
            var padding = this.cfg.padding;

            // Finalize
            if (this._xformMode == this._ENC_XFORM_MODE) {
              // Pad data
              padding.pad(this._data, this.blockSize);

              // Process final blocks
              var finalProcessedBlocks = this._process(!!'flush');
            } else /* if (this._xformMode == this._DEC_XFORM_MODE) */ {
              // Process final blocks
              var finalProcessedBlocks = this._process(!!'flush');

              // Unpad data
              padding.unpad(finalProcessedBlocks);
            }

            return finalProcessedBlocks;
          },

          blockSize: 128 / 32
        });

        /**
         * A collection of cipher parameters.
         *
         * @property {WordArray} ciphertext The raw ciphertext.
         * @property {WordArray} key The key to this ciphertext.
         * @property {WordArray} iv The IV used in the ciphering operation.
         * @property {WordArray} salt The salt used with a key derivation function.
         * @property {Cipher} algorithm The cipher algorithm.
         * @property {Mode} mode The block mode used in the ciphering operation.
         * @property {Padding} padding The padding scheme used in the ciphering operation.
         * @property {number} blockSize The block size of the cipher.
         * @property {Format} formatter The default formatting strategy to convert this cipher params object to a string.
         */
        var CipherParams = C_lib.CipherParams = Base.extend({
          /**
           * Initializes a newly created cipher params object.
           *
           * @param {Object} cipherParams An object with any of the possible cipher parameters.
           *
           * @example
           *
           *     var cipherParams = CryptoJS.lib.CipherParams.create({
           *         ciphertext: ciphertextWordArray,
           *         key: keyWordArray,
           *         iv: ivWordArray,
           *         salt: saltWordArray,
           *         algorithm: CryptoJS.algo.AES,
           *         mode: CryptoJS.mode.CBC,
           *         padding: CryptoJS.pad.PKCS7,
           *         blockSize: 4,
           *         formatter: CryptoJS.format.OpenSSL
           *     });
           */
          init: function(cipherParams) {
            this.mixIn(cipherParams);
          },

          /**
           * Converts this cipher params object to a string.
           *
           * @param {Format} formatter (Optional) The formatting strategy to use.
           *
           * @return {string} The stringified cipher params.
           *
           * @throws Error If neither the formatter nor the default formatter is set.
           *
           * @example
           *
           *     var string = cipherParams + '';
           *     var string = cipherParams.toString();
           *     var string = cipherParams.toString(CryptoJS.format.OpenSSL);
           */
          toString: function(formatter) {
            return (formatter || this.formatter).stringify(this);
          }
        });

        /**
         * Format namespace.
         */
        var C_format = C.format = {};

        /**
         * OpenSSL formatting strategy.
         */
        var OpenSSLFormatter = C_format.OpenSSL = {
          /**
           * Converts a cipher params object to an OpenSSL-compatible string.
           *
           * @param {CipherParams} cipherParams The cipher params object.
           *
           * @return {string} The OpenSSL-compatible string.
           *
           * @static
           *
           * @example
           *
           *     var openSSLString = CryptoJS.format.OpenSSL.stringify(cipherParams);
           */
          stringify: function(cipherParams) {
            // Shortcuts
            var ciphertext = cipherParams.ciphertext;
            var salt = cipherParams.salt;

            // Format
            if (salt) {
              var wordArray = WordArray.create([0x53616c74, 0x65645f5f]).concat(salt).concat(ciphertext);
            } else {
              var wordArray = ciphertext;
            }

            return wordArray.toString(Base64);
          },

          /**
           * Converts an OpenSSL-compatible string to a cipher params object.
           *
           * @param {string} openSSLStr The OpenSSL-compatible string.
           *
           * @return {CipherParams} The cipher params object.
           *
           * @static
           *
           * @example
           *
           *     var cipherParams = CryptoJS.format.OpenSSL.parse(openSSLString);
           */
          parse: function(openSSLStr) {
            // Parse base64
            var ciphertext = Base64.parse(openSSLStr);

            // Shortcut
            var ciphertextWords = ciphertext.words;

            // Test for salt
            if (ciphertextWords[0] == 0x53616c74 && ciphertextWords[1] == 0x65645f5f) {
              // Extract salt
              var salt = WordArray.create(ciphertextWords.slice(2, 4));

              // Remove salt from ciphertext
              ciphertextWords.splice(0, 4);
              ciphertext.sigBytes -= 16;
            }

            return CipherParams.create({
              ciphertext: ciphertext,
              salt: salt
            });
          }
        };

        /**
         * A cipher wrapper that returns ciphertext as a serializable cipher params object.
         */
        var SerializableCipher = C_lib.SerializableCipher = Base.extend({
          /**
           * Configuration options.
           *
           * @property {Formatter} format The formatting strategy to convert cipher param objects to and from a string. Default: OpenSSL
           */
          cfg: Base.extend({
            format: OpenSSLFormatter
          }),

          /**
           * Encrypts a message.
           *
           * @param {Cipher} cipher The cipher algorithm to use.
           * @param {WordArray|string} message The message to encrypt.
           * @param {WordArray} key The key.
           * @param {Object} cfg (Optional) The configuration options to use for this operation.
           *
           * @return {CipherParams} A cipher params object.
           *
           * @static
           *
           * @example
           *
           *     var ciphertextParams = CryptoJS.lib.SerializableCipher.encrypt(CryptoJS.algo.AES, message, key);
           *     var ciphertextParams = CryptoJS.lib.SerializableCipher.encrypt(CryptoJS.algo.AES, message, key, { iv: iv });
           *     var ciphertextParams = CryptoJS.lib.SerializableCipher.encrypt(CryptoJS.algo.AES, message, key, { iv: iv, format: CryptoJS.format.OpenSSL });
           */
          encrypt: function(cipher, message, key, cfg) {
            // Apply config defaults
            cfg = this.cfg.extend(cfg);

            // Encrypt
            var encryptor = cipher.createEncryptor(key, cfg);
            var ciphertext = encryptor.finalize(message);

            // Shortcut
            var cipherCfg = encryptor.cfg;

            // Create and return serializable cipher params
            return CipherParams.create({
              ciphertext: ciphertext,
              key: key,
              iv: cipherCfg.iv,
              algorithm: cipher,
              mode: cipherCfg.mode,
              padding: cipherCfg.padding,
              blockSize: cipher.blockSize,
              formatter: cfg.format
            });
          },

          /**
           * Decrypts serialized ciphertext.
           *
           * @param {Cipher} cipher The cipher algorithm to use.
           * @param {CipherParams|string} ciphertext The ciphertext to decrypt.
           * @param {WordArray} key The key.
           * @param {Object} cfg (Optional) The configuration options to use for this operation.
           *
           * @return {WordArray} The plaintext.
           *
           * @static
           *
           * @example
           *
           *     var plaintext = CryptoJS.lib.SerializableCipher.decrypt(CryptoJS.algo.AES, formattedCiphertext, key, { iv: iv, format: CryptoJS.format.OpenSSL });
           *     var plaintext = CryptoJS.lib.SerializableCipher.decrypt(CryptoJS.algo.AES, ciphertextParams, key, { iv: iv, format: CryptoJS.format.OpenSSL });
           */
          decrypt: function(cipher, ciphertext, key, cfg) {
            // Apply config defaults
            cfg = this.cfg.extend(cfg);

            // Convert string to CipherParams
            ciphertext = this._parse(ciphertext, cfg.format);

            // Decrypt
            var plaintext = cipher.createDecryptor(key, cfg).finalize(ciphertext.ciphertext);

            return plaintext;
          },

          /**
           * Converts serialized ciphertext to CipherParams,
           * else assumed CipherParams already and returns ciphertext unchanged.
           *
           * @param {CipherParams|string} ciphertext The ciphertext.
           * @param {Formatter} format The formatting strategy to use to parse serialized ciphertext.
           *
           * @return {CipherParams} The unserialized ciphertext.
           *
           * @static
           *
           * @example
           *
           *     var ciphertextParams = CryptoJS.lib.SerializableCipher._parse(ciphertextStringOrParams, format);
           */
          _parse: function(ciphertext, format) {
            if (typeof ciphertext == 'string') {
              return format.parse(ciphertext, this);
            } else {
              return ciphertext;
            }
          }
        });

        /**
         * Key derivation function namespace.
         */
        var C_kdf = C.kdf = {};

        /**
         * OpenSSL key derivation function.
         */
        var OpenSSLKdf = C_kdf.OpenSSL = {
          /**
           * Derives a key and IV from a password.
           *
           * @param {string} password The password to derive from.
           * @param {number} keySize The size in words of the key to generate.
           * @param {number} ivSize The size in words of the IV to generate.
           * @param {WordArray|string} salt (Optional) A 64-bit salt to use. If omitted, a salt will be generated randomly.
           *
           * @return {CipherParams} A cipher params object with the key, IV, and salt.
           *
           * @static
           *
           * @example
           *
           *     var derivedParams = CryptoJS.kdf.OpenSSL.execute('Password', 256/32, 128/32);
           *     var derivedParams = CryptoJS.kdf.OpenSSL.execute('Password', 256/32, 128/32, 'saltsalt');
           */
          execute: function(password, keySize, ivSize, salt) {
            // Generate random salt
            if (!salt) {
              salt = WordArray.random(64 / 8);
            }

            // Derive key and IV
            var key = EvpKDF.create({
              keySize: keySize + ivSize
            }).compute(password, salt);

            // Separate key and IV
            var iv = WordArray.create(key.words.slice(keySize), ivSize * 4);
            key.sigBytes = keySize * 4;

            // Return params
            return CipherParams.create({
              key: key,
              iv: iv,
              salt: salt
            });
          }
        };

        /**
         * A serializable cipher wrapper that derives the key from a password,
         * and returns ciphertext as a serializable cipher params object.
         */
        var PasswordBasedCipher = C_lib.PasswordBasedCipher = SerializableCipher.extend({
          /**
           * Configuration options.
           *
           * @property {KDF} kdf The key derivation function to use to generate a key and IV from a password. Default: OpenSSL
           */
          cfg: SerializableCipher.cfg.extend({
            kdf: OpenSSLKdf
          }),

          /**
           * Encrypts a message using a password.
           *
           * @param {Cipher} cipher The cipher algorithm to use.
           * @param {WordArray|string} message The message to encrypt.
           * @param {string} password The password.
           * @param {Object} cfg (Optional) The configuration options to use for this operation.
           *
           * @return {CipherParams} A cipher params object.
           *
           * @static
           *
           * @example
           *
           *     var ciphertextParams = CryptoJS.lib.PasswordBasedCipher.encrypt(CryptoJS.algo.AES, message, 'password');
           *     var ciphertextParams = CryptoJS.lib.PasswordBasedCipher.encrypt(CryptoJS.algo.AES, message, 'password', { format: CryptoJS.format.OpenSSL });
           */
          encrypt: function(cipher, message, password, cfg) {
            // Apply config defaults
            cfg = this.cfg.extend(cfg);

            // Derive key and other params
            var derivedParams = cfg.kdf.execute(password, cipher.keySize, cipher.ivSize);

            // Add IV to config
            cfg.iv = derivedParams.iv;

            // Encrypt
            var ciphertext = SerializableCipher.encrypt.call(this, cipher, message, derivedParams.key, cfg);

            // Mix in derived params
            ciphertext.mixIn(derivedParams);

            return ciphertext;
          },

          /**
           * Decrypts serialized ciphertext using a password.
           *
           * @param {Cipher} cipher The cipher algorithm to use.
           * @param {CipherParams|string} ciphertext The ciphertext to decrypt.
           * @param {string} password The password.
           * @param {Object} cfg (Optional) The configuration options to use for this operation.
           *
           * @return {WordArray} The plaintext.
           *
           * @static
           *
           * @example
           *
           *     var plaintext = CryptoJS.lib.PasswordBasedCipher.decrypt(CryptoJS.algo.AES, formattedCiphertext, 'password', { format: CryptoJS.format.OpenSSL });
           *     var plaintext = CryptoJS.lib.PasswordBasedCipher.decrypt(CryptoJS.algo.AES, ciphertextParams, 'password', { format: CryptoJS.format.OpenSSL });
           */
          decrypt: function(cipher, ciphertext, password, cfg) {
            // Apply config defaults
            cfg = this.cfg.extend(cfg);

            // Convert string to CipherParams
            ciphertext = this._parse(ciphertext, cfg.format);

            // Derive key and other params
            var derivedParams = cfg.kdf.execute(password, cipher.keySize, cipher.ivSize, ciphertext.salt);

            // Add IV to config
            cfg.iv = derivedParams.iv;

            // Decrypt
            var plaintext = SerializableCipher.decrypt.call(this, cipher, ciphertext, derivedParams.key, cfg);

            return plaintext;
          }
        });
      }());

      //aes
      (function() {
        // Shortcuts
        var C = CryptoJS;
        var C_lib = C.lib;
        var BlockCipher = C_lib.BlockCipher;
        var C_algo = C.algo;

        // Lookup tables
        var SBOX = [];
        var INV_SBOX = [];
        var SUB_MIX_0 = [];
        var SUB_MIX_1 = [];
        var SUB_MIX_2 = [];
        var SUB_MIX_3 = [];
        var INV_SUB_MIX_0 = [];
        var INV_SUB_MIX_1 = [];
        var INV_SUB_MIX_2 = [];
        var INV_SUB_MIX_3 = [];

        // Compute lookup tables
        (function() {
          // Compute double table
          var d = [];
          for (var i = 0; i < 256; i++) {
            if (i < 128) {
              d[i] = i << 1;
            } else {
              d[i] = (i << 1) ^ 0x11b;
            }
          }

          // Walk GF(2^8)
          var x = 0;
          var xi = 0;
          for (var i = 0; i < 256; i++) {
            // Compute sbox
            var sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
            sx = (sx >>> 8) ^ (sx & 0xff) ^ 0x63;
            SBOX[x] = sx;
            INV_SBOX[sx] = x;

            // Compute multiplication
            var x2 = d[x];
            var x4 = d[x2];
            var x8 = d[x4];

            // Compute sub bytes, mix columns tables
            var t = (d[sx] * 0x101) ^ (sx * 0x1010100);
            SUB_MIX_0[x] = (t << 24) | (t >>> 8);
            SUB_MIX_1[x] = (t << 16) | (t >>> 16);
            SUB_MIX_2[x] = (t << 8) | (t >>> 24);
            SUB_MIX_3[x] = t;

            // Compute inv sub bytes, inv mix columns tables
            var t = (x8 * 0x1010101) ^ (x4 * 0x10001) ^ (x2 * 0x101) ^ (x * 0x1010100);
            INV_SUB_MIX_0[sx] = (t << 24) | (t >>> 8);
            INV_SUB_MIX_1[sx] = (t << 16) | (t >>> 16);
            INV_SUB_MIX_2[sx] = (t << 8) | (t >>> 24);
            INV_SUB_MIX_3[sx] = t;

            // Compute next counter
            if (!x) {
              x = xi = 1;
            } else {
              x = x2 ^ d[d[d[x8 ^ x2]]];
              xi ^= d[d[xi]];
            }
          }
        }());

        // Precomputed Rcon lookup
        var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

        /**
         * AES block cipher algorithm.
         */
        var AES = C_algo.AES = BlockCipher.extend({
          _doReset: function() {
            // Shortcuts
            var key = this._key;
            var keyWords = key.words;
            var keySize = key.sigBytes / 4;

            // Compute number of rounds
            var nRounds = this._nRounds = keySize + 6

            // Compute number of key schedule rows
            var ksRows = (nRounds + 1) * 4;

            // Compute key schedule
            var keySchedule = this._keySchedule = [];
            for (var ksRow = 0; ksRow < ksRows; ksRow++) {
              if (ksRow < keySize) {
                keySchedule[ksRow] = keyWords[ksRow];
              } else {
                var t = keySchedule[ksRow - 1];

                if (!(ksRow % keySize)) {
                  // Rot word
                  t = (t << 8) | (t >>> 24);

                  // Sub word
                  t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 0xff] << 16) | (SBOX[(t >>> 8) & 0xff] << 8) | SBOX[t & 0xff];

                  // Mix Rcon
                  t ^= RCON[(ksRow / keySize) | 0] << 24;
                } else if (keySize > 6 && ksRow % keySize == 4) {
                  // Sub word
                  t = (SBOX[t >>> 24] << 24) | (SBOX[(t >>> 16) & 0xff] << 16) | (SBOX[(t >>> 8) & 0xff] << 8) | SBOX[t & 0xff];
                }

                keySchedule[ksRow] = keySchedule[ksRow - keySize] ^ t;
              }
            }

            // Compute inv key schedule
            var invKeySchedule = this._invKeySchedule = [];
            for (var invKsRow = 0; invKsRow < ksRows; invKsRow++) {
              var ksRow = ksRows - invKsRow;

              if (invKsRow % 4) {
                var t = keySchedule[ksRow];
              } else {
                var t = keySchedule[ksRow - 4];
              }

              if (invKsRow < 4 || ksRow <= 4) {
                invKeySchedule[invKsRow] = t;
              } else {
                invKeySchedule[invKsRow] = INV_SUB_MIX_0[SBOX[t >>> 24]] ^ INV_SUB_MIX_1[SBOX[(t >>> 16) & 0xff]] ^
                  INV_SUB_MIX_2[SBOX[(t >>> 8) & 0xff]] ^ INV_SUB_MIX_3[SBOX[t & 0xff]];
              }
            }
          },

          encryptBlock: function(M, offset) {
            this._doCryptBlock(M, offset, this._keySchedule, SUB_MIX_0, SUB_MIX_1, SUB_MIX_2, SUB_MIX_3, SBOX);
          },

          decryptBlock: function(M, offset) {
            // Swap 2nd and 4th rows
            var t = M[offset + 1];
            M[offset + 1] = M[offset + 3];
            M[offset + 3] = t;

            this._doCryptBlock(M, offset, this._invKeySchedule, INV_SUB_MIX_0, INV_SUB_MIX_1, INV_SUB_MIX_2, INV_SUB_MIX_3, INV_SBOX);

            // Inv swap 2nd and 4th rows
            var t = M[offset + 1];
            M[offset + 1] = M[offset + 3];
            M[offset + 3] = t;
          },

          _doCryptBlock: function(M, offset, keySchedule, SUB_MIX_0, SUB_MIX_1, SUB_MIX_2, SUB_MIX_3, SBOX) {
            // Shortcut
            var nRounds = this._nRounds;

            // Get input, add round key
            var s0 = M[offset] ^ keySchedule[0];
            var s1 = M[offset + 1] ^ keySchedule[1];
            var s2 = M[offset + 2] ^ keySchedule[2];
            var s3 = M[offset + 3] ^ keySchedule[3];

            // Key schedule row counter
            var ksRow = 4;

            // Rounds
            for (var round = 1; round < nRounds; round++) {
              // Shift rows, sub bytes, mix columns, add round key
              var t0 = SUB_MIX_0[s0 >>> 24] ^ SUB_MIX_1[(s1 >>> 16) & 0xff] ^ SUB_MIX_2[(s2 >>> 8) & 0xff] ^ SUB_MIX_3[s3 & 0xff] ^ keySchedule[ksRow++];
              var t1 = SUB_MIX_0[s1 >>> 24] ^ SUB_MIX_1[(s2 >>> 16) & 0xff] ^ SUB_MIX_2[(s3 >>> 8) & 0xff] ^ SUB_MIX_3[s0 & 0xff] ^ keySchedule[ksRow++];
              var t2 = SUB_MIX_0[s2 >>> 24] ^ SUB_MIX_1[(s3 >>> 16) & 0xff] ^ SUB_MIX_2[(s0 >>> 8) & 0xff] ^ SUB_MIX_3[s1 & 0xff] ^ keySchedule[ksRow++];
              var t3 = SUB_MIX_0[s3 >>> 24] ^ SUB_MIX_1[(s0 >>> 16) & 0xff] ^ SUB_MIX_2[(s1 >>> 8) & 0xff] ^ SUB_MIX_3[s2 & 0xff] ^ keySchedule[ksRow++];

              // Update state
              s0 = t0;
              s1 = t1;
              s2 = t2;
              s3 = t3;
            }

            // Shift rows, sub bytes, add round key
            var t0 = ((SBOX[s0 >>> 24] << 24) | (SBOX[(s1 >>> 16) & 0xff] << 16) | (SBOX[(s2 >>> 8) & 0xff] << 8) | SBOX[s3 & 0xff]) ^ keySchedule[ksRow++];
            var t1 = ((SBOX[s1 >>> 24] << 24) | (SBOX[(s2 >>> 16) & 0xff] << 16) | (SBOX[(s3 >>> 8) & 0xff] << 8) | SBOX[s0 & 0xff]) ^ keySchedule[ksRow++];
            var t2 = ((SBOX[s2 >>> 24] << 24) | (SBOX[(s3 >>> 16) & 0xff] << 16) | (SBOX[(s0 >>> 8) & 0xff] << 8) | SBOX[s1 & 0xff]) ^ keySchedule[ksRow++];
            var t3 = ((SBOX[s3 >>> 24] << 24) | (SBOX[(s0 >>> 16) & 0xff] << 16) | (SBOX[(s1 >>> 8) & 0xff] << 8) | SBOX[s2 & 0xff]) ^ keySchedule[ksRow++];

            // Set output
            M[offset] = t0;
            M[offset + 1] = t1;
            M[offset + 2] = t2;
            M[offset + 3] = t3;
          },

          keySize: 256 / 32
        });

        /**
         * Shortcut functions to the cipher's object interface.
         *
         * @example
         *
         *     var ciphertext = CryptoJS.AES.encrypt(message, key, cfg);
         *     var plaintext  = CryptoJS.AES.decrypt(ciphertext, key, cfg);
         */
        C.AES = BlockCipher._createHelper(AES);
      }());

      return CryptoJS;
    });
    define('gc-fp/lib/_',['./crypto'], function (crypto) {
      var _;

      function isFunction(e) {
        return typeof e === 'function';
      }

      function isUndefined(e) {
        return typeof e === 'undefined';
      }

      function isNullOrUndefined(e) {
        return e === null || isUndefined(e);
      }

      function isArray(e) {
        return e && e.constructor === Array;
      }

      function isString(e) {
        return typeof e === 'string';
      }

      function isNumber(e) {
        return typeof e === 'number';
      }

      function isIp(e) {
        var regex =
          /((^\s*((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\s*$)|(^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$))/;
        return regex.test(e);
      }

      function isEmpty(obj) {
        for (var prop in obj) {
          if (obj.hasOwnProperty(prop)) {
            return false;
          }
        }
        return true;
      }

      var has = function (arr, obj) {
          return arr && arr.indexOf(obj) > -1;
        },
        trim = function (e) {
          return isString(e) ? e.trim() : e;
        },
        body = function () {
          return document.body || document.getElementsByTagName('body')[0];
        },
        isPrimary = function (e) {
          return ['undefined', 'boolean', 'number', 'string'].indexOf(typeof e) > -1 || e === null;
        },
        isFalsy = function (e) {
          return e === null || typeof e === 'undefined' || e === '';
        },
        prettyValue = function (e) {
          return isFalsy(e) ? '' : e;
        },
        pick = function (obj, keys) {
          var result = {};
          for (var i = 0, j = keys.length; i < j; i++) {
            result[keys[i]] = obj[keys[i]];
          }
          return result;
        };

      /**
       * @param obj Object The object to flatten
       * @param prefix String (Optional) The prefix to add before each key, also used for recursion
       **/
      function flattenObject(obj, prefix, result) {
        result = result || {};
        try {
          // Preserve empty jjects and arrays, they are lost otherwise
          if (prefix && typeof obj === 'object' && obj !== null && Object.keys(obj).length === 0) {
            result[prefix] = Array.isArray(obj) ? [] : {};
            return result;
          }

          prefix = prefix ? prefix + '.' : '';
          var keys = Object.keys(obj);
          for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              if (typeof obj[key] === 'object' && obj[key] !== null) {
                // Recursion on deeper objects
                flattenObject(obj[key], prefix + key, result);
              } else {
                result[prefix + key] = prettyValue(obj[key]);
              }
            }
          }
          return result;
        } catch (error) {
          return result;
        }
      }

      function template(tmpl, data) {
        var dataObject = flattenObject(data);
        try {
          for (var attr in dataObject) {
            var value = dataObject[attr];
            tmpl = tmpl.replace(new RegExp('{{' + attr + '}}', 'g'), value);
          }
          return tmpl;
        } catch (e) {
          return tmpl;
        }
      }

      function assign() {
        var target;
        if (arguments && arguments.length > 1) {
          target = arguments[0];
          for (var i = 1, j = arguments.length; i < j; i++) {
            var obj = arguments[i];
            for (var key in obj) {
              if (obj && obj.hasOwnProperty(key)) {
                target[key] = obj[key];
              }
            }
          }
        }
        return target;
      }

      function hash(input) {
        var hash = 5381,
          i = input.length;
        while (i) {
          hash = (hash * 33) ^ input.charCodeAt(--i);
        }
        return (hash >>> 0).toString();
      }

      var sha1 = function (e) {
          return e ? crypto.SHA1(e).toString() : '';
        },
        sha256 = function (e) {
          return e ? crypto.SHA256(e).toString(crypto.enc.Hex) : '';
        },
        hmacSha256 = function (input, key) {
          return crypto.lib.Hasher._createHmacHelper(crypto.algo.SHA256)(input, key).toString();
        },
        md5 = function (e) {
          return e ? crypto.MD5(e).toString() : '';
        };

      function bit(e) {
        return e ? 1 : 0;
      }

      function bitStr(e) {
        return e ? '1' : '0';
      }

      function xml(e) {
        return ('<?xml version="1.0" encoding="UTF-8"?>' + e).replace(/\\"/g, '"');
      }

      function twoChars(e) {
        return ('0' + e).slice(-2);
      }

      function timeZoneOffsetToString(e) {
        var prefix = e < 0 ? '-' : '+';
        e = Math.abs(e);
        var addZero = function (x) {
            return x < 10 ? '0' + x : x;
          },
          hours = addZero(Math.floor(e / 60)),
          minutes = addZero(e % 60),
          result = 'UTC' + prefix + hours + ':' + minutes;
        return result;
      }

      function findTheBestAcc(positions) {
        var pos;
        if (positions && positions.length) {
          for (var i = 0, j = positions.length; i < j; i++) {
            if (!pos || pos.acc > positions[i].acc) {
              pos = positions[i];
            }
          }
        }
        return pos;
      }

      //base64
      var base64 = (function () {
        //For IE 6,7,8,9 and Opera 10
        function utf8Encode(input) {
          var c, n, output;
          input = input.replace(/\r\n/g, '\n');
          output = '';
          n = 0;
          while (n < input.length) {
            c = input.charCodeAt(n);
            if (c < 128) {
              output += String.fromCharCode(c);
            } else if (127 < c && c < 2048) {
              output += String.fromCharCode((c >> 6) | 192);
              output += String.fromCharCode((c & 63) | 128);
            } else {
              output += String.fromCharCode((c >> 12) | 224);
              output += String.fromCharCode(((c >> 6) & 63) | 128);
              output += String.fromCharCode((c & 63) | 128);
            }
            ++n;
          }
          return output;
        }
        var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

        function encodeBase64ByUtf8(input) {
          var chr1, chr2, chr3, enc1, enc2, enc3, enc4, i, output;
          i = 0;
          input = utf8Encode(input);
          output = '';
          while (i < input.length) {
            chr1 = input.charCodeAt(i++);
            chr2 = input.charCodeAt(i++);
            chr3 = input.charCodeAt(i++);
            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;
            if (isNaN(chr2)) {
              enc3 = enc4 = 64;
            } else {
              if (isNaN(chr3)) {
                enc4 = 64;
              }
            }
            output = output + CHARS.charAt(enc1) + CHARS.charAt(enc2) + CHARS.charAt(enc3) + CHARS.charAt(enc4);
          }
          return output;
        }
        //For IE 6,7,8,9 and Opera 10
        function utf8Decode(input) {
          var c, c1, c2, c3, i, output;
          output = '';
          i = c = c1 = c2 = 0;
          while (i < input.length) {
            c = input.charCodeAt(i);
            if (c < 128) {
              output += String.fromCharCode(c);
              i++;
            } else if (191 < c && c < 224) {
              c2 = input.charCodeAt(i + 1);
              output += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
              i += 2;
            } else {
              c2 = input.charCodeAt(i + 1);
              c3 = input.charCodeAt(i + 2);
              output += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
              i += 3;
            }
          }
          return output;
        }

        function decodeBase64ByUtf8(input) {
          var chr1, chr2, chr3, enc1, enc2, enc3, enc4, i, output;
          i = 0;
          input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
          output = '';
          while (i < input.length) {
            enc1 = CHARS.indexOf(input.charAt(i++));
            enc2 = CHARS.indexOf(input.charAt(i++));
            enc3 = CHARS.indexOf(input.charAt(i++));
            enc4 = CHARS.indexOf(input.charAt(i++));
            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;
            output = output + String.fromCharCode(chr1);
            if (enc3 !== 64) {
              output = output + String.fromCharCode(chr2);
            }
            if (enc4 !== 64) {
              output = output + String.fromCharCode(chr3);
            }
          }
          output = utf8Decode(output);
          return output;
        }

        function encodeBase64(input) {
          return isFunction(window.btoa) ? window.btoa(encodeURIComponent(window.escape(input))) : encodeBase64ByUtf8(input);
        }

        function decodeBase64(input) {
          return isFunction(window.atob) ? window.unescape(decodeURIComponent(window.atob(input))) : decodeBase64ByUtf8(input);
        }
        return {
          encode: encodeBase64,
          decode: decodeBase64,
          encodeBase64ByUtf8: encodeBase64ByUtf8,
          decodeBase64ByUtf8: decodeBase64ByUtf8
        };
      })();

      //uuidv4
      var uuidv4 = (function () {
        var dec2hex = [];
        for (var i = 0; i <= 15; i++) {
          dec2hex[i] = i.toString(16).toUpperCase();
        }
        return {
          generate: function () {
            var uuid = '';
            for (var i = 1; i <= 36; i++) {
              if (i === 9 || i === 14 || i === 19 || i === 24) {
                uuid += '-';
              } else if (i === 15) {
                uuid += 4;
              } else if (i === 20) {
                uuid += dec2hex[(Math.random() * 4) | (0 + 8)];
              } else {
                uuid += dec2hex[(Math.random() * 15) | 0];
              }
            }
            return uuid;
          },
          validate: function (value) {
            return /^[0-9a-f]{8}\-[0-9a-f]{4}\-4[0-9a-f]{3}\-[0-9a-f]{4}\-[0-9a-f]{12}$/i.test(value);
          }
        };
      })();

      //utils
      function mostOccurring(arr) {
        var frequency = {};
        var times = 0;
        var result;
        for (var i = 0, j = arr.length; i < j; i++) {
          var e = arr[i];
          if (e) {
            frequency[e] = (frequency[e] || 0) + 1;
            if (frequency[e] > times) {
              times = frequency[e];
              result = e;
            }
          }
        }
        return result;
      }

      function putQuery(str, key, value) {
        var end, idx;
        if ((idx = str.indexOf('&' + key + '=')) !== -1 || (idx = str.indexOf(key + '=')) === 0) {
          if ((end = str.indexOf('&', idx + 1)) !== -1) {
            return str.substr(0, idx) + str.substr(end + (idx ? 0 : 1)) + '&' + key + '=' + value;
          } else {
            return str.substr(0, idx) + '&' + key + '=' + value;
          }
        } else {
          return str + '&' + key + '=' + value;
        }
      }

      function getQuery(key, text) {
        var matches;
        if (!text || typeof text !== 'string') {
          return '';
        }
        matches = new RegExp('(?:^|[;&])\\s?' + key + '=([^&;]*)').exec(text);
        if (matches && matches.length) {
          return matches[1];
        } else {
          return '';
        }
      }

      function onLine() {
        return navigator.onLine;
      }

      function getNetworkStatus(onOnline, onOffline) {
        if (!_.onLine()) {
          if (isFunction(onOffline)) {
            onOffline();
          }
        } else {
          if (isFunction(onOnline)) {
            onOnline();
          }
        }
      }

      function swap(json) {
        var ret = {};
        for (var key in json) {
          ret[json[key]] = key;
        }
        return ret;
      }

      function retry(until, callback, opts) {
        opts = opts || {};
        var count = 0,
          retries = isUndefined(opts.max_retry) ? 50 : opts.max_retry,
          interval = opts.interval || 10,
          shortIntervalId,
          longInterval = 1000,
          longRetries = Math.ceil((retries * interval) / longInterval),
          longCount = 0,
          longIntervalId,
          done = false,
          performCallback = function (timeout) {
            if (done) {
              return;
            }
            done = true;
            window.clearInterval(shortIntervalId);
            if (longIntervalId) {
              window.clearInterval(longIntervalId);
            }
            if (isFunction(callback)) {
              callback(timeout);
            }
          };
        shortIntervalId = window.setInterval(function () {
          if (until()) {
            performCallback(false);
          }
          if (++count >= retries) {
            performCallback(true);
          }
        }, interval);
        if (interval !== longInterval) {
          longIntervalId = window.setInterval(function () {
            if (until()) {
              performCallback(false);
            }
            if (++longCount >= longRetries) {
              performCallback(true);
            }
          }, longInterval);
        }
      }

      function ts() {
        return new Date().getTime();
      }

      var async = (function () {
        function rest(func) {
          return function () {
            var args = arguments,
              index = -1,
              length = Math.max(args.length - 1, 0),
              array = Array(length);
            while (++index < length) {
              array[index] = args[1 + index];
            }
            return func.call(this, args[0], array);
          };
        }

        function once(func) {
          var result;
          return function () {
            if (func) {
              result = func.apply(this, arguments);
            }
            func = undefined;
            return result;
          };
        }

        function onlyOnce(fn) {
          return function () {
            if (isFunction(fn)) {
              fn.apply(this, arguments);
            }
            fn = null;
          };
        }

        function keyIterator(coll) {
          var i = -1;
          var len;
          len = coll.length;
          return function next() {
            i++;
            return i < len ? i : null;
          };
        }

        function eachOfLimit(limit) {
          return function (obj, iterator, callback) {
            callback = once(callback);
            obj = obj || [];
            var nextKey = keyIterator(obj);
            if (limit <= 0) {
              return callback(null);
            }
            var done = false;
            var running = 0;
            var errored = false;
            (function replenish() {
              if (done && running <= 0) {
                return callback(null);
              }
              var run = function (err) {
                running -= 1;
                if (err) {
                  callback(err);
                  errored = true;
                } else {
                  replenish();
                }
              };
              while (running < limit && !errored) {
                var key = nextKey();
                if (key === null) {
                  done = true;
                  if (running <= 0) {
                    callback(null);
                  }
                  return;
                }
                running += 1;
                iterator(obj[key], key, onlyOnce(run));
              }
            })();
          };
        }

        function doLimit(fn, limit) {
          return function (iterable, iterator, callback) {
            return fn(iterable, limit, iterator, callback);
          };
        }

        function doPrallel(eachfn, tasks, callback) {
          var results = [];
          eachfn(
            tasks,
            function (task, key, callback) {
              task(
                rest(function (err, args) {
                  if (args.length <= 1) {
                    args = args[0];
                  }
                  results[key] = args;
                  callback(err);
                })
              );
            },
            function (err) {
              callback(err, results);
            }
          );
        }
        var parallel = doLimit(function (tasks, limit, cb) {
          return doPrallel(eachOfLimit(limit), tasks, cb);
        }, Infinity);
        return {
          parallel: parallel
        };
      })();

      function ready(callback) {
        document.addEventListener('DOMContentLoaded', callback, false);
      }

      function parseJSON(e) {
        return JSON.parse(e);
      }

      function getDOMParser() {
        return window.DOMParser ? new DOMParser() : null;
      }

      function getActiveXObject() {
        return window.ActiveXObject ? new ActiveXObject('Microsoft.XMLDOM') : null;
      }

      function parseXML(e) {
        try {
          var parser = _.getDOMParser();
          if (parser) {
            return parser.parseFromString(e, 'text/xml');
          } else {
            var xml = _.getActiveXObject();
            if (xml) {
              xml.async = 'false';
              xml.loadXML(e);
              return xml;
            }
          }
        } catch (err) {
          return '';
        }
      }

      function isValidXml(e) {
        var xml = parseXML(e);
        return xml && xml.getElementsByTagName && xml.getElementsByTagName('parsererror').length === 0;
      }

      function escapeXml(e) {
        if (isNullOrUndefined(e)) {
          e = '';
        }
        return ('' + e).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
      }

      function generateDnsUid() {
        var f, pad, part1, part2, r, s, uuid;
        r = Math.random;
        f = Math.floor;
        s = 0xffffff;
        pad = function (str, digits, _char) {
          if (!_char) {
            _char = '0';
          }
          while (str.length < digits) {
            str = _char + str;
          }
          return str;
        };
        part1 = pad(f(ts() * 1000 + r() * 1000).toString(16), 14);
        part2 = pad(f(r() * s).toString(16), 6) + pad(f(r() * s).toString(16), 6) + pad(f(r() * s).toString(16), 6);
        uuid = part1 + part2;
        return uuid;
      }

      var oneRow, toXml;
      oneRow = function (key, obj) {
        if (isPrimary(obj)) {
          return isFalsy(obj) ? '<' + key + ' />' : '<' + key + '>' + escapeXml(obj) + '</' + key + '>';
        }
        if (isFunction(obj)) {
          return oneRow(key, obj());
        }
        var nested = '';
        if (isArray(obj)) {
          for (var i = 0, j = obj.length; i < j; i++) {
            nested += toXml(obj[i]);
          }
          return isFalsy(nested) ? '<' + key + ' />' : '<' + key + '>' + nested + '</' + key + '>';
        }
        if (typeof obj === 'object') {
          var attrs = '',
            p1;
          if (obj.attrs) {
            for (var attr in obj.attrs) {
              attrs += ' ' + attr + '="' + escapeXml(prettyValue(obj.attrs[attr])) + '"';
            }
          }
          p1 = '<' + key + attrs;
          if (obj.hasOwnProperty('value')) {
            return isFalsy(obj.value) ? p1 + ' />' : p1 + '>' + escapeXml(obj.value) + '</' + key + '>';
          }
          for (var x in obj) {
            if (x !== 'attrs' && obj.hasOwnProperty(x)) {
              nested += oneRow(x, obj[x]);
            }
          }
          return isFalsy(nested) ? p1 + ' />' : p1 + '>' + nested + '</' + key + '>';
        }
        return '';
      };
      toXml = function (obj) {
        var xml = '';
        for (var key in obj) {
          if (obj.hasOwnProperty(key)) {
            xml += oneRow(key, obj[key]);
          }
        }
        return xml;
      };
      var sort = function (arr) {
          if (isArray(arr)) {
            return arr.sort(function (a, b) {
              return a - b;
            });
          } else {
            return arr;
          }
        },
        pushUnique = function (arr, e) {
          if (!has(arr, e)) {
            arr.push(e);
          }
        };

      var hasCryptoWithSubtle = function () {
        try {
          var crypto = window.crypto || window.msCrypto;
          if (!isNullOrUndefined(crypto) && !isNullOrUndefined(crypto.subtle) && typeof crypto.getRandomValues === 'function' && typeof crypto.subtle.importKey === 'function') {
            return true;
          } else {
            return false;
          }
        } catch (e) {
          return false;
        }
      };

      var formatHexString = function (hexString) {
        if (!hexString) {
          return '';
        }
        var hexStringArray = [];
        for (var i = 0, len = hexString.length; i < len; i += 2) {
          hexStringArray.push(hexString.substr(i, 2));
        }
        return hexStringArray.join(':');
      };

      var arrayByteToHexString = function (ab) {
        if (!ab) {
          return '';
        }

        var hs = '';
        for (var i = 0; i < ab.length; i++) {
          var hex = (ab[i] & 0xff).toString(16);
          hex = hex.length === 1 ? '0' + hex : hex;
          hs += hex;
        }

        return hs;
      };

      var hexStringToArrayByte = function (str) {
        if (typeof str !== 'string' || !str) {
          return null;
        }
        var a = [];
        for (var i = 0, len = str.length; i < len; i += 2) {
          a.push(parseInt(str.substr(i, 2), 16));
        }

        return new Uint8Array(a);
      };

      var arrayBufferToBase64 = function (buffer) {
        try {
          var binary = '';
          var bytes = new Uint8Array(buffer);
          var len = bytes.byteLength;
          for (var i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          return window.btoa(binary);
        } catch (e) {
          return '';
        }
      };

      var stringToArrayByte = function (str) {
        if (typeof str !== 'string' || !str) {
          return null;
        }
        var buf = new ArrayBuffer(str.length);
        var bufView = new Uint8Array(buf);
        for (var i = 0, strLen = str.length; i < strLen; i++) {
          bufView[i] = str.charCodeAt(i);
        }
        return buf;
      };

      var getRandomString = function (len) {
        try {
          var cryptoBrowser = window.crypto || window.msCrypto;
          if (isNullOrUndefined(cryptoBrowser)) {
            return null;
          }
          var rs = new Uint8Array(len);
          cryptoBrowser.getRandomValues(rs);
          return rs;
        } catch (e) {
          return null;
        }
      };

      var appendUrlParam = function (url, param, value) {
        try {
          url += url.indexOf('?') >= 0 ? '&' : '?';
          url += param + '=' + value;
          return url;
        } catch (e) {
          return '';
        }
      };

      var encrypt = function (value, key, iv) {
        key = crypto.enc.Utf8.parse(key);
        iv = crypto.enc.Utf8.parse(iv || '');
        return crypto.AES.encrypt(value, key, {
          iv: iv
        }).toString();
      };

      var decrypt = function (value, key, iv) {
        try {
          key = crypto.enc.Utf8.parse(key);
          iv = crypto.enc.Utf8.parse(iv || '');
          var result = crypto.AES.decrypt(value, key, {
            iv: iv
          });
          return result ? result.toString(crypto.enc.Utf8) : '';
        } catch (e) {
          return '';
        }
      };

      var encryptMvp = function (value, key, iv) {
        try {
          key = crypto.enc.Hex.parse(key);
          iv = crypto.enc.Hex.parse(iv || '');
          return crypto.AES.encrypt(value, key, {
            iv: iv,
            mode: crypto.mode.CBC
          }).toString();
        } catch (e) {
          return '';
        }
      };

      var decryptMvp = function (value, key, iv) {
        try {
          key = crypto.enc.Hex.parse(key);
          iv = crypto.enc.Hex.parse(iv || '');
          var result = crypto.AES.decrypt(value, key, {
            iv: iv,
            mode: crypto.mode.CBC
          });
          return result ? result.toString(crypto.enc.Utf8) : '';
        } catch (e) {
          return '';
        }
      };

      _ = {
        //lodash interface
        noop: function () {},
        isFunction: isFunction,
        isUndefined: isUndefined,
        isNullOrUndefined: isNullOrUndefined,
        isArray: isArray,
        isString: isString,
        isNumber: isNumber,
        isIp: isIp,
        isEmpty: isEmpty,
        template: template,
        assign: assign,
        hash: hash,
        sha1: sha1,
        sha256: sha256,
        hmacSha256: hmacSha256,
        md5: md5,
        bit: bit,
        bitStr: bitStr,
        xml: xml,
        twoChars: twoChars,
        timeZoneOffsetToString: timeZoneOffsetToString,
        findTheBestAcc: findTheBestAcc,
        //others
        base64: base64,
        uuidv4: uuidv4,
        mostOccurring: mostOccurring,
        putQuery: putQuery,
        getQuery: getQuery,
        onLine: onLine,
        getNetworkStatus: getNetworkStatus,
        ts: ts,
        swap: swap,
        retry: retry,
        async: async,
        ready: ready,
        parseJSON: parseJSON,
        getDOMParser: getDOMParser,
        getActiveXObject: getActiveXObject,
        parseXML: parseXML,
        isValidXml: isValidXml,
        escapeXml: escapeXml,
        generateDnsUid: generateDnsUid,
        has: has,
        trim: trim,
        body: body,
        toXml: toXml,
        pick: pick,
        sort: sort,
        pushUnique: pushUnique,
        getRandomString: getRandomString,
        hasCryptoWithSubtle: hasCryptoWithSubtle,
        formatHexString: formatHexString,
        arrayByteToHexString: arrayByteToHexString,
        hexStringToArrayByte: hexStringToArrayByte,
        arrayBufferToBase64: arrayBufferToBase64,
        stringToArrayByte: stringToArrayByte,
        appendUrlParam: appendUrlParam,
        flattenObject: flattenObject
      };
      /*jshint sub:true*/
      _['encrypt'] = encrypt;
      _['decrypt'] = decrypt;
      _['encryptMvp'] = encryptMvp;
      _['decryptMvp'] = decryptMvp;
      /*jshint sub:false*/
      return _;
    });

    define('gc-fp/lib/storage',['./_'], function (_) {
      var local = (function () {
        var localStorage;
        try {
          localStorage = window.localStorage;
        } catch (e) {}
        var enabled = true;
        try {
          var localStorageSample = '__test__';
          localStorage.setItem(localStorageSample, localStorageSample);
          if (localStorage.getItem(localStorageSample) !== localStorageSample) {
            enabled = false;
          }
          localStorage.removeItem(localStorageSample);
        } catch (e) {
          enabled = false;
        }
        return {
          enabled: enabled,
          get: function (name) {
            return enabled && localStorage && _.isFunction(localStorage.getItem) ? localStorage.getItem(name) : '';
          },
          set: function (name, value) {
            if (enabled && localStorage && _.isFunction(localStorage.setItem)) {
              localStorage.setItem(name, value);
            }
          }
        };
      })();
      var session = (function () {
        var sessionStorage;
        try {
          sessionStorage = window.sessionStorage;
        } catch (e) {}
        var enabled = true;
        try {
          var sessionStorageSample = '__test__';
          sessionStorage.setItem(sessionStorageSample, sessionStorageSample);
          if (sessionStorage.getItem(sessionStorageSample) !== sessionStorageSample) {
            enabled = false;
          }
          sessionStorage.removeItem(sessionStorageSample);
        } catch (e) {
          enabled = false;
        }
        return {
          enabled: enabled,
          get: function (name) {
            return enabled && sessionStorage && _.isFunction(sessionStorage.getItem) ? sessionStorage.getItem(name) : '';
          },
          set: function (name, value) {
            if (enabled && sessionStorage && _.isFunction(sessionStorage.setItem)) {
              sessionStorage.setItem(name, value);
            }
          }
        };
      })();
      var indexed = (function () {
        var INDEXEDDB_NAME = 'solus',
          INDEXEDDB_TABLE = 'data',
          INDEXEDDB_TEST = 'test';
        var indexedDB;
        try {
          indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB || window.moz_indexedDB;
        } catch (e) {}
        var enabled = true;
        try {
          var request = window.indexedDB.open(INDEXEDDB_TEST);
          request.onerror = function (e) {
            enabled = false;
            return true;
          };
          request.onsuccess = function (e) {
            e.target.result.close();
          };
        } catch (e) {
          enabled = false;
        }

        function init(callback) {
          try {
            var request = indexedDB.open(INDEXEDDB_NAME);
            request.onupgradeneeded = function (event) {
              var db = event.target.result;
              db.onerror = function (e) {
                callback();
                return true;
              };
              db.createObjectStore(INDEXEDDB_TABLE, {
                keyPath: 'name',
                autoIncrement: false
              });
            };
            request.onerror = function (e) {
              callback();
              return true;
            };
            request.onsuccess = function (e) {
              try {
                var idb = e.target.result;
                if (idb.objectStoreNames.contains(INDEXEDDB_TABLE)) {
                  var t = idb.transaction([INDEXEDDB_TABLE], 'readwrite');
                  callback(t.objectStore(INDEXEDDB_TABLE));
                } else {
                  callback();
                }
                idb.close();
              } catch (e) {
                callback();
              }
            };
          } catch (e) {
            callback();
          }
        }

        function set(name, value, callback) {
          init(function (e) {
            if (e && _.isFunction(e.put)) {
              e.put({
                name: name,
                value: value
              });
            }
            if (callback) {
              callback();
            }
          });
        }

        function get(name, callback) {
          init(function (e) {
            if (!e || !_.isFunction(e.get)) {
              return callback();
            }
            var request = e.get(name);
            request.onerror = function (e) {
              if (_.isFunction(callback)) {
                callback();
              }
              return true;
            };
            request.onsuccess = function (e) {
              if (_.isFunction(callback)) {
                callback(request.result ? request.result.value : null);
              }
            };
          });
        }

        function remove(dbName, callback) {
          var request = indexedDB.deleteDatabase(dbName);
          request.onerror = function (event) {
            return true;
          };
          request.onsuccess = function (event) {
            if (_.isFunction(callback)) {
              callback();
            }
          };
        }
        return {
          enabled: enabled,
          get: get,
          set: set,
          remove: remove
        };
      })();
      var sql = (function () {
        var DB = 'solus',
          VERSION = '1.0',
          DISPLAY_NAME = 'solus',
          TABLE = 'data';

        function init(callback) {
          try {
            if (_.isFunction(window.openDatabase)) {
              callback(window.openDatabase(DB, VERSION, DISPLAY_NAME, 1024 * 1024));
            } else {
              callback();
            }
          } catch (e) {
            callback();
          }
        }

        function enabled(callback) {
          init(function (e) {
            callback(!!e);
          });
        }

        function get(name, callback) {
          if (!_.isFunction(callback)) {
            callback = _.noop;
          }
          init(function (db) {
            if (db) {
              db.transaction(
                function (t) {
                  t.executeSql(
                    'SELECT value FROM ' + TABLE + ' WHERE name = ?',
                    [name],
                    function (t, res) {
                      var result = res.rows.length >= 1 ? res.rows.item(0).value : null;
                      callback(result);
                    },
                    function () {
                      callback();
                      return true;
                    }
                  );
                },
                function (e) {
                  callback();
                }
              );
            } else {
              callback();
            }
          });
        }

        function set(name, value, callback) {
          init(function (db) {
            if (db) {
              db.transaction(function (t) {
                t.executeSql(
                  'CREATE TABLE IF NOT EXISTS ' + TABLE + ' ( name TEXT NOT NULL PRIMARY KEY, value TEXT NOT NULL )',
                  [],
                  function (t) {
                    return t.executeSql(
                      'INSERT OR REPLACE INTO ' + TABLE + '(name, value) VALUES(?, ?)',
                      [name, value],
                      function (t, res) {
                        callback(value);
                      },
                      _.noop
                    );
                  },
                  _.noop
                );
              });
            }
          });
        }
        return {
          enabled: enabled,
          get: get,
          set: set
        };
      })();
      var cookie = (function () {
        return {
          get: function (name) {
            return _.getQuery(name, document.cookie);
          },
          set: function (name, value) {
            var params = '; path=/; domain=.' + window.location.host.replace(/:\d+/, '');
            if (location.protocol === 'https:') {
              params += '; secure';
            }
            document.cookie = name + '=; expires=Sun, 31 Dec 2000 00:00:00 UTC' + params;
            document.cookie = name + '=' + value + '; expires=Tue, 31 Dec 2030 00:00:00 UTC' + params;
          }
        };
      })();

      return {
        localStorage: local,
        sessionStorage: session,
        indexedDB: indexed,
        webSql: sql,
        cookie: cookie
      };
    });

    define('gc-fp/lib/evercookie',['./_', './storage'], function (_, store) {
      var async = _.async,
        cachedValues = {};

      function init(options, callback) {
        var name = options.name,
          defaultValue = options.value,
          cached = cachedValues[name] || (cachedValues[name] = {}),
          set = function (name, value, cb) {
            var cached = cachedValues[name] || (cachedValues[name] = {});
            async.parallel(
              [
                function (done) {
                  if (cached.localStorage === value) {
                    return done();
                  }
                  store.localStorage.set(name, value);
                  done();
                },
                function (done) {
                  if (cached.sessionStorage === value) {
                    return done();
                  }
                  store.sessionStorage.set(name, value);
                  cached.sessionStorage = value;
                  done();
                },
                function (done) {
                  if (cached.webSql === value) {
                    return done();
                  }
                  store.webSql.set(name, value, function (e) {
                    cached.webSql = value;
                    done();
                  });
                },
                function (done) {
                  if (cached.indexedDB === value) {
                    return done();
                  }
                  store.indexedDB.set(name, value, function (e) {
                    cached.indexedDB = value;
                    done();
                  });
                },
                function (done) {
                  if (cached.cookie === value) {
                    return done();
                  }
                  store.cookie.set(name, value);
                  cached.cookie = value;
                  done();
                },
                function (done) {
                  if (options.swf) {
                    if (cached.swf === value) {
                      return done();
                    }
                    store.swf.set(name, value, function () {
                      cached.swf = value;
                      done();
                    });
                  }
                }
              ],
              function () {
                if (_.isFunction(cb)) {
                  cb();
                }
              }
            );
          },
          sync = function (e) {
            callback(e);
            set(name, e);
          },
          getMostOccurring = function () {
            var arr = [];
            for (var i in cached) {
              arr.push(cached[i]);
            }
            return _.mostOccurring(arr) || defaultValue;
          },
          get = function () {
            async.parallel(
              [
                function (done) {
                  cached.localStorage = store.localStorage.get(name);
                  if (cached.localStorage) {
                    callback(getMostOccurring());
                  }
                  done();
                },
                function (done) {
                  cached.sessionStorage = store.sessionStorage.get(name);
                  if (cached.sessionStorage) {
                    callback(getMostOccurring());
                  }
                  done();
                },
                function (done) {
                  store.webSql.get(name, function (e) {
                    cached.webSql = e;
                    if (e) {
                      callback(getMostOccurring());
                    }
                    done();
                  });
                },
                function (done) {
                  store.indexedDB.get(name, function (e) {
                    cached.indexedDB = e;
                    if (e) {
                      callback(getMostOccurring());
                    }
                    done();
                  });
                },
                function (done) {
                  cached.cookie = store.cookie.get(name);
                  if (cached.cookie) {
                    callback(getMostOccurring());
                  }
                  done();
                }
              ],
              function () {
                sync(getMostOccurring());
              }
            );
          };
        if (options.swf) {
          store.swf.get(name, function (e) {
            if (e) {
              cached.swf = e;
              sync(e);
            } else {
              get();
            }
          });
        } else {
          get();
        }
      }
      return {
        init: init
      };
    });

    /*!
 * Platform.js v1.3.6
 * Copyright 2014-2020 Benjamin Tan
 * Copyright 2011-2013 John-David Dalton
 * Available under MIT license
 */
    ;(function() {
      'use strict';

      /** Used to determine if values are of the language type `Object`. */
      var objectTypes = {
        'function': true,
        'object': true
      };

      /** Used as a reference to the global object. */
      var root = (objectTypes[typeof window] && window) || this;

      /** Backup possible global object. */
      var oldRoot = root;

      /** Detect free variable `exports`. */
      var freeExports = objectTypes[typeof exports] && exports;

      /** Detect free variable `module`. */
      var freeModule = objectTypes[typeof module] && module && !module.nodeType && module;

      /** Detect free variable `global` from Node.js or Browserified code and use it as `root`. */
      var freeGlobal = freeExports && freeModule && typeof global == 'object' && global;
      if (freeGlobal && (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal || freeGlobal.self === freeGlobal)) {
        root = freeGlobal;
      }

      /**
       * Used as the maximum length of an array-like object.
       * See the [ES6 spec](http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength)
       * for more details.
       */
      var maxSafeInteger = Math.pow(2, 53) - 1;

      /** Regular expression to detect Opera. */
      var reOpera = /\bOpera/;

      /** Possible global object. */
      var thisBinding = this;

      /** Used for native method references. */
      var objectProto = Object.prototype;

      /** Used to check for own properties of an object. */
      var hasOwnProperty = objectProto.hasOwnProperty;

      /** Used to resolve the internal `[[Class]]` of values. */
      var toString = objectProto.toString;

      /*--------------------------------------------------------------------------*/

      /**
       * Capitalizes a string value.
       *
       * @private
       * @param {string} string The string to capitalize.
       * @returns {string} The capitalized string.
       */
      function capitalize(string) {
        string = String(string);
        return string.charAt(0).toUpperCase() + string.slice(1);
      }

      /**
       * A utility function to clean up the OS name.
       *
       * @private
       * @param {string} os The OS name to clean up.
       * @param {string} [pattern] A `RegExp` pattern matching the OS name.
       * @param {string} [label] A label for the OS.
       */
      function cleanupOS(os, pattern, label) {
        // Platform tokens are defined at:
        // http://msdn.microsoft.com/en-us/library/ms537503(VS.85).aspx
        // http://web.archive.org/web/20081122053950/http://msdn.microsoft.com/en-us/library/ms537503(VS.85).aspx
        var data = {
          '10.0': '10',
          '6.4':  '10 Technical Preview',
          '6.3':  '8.1',
          '6.2':  '8',
          '6.1':  'Server 2008 R2 / 7',
          '6.0':  'Server 2008 / Vista',
          '5.2':  'Server 2003 / XP 64-bit',
          '5.1':  'XP',
          '5.01': '2000 SP1',
          '5.0':  '2000',
          '4.0':  'NT',
          '4.90': 'ME'
        };
        // Detect Windows version from platform tokens.
        if (pattern && label && /^Win/i.test(os) && !/^Windows Phone /i.test(os) &&
          (data = data[/[\d.]+$/.exec(os)])) {
          os = 'Windows ' + data;
        }
        // Correct character case and cleanup string.
        os = String(os);

        if (pattern && label) {
          os = os.replace(RegExp(pattern, 'i'), label);
        }

        os = format(
          os.replace(/ ce$/i, ' CE')
            .replace(/\bhpw/i, 'web')
            .replace(/\bMacintosh\b/, 'Mac OS')
            .replace(/_PowerPC\b/i, ' OS')
            .replace(/\b(OS X) [^ \d]+/i, '$1')
            .replace(/\bMac (OS X)\b/, '$1')
            .replace(/\/(\d)/, ' $1')
            .replace(/_/g, '.')
            .replace(/(?: BePC|[ .]*fc[ \d.]+)$/i, '')
            .replace(/\bx86\.64\b/gi, 'x86_64')
            .replace(/\b(Windows Phone) OS\b/, '$1')
            .replace(/\b(Chrome OS \w+) [\d.]+\b/, '$1')
            .split(' on ')[0]
        );

        return os;
      }

      /**
       * An iteration utility for arrays and objects.
       *
       * @private
       * @param {Array|Object} object The object to iterate over.
       * @param {Function} callback The function called per iteration.
       */
      function each(object, callback) {
        var index = -1,
          length = object ? object.length : 0;

        if (typeof length == 'number' && length > -1 && length <= maxSafeInteger) {
          while (++index < length) {
            callback(object[index], index, object);
          }
        } else {
          forOwn(object, callback);
        }
      }

      /**
       * Trim and conditionally capitalize string values.
       *
       * @private
       * @param {string} string The string to format.
       * @returns {string} The formatted string.
       */
      function format(string) {
        string = trim(string);
        return /^(?:webOS|i(?:OS|P))/.test(string)
          ? string
          : capitalize(string);
      }

      /**
       * Iterates over an object's own properties, executing the `callback` for each.
       *
       * @private
       * @param {Object} object The object to iterate over.
       * @param {Function} callback The function executed per own property.
       */
      function forOwn(object, callback) {
        for (var key in object) {
          if (hasOwnProperty.call(object, key)) {
            callback(object[key], key, object);
          }
        }
      }

      /**
       * Gets the internal `[[Class]]` of a value.
       *
       * @private
       * @param {*} value The value.
       * @returns {string} The `[[Class]]`.
       */
      function getClassOf(value) {
        return value == null
          ? capitalize(value)
          : toString.call(value).slice(8, -1);
      }

      /**
       * Host objects can return type values that are different from their actual
       * data type. The objects we are concerned with usually return non-primitive
       * types of "object", "function", or "unknown".
       *
       * @private
       * @param {*} object The owner of the property.
       * @param {string} property The property to check.
       * @returns {boolean} Returns `true` if the property value is a non-primitive, else `false`.
       */
      function isHostType(object, property) {
        var type = object != null ? typeof object[property] : 'number';
        return !/^(?:boolean|number|string|undefined)$/.test(type) &&
          (type == 'object' ? !!object[property] : true);
      }

      /**
       * Prepares a string for use in a `RegExp` by making hyphens and spaces optional.
       *
       * @private
       * @param {string} string The string to qualify.
       * @returns {string} The qualified string.
       */
      function qualify(string) {
        return String(string).replace(/([ -])(?!$)/g, '$1?');
      }

      /**
       * A bare-bones `Array#reduce` like utility function.
       *
       * @private
       * @param {Array} array The array to iterate over.
       * @param {Function} callback The function called per iteration.
       * @returns {*} The accumulated result.
       */
      function reduce(array, callback) {
        var accumulator = null;
        each(array, function(value, index) {
          accumulator = callback(accumulator, value, index, array);
        });
        return accumulator;
      }

      /**
       * Removes leading and trailing whitespace from a string.
       *
       * @private
       * @param {string} string The string to trim.
       * @returns {string} The trimmed string.
       */
      function trim(string) {
        return String(string).replace(/^ +| +$/g, '');
      }

      /*--------------------------------------------------------------------------*/

      /**
       * Creates a new platform object.
       *
       * @memberOf platform
       * @param {Object|string} [ua=navigator.userAgent] The user agent string or
       *  context object.
       * @returns {Object} A platform object.
       */
      function parse(ua) {

        /** The environment context object. */
        var context = root;

        /** Used to flag when a custom context is provided. */
        var isCustomContext = ua && typeof ua == 'object' && getClassOf(ua) != 'String';

        // Juggle arguments.
        if (isCustomContext) {
          context = ua;
          ua = null;
        }

        /** Browser navigator object. */
        var nav = context.navigator || {};

        /** Browser user agent string. */
        var userAgent = nav.userAgent || '';

        ua || (ua = userAgent);

        /** Used to flag when `thisBinding` is the [ModuleScope]. */
        var isModuleScope = isCustomContext || thisBinding == oldRoot;

        /** Used to detect if browser is like Chrome. */
        var likeChrome = isCustomContext
          ? !!nav.likeChrome
          : /\bChrome\b/.test(ua) && !/internal|\n/i.test(toString.toString());

        /** Internal `[[Class]]` value shortcuts. */
        var objectClass = 'Object',
          airRuntimeClass = isCustomContext ? objectClass : 'ScriptBridgingProxyObject',
          enviroClass = isCustomContext ? objectClass : 'Environment',
          javaClass = (isCustomContext && context.java) ? 'JavaPackage' : getClassOf(context.java),
          phantomClass = isCustomContext ? objectClass : 'RuntimeObject';

        /** Detect Java environments. */
        var java = /\bJava/.test(javaClass) && context.java;

        /** Detect Rhino. */
        var rhino = java && getClassOf(context.environment) == enviroClass;

        /** A character to represent alpha. */
        var alpha = java ? 'a' : '\u03b1';

        /** A character to represent beta. */
        var beta = java ? 'b' : '\u03b2';

        /** Browser document object. */
        var doc = context.document || {};

        /**
         * Detect Opera browser (Presto-based).
         * http://www.howtocreate.co.uk/operaStuff/operaObject.html
         * http://dev.opera.com/articles/view/opera-mini-web-content-authoring-guidelines/#operamini
         */
        var opera = context.operamini || context.opera;

        /** Opera `[[Class]]`. */
        var operaClass = reOpera.test(operaClass = (isCustomContext && opera) ? opera['[[Class]]'] : getClassOf(opera))
          ? operaClass
          : (opera = null);

        /*------------------------------------------------------------------------*/

        /** Temporary variable used over the script's lifetime. */
        var data;

        /** The CPU architecture. */
        var arch = ua;

        /** Platform description array. */
        var description = [];

        /** Platform alpha/beta indicator. */
        var prerelease = null;

        /** A flag to indicate that environment features should be used to resolve the platform. */
        var useFeatures = ua == userAgent;

        /** The browser/environment version. */
        var version = useFeatures && opera && typeof opera.version == 'function' && opera.version();

        /** A flag to indicate if the OS ends with "/ Version" */
        var isSpecialCasedOS;

        /* Detectable layout engines (order is important). */
        var layout = getLayout([
          { 'label': 'EdgeHTML', 'pattern': 'Edge' },
          'Trident',
          { 'label': 'WebKit', 'pattern': 'AppleWebKit' },
          'iCab',
          'Presto',
          'NetFront',
          'Tasman',
          'KHTML',
          'Gecko'
        ]);

        /* Detectable browser names (order is important). */
        var name = getName([
          'Adobe AIR',
          'Arora',
          'Avant Browser',
          'Breach',
          'Camino',
          'Electron',
          'Epiphany',
          'Fennec',
          'Flock',
          'Galeon',
          'GreenBrowser',
          'iCab',
          'Iceweasel',
          'K-Meleon',
          'Konqueror',
          'Lunascape',
          'Maxthon',
          { 'label': 'Microsoft Edge', 'pattern': '(?:Edge|Edg|EdgA|EdgiOS)' },
          'Midori',
          'Nook Browser',
          'PaleMoon',
          'PhantomJS',
          'Raven',
          'Rekonq',
          'RockMelt',
          { 'label': 'Samsung Internet', 'pattern': 'SamsungBrowser' },
          'SeaMonkey',
          { 'label': 'Silk', 'pattern': '(?:Cloud9|Silk-Accelerated)' },
          'Sleipnir',
          'SlimBrowser',
          { 'label': 'SRWare Iron', 'pattern': 'Iron' },
          'Sunrise',
          'Swiftfox',
          'Vivaldi',
          'Waterfox',
          'WebPositive',
          { 'label': 'Yandex Browser', 'pattern': 'YaBrowser' },
          { 'label': 'UC Browser', 'pattern': 'UCBrowser' },
          'Opera Mini',
          { 'label': 'Opera Mini', 'pattern': 'OPiOS' },
          'Opera',
          { 'label': 'Opera', 'pattern': 'OPR' },
          'Chromium',
          'Chrome',
          { 'label': 'Chrome', 'pattern': '(?:HeadlessChrome)' },
          { 'label': 'Chrome Mobile', 'pattern': '(?:CriOS|CrMo)' },
          { 'label': 'Firefox', 'pattern': '(?:Firefox|Minefield)' },
          { 'label': 'Firefox for iOS', 'pattern': 'FxiOS' },
          { 'label': 'IE', 'pattern': 'IEMobile' },
          { 'label': 'IE', 'pattern': 'MSIE' },
          'Safari'
        ]);

        /* Detectable products (order is important). */
        var product = getProduct([
          { 'label': 'BlackBerry', 'pattern': 'BB10' },
          'BlackBerry',
          { 'label': 'Galaxy S', 'pattern': 'GT-I9000' },
          { 'label': 'Galaxy S2', 'pattern': 'GT-I9100' },
          { 'label': 'Galaxy S3', 'pattern': 'GT-I9300' },
          { 'label': 'Galaxy S4', 'pattern': 'GT-I9500' },
          { 'label': 'Galaxy S5', 'pattern': 'SM-G900' },
          { 'label': 'Galaxy S6', 'pattern': 'SM-G920' },
          { 'label': 'Galaxy S6 Edge', 'pattern': 'SM-G925' },
          { 'label': 'Galaxy S7', 'pattern': 'SM-G930' },
          { 'label': 'Galaxy S7 Edge', 'pattern': 'SM-G935' },
          'Google TV',
          'Lumia',
          'iPad',
          'iPod',
          'iPhone',
          'Kindle',
          { 'label': 'Kindle Fire', 'pattern': '(?:Cloud9|Silk-Accelerated)' },
          'Nexus',
          'Nook',
          'PlayBook',
          'PlayStation Vita',
          'PlayStation',
          'TouchPad',
          'Transformer',
          { 'label': 'Wii U', 'pattern': 'WiiU' },
          'Wii',
          'Xbox One',
          { 'label': 'Xbox 360', 'pattern': 'Xbox' },
          'Xoom'
        ]);

        /* Detectable manufacturers. */
        var manufacturer = getManufacturer({
          'Apple': { 'iPad': 1, 'iPhone': 1, 'iPod': 1 },
          'Alcatel': {},
          'Archos': {},
          'Amazon': { 'Kindle': 1, 'Kindle Fire': 1 },
          'Asus': { 'Transformer': 1 },
          'Barnes & Noble': { 'Nook': 1 },
          'BlackBerry': { 'PlayBook': 1 },
          'Google': { 'Google TV': 1, 'Nexus': 1 },
          'HP': { 'TouchPad': 1 },
          'HTC': {},
          'Huawei': {},
          'Lenovo': {},
          'LG': {},
          'Microsoft': { 'Xbox': 1, 'Xbox One': 1 },
          'Motorola': { 'Xoom': 1 },
          'Nintendo': { 'Wii U': 1,  'Wii': 1 },
          'Nokia': { 'Lumia': 1 },
          'Oppo': {},
          'Samsung': { 'Galaxy S': 1, 'Galaxy S2': 1, 'Galaxy S3': 1, 'Galaxy S4': 1 },
          'Sony': { 'PlayStation': 1, 'PlayStation Vita': 1 },
          'Xiaomi': { 'Mi': 1, 'Redmi': 1 }
        });

        /* Detectable operating systems (order is important). */
        var os = getOS([
          'Windows Phone',
          'KaiOS',
          'Android',
          'CentOS',
          { 'label': 'Chrome OS', 'pattern': 'CrOS' },
          'Debian',
          { 'label': 'DragonFly BSD', 'pattern': 'DragonFly' },
          'Fedora',
          'FreeBSD',
          'Gentoo',
          'Haiku',
          'Kubuntu',
          'Linux Mint',
          'OpenBSD',
          'Red Hat',
          'SuSE',
          'Ubuntu',
          'Xubuntu',
          'Cygwin',
          'Symbian OS',
          'hpwOS',
          'webOS ',
          'webOS',
          'Tablet OS',
          'Tizen',
          'Linux',
          'Mac OS X',
          'Macintosh',
          'Mac',
          'Windows 98;',
          'Windows '
        ]);

        /*------------------------------------------------------------------------*/

        /**
         * Picks the layout engine from an array of guesses.
         *
         * @private
         * @param {Array} guesses An array of guesses.
         * @returns {null|string} The detected layout engine.
         */
        function getLayout(guesses) {
          return reduce(guesses, function(result, guess) {
            return result || RegExp('\\b' + (
              guess.pattern || qualify(guess)
            ) + '\\b', 'i').exec(ua) && (guess.label || guess);
          });
        }

        /**
         * Picks the manufacturer from an array of guesses.
         *
         * @private
         * @param {Array} guesses An object of guesses.
         * @returns {null|string} The detected manufacturer.
         */
        function getManufacturer(guesses) {
          return reduce(guesses, function(result, value, key) {
            // Lookup the manufacturer by product or scan the UA for the manufacturer.
            return result || (
              value[product] ||
              value[/^[a-z]+(?: +[a-z]+\b)*/i.exec(product)] ||
              RegExp('\\b' + qualify(key) + '(?:\\b|\\w*\\d)', 'i').exec(ua)
            ) && key;
          });
        }

        /**
         * Picks the browser name from an array of guesses.
         *
         * @private
         * @param {Array} guesses An array of guesses.
         * @returns {null|string} The detected browser name.
         */
        function getName(guesses) {
          return reduce(guesses, function(result, guess) {
            return result || RegExp('\\b' + (
              guess.pattern || qualify(guess)
            ) + '\\b', 'i').exec(ua) && (guess.label || guess);
          });
        }

        /**
         * Picks the OS name from an array of guesses.
         *
         * @private
         * @param {Array} guesses An array of guesses.
         * @returns {null|string} The detected OS name.
         */
        function getOS(guesses) {
          return reduce(guesses, function(result, guess) {
            var pattern = guess.pattern || qualify(guess);
            if (!result && (result =
                RegExp('\\b' + pattern + '(?:/[\\d.]+|[ \\w.]*)', 'i').exec(ua)
            )) {
              result = cleanupOS(result, pattern, guess.label || guess);
            }
            return result;
          });
        }

        /**
         * Picks the product name from an array of guesses.
         *
         * @private
         * @param {Array} guesses An array of guesses.
         * @returns {null|string} The detected product name.
         */
        function getProduct(guesses) {
          return reduce(guesses, function(result, guess) {
            var pattern = guess.pattern || qualify(guess);
            if (!result && (result =
                RegExp('\\b' + pattern + ' *\\d+[.\\w_]*', 'i').exec(ua) ||
                RegExp('\\b' + pattern + ' *\\w+-[\\w]*', 'i').exec(ua) ||
                RegExp('\\b' + pattern + '(?:; *(?:[a-z]+[_-])?[a-z]+\\d+|[^ ();-]*)', 'i').exec(ua)
            )) {
              // Split by forward slash and append product version if needed.
              if ((result = String((guess.label && !RegExp(pattern, 'i').test(guess.label)) ? guess.label : result).split('/'))[1] && !/[\d.]+/.test(result[0])) {
                result[0] += ' ' + result[1];
              }
              // Correct character case and cleanup string.
              guess = guess.label || guess;
              result = format(result[0]
                .replace(RegExp(pattern, 'i'), guess)
                .replace(RegExp('; *(?:' + guess + '[_-])?', 'i'), ' ')
                .replace(RegExp('(' + guess + ')[-_.]?(\\w)', 'i'), '$1 $2'));
            }
            return result;
          });
        }

        /**
         * Resolves the version using an array of UA patterns.
         *
         * @private
         * @param {Array} patterns An array of UA patterns.
         * @returns {null|string} The detected version.
         */
        function getVersion(patterns) {
          return reduce(patterns, function(result, pattern) {
            return result || (RegExp(pattern +
              '(?:-[\\d.]+/|(?: for [\\w-]+)?[ /-])([\\d.]+[^ ();/_-]*)', 'i').exec(ua) || 0)[1] || null;
          });
        }

        /**
         * Returns `platform.description` when the platform object is coerced to a string.
         *
         * @name toString
         * @memberOf platform
         * @returns {string} Returns `platform.description` if available, else an empty string.
         */
        function toStringPlatform() {
          return this.description || '';
        }

        /*------------------------------------------------------------------------*/

        // Convert layout to an array so we can add extra details.
        layout && (layout = [layout]);

        // Detect Android products.
        // Browsers on Android devices typically provide their product IDS after "Android;"
        // up to "Build" or ") AppleWebKit".
        // Example:
        // "Mozilla/5.0 (Linux; Android 8.1.0; Moto G (5) Plus) AppleWebKit/537.36
        // (KHTML, like Gecko) Chrome/70.0.3538.80 Mobile Safari/537.36"
        if (/\bAndroid\b/.test(os) && !product &&
          (data = /\bAndroid[^;]*;(.*?)(?:Build|\) AppleWebKit)\b/i.exec(ua))) {
          product = trim(data[1])
              // Replace any language codes (eg. "en-US").
              .replace(/^[a-z]{2}-[a-z]{2};\s*/i, '')
            || null;
        }
        // Detect product names that contain their manufacturer's name.
        if (manufacturer && !product) {
          product = getProduct([manufacturer]);
        } else if (manufacturer && product) {
          product = product
            .replace(RegExp('^(' + qualify(manufacturer) + ')[-_.\\s]', 'i'), manufacturer + ' ')
            .replace(RegExp('^(' + qualify(manufacturer) + ')[-_.]?(\\w)', 'i'), manufacturer + ' $2');
        }
        // Clean up Google TV.
        if ((data = /\bGoogle TV\b/.exec(product))) {
          product = data[0];
        }
        // Detect simulators.
        if (/\bSimulator\b/i.test(ua)) {
          product = (product ? product + ' ' : '') + 'Simulator';
        }
        // Detect Opera Mini 8+ running in Turbo/Uncompressed mode on iOS.
        if (name == 'Opera Mini' && /\bOPiOS\b/.test(ua)) {
          description.push('running in Turbo/Uncompressed mode');
        }
        // Detect IE Mobile 11.
        if (name == 'IE' && /\blike iPhone OS\b/.test(ua)) {
          data = parse(ua.replace(/like iPhone OS/, ''));
          manufacturer = data.manufacturer;
          product = data.product;
        }
        // Detect iOS.
        else if (/^iP/.test(product)) {
          name || (name = 'Safari');
          os = 'iOS' + ((data = / OS ([\d_]+)/i.exec(ua))
            ? ' ' + data[1].replace(/_/g, '.')
            : '');
        }
        // Detect Kubuntu.
        else if (name == 'Konqueror' && /^Linux\b/i.test(os)) {
          os = 'Kubuntu';
        }
        // Detect Android browsers.
        else if ((manufacturer && manufacturer != 'Google' &&
            ((/Chrome/.test(name) && !/\bMobile Safari\b/i.test(ua)) || /\bVita\b/.test(product))) ||
          (/\bAndroid\b/.test(os) && /^Chrome/.test(name) && /\bVersion\//i.test(ua))) {
          name = 'Android Browser';
          os = /\bAndroid\b/.test(os) ? os : 'Android';
        }
        // Detect Silk desktop/accelerated modes.
        else if (name == 'Silk') {
          if (!/\bMobi/i.test(ua)) {
            os = 'Android';
            description.unshift('desktop mode');
          }
          if (/Accelerated *= *true/i.test(ua)) {
            description.unshift('accelerated');
          }
        }
        // Detect UC Browser speed mode.
        else if (name == 'UC Browser' && /\bUCWEB\b/.test(ua)) {
          description.push('speed mode');
        }
        // Detect PaleMoon identifying as Firefox.
        else if (name == 'PaleMoon' && (data = /\bFirefox\/([\d.]+)\b/.exec(ua))) {
          description.push('identifying as Firefox ' + data[1]);
        }
        // Detect Firefox OS and products running Firefox.
        else if (name == 'Firefox' && (data = /\b(Mobile|Tablet|TV)\b/i.exec(ua))) {
          os || (os = 'Firefox OS');
          product || (product = data[1]);
        }
        // Detect false positives for Firefox/Safari.
        else if (!name || (data = !/\bMinefield\b/i.test(ua) && /\b(?:Firefox|Safari)\b/.exec(name))) {
          // Escape the `/` for Firefox 1.
          if (name && !product && /[\/,]|^[^(]+?\)/.test(ua.slice(ua.indexOf(data + '/') + 8))) {
            // Clear name of false positives.
            name = null;
          }
          // Reassign a generic name.
          if ((data = product || manufacturer || os) &&
            (product || manufacturer || /\b(?:Android|Symbian OS|Tablet OS|webOS)\b/.test(os))) {
            name = /[a-z]+(?: Hat)?/i.exec(/\bAndroid\b/.test(os) ? os : data) + ' Browser';
          }
        }
        // Add Chrome version to description for Electron.
        else if (name == 'Electron' && (data = (/\bChrome\/([\d.]+)\b/.exec(ua) || 0)[1])) {
          description.push('Chromium ' + data);
        }
        // Detect non-Opera (Presto-based) versions (order is important).
        if (!version) {
          version = getVersion([
            '(?:Cloud9|CriOS|CrMo|Edge|Edg|EdgA|EdgiOS|FxiOS|HeadlessChrome|IEMobile|Iron|Opera ?Mini|OPiOS|OPR|Raven|SamsungBrowser|Silk(?!/[\\d.]+$)|UCBrowser|YaBrowser)',
            'Version',
            qualify(name),
            '(?:Firefox|Minefield|NetFront)'
          ]);
        }
        // Detect stubborn layout engines.
        if ((data =
            layout == 'iCab' && parseFloat(version) > 3 && 'WebKit' ||
            /\bOpera\b/.test(name) && (/\bOPR\b/.test(ua) ? 'Blink' : 'Presto') ||
            /\b(?:Midori|Nook|Safari)\b/i.test(ua) && !/^(?:Trident|EdgeHTML)$/.test(layout) && 'WebKit' ||
            !layout && /\bMSIE\b/i.test(ua) && (os == 'Mac OS' ? 'Tasman' : 'Trident') ||
            layout == 'WebKit' && /\bPlayStation\b(?! Vita\b)/i.test(name) && 'NetFront'
        )) {
          layout = [data];
        }
        // Detect Windows Phone 7 desktop mode.
        if (name == 'IE' && (data = (/; *(?:XBLWP|ZuneWP)(\d+)/i.exec(ua) || 0)[1])) {
          name += ' Mobile';
          os = 'Windows Phone ' + (/\+$/.test(data) ? data : data + '.x');
          description.unshift('desktop mode');
        }
        // Detect Windows Phone 8.x desktop mode.
        else if (/\bWPDesktop\b/i.test(ua)) {
          name = 'IE Mobile';
          os = 'Windows Phone 8.x';
          description.unshift('desktop mode');
          version || (version = (/\brv:([\d.]+)/.exec(ua) || 0)[1]);
        }
        // Detect IE 11 identifying as other browsers.
        else if (name != 'IE' && layout == 'Trident' && (data = /\brv:([\d.]+)/.exec(ua))) {
          if (name) {
            description.push('identifying as ' + name + (version ? ' ' + version : ''));
          }
          name = 'IE';
          version = data[1];
        }
        // Leverage environment features.
        if (useFeatures) {
          // Detect server-side environments.
          // Rhino has a global function while others have a global object.
          if (isHostType(context, 'global')) {
            if (java) {
              data = java.lang.System;
              arch = data.getProperty('os.arch');
              os = os || data.getProperty('os.name') + ' ' + data.getProperty('os.version');
            }
            if (rhino) {
              try {
                version = context.require('ringo/engine').version.join('.');
                name = 'RingoJS';
              } catch(e) {
                if ((data = context.system) && data.global.system == context.system) {
                  name = 'Narwhal';
                  os || (os = data[0].os || null);
                }
              }
              if (!name) {
                name = 'Rhino';
              }
            }
            else if (
              typeof context.process == 'object' && !context.process.browser &&
              (data = context.process)
            ) {
              if (typeof data.versions == 'object') {
                if (typeof data.versions.electron == 'string') {
                  description.push('Node ' + data.versions.node);
                  name = 'Electron';
                  version = data.versions.electron;
                } else if (typeof data.versions.nw == 'string') {
                  description.push('Chromium ' + version, 'Node ' + data.versions.node);
                  name = 'NW.js';
                  version = data.versions.nw;
                }
              }
              if (!name) {
                name = 'Node.js';
                arch = data.arch;
                os = data.platform;
                version = /[\d.]+/.exec(data.version);
                version = version ? version[0] : null;
              }
            }
          }
          // Detect Adobe AIR.
          else if (getClassOf((data = context.runtime)) == airRuntimeClass) {
            name = 'Adobe AIR';
            os = data.flash.system.Capabilities.os;
          }
          // Detect PhantomJS.
          else if (getClassOf((data = context.phantom)) == phantomClass) {
            name = 'PhantomJS';
            version = (data = data.version || null) && (data.major + '.' + data.minor + '.' + data.patch);
          }
          // Detect IE compatibility modes.
          else if (typeof doc.documentMode == 'number' && (data = /\bTrident\/(\d+)/i.exec(ua))) {
            // We're in compatibility mode when the Trident version + 4 doesn't
            // equal the document mode.
            version = [version, doc.documentMode];
            if ((data = +data[1] + 4) != version[1]) {
              description.push('IE ' + version[1] + ' mode');
              layout && (layout[1] = '');
              version[1] = data;
            }
            version = name == 'IE' ? String(version[1].toFixed(1)) : version[0];
          }
          // Detect IE 11 masking as other browsers.
          else if (typeof doc.documentMode == 'number' && /^(?:Chrome|Firefox)\b/.test(name)) {
            description.push('masking as ' + name + ' ' + version);
            name = 'IE';
            version = '11.0';
            layout = ['Trident'];
            os = 'Windows';
          }
          os = os && format(os);
        }
        // Detect prerelease phases.
        if (version && (data =
            /(?:[ab]|dp|pre|[ab]\d+pre)(?:\d+\+?)?$/i.exec(version) ||
            /(?:alpha|beta)(?: ?\d)?/i.exec(ua + ';' + (useFeatures && nav.appMinorVersion)) ||
            /\bMinefield\b/i.test(ua) && 'a'
        )) {
          prerelease = /b/i.test(data) ? 'beta' : 'alpha';
          version = version.replace(RegExp(data + '\\+?$'), '') +
            (prerelease == 'beta' ? beta : alpha) + (/\d+\+?/.exec(data) || '');
        }
        // Detect Firefox Mobile.
        if (name == 'Fennec' || name == 'Firefox' && /\b(?:Android|Firefox OS|KaiOS)\b/.test(os)) {
          name = 'Firefox Mobile';
        }
        // Obscure Maxthon's unreliable version.
        else if (name == 'Maxthon' && version) {
          version = version.replace(/\.[\d.]+/, '.x');
        }
        // Detect Xbox 360 and Xbox One.
        else if (/\bXbox\b/i.test(product)) {
          if (product == 'Xbox 360') {
            os = null;
          }
          if (product == 'Xbox 360' && /\bIEMobile\b/.test(ua)) {
            description.unshift('mobile mode');
          }
        }
        // Add mobile postfix.
        else if ((/^(?:Chrome|IE|Opera)$/.test(name) || name && !product && !/Browser|Mobi/.test(name)) &&
          (os == 'Windows CE' || /Mobi/i.test(ua))) {
          name += ' Mobile';
        }
        // Detect IE platform preview.
        else if (name == 'IE' && useFeatures) {
          try {
            if (context.external === null) {
              description.unshift('platform preview');
            }
          } catch(e) {
            description.unshift('embedded');
          }
        }
          // Detect BlackBerry OS version.
        // http://docs.blackberry.com/en/developers/deliverables/18169/HTTP_headers_sent_by_BB_Browser_1234911_11.jsp
        else if ((/\bBlackBerry\b/.test(product) || /\bBB10\b/.test(ua)) && (data =
            (RegExp(product.replace(/ +/g, ' *') + '/([.\\d]+)', 'i').exec(ua) || 0)[1] ||
            version
        )) {
          data = [data, /BB10/.test(ua)];
          os = (data[1] ? (product = null, manufacturer = 'BlackBerry') : 'Device Software') + ' ' + data[0];
          version = null;
        }
          // Detect Opera identifying/masking itself as another browser.
        // http://www.opera.com/support/kb/view/843/
        else if (this != forOwn && product != 'Wii' && (
          (useFeatures && opera) ||
          (/Opera/.test(name) && /\b(?:MSIE|Firefox)\b/i.test(ua)) ||
          (name == 'Firefox' && /\bOS X (?:\d+\.){2,}/.test(os)) ||
          (name == 'IE' && (
            (os && !/^Win/.test(os) && version > 5.5) ||
            /\bWindows XP\b/.test(os) && version > 8 ||
            version == 8 && !/\bTrident\b/.test(ua)
          ))
        ) && !reOpera.test((data = parse.call(forOwn, ua.replace(reOpera, '') + ';'))) && data.name) {
          // When "identifying", the UA contains both Opera and the other browser's name.
          data = 'ing as ' + data.name + ((data = data.version) ? ' ' + data : '');
          if (reOpera.test(name)) {
            if (/\bIE\b/.test(data) && os == 'Mac OS') {
              os = null;
            }
            data = 'identify' + data;
          }
          // When "masking", the UA contains only the other browser's name.
          else {
            data = 'mask' + data;
            if (operaClass) {
              name = format(operaClass.replace(/([a-z])([A-Z])/g, '$1 $2'));
            } else {
              name = 'Opera';
            }
            if (/\bIE\b/.test(data)) {
              os = null;
            }
            if (!useFeatures) {
              version = null;
            }
          }
          layout = ['Presto'];
          description.push(data);
        }
        // Detect WebKit Nightly and approximate Chrome/Safari versions.
        if ((data = (/\bAppleWebKit\/([\d.]+\+?)/i.exec(ua) || 0)[1])) {
          // Correct build number for numeric comparison.
          // (e.g. "532.5" becomes "532.05")
          data = [parseFloat(data.replace(/\.(\d)$/, '.0$1')), data];
          // Nightly builds are postfixed with a "+".
          if (name == 'Safari' && data[1].slice(-1) == '+') {
            name = 'WebKit Nightly';
            prerelease = 'alpha';
            version = data[1].slice(0, -1);
          }
          // Clear incorrect browser versions.
          else if (version == data[1] ||
            version == (data[2] = (/\bSafari\/([\d.]+\+?)/i.exec(ua) || 0)[1])) {
            version = null;
          }
          // Use the full Chrome version when available.
          data[1] = (/\b(?:Headless)?Chrome\/([\d.]+)/i.exec(ua) || 0)[1];
          // Detect Blink layout engine.
          if (data[0] == 537.36 && data[2] == 537.36 && parseFloat(data[1]) >= 28 && layout == 'WebKit') {
            layout = ['Blink'];
          }
          // Detect JavaScriptCore.
          // http://stackoverflow.com/questions/6768474/how-can-i-detect-which-javascript-engine-v8-or-jsc-is-used-at-runtime-in-androi
          if (!useFeatures || (!likeChrome && !data[1])) {
            layout && (layout[1] = 'like Safari');
            data = (data = data[0], data < 400 ? 1 : data < 500 ? 2 : data < 526 ? 3 : data < 533 ? 4 : data < 534 ? '4+' : data < 535 ? 5 : data < 537 ? 6 : data < 538 ? 7 : data < 601 ? 8 : data < 602 ? 9 : data < 604 ? 10 : data < 606 ? 11 : data < 608 ? 12 : '12');
          } else {
            layout && (layout[1] = 'like Chrome');
            data = data[1] || (data = data[0], data < 530 ? 1 : data < 532 ? 2 : data < 532.05 ? 3 : data < 533 ? 4 : data < 534.03 ? 5 : data < 534.07 ? 6 : data < 534.10 ? 7 : data < 534.13 ? 8 : data < 534.16 ? 9 : data < 534.24 ? 10 : data < 534.30 ? 11 : data < 535.01 ? 12 : data < 535.02 ? '13+' : data < 535.07 ? 15 : data < 535.11 ? 16 : data < 535.19 ? 17 : data < 536.05 ? 18 : data < 536.10 ? 19 : data < 537.01 ? 20 : data < 537.11 ? '21+' : data < 537.13 ? 23 : data < 537.18 ? 24 : data < 537.24 ? 25 : data < 537.36 ? 26 : layout != 'Blink' ? '27' : '28');
          }
          // Add the postfix of ".x" or "+" for approximate versions.
          layout && (layout[1] += ' ' + (data += typeof data == 'number' ? '.x' : /[.+]/.test(data) ? '' : '+'));
          // Obscure version for some Safari 1-2 releases.
          if (name == 'Safari' && (!version || parseInt(version) > 45)) {
            version = data;
          } else if (name == 'Chrome' && /\bHeadlessChrome/i.test(ua)) {
            description.unshift('headless');
          }
        }
        // Detect Opera desktop modes.
        if (name == 'Opera' &&  (data = /\bzbov|zvav$/.exec(os))) {
          name += ' ';
          description.unshift('desktop mode');
          if (data == 'zvav') {
            name += 'Mini';
            version = null;
          } else {
            name += 'Mobile';
          }
          os = os.replace(RegExp(' *' + data + '$'), '');
        }
        // Detect Chrome desktop mode.
        else if (name == 'Safari' && /\bChrome\b/.exec(layout && layout[1])) {
          description.unshift('desktop mode');
          name = 'Chrome Mobile';
          version = null;

          if (/\bOS X\b/.test(os)) {
            manufacturer = 'Apple';
            os = 'iOS 4.3+';
          } else {
            os = null;
          }
        }
        // Newer versions of SRWare Iron uses the Chrome tag to indicate its version number.
        else if (/\bSRWare Iron\b/.test(name) && !version) {
          version = getVersion('Chrome');
        }
        // Strip incorrect OS versions.
        if (version && version.indexOf((data = /[\d.]+$/.exec(os))) == 0 &&
          ua.indexOf('/' + data + '-') > -1) {
          os = trim(os.replace(data, ''));
        }
        // Ensure OS does not include the browser name.
        if (os && os.indexOf(name) != -1 && !RegExp(name + ' OS').test(os)) {
          os = os.replace(RegExp(' *' + qualify(name) + ' *'), '');
        }
        // Add layout engine.
        if (layout && !/\b(?:Avant|Nook)\b/.test(name) && (
          /Browser|Lunascape|Maxthon/.test(name) ||
          name != 'Safari' && /^iOS/.test(os) && /\bSafari\b/.test(layout[1]) ||
          /^(?:Adobe|Arora|Breach|Midori|Opera|Phantom|Rekonq|Rock|Samsung Internet|Sleipnir|SRWare Iron|Vivaldi|Web)/.test(name) && layout[1])) {
          // Don't add layout details to description if they are falsey.
          (data = layout[layout.length - 1]) && description.push(data);
        }
        // Combine contextual information.
        if (description.length) {
          description = ['(' + description.join('; ') + ')'];
        }
        // Append manufacturer to description.
        if (manufacturer && product && product.indexOf(manufacturer) < 0) {
          description.push('on ' + manufacturer);
        }
        // Append product to description.
        if (product) {
          description.push((/^on /.test(description[description.length - 1]) ? '' : 'on ') + product);
        }
        // Parse the OS into an object.
        if (os) {
          data = / ([\d.+]+)$/.exec(os);
          isSpecialCasedOS = data && os.charAt(os.length - data[0].length - 1) == '/';
          os = {
            'architecture': 32,
            'family': (data && !isSpecialCasedOS) ? os.replace(data[0], '') : os,
            'version': data ? data[1] : null,
            'toString': function() {
              var version = this.version;
              return this.family + ((version && !isSpecialCasedOS) ? ' ' + version : '') + (this.architecture == 64 ? ' 64-bit' : '');
            }
          };
        }
        // Add browser/OS architecture.
        if ((data = /\b(?:AMD|IA|Win|WOW|x86_|x)64\b/i.exec(arch)) && !/\bi686\b/i.test(arch)) {
          if (os) {
            os.architecture = 64;
            os.family = os.family.replace(RegExp(' *' + data), '');
          }
          if (
            name && (/\bWOW64\b/i.test(ua) ||
              (useFeatures && /\w(?:86|32)$/.test(nav.cpuClass || nav.platform) && !/\bWin64; x64\b/i.test(ua)))
          ) {
            description.unshift('32-bit');
          }
        }
        // Chrome 39 and above on OS X is always 64-bit.
        else if (
          os && /^OS X/.test(os.family) &&
          name == 'Chrome' && parseFloat(version) >= 39
        ) {
          os.architecture = 64;
        }

        ua || (ua = null);

        /*------------------------------------------------------------------------*/

        /**
         * The platform object.
         *
         * @name platform
         * @type Object
         */
        var platform = {};

        /**
         * The platform description.
         *
         * @memberOf platform
         * @type string|null
         */
        platform.description = ua;

        /**
         * The name of the browser's layout engine.
         *
         * The list of common layout engines include:
         * "Blink", "EdgeHTML", "Gecko", "Trident" and "WebKit"
         *
         * @memberOf platform
         * @type string|null
         */
        platform.layout = layout && layout[0];

        /**
         * The name of the product's manufacturer.
         *
         * The list of manufacturers include:
         * "Apple", "Archos", "Amazon", "Asus", "Barnes & Noble", "BlackBerry",
         * "Google", "HP", "HTC", "LG", "Microsoft", "Motorola", "Nintendo",
         * "Nokia", "Samsung" and "Sony"
         *
         * @memberOf platform
         * @type string|null
         */
        platform.manufacturer = manufacturer;

        /**
         * The name of the browser/environment.
         *
         * The list of common browser names include:
         * "Chrome", "Electron", "Firefox", "Firefox for iOS", "IE",
         * "Microsoft Edge", "PhantomJS", "Safari", "SeaMonkey", "Silk",
         * "Opera Mini" and "Opera"
         *
         * Mobile versions of some browsers have "Mobile" appended to their name:
         * eg. "Chrome Mobile", "Firefox Mobile", "IE Mobile" and "Opera Mobile"
         *
         * @memberOf platform
         * @type string|null
         */
        platform.name = name;

        /**
         * The alpha/beta release indicator.
         *
         * @memberOf platform
         * @type string|null
         */
        platform.prerelease = prerelease;

        /**
         * The name of the product hosting the browser.
         *
         * The list of common products include:
         *
         * "BlackBerry", "Galaxy S4", "Lumia", "iPad", "iPod", "iPhone", "Kindle",
         * "Kindle Fire", "Nexus", "Nook", "PlayBook", "TouchPad" and "Transformer"
         *
         * @memberOf platform
         * @type string|null
         */
        platform.product = product;

        /**
         * The browser's user agent string.
         *
         * @memberOf platform
         * @type string|null
         */
        platform.ua = ua;

        /**
         * The browser/environment version.
         *
         * @memberOf platform
         * @type string|null
         */
        platform.version = name && version;

        /**
         * The name of the operating system.
         *
         * @memberOf platform
         * @type Object
         */
        platform.os = os || {

          /**
           * The CPU architecture the OS is built for.
           *
           * @memberOf platform.os
           * @type number|null
           */
          'architecture': null,

          /**
           * The family of the OS.
           *
           * Common values include:
           * "Windows", "Windows Server 2008 R2 / 7", "Windows Server 2008 / Vista",
           * "Windows XP", "OS X", "Linux", "Ubuntu", "Debian", "Fedora", "Red Hat",
           * "SuSE", "Android", "iOS" and "Windows Phone"
           *
           * @memberOf platform.os
           * @type string|null
           */
          'family': null,

          /**
           * The version of the OS.
           *
           * @memberOf platform.os
           * @type string|null
           */
          'version': null,

          /**
           * Returns the OS string.
           *
           * @memberOf platform.os
           * @returns {string} The OS string.
           */
          'toString': function() { return 'null'; }
        };

        platform.parse = parse;
        platform.toString = toStringPlatform;

        if (platform.version) {
          description.unshift(version);
        }
        if (platform.name) {
          description.unshift(name);
        }
        if (os && name && !(os == String(os).split(' ')[0] && (os == name.split(' ')[0] || product))) {
          description.push(product ? '(' + os + ')' : 'on ' + os);
        }
        if (description.length) {
          platform.description = description.join(' ');
        }
        return platform;
      }

      /*--------------------------------------------------------------------------*/

      // Export platform.
      var platform = parse();

      // Some AMD build optimizers, like r.js, check for condition patterns like the following:
      if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
        // Expose platform on the global object to prevent errors when platform is
        // loaded by a script tag in the presence of an AMD loader.
        // See http://requirejs.org/docs/errors.html#mismatch for more details.
        root.platform = platform;

        // Define as an anonymous module so platform can be aliased through path mapping.
        define('platform',[],function() {
          return platform;
        });
      }
      // Check for `exports` after `define` in case a build optimizer adds an `exports` object.
      else if (freeExports && freeModule) {
        // Export for CommonJS support.
        forOwn(platform, function(value, key) {
          freeExports[key] = value;
        });
      }
      else {
        // Export to the global object.
        root.platform = platform;
      }
    }.call(this));

    define('gc-fp/lib/is',['platform'], function (platform) {
      var name = platform.name,
        version = platform.version,
        os_name = platform && platform.os ? platform.os.family : '',
        os_version = platform && platform.os ? platform.os.version : '',
        touch = false;
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0) {
        touch = true;
      }

      var description = '',
        deviceName = '',
        ratio = window.devicePixelRatio || 1,
        physicalWidth = screen.width * ratio,
        physicalHeight = screen.height * ratio,
        ipad = navigator.platform === 'iPad' || (touch && physicalWidth >= 1536);

      var ie = /ie/i.test(name),
        ieLt10 = ie && version < 10,
        edge = /edge/i.test(name),
        opera = /opera/i.test(name),
        opera_mobile = /opera mobile/i.test(name),
        chrome = /chrome/i.test(name),
        firefox = /firefox/i.test(name),
        safari = /safari/i.test(name),
        android_browser = /android browser/i.test(name),
        //os
        ios = /ios/i.test(os_name),
        android = /android/i.test(os_name),
        osx = /os\sx/i.test(os_name),
        windows = /windows/i.test(os_name),
        windows10 = os_version ? os_version.split('.')[0] === 10 : false,
        windowsGte10 = os_version ? os_version.split('.')[0] >= 10 : false,
        ieOnWindowsGte10 = ie && windowsGte10,
        ios_webview = (ios && safari && !/safari/i.test(navigator.userAgent)) || (ipad && !name),
        mobile = ios || android;

      if (osx && touch) {
        if (physicalWidth === 2048 && physicalHeight === 2732) {
          deviceName = 'iPad Pro 12.9';
        } else if (physicalWidth === 1668 && physicalHeight === 2388) {
          deviceName = 'iPad Pro 11';
        } else if (physicalWidth >= 1536 || (physicalWidth === 768 && physicalHeight === 1024)) {
          deviceName = 'iPad';
        } else {
          deviceName = 'iPhone';
        }
        description = [deviceName, '(requested desktop website)'].join(deviceName ? ' ' : '');
        platform.os.family = ipad ? 'iPadOS' : 'iOS';
      } else if (ipad) {
        platform.os.family = 'iPadOS';
      }

      return {
        wb: name,
        version: version,
        os: os_name,
        os_version: os_version,
        ieOnWindowsGte10: ieOnWindowsGte10,
        //browser
        ie: ie,
        ieLt10: ieLt10,
        edge: edge,
        chrome: chrome,
        opera: opera,
        opera_mobile: opera_mobile,
        firefox: firefox,
        safari: safari,
        android_browser: android_browser,
        //os
        ios: ios,
        ipad: ipad,
        android: android,
        osx: osx,
        windows: windows,
        ios_webview: ios_webview,
        mobile: mobile,
        touch: touch,
        description: description
      };
    });

    define('gc-fp/fp/audio',['../lib/crypto', '../lib/is'], function (crypto, is) {
      // var _audio;
      var init = function (callback) {
          try {
            var AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            var context = new AudioContext(1, 44100, 44100);
            var oscillator = context.createOscillator();
            oscillator.type = 'triangle';
            oscillator.frequency.value = 1e4;
            var compressor = context.createDynamicsCompressor();
            if (compressor.threshold) {
              compressor.threshold.value = -50;
            }
            if (compressor.knee) {
              compressor.knee.value = 40;
            }

            if (compressor.ratio) {
              compressor.ratio.value = 12;
            }

            if (compressor.reduction) {
              compressor.reduction.value = -20;
            }

            if (compressor.attack) {
              compressor.attack.value = 0;
            }

            if (compressor.release) {
              compressor.release.value = 0.25;
            }

            oscillator.connect(compressor);
            compressor.connect(context.destination);
            oscillator.start(0);
            context.oncomplete = function (evnt) {
              var sha1 = crypto.algo.SHA1.create();
              for (var i = 0; i < evnt.renderedBuffer.length; i++) {
                sha1.update(evnt.renderedBuffer.getChannelData(0)[i].toString());
              }
              var _audio = sha1.finalize().toString();
              compressor.disconnect();
              callback(_audio);
            };
            context.startRendering();
          } catch (e) {
            callback('');
          }
        },
        get = function (callback) {
          // if (_audio) {
          //     return callback(_audio);
          // }
          if (is.ios) {
            document.addEventListener('touchend', function (ev) {
              init(callback);
            });
          }
          init(callback);
        };
      return {
        get: get
      };
    });

    define('gc-fp/fp/webgl',['../lib/_'], function (_) {
      // var _webgl;
      var getWebglCanvas = function () {
        var canvas = document.createElement('canvas');
        try {
          return canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        } catch (e) {
          return null;
        }
      };

      return {
        get: function () {
          // if (_webgl) {
          //     return _webgl;
          // }
          var gl = getWebglCanvas(),
            fa2s = function (fa) {
              gl.clearColor(0.0, 0.0, 0.0, 1.0);
              gl.enable(gl.DEPTH_TEST);
              gl.depthFunc(gl.LEQUAL);
              gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
              return '[' + fa[0] + ', ' + fa[1] + ']';
            },
            maxAnisotropy = function (gl) {
              var anisotropy,
                ext = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') || gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
              return ext ? ((anisotropy = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)), 0 === anisotropy && (anisotropy = 2), anisotropy) : null;
            },
            defaultValue = {
              canvas: '',
              data: '',
              data_hash: '',
              vendor: '',
              renderer: ''
            };
          if (!gl) {
            return defaultValue;
          }
          try {
            var result = [],
              vShaderTemplate = 'attribute vec2 attrVertex;varying vec2 varyinTexCoordinate;uniform vec2 uniformOffset;void main(){varyinTexCoordinate=attrVertex+uniformOffset;gl_Position=vec4(attrVertex,0,1);}',
              fShaderTemplate = 'precision mediump float;varying vec2 varyinTexCoordinate;void main() {gl_FragColor=vec4(varyinTexCoordinate,0,1);}',
              vertexPosBuffer = gl.createBuffer(),
              vertices = new Float32Array([-0.2, -0.9, 0, 0.4, -0.26, 0, 0, 0.732134444, 0]);
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
            vertexPosBuffer.itemSize = 3;
            vertexPosBuffer.numItems = 3;
            var program = gl.createProgram(),
              vshader = gl.createShader(gl.VERTEX_SHADER),
              fshader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(vshader, vShaderTemplate);
            gl.compileShader(vshader);
            gl.shaderSource(fshader, fShaderTemplate);
            gl.compileShader(fshader);
            gl.attachShader(program, vshader);
            gl.attachShader(program, fshader);
            gl.linkProgram(program);
            gl.useProgram(program);
            program.vertexPosAttrib = gl.getAttribLocation(program, 'attrVertex');
            program.offsetUniform = gl.getUniformLocation(program, 'uniformOffset');
            gl.enableVertexAttribArray(program.vertexPosArray);
            gl.vertexAttribPointer(program.vertexPosAttrib, vertexPosBuffer.itemSize, gl.FLOAT, !1, 0, 0);
            gl.uniform2f(program.offsetUniform, 1, 1);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexPosBuffer.numItems);
            var canvas = gl.canvas ? gl.canvas.toDataURL() : '',
              glExtraData = {
                v: gl.getParameter(gl.VERSION),
                vd: gl.getParameter(gl.VENDOR),
                r: gl.getParameter(gl.RENDERER),
                slv: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
                e: gl.getSupportedExtensions().join(','),
                a: maxAnisotropy(gl),
                mrbs: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
                mctiu: gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
                mcmts: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
                mtiu: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
                mts: gl.getParameter(gl.MAX_TEXTURE_SIZE),
                mvv: gl.getParameter(gl.MAX_VARYING_VECTORS),
                mfuv: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
                mva: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
                mvtiu: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
                mvuv: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
                mvd: fa2s(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
                alwr: fa2s(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)),
                apsr: fa2s(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)),
                atl: gl.getContextAttributes().antialias ? '1' : '0',
                rgbads: [gl.getParameter(gl.RED_BITS), gl.getParameter(gl.GREEN_BITS), gl.getParameter(gl.BLUE_BITS), gl.getParameter(gl.ALPHA_BITS), gl.getParameter(gl.DEPTH_BITS), gl.getParameter(gl.STENCIL_BITS)]
              };
            if (gl.getShaderPrecisionFormat) {
              var getSPF = function (shaderType, precisionType) {
                var e = gl.getShaderPrecisionFormat(shaderType, precisionType);
                return e ? [e.precision, e.rangeMin, e.rangeMax] : [];
              };
              glExtraData.sdf_vf = [getSPF(gl.VERTEX_SHADER, gl.HIGH_FLOAT), getSPF(gl.VERTEX_SHADER, gl.MEDIUM_FLOAT), getSPF(gl.VERTEX_SHADER, gl.LOW_FLOAT)];
              glExtraData.sdf_vi = [getSPF(gl.VERTEX_SHADER, gl.HIGH_INT), getSPF(gl.VERTEX_SHADER, gl.MEDIUM_INT), getSPF(gl.VERTEX_SHADER, gl.LOW_INT)];
              glExtraData.sdf_ff = [getSPF(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT), getSPF(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT), getSPF(gl.FRAGMENT_SHADER, gl.LOW_FLOAT)];
              glExtraData.sdf_fi = [getSPF(gl.FRAGMENT_SHADER, gl.HIGH_INT), getSPF(gl.FRAGMENT_SHADER, gl.MEDIUM_INT), getSPF(gl.FRAGMENT_SHADER, gl.LOW_INT)];
            }
            var extra = JSON.stringify(glExtraData);
            var debugInfo = gl.getExtension('WEBGL_debug_renderer_info'),
              vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
              renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL),
              sha1Canvas = _.sha1(canvas),
              sha1Extra = _.sha1(extra);
            var _webgl = {
              canvas: sha1Canvas,
              data: extra,
              data_hash: sha1Extra,
              vendor: vendor,
              renderer: renderer,
              hash: _.sha1([sha1Canvas, sha1Extra, vendor, renderer].join('|'))
            };
            return _webgl;
          } catch (e) {
            console.log('webgl error ', e);
            return defaultValue;
          }
        }
      };
    });

    define('gc-fp/fp/ip',['../lib/_', '../lib/is'], function (_, is) {
      return {
        get: function (callback) {
          var result = [];
          try {
            var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
            if (RTCPeerConnection) {
              var servers = ['stun:stun.services.mozilla.com', 'stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'];
              if (is.firefox) {
                servers = servers.slice(0, 2);
              }
              var iceServers = [];
              servers.forEach(function (e) {
                iceServers.push({
                  urls: e
                });
              });
              var pc = new RTCPeerConnection(
                {
                  iceServers: iceServers
                },
                {
                  optional: [
                    {
                      RtpDataChannels: true
                    }
                  ]
                }
              );
              pc.onicecandidate = function (ice) {
                if (ice.candidate) {
                  var ips = /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/.exec(ice.candidate.candidate);
                  if (ips && _.isArray(ips) && ips.length > 1) {
                    for (var i = 0, j = ips.length; i < j; i++) {
                      var ip = ips[i];
                      if (_.isIp(ip) && result.indexOf(ip) === -1) {
                        result.push(ip);
                        callback(result.join(','));
                      }
                    }
                  }
                }
              };
              pc.createDataChannel('');
              pc.createOffer().then(
                function (e) {
                  pc.setLocalDescription(
                    e,
                    function () {},
                    function () {}
                  );
                },
                function () {}
              );
            } else {
              callback('');
            }
          } catch (e) {
            callback('');
          }
        }
      };
    });

    define('gc-fp/fp/conn',['../lib/_'], function (_) {
      var parseConnType = function (conn) {
        var type = conn ? conn.type : '';
        type = type || '';
        if (_.isString(type)) {
          return type;
        }
        switch (type) {
          case conn.WIFI:
            return 'wifi';
          case conn.CELLULAR:
            return 'cellular';
          default:
            return '';
        }
      };
      return {
        parseConnType: parseConnType,
        get: function (callback) {
          try {
            var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (connection) {
              callback(parseConnType(connection));
              if (typeof connection.addEventListener === 'function') {
                connection.addEventListener('typechange', function () {
                  callback(parseConnType(connection));
                });
              }
            } else {
              callback('');
            }
          } catch (e) {
            callback('');
          }
        }
      };
    });

    define('gc-fp/fp/plugins',['../lib/_'], function (_) {
      return {
        get: function () {
          try {
            var err, i, iePlugins, mimeTypes, mt, names, plugin, plugins, ref, w3cPlugins;
            if (navigator.appName === 'Microsoft Internet Explorer' || (navigator.appName === 'Netscape' && /Trident/.test(navigator.userAgent))) {
              if ('ActiveXObject' in window) {
                names = [
                  'ShockwaveFlash.ShockwaveFlash',
                  'AcroPDF.PDF',
                  'PDF.PdfCtrl',
                  'QuickTime.QuickTime',
                  'rmocx.RealPlayer G2 Control',
                  'rmocx.RealPlayer G2 Control.1',
                  'RealPlayer.RealPlayer(tm) ActiveX Control (32-bit)',
                  'RealVideo.RealVideo(tm) ActiveX Control (32-bit)',
                  'RealPlayer',
                  'SWCtl.SWCtl',
                  'WMPlayer.OCX',
                  'AgControl.AgControl',
                  'Skype.Detection'
                ];
                iePlugins = (function () {
                  var error, j, len, results;
                  results = [];
                  for (j = 0, len = names.length; j < len; j++) {
                    plugin = names[j];
                    try {
                      new ActiveXObject(plugin);
                      results.push(plugin);
                    } catch (error) {
                      err = error;
                      continue;
                    }
                  }
                  return results;
                })();
              }
            }
            if ((ref = navigator.plugins) ? ref.length : void 0) {
              w3cPlugins = (function () {
                var j, len, ref1, results;
                ref1 = navigator.plugins;
                results = [];
                for (j = 0, len = ref1.length; j < len; j++) {
                  plugin = ref1[j];
                  var _types = [];
                  for (var k = 0, len1 = plugin.length; k < len1; k++) {
                    mt = plugin[k];
                    _types.push([mt.type, mt.suffixes].join('~'));
                  }
                  mimeTypes = _types.join(',');
                  results.push([plugin.name, plugin.description, mimeTypes].join('::'));
                }
                return results;
              })();
            }
            plugins = [];
            if (iePlugins ? iePlugins.length : void 0) {
              plugins = plugins.concat(iePlugins);
            }
            if (w3cPlugins ? w3cPlugins.length : void 0) {
              plugins = plugins.concat(w3cPlugins);
            }
            i = 0;
            while (i < plugins.length) {
              plugins[i] = _.escapeXml(plugins[i]);
              i++;
            }
            return plugins;
          } catch (e) {
            return '';
          }
        }
      };
    });

    define('gc-fp/fp/pm',['../lib/_', '../lib/is'], function (_, is) {
      return {
        detect: function (callback) {
          var is_private;
          //Chrome, Opera
          // This one has stopped working
          /*
			if (window.webkitRequestFileSystem && !is.android_browser && !is.opera && !is.opera_mobile) {
				window.webkitRequestFileSystem(window.TEMPORARY, 1, function() {
					is_private = false;
				}, function(e) {
					is_private = true;
				});
			}
			*/
          if (is.chrome || is.opera) {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
              navigator.storage.estimate().then(function (e) {
                //The quota is 1Gb in private mode, 60% of total disk space in normal mode
                //We set the threshold is 14Gb that mean we expect everyone has more than 23Gb disk space
                if (e.quota < 14e9) {
                  is_private = true;
                } else {
                  is_private = false;
                }
              });
            }
          }
          //Firefox
          else if (window.indexedDB && is.firefox) {
            var db;
            try {
              db = window.indexedDB.open('test');
              db.onerror = function (e) {
                return true;
              };
            } catch (e) {
              is_private = true;
            }
            if (_.isUndefined(is_private)) {
              _.retry(
                function () {
                  return db.readyState === 'done' ? true : false;
                },
                function (is_timeout) {
                  if (!is_timeout) {
                    is_private = db.result ? false : true;
                  }
                }
              );
            }
          }
          //IE, Edge
          else if (is.ie || is.edge) {
            is_private = false;
            try {
              if (!window.indexedDB) {
                is_private = true;
              }
            } catch (e) {
              is_private = true;
            }
          }
          //Safari, android browser
          else if (is.safari || is.android_browser) {
            try {
              window.localStorage.setItem('test', 1);
            } catch (e) {
              is_private = true;
            }
            if (_.isUndefined(is_private)) {
              is_private = false;
              window.localStorage.removeItem('test');
            }
          }
          _.retry(
            function () {
              return !_.isUndefined(is_private);
            },
            function () {
              callback(is_private);
            }
          );
        }
      };
    });

    define('gc-fp/fp/fonts',['../lib/_'], function (_) {
      try {
        var canvasDetetor = (function () {
          var baseFonts = ['sans-serif'], //['monospace', 'sans-serif', 'serif'],
            text = 'w0(',
            testSize = '12px',
            baseWidth = {},
            canvas = document.createElement('canvas'),
            context = canvas.getContext('2d'),
            getWidth = function (font, base) {
              var quote = font && font.indexOf(' ') > -1 ? '"' : '';
              context.font = testSize + (font ? ' ' + quote + font + quote + ', ' : ' ') + base;
              var measure = context.measureText(text);
              return measure ? measure.width : 0;
            };
          for (var i = 0, j = baseFonts.length; i < j; i++) {
            var base = baseFonts[i];
            baseWidth[base] = getWidth('', base);
          }
          return {
            detect: function (fonts) {
              var result = [];
              for (var i = 0, l = fonts.length; i < l; i++) {
                var font = fonts[i];
                for (var j = 0, ll = baseFonts.length; j < ll; j++) {
                  var base = baseFonts[j],
                    width = getWidth(font, base);
                  if (width && width !== baseWidth[base]) {
                    result.push(font);
                    break;
                  }
                }
              }
              return result;
            }
          };
        })();
      } catch (e) {}

      return {
        fonts_js: function (fonts, callback) {
          if (_.isString(fonts)) {
            fonts = fonts ? fonts.split(',') : [];
          }
          setTimeout(function (e) {
            callback(canvasDetetor.detect(fonts).join(','));
          }, 0);
        }
      };
    });

    define('gc-fp/service',['./lib/_', './lib/is'], function (_, is) {
      var REQ_TIMEOUT = 10;

      var service = {
        ajax: function (options, onSuccess, onFailed, onTimeout) {
          var xhr = null,
            url = options.url,
            data = options.data || null,
            method = options.type || (options.data ? 'POST' : 'GET'),
            timeout = options.timeout ? +options.timeout : null,
            calledTimeout = false,
            retries = options.retries ? +options.retries : null;
          onSuccess = onSuccess || _.noop;
          onFailed = onFailed || _.noop;

          var send = function () {
            var retry = function (callback) {
              if (typeof retries !== 'number' || retries < 1) {
                if (typeof callback === 'function') {
                  callback();
                }
              } else {
                retries--;
                send();
              }
            };
            if (is.ieLt10 && window.XDomainRequest) {
              xhr = new window.XDomainRequest();
            } else {
              xhr = new XMLHttpRequest();
            }
            if (!xhr) {
              return;
            }
            xhr.open(method, url, true);
            if (timeout) {
              xhr.timeout = timeout;
            }
            if (_.isFunction(xhr.setRequestHeader)) {
              if (options.headers) {
                for (var i in options.headers) {
                  xhr.setRequestHeader(i, options.headers[i]);
                }
              }
              if (!options.headers || !options.headers['content-type']) {
                xhr.setRequestHeader('content-type', 'application/json');
              }
            }
            xhr.onreadystatechange = function (e) {
              if (e && e.target) {
                if (+xhr.readyState !== 4) {
                  return;
                }
                if (xhr.status !== 200 && xhr.status !== 201 && xhr.status !== 304) {
                  retry(function () {
                    setTimeout(function () {
                      if (!calledTimeout) {
                        onFailed(e.target, xhr.status);
                      }
                    }, 50);
                  });
                } else {
                  onSuccess(xhr.responseXML, xhr.status, e.target);
                }
              }
            };
            xhr.onerror = function () {};
            xhr.onprogress = function () {};
            xhr.ontimeout = function () {
              if (_.isFunction(onTimeout)) {
                calledTimeout = true;
                onTimeout();
              }
            };
            if (xhr.readyState === 4) {
              return;
            }
            if (is.ieLt10) {
              setTimeout(function () {
                xhr.send(data);
              }, 0);
            } else {
              try {
                xhr.send(data);
              } catch (e) {}
            }
          };
          send();
          return xhr;
        },
        post: function (data, onSuccess, onFailed) {
          if (!data.timeout) {
            data.timeout = REQ_TIMEOUT;
          }
          return service.ajax(
            {
              url: data.url,
              type: 'POST',
              timeout: 1000 * data.timeout,
              retries: data.retries,
              data: data.body || null,
              headers: data.headers || {}
            },
            function (xml, textStatus, jqXHR) {
              onSuccess(jqXHR.responseText, xml, jqXHR);
            },
            function (jqXHR, textStatus, errorThrown) {
              onFailed(textStatus, jqXHR.status, jqXHR);
            }
          );
        }
      };
      return service;
    });

    define('gc-fp/fp/extension',['../service'], function (service) {
      var CHROME_EXT = {
        //By Google
        'Google Translate': 'aapbdbdomjkkjkaonfhkkikfgjllcleb/options.html',
        'Google Dictionary': 'mgijmajocgfcbeboacabfgobmjgjcoja/content.min.css',
        'Google Input Tools': 'mclkkofklkfljcocdinagocijmpgbhab/manifest.json',
        'Google Hangouts': 'nckgahadagoaajjgafhacjanaoiihapd/manifest.json',
        'Google Search by Image': 'dajedkncpodkggklbegccjpmnglmnflm/empty.png',

        //vpn, proxy, location
        'Gom VPN': 'ckiahbcmlmkpfiijecbpflfahoimklke/vendor/oauth2/oauth2.html',
        'ZenMate VPN': 'fdcgdnkidjaadafnichfpabhfomcebme/widget.html',
        'Free Proxy to Unblock any sites': 'bihmplhobchoageeokmgbdihknkjbknd/assets/fonts/GothaProReg.otf',
        'Hoxx VPN Proxy': 'nbcojefnccbanplpoffopkoepjmhgdgh/img/symbol48.png', //cors
        'User-Agent Switcher for Chrome': 'djflhoibgkdhkhhcedjiklpkjnoahfmg/spoofer_cs.js',

        //utilities
        AdBlock: 'gighmmpiobklfepjocnamgkkbiglidom/icons/icon24.png',
        'Evernote Web Clipper': 'pioclpoplcdbaefihamjohnefbikjilc/images/loading.gif',
        WhatFont: 'jabopobgcpjmedljpbcaablpmlmfcogm/img/tweet.svg',
        Ghostery: 'mlomiejdfkolichcflejclcbmpeaniij/app/images/panel/ghostery-icon.svg',
        'Avira Browser Safety': 'flliilndjeohchalpbbcdekjklbdgfkk/img/serp_info_safe.svg',
        'WOT - Web of Trust': 'bhmmomiinigofkjcapegjjndpbikblnp/styles/main.css',
        'Save to Pocket': 'niloccemoadcdkdjlinkgdfekeahmflj/app/images/pocket-logo.png',
        'Poper Blocker': 'bkkbcggnhapdmkeljlodobbkopceiche/images/icon16.png', //cors
        'IE Tab': 'hehijbfgiekmjfkfjpbkbammjbdenadd/redir.htm',
        'eBay for Chrome': 'khhckppjhonfmcpegdjdibmngahahhck/ui/skin/core/options.css',
        'Avast SafePrice': 'eofcbnmajmjmplflapaojjnihcjkigck/common/ui/icons/logo-safeprice-64.png',
        'Avast Online Security': 'gomekmidlodglbbmalcneegieacbdmki/common/ui/icons/icon32.png',
        'Video Downloader professional': 'elicpjhcidhpjomhibiffojpinpmmpil/startpage/index.html',
        'Web Developer': 'bfbameneiokkgbdmiekhjnmfkcnldhhm/common/images/logos/favicon.ico',
        feedly: 'hipbfijinpcgfogaopmgehiegacbhmob/feedly-icon-48.png',
        'Awesome Screenshot': 'nlipoenfbbikpbjkfpfillcgkoblgpmj/images/icon19.png',
        'Click-Clean': 'ghgabhipcejejjmhhchfonmamedcbeod/i/16.png'
      };
      var result = [];
      var check = function (key, resource, done) {
        service.ajax(
          {
            url: 'chrome-extension://' + resource,
            method: 'HEAD',
            timeout: 1000
          },
          function () {
            result.push(key);
            done();
          },
          function () {
            done();
          }
        );
      };
      return {
        detect: function (configExtensions, callback) {
          var extensions = {};
          if (configExtensions && configExtensions.length) {
            for (var i = 0, j = configExtensions.length; i < j; i++) {
              extensions[configExtensions[i].name] = configExtensions[i].path;
            }
          } else {
            extensions = CHROME_EXT;
          }
          result = [];
          var onDone = function () {
            callback(result.join(','));
          };
          for (var key in extensions) {
            check(key, extensions[key], onDone);
          }
        }
      };
    });

    define('gc-fp/fp/adblock',[], function () {
      var detect = function (cb) {
        try {
          if (!document.body) {
            return false;
          }
          var ads = document.createElement('div');
          ads.innerHTML = '&nbsp;';
          ads.className = 'adsbox ads myAds';
          ads.style.height = '2px';
          ads.style.position = 'absolute';
          document.body.appendChild(ads);
          window.setTimeout(function () {
            var detected = ads.offsetHeight === 0;
            document.body.removeChild(ads);
            cb(detected);
          }, 100);
        } catch (e) {}
      };

      return {
        detect: detect
      };
    });

    define('gc-fp/fp/canvas',['../lib/_'], function (_) {
      var _canvas;

      function getCanvasData() {
        try {
          var el = document.createElement('canvas'),
            context = {};
          if (!(el.getContext && (context = el.getContext('2d')))) {
            return '';
          }
          el.width = 45;
          el.height = 17;
          context.textBaseline = 'top';
          context.font = '12px "Arial"';
          context.textBaseline = 'alphabetic';
          context.fillStyle = '#f60';
          context.fillRect(3, 1, 30, 7);
          context.fillStyle = 'rgba(102, 204, 0, 0.7)';
          context.fillText('$%mw&', 5, 12);
          return _.sha1(el.toDataURL());
        } catch (e) {
          return '';
        }
      }

      return {
        get: function () {
          return getCanvasData();
          // if (!_canvas) {
          //     _canvas = getCanvasData();
          // }
          // return _canvas;
        }
      };
    });

    define('gc-fp/fp/css',[], function () {
      function isCssSupported(feature) {
        return CSS && CSS.supports && CSS.supports(feature);
      }

      var features = ['-webkit-app-region: inherit', '-moz-appearance: inherit', '-apple-pay-button-style: inherit', '-webkit-touch-callout: inherit', '-moz-osx-font-smoothing: inherit', 'accent-color: inherit'];

      var result = {};

      try {
        for (var i = 0; i < features.length; i++) {
          result[features[i]] = isCssSupported(features[i]) ? 1 : 0;
        }

        var queries = [
          {
            mediaName: 'any-hover',
            mediaValues: ['none', 'hover']
          },
          {
            mediaName: 'hover',
            mediaValues: ['none', 'hover']
          },
          {
            mediaName: 'any-pointer',
            mediaValues: ['none', 'coarse', 'fine']
          },
          {
            mediaName: 'pointer',
            mediaValues: ['none', 'coarse', 'fine']
          },
          {
            mediaName: 'color',
            mediaValues: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
          },
          {
            mediaName: 'color-gamut',
            mediaValues: ['srgb', 'p3', 'rec2020'] // rec2020 includes p3 and p3 includes srgb
          },
          {
            mediaName: 'forced-colors',
            mediaValues: ['none', 'active']
          },
          {
            mediaName: 'inverted-colors',
            mediaValues: ['none', 'inverted']
          },
          {
            mediaName: 'monochrome',
            mediaValues: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
          },
          {
            mediaName: 'prefers-color-scheme',
            mediaValues: ['light', 'dark']
          },
          {
            mediaName: 'prefers-contrast',
            mediaValues: ['no-preference', 'high', 'more', 'low', 'less', 'forced']
          },
          {
            mediaName: 'prefers-reduced-motion',
            mediaValues: ['no-preference', 'reduce']
          },
          {
            mediaName: 'dynamic-range',
            mediaValues: ['standard', 'high']
          }
        ];
        var query = {};
        for (var queryIndex = 0; queryIndex < queries.length; queryIndex++) {
          var _mediaValues = queries[queryIndex].mediaValues,
            _mediaName = queries[queryIndex].mediaName;
          for (var j = 0; j < _mediaValues.length; j++) {
            var _test = '(' + _mediaName + ':' + _mediaValues[j] + ')';
            if (window.matchMedia(_test).matches) {
              query[_mediaName] = _mediaValues[j];
            }
          }
        }
        result.query = query;
      } catch (err) {}
      return {
        get: function () {
          return result;
        }
      };
    });

    define('gc-fp/k',[], function () {
      return {
        VERSION: '1.0',
        DEFAULT_LOG_ENDPOINT: 'https://logger.geocomply.net/logs',
        AES_KEY: 'bw-V2[x:m*GnSYb{XY#>tw;9Njh+7T9R',
        SECURE_STORAGE_NAME: 'gc-fp-js-data'
      };
    });

    define('gc-fp/secureStorage',['./lib/_', './lib/storage', './k'], function (_, storage, k) {
      var AES_KEY = k.AES_KEY,
        STORAGE_KEY = k.SECURE_STORAGE_NAME;
      /*jshint sub:true*/
      var ls = storage.localStorage,
        aesEncrypt = _['encrypt'],
        aesDecrypt = _['decrypt'],
        encrypt = function (e) {
          return aesEncrypt(e, AES_KEY);
        },
        decrypt = function (e) {
          return aesDecrypt(e, AES_KEY);
        };
      /*jshint sub:false*/

      function get(name) {
        try {
          if (!ls.enabled) {
            return '';
          }
          var content = ls.get(STORAGE_KEY);
          var obj = JSON.parse(decrypt(content, AES_KEY));
          return obj ? obj[name] || '' : '';
        } catch (e) {
          ls.set(STORAGE_KEY, '');
          return '';
        }
      }

      function set(name, value) {
        try {
          if (ls.enabled) {
            var content = ls.get(STORAGE_KEY);
            var obj = content ? JSON.parse(decrypt(content, AES_KEY)) : {};
            obj[name] = value;
            ls.set(STORAGE_KEY, encrypt(JSON.stringify(obj)));
          }
        } catch (e) {
          ls.set(STORAGE_KEY, '');
        }
      }

      return {
        get: get,
        set: set
      };
    });

    define('gc-fp/browser',['./lib/evercookie', 'platform', './lib/_', './lib/is', './fp/audio', './fp/webgl', './fp/ip', './fp/conn', './fp/plugins', './fp/pm', './fp/fonts', './fp/extension', './fp/adblock', './fp/canvas', './fp/css', './secureStorage'], function (
      evercookie,
      platform,
      _,
      is,
      fpAudio,
      fpWebgl,
      fpIp,
      fpConn,
      fpPlugins,
      privateMode,
      fpFonts,
      fpExtension,
      adblock,
      fpCanvas,
      fpCss,
      secureStorage
    ) {
      var DEFAULT_FONTS =
        'sans-serif-thin,ARNO PRO,Agency FB,Arabic Typesetting,Arial Unicode MS,AvantGarde Bk BT,BankGothic Md BT,Batang,Bitstream Vera Sans Mono,Calibri,Century,Century Gothic,Clarendon,EUROSTILE,Franklin Gothic,Futura Bk BT,Futura Md BT,GOTHAM,Gill Sans,HELV,Haettenschweiler,Helvetica Neue,Humanst521 BT,Leelawadee,Letter Gothic,Levenim MT,Lucida Bright,Lucida Sans,Menlo,MS Mincho,MS Outlook,MS Reference Specialty,MS UI Gothic,MT Extra,MYRIAD PRO,Marlett,Meiryo UI,Microsoft Uighur,Minion Pro,Monotype Corsiva,PMingLiU,Pristina,SCRIPTINA,Segoe UI Light,Serifa,SimHei,Small Fonts,Staccato222 BT,TRAJAN PRO,Univers CE 55 Medium,Vrinda,ZWAdobeF';
      var EVERCOOKIE_NAME = 'GC-FP-UUID',
        EVERCOOKIE_VALUE = _.uuidv4.generate(),
        timeZoneOffset = -new Date().getTimezoneOffset(),
        isActive = true,
        interrupted = 0,
        tz = _.timeZoneOffsetToString(timeZoneOffset);
      var formated_tz = '';
      var _updateUUIDCount;
      try {
        if (window.Intl && window.Intl.DateTimeFormat) {
          formated_tz = new window.Intl.DateTimeFormat().resolvedOptions().timeZone;
        }
      } catch (e) {}
      var w = window,
        nav = navigator,
        error_tosource = false,
        touch = false;
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0) {
        touch = true;
      }
      try {
        throw '';
      } catch (err) {
        try {
          err.toSource();
          error_tosource = true;
        } catch (e) {}
      }

      function hasLocalStorage() {
        try {
          return !!window.localStorage;
        } catch (e) {
          return false;
        }
      }

      function hasSessionStorage() {
        try {
          return !!window.sessionStorage;
        } catch (e) {
          return false;
        }
      }

      function hasGlobalStorage() {
        try {
          return !!window.globalStorage;
        } catch (e) {
          return false;
        }
      }

      function hasUserData() {
        var ref;
        return ((ref = document.body) ? ref.addBehavior : void 0) !== null;
      }

      function hasIndexedDB() {
        try {
          return !!(window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB);
        } catch (e) {
          return false;
        }
      }

      function hasWebSQL() {
        return _.isFunction(window.openDatabase);
      }

      function getStorage() {
        return _.bitStr(hasLocalStorage()) + _.bitStr(hasSessionStorage()) + _.bitStr(hasGlobalStorage()) + _.bitStr(hasUserData()) + _.bitStr(hasIndexedDB()) + _.bitStr(hasWebSQL());
      }

      function getSupportData() {
        var a;
        return (function () {
          var j, len, ref, results;
          ref = [
            window.WebSocket ? 'ws' : '',
            window.WebSocket && 'CLOSING' in window.WebSocket ? 'ws-rfc' : '',
            window.RTCPeerConnection ? 'rtc' : '',
            window.mozRTCPeerConnection ? 'moz-rtc' : '',
            window.webkitRTCPeerConnection ? 'webkit-rtc' : '',
            window.applicationCache ? 'appcache' : '',
            window.history && history.pushState ? 'history' : '',
            window.Worker ? 'worker' : '',
            window.SharedWorker ? 'shared-worker' : '',
            window.Blob ? 'blob' : '',
            window.BlobBuilder ? 'blob-builder' : ''
          ];
          results = [];
          for (j = 0, len = ref.length; j < len; j++) {
            a = ref[j];
            if (a !== '') {
              results.push(a);
            }
          }
          return results;
        })().join(';');
      }

      function getOrientation() {
        var orientation, result, type;
        orientation = screen.orientation || screen.mozOrientation || screen.msOrientation;
        type = screen.orientation ? 'w3c' : screen.mozOrientation ? 'moz' : screen.msOrientation ? 'ms' : '';
        result = [type];
        if (_.isString(orientation)) {
          result.push(orientation);
        } else if (typeof orientation === 'object' && orientation.type) {
          result.push(orientation.type);
        }
        return result.join(':');
      }

      var browser = {
        architecture: '',
        bitness: '',
        client_uuid: '',
        client_uuid_count: '',
        name: platform.name || '',
        version: platform.version || '',
        os: platform.os.family,
        os_version: platform.os.version,
        ip: '',
        mobile_conntype: '',
        audio: '',
        audio2: '',
        private_mode: '',
        build: nav.buildID || nav.productSub || '',
        tz: tz,
        timezoneOffset: timeZoneOffset,
        timezone: formated_tz,
        lang: nav.language || nav.browserLanguage || nav.userLanguage || nav.systemLanguage || 'en-US',
        languages: [nav.language || '-', nav.browserLanguage || '-', nav.userLanguage || '-', nav.systemLanguage || '-'].concat(nav.languages || []).join(';'),
        plugins: fpPlugins.get(),
        nav_plugins: _.bit(!_.isUndefined(navigator.plugins)),
        user_agent: nav.userAgent,
        platform: nav.platform,
        do_not_track: nav.doNotTrack || window.doNotTrack || nav.msDoNotTrack || '',
        cpu_class: nav.cpuClass || '',
        cpuCores: nav.hardwareConcurrency || 'N/A',
        window: {
          devicePixelRatio: w.devicePixelRatio,
          innerWidth: w.innerWidth,
          innerHeight: w.innerHeight,
          isSecureContext: w.isSecureContext,
          history: {
            length: w.history.length,
            scrollRestoration: w.history.scrollRestoration,
            state: w.history.state ? w.history.state.key : ''
          },
          screen: {
            width: screen.width,
            height: screen.height,
            availWidth: screen.availWidth,
            availHeight: screen.availHeight,
            availLeft: screen.availLeft,
            availTop: screen.availTop,
            colorDepth: screen.colorDepth,
            pixelDepth: screen.pixelDepth,
            orientation: getOrientation()
          },
          screenLeft: w.screenLeft,
          screenTop: w.screenTop,
          screenX: w.screenX,
          screenY: w.screenY,
          scrollX: w.scrollX,
          scrollY: w.scrollY
        },
        deviceMemory: navigator.deviceMemory || 'N/A',
        support: getSupportData(),
        storage: getStorage(),
        extensions: '',
        eval_length: eval.toString().length,
        plugins_js: '',
        canvas: fpCanvas.get(),
        canvas2: fpCanvas.get(),
        fonts_js: '',
        webgl: '',
        webgl2: '',
        css: fpCss.get(),
        features: {
          contacts: _.bit('contacts' in navigator),
          battery: _.bit('getBattery' in navigator),
          xr: _.bit('xr' in navigator),
          vibrate: _.bit('vibrate' in navigator),
          imageCapture: _.bit('ImageCapture' in window),
          faceDetector: _.bit('FaceDetector' in window),
          barcodeDetector: _.bit('BarcodeDetector' in window),
          textDetector: _.bit('TextDetector' in window),
          serial: _.bit('serial' in navigator),
          usb: _.bit('usb' in navigator),
          addToHomeScreen: [_.bit('BeforeInstallPromptEvent' in window), _.bit('setAppBadge' in navigator)].join('|'),
          appShare: [_.bit('share' in navigator), _.bit('canShare' in navigator), _.bit('Intent' in window)].join('|')
        },
        length: {
          getCurrentPosition: (function () {
            try {
              return navigator.geolocation.getCurrentPosition.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          screen: (function () {
            try {
              return window.screen.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          getUserMedia: (function () {
            try {
              var userMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
              return userMedia ? userMedia.toString().length : '';
            } catch (err) {
              return '';
            }
          })(),
          getBattery: (function () {
            try {
              return navigator.getBattery.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          fillText: (function () {
            try {
              return CanvasRenderingContext2D.prototype.fillText.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          strokeText: (function () {
            try {
              return CanvasRenderingContext2D.prototype.strokeText.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          getImageData: (function () {
            try {
              return CanvasRenderingContext2D.prototype.getImageData.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          toBlob: (function () {
            try {
              return CanvasRenderingContext2D.prototype.getImageData.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          HTMLCanvasElement: (function () {
            try {
              return HTMLCanvasElement.prototype.toDataURL.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          getParameter: (function () {
            try {
              return WebGLRenderingContext.prototype.getParameter.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          getExtension: (function () {
            try {
              return WebGLRenderingContext.prototype.getExtension.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          MediaDevices: (function () {
            try {
              return window.MediaDevices.prototype.constructor.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          RTCPeerConnection: (function () {
            try {
              return window.RTCPeerConnection.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          AudioContext: (function () {
            try {
              return window.AudioContext.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          ServiceWorkerContainer: (function () {
            try {
              return window.ServiceWorkerContainer.prototype.register.toString().length;
            } catch (err) {
              return '';
            }
          })(),
          Worker: (function () {
            try {
              return window.Worker.toString().length;
            } catch (err) {
              return '';
            }
          })()
        },
        math: (function () {
          var M = Math,
            nope = function () {};
          var acos = M.acos || nope,
            acosh = M.acosh || nope,
            asin = M.asin || nope,
            asinh = M.asinh || nope,
            atanh = M.atanh || nope,
            atan = M.atan || nope,
            sin = M.sin || nope,
            sinh = M.sinh || nope,
            cos = M.cos || nope,
            cosh = M.cosh || nope,
            tan = M.tan || nope,
            tanh = M.tanh || nope,
            exp = M.exp || nope,
            expm1 = M.expm1 || nope,
            log1p = M.log1p || nope,
            // Operation polyfills

            powPI = function (x) {
              return M.pow(M.PI, x);
            },
            acoshPf = function (x) {
              return M.log(x + M.sqrt(x * x - 1));
            },
            asinhPf = function (x) {
              if (x === -Infinity) {
                return x;
              } else {
                return M.log(x + M.sqrt(x * x + 1));
              }
            },
            atanhPf = function (x) {
              return M.log((1 + x) / (1 - x)) / 2;
            },
            sinhPf = function (x) {
              var y = M.exp(x);
              return (y - 1 / y) / 2;
            },
            coshPf = function (x) {
              var y = M.exp(x);
              return (y + 1 / y) / 2;
            },
            expm1Pf = function (x) {
              return M.exp(x) - 1;
            },
            tanhPf = function (x) {
              var a = M.exp(+x),
                b = M.exp(-x);
              return a === Infinity ? 1 : b === Infinity ? -1 : (a - b) / (a + b);
            },
            log1pPf = function (x) {
              return M.log(1 + x);
            };
          return {
            acos: acos(0.123124234234234242),
            acosh: acosh(1e308),
            acoshPf: acoshPf(1e154),
            asin: asin(0.123124234234234242),
            asinh: asinh(1),
            asinhPf: asinhPf(1),
            atanh: atanh(0.5),
            atanhPf: atanhPf(0.5),
            atan: atan(0.5),
            sin: sin(-1e300),
            sinh: sinh(1),
            sinhPf: sinhPf(1),
            cos: cos(10.000000000123),
            cosh: cosh(1),
            coshPf: coshPf(1),
            tan: tan(-1e308),
            tanh: tanh(1),
            tanhPf: tanhPf(1),
            exp: exp(1),
            expm1: expm1(1),
            expm1Pf: expm1Pf(1),
            log1p: log1p(10),
            log1pPf: log1pPf(10),
            powPI: powPI(-100)
          };
        })(),
        error_tosource: _.bit(error_tosource)
      };

      _.ready(function () {
        adblock.detect(function (e) {
          browser.adblock = _.bit(e);
        });
        if ('storage' in navigator && 'estimate' in navigator.storage) {
          navigator.storage.estimate().then(function (e) {
            browser.storage_estimate = e;
          });
        }
      });

      var processFp = function (cb) {
        var finished = [],
          tasks = is.chrome ? 8 : 7;
        var done = function (e) {
          if (finished.indexOf(e) < 0) {
            finished.push(e);
          }
          if (finished.length === tasks) {
            finished = [];
            _updateUUIDCount();
            cb(browser);
          }
        };
        _.async.parallel([
          function () {
            if (navigator.userAgentData
              && navigator.userAgentData.getHighEntropyValues
              && (is.chrome || is.edge)) {
              const getBrowserInfomationHighEntropy = navigator.userAgentData.getHighEntropyValues(
                ["architecture",
                  "bitness",
                  "model",
                  "platform",
                  "platformVersion",
                  "fullVersionList"]);
              if (getBrowserInfomationHighEntropy.then) {
                getBrowserInfomationHighEntropy
                  .then(function(ua) {
                    browser.architecture = ua.architecture;
                    browser.bitness = ua.bitness;
                    if (ua &&  ua.fullVersionList &&  ua.fullVersionList.length > 1) {
                      browser.version = ua.fullVersionList[1].version;
                    }
                    browser.os = ua.platform || '';
                    browser.os_version = ua.platformVersion || '';
                    done("browser_info");
                  })
                  .catch(function(e) {
                    done("browser_info");
                  });
              }
            } else {
              done("browser_info");
            }
          },
          function () {
            fpFonts.fonts_js(DEFAULT_FONTS, function (e) {
              browser.fonts_js = e;
              done('fonts_js');
            });
          },
          function () {
            browser.ip = '';
            fpIp.get(function (e) {
              browser.ip = e;
              done('ip');
            });
          },
          function () {
            browser.extensions = '';
            if (is.chrome) {
              browser.extensions = '';
              fpExtension.detect([], function (e) {
                browser.extensions = e;
                done('extensions');
              });
            }
          },
          function () {
            evercookie.init(
              {
                name: EVERCOOKIE_NAME,
                value: EVERCOOKIE_VALUE
              },
              function (e) {
                browser.client_uuid = e;
                done('client_uuid');
              }
            );
          },
          function () {
            browser.private_mode = '';
            privateMode.detect(function (e) {
              browser.private_mode = _.bit(e);
              done('private_mode');
            });
          },
          function () {
            browser.audio = '';
            fpAudio.get(function (e) {
              browser.audio = e;
              browser.audio2 = '';
              fpAudio.get(function (e) {
                browser.audio2 = e;
                done('audio');
              });
            });
          },
          function () {
            browser.webgl = {};
            var fpWebglData = fpWebgl.get();
            if (fpWebglData) {
              browser.webgl = {
                data: fpWebglData.data,
                canvas: fpWebglData.canvas,
                fp: fpWebglData.data_hash,
                vendor: fpWebglData.vendor,
                renderer: fpWebglData.renderer
              };
            }
            browser.webgl2 = {};
            var _run2 = fpWebgl.get();
            if (_run2) {
              browser.webgl2 = {
                data: _run2.data,
                canvas: _run2.canvas,
                fp: _run2.data_hash,
                vendor: _run2.vendor,
                renderer: _run2.renderer
              };
            }
            done('webgl');
          }
        ]);
      };
      fpConn.get(function (e) {
        browser.mobile_conntype = e;
      });

      _updateUUIDCount = function () {
        var _uuidKey = 'client_uuid';
        var _countKey = 'client_uuid_count';
        var _uuid = secureStorage.get(_uuidKey);
        var _count = secureStorage.get(_countKey) || 0;
        if (_uuid === browser.client_uuid) {
          _count++;
          secureStorage.set(_countKey, _count);
        }
        if (!_uuid || _uuid !== browser.client_uuid) {
          _count = 1;
          secureStorage.set(_uuidKey, browser.client_uuid);
          secureStorage.set(_countKey, _count);
        }
        browser.client_uuid_count = _count;
      };

      (function () {
        var appVersion = nav.appVersion,
          parsed = platform.parse(appVersion),
          wb = parsed ? (parsed.name || '') + ' ' + (parsed.version || '') : '',
          os = parsed ? (parsed.os.family || '') + ' ' + (parsed.os.version || '') : '';

        browser.nav = {
          battery: {},
          mediaDevices: [],
          isBluetoothAvailable: '',
          appVersion: appVersion,
          appVersionBrowser: wb.trim(),
          appVersionOS: os.trim(),
          cookieEnabled: nav.cookieEnabled,
          maxTouchPoints: nav.maxTouchPoints,
          vendor: nav.vendor,
          touch: _.bit(touch),
          oscpu: nav.oscpu || ''
        };

        // safari and firefox dont support battery and bluetooh
        if(browser.name != 'Safari' && browser.name != 'Firefox') {
          var promiseBattery = nav.getBattery();
          var promiseMedia = nav.mediaDevices.enumerateDevices();
          var promiseBluetooth =  nav.bluetooth.getAvailability();
          promiseBattery.then(function (resBattery) {
            browser.nav.battery = {
              charging: resBattery.charging,
              chargingTime: resBattery.chargingTime,
              dischargingTime: resBattery.dischargingTime,
              level: resBattery.level
            };
            return promiseMedia;
          }).then(function (resMediaDevice) {
            browser.nav.mediaDevices = resMediaDevice;
            return promiseBluetooth;
          }).then(function (resBluetooth) {
            browser.nav.isBluetoothAvailable = resBluetooth;
          })
            .catch (function (error) {
            });
        }
      })();
      (function () {
        var hidden,
          visibilityChange,
          handler = function (e, focusBlur) {
            isActive = typeof e === 'boolean' ? e : document.visibilityState === 'visible' || !document[hidden];
            if (!focusBlur) {
              console.log(
                JSON.stringify({
                  visibilitychange: _.ts(),
                  isActive: isActive
                })
              );
            }
            if (!isActive) {
              interrupted++;
            }
          };
        if (typeof document.hidden !== 'undefined') {
          hidden = 'hidden';
          visibilityChange = 'visibilitychange';
        } else if (typeof document.msHidden !== 'undefined') {
          hidden = 'msHidden';
          visibilityChange = 'msvisibilitychange';
        } else if (typeof document.webkitHidden !== 'undefined') {
          hidden = 'webkitHidden';
          visibilityChange = 'webkitvisibilitychange';
        }
        if (typeof document.addEventListener !== 'undefined' && hidden) {
          document.addEventListener(visibilityChange, handler, false);
        }
        document.addEventListener(
          'focus',
          function () {
            handler(true, true);
          },
          false
        );
        document.addEventListener(
          'blur',
          function () {
            handler(false, true);
          },
          false
        );
        window.addEventListener(
          'focus',
          function () {
            handler(true, true);
          },
          false
        );
        window.addEventListener(
          'blur',
          function () {
            handler(false, true);
          },
          false
        );
      })();

      _.assign(browser, {
        updateOnRequest: function () {
          interrupted = 0;
        },
        processFp: processFp,
        isActive: function () {
          return isActive;
        }
      });
      return browser;
    });

    define('gc-fp/main',['./browser', './lib/_', './service'], function (browser, _, service) {
      var VERSION = '1.0.0-a',
        DEFAULT_API_URL = 'https://dev-test.geocomply.net:3005/solus-lite-simple-mock';
      var _blocked = false;
      var request = function (opts, onSuccess, onError, onFpSuccess) {
        if (_blocked) {
          return;
        }
        _blocked = true;
        onSuccess = onSuccess || _.noop;
        onError = onError || _.noop;
        onFpSuccess = onFpSuccess || _.noop;
        var apiUrl = opts.apiUrl || DEFAULT_API_URL;
        var custom_fields = opts.custom_fields || {};
        custom_fields.username = opts.username || '';
        custom_fields.userSession = opts.userSession || '';
        browser.processFp(function (e) {
          onFpSuccess(e);
          var body = {
            custom_fields: custom_fields,
            fingerprint_signals: e,
            reason: opts.reason || '',
            req_uuid: _.uuidv4.generate()
          };
          service.post(
            {
              url: apiUrl,
              body: JSON.stringify(body),
              headers: {
                Authorization: opts.apiKey || ''
              }
            },
            function (result) {
              _blocked = false;
              onSuccess(body, result);
            },
            function () {
              _blocked = false;
              onError(body);
            }
          );
        });
      };

      return {
        version: VERSION,
        request: request
      };
    });

    define('gc-fp', ['gc-fp/main'], function (main) { return main; });

    return require('gc-fp');
  }));
  
}

const SolusLite = {
  runSolusLite,
}

export default SolusLite;