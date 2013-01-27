
var crypto = require("crypto");
var util = require('util');

var ProcessUtils = require('./util/processutils');
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

  this.data = null;

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
          //LOGGER.debug("piece.getData: nextTick next");
          ProcessUtils.nextTick(next);
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

//var validateCallCount = 0;
//var validateNoCount = 0;
//var validateYesCount = 0;

function validateData(self, data, cb) {
  //validateCallCount++;
  //LOGGER.debug("validating piece " + self.index + " (call " + validateCallCount + ")");
  var dataHash = crypto.createHash('sha1').update(data).digest();
  //if (self.hash === dataHash) {
  //  validateYesCount++;
  //  LOGGER.debug("piece is valid (call " + validateYesCount + ")");
  //} else {
  //  validateNoCount++;
  //  LOGGER.debug("piece is not valid (call " + validateNoCount + ")");
  //}
  cb(self.hash === dataHash);
}

Piece.prototype.isValid = function(cb) {
  var self = this;
  //LOGGER.debug("Piece.isValid");
  this.getData(0, this.length, function(data) {
    if (data instanceof Error) {
      cb(data);
    } else {
      validateData(self, data, cb);
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
    var files = self.files.slice(0);

    function flushData() {
      if (files.length === 0) {
        setState(self, Piece.COMPLETE);
        self.data = null;
        cb();
      }
      else {
        var file = files.shift();
        file.write(self.offset, self.data, function(match) {
          if (match instanceof Error) {
            cb(err);
          } else {
            //LOGGER.debug("piece.setData: nextTick next");
            ProcessUtils.nextTick(flushData);
          }
        });
      }
    }

    self.data = self.data || new Buffer(self.length);
    data.copy(self.data, begin);

    self.complete.set(index);
    if (self.complete.cardinality() === self.complete.length) {
      validateData(self, self.data, function(valid) {
        if (valid) {
          flushData();
        } else {
          LOGGER.debug('invalid piece data received, clearing.');
          self.complete = new BitField(self,complete.length);
          self.requested = new BitField(self,complete.length);
          self.data = null;
          cb();
        }
      });
    }
    else {
      cb();
    }
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
