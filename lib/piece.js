
var BufferUtils = require('./bufferutils');

var Piece = function(index, length) {
  this.index = index;
  this.length = length;
  this.numChunks = Math.ceil(length / Piece.CHUNK_LENGTH);
  this.data = [];
};

Piece.prototype.nextChunkBegin = function() {
  if (this.data.length === this.numChunks) {
    return -1;
  }
  return this.data.length * Piece.CHUNK_LENGTH;
};

Piece.prototype.addChunk = function(begin, data) {
  var index = begin / Piece.CHUNK_LENGTH;
  this.data[index] = data;
};

Piece.prototype.isComplete = function() {
  return this.data.length === this.numChunks;
};

Piece.prototype.toBuffer = function() {
  var buffer = new Buffer(this.length);
  for (var i = 0; i < this.data.length; i++) {
    this.data[i].copy(buffer, i * Piece.CHUNK_LENGTH, 0);
  }
  return buffer;
};

Piece.CHUNK_LENGTH = 16384;

module.exports = Piece;
