
var crypto = require("crypto");
var util = require('util');

var BitField = require('./util/bitfield');
var BufferUtils = require('./util/bufferutils');
var EventEmitter = require('events').EventEmitter;

var LOGGER = require('log4js').getLogger('piece.js');

var Piece = function(index, position, length, hash) {
  EventEmitter.call(this);
  this.index = index;
  this.hash = hash;
  this.length = length;
  this.position = position;
  this.initialise();
};
util.inherits(Piece, EventEmitter);

Piece.prototype.addChunk = function(begin, data) {
  var index = begin / Piece.CHUNK_LENGTH;
  if (this.complete && !this.complete.isSet(index)) {
    data.copy(this.data, begin, 0);
    this.complete.set(index);
    if (this.complete.cardinality() === this.complete.length) {
      this.emit(Piece.COMPLETE);
    }
  } else {
	  LOGGER.warn('Duplicate chunk received.');
  }
};

Piece.prototype.cancelRequest = function(begin) {
  if (this.requested) {
    var index = begin / Piece.CHUNK_LENGTH;
    this.requested.unset(index);
  }
};

Piece.prototype.clear = function() {
  this.data = null;
  this.complete = null;
  this.requested = null;
};

Piece.prototype.hasRequestedAllChunks = function() {
  return this.requested && (this.requested.cardinality() === this.requested.length);
};

Piece.prototype.initialise = function() {
  this.data = new Buffer(this.length);
  this.complete = new BitField(Math.ceil(this.length / Piece.CHUNK_LENGTH));
  this.requested = new BitField(this.complete.length);
};

Piece.prototype.isValid = function() {
  if (!this.data) return false;
  var dataHash = crypto.createHash('sha1').update(this.data).digest();
  return this.hash === dataHash;
};

Piece.prototype.nextChunk = function() {
  if (!this.requested) {
    return null;
  }
  var indices = this.requested.or(this.complete).unsetIndices();
  if (indices.length === 0) {
    return null;
  }
  this.requested.set(indices[0]);
   
  if (indices[0] === this.complete.length - 1
    && this.data.length % Piece.CHUNK_LENGTH > 0) {
    var length = this.data.length % Piece.CHUNK_LENGTH;
  } else {
    length = Piece.CHUNK_LENGTH;
  }
  return {
    begin: indices[0] * Piece.CHUNK_LENGTH,
    length: length
  };
};

Piece.CHUNK_LENGTH = 16384;

Piece.COMPLETE = 'complete';

module.exports = Piece;
