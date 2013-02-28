
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
      setComplete(self);
    } else {
      setIncomplete(self);
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
  var self = this;

  var data = new Buffer(length);
  var dataOffset = 0;
  var files = this.files.slice(0);

  for (var idx=0; idx<files.length; idx++) {
    if (files[idx].busy) {
      var err = new Error(Piece.ERR_FILEBUSY);
      err.code = Piece.ERR_FILEBUSY;
      cb(err);
      return;
    }
  }

  (function next() {
    if (files.length === 0) {
      cb(null, data.slice(0, dataOffset));
    } else {
      var file = files.shift();
      file.read(data, dataOffset, self.offset + begin, length, function(err, bytesRead) {
        if (err) {
          cb(err);
        } else {
            dataOffset += bytesRead;
            //LOGGER.debug("piece.getData: nextTick next");
            next();
        }
      });
    }
  })();
};

Piece.prototype.hasRequestedAllChunks = function() {
  return this.requested.cardinality() === this.requested.length;
};

//var validateCallCount = 0;
//var validateNoCount = 0;
//var validateYesCount = 0;

function validateData(self, data) {
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
  return (self.hash === dataHash);
}

Piece.prototype.isValid = function(cb) {
  var self = this;
  //LOGGER.debug("Piece.isValid");
  this.getData(0, this.length, function(err, data) {
    if (err) {
      cb(false);
    } else {
      cb(validateData(self, data));
    }
  });
};

Piece.prototype.nextChunk = function() {
  // TODO: end game process - multiple requests for chunks, cancel once received.
  
  if (this.isComplete) {
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

Piece.prototype.flushData = function(cb) {
  var self = this;
  var files = self.files.slice(0);

  for (var idx=0; idx<files.length; idx++) {
    if (files[idx].busy) {
      var err = new Error(Piece.ERR_FILEBUSY);
      err.code = Piece.ERR_FILEBUSY;
      cb(err);
      return;
    }
  }

  (function next() {
    if (files.length === 0) {
      self.data = null;
      cb();
    }
    else {
      var file = files.shift();
      file.write(self.offset, self.data, function(err, bytesWritten) {
        if (err) {
          cb(err);
        } else {
          next();
        }
      });
    }
  })();
}

Piece.prototype.setData = function(data, begin) {
  var index = begin / Piece.CHUNK_LENGTH;
  var self = this;

  if (!this.complete.isSet(index)) {
    self.data = self.data || new Buffer(self.length);
    data.copy(self.data, begin);

    self.complete.set(index);
    if (self.complete.cardinality() === self.complete.length) {
      if (validateData(self, self.data)) {
        setComplete(self);
      } else {
        LOGGER.debug('invalid piece data received, clearing.');
        self.complete = new BitField(self.complete.length);
        self.requested = new BitField(self.complete.length);
        self.data = null;
      }
    }
  } else {
    LOGGER.warn('Attempt to overwrite data at ' + self.offset + '.');
  }
};


Piece.prototype.canRead = function() {
  for (var i=0; i<this.files.length;i++) {
    if (this.files[i].busy) {
      return false;
    }
  }
  return true;
};

Piece.prototype.canWrite = function() {
  for (var i=0; i<this.files.length;i++) {
    if (this.files[i].busy) {
      return false;
    }
  }
  return true;
};


function setComplete(self) {
  self.isComplete = true;
  self.emit(Piece.COMPLETE);
}

function setIncomplete(self) {
  self.isComplete = false;
  self.emit(Piece.INCOMPLETE);
}


Piece.CHUNK_LENGTH = 16384;

Piece.COMPLETE = 'complete';
Piece.INCOMPLETE = 'incomplete';

Piece.ERR_FILEBUSY = 'busy';

module.exports = Piece;
