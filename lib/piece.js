
var crypto = require("crypto");
var util = require('util');

var BitField = require('./util/bitfield');
var BufferUtils = require('./util/bufferutils');
var EventEmitter = require('events').EventEmitter;
var File = require('./file');

var LOGGER = require('log4js').getLogger('piece.js');

var Piece = function(index, offset, length, hash, files, callback) {
  EventEmitter.call(this);

  this.complete = new BitField(Math.ceil(length / Piece.CHUNK_LENGTH));
  this.files = [];
  this.hash = hash;
  this.index = index;
  this.length = length;
  this.offset = offset;
  this.requested = new BitField(this.complete.length);
  this.setMaxListeners(this.requested.length);

  var lastMatch = File.NONE;
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    var match = file.contains(this.offset, this.length);
    if (match === File.FULL
        || (match === File.PARTIAL 
            && lastMatch === File.PARTIAL)) {
      this.files.push(file);
    } else if (match === File.PARTIAL) {
      this.files.push(file);
    }
    lastMatch = match;
  }

  var self = this;
  this.isValid(function(valid) {
    if (valid) {
      setState(self, Piece.COMPLETE);
    } else {
      setState(self, Piece.INCOMPLETE);
    }
    callback();
  });
};
util.inherits(Piece, EventEmitter);

Piece.prototype.cancelRequest = function(begin) {
  var index = begin / Piece.CHUNK_LENGTH;
  this.requested.unset(index);
};

Piece.prototype.getData = function(begin, length, cb) {
  var data = new Buffer(0);
  var files = this.files.slice(0);
  var self = this;
  (function next() {
    if (files.length === 0) {
      cb(data);
    } else {
      var file = files.shift();
      file.read(self.offset + begin, length, function(match, chunk) {
        if (match instanceof Error) {
          cb(match)
        } else {
          if (match === File.FULL || match === File.PARTIAL) {
            data = BufferUtils.concat(data, chunk);
          }
          setTimeout(next, 0);
        }
      });
    }
  })();
};

Piece.prototype.hasRequestedAllChunks = function() {
  return this.requested.cardinality() === this.requested.length;
};

Piece.prototype.isComplete = function() {
  return this.state === Piece.COMPLETE;
};

Piece.prototype.isValid = function(cb) {
  var self = this;
  this.getData(0, this.length, function(data) {
    if (data instanceof Error) {
      cb(data)
    } else {
      var dataHash = crypto.createHash('sha1').update(data).digest();
      cb(self.hash === dataHash);
    }
  });
};

Piece.prototype.nextChunk = function() {
  // TODO: end game process - multiple requests for chunks, cancel once received.
  
  if (this.state === Piece.COMPLETE) {
    return null;
  }

  var indices = this.requested.or(this.complete).unsetIndices();
  if (indices.length === 0) {
    return null;
  }
  this.requested.set(indices[0]);
   
  if (indices[0] === this.complete.length - 1
    && this.length % Piece.CHUNK_LENGTH > 0) {
    var length = this.length % Piece.CHUNK_LENGTH;
  } else {
    length = Piece.CHUNK_LENGTH;
  }
  return {
    begin: indices[0] * Piece.CHUNK_LENGTH,
    length: length
  };
};

Piece.prototype.setData = function(data, begin, cb) {
  var index = begin / Piece.CHUNK_LENGTH;
  var self = this;

  if (!this.complete.isSet(index)) {
    this.complete.set(index); 

    var files = this.files.slice(0);

    function complete(err) {
      if (err) {
        cb(err);
      } else if (self.complete.cardinality() === self.complete.length) {
        self.isValid(function(valid) {
          if (valid) {
            setState(self, Piece.COMPLETE);
          } else {
            LOGGER.debug('invalid piece, clearing.');
            self.complete = new BitField(self,complete.length);
            self.requested = new BitField(self,complete.length);
          }
          cb();
        });
      } else {
        cb();
      }
    }

    (function next() {
      if (files.length === 0) {
        complete();
      } else {
        var file = files.shift();
        file.write(self.offset + begin, data, function(match) {
          if (match instanceof Error) {
            complete(match)
          } else {
            setTimeout(next, 0);
          }
        });
      }
    })();
  } else {
    LOGGER.warn('Attempt to overwrite data at ' + self.offset + '.');
    cb();
  }
};

function setState(self, state) {
  self.state = state;
  self.emit(state);
}

Piece.CHUNK_LENGTH = 16384;

Piece.COMPLETE = 'complete';
Piece.INCOMPLETE = 'incomplete';

module.exports = Piece;
